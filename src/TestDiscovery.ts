import Command from './Command';
import * as vscode from 'vscode';
import { Log } from 'vscode-test-adapter-util';

import { ConfigManager } from "./ConfigManager";
import OutputManager, { Loaded } from './OutputManager';
import CodeLensProcessor from './CodeLensProcessor';
import TestExplorer from './TestExplorer';
import { optimiseGlobPatterns, getFileFromPath, getErrStr } from './utilities';

const fs = vscode.workspace.fs;

enum DISCOVERY_ERROR {
	VSTEST_STDERR = 'DISCOVERY_ERROR: VSTEST_STDERR',
	SYMBOL_FILE_EMPTY = 'DISCOVERY_ERROR: SYMBOL_FILE_EMPTY'
};

export class TestDiscovery {
	private Loadingtest: Command | undefined;

	private loadStatus: Loaded;

	private loadErrors = new Map<string, unknown>();

    private SuitesInfo: DerivitecTestSuiteInfo = {
		type: 'suite',
		id: 'root',
		label: '.Net Core',
		children: [],
		sourceDll: 'root'
	};

	private watchers?: vscode.FileSystemWatcher[];

    constructor(
		private readonly workspace: vscode.WorkspaceFolder,
		private readonly nodeMap: Map<string, DerivitecSuiteContext | DerivitecTestContext>,
		private readonly output: OutputManager,
		private readonly configManager: ConfigManager,
		private readonly codeLens: CodeLensProcessor,
		private readonly testExplorer: TestExplorer,
		private readonly log: Log,
	){
		this.loadStatus = this.output.loaded;
    }

    public GetNode(id: string): DerivitecSuiteContext | DerivitecTestContext {
        const node = this.nodeMap.get(id);
        if (!node) throw `Test node '${id}' could not be found!`
        return node;
    }

    public async Load(): Promise<DerivitecTestSuiteInfo> {
		this.log.info('Loading tests (starting)');

		this.nodeMap.set(this.SuitesInfo.id, {node: this.SuitesInfo});

		this.output.resetLoaded();

		await this.StopLoading();

		if (Array.isArray(this.watchers) && this.watchers.length > 0) {
			this.watchers.map(watcher => watcher.dispose());
		}

		const searchPatterns = this.configManager.get('searchpatterns');

		this.output.update('Searching for tests');
		const files = await this.LoadFiles(searchPatterns);
		this.loadStatus.loaded += files.length;
		this.output.update(`Loading tests from ${files.length} files`);
		const stopLoader = this.output.loader();
		for (const file of files) {
			try {
				this.log.info(`file: ${file} (loading)`);
				await this.SetTestSuiteInfo(file);
				this.log.info(`file: ${file} (load complete)`);
			} catch (e) {
				this.log.error(e);
				throw e;
			}
		};
		stopLoader();

		if (this.loadErrors.size > 0) {
			this.output.update(`Encountered errors in ${this.loadErrors.size} files during loading.`)
			const errArr = Array.from(this.loadErrors.entries());
			if (errArr.some(([file, err]) => err === DISCOVERY_ERROR.VSTEST_STDERR)) {
				this.output.update(`Some of these errors were encountered by vstest. See ".NET Core Test Output" pane for details.`);
			}
			const emptyErr = errArr.filter(([file, err]) => err === DISCOVERY_ERROR.SYMBOL_FILE_EMPTY);
			if (emptyErr.length > 0) {
				let err = `The following assemblies produced empty symbol files. If there are test methods in this project, try reloading.\n`;
				err += emptyErr.map(([file]) => file).join('\n');
				this.output.update(err);
			}
			this.loadErrors.clear();
		}

		// Create watchers
		this.watchers = searchPatterns.map(pattern => this.setupWatcher(pattern));

		if (this.SuitesInfo.children.length == 0)
		{
			const errorMsg = 'No tests found, check the SearchPattern in the extension settings.';
			this.log.error(errorMsg);
			throw errorMsg;
		}

		// Send to CodeLensProcessor; Do NOT wait for it as it'll cause a deadlock
		this.codeLens.process(this.SuitesInfo);

		this.output.update('Loading tests complete', true);

		this.log.info('Loading tests (complete)');
		return this.SuitesInfo;
    }


	private async StopLoading(): Promise<void> {
		if (typeof this.Loadingtest === 'undefined') return;
		this.Loadingtest.childProcess.kill();
		await this.Loadingtest.exitCode;
	}

    private async LoadFiles(searchpatterns: string[]): Promise<string[]> {
		const stopLoader = this.output.loader();
		const skipGlob = this.configManager.get('skippattern');
		const patterns = optimiseGlobPatterns(searchpatterns);
		let files: string[] = [];
		for (let i = 0; i < patterns.length; i++) {
			const findGlob = new vscode.RelativePattern(this.workspace.uri.fsPath, patterns[i]);
			for (const file of await vscode.workspace.findFiles(findGlob, skipGlob)) {
				files.push(file.fsPath);
			}
		}
		stopLoader();
		return files;
	}

    private async SetTestSuiteInfo(file: string): Promise<void> {
		const testListFile = `${file}.txt`;
		let newFile = false;
		try {
			const cacheStat = await fs.stat(vscode.Uri.parse(testListFile));
			const fileStat = await fs.stat(vscode.Uri.parse(file));
			if (cacheStat.mtime > fileStat.mtime) {
				this.loadStatus.addedFromCache += 1;
				await this.AddtoSuite(file);
				return;
			}
		} catch(err) {
			const msg = getErrStr(err);
			if (msg.indexOf('non-existing file') > -1) {
				newFile = true;
				this.log.debug(`No cache file for ${testListFile}`);
			} else {
				this.log.error(`Unable to check for a cache file for ${testListFile}; Encountered: ${err}`);
				this.handleLoadError(file, err);
			}
		}

		let error = false;
		const args: string[] = [
			'vstest',
			file,
			'/ListFullyQualifiedTests',
			`/ListTestsTargetPath:${testListFile}`
		];
		this.log.debug(`execute: dotnet ${args.join(' ')} (starting)`);
		this.Loadingtest = new Command('dotnet', args, { cwd: this.workspace.uri.fsPath});
		this.output.connectCommand(this.Loadingtest);
		this.Loadingtest.onStdErr(() => {
			error = true;
		})
		try {
			const code = await this.Loadingtest.exitCode;
			if (error) throw DISCOVERY_ERROR.VSTEST_STDERR;
			this.log.debug(`execute: dotnet ${args.join(' ')} (complete)`);
			this.Loadingtest = undefined;
			this.log.info(`child process exited with code ${code}`);
			if (newFile) this.loadStatus.addedFromFile += 1;
			else this.loadStatus.updatedFromFile += 1;
			await this.AddtoSuite(file);
		} catch (err) {
			this.log.error(`child process exited with error ${err}`);
			this.handleLoadError(file, err);
			if (this.Loadingtest) this.Loadingtest.dispose();
			this.Loadingtest = undefined;
		}
    }

    private async AddtoSuite(file: string) {
		this.log.info(`suite creation: ${file} (starting)`);

		const testFile = vscode.Uri.parse(`${file}.txt`);
		const output = (await fs.readFile(testFile)).toString()
		let lines = output.split(/[\n\r]+/);

		const pathItems = file.split('/');
		const fileNamespace = pathItems[pathItems.length - 1].replace(".dll", "");

		const previousChildCount = this.SuitesInfo.children.length;

		const fileSuite: DerivitecTestSuiteInfo = {
			type: "suite",
			id: fileNamespace,
			label: fileNamespace,
			sourceDll: file,
			children: []
		};
		let inserted = false;
		if (this.nodeMap.has(fileSuite.id)) {
			this.log.info(`resetting node: ${fileNamespace}`);
			const suiteIndex = this.ResetSuites(file);
			if (suiteIndex > -1) {
				this.log.info(`replacing node: ${fileNamespace}`);
				this.SuitesInfo.children[suiteIndex] = fileSuite;
				inserted = true;
			}
		}

		if (!inserted) {
			this.log.info(`adding node: ${fileNamespace}`);
			this.SuitesInfo.children.push(fileSuite);
		}
		this.nodeMap.set(fileSuite.id, {node: fileSuite});


		for (const line of lines) {
			if (!line) {
				continue;
			}

			const testArray = line.split('.');
			if (testArray.length < 2) continue;
			const testName = testArray.pop()!;
			const className = testArray.pop()!;
			const namespace = line.replace(`.${className}.${testName}`, "");

			const classId = `${namespace}.${className}`;
			let classContext = this.nodeMap.get(classId) as DerivitecSuiteContext;

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
				this.nodeMap.set(classContext.node.id, classContext);
				fileSuite.children.push(classContext.node);
			}

			const testInfo: DerivitecTestInfo = {
				type: 'test',
				id: line,
				description: line,
				label: testName,
				sourceDll: file,
				skipped: false
			};

			this.loadStatus.added += 1;
			this.log.info(`adding node: ${line}`);
			this.nodeMap.set(testInfo.id, {node: testInfo});
			classContext.node.children.push(testInfo);
		}

		if (!fileSuite.children.length) {
			// Nothing has been added, which means there aren't any symbols in this file, delete it in case of error
			this.log.info(`suite creation:: ${file} was empty (erroring)`);
			if (previousChildCount !== this.SuitesInfo.children.length) {
				// If AddtoSuite has some how died mid run, adding a corrupt suite, return the array length to pre-add length
				this.SuitesInfo.children.length = previousChildCount;
			}
			throw DISCOVERY_ERROR.SYMBOL_FILE_EMPTY;
		}
		this.log.info(`suite creation:: ${file} (complete)`);

	}

	/* remove all tests of module fn from Suite */
	private ResetSuites(fileName: string, removeSuite = false) {
		// Remove all nodes related to given DLL, otherwise stale nodes live on and aren't accessible in the UI and aren't GCable
		this.nodeMap.forEach((value,key) => {
			if (value.node.sourceDll === fileName) {
				this.nodeMap.delete(key);
			}
		});
		// We can remove the suite entirely, but only do it if we actually want to retire the suite, otherwise replace it later
		const suiteIndex = this.SuitesInfo.children.findIndex(suite => suite.sourceDll === fileName);
		if (removeSuite && suiteIndex > -1) {
			this.SuitesInfo.children.splice(suiteIndex, 1);
		}
		return suiteIndex;
	}

	private setupWatcher(searchPattern: vscode.GlobPattern) {
		const watcher = vscode.workspace.createFileSystemWatcher(searchPattern);
		const add = async (uri: vscode.Uri) => {
			if (typeof this.Loadingtest !== 'undefined') await this.Loadingtest.exitCode;
			const finish = await this.testExplorer.load();
			const file = getFileFromPath(uri.fsPath);
			this.output.resetLoaded()
			this.loadStatus.loaded += 1;
			try {
				await this.SetTestSuiteInfo(uri.fsPath);
				if (this.loadErrors.size > 0 && this.loadErrors.has(file)) {
					const loadError = this.loadErrors.get(file);
					let err = `An error occurred while loading ${file}: `;
					if (loadError === DISCOVERY_ERROR.VSTEST_STDERR) {
						err += 'See ".NET Core Test Output" pane for details.';
					} else if (loadError === DISCOVERY_ERROR.SYMBOL_FILE_EMPTY) {
						err += 'The symbols file produced was empty, are there tests in this project?';
					}
					this.output.update(err);
					this.loadErrors.clear();
				}
				// Send to CodeLensProcessor; Do NOT wait for it as it'll cause a deadlock
				this.codeLens.process(this.SuitesInfo);
				this.output.update(`New tests added from ${uri.fsPath.replace(this.workspace.uri.fsPath, '')}`, true);
				finish.pass(this.SuitesInfo);
			} catch (e) {
				finish.fail(e);
			}
		}
		watcher.onDidChange(add);
		watcher.onDidCreate(add);
		watcher.onDidDelete((uri) => this.ResetSuites(uri.fsPath));
		return watcher;
	}

	private async handleLoadError(file: string, err: unknown) {
		const testListFile = `${file}.txt`;
		this.loadErrors.set(getFileFromPath(file), err);
		try {
			await fs.delete(vscode.Uri.parse(testListFile));
		} catch (err) {
			const msg = getErrStr(err);
			// If the error is due to the file already being deleted, don't raise an error in the log
			if (msg.indexOf('non-existing file') === -1) {
				this.log.error(`Unable to delete ${testListFile}: ${msg}`);
			}
		}
	}

	public dispose() {
		if (typeof this.Loadingtest !== 'undefined') this.Loadingtest.dispose();
	}

}
