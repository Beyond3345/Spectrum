import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
var __name__ = 'pylatexenc.latexnodes._token';
export var LatexToken =  __class__ ('LatexToken', [object], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, tok, arg, pos, pos_end, pre_space, post_space) {
		if (typeof pos_end == 'undefined' || (pos_end != null && pos_end.hasOwnProperty ("__kwargtrans__"))) {;
			var pos_end = null;
		};
		if (typeof pre_space == 'undefined' || (pre_space != null && pre_space.hasOwnProperty ("__kwargtrans__"))) {;
			var pre_space = '';
		};
		if (typeof post_space == 'undefined' || (post_space != null && post_space.hasOwnProperty ("__kwargtrans__"))) {;
			var post_space = '';
		};
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'tok': var tok = __allkwargs0__ [__attrib0__]; break;
						case 'arg': var arg = __allkwargs0__ [__attrib0__]; break;
						case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
						case 'pos_end': var pos_end = __allkwargs0__ [__attrib0__]; break;
						case 'pre_space': var pre_space = __allkwargs0__ [__attrib0__]; break;
						case 'post_space': var post_space = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		var len_ = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'len', null);
		}) ();
		self.tok = tok;
		self.arg = arg;
		self.pos = pos;
		self.pos_end = pos_end;
		self.pre_space = pre_space;
		self.post_space = post_space;
		if (__t__ (__t__ (pos_end === null) && __t__ (len_ !== null) && pos !== null)) {
			self.pos_end = __add__ (pos, len_);
		}
		if (__t__ (kwargs)) {
			var __except0__ = __call__ (ValueError, null, __add__ ('Unexpected arguments to LatexToken(): ', __call__ (repr, null, kwargs)));
			__except0__.__cause__ = null;
			throw __except0__;
		}
		self._fields = ['tok', 'arg', 'pos', 'pos_end', 'pre_space'];
		if (__t__ (__in__ (self.tok, tuple (['macro', 'comment'])))) {
			(function () {
				var __accu0__ = self._fields;
				return __call__ (__accu0__.append, __accu0__, 'post_space');
			}) ();
		}
		__call__ (__call__ (__super__, null, LatexToken, '__init__'), null, self);
	});},
	get _get_len () {return __get__ (this, function (self) {
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
		if (__t__ (__t__ (self.pos === null) || self.pos_end === null)) {
			return null;
		}
		return __sub__ (self.pos_end, self.pos);
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
		return __add__ (__add__ ('LatexToken(', (function () {
			var __accu0__ = ', ';
			return __call__ (__accu0__.join, __accu0__, (function () {
				var __accu1__ = [];
				var __iterable0__ = self._fields;
				for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
					var k = __getitem__ (__iterable0__, __index0__);
					(function () {
						var __accu2__ = __accu1__;
						return __call__ (__accu2__.append, __accu2__, (function () {
							var __accu3__ = '{}={!r}';
							return __call__ (__accu3__.format, __accu3__, k, __call__ (getattr, null, self, k));
						}) ());
					}) ();
				}
				return __accu1__;
			}) ());
		}) ()), ')');
	});},
	get __str__ () {return __get__ (this, function (self) {
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
			return __call__ (__accu0__.__repr__, __accu0__);
		}) ();
	});},
	get __eq__ () {return __get__ (this, function (self, other) {
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
		return __call__ (all, null, (function () {
			var __accu0__ = [];
			var __iterable0__ = self._fields;
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var f = __getitem__ (__iterable0__, __index0__);
				(function () {
					var __accu1__ = __accu0__;
					return __call__ (__accu1__.append, __accu1__, __t__ (__t__ (__call__ (getattr, null, self, f) === null) && __call__ (getattr, null, other, f) === null) || __eq__ (__call__ (getattr, null, self, f), __call__ (getattr, null, other, f)));
				}) ();
			}
			return py_iter (__accu0__);
		}) ());
	});},
	__hash__: null
});
Object.defineProperty (LatexToken, 'len', property.call (LatexToken, LatexToken._get_len));;

