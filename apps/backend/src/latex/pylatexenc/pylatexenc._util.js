var bisect = {};
import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import {ChainMap} from './collections.js';
import * as __module_bisect__ from './bisect.js';
__nest__ (bisect, '', __module_bisect__);
export {ChainMap};
var __name__ = 'pylatexenc._util';
export var bisect_right = bisect.bisect_right;
export var LineNumbersCalculator =  __class__ ('LineNumbersCalculator', [object], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, s, line_number_offset, first_line_column_offset, column_offset) {
		if (typeof line_number_offset == 'undefined' || (line_number_offset != null && line_number_offset.hasOwnProperty ("__kwargtrans__"))) {;
			var line_number_offset = 1;
		};
		if (typeof first_line_column_offset == 'undefined' || (first_line_column_offset != null && first_line_column_offset.hasOwnProperty ("__kwargtrans__"))) {;
			var first_line_column_offset = 0;
		};
		if (typeof column_offset == 'undefined' || (column_offset != null && column_offset.hasOwnProperty ("__kwargtrans__"))) {;
			var column_offset = 0;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 's': var s = __allkwargs0__ [__attrib0__]; break;
						case 'line_number_offset': var line_number_offset = __allkwargs0__ [__attrib0__]; break;
						case 'first_line_column_offset': var first_line_column_offset = __allkwargs0__ [__attrib0__]; break;
						case 'column_offset': var column_offset = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, LineNumbersCalculator, '__init__'), null, self);
		self.line_number_offset = line_number_offset;
		self.first_line_column_offset = first_line_column_offset;
		self.column_offset = column_offset;
		var find_all_new_lines = function* (x) {
			if (arguments.length) {
				var __ilastarg0__ = arguments.length - 1;
				if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
					var __allkwargs0__ = arguments [__ilastarg0__--];
					for (var __attrib0__ in __allkwargs0__) {
						switch (__attrib0__) {
							case 'x': var x = __allkwargs0__ [__attrib0__]; break;
						}
					}
				}
			}
			else {
			}
			yield 0;
			var k = 0;
			while (__t__ (__lt__ (k, __call__ (len, null, x)))) {
				var k = (function () {
					var __accu0__ = x;
					return __call__ (__accu0__.find, __accu0__, '\n', k);
				}) ();
				if (__t__ (__eq__ (k, __neg__ (1)))) {
					return ;
				}
				var k = __call__ (__iadd__, null, k, 1);
				yield k;
			}
			};
		self._pos_new_lines = __call__ (list, null, __call__ (find_all_new_lines, null, s));
	});},
	get pos_to_lineno_colno () {return __get__ (this, function (self, pos, as_dict) {
		if (typeof as_dict == 'undefined' || (as_dict != null && as_dict.hasOwnProperty ("__kwargtrans__"))) {;
			var as_dict = false;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
						case 'as_dict': var as_dict = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (pos === null)) {
			if (__t__ (as_dict)) {
				return dict ({'lineno': null, 'colno': null});
			}
			return tuple ([null, null]);
		}
		var line_no = __sub__ (__call__ (bisect_right, null, self._pos_new_lines, pos), 1);
		assert (__t__ (__ge__ (line_no, 0)) && __lt__ (line_no, __call__ (len, null, self._pos_new_lines)));
		var col_no = __sub__ (pos, __getitem__ (self._pos_new_lines, line_no));
		if (__t__ (__eq__ (line_no, 0))) {
			var col_no = __call__ (__iadd__, null, col_no, self.first_line_column_offset);
		}
		else {
			var col_no = __call__ (__iadd__, null, col_no, self.column_offset);
		}
		var line_no = __call__ (__iadd__, null, line_no, self.line_number_offset);
		if (__t__ (as_dict)) {
			return dict ({'lineno': line_no, 'colno': col_no});
		}
		return tuple ([line_no, col_no]);
	});}
});
export var PushPropOverride =  __class__ ('PushPropOverride', [object], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, obj, propname, new_value) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'obj': var obj = __allkwargs0__ [__attrib0__]; break;
						case 'propname': var propname = __allkwargs0__ [__attrib0__]; break;
						case 'new_value': var new_value = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, PushPropOverride, '__init__'), null, self);
		self.obj = obj;
		self.propname = propname;
		self.new_value = new_value;
	});},
	get __enter__ () {return __get__ (this, function (self) {
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
		if (__t__ (self.new_value !== null)) {
			self.initval = __call__ (getattr, null, self.obj, self.propname);
			__call__ (setattr, null, self.obj, self.propname, self.new_value);
		}
		return self;
	});},
	get __exit__ () {return __get__ (this, function (self, py_metatype, value, traceback) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'py_metatype': var py_metatype = __allkwargs0__ [__attrib0__]; break;
						case 'value': var value = __allkwargs0__ [__attrib0__]; break;
						case 'traceback': var traceback = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (self.new_value !== null)) {
			__call__ (setattr, null, self.obj, self.propname, self.initval);
		}
	});}
});
export var pylatexenc_deprecated_ver = (function __lambda__ () {
	var kwargs = dict ();
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
				}
			}
			delete kwargs.__kwargtrans__;
		}
		var args = tuple ([].slice.apply (arguments).slice (0, __ilastarg0__ + 1));
	}
	else {
		var args = tuple ();
	}
	return null;
});
export var pylatexenc_deprecated_2 = (function __lambda__ () {
	var kwargs = dict ();
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
				}
			}
			delete kwargs.__kwargtrans__;
		}
		var args = tuple ([].slice.apply (arguments).slice (0, __ilastarg0__ + 1));
	}
	else {
		var args = tuple ();
	}
	return null;
});
export var pylatexenc_deprecated_3 = (function __lambda__ () {
	var kwargs = dict ();
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
				}
			}
			delete kwargs.__kwargtrans__;
		}
		var args = tuple ([].slice.apply (arguments).slice (0, __ilastarg0__ + 1));
	}
	else {
		var args = tuple ();
	}
	return null;
});
export var LazyDict = null;

