// vscode imports
import * as vscode from 'vscode';

// vscode-test-adapter imports
import {
	TestAdapter,
	TestLoadStartedEvent,
	TestLoadFinishedEvent,
	TestRunStartedEvent,
	TestRunFinishedEvent,
	TestSuiteEvent,
	TestEvent
} from 'vscode-test-adapter-api';

import { Log } from 'vscode-test-adapter-util';

// derivitec imports
import { TestDiscovery } from "./testDiscovery"
import { TestRunner } from "./testRunner"

export class DotnetAdapter implements TestAdapter {

	private disposables: { dispose(): void }[] = [];

	private readonly testDiscovery: TestDiscovery;

	private readonly testRunner: TestRunner;

	private readonly testsEmitter =
	    new vscode.EventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>();
	private readonly testStatesEmitter = new vscode.EventEmitter<TestRunStartedEvent |
	    TestRunFinishedEvent | TestSuiteEvent | TestEvent>();
	private readonly autorunEmitter = new vscode.EventEmitter<void>();

	get tests(): vscode.Event<TestLoadStartedEvent | TestLoadFinishedEvent> {
		return this.testsEmitter.event;
	}
	get testStates(): vscode.Event<TestRunStartedEvent | TestRunFinishedEvent |
		TestSuiteEvent | TestEvent> {
		return this.testStatesEmitter.event;
	}
	get autorun(): vscode.Event<void> | undefined {
		return this.autorunEmitter.event;
	}

	constructor(
		public readonly workspace: vscode.WorkspaceFolder,
		private readonly outputchannel: vscode.OutputChannel,
		private readonly log: Log,
	) {
		this.log.info('Initializing .Net Core adapter');
		this.log.info('');

		this.testDiscovery = new TestDiscovery(
			this.workspace,
			this.outputchannel,
			this.log
		);

		this.testRunner = new TestRunner(
			this.workspace,
			this.outputchannel,
			this.log,
			this.testDiscovery,
			this.testStatesEmitter
		);

		this.disposables.push(this.testsEmitter);
		this.disposables.push(this.testStatesEmitter);
		this.disposables.push(this.autorunEmitter);
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
		this.testsEmitter.fire(<TestLoadStartedEvent>{ type: 'started' });

		const finishedEvent: TestLoadFinishedEvent = { type: 'finished' }

		try {
			finishedEvent.suite = await this.testDiscovery.Load();
		} catch (error) {
			finishedEvent.errorMessage = error;
		}

		this.testsEmitter.fire(finishedEvent);
	}

	async run(tests: string[]): Promise<void> {
		this.testStatesEmitter.fire(<TestRunStartedEvent>{ type: 'started', tests });
		this.testRunner.Run(tests);
		this.testStatesEmitter.fire(<TestRunFinishedEvent>{ type: 'finished' });
	}

	async debug(tests: string[]): Promise<void> {
		this.testStatesEmitter.fire(<TestRunStartedEvent>{ type: 'started', tests });
		this.testRunner.Debug(tests);
		this.testStatesEmitter.fire(<TestRunFinishedEvent>{ type: 'finished' });
	}

	cancel(): void {
		this.testRunner.Cancel();
	}

	dispose(): void {
		this.testRunner.Cancel();
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables = [];
	}
}
