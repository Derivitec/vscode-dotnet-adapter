# .Net Core Test Explorer for Visual Studio Code

Run your .Net Core tests using the
[Test Explorer UI](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer).

<!--- add gif --->

## Features

* Shows a Test Explorer in the Test view in VS Code's sidebar with all detected tests and suites and their state
* Adds CodeLenses to your test files for starting and debugging tests
* Adds Gutter decorations to your test files showing the tests' state
* Adds line decorations to the source line where a test failed
* Shows a failed test's log when the test is selected in the explorer
* Lets you choose test suites that should be run automatically after each assembly change

## Getting started

* Install the extension and restart VS Code
* Set test console runner path (see Configuration options table below).
* Build your C# Test project
* Open the Test view
* Run / Debug your tests using the icons in the Test Explorer or the CodeLenses in your test file

## Configuration

### Options

Property                            | Description
------------------------------------|---------------------------------------------------------------
`dotnetCoreExplorer.searchpatterns` | A string, array or object of search patterns which match your test files (relative to the workspace folder).<br><br>Arrays can be used to specify multiple differing patterns.<br>Objects can be used to provide test grouping, where the key is the group name and the value is either a glob pattern string or an array of glob pattern strings (see [#31](https://github.com/Derivitec/vscode-dotnet-adapter/pull/31) for more detail). (default: `"**/bin/**/*.{dll,exe}"`)
`dotnetCoreExplorer.skippattern`    | Assemblies to skip from searching for tests. (default: `"**/{nunit,xunit}.*.dll"`, i.e.: exclude any files starting with nunit.\*.dll or xunit.\*.dll)<br><br>Files already excluded by the `files.exclude` or `search.exclude` VSCode settings will also be skipped by the test adapter (ensure you can see dll files in the file explorer)
`dotnetCoreExplorer.runEnvVars`     | Additional environment variables that your project needs present while running tests (default: `{}`)
`dotnetCoreExplorer.codeLens`       | Enable CodeLens symbol integration with the [C# Omnisharp VSCode extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode.csharp) (default: `true`)



## Troubleshooting
If the Test view doesn't show your tests or anything else doesn't work as expected, you can check any error messages from the runner in `NXunit Test` output channel. Also you can turn on diagnostic logging using  the following configuration options
(note: in multi-root workspaces, these options are always taken from the first workspace folder):
* `dotnetCoreExplorer.logpanel`: Write diagnotic logs to an output panel

If you think you've found a bug, please [file a bug report](https://github.com/Derivitec/vscode-dotnet-adapter/issues).
