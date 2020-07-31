# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 2020-07-31
### Added
- `searchpatterns` now additionally accepts an object to allow test grouping. Check the updated README for usage information. [(#31)](https://github.com/Derivitec/vscode-dotnet-adapter/pull/31)

### Fixed
- State management is not updated correctly when a test run is cancelled [(#30)](https://github.com/Derivitec/vscode-dotnet-adapter/issues/30)

### Changed
- File watchers are now aligned with the search performed in the initial discovery phase

## [1.3.3] - 2020-05-21
### Fixed
- Test commands were run without the local environment (including PATH). This caused issues using the adapter locally in macOS.

## [1.3.2] - 2020-03-17
### Fixed
- `attachCpp` logic was incorrect

## [1.3.1] - 2020-03-17
### Changed
- `attachCpp` setting now flips between attaching a C# debugger or C++ debugger

## [1.3.0] - 2020-03-17
### Added
- It's now possible to debug from C# to C++ during test debugging
- New setting, `attachCpp`, will enable C# to C++ debugging

## [1.2.0] - 2020-02-19
### Added
- Collect and report various errors encountered during discovery in a non-noisy way
- Report various error encountered during file watcher update
- Reporting file search and test loading separately during load operation
- Detecting errors encountered by `vstest` during discovery
- Detecting suites without test methods as a discovery error

### Changed
- Pipe `vstest` output to ".Net Core Test Output" pane during discovery
- Use VSCode `workspace.fs` API for performant, compatible file operations

### Fixed
- Loaded counts are reset prior to each load
- Previously reloading or updating (via file watchers) the suite was additive causing duplicate tests to appear. New suites replace old ones where the suite id matches
- Loaded count summarisation didn't correctly construct sentences when some counts were zero

[More detail about this release](https://github.com/Derivitec/vscode-dotnet-adapter/pull/19)

## [1.1.0] - 2020-02-18
### Added
- CodeLens integration can be disabled via a new `codeLens` setting. You'll need to reload the project for this to take effect

### Changed
- The `skippatterns` array setting has changed to a string based `skippattern` setting. This is due to the glob optimising issue mentioned in "Fixed".

### Fixed
- The adapter would previously attempt to optimise test discovery by combining glob patterns in the `searchpatterns` and `skippatterns` settings. This was done using the group condition syntax (i.e. `{a,b}`). When one of the provided glob patterns also used the group condition syntax, VSCode would throw an unreported error as it does not allow nested group conditions. We no longer apply this optimisation to `skippatterns` (which is why this is now a single string; see "Changed") and only apply the optimisation to `searchpatterns` where the syntax isn't used.

[More detail about this release](https://github.com/Derivitec/vscode-dotnet-adapter/pull/16)

## [1.0.1] - 2020-02-17
### Fixed
- Bumped patch and rebuilt due to case sensitivity issue that built mismatching files

## [1.0.0] - 2020-02-14
### Added
- Initial published release

## [0.8] - 2020-01-27
### Added
 - Initial release.

