import * as vscode from 'vscode';

import { Log } from 'vscode-test-adapter-util';

import { DebugController } from "./DebugController"

import { parseTestResults } from "./TestResultsFile";
import Command from './Command';
import { getUid } from './utilities';
import { ConfigManager } from './ConfigManager';
import TestExplorer from './TestExplorer';
import OutputManager from './OutputManager';

const getMethodName = (fullName: string) => fullName.substr(fullName.lastIndexOf('.') + 1);

export class TestRunner {
	private Runningtest: Command | undefined;

    constructor(
		private readonly workspace: vscode.WorkspaceFolder,
		private readonly nodeMap: Map<string, DerivitecSuiteContext | DerivitecTestContext>,
		private readonly output: OutputManager,
		private readonly configManager: ConfigManager,
		private readonly log: Log,
        private readonly testExplorer: TestExplorer,
	) {}

    public Run(tests: string[]): Promise<void> {
        return this.InnerRun(tests, false);
    }

    public Debug(tests: string[]): Promise<void> {
        return this.InnerRun(tests, true);
    }

    public Cancel(): void {
        //kill the child process for the current test run (if there is any)
		if (this.Runningtest) {
			this.Runningtest.dispose();
			this.Runningtest = undefined;
		}
    }

    private async InnerRun(tests: string[], isDebug: boolean): Promise<void> {
		try {
            if (this.Runningtest) return;
            this.log.info(`Running tests ${JSON.stringify(tests)}`);

            if (tests[0] == 'root' || tests[0].startsWith('group:')) {
                let nodeContext = this.nodeMap.get(tests[0]) as DerivitecSuiteContext;
                tests = nodeContext?.node.children.map(i => i.id);
            }

            for (const id of tests) {
                let nodeContext = this.nodeMap.get(id);
                if (nodeContext) {
					this.output.update(`${nodeContext.node.id} ${nodeContext.node.type} started`);
					await this.RunTest(nodeContext.node, isDebug);
					this.output.update(`${nodeContext.node.id} ${nodeContext.node.type} complete`);
                }
            }
        } catch (error) {
            this.log.error(error);
        }
    }

	private async RunTest(node: DerivitecTestSuiteInfo | DerivitecTestInfo, isDebug: boolean): Promise<void> {
		const debugController = new DebugController(
			this.workspace,
			this.configManager,
			this.Runningtest,
			this.log
		);

		if (node.sourceDll === 'root') throw TypeError('Cannot test root suite directly.');

		const testOutputFile = node.sourceDll.with({ path: `${node.sourceDll.path}${getUid()}.trx` });

		const envVars = this.configManager.get('runEnvVars');
		const args: string[] = [];
		args.push('vstest');
		args.push(node.sourceDll.fsPath);
		if (!node.sourceDll.fsPath.endsWith(`${node.id}.dll`))
			args.push(`--Tests:${node.id}`);
		args.push('--Parallel');
		args.push(`--logger:trx;LogFileName=${testOutputFile.fsPath}`);
		this.TriggerRunningEvents(node);
		const { print, finish } = this.output.getTestOutputHandler(node.type === 'test' ? getMethodName(node.id) : node.id);
		this.Runningtest = new Command(
			'dotnet',
			args,
			{
				cwd: this.workspace.uri.fsPath,
				env: {
					"VSTEST_HOST_DEBUG": isDebug ? "1" : "0",
					...envVars,
				}
			}
		);
		this.Runningtest.onStdOut(async data => {
			if (isDebug) {
				await debugController.onData(data);
			}
			print(data.toString());
		});
		this.Runningtest.onStdErr(data => {
			print(data.toString());
		});
		await this.Runningtest.exitCode;
		this.Runningtest = undefined;
		finish();
		await this.ParseTestResults(node, testOutputFile);
		this.MarkSuiteComplete(node);
	}

	private MarkSuiteComplete(node: DerivitecTestSuiteInfo | DerivitecTestInfo) {
		if(node.type == 'test') return;
		for (let child of node.children)
			this.MarkSuiteComplete(child as (DerivitecTestSuiteInfo | DerivitecTestInfo));
		const nodeContext = this.nodeMap.get(node.id) as DerivitecSuiteContext;
		if (!nodeContext) return;
		nodeContext.event = {
			type: 'suite', suite: node.id, state: 'completed'
		}

		this.testExplorer.updateState(nodeContext.event);
    }

    private TriggerRunningEvents(node: DerivitecTestSuiteInfo | DerivitecTestInfo) {
		const nodeContext = this.nodeMap.get(node.id);
		if (!nodeContext) return;
		if (node.type == 'suite') {
			nodeContext.event = {
				type: 'suite', suite: node.id, state: 'running'
			}
			this.testExplorer.updateState(nodeContext.event);
			for (let child of node.children)
				this.TriggerRunningEvents(child as (DerivitecTestSuiteInfo | DerivitecTestInfo));

		} else {
			nodeContext.event = {
				type: 'test', test: node.id, state: 'running'
			}
			this.testExplorer.updateState(nodeContext.event);
		}
	}


	private async ParseTestResults(node: DerivitecTestSuiteInfo | DerivitecTestInfo, testOutputFile: vscode.Uri): Promise<void> {
		const results = await parseTestResults(testOutputFile);
		const testContexts = this.GetTestsFromNode(node);
		const testContextsMap = new Map(testContexts.map(i => [i.node.id, i]));
		for(const result of results) {
			const testContext = testContextsMap.get(result.fullName);
		  if (testContext) {
				switch (result.outcome) {
					case "Error":
						testContext.event = {
							type: "test",
							test: testContext.node.id,
							state: "errored",
							message: result.stackTrace,
						}
						break;
					case "Failed":
						testContext.event = {
							type: "test",
							test: testContext.node.id,
							state: "failed",
							message: result.message,
						}
						break;
					case "Passed":
						testContext.event = {
							type: "test",
							test: testContext.node.id,
							state: "passed",
							message: result.message,
						}
						break;
					case "NotExecuted":
						testContext.event = {
							type: "test",
							test: testContext.node.id,
							state: "skipped"
						}
						break;
					default:
						this.log.error(`Unknown state encountered where test result outcome was: ${result.outcome}`);
						break;
				}
				if (testContext.event) {
					this.output.update(`${getMethodName(result.fullName)} test ${testContext.event.state}`);
					this.testExplorer.updateState(testContext.event);
				}
			}
		}
	}
	private GetTestsFromNode(node:DerivitecTestSuiteInfo | DerivitecTestInfo) {
		const testContexts: DerivitecTestContext[] = [];
		if (node.type == "suite") {
			for (const child of node.children ) {
				const innerContexts = this.GetTestsFromNode(child as (DerivitecTestSuiteInfo | DerivitecTestInfo));
				for (const innerContext of innerContexts) {
					testContexts.push(innerContext);
				}
			}
		} else {
			const context = this.nodeMap.get(node.id);
			testContexts.push(context as DerivitecTestContext);
		}
		return testContexts;
	}
}