define([ '../Module', 'dojo/_base/lang',  '../console', '../node!fs' ], function (Module, lang, console, fs) {
	/**
	 * Generates a tree.json file listing all the modules in a tree structure, ex:
	 * {
	 *     dijit: {
	 *         form: {
	 *             Button: "dijit/form/Button"
	 *             ...
	 */
	return function (config) {
		if (!config.file) {
			throw new Error('A config.file value must be provided for the tree exporter.');
		}

		// Sort list of modules so Tree will show them alphabetically
		var moduleHash = Module.getAll(), moduleArray = [];
		for(var k in moduleHash){
			if (moduleHash.hasOwnProperty(k)) {
				moduleArray.push(k);
			}
		}
		moduleArray.sort(function(a, b)
		{
			a = a.toLowerCase();
			b = b.toLowerCase();
			if(a > b)
				return 1;
			if(a < b)
				return -1;
			return 0;
		});

		// Generate hierarchy of nested objects, corresponding to each node in the tree, and add metadata for objects
		// that correspond to modules.   Note that some objects like "dojox" don't have a corresponding module, and some
		// objects like dojox/color have a corresponding module but also have children
		var hierarchy = {
			__name: "root",
			__type: "namespace"
		};
		moduleArray.forEach(function(k) {
			// Generate node for this module, and any missing parent nodes
			var parent = hierarchy,
				parts = k.split("/");
			parts.forEach(function(part, idx, ary){
				if(!parent[part]){
					parent[part] =  {
						__id: parts.slice(0, idx+1).join("/"),
						__name: part,
						__type: idx+1 < parts.length ? "namespace" : moduleHash[k].value._type
					};
				}
				parent = parent[part];
			});
		});

		var fd = fs.openSync(config.file, 'w', parseInt('0644', 8));
		fs.writeSync(fd, JSON.stringify(hierarchy, null, "\t"), null);
		fs.closeSync(fd);

		console.status('Output written to', config.file);
	};
});
