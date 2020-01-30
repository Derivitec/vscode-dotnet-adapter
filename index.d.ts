// Type definitions for vscode-dotnet-adapter 0.8.0
// Project: vscode-dotnet-adapter
// Definitions by: Andrew Bridge <https://github.com/andrewbridge>

type TestSuiteInfo = import('vscode-test-adapter-api').TestSuiteInfo;
type TestInfo = import('vscode-test-adapter-api').TestInfo;
type TestSuiteEvent = import('vscode-test-adapter-api').TestSuiteEvent;
type TestEvent = import('vscode-test-adapter-api').TestEvent;

interface DerivitecTestSuiteInfo extends TestSuiteInfo {
    sourceDll: string;
}

interface DerivitecTestInfo extends TestInfo {
    sourceDll: string;
}

interface DerivitecSuiteContext {
    node: DerivitecTestSuiteInfo ;
    event?: TestSuiteEvent
}

interface DerivitecTestContext {
    node: DerivitecTestInfo;
    event?: TestEvent
}

type Partial<T> = {
    [P in keyof T]?: T[P];
}

interface ConfigEntry<T> {
    default: T,
    typecheck: (data: any) => boolean,
    required?: boolean
}