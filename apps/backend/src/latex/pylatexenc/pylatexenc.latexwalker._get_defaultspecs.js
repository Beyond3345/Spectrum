import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import {specs} from './pylatexenc.latexwalker._defaultspecs.js';
import * as macrospec from './pylatexenc.macrospec.js';
export {macrospec, specs};
var __name__ = 'pylatexenc.latexwalker._get_defaultspecs';
export var get_default_latex_context_db = function () {
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
	var db = (function () {
		var __accu0__ = macrospec;
		return __call__ (__accu0__.LatexContextDb, __accu0__);
	}) ();
	var __iterable0__ = specs;
	for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
		var __left0__ = __getitem__ (__iterable0__, __index0__);
		var cat = __left0__ [0];
		var catspecs = __left0__ [1];
		(function () {
			var __accu0__ = db;
			return __call__ (__accu0__.add_context_category, __accu0__, cat, __kwargtrans__ ({macros: __getitem__ (catspecs, 'macros'), environments: __getitem__ (catspecs, 'environments'), specials: __getitem__ (catspecs, 'specials')}));
		}) ();
	}
	(function () {
		var __accu0__ = db;
		return __call__ (__accu0__.set_unknown_macro_spec, __accu0__, (function () {
			var __accu1__ = macrospec;
			return __call__ (__accu1__.MacroSpec, __accu1__, '');
		}) ());
	}) ();
	(function () {
		var __accu0__ = db;
		return __call__ (__accu0__.set_unknown_environment_spec, __accu0__, (function () {
			var __accu1__ = macrospec;
			return __call__ (__accu1__.EnvironmentSpec, __accu1__, '');
		}) ());
	}) ();
	return db;
};

