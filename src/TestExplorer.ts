import * as vscode from 'vscode';
import { TestLoadStartedEvent, TestLoadFinishedEvent, TestRunStartedEvent, TestRunFinishedEvent } from 'vscode-test-adapter-api';
import { plural } from './utilities';
import QueueManager from './QueueManager';



type CompletionHandle<T> = (data: T) => void;

type CompletionHandleWithFailure<T, P> = { pass: CompletionHandle<T>, fail: CompletionHandle<P> };

enum OP_TYPE { LOAD, RUN };
const opPriority = [OP_TYPE.RUN, OP_TYPE.LOAD];

type LoadState = 'none' | 'started' | 'finished';

export default class TestExplorer {
    private disposables: { dispose(): void }[] = [];

    private readonly testsEmitter =
        new vscode.EventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>();

	private readonly testStatesEmitter = new vscode.EventEmitter<TestRunStartedEvent |
        TestRunFinishedEvent | TestSuiteEvent | TestEvent>();

    private readonly autorunEmitter = new vscode.EventEmitter<void>();

    private readonly queueManager = new QueueManager<OP_TYPE>(opPriority);

    private loadState: LoadState = 'none';

    private runPool: Set<string> = new Set();

    constructor(
        private readonly nodeMap: Map<string, DerivitecSuiteContext | DerivitecTestContext>
    ) {
        this.disposables.push(
            this.testsEmitter,
            this.testStatesEmitter,
            this.autorunEmitter,
            this.queueManager,
        );
    }

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

    get testsRunning() {
        const testsWaiting = this.queueManager.count[OP_TYPE.RUN];
        const testRunning = this.queueManager.currentJob && this.queueManager.currentJob.type === OP_TYPE.RUN;
        return testsWaiting + (testRunning ? 1 : 0);
    }

    async load(userInitiated = true): Promise<CompletionHandleWithFailure<DerivitecTestSuiteInfo, string>> {
        if (userInitiated && this.testsRunning > 0) {
            vscode.window.showErrorMessage(`${this.testsRunning} test${plural(this.testsRunning)} ${plural(this.testsRunning, 'is')} running. Please wait or cancel the test${plural(this.testsRunning)} to refresh test suites.`);
            throw 'Tests are running; Cannot refresh test suites';
        }
        if (userInitiated) {
            this.queueManager.retractSlots(OP_TYPE.LOAD);
            if (this.queueManager.isRunning) {
                vscode.window.showInformationMessage('Test suites will be refreshed when the current operation has completed.');
            }
        }
        const release = await this.queueManager.acquireSlot(OP_TYPE.LOAD);
        this.loadState = 'started';
        this.testsEmitter.fire(<TestLoadStartedEvent>{ type: this.loadState });
        const finish = (data: TestLoadFinishedEvent) => {
            this.loadState = 'finished';
            this.testsEmitter.fire(data);
            release();
        }
        return {
            pass: (suite: DerivitecTestSuiteInfo) => finish({ type: 'finished', suite }),
            fail: (errorMessage: string) => finish({ type: 'finished', errorMessage })
        };
    }

    async run(tests: string[]): Promise<CompletionHandle<void>> {
        // Fire the event immediately to keep UI responsive
        this.testStatesEmitter.fire(<TestRunStartedEvent>{ type: 'started', tests });
        // Add tests to the run pool to allow proper cancellation handling later
        tests.forEach(test => this.runPool.add(test));
        const release = await this.queueManager.acquireSlot(OP_TYPE.RUN);
		return () => {
            // Remove tests from the run pool
            tests.forEach(test => this.runPool.delete(test));
            if (this.queueManager.count[OP_TYPE.RUN] === 0) {
                this.testStatesEmitter.fire(<TestRunFinishedEvent>{ type: 'finished' });
            }
            release();
        }
    }

    cancelAllRuns() {
        this.queueManager.retractSlots(OP_TYPE.RUN);
        this.runPool.forEach(test => {
            const node = this.nodeMap.get(test);
            if (!node) return;
            const { type } = node.node;
            if (type === 'suite') {
                this.updateState({ type: 'suite', suite: test, state: 'completed' });
            } else if (type === 'test') {
                this.updateState({ type: 'test', test, state: 'skipped' });
            }
        });
        this.runPool.clear();
        this.testStatesEmitter.fire(<TestRunFinishedEvent>{ type: 'finished' });
    }

    updateState<T extends TestSuiteEvent | TestEvent>(event: T) {
        this.testStatesEmitter.fire(event);
    }

    dispose(): void {
        this.disposables.forEach(disposable => disposable.dispose());
		this.disposables = [];
    }
}
