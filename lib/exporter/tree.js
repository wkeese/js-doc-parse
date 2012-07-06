define([ '../Module', 'dojo/_base/lang',  '../console', '../node!fs' ], function (Module, lang, console, fs) {
	/**
	 * Generates a tree.json file listing all the modules, plus any nested objects they contain.
	 */
	return function (config) {
		if (!config.file) {
			throw new Error('A config.file value must be provided for the tree exporter.');
		}

		// Get hash and also array of modules.
		var moduleHash = Module.getAll(), moduleArray = [];
		for(var k in moduleHash){
			if (moduleHash.hasOwnProperty(k)) {
				moduleArray.push(k);
			}
		}

		// Sort list of modules so Tree will show them alphabetically.
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

		// Generate hierarchy of objects, which looks like the directory structure holding the source files,
		// but with each module possibly having some children corresponding to the nested classes in that module.
		// Note that sometimes a module and a folder can have the same name (ex: dojo/date.js and dojo/date).
		// In that case the module will come first.
		var hierarchy = {
			id: "root",
			type: "folder",
			children: []
		};
		moduleArray.forEach(function(k) {
			console.log("module: " + k);
			// Generate node for this module, and any missing folder nodes
			var parent = hierarchy,
				parts = k.split("/");
			parts.forEach(function(part, idx){
				if(idx+1 < parts.length){
					// Create folder node if it doesn't exist.   (If it does exist, it will be the last child of the
					// parent, since we are going in alphabetical order.)
					var lastChild = parent.children.length && parent.children[parent.children.length-1];
					if(!lastChild || lastChild.name != part || lastChild.type != "folder"){
						parent.children.push(lastChild = {
							id: parts.slice(0, idx+1).join("/"),
							type: "folder",
							children: []
						});
					}
					parent = lastChild;
				}else{
					// Node for the module itself.

					var child = {
						id: k,
						type: moduleHash[k].value._type,
						children: []
					};

					// See if the module hash any nested objects, if so, they will be listed as children of the module.
					var module = moduleHash[k],
						properties = module.value.properties;
					for(var c in properties){
						if (properties.hasOwnProperty(c)) {
							var property = properties[c];
							if (property.type === "constructor") {
								child.children.push({
									id: k + "." + c,
									name: c,
									type: "constructor",
									children: []
								});
							}
						}
					}

					parent.children.push(child)
				}
			});
		});
		var fd = fs.openSync(config.file, 'w', parseInt('0644', 8));
		fs.writeSync(fd, JSON.stringify(hierarchy, null, "\t"), null);
		fs.closeSync(fd);

		console.status('Output written to', config.file);
	};
});
