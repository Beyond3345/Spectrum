var re = {};
import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import * as __module_re__ from './re.js';
__nest__ (re, '', __module_re__);
var __name__ = 're.translate';
export var VERBOSE = false;
export var MAX_SHIFTREDUCE_LOOPS = 1000;
export var stringFlags = 'aiLmsux';
export var Group =  __class__ ('Group', [object], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, start, end, klass) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'start': var start = __allkwargs0__ [__attrib0__]; break;
						case 'end': var end = __allkwargs0__ [__attrib0__]; break;
						case 'klass': var klass = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		self.start = start;
		self.end = end;
		self.klass = klass;
	});},
	get __repr__ () {return __get__ (this, function (self) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return __call__ (str, null, tuple ([self.start, self.end, self.klass]));
	});}
});
export var generateGroupSpans = function (tokens) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'tokens': var tokens = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var groupInfo = [];
	var idx = 0;
	var __iterable0__ = tokens;
	for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
		var token = __getitem__ (__iterable0__, __index0__);
		if (__t__ ((function () {
			var __accu0__ = token.py_name;
			return __call__ (__accu0__.startswith, __accu0__, '(');
		}) ())) {
			(function () {
				var __accu0__ = groupInfo;
				return __call__ (__accu0__.append, __accu0__, __call__ (Group, null, idx, null, token.py_name));
			}) ();
		}
		else if (__t__ (__eq__ (token.py_name, ')'))) {
			var __iterable1__ = __call__ (py_reversed, null, groupInfo);
			for (var __index1__ = 0; __index1__ < len (__iterable1__); __index1__++) {
				var group = __getitem__ (__iterable1__, __index1__);
				if (__t__ (group.end === null)) {
					group.end = idx;
				}
			}
		}
		var idx = __call__ (__iadd__, null, idx, 1);
	}
	return groupInfo;
};
export var countCaptureGroups = function (tokens) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'tokens': var tokens = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var groupInfo = __call__ (generateGroupSpans, null, tokens);
	var count = 0;
	var __iterable0__ = tokens;
	for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
		var token = __getitem__ (__iterable0__, __index0__);
		if (__t__ (__eq__ (token.py_name, '('))) {
			var count = __call__ (__iadd__, null, count, 1);
		}
	}
	return count;
};
export var getCaptureGroup = function (groupInfo, namedGroups, groupRef) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'groupInfo': var groupInfo = __allkwargs0__ [__attrib0__]; break;
					case 'namedGroups': var namedGroups = __allkwargs0__ [__attrib0__]; break;
					case 'groupRef': var groupRef = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	try {
		var id = __call__ (int, null, groupRef);
	}
	catch (__except0__) {
		var id = __getitem__ (namedGroups, groupRef);
	}
	var search = 0;
	var __iterable0__ = groupInfo;
	for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
		var group = __getitem__ (__iterable0__, __index0__);
		if (__t__ (__eq__ (group.klass, '('))) {
			var search = __call__ (__iadd__, null, search, 1);
			if (__t__ (__eq__ (search, id))) {
				return group;
			}
		}
	}
};
export var splitIfElse = function (tokens, namedGroups) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'tokens': var tokens = __allkwargs0__ [__attrib0__]; break;
					case 'namedGroups': var namedGroups = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var variants = [];
	var groupInfo = __call__ (generateGroupSpans, null, tokens);
	var __iterable0__ = groupInfo;
	for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
		var group = __getitem__ (__iterable0__, __index0__);
		if (__t__ (__eq__ (group.klass, '(?<'))) {
			var iff = __getslice__ (tokens, 0, null, 1);
			var els = __getslice__ (tokens, 0, null, 1);
			var conStart = group.start;
			var conEnd = group.end;
			var ref = __getitem__ (tokens, __add__ (conStart, 1)).py_name;
			var captureGroup = __call__ (getCaptureGroup, null, groupInfo, namedGroups, ref);
			var captureGroupModifier = __getitem__ (tokens, __add__ (captureGroup.end, 1));
			if (__t__ (__t__ (__in__ (captureGroupModifier.py_name, ['?', '*'])) || (function () {
				var __accu0__ = captureGroupModifier.py_name;
				return __call__ (__accu0__.startswith, __accu0__, '{0,');
			}) ())) {
				if (__t__ (__eq__ (captureGroupModifier.py_name, '?'))) {
					__setitem__ (iff, __add__ (captureGroup.end, 1), null);
				}
				else if (__t__ (__eq__ (captureGroupModifier.py_name, '*'))) {
					__setitem__ (iff, __add__ (captureGroup.end, 1), __call__ (Token, null, '+'));
				}
				else if (__t__ ((function () {
					var __accu0__ = captureGroupModifier.py_name;
					return __call__ (__accu0__.startswith, __accu0__, '{0,');
				}) ())) {
					__setslice__ (__getitem__ (iff, __add__ (captureGroup.end, 1)).py_name, 0, 3, null, '{1,');
				}
				__setitem__ (els, __add__ (captureGroup.end, 1), null);
				var hasElse = false;
				for (var idx = conStart; idx < conEnd; idx++) {
					if (__t__ (__eq__ (__getitem__ (tokens, idx).py_name, '|'))) {
						var hasElse = true;
						(function () {
							var __accu0__ = els;
							return __call__ (__accu0__.py_pop, __accu0__, conEnd);
						}) ();
						__setslice__ (iff, idx, __add__ (conEnd, 1), null, []);
						__setslice__ (els, conStart, __add__ (idx, 1), null, []);
						break;
					}
				}
				if (__t__ (!__t__ ((hasElse)))) {
					__setslice__ (els, conStart, __add__ (conEnd, 1), null, []);
					(function () {
						var __accu0__ = iff;
						return __call__ (__accu0__.py_pop, __accu0__, conEnd);
					}) ();
				}
				__setslice__ (iff, conStart, __add__ (conStart, 3), null, []);
				__setslice__ (els, captureGroup.start, __add__ (captureGroup.end, 1), null, [__call__ (Token, null, '('), __call__ (Token, null, ')')]);
				(function () {
					var __accu0__ = iff;
					return __call__ (__accu0__.remove, __accu0__, null);
				}) ();
				(function () {
					var __accu0__ = els;
					return __call__ (__accu0__.remove, __accu0__, null);
				}) ();
				(function () {
					var __accu0__ = variants;
					return __call__ (__accu0__.append, __accu0__, iff);
				}) ();
				(function () {
					var __accu0__ = variants;
					return __call__ (__accu0__.append, __accu0__, els);
				}) ();
			}
			else {
				var pastIff = false;
				for (var idx = conStart; idx < conEnd; idx++) {
					if (__t__ (__eq__ (__getitem__ (iff, idx).py_name, '|'))) {
						var iff = __getslice__ (tokens, 0, idx, 1);
						(function () {
							var __accu0__ = iff;
							return __call__ (__accu0__.extend, __accu0__, __getslice__ (tokens, __add__ (conEnd, 1), null, 1));
						}) ();
						break;
					}
				}
				__setslice__ (iff, conStart, __add__ (conStart, 3), null, []);
				(function () {
					var __accu0__ = variants;
					return __call__ (__accu0__.append, __accu0__, iff);
				}) ();
			}
			break;
		}
	}
	if (__t__ (!__t__ ((variants)))) {
		return [tokens];
	}
	var allVariants = [];
	var __iterable0__ = variants;
	for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
		var variant = __getitem__ (__iterable0__, __index0__);
		(function () {
			var __accu0__ = allVariants;
			return __call__ (__accu0__.extend, __accu0__, __call__ (splitIfElse, null, variant, namedGroups));
		}) ();
	}
	return allVariants;
};
export var Token =  __class__ ('Token', [object], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, py_name, paras, pure) {
		if (typeof paras == 'undefined' || (paras != null && paras.hasOwnProperty ("__kwargtrans__"))) {;
			var paras = null;
		};
		if (typeof pure == 'undefined' || (pure != null && pure.hasOwnProperty ("__kwargtrans__"))) {;
			var pure = false;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'py_name': var py_name = __allkwargs0__ [__attrib0__]; break;
						case 'paras': var paras = __allkwargs0__ [__attrib0__]; break;
						case 'pure': var pure = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (paras === null)) {
			var paras = [];
		}
		self.py_name = py_name;
		self.paras = paras;
		self.pure = pure;
		self.isModeGroup = false;
	});},
	get __repr__ () {return __get__ (this, function (self) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return self.py_name;
	});},
	get resolve () {return __get__ (this, function (self) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var paras = '';
		var __iterable0__ = self.paras;
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var para = __getitem__ (__iterable0__, __index0__);
			var paras = __call__ (__iadd__, null, paras, __call__ (str, null, para));
		}
		return __add__ (self.py_name, paras);
	});}
});
export var shift = function (stack, queue) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'stack': var stack = __allkwargs0__ [__attrib0__]; break;
					case 'queue': var queue = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var done = !__t__ ((__call__ (bool, null, queue)));
	if (__t__ (!__t__ ((done)))) {
		(function () {
			var __accu0__ = stack;
			return __call__ (__accu0__.append, __accu0__, __call__ (Token, null, __getitem__ (queue, 0), [], true));
		}) ();
		var queue = __getslice__ (queue, 1, null, 1);
	}
	return tuple ([stack, queue, done]);
};
export var shiftReduce = function (stack, queue, namedGroups, flags) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'stack': var stack = __allkwargs0__ [__attrib0__]; break;
					case 'queue': var queue = __allkwargs0__ [__attrib0__]; break;
					case 'namedGroups': var namedGroups = __allkwargs0__ [__attrib0__]; break;
					case 'flags': var flags = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var done = false;
	var high = __sub__ (__call__ (len, null, stack), 1);
	if (__t__ (__lt__ (__call__ (len, null, stack), 2))) {
		var __left0__ = __call__ (shift, null, stack, queue);
		var stack = __left0__ [0];
		var queue = __left0__ [1];
		var done = __left0__ [2];
		return tuple ([stack, queue, flags, done]);
	}
	var s0 = (__t__ (__gt__ (__call__ (len, null, stack), 0)) ? __getitem__ (stack, high) : __call__ (Token, null, ''));
	var s1 = (__t__ (__gt__ (__call__ (len, null, stack), 1)) ? __getitem__ (stack, __sub__ (high, 1)) : __call__ (Token, null, ''));
	if (__t__ (VERBOSE)) {
		var __iterable0__ = stack;
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var token = __getitem__ (__iterable0__, __index0__);
			(function () {
				var __accu0__ = console;
				return __call__ (__accu0__.log, __accu0__, (function () {
					var __accu1__ = token;
					return __call__ (__accu1__.resolve, __accu1__);
				}) (), '\t', __kwargtrans__ ({end: ''}));
			}) ();
		}
		(function () {
			var __accu0__ = console;
			return __call__ (__accu0__.log, __accu0__, '');
		}) ();
	}
	if (__t__ (__eq__ (s1.py_name, '\\'))) {
		if (__t__ (__eq__ (s0.py_name, 'A'))) {
			__setslice__ (stack, __neg__ (2), null, null, [__call__ (Token, null, '^')]);
		}
		else if (__t__ (__eq__ (s0.py_name, 'a'))) {
			__setslice__ (stack, __neg__ (2), null, null, [__call__ (Token, null, '\\07')]);
		}
		else if (__t__ (__eq__ (s0.py_name, 'Z'))) {
			__setslice__ (stack, __neg__ (2), null, null, [__call__ (Token, null, '$')]);
		}
		else {
			__setslice__ (stack, __neg__ (2), null, null, [__call__ (Token, null, __add__ ('\\', s0.py_name))]);
		}
	}
	else if (__t__ (__t__ (__eq__ (s0.py_name, '$')) && s0.pure)) {
		(function () {
			var __accu0__ = stack;
			return __call__ (__accu0__.py_pop, __accu0__);
		}) ();
		(function () {
			var __accu0__ = stack;
			return __call__ (__accu0__.extend, __accu0__, [__call__ (Token, null, '(?='), __call__ (Token, null, '\\n'), __call__ (Token, null, '?'), __call__ (Token, null, '$'), __call__ (Token, null, ')')]);
		}) ();
	}
	else if (__t__ (__eq__ (s1.py_name, '{'))) {
		if (__t__ (__t__ (__eq__ (s0.py_name, ',')) && __eq__ (__call__ (len, null, s1.paras), 0))) {
			(function () {
				var __accu0__ = s1.paras;
				return __call__ (__accu0__.append, __accu0__, '0');
			}) ();
			(function () {
				var __accu0__ = s1.paras;
				return __call__ (__accu0__.append, __accu0__, ',');
			}) ();
		}
		else if (__t__ (__eq__ (s0.py_name, '}'))) {
			(function () {
				var __accu0__ = s1.paras;
				return __call__ (__accu0__.append, __accu0__, '}');
			}) ();
			s1.py_name = (function () {
				var __accu0__ = s1;
				return __call__ (__accu0__.resolve, __accu0__);
			}) ();
			s1.paras = [];
		}
		else {
			(function () {
				var __accu0__ = s1.paras;
				return __call__ (__accu0__.append, __accu0__, s0.py_name);
			}) ();
		}
		var stack = __getslice__ (stack, 0, __neg__ (1), 1);
	}
	else if (__t__ (__t__ (__eq__ (s1.py_name, '[')) && __eq__ (s0.py_name, '^'))) {
		__setslice__ (stack, __neg__ (2), null, null, [__call__ (Token, null, '[^')]);
	}
	else if (__t__ (__t__ (__eq__ (s1.py_name, '(')) && __eq__ (s0.py_name, '?'))) {
		__setslice__ (stack, __neg__ (2), null, null, [__call__ (Token, null, '(?')]);
	}
	else if (__t__ (__t__ (__in__ (s1.py_name, ['*', '+', '?'])) && __eq__ (s0.py_name, '?'))) {
		__setslice__ (stack, __neg__ (2), null, null, [__call__ (Token, null, __add__ (s1.py_name, '?'))]);
	}
	else if (__t__ (__t__ (s1.isModeGroup) && __eq__ (s0.py_name, ')'))) {
		var stack = __getslice__ (stack, 0, __neg__ (2), 1);
	}
	else if (__t__ (__eq__ (s1.py_name, '(?'))) {
		if (__t__ (__in__ (s0.py_name, stringFlags))) {
			if (__t__ (__eq__ (s0.py_name, 'i'))) {
				var flags = __call__ (__ior__, null, flags, re.IGNORECASE);
			}
			else if (__t__ (__eq__ (s0.py_name, 'L'))) {
				var flags = __call__ (__ior__, null, flags, re.LOCALE);
			}
			else if (__t__ (__eq__ (s0.py_name, 'm'))) {
				var flags = __call__ (__ior__, null, flags, re.MULTILINE);
			}
			else if (__t__ (__eq__ (s0.py_name, 's'))) {
				var flags = __call__ (__ior__, null, flags, re.DOTALL);
			}
			else if (__t__ (__eq__ (s0.py_name, 'u'))) {
				var flags = __call__ (__ior__, null, flags, re.UNICODE);
			}
			else if (__t__ (__eq__ (s0.py_name, 'x'))) {
				var flags = __call__ (__ior__, null, flags, re.VERBOSE);
			}
			else if (__t__ (__eq__ (s0.py_name, 'a'))) {
				var flags = __call__ (__ior__, null, flags, re.ASCII);
			}
			(function () {
				var __accu0__ = stack;
				return __call__ (__accu0__.py_pop, __accu0__);
			}) ();
			s1.isModeGroup = true;
		}
		else {
			if (__t__ (__eq__ (s0.py_name, '('))) {
				s0.py_name = '<';
			}
			var newToken = __call__ (Token, null, __add__ ('(?', s0.py_name));
			__setslice__ (stack, __neg__ (2), null, null, [newToken]);
		}
	}
	else if (__t__ (__eq__ (s1.py_name, '(?<'))) {
		if (__t__ (__eq__ (s0.py_name, ')'))) {
			__setslice__ (stack, __neg__ (1), null, null, [__call__ (Token, null, (function () {
				var __accu0__ = '';
				return __call__ (__accu0__.join, __accu0__, s1.paras);
			}) ()), __call__ (Token, null, '>')]);
			s1.paras = [];
		}
		else {
			(function () {
				var __accu0__ = s1.paras;
				return __call__ (__accu0__.append, __accu0__, s0.py_name);
			}) ();
			(function () {
				var __accu0__ = stack;
				return __call__ (__accu0__.py_pop, __accu0__);
			}) ();
		}
	}
	else if (__t__ (__eq__ (s1.py_name, '(?P'))) {
		__setslice__ (stack, __neg__ (2), null, null, [__call__ (Token, null, __add__ ('(?P', s0.py_name))]);
	}
	else if (__t__ (__eq__ (s1.py_name, '(?P<'))) {
		if (__t__ (__eq__ (s0.py_name, '>'))) {
			__setitem__ (namedGroups, (function () {
				var __accu0__ = '';
				return __call__ (__accu0__.join, __accu0__, s1.paras);
			}) (), __add__ (__call__ (countCaptureGroups, null, stack), 1));
			__setslice__ (stack, __neg__ (2), null, null, [__call__ (Token, null, '(')]);
		}
		else {
			(function () {
				var __accu0__ = s1.paras;
				return __call__ (__accu0__.append, __accu0__, s0.py_name);
			}) ();
			(function () {
				var __accu0__ = stack;
				return __call__ (__accu0__.py_pop, __accu0__);
			}) ();
		}
	}
	else if (__t__ (__eq__ (s1.py_name, '(?P='))) {
		if (__t__ (__eq__ (s0.py_name, ')'))) {
			__setslice__ (stack, __neg__ (2), null, null, [__call__ (Token, null, __add__ ('\\', __call__ (str, null, __getitem__ (namedGroups, __getitem__ (s1.paras, 0)))))]);
		}
		else if (__t__ (!__t__ ((s1.paras)))) {
			(function () {
				var __accu0__ = s1.paras;
				return __call__ (__accu0__.append, __accu0__, s0.py_name);
			}) ();
			(function () {
				var __accu0__ = stack;
				return __call__ (__accu0__.py_pop, __accu0__);
			}) ();
		}
		else {
			__setitem__ (s1.paras, 0, __call__ (__iadd__, null, __getitem__ (s1.paras, 0), s0.py_name));
			(function () {
				var __accu0__ = stack;
				return __call__ (__accu0__.py_pop, __accu0__);
			}) ();
		}
	}
	else if (__t__ (__eq__ (s1.py_name, '(?#'))) {
		if (__t__ (__eq__ (s0.py_name, ')'))) {
			var stack = __getslice__ (stack, 0, __neg__ (2), 1);
		}
		else {
			var stack = __getslice__ (stack, 0, __neg__ (1), 1);
		}
	}
	else {
		var __left0__ = __call__ (shift, null, stack, queue);
		var stack = __left0__ [0];
		var queue = __left0__ [1];
		var done = __left0__ [2];
	}
	return tuple ([stack, queue, flags, done]);
};
export var translate = function (rgx) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'rgx': var rgx = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var stack = [];
	var queue = __call__ (list, null, rgx);
	var flags = 0;
	var namedGroups = __call__ (dict, null);
	var nloop = 0;
	while (__t__ (true)) {
		var nloop = __call__ (__iadd__, null, nloop, 1);
		if (__t__ (__gt__ (nloop, MAX_SHIFTREDUCE_LOOPS))) {
			var __except0__ = __call__ (Exception, null, 'Too many iterations in converting regex from Python to JavaScript');
			__except0__.__cause__ = null;
			throw __except0__;
		}
		var __left0__ = __call__ (shiftReduce, null, stack, queue, namedGroups, flags);
		var stack = __left0__ [0];
		var queue = __left0__ [1];
		var flags = __left0__ [2];
		var done = __left0__ [3];
		if (__t__ (done)) {
			break;
		}
	}
	var variants = __call__ (splitIfElse, null, stack, namedGroups);
	var n_splits = __call__ (len, null, variants);
	var final = [];
	for (var i = 0; i < __call__ (len, null, variants); i++) {
		(function () {
			var __accu0__ = final;
			return __call__ (__accu0__.extend, __accu0__, __getitem__ (variants, i));
		}) ();
		if (__t__ (__lt__ (i, __sub__ (__call__ (len, null, variants), 1)))) {
			(function () {
				var __accu0__ = final;
				return __call__ (__accu0__.append, __accu0__, __call__ (Token, null, '|'));
			}) ();
		}
	}
	var stack = final;
	var groupInfo = __call__ (generateGroupSpans, null, stack);
	var resolvedTokens = [];
	var __iterable0__ = stack;
	for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
		var token = __getitem__ (__iterable0__, __index0__);
		var stringed = (function () {
			var __accu0__ = token;
			return __call__ (__accu0__.resolve, __accu0__);
		}) ();
		if (__t__ (__t__ (__and__ (flags, re.DOTALL)) && __eq__ (stringed, '.'))) {
			var stringed = '[\\s\\S]';
		}
		(function () {
			var __accu0__ = resolvedTokens;
			return __call__ (__accu0__.append, __accu0__, stringed);
		}) ();
	}
	return tuple ([resolvedTokens, flags, namedGroups, __call__ (countCaptureGroups, null, stack), n_splits]);
};

