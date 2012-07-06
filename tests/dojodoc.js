define([ 'dojo/_base/declare', 'dojo/Stateful' ], function (declare, Stateful) {
	var Internal = declare(Stateful, {
		//	summary:
		//		A sample constructor that is not publicly exposed.
		//	description:
		//		This also features a _description_, which is made out of *Markdown*.
		//
		//		- first list item
		//		- second list item
		//			- nested list item one
		//			- nested list item two
		//		- third list item
		//
		//		Code example:
		// |	var foo = 3;
		// |	var bar = 5;
		//
		//		And another paragraph.
		//	foo: foo-type?
		//		A property that only exists in your mind.
	});

	var External = declare(Internal, {
		//	summary:
		//		A sample declare module.
		//
		//		- hello
		//		- world
		//			- world 1
		//			- world 2
		//		- goodbye

		//	obj: Object?
		//		An optional object with an explicit type.
		obj: null,

		//	arr: Array
		arr: [],

		//	bool:
		//		A boolean with no explicit type.
		bool: false,

		fn: function (/**a-type*/ a, /**b-type?*/ b, c) {
			//	summary:
			//		A function
			//	a:
			//		String type in parameters.
			//	b:
			//		Optional string type in parameters.
			//	c: c-type
			//		Boolean type in comment.

			return a + // return-type
				b;
		}
	});

	External.fn2 = function () {
		//	summary:
		//		A static function.
		//	returns: another-return-type
		//		This one has the return type specified in the comment
	};

	return External;
});