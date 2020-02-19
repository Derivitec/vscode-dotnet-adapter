import * as vscode from 'vscode';
import { plural, objToListSentence, getDate } from './utilities';
import Command from './Command';

const loadedDefault = () => ({
    loaded: 0,
    added: 0,
    addedFromCache: 0,
    updatedFromFile: 0,
    addedFromFile: 0,
});

export type Loaded = ReturnType<typeof loadedDefault>;

export default class OutputManager {
    private internalLoaded: Loaded = loadedDefault();

    private canAppend = true;

    private log: string[] = [];

    private readonly summaryChannel = vscode.window.createOutputChannel('.Net Core Test Summary');

    private readonly outputChannel = vscode.window.createOutputChannel('.Net Core Test Output');

    constructor() {
        this.refresh();
    }

    get loaded() {
        const obj = {};
        const keys = Object.keys(this.internalLoaded) as (keyof Loaded)[];
        keys.forEach(key => Object.defineProperty(obj, key, {
            get: () => this.internalLoaded[key],
            set: (value: number) => {
                this.canAppend = false;
                this.internalLoaded[key] = value;
            }
        }));
        return obj as Loaded;
    }

    update(status?: string, summarise: boolean = false) {
        let logItem;
        if (status) {
            logItem = `[${getDate()}] ${status}`;
            if (summarise) logItem += ` ${this.summarise()}`;
            this.log.push(logItem);
            if (this.canAppend) return this.summaryChannel.appendLine(logItem);
        }
        if (!this.canAppend) this.refresh();
        this.canAppend = true;
    }

    refresh() {
        const { loaded, added, addedFromCache, addedFromFile, updatedFromFile } = this.internalLoaded;
        this.summaryChannel.clear();
        this.summaryChannel.appendLine(`Loaded ${loaded} test file${plural(loaded)}
Added ${added} test${plural(added)} to the test suite
    ${addedFromFile} new test file${plural(addedFromFile)}
    ${addedFromCache} cached test file${plural(addedFromCache)}
    ${updatedFromFile} test file${plural(updatedFromFile)} updated since last cache

${this.log.join('\n')}`);
    }

    summarise() {
        const { loaded, added, addedFromCache, addedFromFile, updatedFromFile } = this.internalLoaded;
        const breakdown = { 'new': addedFromFile, 'cached': addedFromCache, 'updated': updatedFromFile };
        return `${added} tests from ${loaded} files; ${objToListSentence(breakdown)}`;
    }

    loader() {
        let initialLength = this.log.length;
        const message = this.log[initialLength - 1];
        const uid = setInterval(() => {
            if (this.log.length !== initialLength) {
                // Something else has been logged, ensure it's clear what the loader is for
                this.refresh();
                this.summaryChannel.appendLine(`Still running -> ${message}`);
                initialLength = this.log.length;
            }
            this.canAppend = false;
            this.summaryChannel.append('.')
        }, 1000);
        return () => {
            clearInterval(uid);
            this.canAppend = false;
            this.summaryChannel.append('Complete.');
        }
    }

    getTestOutputHandler(id: string) {
        this.update(`${id} running`);
        const stopLoader = this.loader();
        this.outputChannel.show(true);
        this.outputChannel.appendLine(`[${new Date().toISOString()}] Test output for ${id} begins...`);
        return {
            print: (...data: string[]) => this.outputChannel.append(data.join(' ')),
            finish: () => {
                this.outputChannel.appendLine(`[${getDate()}] Test output for ${id} ends...`);
                stopLoader();
                this.update(`${id} finished`);
            }
        };
    }

    connectCommand(cmd: Command) {
        cmd.onData(data => this.outputChannel.append(data.toString()));
    }

    resetLoaded() {
        // Reset output numbers
		Object.keys(this.internalLoaded).forEach((key) => Object.assign(this.internalLoaded, { [key]: 0 }));
    }
}