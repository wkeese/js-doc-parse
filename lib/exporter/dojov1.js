define([
	'dojo/string',
	'../Module',
	'../Value',
	'./util',
	'../console',
	'dojo/node!fs',
], function (stringUtil, Module, Value, util, console, fs) {

	/**
	 * Takes information from metadata stored alongside a Value and adds it to the output.
	 * @param node The node to add metadata to.
	 * @param metadata The metadata to parse.
	 */
	function mixinMetadata(/**XmlNode*/ node, /**Object*/ metadata) {
		if (metadata.type) {
			node.attributes.type = metadata.type;
		}

		for (var metadataName in { summary: 1, description: 1 }) {
			if (metadata.hasOwnProperty(metadataName) && metadata[metadataName]) {
				node.createNode(metadataName).childNodes.push(metadata[metadataName]);
			}
		}

		// “deprecated” node is new vs. old php parser
		if (metadata.isDeprecated) {
			node.createNode('deprecated').childNodes.push(metadata.isDeprecated);
		}

		// “experimental” node is new vs. old php parser
		if (metadata.isExperimental) {
			node.createNode('experimental').childNodes.push(metadata.isExperimental);
		}

		if (metadata.examples && metadata.examples.length) {
			var examplesNode = node.createNode('examples');

			for (var i = 0, j = metadata.examples.length; i < j; ++i) {
				examplesNode.createNode('example').childNodes.push(metadata.examples[i]);
			}
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
	 * duplicates, and applies the resulting list of properties to the node given in returnsNode.
	 * @param returnsNode The XML node to add return types to.
	 * @param returns An array of Values to be processed as return values.
	 */
	function processReturns(/**XmlNode*/ returnsNode, /**Array*/ returns) {
		var returnTypes = {};

		for (var i = 0, returnValue; (returnValue = returns[i]); ++i) {
			returnTypes[returnValue.metadata.type || returnValue.type || 'any'] = 1;
		}

		for (var k in returnTypes) {
			if (returnTypes.hasOwnProperty(k)) {
				returnsNode.createNode('return-type', { type: k });
			}
		}
	}

	/**
	 * Processes the parameters and return values for a function property.
	 * @param propertyNode The XML node to add parameters and returns to.
	 * @param property The Value to be processed as a function.
	 */
	function processFunction(/**XmlNode*/ propertyNode, /**Object*/ property) {
		var parametersNode = propertyNode.createNode('parameters'),
			parameterNode,
			parameterType,
			parameter,
			i;

		for (i = 0; (parameter = property.parameters[i]); ++i) {
			if (typeof parameter.metadata.type !== 'string') {
				processTypeAnnotation(parameter.metadata);
			}
			parameterType = parameter.metadata.type || parameter.type || 'unknown';
			parameterNode = parametersNode.createNode('parameter', {
				name: parameter.name,
				type: parameterType,
				usage: parameter.metadata.isOptional ? 'optional' : 'required'
			});

			for (var metadataName in { summary: 1, description: 1 }) {
				if (parameter.metadata.hasOwnProperty(metadataName) && parameter.metadata[metadataName]) {
					parameterNode.createNode(metadataName).childNodes.push(parameter.metadata[metadataName]);
				}
			}
		}

		var returnsNode = propertyNode.createNode('return-types'),
			returnValue;

		processReturns(returnsNode, property.returns);

		for (i = 0; (returnValue = property.returns[i]); ++i) {
			if (returnValue.metadata.summary) {
				propertyNode.createNode('return-description').childNodes.push(returnValue.metadata.summary);
				break;
			}
		}
	}

	/**
	 * Reads a list of Value properties and creates an appropriate XML structure for the data.
	 * @param scope The scope annotation for the output property, either "prototype" or "normal".
	 * @param propertiesNode The XML node to add new property nodes to.
	 * @param properties The properties object.
	 */
	function readProperties(/**string*/ scope, /**XmlNode*/ propertiesNode, /**XmlNode*/ methodsNode, /**Object*/ properties) {
		var property,
			propertyNode;

		function makePropertyObject(name, value) {
			if (typeof value.metadata.type !== 'string') {
				processTypeAnnotation(value.metadata);
			}
			var object = {
				name: name,
				scope: scope,
				type: value.metadata.type || value.type || 'unknown',
				// “from” attribute is new vs. old php parser
				from: value.file.moduleId
			};

			if (value.metadata.tags.indexOf('private') > -1) {
				object["private"] = "true";
			}

			return object;
		}

		for (var k in properties) {
			if (k === 'prototype' && _hasOwnProperty.call(properties, k)) {
				if (properties.prototype.properties === properties) {
					throw new Error('BUG: Infinite prototype loop!');
					continue;
				}

				readProperties('prototype', propertiesNode, methodsNode, properties[k].properties);
			}
			else if (_hasOwnProperty.call(properties, k)) {
				property = properties[k];

				// Filter out built-ins (Object.prototype, etc.)
				if (!property.file) {
					continue;
				}

				if (property.type in Value.METHOD_TYPES) {
					propertyNode = methodsNode.createNode('method', makePropertyObject(k, property));
					processFunction(propertyNode, property);
				}
				else {
					propertyNode = propertiesNode.createNode('property', makePropertyObject(k, property));
				}

				mixinMetadata(propertyNode, property.metadata);
			}
		}
	}

	var _hasOwnProperty = Object.prototype.hasOwnProperty,
		XmlNode = util.XmlNode;

	/**
	 * Generates an details.xml-compatible file which is used by the API browser.
	 */
	return function (config) {
		if (!config.file) {
			throw new Error('A config.file value must be provided for the dojov1 exporter.');
		}

		var fd = fs.openSync(config.file, 'w', parseInt('0644', 8));

		// “version” attribute is new vs. old php parser
		// TODO: Calling fs.writeSync(fd) feels wrong. Is there no fd.writeSync?
		fs.writeSync(fd, '<javascript version="1">', null);

		/**
		 * Parses a code module into an XmlNode.
		 */
		function parseModule(/**Module*/ module) {
			var value = module.value,
				moduleNode = new XmlNode('object', { location: module.id }),
				propertiesNode = moduleNode.createNode('properties'),
				methodsNode = moduleNode.createNode('methods');

			if (value.type) {
				moduleNode.attributes.type = value.type;
			}

			// Once upon a time, the parser was an instance of an anonymous function;
			// this pattern might be reproduced elsewhere, so it is handled here
			if (value.type === Value.TYPE_INSTANCE && !value.value.relatedModule) {
				value = value.value;
			}

			if (value.metadata.classlike) {
				moduleNode.attributes.classlike = 'true';

				if (value.mixins.length) {
					moduleNode.attributes.superclass = value.mixins[0].id;

					var mixinsNode = moduleNode.createNode('mixins'),
						mixin;
					for (var i = 0; (mixin = value.mixins[i]); ++i) {
						mixinsNode.createNode('mixin', { location: mixin.id });
					}
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

			readProperties('normal', propertiesNode, methodsNode, value.properties);

			return moduleNode;
		}

		var parsedModules = Module.getAll();

		for (var k in parsedModules) {
			if (parsedModules.hasOwnProperty(k)) {
				console.status('Exporting', k);
				fs.writeSync(fd, parseModule(parsedModules[k]).toString(), null);
			}
		}

		fs.writeSync(fd, '</javascript>', null);
		fs.closeSync(fd);

		console.status('Output written to', config.file);
	};
});