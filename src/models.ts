import {
    TestSuiteInfo,
    TestSuiteEvent,
    TestInfo,
    TestEvent
} from 'vscode-test-adapter-api';

export interface DerivitecTestSuiteInfo extends TestSuiteInfo {
    sourceDll: string;
}

export interface DerivitecTestInfo extends TestInfo {
    sourceDll: string;
}

export interface DerivitecSuiteContext {
    node: DerivitecTestSuiteInfo ;
    event?: TestSuiteEvent
}

export interface DerivitecTestContext {
    node: DerivitecTestInfo;
    event?: TestEvent
}