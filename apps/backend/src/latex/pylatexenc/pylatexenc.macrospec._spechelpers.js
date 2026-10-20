import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import {EnvironmentSpec, MacroSpec, SpecialsSpec} from './pylatexenc.macrospec._specclasses.js';
export {EnvironmentSpec, MacroSpec, SpecialsSpec};
var __name__ = 'pylatexenc.macrospec._spechelpers';
export var std_macro = function (macname) {
	var kwargs = dict ();
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'macname': var macname = __allkwargs0__ [__attrib0__]; break;
					default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
				}
			}
			delete kwargs.__kwargtrans__;
		}
		var args = tuple ([].slice.apply (arguments).slice (1, __ilastarg0__ + 1));
	}
	else {
		var args = tuple ();
	}
	if (__t__ (__call__ (isinstance, null, macname, tuple))) {
		if (__t__ (__ne__ (__call__ (len, null, args), 0))) {
			var __except0__ = __call__ (py_TypeError, null, 'No positional arguments expected if first argument is a tuple');
			__except0__.__cause__ = null;
			throw __except0__;
		}
		var args = __call__ (tuple, null, __getslice__ (macname, 1, null, 1));
		var macname = __getitem__ (macname, 0);
	}
	if (__t__ (__call__ (isinstance, null, macname, MacroSpec))) {
		if (__t__ (__ne__ (__call__ (len, null, args), 0))) {
			var __except0__ = __call__ (py_TypeError, null, 'No positional arguments expected if first argument is a MacroSpec');
			__except0__.__cause__ = null;
			throw __except0__;
		}
		return macname;
	}
	if (__t__ (__call__ (isinstance, null, macname, EnvironmentSpec))) {
		if (__t__ (__ne__ (__call__ (len, null, args), 0))) {
			var __except0__ = __call__ (py_TypeError, null, 'No positional arguments expected if first argument is a EnvironmentSpec');
			__except0__.__cause__ = null;
			throw __except0__;
		}
		return macname;
	}
	if (__t__ (__eq__ (__call__ (len, null, args), 1))) {
		var argspec = __getitem__ (args, 0);
	}
	else if (__t__ (__ne__ (__call__ (len, null, args), 2))) {
		var __except0__ = __call__ (py_TypeError, null, (function () {
			var __accu0__ = 'Wrong number of arguments for std_macro, macname={!r}, args={!r}';
			return __call__ (__accu0__.format, __accu0__, macname, args);
		}) ());
		__except0__.__cause__ = null;
		throw __except0__;
	}
	else if (__t__ (__t__ (!__t__ ((__getitem__ (args, 0)))) && __call__ (isinstance, null, __getitem__ (args, 1), str))) {
		var argspec = __getitem__ (args, 1);
	}
	else {
		var argspec = '';
		if (__t__ (__getitem__ (args, 0))) {
			var argspec = '[';
		}
		var argspec = __call__ (__iadd__, null, argspec, __mul__ ('{', __getitem__ (args, 1)));
	}
	if (__t__ ((function () {
		var __accu0__ = kwargs;
		return __call__ (__accu0__.py_get, __accu0__, '_argspec_string_only', false);
	}) ())) {
		return argspec;
	}
	if (__t__ ((function () {
		var __accu0__ = kwargs;
		return __call__ (__accu0__.py_get, __accu0__, 'make_environment_spec', false);
	}) ())) {
		return __call__ (EnvironmentSpec, null, macname, argspec, __kwargtrans__ ({is_math_mode: (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_get, __accu0__, 'environment_is_math_mode', null);
		}) ()}));
	}
	return __call__ (MacroSpec, null, macname, argspec);
};
export var std_environment = function (envname) {
	var kwargs = dict ();
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'envname': var envname = __allkwargs0__ [__attrib0__]; break;
					default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
				}
			}
			delete kwargs.__kwargtrans__;
		}
		var args = tuple ([].slice.apply (arguments).slice (1, __ilastarg0__ + 1));
	}
	else {
		var args = tuple ();
	}
	var is_math_mode = (function () {
		var __accu0__ = kwargs;
		return __call__ (__accu0__.py_pop, __accu0__, 'is_math_mode', null);
	}) ();
	var kwargs2 = __call__ (dict, null, kwargs);
	(function () {
		var __accu0__ = kwargs2;
		return __call__ (__accu0__.py_update, __accu0__, __kwargtrans__ ({make_environment_spec: true, environment_is_math_mode: is_math_mode}));
	}) ();
	return __call__ (std_macro, null, envname, ...args, __kwargtrans__ (kwargs2));
};
export var std_specials = function (specials_chars) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'specials_chars': var specials_chars = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	return __call__ (SpecialsSpec, null, specials_chars, null);
};

