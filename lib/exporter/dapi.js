// Code to output a JSON file listing details for each module, corresponding to the old details.xml

define([ 'dojo/string', '../Module', '../Value', '../console', 'dojo/node!fs' ],
	function (stringUtil, Module, Value, console, fs) {
	/**
	 * Takes information from metadata stored alongside a Value and adds it to the output.
	 * @param node The Object to add metadata to.
	 * @param metadata The metadata to parse.
	 */
	function mixinMetadata(/**Object*/ node, /**Object*/ metadata) {
		// Note: type was already handled

		for (var metadataName in { summary: 1, description: 1 }) {
			if (metadata.hasOwnProperty(metadataName) && metadata[metadataName]) {
				node[metadataName] = metadata[metadataName];
			}
		}

		// “deprecated” node is new vs. old php parser
		if (metadata.isDeprecated) {
			node.deprecated = metadata.isDeprecated;
		}

		// “experimental” node is new vs. old php parser
		if (metadata.isExperimental) {
			node.experimental = metadata.isExperimental;
		}

		if (metadata.examples && metadata.examples.length) {
			node.examples = metadata.examples;
		}
	}

	/**
	 * Given metadata with a type annotation, attempt to resolve the annotated type as an object and (hackily) apply
	 * information about the object’s default properties to the metadata description property.
	 */
	function processTypeAnnotation(/**Object*/ metadata) {
		if (!metadata.type || typeof metadata.type === 'string') {
			return;
		}

		var propertyTemplate = '<li>${key}${type}${summary}</li>',
			annotationObject = metadata.type,
			additionalDescription = '';

		if (annotationObject.relatedModule) {
			metadata.type = annotationObject.relatedModule.id;
			return;
		}

		metadata.type = 'Object';
		additionalDescription += '<p>' + (metadata.description ?
			'The following properties are supported:' :
			'An object with the following properties:') + '</p><ul>';

		(function readProperties(object) {
			var propertyMetadata,
				properties = object.properties,
				k;

			// if the annotationObject is a function, we don't want to pick up any properties apart
			// from what's on the prototype.
			if (object.type === 'function') {
				if (_hasOwnProperty.call(properties, 'prototype')) {
					readProperties(properties.prototype);
				}
				return;
			}

			for (k in properties) {
				if (_hasOwnProperty.call(properties, k)) {
					// Type descriptor could be a plain JS object, or could be a constructor. It is often the
					// latter.
					if (k === 'prototype') {
						readProperties(properties[k]);
					}
					// Filter out built-ins and constructor properties which come from dojo/_base/declare
					else if (k !== 'constructor' && properties[k].file) {
						propertyMetadata = properties[k].metadata;
						additionalDescription += stringUtil.substitute(propertyTemplate, {
							key: k,
							type: propertyMetadata.type ? ' (' + propertyMetadata.type + (propertyMetadata.isOptional ? ', optional' : '') + ')' : '',
							summary: propertyMetadata.summary ? ': ' + propertyMetadata.summary : ''
						});
					}
				}
			}
		}(annotationObject));

		metadata.description = (metadata.description || '') + additionalDescription + '</ul>';
	}

	/**
	 * Takes an array of return Values and processes it for return types, discarding all
	 * duplicates, and returns the resulting list of return types.
	 * @param returns An array of Values to be processed as return values.
	 */
	function processReturns(/**Array*/ returns) {
		var returnTypes = {}, types = [];

		for (var i = 0, returnValue; (returnValue = returns[i]); ++i) {
			returnTypes[returnValue.metadata.type || returnValue.type || 'any'] = 1;
		}

		for (var k in returnTypes) {
			if (returnTypes.hasOwnProperty(k)) {
				types.push(k);
			}
		}

		return types;
	}

	// Regex to split a sequence of types like String|Boolean into an array.  This should really be in dojodoc parser
	// rather than here.
	var typeSplitRegex = / *\|+ */;

	/**
	 * Processes the parameters and return values for a function property.
	 * @param propertyNode The Object to add parameters and returns to.
	 * @param property The Value to be processed as a function.
	 */
	function processFunction(/**Object*/ propertyNode, /**Object*/ property) {

		propertyNode.parameters = property.parameters.map(function(parameter){
			if (typeof parameter.metadata.type !== 'string') {
				processTypeAnnotation(parameter.metadata);
			}
			var parameterType = parameter.metadata.type || parameter.type || 'unknown';
			var parameterNode = {
				name: parameter.name,
				types: parameterType.split(typeSplitRegex),
				usage: parameter.metadata.isOptional ? 'optional' : 'required'
			};

			for (var metadataName in { summary: 1, description: 1 }) {
				if (parameter.metadata.hasOwnProperty(metadataName) && parameter.metadata[metadataName]) {
					parameterNode[metadataName] = parameter.metadata[metadataName];
				}
			}

			return parameterNode;
		});

		propertyNode.returnTypes = processReturns(property.returns);

		for (i = 0; (returnValue = property.returns[i]); ++i) {
			if (returnValue.metadata.summary) {
				propertyNode.returnDescription = returnValue.metadata.summary;
				break;
			}
		}
	}

	/**
	 * Reads a list of Value properties and creates an appropriate Object for the data.
	 * @param scope The scope annotation for the output property, either "prototype" or "normal".
	 * @param propertiesNode The Array to add properties to.
	 * @param methodsNode The Array to add methods to.
	 * @param eventsNode The Array to add events to.
	 * @param properties The properties object.
	 * @param pulledIn Hash of ids of modules that are pulled in by this module
	 */
	function readProperties(/**string*/ scope, /**Array*/ propertiesNode, /**Array*/ methodsNode, /**Array*/ eventsNode,
							/**Object*/ properties, /**Object*/ pulledIn) {
		var property,
			propertyNode;

		function makePropertyObject(name, value) {
			if (typeof value.metadata.type !== 'string') {
				processTypeAnnotation(value.metadata);
			}
			var object = {
				name: name,
				scope: scope,
				types: (value.metadata.type || value.type || 'unknown').split(typeSplitRegex),
				// “from” attribute is new vs. old php parser
				from: value.file.moduleId
			};

			if (value.metadata.tags.indexOf('private') > -1 || /^_/.test(name)) {
				object.private = true;
			}
			if (value.metadata.tags && value.metadata.tags.length) {
				object.tags = value.metadata.tags.sort();
			}

			if(!pulledIn[value.file.moduleId]){
				// App needs to manually require value.file.moduleId to use this property
				object["extensionModule"] = true;
			}

			return object;
		}

		for (var k in properties) {
			if (k === 'prototype' && _hasOwnProperty.call(properties, k)) {
				if (properties.prototype.properties === properties) {
					throw new Error('BUG: Infinite prototype loop!');
					continue;
				}

				readProperties('prototype', propertiesNode, methodsNode, eventsNode, properties[k].properties, pulledIn);
			}
			else if (_hasOwnProperty.call(properties, k)) {
				property = properties[k];

				// Filter out built-ins (Object.prototype, etc.)
				if (!property.file) {
					continue;
				}

				// TODO: special handling for constructors (type === "constructor"), which get their own <object> nodes
				// and hence their own pages
				if (property.type in Value.METHOD_TYPES) {
					propertyNode = makePropertyObject(k, property);
					processFunction(propertyNode, property);
					if(/^_?on[A-Z]/.test(k)){
						eventsNode.push(propertyNode);
					}else{
						methodsNode.push(propertyNode);
					}
				}
				else {
					propertyNode = makePropertyObject(k, property);
					propertiesNode.push(propertyNode);
				}

				mixinMetadata(propertyNode, property.metadata);
			}
		}

		// Alphabetize the lists (so they show up in the viewer as we want)
		function cmp(a, b){
			a = a.name.toLowerCase();
			b = b.name.toLowerCase();
			if(a > b)
				return 1;
			if(a < b)
				return -1;
			return 0;
		}
		propertiesNode.sort(cmp);
		methodsNode.sort(cmp);
		eventsNode.sort(cmp);
	}

	var _hasOwnProperty = Object.prototype.hasOwnProperty;

	/**
	 * Calculate all the modules guaranteed available if the specified module is loaded.
	 * @param file
	 */
	function computedPulledIn(/**string*/ id, /**Module[]*/ parsedModules, /*Object*/ hash)
	{
		hash = hash || {};
		hash[id] = true;
		parsedModules[id].dependencies.forEach(function(dependency){
			if(!hash[dependency.id]){
				computedPulledIn(dependency.id, parsedModules, hash);
			}
		});
		return hash;
	}

	/**
	 * Generates a details.json file which is used by the API browser.
	 */
	function generateDetails(file){
		/**
		 * Parses a code module, or a class within a module, into an Object.
		 */
		function parseObject(value, id, pulledIn){
			var moduleNode = {
				location: id
			};

			if (value.type) {
				moduleNode.type = value.type;
			}

			// Once upon a time, the parser was an instance of an anonymous function;
			// this pattern might be reproduced elsewhere, so it is handled here
			if (value.type === Value.TYPE_INSTANCE && !value.value.relatedModule) {
				value = value.value;
			}

			if (value.metadata.classlike) {
				moduleNode.classlike = true;

				if (value.mixins.length) {
					moduleNode.superclass = value.mixins[0].id;
					moduleNode.mixins = value.mixins.map(function(mixin){ return mixin.id; });
				}

				var prototype = value;
				while ((prototype = prototype.getProperty('prototype')) && prototype.type !== Value.TYPE_UNDEFINED) {
					if (prototype.getProperty('constructor')) {
						processFunction(moduleNode, prototype.getProperty('constructor'));
						break;
					}
				}
			}
			else if (value.type in Value.METHOD_TYPES) {
				processFunction(moduleNode, value);
			}

			mixinMetadata(moduleNode, value.metadata);

			// dojo/_base/declare’d objects using dojodoc end up with their standard metadata on the prototype object
			// instead of on the value itself
			if (value.metadata.classlike) {
				mixinMetadata(moduleNode, value.getProperty('prototype').metadata);
			}

			var	propertiesNode = [],
				methodsNode = [],
				eventsNode = [];
			readProperties('normal', propertiesNode, methodsNode, eventsNode, value.properties, pulledIn);
			if(propertiesNode.length){
				moduleNode.properties = propertiesNode;
			}
			if(methodsNode.length){
				moduleNode.methods = methodsNode;
			}
			if(eventsNode.length){
				moduleNode.events = eventsNode;
			}

			return moduleNode;
		}

		var parsedModules = Module.getAll();

		var details = {};

		for (var k in parsedModules) {
			if (parsedModules.hasOwnProperty(k)) {
				console.status('Exporting', k);

				var module = parsedModules[k];
				var pulledIn = computedPulledIn(k, parsedModules);

				details[module.id] = parseObject(module.value, module.id, pulledIn);

				// If the module contains nested classes (ex: dijit/Tree.TreeNode) or objects,
				// output them as though they were separate modules
				var properties = module.value.properties;
				for(var c in properties){
					if (_hasOwnProperty.call(properties, c)) {
						var property = properties[c];

						// List nested classes or nested objects as separate page.
						if (c !== "prototype" && (property.type === "constructor" || property.type === "object")) {
							var id = k + "." + c;
							details[id] = parseObject(property, id, pulledIn);
							property._separatePage = true;	// used by tree.js
						}
					}
				}
			}
		}

		var fd = fs.openSync(file, 'w', parseInt('0644', 8));
		fs.writeSync(fd, JSON.stringify(details, null, "\t"), null);
		fs.closeSync(fd);


		console.status('Output written to', file);
	}

	return function (config) {
		if (!config.details) {
			throw new Error('A config.details value must be provided for the details exporter.');
		}
		generateDetails(config.details);
	};
});