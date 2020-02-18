import * as vscode from 'vscode';
import { Log } from 'vscode-test-adapter-util';
import { createConfigItem as c, plural } from './utilities';

const schema = {
    logpanel: c<boolean>({ default: false }),
    codeLens: c<boolean>({ default: true }),
    runEnvVars: c<object>({ default: {} }),
    searchpatterns: c<string[]>({ default: [], required: true }),
    skippattern: c<string>({ default: '' }),
};

type ConfigSchema = typeof schema;

type ConfigEntryKey = keyof ConfigSchema;

type ConfigEntryType<T extends ConfigEntryKey> = ConfigSchema[T] extends ConfigEntry<infer U> ? U : any;

type ConfigWatchers = { [K in keyof ConfigSchema]: Set<Function> };

export class ConfigManager {
    private disposables: { dispose(): void }[] = [];

    private config: vscode.WorkspaceConfiguration;

    private schema = schema;

    private watchers: ConfigWatchers;

    constructor(
        private readonly workspace: vscode.WorkspaceFolder,
		private readonly log: Log,
	){
        this.config = vscode.workspace.getConfiguration('dotnetCoreExplorer', this.workspace.uri);
        this.watchers = this.initWatchers();
        this.setupConfigChangeListeners();
    }

    private initWatchers() {
        const watchers = {} as ConfigWatchers;
        this.configKeys.forEach((key) => {
            watchers[key] = new Set();
        });
        return watchers;
    }

    private setupConfigChangeListeners() {
        const disposeListener = vscode.workspace.onDidChangeConfiguration(configChange => {
            this.log.info('Configuration changed');
            this.config = vscode.workspace.getConfiguration('dotnetCoreExplorer', this.workspace.uri);
            const activeWatchers = this.configKeys.filter(key => this.watchers[key].size > 0);
            activeWatchers.forEach((key) => {
                if (configChange.affectsConfiguration(`dotnetCoreExplorer.${key}`, this.workspace.uri)) {
                    const keyWatchers = this.watchers[key];
                    const watcherCount = keyWatchers.size;
                    this.log.info(`Change affects ${key} which has ${watcherCount} watcher${plural(watcherCount)}`);
                    keyWatchers.forEach(func => func(this.get(key)));
                }
            });
        });
        this.disposables.push(disposeListener);
    }

    private get configKeys(): ConfigEntryKey[] {
        return Object.keys(schema) as ConfigEntryKey[];
    }

    public get<T extends ConfigEntryKey>(key: T): ConfigEntryType<T> {
        if (!(key in this.schema)) throw `"${key}" is not a recognised configuration item.`;
        this.log.info(`Getting config item: ${key}`);
        const schemaEntry = this.schema[key];
        const required = 'required' in schemaEntry ? schemaEntry.required : false;
        const value = this.config.get(key) as ConfigEntryType<T>;
        const noValue = typeof value === 'undefined';
        const wrongType = !(schemaEntry.typecheck(value));
        if (noValue) this.log.info(`No entry found for ${key}`);
        if (wrongType) this.log.info(`Entry for ${key} has wrong type`);
        if (noValue && required === true) throw `${key} required, please add to settings`;
        if (wrongType && required === true) {
            throw `${key} must be of type ${schemaEntry.default.constructor.name}, please change the value in settings`;
        }
        if (noValue || wrongType) return schemaEntry.default as ConfigEntryType<T>;
        return value;
    }

    public addWatcher<T extends ConfigEntryKey>(key: T, cb: Function) {
        this.watchers[key].add(cb);
        return { dispose: () => this.watchers[key].delete(cb) };
    }

    dispose(): void {
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables = [];
	}
}