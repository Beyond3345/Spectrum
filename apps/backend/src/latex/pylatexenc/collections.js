var logging = {};
import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import * as __module_logging__ from './logging.js';
__nest__ (logging, '', __module_logging__);
var __name__ = 'collections';
export var logger = (function () {
	var __accu0__ = logging;
	return __call__ (__accu0__.getLogger, __accu0__, __name__);
}) ();
export var ChainMap =  __class__ ('ChainMap', [object], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self) {
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
			var maps = tuple ([].slice.apply (arguments).slice (1, __ilastarg0__ + 1));
		}
		else {
			var maps = tuple ();
		}
		self.maps = __t__ (__call__ (list, null, maps)) || [dict ({})];
	});},
	get __missing__ () {return __get__ (this, function (self, key) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'key': var key = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __except0__ = __call__ (KeyError, null, key);
		__except0__.__cause__ = null;
		throw __except0__;
	});},
	get __getitem__ () {return __get__ (this, function (self, key) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'key': var key = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __iterable0__ = self.maps;
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var mapping = __getitem__ (__iterable0__, __index0__);
			if (__t__ (!__in__ (key, mapping))) {
				continue;
			}
			return __getitem__ (mapping, key);
		}
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.__missing__, __accu0__, key);
		}) ();
	});},
	get py_get () {return __get__ (this, function (self, key, py_default) {
		if (typeof py_default == 'undefined' || (py_default != null && py_default.hasOwnProperty ("__kwargtrans__"))) {;
			var py_default = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'key': var key = __allkwargs0__ [__attrib0__]; break;
						case 'py_default': var py_default = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return (__t__ (__in__ (key, self)) ? __getitem__ (self, key) : py_default);
	});},
	get __len__ () {return __get__ (this, function (self) {
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
		return __call__ (len, null, (function () {
			var __accu0__ = __call__ (set, null);
			return __call__ (__accu0__.union, __accu0__, ...self.maps);
		}) ());
	});},
	get __iter__ () {return __get__ (this, function (self) {
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
		var d = dict ({});
		var __iterable0__ = __call__ (py_reversed, null, self.maps);
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var mapping = __getitem__ (__iterable0__, __index0__);
			(function () {
				var __accu0__ = d;
				return __call__ (__accu0__.py_update, __accu0__, (function () {
					var __accu1__ = dict;
					return __call__ (__accu1__.fromkeys, __accu1__, mapping);
				}) ());
			}) ();
		}
		return __call__ (py_iter, null, d);
	});},
	[Symbol.iterator] () {return this.__iter__ ()},
	get __contains__ () {return __get__ (this, function (self, key) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'key': var key = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return __call__ (any, null, (function () {
			var __accu0__ = [];
			var __iterable0__ = self.maps;
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var m = __getitem__ (__iterable0__, __index0__);
				(function () {
					var __accu1__ = __accu0__;
					return __call__ (__accu1__.append, __accu1__, __in__ (key, m));
				}) ();
			}
			return py_iter (__accu0__);
		}) ());
	});},
	get __bool__ () {return __get__ (this, function (self) {
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
		return __call__ (any, null, self.maps);
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
		return (function () {
			var __accu0__ = '{!r}({!r})';
			return __call__ (__accu0__.format, __accu0__, self.__class__.__name__, self.maps);
		}) ();
	});},
	get fromkeys () {return __getcm__ (this, function (cls, iterable) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'cls': var cls = __allkwargs0__ [__attrib0__]; break;
						case 'iterable': var iterable = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
			var args = tuple ([].slice.apply (arguments).slice (2, __ilastarg0__ + 1));
		}
		else {
			var args = tuple ();
		}
		return __call__ (cls, null, (function () {
			var __accu0__ = dict;
			return __call__ (__accu0__.fromkeys, __accu0__, iterable, ...args);
		}) ());
	});},
	get copy () {return __get__ (this, function (self) {
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
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.__class__, __accu0__, (function () {
				var __accu1__ = __getitem__ (self.maps, 0);
				return __call__ (__accu1__.copy, __accu1__);
			}) (), ...__getslice__ (self.maps, 1, null, 1));
		}) ();
	});},
	get __copy__ () {return __get__ (this, function (self) {
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
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.__class__, __accu0__, (function () {
				var __accu1__ = __getitem__ (self.maps, 0);
				return __call__ (__accu1__.copy, __accu1__);
			}) (), ...__getslice__ (self.maps, 1, null, 1));
		}) ();
	});},
	get new_child () {return __get__ (this, function (self, m) {
		if (typeof m == 'undefined' || (m != null && m.hasOwnProperty ("__kwargtrans__"))) {;
			var m = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'm': var m = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (m === null)) {
			var m = dict ({});
		}
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.__class__, __accu0__, m, ...self.maps);
		}) ();
	});},
	get _get_parents () {return __get__ (this, function (self) {
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
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.__class__, __accu0__, ...__getslice__ (self.maps, 1, null, 1));
		}) ();
	});},
	get __setitem__ () {return __get__ (this, function (self, key, value) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'key': var key = __allkwargs0__ [__attrib0__]; break;
						case 'value': var value = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		__setitem__ (__getitem__ (self.maps, 0), key, value);
	});},
	get __delitem__ () {return __get__ (this, function (self, key) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'key': var key = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		try {
			delete __getitem__ (__getitem__ (self.maps, 0), key);
		}
		catch (__except0__) {
			if (isinstance (__except0__, KeyError)) {
				var __except1__ = __call__ (KeyError, null, 'Key not found in the first mapping: {}'.format (key));
				__except1__.__cause__ = null;
				throw __except1__;
			}
			else {
				throw __except0__;
			}
		}
	});},
	get py_popitem () {return __get__ (this, function (self) {
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
		try {
			return (function () {
				var __accu0__ = __getitem__ (self.maps, 0);
				return __call__ (__accu0__.py_popitem, __accu0__);
			}) ();
		}
		catch (__except0__) {
			if (isinstance (__except0__, KeyError)) {
				var __except1__ = __call__ (KeyError, null, 'No keys found in the first mapping.');
				__except1__.__cause__ = null;
				throw __except1__;
			}
			else {
				throw __except0__;
			}
		}
	});},
	get py_pop () {return __get__ (this, function (self, key) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'key': var key = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
			var args = tuple ([].slice.apply (arguments).slice (2, __ilastarg0__ + 1));
		}
		else {
			var args = tuple ();
		}
		try {
			return (function () {
				var __accu0__ = __getitem__ (self.maps, 0);
				return __call__ (__accu0__.py_pop, __accu0__, key, ...args);
			}) ();
		}
		catch (__except0__) {
			if (isinstance (__except0__, KeyError)) {
				var __except1__ = __call__ (KeyError, null, 'Key not found in the first mapping: {}'.format (key));
				__except1__.__cause__ = null;
				throw __except1__;
			}
			else {
				throw __except0__;
			}
		}
	});},
	get py_clear () {return __get__ (this, function (self) {
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
		(function () {
			var __accu0__ = __getitem__ (self.maps, 0);
			return __call__ (__accu0__.py_clear, __accu0__);
		}) ();
	});},
	get __ior__ () {return __get__ (this, function (self, other) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'other': var other = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		(function () {
			var __accu0__ = __getitem__ (self.maps, 0);
			return __call__ (__accu0__.py_update, __accu0__, other);
		}) ();
		return self;
	});},
	get __or__ () {return __get__ (this, function (self, other) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'other': var other = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (!__t__ ((__call__ (isinstance, null, other, _collections_abc.Mapping))))) {
			return NotImplemented;
		}
		var m = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.copy, __accu0__);
		}) ();
		(function () {
			var __accu0__ = __getitem__ (m.maps, 0);
			return __call__ (__accu0__.py_update, __accu0__, other);
		}) ();
		return m;
	});},
	get __ror__ () {return __get__ (this, function (self, other) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'other': var other = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (!__t__ ((__call__ (isinstance, null, other, _collections_abc.Mapping))))) {
			return NotImplemented;
		}
		var m = __call__ (dict, null, other);
		var __iterable0__ = __call__ (py_reversed, null, self.maps);
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var child = __getitem__ (__iterable0__, __index0__);
			(function () {
				var __accu0__ = m;
				return __call__ (__accu0__.py_update, __accu0__, child);
			}) ();
		}
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.__class__, __accu0__, m);
		}) ();
	});}
});
Object.defineProperty (ChainMap, 'parents', property.call (ChainMap, ChainMap._get_parents));;

