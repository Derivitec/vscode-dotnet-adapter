import * as vscode from 'vscode';
import OutputManager from './OutputManager';
import TestExplorer from './TestExplorer';
import { ConfigManager } from './ConfigManager';

const getOmnisharp = () => vscode.extensions.getExtension('ms-dotnettools.csharp');

export default class CodeLensProcessor {
    private disposables: { dispose(): void }[] = [];

    public waiting = false;

    public ready = false;

    private cancel = false;

    private deferredSuite?: DerivitecTestSuiteInfo;

    constructor(
        private output: OutputManager,
        private configManager: ConfigManager,
        private testExplorer: TestExplorer,
    ) {
        if (this.configManager.get('codeLens')) {
            this.setupOnOmnisharpReady();
        } else {
            this.output.update('CodeLens integration deactivated. Change the codeLens setting if you wish to activate.');
        }
        this.disposables.push(
            this.configManager.addWatcher('codeLens', (newValue: boolean) => {
                if (newValue === true && !this.waiting && !this.ready) {
                    this.setupOnOmnisharpReady();
                    return;
                }
                this.output.update('CodeLens integration was previously activated and is already in progress.');
            })
        );
    }

    private async setupOnOmnisharpReady() {
        this.waiting = true;
        await this.monitorOmnisharpInitialisation();
        this.waiting = false;
        try {
            this.ready = true;
            const suite = this.deferredSuite;
            this.deferredSuite = undefined;
            if (suite) this.process(suite);
        } catch (e) {
            this.handleError(e);
        }
    }

    private async monitorOmnisharpInitialisation() {
        let omnisharp = getOmnisharp();
        if (!omnisharp) {
            this.output.update('C# extension is not installed. Install and enable to apply additional CodeLens information to tests.');
            await this.waitForInstallation();
            this.processCancel();
            omnisharp = getOmnisharp();
        }
        if (omnisharp && !omnisharp.isActive) {
            this.output.update('C# extension is installed, but not yet active. Waiting for activation...');
            await this.waitForActivation();
            this.processCancel();
            omnisharp = getOmnisharp();
        }
        if (omnisharp?.isActive && 'initializationFinished' in omnisharp.exports && typeof omnisharp.exports.initializationFinished === 'function') {
            this.output.update('Waiting for Omnisharp to complete initialisation. This can take several minutes.');
            await omnisharp.exports.initializationFinished();
            this.processCancel();
            this.output.update('Omnisharp initialisation completed');
            return;
        }
        throw 'An unexpected error occurred while processing CodeLens information.';
    }

    private waitForInstallation() {
        return new Promise((resolve) => {
            vscode.extensions.onDidChange(() => {
                if (getOmnisharp()) resolve();
            })
        });
    }

    private waitForActivation() {
        return new Promise((resolve) => {
            const intervalUid = setInterval(() => {
                const omnisharp = getOmnisharp();
                if (omnisharp && omnisharp.isActive) {
                    clearInterval(intervalUid);
                    resolve();
                }
            }, 10000);
        });
    }

    async process(suite: DerivitecTestSuiteInfo) {
        const finish = await this.testExplorer.load(false);
        if (!this.ready) {
            this.deferredSuite = suite;
            finish.pass(suite);
            return;
        }
        this.output.update('Processing CodeLens data');
        const stopLoader = this.output.loader();
        try {
            await Promise.all(suite.children.map(this.processItem.bind(this)));
            finish.pass(suite);
            stopLoader();
            this.output.update('CodeLens symbols updated');
        } catch (e) {
            finish.fail(e);
            stopLoader();
            this.handleError(e);
        }
    }

    private async processItem(item: DerivitecTestSuiteInfo | DerivitecTestInfo) {
        const symbols = await vscode.commands.executeCommand('vscode.executeWorkspaceSymbolProvider', item.label) as vscode.SymbolInformation[];
        this.processCancel();
        if (symbols.length > 0) {
            const symbol = symbols[0];
            item.file = symbol.location.uri.fsPath;
            item.line = symbol.location.range.start.line;
        }
        if ('children' in item && item.children.length > 0) await Promise.all(item.children.map(this.processItem.bind(this)));
}

    private processCancel() {
        if (this.cancel) throw 'Processing cancelled.';
    }

    private handleError(err: Error | string) {
        this.output.update(`[CodeLens] Error: ${err}`);
    }

    dispose() {
        this.cancel = true;
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }
}