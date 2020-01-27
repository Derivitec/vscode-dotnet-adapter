
	// private WSWatcher: vscode.FileSystemWatcher | undefined;

    // private FileWatcher = new Map<string, fs.FSWatcher>();
    
    




	/* node id should be unique */




	// private addwatcher(watcher: vscode.FileSystemWatcher) {
	// 	watcher.onDidChange((file) => {
	// 		//this.log.info('Module changed ' + file.fsPath);
	// 		//this.load(file.fsPath);
	// 		this.filechange(file.fsPath, '');
	// 	});
	// 	watcher.onDidCreate((file) => {
	// 		this.filechange(file.fsPath, '');
	// 	});
	// 	watcher.onDidDelete((file) => {
	// 		this.filechange(file.fsPath, '');
	// 	});
	// 	return watcher;
	// }

	// private filechange(fn: string, jname: string) {
	// 	var ext = fn.substr(fn.lastIndexOf('.') + 1);
	// 	if (ext != 'dll')
	// 		return;

	// 	let f = this.Winfile(path.join(jname, fn));
	// 	if (this.Loadingtest == undefined && this.Runningtest == undefined) {
	// 		this.log.info('file Changed ' + f);
	// 		this.load(f);
	// 	}
	// }

	// private SetupFileWatchers(files: string[]) {
	// 	for (var fw of this.FileWatcher) {
	// 		fw[1].close();
	// 	}
	// 	this.FileWatcher.clear();
	// 	for (var file of files) {
	// 		var paths = path.resolve(this.workspace.uri.fsPath, file);
	// 		if (!fs.existsSync(paths))
	// 			continue;
	// 		this.createwatch(paths);
	// 	}
	// }

	// private createwatch(paths: string) {
	// 	let w: fs.FSWatcher;
	// 	let jname: string;
	// 	if (fs.lstatSync(paths).isDirectory()) {
	// 		jname = paths;
	// 	} else {
	// 		jname = path.dirname(paths);
	// 	}
	// 	w = fs.watch(paths, (event, filename) => {
	// 		this.filechange(filename, jname);
	// 	});

	// 	this.FileWatcher.set(paths, w);
	// }
