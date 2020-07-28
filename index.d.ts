// Type definitions for vscode-dotnet-adapter 0.8.0
// Project: vscode-dotnet-adapter
// Definitions by: Andrew Bridge <https://github.com/andrewbridge>

type TestSuiteInfo = import('vscode-test-adapter-api').TestSuiteInfo;
type TestInfo = import('vscode-test-adapter-api').TestInfo;
type TestSuiteEvent = import('vscode-test-adapter-api').TestSuiteEvent;
type TestEvent = import('vscode-test-adapter-api').TestEvent;
type VSCodeUri = import('vscode').Uri;

type UngroupedSearchPatterns = string | string[];
type GroupedSearchPatterns = { [key: string]: UngroupedSearchPatterns };
type SearchPatterns = UngroupedSearchPatterns | GroupedSearchPatterns;

interface DerivitecTestSuiteInfo extends TestSuiteInfo {
    children: (DerivitecTestSuiteInfo | DerivitecTestInfo)[];
    parent: DerivitecTestSuiteInfo | null;
    sourceDll: VSCodeUri | 'root';
}

interface DerivitecTestInfo extends TestInfo {
    parent: DerivitecTestSuiteInfo | null;
    sourceDll: VSCodeUri;
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