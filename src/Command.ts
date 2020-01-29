import { spawn, ChildProcess, SpawnOptions } from 'child_process';

export default class Command {
    public childProcess: ChildProcess;

    public exitCode: Promise<number>;

    constructor(command: string, args: ReadonlyArray<string>, options: SpawnOptions) {
        this.childProcess = spawn(command, args, options);
        this.exitCode = new Promise((resolve, reject) => {
            this.childProcess.on('close', resolve);
            this.childProcess.on('error', reject);
        });
    }

    onData(handler: (data: any) => void) {
        this.onStdOut(handler);
        this.onStdErr(handler);
    }

    onStdOut(handler: (data: any) => void) {
        this.childProcess.stdout!.on('data', handler);
    }

    onStdErr(handler: (data: any) => void) {
        this.childProcess.stderr!.on('data', handler);
    }
}