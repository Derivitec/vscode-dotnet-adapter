import { ChildProcess/*, execFile*/ } from 'child_process';
import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { Log } from 'vscode-test-adapter-util';
import * as fs from 'fs';

import { ConfigManager } from "./configManager"

import { 
	DerivitecTestInfo, 
	DerivitecTestContext,
	DerivitecTestSuiteInfo, 
	DerivitecSuiteContext
} from './models'

import {
    TestSuiteInfo
} from 'vscode-test-adapter-api';

export class TestDiscovery {
	private readonly configManager: ConfigManager;
    
    private NodeById =
        new Map<string, DerivitecSuiteContext | DerivitecTestContext>();

    private Loadingtest: ChildProcess | undefined;
    
    private SuitesInfo: DerivitecTestSuiteInfo = {
		type: 'suite',
		id: 'root',
		label: '.Net Core',
		children: [],
		sourceDll: 'root'
	};
    
    constructor(
        private readonly workspace: vscode.WorkspaceFolder,
        private readonly outputchannel: vscode.OutputChannel,
		private readonly log: Log,
	){ 
		this.configManager = new ConfigManager(this.workspace, this.log);
    }

    public GetNode(id: string): DerivitecSuiteContext | DerivitecTestContext {
        var node = this.NodeById.get(id);
        if (!node) throw `Test node '${id}' could not be found!`
        return node;
    }

    public async Load(): Promise<TestSuiteInfo> {
        return await new Promise<TestSuiteInfo>(async (resolve, reject) => {

            this.log.info('Loading tests (starting)');

            this.NodeById.set(this.SuitesInfo.id, {node: this.SuitesInfo});


            await this.StopLoading();

            var searchPatterns = this.configManager.SearchPatterns();

			for (var searchPattern of searchPatterns) {
				var files = await this.LoadFiles(searchPattern);
				for (var file of files) {
					try {
						this.log.info(`file: ${file} (loading)`);
						await this.SetTestSuiteInfo(file);
						this.log.info(`file: ${file} (load complete)`);
					} catch (e) {
						this.log.error(e);
						reject(e);
					}
				};
			}
            
            if (this.SuitesInfo.children.length == 0)
            {
                var errorMsg = 'No tests found, check the SearchPattern in the extension settings.';
                this.log.error(errorMsg);
                reject(errorMsg);
            }
            else
            {
                this.log.info('Loading tests (complete)');
                resolve(this.SuitesInfo);
            }
        });
    }

    
	private async StopLoading(): Promise<void> {
		if (this.Loadingtest == undefined)
			return;
		return await new Promise<void>((resolve, reject) => {
			if (this.Loadingtest != undefined) {
				this.Loadingtest.on('close', (code) => {
					resolve();
				});
				this.Loadingtest.kill();
			} else
				resolve();
		});
    }
    
    private async LoadFiles(searchpattern: string): Promise<string[]> {
		// global pattern for createFileSystemWatcher
		// const globr = path.resolve(this.workspace.uri.fsPath, searchpattern!);
		// relative pattern for findFiles
		const glob = new vscode.RelativePattern(this.workspace.uri.fsPath, searchpattern!);
		let files: string[] = [];
		for (const file of await vscode.workspace.findFiles(glob)) {
			files.push(file.fsPath);
		}
		// if (this.WSWatcher != undefined)
		// 	this.WSWatcher.dispose();
		// this.WSWatcher = vscode.workspace.createFileSystemWatcher(globr);
		// this.addwatcher(this.WSWatcher);
		return files;
	}

    private async SetTestSuiteInfo(file: string): Promise<DerivitecTestSuiteInfo> {

		return await new Promise<DerivitecTestSuiteInfo>((resolve, reject) => {
			var args: string[] = [
				'vstest', 
				file,
				'/ListFullyQualifiedTests',
				`/ListTestsTargetPath:${file}.txt`
			];
			this.log.debug(`execute: dotnet ${args.join(' ')} (starting)`);
			this.Loadingtest = spawn('dotnet', args, { cwd: this.workspace.uri.fsPath });
			this.Loadingtest.stdout!.on('data', data => {
				this.outputchannel.append(data.toString());
			});
			this.Loadingtest.stderr!.on('data', data => {
				this.outputchannel.append(data.toString());
			});
			this.Loadingtest.on('error', (err) => {
				this.log.error(`child process exited with error ${err}`);
				this.SuitesInfo.children.length = 0;
				if (this.Loadingtest)
					this.Loadingtest.removeAllListeners();
				this.Loadingtest = undefined;
				reject(err);
			});
			this.Loadingtest.on('close', (code) => {
				this.log.debug(`execute: dotnet ${args.join(' ')} (complete)`);
				this.Loadingtest = undefined;
				this.log.info(`child process exited with code ${code}`);
				this.AddtoSuite(file);
				resolve();
			});
		});
    }
    
    private AddtoSuite(file: string) {
		this.log.info(`suite creation: ${file} (starting)`);

		var output = fs.readFileSync(`${file}.txt`).toString()
		let lines = output.split(/[\n\r]+/);
		
		var pathItems = file.split('/');
		var fileNamespace = pathItems[pathItems.length - 1].replace(".dll", "");
		
		this.ResetSuites(file);
		var fileSuite: DerivitecTestSuiteInfo = { 
			type: "suite",
			id: fileNamespace, 
			label: fileNamespace, 
			sourceDll: file,
			children: []
		};
		this.log.info(`adding node: ${fileNamespace}`);
		this.NodeById.set(fileSuite.id, {node: fileSuite});
		this.SuitesInfo.children.push(fileSuite);

		for (const line of lines) {
			if (!line) {
				continue;
			}

			var testArray = line.split('.');
			if (testArray.length < 2) continue;
			var testName = testArray.pop()!;
			var className = testArray.pop()!;
			var namespace = line.replace(`.${className}.${testName}`, "");

			var classId = `${namespace}.${className}`;
			var classContext = this.NodeById.get(classId) as DerivitecSuiteContext;
			
			if(!classContext)	{
				classContext = {
					node: {
						type: 'suite',
						id: classId,
						label: className,
						sourceDll: file,
						children: []
					}
				};
				this.NodeById.set(classContext.node.id, classContext);
				fileSuite.children.push(classContext.node);
			}
			
			var testInfo: DerivitecTestInfo = {
				type: 'test',
				id: line,
				description: line,
				label: testName,
				sourceDll: file,
				skipped: false
			};

			this.log.info(`adding node: ${line}`);
			this.NodeById.set(testInfo.id, {node: testInfo});
			classContext.node.children.push(testInfo);
		}
		this.log.info(`suite creation:: ${file} (complete)`);

    }
    
    	/* remove all tests of module fn from Suite */
	private ResetSuites(fileName: string) {
		let i = 0;
		for (var suite of this.SuitesInfo.children) {
			if (suite.file == fileName) {
				this.SuitesInfo.children.splice(i, 1);
			}
			i++;
		}
	}

}