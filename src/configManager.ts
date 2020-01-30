import * as vscode from 'vscode';
import { Log } from 'vscode-test-adapter-util';
import { createConfigItem as c } from './utilities';

const schema = {
    logpanel: c<boolean>({ default: false }),
    runEnvVars: c<object>({ default: {} }),
    searchpatterns: c<string[]>({ default: [], required: true, typecheck: Array.isArray }),
    skippattern: c<string>({ default: '' }),
};

type ConfigSchema = typeof schema;

type ConfigEntryKey = keyof ConfigSchema;

type ConfigEntryType<T extends ConfigEntryKey> = ConfigSchema[T] extends ConfigEntry<infer U> ? U : any;

export class ConfigManager {
    private config: vscode.WorkspaceConfiguration;

    private schema = schema;

    constructor(
        private readonly workspace: vscode.WorkspaceFolder,
		private readonly log: Log,
	){
        this.config = vscode.workspace.getConfiguration('dotnetCoreExplorer', this.workspace.uri);
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
}