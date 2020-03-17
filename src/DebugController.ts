import * as vscode from 'vscode';
import { Log } from 'vscode-test-adapter-util';
import Command from './Command';
import { ConfigManager } from './ConfigManager';

interface IDebugRunnerInfo {
    config: vscode.DebugConfiguration;
    processId: string;
}

export class DebugController {
    private processIdRegexp = /Process Id: (.*),/gm;

    private debugProcesses: { [id: string] : IDebugRunnerInfo; } = {};

    constructor(
        public readonly workspace: vscode.WorkspaceFolder,
        public readonly configManager: ConfigManager,
        private readonly Runningtest: Command | undefined,
		private readonly log: Log,
	){ }

    public async onData(data: string){
        const match = this.processIdRegexp.exec(data);

        if (match && match[1]) {

            const processId = match[1];

            let debugProcess = this.debugProcesses[processId] as IDebugRunnerInfo;

            if (!debugProcess) {
                debugProcess = {
                    processId: processId,
                    config: this.configManager.get('attachCpp') ?
                    {
                        name: '.NET Core Attach',
                        type: 'coreclr',
                        request: 'attach',
                        processId: processId,
                    } :
                    {
                        "name": "(gdb) Attach",
                        "type": "cppdbg",
                        "request": "attach",
                        "program": "/usr/share/dotnet/dotnet",
                        "processId": processId,
                        "MIMode": "gdb",
                        "setupCommands": [
                            {
                                "description": "Enable pretty-printing for gdb",
                                "text": "-enable-pretty-printing",
                                "ignoreFailures": true
                            }
                        ]
                    },
                };

                this.debugProcesses[processId] = debugProcess;

                const buffer = await vscode.debug.startDebugging(this.workspace, debugProcess.config);

                this.log.info(buffer.toString());
                // When we attach to the debugger it seems to be stuck before loading the actual assembly that's running in code
                // This is to try to continue past this invisible break point and into the actual code the user wants to debug
                setTimeout(() => {
                    vscode.commands.executeCommand("workbench.action.debug.continue");
                }, 1000);

                const currentSession = vscode.debug.activeDebugSession;
                if (!currentSession) {
                    this.log.error('No active debug session - aborting');
                    if (this.Runningtest && this.Runningtest.childProcess.stdin)
                        this.Runningtest.childProcess.stdin.write('Done\n');
                    return;
                }

                const subscription = vscode.debug.onDidTerminateDebugSession((session) => {
                    if (currentSession != session) return;
                    if (this.Runningtest && this.Runningtest.childProcess.stdin)
                        this.Runningtest.childProcess.stdin.write('Done\n');
                    this.log.info('Debug session ended');
                    subscription.dispose();
                });
            }
        }
    }
}
