define([ '../Module', '../Value', './util', '../console', '../node!fs' ], function (Module, Value, util, console, fs) {
	/**
	 * Generates a tree.json file which lists all the objects output by generateDetails(), in a tree format.
	 * Depends on dapi.js being run first, in order to set the _separatePage flag on properties that
	 * have their own output page.
	 */
	function generateTree(jsonFile, htmlFile){
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
			// Generate node for this module, and any missing folder nodes
			var parent = hierarchy,
				parts = k.split("/");
			parts.forEach(function(part, idx){
				if(idx+1 < parts.length){
					// Create folder node if it doesn't exist.   (If it does exist, it will be the last child of the
					// parent, since we are going in alphabetical order.)
					var id = parts.slice(0, idx+1).join("/"),
						lastChild = parent.children.length && parent.children[parent.children.length-1];
					if(!lastChild || lastChild.fullname != id || lastChild.type != "folder"){
						parent.children.push(lastChild = {
							id: id + "/",		// differentiate modules, ex: dojo/date.js, from dirs, ex: dojo/date/
							name: part,
							fullname: id,
							type: "folder",
							children: []
						});
					}
					parent = lastChild;
				}else{
					// Node for the module itself.
					var child = {
						id: k,
						name: part,
						fullname: k,
						type: moduleHash[k].value._type
					};

					// See if the module has any nested objects, if so, they will be listed as children of the module.
					var children = [],
						module = moduleHash[k],
						properties = module.value.properties;
					for(var c in properties){
						if (properties.hasOwnProperty(c)) {
							var property = properties[c];
							if (property._separatePage) {
								children.push({
									id: k + "." + c,
									name: c,
									fullname: k + "." + c,
									type: property.type,
									children: []
								});
							}
						}
					}
					if(children.length){
						children.sort(function(a, b){
							a = a.id.toLowerCase();
							b = b.id.toLowerCase();
							if(a > b)
								return 1;
							if(a < b)
								return -1;
							return 0;
						});
						child.children = children;
					}

					parent.children.push(child)
				}
			});
		});

		// Output JSON representation of tree
		var fd = fs.openSync(jsonFile, 'w', parseInt('0644', 8));
		fs.writeSync(fd, JSON.stringify(hierarchy, null, "\t"), null);
		fs.closeSync(fd);
		console.status('Output written to', jsonFile);

		// Output HTML representation of tree
		function ul(obj, indent){
			return indent + "<ul>\n" +
			obj.children.map(function(child){
				return  indent + "\t<li>" +
					(child.type == "folder" ? child.name :
					"<a href='" + child.fullname.replace(".", "#") + "'>" + child.name + "</a>") +
					(child.children ? ul(child, indent + "\t") : "") +
					"</li>";
			}).join("\n") +
			"</ul>\n";
		}
		var fd = fs.openSync(htmlFile, 'w', parseInt('0644', 8));
		fs.writeSync(fd, ul(hierarchy, ""), null);
		fs.closeSync(fd);
		console.status('Output written to', htmlFile);
	}

	return function (config) {
		if (!config.tree) {
			throw new Error('A config.tree and config.htmlTree value must be provided for the tree exporter.');
		}
		generateTree(config.tree, config.htmlTree);
	};
});
