// vscode imports
import * as vscode from 'vscode';

// vscode-test-adapter imports
import { TestAdapter } from 'vscode-test-adapter-api';

import { Log } from 'vscode-test-adapter-util';

// derivitec imports
import { TestDiscovery } from "./testDiscovery"
import { TestRunner } from "./testRunner"
import OutputManager from './OutputManager';
import CodeLensProcessor from './CodeLensProcessor';
import TestExplorer from './TestExplorer';

export class DotnetAdapter implements TestAdapter {

	private disposables: { dispose(): void }[] = [];

	private readonly nodeMap = new Map<string, DerivitecSuiteContext | DerivitecTestContext>();

	private readonly outputManager = new OutputManager();

	private readonly testExplorer = new TestExplorer(this.nodeMap);

	private readonly codeLensProcessor?: CodeLensProcessor;

	private readonly testDiscovery: TestDiscovery;

	private readonly testRunner: TestRunner;

	get tests() {
		return this.testExplorer.tests;
	}
	get testStates() {
		return this.testExplorer.testStates;
	}
	get autorun() {
		return this.testExplorer.autorun;
	}

	constructor(
		public readonly workspace: vscode.WorkspaceFolder,
		private readonly log: Log,
	) {
		this.log.info('Initializing .Net Core adapter');
		this.log.info('');

		this.codeLensProcessor = new CodeLensProcessor(
			this.outputManager,
			this.testExplorer,
		);

		this.testDiscovery = new TestDiscovery(
			this.workspace,
			this.nodeMap,
			this.outputManager,
			this.codeLensProcessor,
			this.testExplorer,
			this.log
		);

		this.testRunner = new TestRunner(
			this.workspace,
			this.nodeMap,
			this.outputManager,
			this.log,
			this.testExplorer
		);

		this.disposables.push(this.testExplorer);
		this.disposables.push(this.codeLensProcessor);
		this.disposables.push(
			vscode.workspace.onDidChangeConfiguration(configChange => {

				this.log.info('Configuration changed');

				if (configChange.affectsConfiguration('dotnetCoreExplorer.searchpatterns', this.workspace.uri)) {

					this.log.info('Sending reload event');
					this.load();
				}
			})
		);
	}

	async load(): Promise<void> {
		const finish = await this.testExplorer.load();

		try {
			const suite = await this.testDiscovery.Load();
			finish.pass(suite);
		} catch (error) {
			finish.fail(error);
		}
	}

	async run(tests: string[]): Promise<void> {
		const finish = await this.testExplorer.run(tests);
		await this.testRunner.Run(tests);
		finish();
	}

	async debug(tests: string[]): Promise<void> {
		const finish = await this.testExplorer.run(tests);
		await this.testRunner.Debug(tests);
		finish();
	}

	cancel(): void {
		this.testRunner.Cancel();
		this.testExplorer.cancelAllRuns();
	}

	dispose(): void {
		this.testRunner.Cancel();
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables = [];
	}
}
