import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import {translate} from './re.translate.js';
export {translate};
var __name__ = 're';
export var T = __lshift__ (1, 0);
export var TEMPLATE = T;
export var I = __lshift__ (1, 1);
export var IGNORECASE = I;
export var L = __lshift__ (1, 2);
export var LOCALE = L;
export var M = __lshift__ (1, 3);
export var MULTILINE = M;
export var S = __lshift__ (1, 4);
export var DOTALL = S;
export var U = __lshift__ (1, 5);
export var UNICODE = U;
export var X = __lshift__ (1, 6);
export var VERBOSE = X;
export var DEBUG = __lshift__ (1, 7);
export var A = __lshift__ (1, 8);
export var ASCII = A;
export var Y = __lshift__ (1, 16);
export var STICKY = Y;
export var G = __lshift__ (1, 17);
export var GLOBAL = G;
export var J = __lshift__ (1, 19);
export var JSSTRICT = J;
export var error =  __class__ ('error', [Exception], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, msg, error, pattern, flags, pos) {
		if (typeof pattern == 'undefined' || (pattern != null && pattern.hasOwnProperty ("__kwargtrans__"))) {;
			var pattern = null;
		};
		if (typeof flags == 'undefined' || (flags != null && flags.hasOwnProperty ("__kwargtrans__"))) {;
			var flags = 0;
		};
		if (typeof pos == 'undefined' || (pos != null && pos.hasOwnProperty ("__kwargtrans__"))) {;
			var pos = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'msg': var msg = __allkwargs0__ [__attrib0__]; break;
						case 'error': var error = __allkwargs0__ [__attrib0__]; break;
						case 'pattern': var pattern = __allkwargs0__ [__attrib0__]; break;
						case 'flags': var flags = __allkwargs0__ [__attrib0__]; break;
						case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		(function () {
			var __accu0__ = Exception;
			return __call__ (__accu0__.__init__, __accu0__, self, msg, __kwargtrans__ ({error: error}));
		}) ();
		self.pattern = pattern;
		self.flags = flags;
		self.pos = pos;
	});}
});
export var ReIndexError =  __class__ ('ReIndexError', [IndexError], {
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
		}
		else {
		}
		(function () {
			var __accu0__ = IndexError;
			return __call__ (__accu0__.__init__, __accu0__, self, 'no such group');
		}) ();
	});}
});
export var Match =  __class__ ('Match', [object], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, mObj, string, pos, endpos, rObj, namedGroups) {
		if (typeof namedGroups == 'undefined' || (namedGroups != null && namedGroups.hasOwnProperty ("__kwargtrans__"))) {;
			var namedGroups = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'mObj': var mObj = __allkwargs0__ [__attrib0__]; break;
						case 'string': var string = __allkwargs0__ [__attrib0__]; break;
						case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
						case 'endpos': var endpos = __allkwargs0__ [__attrib0__]; break;
						case 'rObj': var rObj = __allkwargs0__ [__attrib0__]; break;
						case 'namedGroups': var namedGroups = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __iterable0__ = __call__ (enumerate, null, mObj);
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var __left0__ = __getitem__ (__iterable0__, __index0__);
			var index = __left0__ [0];
			var match = __left0__ [1];
			__setitem__ (mObj, index, (__t__ (__eq__ (__getitem__ (mObj, index), undefined)) ? null : __getitem__ (mObj, index)));
		}
		self._obj = mObj;
		self._pos = pos;
		self._endpos = endpos;
		self._re = rObj;
		self._string = string;
		self._namedGroups = namedGroups;
		self._lastindex = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__._lastMatchGroup, __accu0__);
		}) ();
		if (__t__ (self._namedGroups !== null)) {
			self._lastgroup = __getitem__ (self._namedGroups, self._lastindex);
		}
		else {
			self._lastgroup = null;
		}
	});},
	get _getPos () {return __get__ (this, function (self) {
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
		return self._pos;
	});},
	get _setPos () {return __get__ (this, function (self, val) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'val': var val = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __except0__ = __call__ (AttributeError, null, 'readonly attribute');
		__except0__.__cause__ = null;
		throw __except0__;
	});},
	get _getEndPos () {return __get__ (this, function (self) {
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
		return self._endpos;
	});},
	get _setEndPos () {return __get__ (this, function (self, val) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'val': var val = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __except0__ = __call__ (AttributeError, null, 'readonly attribute');
		__except0__.__cause__ = null;
		throw __except0__;
	});},
	get _getRe () {return __get__ (this, function (self) {
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
		return self._re;
	});},
	get _setRe () {return __get__ (this, function (self, val) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'val': var val = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __except0__ = __call__ (AttributeError, null, 'readonly attribute');
		__except0__.__cause__ = null;
		throw __except0__;
	});},
	get _getString () {return __get__ (this, function (self) {
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
		return self._string;
	});},
	get _setString () {return __get__ (this, function (self, val) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'val': var val = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __except0__ = __call__ (AttributeError, null, 'readonly attribute');
		__except0__.__cause__ = null;
		throw __except0__;
	});},
	get _getLastGroup () {return __get__ (this, function (self) {
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
		return self._lastgroup;
	});},
	get _setLastGroup () {return __get__ (this, function (self, val) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'val': var val = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __except0__ = __call__ (AttributeError, null, 'readonly attribute');
		__except0__.__cause__ = null;
		throw __except0__;
	});},
	get _getLastIndex () {return __get__ (this, function (self) {
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
		return self._lastindex;
	});},
	get _setLastIndex () {return __get__ (this, function (self, val) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'val': var val = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __except0__ = __call__ (AttributeError, null, 'readonly attribute');
		__except0__.__cause__ = null;
		throw __except0__;
	});},
	get _lastMatchGroup () {return __get__ (this, function (self) {
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
		if (__t__ (__gt__ (__call__ (len, null, self._obj), 1))) {
			for (var i = __sub__ (__call__ (len, null, self._obj), 1); i > 0; i--) {
				if (__t__ (__getitem__ (self._obj, i) !== null)) {
					return i;
				}
			}
			return null;
		}
		else {
			return null;
		}
	});},
	get expand () {return __get__ (this, function (self, template) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'template': var template = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __except0__ = __call__ (NotImplementedError, null);
		__except0__.__cause__ = null;
		throw __except0__;
	});},
	get group () {return __get__ (this, function (self) {
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
			var args = tuple ([].slice.apply (arguments).slice (1, __ilastarg0__ + 1));
		}
		else {
			var args = tuple ();
		}
		var ret = [];
		if (__t__ (__gt__ (__call__ (len, null, args), 0))) {
			var __iterable0__ = args;
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var index = __getitem__ (__iterable0__, __index0__);
				if (__t__ (py_typeof (index) === str)) {
					if (__t__ (self._namedGroups !== null)) {
						if (__t__ (!__in__ (index, (function () {
							var __accu0__ = self._namedGroups;
							return __call__ (__accu0__.py_keys, __accu0__);
						}) ()))) {
							var __except0__ = __call__ (ReIndexError, null);
							__except0__.__cause__ = null;
							throw __except0__;
						}
						(function () {
							var __accu0__ = ret;
							return __call__ (__accu0__.append, __accu0__, __getitem__ (self._obj, __getitem__ (self._namedGroups, index)));
						}) ();
					}
					else {
						var __except0__ = __call__ (NotImplementedError, null, 'No NamedGroups Available');
						__except0__.__cause__ = null;
						throw __except0__;
					}
				}
				else {
					if (__t__ (__ge__ (index, __call__ (len, null, self._obj)))) {
						var __except0__ = __call__ (ReIndexError, null);
						__except0__.__cause__ = null;
						throw __except0__;
					}
					(function () {
						var __accu0__ = ret;
						return __call__ (__accu0__.append, __accu0__, __getitem__ (self._obj, index));
					}) ();
				}
			}
		}
		else {
			(function () {
				var __accu0__ = ret;
				return __call__ (__accu0__.append, __accu0__, __getitem__ (self._obj, 0));
			}) ();
		}
		if (__t__ (__eq__ (__call__ (len, null, ret), 1))) {
			return __getitem__ (ret, 0);
		}
		else {
			return __call__ (tuple, null, ret);
		}
	});},
	get groups () {return __get__ (this, function (self, py_default) {
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
						case 'py_default': var py_default = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (__gt__ (__call__ (len, null, self._obj), 1))) {
			var ret = __getslice__ (self._obj, 1, null, 1);
			return __call__ (tuple, null, (function () {
				var __accu0__ = [];
				var __iterable0__ = ret;
				for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
					var x = __getitem__ (__iterable0__, __index0__);
					(function () {
						var __accu1__ = __accu0__;
						return __call__ (__accu1__.append, __accu1__, (__t__ (x !== null) ? x : py_default));
					}) ();
				}
				return __accu0__;
			}) ());
		}
		else {
			return __call__ (tuple, null);
		}
	});},
	get groupdict () {return __get__ (this, function (self, py_default) {
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
						case 'py_default': var py_default = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (self._namedGroups !== null)) {
			var ret = dict ({});
			var __iterable0__ = (function () {
				var __accu0__ = self._namedGroups;
				return __call__ (__accu0__.py_items, __accu0__);
			}) ();
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var __left0__ = __getitem__ (__iterable0__, __index0__);
				var gName = __left0__ [0];
				var gId = __left0__ [1];
				var value = __getitem__ (self._obj, gId);
				__setitem__ (ret, gName, (__t__ (value !== null) ? value : py_default));
			}
			return ret;
		}
		else {
			var __except0__ = __call__ (NotImplementedError, null, 'No NamedGroups Available');
			__except0__.__cause__ = null;
			throw __except0__;
		}
	});},
	get start () {return __get__ (this, function (self, group) {
		if (typeof group == 'undefined' || (group != null && group.hasOwnProperty ("__kwargtrans__"))) {;
			var group = 0;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'group': var group = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var gId = 0;
		if (__t__ (py_typeof (group) === str)) {
			if (__t__ (self._namedGroups !== null)) {
				if (__t__ (!__in__ (group, (function () {
					var __accu0__ = self._namedGroups;
					return __call__ (__accu0__.py_keys, __accu0__);
				}) ()))) {
					var __except0__ = __call__ (ReIndexError, null);
					__except0__.__cause__ = null;
					throw __except0__;
				}
				var gId = __getitem__ (self._namedGroups, group);
			}
			else {
				var __except0__ = __call__ (NotImplementedError, null, 'No NamedGroups Available');
				__except0__.__cause__ = null;
				throw __except0__;
			}
		}
		else {
			var gId = group;
		}
		if (__t__ (__ge__ (gId, __call__ (len, null, self._obj)))) {
			var __except0__ = __call__ (ReIndexError, null);
			__except0__.__cause__ = null;
			throw __except0__;
		}
		if (__t__ (__eq__ (gId, 0))) {
			return self._obj.index;
		}
		else if (__t__ (__getitem__ (self._obj, gId) !== null)) {
			var r = __call__ (compile, null, __call__ (escape, null, __getitem__ (self._obj, gId)), self._re.flags);
			var m = (function () {
				var __accu0__ = r;
				return __call__ (__accu0__.search, __accu0__, __getitem__ (self._obj, 0));
			}) ();
			if (__t__ (m)) {
				return __add__ (self._obj.index, (function () {
					var __accu0__ = m;
					return __call__ (__accu0__.start, __accu0__);
				}) ());
			}
			else {
				var __except0__ = __call__ (Exception, null, 'Failed to find capture group');
				__except0__.__cause__ = null;
				throw __except0__;
			}
		}
		else {
			return __neg__ (1);
		}
	});},
	get end () {return __get__ (this, function (self, group) {
		if (typeof group == 'undefined' || (group != null && group.hasOwnProperty ("__kwargtrans__"))) {;
			var group = 0;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'group': var group = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var gId = 0;
		if (__t__ (py_typeof (group) === str)) {
			if (__t__ (self._namedGroups !== null)) {
				if (__t__ (!__in__ (group, (function () {
					var __accu0__ = self._namedGroups;
					return __call__ (__accu0__.py_keys, __accu0__);
				}) ()))) {
					var __except0__ = __call__ (ReIndexError, null);
					__except0__.__cause__ = null;
					throw __except0__;
				}
				var gId = __getitem__ (self._namedGroups, group);
			}
			else {
				var __except0__ = __call__ (NotImplementedError, null, 'No NamedGroups Available');
				__except0__.__cause__ = null;
				throw __except0__;
			}
		}
		else {
			var gId = group;
		}
		if (__t__ (__ge__ (gId, __call__ (len, null, self._obj)))) {
			var __except0__ = __call__ (ReIndexError, null);
			__except0__.__cause__ = null;
			throw __except0__;
		}
		if (__t__ (__eq__ (gId, 0))) {
			return __add__ (self._obj.index, __call__ (len, null, __getitem__ (self._obj, 0)));
		}
		else if (__t__ (__getitem__ (self._obj, gId) !== null)) {
			var r = __call__ (compile, null, __call__ (escape, null, __getitem__ (self._obj, gId)), self._re.flags);
			var m = (function () {
				var __accu0__ = r;
				return __call__ (__accu0__.search, __accu0__, __getitem__ (self._obj, 0));
			}) ();
			if (__t__ (m)) {
				return __add__ (self._obj.index, (function () {
					var __accu0__ = m;
					return __call__ (__accu0__.end, __accu0__);
				}) ());
			}
			else {
				var __except0__ = __call__ (Exception, null, 'Failed to find capture group');
				__except0__.__cause__ = null;
				throw __except0__;
			}
		}
		else {
			return __neg__ (1);
		}
	});},
	get span () {return __get__ (this, function (self, group) {
		if (typeof group == 'undefined' || (group != null && group.hasOwnProperty ("__kwargtrans__"))) {;
			var group = 0;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'group': var group = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return tuple ([(function () {
			var __accu0__ = self;
			return __call__ (__accu0__.start, __accu0__, group);
		}) (), (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.end, __accu0__, group);
		}) ()]);
	});}
});
Object.defineProperty (Match, 'pos', property.call (Match, Match._getPos, Match._setPos));
Object.defineProperty (Match, 'endpos', property.call (Match, Match._getEndPos, Match._setEndPos));
Object.defineProperty (Match, 're', property.call (Match, Match._getRe, Match._setRe));
Object.defineProperty (Match, 'string', property.call (Match, Match._getString, Match._setString));
Object.defineProperty (Match, 'lastgroup', property.call (Match, Match._getLastGroup, Match._setLastGroup));
Object.defineProperty (Match, 'lastindex', property.call (Match, Match._getLastIndex, Match._setLastIndex));
export var Regex =  __class__ ('Regex', [object], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, pattern, flags) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'pattern': var pattern = __allkwargs0__ [__attrib0__]; break;
						case 'flags': var flags = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (!__t__ ((__gt__ ((__and__ (flags, ASCII)), 0))))) {
			var flags = __call__ (__ior__, null, flags, UNICODE);
		}
		self._flags = flags;
		var __left0__ = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__._compileWrapper, __accu0__, pattern, flags);
		}) ();
		self._jsFlags = __left0__ [0];
		self._obj = __left0__ [1];
		self._jspattern = pattern;
		self._pypattern = pattern;
		var __left0__ = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__._compileWrapper, __accu0__, __add__ (pattern, '|'), flags);
		}) ();
		var _ = __left0__ [0];
		var groupCounterRegex = __left0__ [1];
		self._groups = __sub__ ((function () {
			var __accu0__ = groupCounterRegex;
			return __call__ (__accu0__.exec, __accu0__, '');
		}) ().length, 1);
		self._groupindex = null;
	});},
	get _getPattern () {return __get__ (this, function (self) {
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
		var ret = (function () {
			var __accu0__ = self._pypattern;
			return __call__ (__accu0__.py_replace, __accu0__, '\\', '\\\\');
		}) ();
		return ret;
	});},
	get _setPattern () {return __get__ (this, function (self, val) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'val': var val = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __except0__ = __call__ (AttributeError, null, 'readonly attribute');
		__except0__.__cause__ = null;
		throw __except0__;
	});},
	get _getFlags () {return __get__ (this, function (self) {
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
		return self._flags;
	});},
	get _setFlags () {return __get__ (this, function (self, val) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'val': var val = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __except0__ = __call__ (AttributeError, null, 'readonly attribute');
		__except0__.__cause__ = null;
		throw __except0__;
	});},
	get _getGroups () {return __get__ (this, function (self) {
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
		return self._groups;
	});},
	get _setGroups () {return __get__ (this, function (self, val) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'val': var val = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __except0__ = __call__ (AttributeError, null, 'readonly attribute');
		__except0__.__cause__ = null;
		throw __except0__;
	});},
	get _getGroupIndex () {return __get__ (this, function (self) {
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
		if (__t__ (self._groupindex === null)) {
			return dict ({});
		}
		else {
			return self._groupindex;
		}
	});},
	get _setGroupIndex () {return __get__ (this, function (self, val) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'val': var val = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __except0__ = __call__ (AttributeError, null, 'readonly attribute');
		__except0__.__cause__ = null;
		throw __except0__;
	});},
	get _compileWrapper () {return __get__ (this, function (self, pattern, flags) {
		if (typeof flags == 'undefined' || (flags != null && flags.hasOwnProperty ("__kwargtrans__"))) {;
			var flags = 0;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'pattern': var pattern = __allkwargs0__ [__attrib0__]; break;
						case 'flags': var flags = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var jsFlags = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__._convertFlags, __accu0__, flags);
		}) ();
		var rObj = null;
		var errObj = null;
		
		                   try {
		                     rObj = new RegExp(pattern, jsFlags)
		                   } catch( err ) {
		                     errObj = err
		                   }
		                   
		if (__t__ (errObj !== null)) {
			var __except0__ = __call__ (error, null, errObj.message, errObj, pattern, flags);
			__except0__.__cause__ = null;
			throw __except0__;
		}
		return tuple ([jsFlags, rObj]);
	});},
	get _convertFlags () {return __get__ (this, function (self, flags) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'flags': var flags = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var bitmaps = [tuple ([DEBUG, '']), tuple ([IGNORECASE, 'i']), tuple ([MULTILINE, 'm']), tuple ([STICKY, 'y']), tuple ([GLOBAL, 'g']), tuple ([UNICODE, 'u'])];
		var ret = (function () {
			var __accu0__ = '';
			return __call__ (__accu0__.join, __accu0__, (function () {
				var __accu1__ = [];
				var __iterable0__ = bitmaps;
				for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
					var x = __getitem__ (__iterable0__, __index0__);
					if (__t__ (__gt__ ((__and__ (__getitem__ (x, 0), flags)), 0))) {
						(function () {
							var __accu2__ = __accu1__;
							return __call__ (__accu2__.append, __accu2__, __getitem__ (x, 1));
						}) ();
					}
				}
				return __accu1__;
			}) ());
		}) ();
		return ret;
	});},
	get _getTargetStr () {return __get__ (this, function (self, string, pos, endpos) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'string': var string = __allkwargs0__ [__attrib0__]; break;
						case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
						case 'endpos': var endpos = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var endPtr = __call__ (len, null, string);
		if (__t__ (endpos !== null)) {
			if (__t__ (__lt__ (endpos, endPtr))) {
				var endPtr = endpos;
			}
		}
		if (__t__ (__lt__ (endPtr, 0))) {
			var endPtr = 0;
		}
		var ret = __getslice__ (string, pos, endPtr, 1);
		return ret;
	});},
	get _patternHasCaptures () {return __get__ (this, function (self) {
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
		return __gt__ (self._groups, 0);
	});},
	get search () {return __get__ (this, function (self, string, pos, endpos) {
		if (typeof pos == 'undefined' || (pos != null && pos.hasOwnProperty ("__kwargtrans__"))) {;
			var pos = 0;
		};
		if (typeof endpos == 'undefined' || (endpos != null && endpos.hasOwnProperty ("__kwargtrans__"))) {;
			var endpos = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'string': var string = __allkwargs0__ [__attrib0__]; break;
						case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
						case 'endpos': var endpos = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (endpos === null)) {
			var endpos = __call__ (len, null, string);
		}
		var rObj = self._obj;
		var m = (function () {
			var __accu0__ = rObj;
			return __call__ (__accu0__.exec, __accu0__, string);
		}) ();
		if (__t__ (m)) {
			if (__t__ (__t__ (__lt__ (m.index, pos)) || __gt__ (m.index, endpos))) {
				return null;
			}
			else {
				return __call__ (Match, null, m, string, pos, endpos, self, self._groupindex);
			}
		}
		else {
			return null;
		}
	});},
	get match () {return __get__ (this, function (self, string, pos, endpos) {
		if (typeof pos == 'undefined' || (pos != null && pos.hasOwnProperty ("__kwargtrans__"))) {;
			var pos = 0;
		};
		if (typeof endpos == 'undefined' || (endpos != null && endpos.hasOwnProperty ("__kwargtrans__"))) {;
			var endpos = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'string': var string = __allkwargs0__ [__attrib0__]; break;
						case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
						case 'endpos': var endpos = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var target = string;
		if (__t__ (endpos !== null)) {
			var target = __getslice__ (target, 0, endpos, 1);
		}
		else {
			var endpos = __call__ (len, null, string);
		}
		var rObj = self._obj;
		var m = (function () {
			var __accu0__ = rObj;
			return __call__ (__accu0__.exec, __accu0__, target);
		}) ();
		if (__t__ (m)) {
			if (__t__ (__eq__ (m.index, pos))) {
				return __call__ (Match, null, m, string, pos, endpos, self, self._groupindex);
			}
			else {
				return null;
			}
		}
		else {
			return null;
		}
	});},
	get fullmatch () {return __get__ (this, function (self, string, pos, endpos) {
		if (typeof pos == 'undefined' || (pos != null && pos.hasOwnProperty ("__kwargtrans__"))) {;
			var pos = 0;
		};
		if (typeof endpos == 'undefined' || (endpos != null && endpos.hasOwnProperty ("__kwargtrans__"))) {;
			var endpos = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'string': var string = __allkwargs0__ [__attrib0__]; break;
						case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
						case 'endpos': var endpos = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var target = string;
		var strEndPos = __call__ (len, null, string);
		if (__t__ (endpos !== null)) {
			var target = __getslice__ (target, 0, endpos, 1);
			var strEndPos = endpos;
		}
		var rObj = self._obj;
		var m = (function () {
			var __accu0__ = rObj;
			return __call__ (__accu0__.exec, __accu0__, target);
		}) ();
		if (__t__ (m)) {
			var obsEndPos = __add__ (m.index, __call__ (len, null, __getitem__ (m, 0)));
			if (__t__ (__t__ (__eq__ (m.index, pos)) && __eq__ (obsEndPos, strEndPos))) {
				return __call__ (Match, null, m, string, pos, strEndPos, self, self._groupindex);
			}
			else {
				return null;
			}
		}
		else {
			return null;
		}
	});},
	get py_split () {return __get__ (this, function (self, string, maxsplit) {
		if (typeof maxsplit == 'undefined' || (maxsplit != null && maxsplit.hasOwnProperty ("__kwargtrans__"))) {;
			var maxsplit = 0;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'string': var string = __allkwargs0__ [__attrib0__]; break;
						case 'maxsplit': var maxsplit = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (__lt__ (maxsplit, 0))) {
			return [string];
		}
		var mObj = null;
		var rObj = self._obj;
		if (__t__ (__eq__ (maxsplit, 0))) {
			var mObj = (function () {
				var __accu0__ = string;
				return __call__ (__accu0__.py_split, __accu0__, rObj);
			}) ();
			return mObj;
		}
		else {
			var flags = self._flags;
			var flags = __call__ (__ior__, null, flags, GLOBAL);
			var __left0__ = (function () {
				var __accu0__ = self;
				return __call__ (__accu0__._compileWrapper, __accu0__, self._jspattern, flags);
			}) ();
			var _ = __left0__ [0];
			var rObj = __left0__ [1];
			var ret = [];
			var lastM = null;
			var cnt = 0;
			for (var i = 0; i < maxsplit; i++) {
				var m = (function () {
					var __accu0__ = rObj;
					return __call__ (__accu0__.exec, __accu0__, string);
				}) ();
				if (__t__ (m)) {
					var cnt = __call__ (__iadd__, null, cnt, 1);
					if (__t__ (lastM !== null)) {
						var start = __add__ (lastM.index, __call__ (len, null, __getitem__ (lastM, 0)));
						var head = __getslice__ (string, start, m.index, 1);
						(function () {
							var __accu0__ = ret;
							return __call__ (__accu0__.append, __accu0__, head);
						}) ();
						if (__t__ (__gt__ (__call__ (len, null, m), 1))) {
							(function () {
								var __accu0__ = ret;
								return __call__ (__accu0__.extend, __accu0__, __getslice__ (m, 1, null, 1));
							}) ();
						}
					}
					else {
						var head = __getslice__ (string, 0, m.index, 1);
						(function () {
							var __accu0__ = ret;
							return __call__ (__accu0__.append, __accu0__, head);
						}) ();
						if (__t__ (__gt__ (__call__ (len, null, m), 1))) {
							(function () {
								var __accu0__ = ret;
								return __call__ (__accu0__.extend, __accu0__, __getslice__ (m, 1, null, 1));
							}) ();
						}
					}
					var lastM = m;
				}
				else {
					break;
				}
			}
			if (__t__ (lastM !== null)) {
				var endPos = __add__ (lastM.index, __call__ (len, null, __getitem__ (lastM, 0)));
				var end = __getslice__ (string, endPos, null, 1);
				(function () {
					var __accu0__ = ret;
					return __call__ (__accu0__.append, __accu0__, end);
				}) ();
			}
			return ret;
		}
	});},
	get _findAllMatches () {return __get__ (this, function (self, string, pos, endpos) {
		if (typeof pos == 'undefined' || (pos != null && pos.hasOwnProperty ("__kwargtrans__"))) {;
			var pos = 0;
		};
		if (typeof endpos == 'undefined' || (endpos != null && endpos.hasOwnProperty ("__kwargtrans__"))) {;
			var endpos = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'string': var string = __allkwargs0__ [__attrib0__]; break;
						case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
						case 'endpos': var endpos = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var target = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__._getTargetStr, __accu0__, string, pos, endpos);
		}) ();
		var flags = self._flags;
		var flags = __call__ (__ior__, null, flags, GLOBAL);
		var __left0__ = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__._compileWrapper, __accu0__, self._jspattern, flags);
		}) ();
		var _ = __left0__ [0];
		var rObj = __left0__ [1];
		var ret = [];
		while (__t__ (true)) {
			var m = (function () {
				var __accu0__ = rObj;
				return __call__ (__accu0__.exec, __accu0__, target);
			}) ();
			if (__t__ (m)) {
				(function () {
					var __accu0__ = ret;
					return __call__ (__accu0__.append, __accu0__, m);
				}) ();
			}
			else {
				break;
			}
		}
		return ret;
	});},
	get findall () {return __get__ (this, function (self, string, pos, endpos) {
		if (typeof pos == 'undefined' || (pos != null && pos.hasOwnProperty ("__kwargtrans__"))) {;
			var pos = 0;
		};
		if (typeof endpos == 'undefined' || (endpos != null && endpos.hasOwnProperty ("__kwargtrans__"))) {;
			var endpos = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'string': var string = __allkwargs0__ [__attrib0__]; break;
						case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
						case 'endpos': var endpos = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var mlist = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__._findAllMatches, __accu0__, string, pos, endpos);
		}) ();
		var mSelect = function (m) {
			if (arguments.length) {
				var __ilastarg0__ = arguments.length - 1;
				if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
					var __allkwargs0__ = arguments [__ilastarg0__--];
					for (var __attrib0__ in __allkwargs0__) {
						switch (__attrib0__) {
							case 'm': var m = __allkwargs0__ [__attrib0__]; break;
						}
					}
				}
			}
			else {
			}
			if (__t__ (__gt__ (__call__ (len, null, m), 2))) {
				return __call__ (tuple, null, __getslice__ (m, 1, null, 1));
			}
			else if (__t__ (__eq__ (__call__ (len, null, m), 2))) {
				return __getitem__ (m, 1);
			}
			else {
				return __getitem__ (m, 0);
			}
		};
		var ret = __call__ (map, null, mSelect, mlist);
		return ret;
	});},
	get finditer () {return __get__ (this, function (self, string, pos, endpos) {
		if (typeof endpos == 'undefined' || (endpos != null && endpos.hasOwnProperty ("__kwargtrans__"))) {;
			var endpos = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'string': var string = __allkwargs0__ [__attrib0__]; break;
						case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
						case 'endpos': var endpos = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var mlist = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__._findAllMatches, __accu0__, string, pos, endpos);
		}) ();
		var ret = __call__ (map, null, (function __lambda__ (m) {
			if (arguments.length) {
				var __ilastarg0__ = arguments.length - 1;
				if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
					var __allkwargs0__ = arguments [__ilastarg0__--];
					for (var __attrib0__ in __allkwargs0__) {
						switch (__attrib0__) {
							case 'm': var m = __allkwargs0__ [__attrib0__]; break;
						}
					}
				}
			}
			else {
			}
			return __call__ (Match, null, m, string, 0, __call__ (len, null, string), self, self._groupindex);
		}), mlist);
		return __call__ (py_iter, null, ret);
	});},
	get sub () {return __get__ (this, function (self, repl, string, count) {
		if (typeof count == 'undefined' || (count != null && count.hasOwnProperty ("__kwargtrans__"))) {;
			var count = 0;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'repl': var repl = __allkwargs0__ [__attrib0__]; break;
						case 'string': var string = __allkwargs0__ [__attrib0__]; break;
						case 'count': var count = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __left0__ = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.subn, __accu0__, repl, string, count);
		}) ();
		var ret = __left0__ [0];
		var _ = __left0__ [1];
		return ret;
	});},
	get subn () {return __get__ (this, function (self, repl, string, count) {
		if (typeof count == 'undefined' || (count != null && count.hasOwnProperty ("__kwargtrans__"))) {;
			var count = 0;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'repl': var repl = __allkwargs0__ [__attrib0__]; break;
						case 'string': var string = __allkwargs0__ [__attrib0__]; break;
						case 'count': var count = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var flags = self._flags;
		var flags = __call__ (__ior__, null, flags, GLOBAL);
		var __left0__ = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__._compileWrapper, __accu0__, self._jspattern, flags);
		}) ();
		var _ = __left0__ [0];
		var rObj = __left0__ [1];
		var ret = '';
		var totalMatch = 0;
		var lastEnd = __neg__ (1);
		while (__t__ (true)) {
			if (__t__ (__gt__ (count, 0))) {
				if (__t__ (__ge__ (totalMatch, count))) {
					if (__t__ (__lt__ (lastEnd, 0))) {
						return tuple ([ret, totalMatch]);
					}
					else {
						var ret = __call__ (__iadd__, null, ret, __getslice__ (string, lastEnd, m.index, 1));
						return tuple ([ret, totalMatch]);
					}
				}
			}
			var m = (function () {
				var __accu0__ = rObj;
				return __call__ (__accu0__.exec, __accu0__, string);
			}) ();
			if (__t__ (m)) {
				if (__t__ (__lt__ (lastEnd, 0))) {
					var ret = __call__ (__iadd__, null, ret, __getslice__ (string, 0, m.index, 1));
				}
				else {
					var ret = __call__ (__iadd__, null, ret, __getslice__ (string, lastEnd, m.index, 1));
				}
				if (__t__ (__call__ (callable, null, repl))) {
					var content = __call__ (repl, null, __call__ (Match, null, m, string, 0, __call__ (len, null, string), self, self._groupindex));
					var ret = __call__ (__iadd__, null, ret, content);
				}
				else {
					var ret = __call__ (__iadd__, null, ret, repl);
				}
				var totalMatch = __call__ (__iadd__, null, totalMatch, 1);
				var lastEnd = __add__ (m.index, __call__ (len, null, __getitem__ (m, 0)));
			}
			else if (__t__ (__lt__ (lastEnd, 0))) {
				return tuple ([string, 0]);
			}
			else {
				var ret = __call__ (__iadd__, null, ret, __getslice__ (string, lastEnd, null, 1));
				return tuple ([ret, totalMatch]);
			}
		}
	});}
});
Object.defineProperty (Regex, 'pattern', property.call (Regex, Regex._getPattern, Regex._setPattern));
Object.defineProperty (Regex, 'flags', property.call (Regex, Regex._getFlags, Regex._setFlags));
Object.defineProperty (Regex, 'groups', property.call (Regex, Regex._getGroups, Regex._setGroups));
Object.defineProperty (Regex, 'groupindex', property.call (Regex, Regex._getGroupIndex, Regex._setGroupIndex));
export var PyRegExp =  __class__ ('PyRegExp', [Regex], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, pyPattern, flags) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'pyPattern': var pyPattern = __allkwargs0__ [__attrib0__]; break;
						case 'flags': var flags = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __left0__ = __call__ (translate, null, pyPattern);
		var jsTokens = __left0__ [0];
		var inlineFlags = __left0__ [1];
		var namedGroups = __left0__ [2];
		var nCapGroups = __left0__ [3];
		var n_splits = __left0__ [4];
		var flags = __call__ (__ior__, null, flags, inlineFlags);
		var jsPattern = (function () {
			var __accu0__ = '';
			return __call__ (__accu0__.join, __accu0__, jsTokens);
		}) ();
		(function () {
			var __accu0__ = Regex;
			return __call__ (__accu0__.__init__, __accu0__, self, jsPattern, flags);
		}) ();
		self._pypattern = pyPattern;
		self._nsplits = n_splits;
		self._jsTokens = jsTokens;
		self._capgroups = nCapGroups;
		self._groupindex = namedGroups;
	});}
});
export var compile = function (pattern, flags) {
	if (typeof flags == 'undefined' || (flags != null && flags.hasOwnProperty ("__kwargtrans__"))) {;
		var flags = 0;
	};
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'pattern': var pattern = __allkwargs0__ [__attrib0__]; break;
					case 'flags': var flags = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	if (__t__ (__and__ (flags, JSSTRICT))) {
		var p = __call__ (Regex, null, pattern, flags);
	}
	else {
		var p = __call__ (PyRegExp, null, pattern, flags);
	}
	return p;
};
export var search = function (pattern, string, flags) {
	if (typeof flags == 'undefined' || (flags != null && flags.hasOwnProperty ("__kwargtrans__"))) {;
		var flags = 0;
	};
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'pattern': var pattern = __allkwargs0__ [__attrib0__]; break;
					case 'string': var string = __allkwargs0__ [__attrib0__]; break;
					case 'flags': var flags = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var p = __call__ (compile, null, pattern, flags);
	return (function () {
		var __accu0__ = p;
		return __call__ (__accu0__.search, __accu0__, string);
	}) ();
};
export var match = function (pattern, string, flags) {
	if (typeof flags == 'undefined' || (flags != null && flags.hasOwnProperty ("__kwargtrans__"))) {;
		var flags = 0;
	};
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'pattern': var pattern = __allkwargs0__ [__attrib0__]; break;
					case 'string': var string = __allkwargs0__ [__attrib0__]; break;
					case 'flags': var flags = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var p = __call__ (compile, null, pattern, flags);
	return (function () {
		var __accu0__ = p;
		return __call__ (__accu0__.match, __accu0__, string);
	}) ();
};
export var fullmatch = function (pattern, string, flags) {
	if (typeof flags == 'undefined' || (flags != null && flags.hasOwnProperty ("__kwargtrans__"))) {;
		var flags = 0;
	};
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'pattern': var pattern = __allkwargs0__ [__attrib0__]; break;
					case 'string': var string = __allkwargs0__ [__attrib0__]; break;
					case 'flags': var flags = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var p = __call__ (compile, null, pattern, flags);
	return (function () {
		var __accu0__ = p;
		return __call__ (__accu0__.fullmatch, __accu0__, string);
	}) ();
};
export var py_split = function (pattern, string, maxsplit, flags) {
	if (typeof maxsplit == 'undefined' || (maxsplit != null && maxsplit.hasOwnProperty ("__kwargtrans__"))) {;
		var maxsplit = 0;
	};
	if (typeof flags == 'undefined' || (flags != null && flags.hasOwnProperty ("__kwargtrans__"))) {;
		var flags = 0;
	};
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'pattern': var pattern = __allkwargs0__ [__attrib0__]; break;
					case 'string': var string = __allkwargs0__ [__attrib0__]; break;
					case 'maxsplit': var maxsplit = __allkwargs0__ [__attrib0__]; break;
					case 'flags': var flags = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var p = __call__ (compile, null, pattern, flags);
	return (function () {
		var __accu0__ = p;
		return __call__ (__accu0__.py_split, __accu0__, string, maxsplit);
	}) ();
};
export var findall = function (pattern, string, flags) {
	if (typeof flags == 'undefined' || (flags != null && flags.hasOwnProperty ("__kwargtrans__"))) {;
		var flags = 0;
	};
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'pattern': var pattern = __allkwargs0__ [__attrib0__]; break;
					case 'string': var string = __allkwargs0__ [__attrib0__]; break;
					case 'flags': var flags = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var p = __call__ (compile, null, pattern, flags);
	return (function () {
		var __accu0__ = p;
		return __call__ (__accu0__.findall, __accu0__, string);
	}) ();
};
export var finditer = function (pattern, string, flags) {
	if (typeof flags == 'undefined' || (flags != null && flags.hasOwnProperty ("__kwargtrans__"))) {;
		var flags = 0;
	};
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'pattern': var pattern = __allkwargs0__ [__attrib0__]; break;
					case 'string': var string = __allkwargs0__ [__attrib0__]; break;
					case 'flags': var flags = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var p = __call__ (compile, null, pattern, flags);
	return (function () {
		var __accu0__ = p;
		return __call__ (__accu0__.finditer, __accu0__, string);
	}) ();
};
export var sub = function (pattern, repl, string, count, flags) {
	if (typeof count == 'undefined' || (count != null && count.hasOwnProperty ("__kwargtrans__"))) {;
		var count = 0;
	};
	if (typeof flags == 'undefined' || (flags != null && flags.hasOwnProperty ("__kwargtrans__"))) {;
		var flags = 0;
	};
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'pattern': var pattern = __allkwargs0__ [__attrib0__]; break;
					case 'repl': var repl = __allkwargs0__ [__attrib0__]; break;
					case 'string': var string = __allkwargs0__ [__attrib0__]; break;
					case 'count': var count = __allkwargs0__ [__attrib0__]; break;
					case 'flags': var flags = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var p = __call__ (compile, null, pattern, flags);
	return (function () {
		var __accu0__ = p;
		return __call__ (__accu0__.sub, __accu0__, repl, string, count);
	}) ();
};
export var subn = function (pattern, repl, string, count, flags) {
	if (typeof count == 'undefined' || (count != null && count.hasOwnProperty ("__kwargtrans__"))) {;
		var count = 0;
	};
	if (typeof flags == 'undefined' || (flags != null && flags.hasOwnProperty ("__kwargtrans__"))) {;
		var flags = 0;
	};
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'pattern': var pattern = __allkwargs0__ [__attrib0__]; break;
					case 'repl': var repl = __allkwargs0__ [__attrib0__]; break;
					case 'string': var string = __allkwargs0__ [__attrib0__]; break;
					case 'count': var count = __allkwargs0__ [__attrib0__]; break;
					case 'flags': var flags = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var p = __call__ (compile, null, pattern, flags);
	return (function () {
		var __accu0__ = p;
		return __call__ (__accu0__.subn, __accu0__, repl, string, count);
	}) ();
};
export var escape = function (string) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'string': var string = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var ret = null;
	var replfunc = function (m) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'm': var m = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (__eq__ (__getitem__ (m, 0), '\\'))) {
			return '\\\\\\\\';
		}
		else {
			return __add__ ('\\\\', __getitem__ (m, 0));
		}
	};
	
	        var r = /[^A-Za-z:;\d]/g;
	        ret = string.replace(r, replfunc);
	        
	if (__t__ (ret !== null)) {
		return ret;
	}
	else {
		var __except0__ = __call__ (Exception, null, 'Failed to escape the passed string');
		__except0__.__cause__ = null;
		throw __except0__;
	}
};
export var purge = function () {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
			}
		}
	}
	else {
	}
	// pass;
};

