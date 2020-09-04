import Command from './Command';
import * as vscode from 'vscode';
import * as path from 'path';
import { Log } from 'vscode-test-adapter-util';
import { isMatch } from 'micromatch';

import { ConfigManager } from "./ConfigManager";
import OutputManager, { Loaded } from './OutputManager';
import CodeLensProcessor from './CodeLensProcessor';
import TestExplorer from './TestExplorer';
import { getFileFromPath, normaliseError, getPatternArray } from './utilities';

const fs = vscode.workspace.fs;

enum DISCOVERY_ERROR {
	VSTEST_STDERR = 'DISCOVERY_ERROR: VSTEST_STDERR',
	SYMBOL_FILE_EMPTY = 'DISCOVERY_ERROR: SYMBOL_FILE_EMPTY'
};

type SuiteGroups = { [key: string]: DerivitecTestSuiteInfo; };

const hasGrouping = (patterns: SearchPatterns): patterns is GroupedSearchPatterns => typeof patterns === 'object' && !Array.isArray(patterns);

const removeNodeFromParent = (parent: DerivitecTestSuiteInfo['parent'], term: string, prop: keyof (DerivitecTestSuiteInfo | DerivitecTestInfo) = 'id') => {
	if (!parent) return;
	const id = parent.children.findIndex(suite => suite[prop] === term);
	if (id === 0) {
		parent.children.shift();
	} else if (id === parent.children.length - 1) {
		parent.children.pop();
	} else if (id > -1) {
		parent.children.splice(id, 1);
	}
};

const getTestFile = (file: vscode.Uri) => file.with({ path: `${file.path}.txt` });

const isFileNotFound = (err: unknown) => {
	const errObj = normaliseError(err);
	return ('name' in errObj && errObj.name.startsWith('EntryNotFound')) || errObj.message.indexOf('non-existing file') > -1;
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
		sourceDll: 'root',
		parent: null,
	};

	private SuiteGroups?: SuiteGroups;

	private searchPatterns: SearchPatterns = [];

	private watchers?: vscode.FileSystemWatcher[];

	constructor(
		private readonly workspace: vscode.WorkspaceFolder,
		private readonly nodeMap: Map<string, DerivitecSuiteContext | DerivitecTestContext>,
		private readonly output: OutputManager,
		private readonly configManager: ConfigManager,
		private readonly codeLens: CodeLensProcessor,
		private readonly testExplorer: TestExplorer,
		private readonly log: Log,
	) {
		this.loadStatus = this.output.loaded;
	}

	public GetNode(id: string): DerivitecSuiteContext | DerivitecTestContext {
		const node = this.nodeMap.get(id);
		if (!node) throw `Test node '${id}' could not be found!`;
		return node;
	}

	public async Load(): Promise<DerivitecTestSuiteInfo> {
		this.log.info('Loading tests (starting)');

		// Clean up previous listing
		this.nodeMap.forEach(({ node }) => {
			const path = node.sourceDll;
			if (path !== 'root') return this.DetachSuite(path, true);
			// The suite is a structural suite such as a root note or group
			removeNodeFromParent(node.parent, node.id);
		});
		this.nodeMap.clear();

		this.nodeMap.set(this.SuitesInfo.id, { node: this.SuitesInfo });

		this.output.resetLoaded();

		await this.StopLoading();

		if (Array.isArray(this.watchers) && this.watchers.length > 0) {
			this.watchers.map(watcher => watcher.dispose());
		}

		this.searchPatterns = this.configManager.get('searchpatterns');

		if (hasGrouping(this.searchPatterns)) {
			const groups: SuiteGroups = {};
			Object.keys(this.searchPatterns).forEach((key) => {
				const group: DerivitecTestSuiteInfo = {
					type: 'suite',
					id: `group:${key}`,
					label: key,
					children: [],
					sourceDll: 'root',
					parent: this.SuitesInfo,
				};
				this.nodeMap.set(group.id, { node: group });
				this.SuitesInfo.children.push(group);
				groups[key] = group;
			});
			this.SuiteGroups = groups;
		}

		const patternArr = getPatternArray(this.searchPatterns);

		this.output.update('Searching for tests');
		const files = await this.LoadFiles(patternArr);
		this.loadStatus.loaded += files.length;
		this.output.update(`Loading tests from ${files.length} files`);
		const stopLoader = this.output.loader();
		for (const file of files) {
			try {
				this.log.info(`file: ${file.fsPath} (loading)`);
				await this.SetTestSuiteInfo(file);
				this.log.info(`file: ${file.fsPath} (load complete)`);
			} catch (e) {
				this.log.error(e);
				throw e;
			}
		};
		stopLoader();

		if (this.loadErrors.size > 0) {
			this.output.update(`Encountered errors in ${this.loadErrors.size} files during loading.`);
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
		this.watchers = patternArr.map(pattern => this.setupWatcher(pattern));

		if (this.SuitesInfo.children.length == 0) {
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

	private async LoadFiles(searchpatterns: string[]): Promise<vscode.Uri[]> {
		const stopLoader = this.output.loader();
		const skipGlob = this.configManager.get('skippattern');
		let files: vscode.Uri[] = [];
		await Promise.all(searchpatterns.map(async (pattern) => {
			const findGlob = new vscode.RelativePattern(this.workspace.uri.fsPath, pattern);
			const results = await vscode.workspace.findFiles(findGlob, skipGlob);
			files.push(...results);
		}));
		stopLoader();
		return files;
	}

	private async SetTestSuiteInfo(file: vscode.Uri): Promise<void> {
		const testListFile = getTestFile(file);
		const testListFileStr = testListFile.fsPath;
		let newFile = false;
		try {
			const cacheStat = await fs.stat(testListFile);
			const fileStat = await fs.stat(file);
			if (cacheStat.mtime > fileStat.mtime) {
				this.loadStatus.addedFromCache += 1;
				await this.AddtoSuite(file);
				return;
			}
		} catch (err) {
			if (isFileNotFound(err)) {
				newFile = true;
				this.log.debug(`No cache file for ${testListFileStr}`);
			} else {
				this.log.error(`Unable to check for a cache file for ${testListFileStr}; Encountered: ${err}`);
				this.handleLoadError(file, err);
			}
		}

		let error = false;
		const args: string[] = [
			'vstest',
			file.fsPath,
			'/ListFullyQualifiedTests',
			`/ListTestsTargetPath:${testListFileStr}`
		];
		this.log.debug(`execute: dotnet ${args.join(' ')} (starting)`);
		this.Loadingtest = new Command('dotnet', args, { cwd: this.workspace.uri.fsPath });
		this.output.connectCommand(this.Loadingtest);
		this.Loadingtest.onStdErr(() => {
			error = true;
		});
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

	private async AddtoSuite(file: vscode.Uri) {
		const fileStr = file.fsPath;
		this.log.info(`suite creation: ${fileStr} (starting)`);

		const testFile = getTestFile(file);
		const output = (await fs.readFile(testFile)).toString();
		let lines = output.split(/[\n\r]+/);

		const parsedPath = path.parse(fileStr);
		const fileNamespace = parsedPath.base.replace(parsedPath.ext, "");

		const fileSuite: DerivitecTestSuiteInfo = {
			type: "suite",
			id: fileNamespace,
			label: fileNamespace,
			sourceDll: file,
			children: [],
			parent: null,
		};
		/* let inserted = false;
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
		this.nodeMap.set(fileSuite.id, {node: fileSuite}); */


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

			if (!classContext) {
				classContext = {
					node: {
						type: 'suite',
						id: classId,
						label: className,
						sourceDll: file,
						children: [],
						parent: fileSuite,
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
				skipped: false,
				parent: classContext.node,
			};

			this.loadStatus.added += 1;
			this.log.info(`adding node: ${line}`);
			this.nodeMap.set(testInfo.id, { node: testInfo });
			classContext.node.children.push(testInfo);
		}

		if (!fileSuite.children.length) {
			// Nothing has been added, which means there aren't any symbols in this file, delete it in case of error
			this.log.info(`suite creation: ${fileStr} was empty (erroring)`);
			/* if (previousChildCount !== this.SuitesInfo.children.length) {
				// If AddtoSuite has some how died mid run, adding a corrupt suite, return the array length to pre-add length
				this.SuitesInfo.children.length = previousChildCount;
			} */
			throw DISCOVERY_ERROR.SYMBOL_FILE_EMPTY;
		}
		this.log.info(`suite creation: ${fileStr} (complete)`);
		this.AttachSuite(fileSuite);
	}

	private GetSuiteGroup(suite: DerivitecTestSuiteInfo) {
		const groupPair = { name: 'root', group: this.SuitesInfo };
		const patterns = this.searchPatterns;
		const filePath = suite.sourceDll;
		if (filePath === 'root') {
			// Unlikely to happen, but this is a structual suite and cannot be part of a group
			return groupPair;
		}
		if (hasGrouping(patterns) && this.SuiteGroups) {
			const name = Object.keys(patterns).find((groupName) => isMatch(filePath.fsPath, patterns[groupName]));
			if (!name) return groupPair;
			return { name, group: this.SuiteGroups[name] };
		}
		return groupPair;
	}

	private AttachSuite(suite: DerivitecTestSuiteInfo) {
		const filePath = suite.sourceDll;
		if (filePath === 'root') throw Error('Cannot attach structual suite.');
		const { name: parentName, group: parent } = this.GetSuiteGroup(suite);
		let inserted = false;
		if (this.nodeMap.has(suite.id)) {
			const context = this.nodeMap.get(suite.id) as DerivitecSuiteContext;
			if (context.node.parent === parent) {
				// Just detach, no removal
				// Swap suite in place
				this.DetachSuite(filePath);
				const suiteIndex = parent.children.findIndex(childSuite => childSuite.sourceDll === suite.sourceDll);
				if (suiteIndex && suiteIndex > -1) {
					this.log.info(`replacing node "${suite.id}" in "${parentName}"`);
					parent.children[suiteIndex] = suite;
					inserted = true;
				}
			} else if (context.node.sourceDll !== 'root') {
				this.log.info(`removing node "${suite.id}" from "${parentName}"`);
				this.DetachSuite(context.node.sourceDll, true);
			}
		}

		// Add to new group
		if (!inserted) {
			this.log.info(`adding node "${suite.id}" to "${parentName}"`);
			parent.children.push(suite);
		}
		this.nodeMap.set(suite.id, { node: suite });
		suite.parent = parent;

		/*
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
		*/
	}

	/* remove all tests of module fn from Suite */
	private DetachSuite(file: vscode.Uri, removeSuite: boolean = false) {
		const filePath = file.toString();
		// Remove all nodes related to given DLL, otherwise stale nodes live on and aren't accessible in the UI and aren't GCable
		this.nodeMap.forEach((value, key) => {
			if (value.node.sourceDll === filePath) {
				this.nodeMap.delete(key);
				// We can remove the suite entirely, but only do it if we actually want to retire the suite, otherwise replace it later
				if (removeSuite) {
					removeNodeFromParent(value.node.parent, filePath, 'sourceDll');
				}
			}
		});
	}

	private setupWatcher(searchPattern: string) {
		const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(this.workspace.uri.fsPath, searchPattern));
		const add = async (uri: vscode.Uri) => {
			if (typeof this.Loadingtest !== 'undefined') await this.Loadingtest.exitCode;
			const finish = await this.testExplorer.load();
			const file = getFileFromPath(uri.fsPath);
			const uriStr = uri.toString();
			this.output.resetLoaded();
			this.loadStatus.loaded += 1;
			try {
				await this.SetTestSuiteInfo(uri);
				if (this.loadErrors.size > 0 && this.loadErrors.has(uriStr)) {
					const loadError = this.loadErrors.get(uriStr);
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
		};
		watcher.onDidChange(add);
		watcher.onDidCreate(add);
		watcher.onDidDelete((uri) => this.DetachSuite(uri, true));
		return watcher;
	}

	private async handleLoadError(file: vscode.Uri, err: unknown) {
		const testListFile = getTestFile(file);
		this.loadErrors.set(file.toString(), err);
		try {
			await fs.delete(testListFile);
		} catch (err) {
			// If the error is due to the file already being deleted, don't raise an error in the log
			const errObj = normaliseError(err);
			if (isFileNotFound(errObj)) {
				this.log.error(`Unable to delete ${testListFile.fsPath}: ${errObj.message}`);
			}
		}
	}

	public dispose() {
		if (typeof this.Loadingtest !== 'undefined') this.Loadingtest.dispose();
	}

}
