import * as vscode from 'vscode';
import { ChildProcess/*, execFile*/ } from 'child_process';
import { spawn } from 'child_process';

// vscode-test-adapter imports 
import {
	TestRunStartedEvent,
	TestRunFinishedEvent,
	TestSuiteEvent,
	TestEvent
} from 'vscode-test-adapter-api';

import { Log } from 'vscode-test-adapter-util';

import { 
	DerivitecTestInfo, 
	DerivitecTestContext,
	DerivitecTestSuiteInfo, 
	DerivitecSuiteContext
} from './models'

import { DebugController } from "./debugController"

import { TestResultsFile } from "./testResultsFile";
import { TestDiscovery } from './testDiscovery';


export class TestRunner {
	private Runningtest: ChildProcess | undefined;
    
    constructor(
        private readonly workspace: vscode.WorkspaceFolder,
		private readonly outputchannel: vscode.OutputChannel,
		private readonly log: Log,
        private readonly testDiscovery: TestDiscovery,
        private readonly testStatesEmitter: vscode.EventEmitter<TestRunStartedEvent | 
	    TestRunFinishedEvent | TestSuiteEvent | TestEvent>
	
	){ }

    public async Run(tests: string[]): Promise<void> {
        this.InnerRun(tests, false);
    }

    public async Debug(tests: string[]): Promise<void> {
        this.InnerRun(tests, true);
    }

    public Cancel(): void {
        //kill the child process for the current test run (if there is any)
		if (this.Runningtest) {
			this.Runningtest.kill();
			this.Runningtest = undefined;
		}
    }

    private async InnerRun(tests: string[], isDebug: boolean): Promise<void> {
		try {
            if (this.Runningtest)
                return;
            this.log.info(`Running tests ${JSON.stringify(tests)}`);
            
            if (tests[0] == 'root') {
                let nodeContext = this.testDiscovery.GetNode(tests[0]) as DerivitecSuiteContext;
                tests = nodeContext?.node.children.map(i => i.id);
            }

            for (var id of tests) {
                let nodeContext = this.testDiscovery.GetNode(id);
                if (nodeContext) {
                    await this.RunTest(nodeContext.node, isDebug);
                }
            }
        } catch (error) {
            this.log.error(error);
        }
    }

	private async RunTest(node: DerivitecTestSuiteInfo | DerivitecTestInfo, isDebug: boolean): Promise<void> {
		//var teststodo: string[] = [];
		await new Promise<void>(async (resolve, reject) => {
			
			var debugController = new DebugController(this.workspace, this.Runningtest, this.log);
			
			var testOutputFile = `${node.sourceDll}.trx`;

			var args: string[] = [];
			args.push('vstest');
			args.push(node.sourceDll);
			if (!node.sourceDll.endsWith(`${node.id}.dll`))
				args.push(`--Tests:${node.id}`);
			args.push('--Parallel');
			args.push(`--logger:trx;LogFileName=${testOutputFile}`);
			this.TriggerRunningEvents(node);
			this.Runningtest = spawn(
				'dotnet', 
				args, 
				{ 
					cwd: this.workspace.uri.fsPath, 
					env: {
						"DOTNET_CLI_HOME": "/home/ec2-user",
						"VSTEST_HOST_DEBUG": isDebug ? "1" : "0",
						"ASPNETCORE_ENVIRONMENT": "Development",
						"EnvironmentName": "Development",
						"AwsRegion": "us-east-1",
						"LD_LIBRARY_PATH": "/home/linuxbrew/.linuxbrew/lib/;/home/linuxbrew/.linuxbrew/lib/gcc/9/;/media/psf/Home/Documents/dev.nosync/Derivitec/cpp/build/Derivitec/;/media/psf/Home/Documents/dev.nosync/Derivitec/cpp/build/Derivitec.Wrap/;$LD_LIBRARY_PATH"
					}
				}
			);
			this.Runningtest.stdout!.on('data', async data => {
				if (isDebug) {
					await debugController.onData(data);
				}
				this.outputchannel.append(data.toString());
			});

			this.Runningtest.stderr!.on('data', data => {
				this.outputchannel.append(data.toString());
			});

			this.Runningtest.on('close', async (code) => {
				this.Runningtest = undefined;
				await this.ParseTestResults(node, testOutputFile);
				this.MarkSuiteComplete(node);
				resolve();
			});
			
		});
	}

	private MarkSuiteComplete(node: DerivitecTestSuiteInfo | DerivitecTestInfo) {
		if(node.type == 'test') return;
		for (let child of node.children)
			this.MarkSuiteComplete(child as (DerivitecTestSuiteInfo | DerivitecTestInfo));
		var nodeContext = this.testDiscovery.GetNode(node.id) as DerivitecSuiteContext;
		if (!nodeContext) return;
		nodeContext.event = {
			type: 'suite', suite: node.id, state: 'completed'
		}

		this.testStatesEmitter.fire(<TestSuiteEvent>nodeContext.event);
    }
    
    private TriggerRunningEvents(node: DerivitecTestSuiteInfo | DerivitecTestInfo) {
		var nodeContext = this.testDiscovery.GetNode(node.id);
		if (!nodeContext) return;
		if (node.type == 'suite') {
			nodeContext.event = {
				type: 'suite', suite: node.id, state: 'running'
			}
			this.testStatesEmitter.fire(<TestSuiteEvent>nodeContext.event);
			for (let child of node.children)
				this.TriggerRunningEvents(child as (DerivitecTestSuiteInfo | DerivitecTestInfo));
			
		} else {
			nodeContext.event = {
				type: 'test', test: node.id, state: 'running'
			}
			this.testStatesEmitter.fire(<TestEvent>nodeContext.event);
		}
	}


	private async ParseTestResults(node: DerivitecTestSuiteInfo | DerivitecTestInfo, testOutputFile: string): Promise<void> {
		var testResultConverter = new TestResultsFile();
		var results = await testResultConverter.parseResults(testOutputFile);
		var testContexts = this.GetTestsFromNode(node);
		var testContextsMap = new Map(testContexts.map(i => [i.node.id, i]));
		for(var result of results) {
			var testContext = testContextsMap.get(result.fullName);
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
						break;
				}
				this.testStatesEmitter.fire(<TestEvent>testContext.event);
			}
		}
	}
	private GetTestsFromNode(node:DerivitecTestSuiteInfo | DerivitecTestInfo) {
		var testContexts: DerivitecTestContext[] = [];
		if (node.type == "suite") {
			for (var child of node.children ) {
				var innerContexts = this.GetTestsFromNode(child as (DerivitecTestSuiteInfo | DerivitecTestInfo));
				for (var innerContext of innerContexts) {
					testContexts.push(innerContext);
				}
			}
		} else {
			var context = this.testDiscovery.GetNode(node.id);
			testContexts.push(context as DerivitecTestContext);
		}
		return testContexts;
	}
}