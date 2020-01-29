import * as vscode from 'vscode';
import { Log } from 'vscode-test-adapter-util';

export class ConfigManager {
    private config: vscode.WorkspaceConfiguration;

    constructor(
        private readonly workspace: vscode.WorkspaceFolder,
		private readonly log: Log,
	){
        this.config = vscode.workspace.getConfiguration('dotnetCoreExplorer', this.workspace.uri);
    }

    public SearchPatterns(): string[] {
        const searchPatterns = this.GetConfig<string[]>('searchpatterns');
        if(!searchPatterns) throw 'search glob required, please add to settings';
        return searchPatterns
    }

    public RunEnvVars(): { [key: string]: string } {
        const envVars = this.GetConfig<{ [key: string]: string }>('runEnvVars');
        if (!envVars) return {};
        return envVars;
    }

    private GetConfig<T>(para: string): T | undefined {
        this.log.info(`Getting config item: ${para}`)
        let configResult;
        try {
            configResult = this.config.get<T>(para);
        } catch (error) {
            this.log.error(error);
        }

		return configResult;
	}
}