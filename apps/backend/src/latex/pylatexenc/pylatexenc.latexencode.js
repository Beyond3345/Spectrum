var functools = {};
var itertools = {};
var logging = {};
var unicodedata = {};
import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import {PartialLatexToLatexEncoder} from './pylatexenc.latexencode._partial_latex_encoder.js';
import {RULE_CALLABLE, RULE_DICT, RULE_REGEX, UnicodeToLatexConversionRule, UnicodeToLatexEncoder} from './pylatexenc.latexencode._unicode_to_latex_encoder.js';
import * as _util from './pylatexenc._util.js';
import * as __module_itertools__ from './itertools.js';
__nest__ (itertools, '', __module_itertools__);
import * as __module_functools__ from './functools.js';
__nest__ (functools, '', __module_functools__);
import * as __module_logging__ from './logging.js';
__nest__ (logging, '', __module_logging__);
import * as __module_unicodedata__ from './unicodedata.js';
__nest__ (unicodedata, '', __module_unicodedata__);
export {RULE_REGEX, UnicodeToLatexConversionRule, _util, PartialLatexToLatexEncoder, RULE_CALLABLE, UnicodeToLatexEncoder, RULE_DICT};
var __name__ = 'pylatexenc.latexencode';
export var logger = (function () {
	var __accu0__ = logging;
	return __call__ (__accu0__.getLogger, __accu0__, __name__);
}) ();
export var _u2l_obj_cache = dict ({});
export var unicode_to_latex = function (s, non_ascii_only, replacement_latex_protection, unknown_char_policy, unknown_char_warning) {
	if (typeof non_ascii_only == 'undefined' || (non_ascii_only != null && non_ascii_only.hasOwnProperty ("__kwargtrans__"))) {;
		var non_ascii_only = false;
	};
	if (typeof replacement_latex_protection == 'undefined' || (replacement_latex_protection != null && replacement_latex_protection.hasOwnProperty ("__kwargtrans__"))) {;
		var replacement_latex_protection = 'braces';
	};
	if (typeof unknown_char_policy == 'undefined' || (unknown_char_policy != null && unknown_char_policy.hasOwnProperty ("__kwargtrans__"))) {;
		var unknown_char_policy = 'keep';
	};
	if (typeof unknown_char_warning == 'undefined' || (unknown_char_warning != null && unknown_char_warning.hasOwnProperty ("__kwargtrans__"))) {;
		var unknown_char_warning = true;
	};
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 's': var s = __allkwargs0__ [__attrib0__]; break;
					case 'non_ascii_only': var non_ascii_only = __allkwargs0__ [__attrib0__]; break;
					case 'replacement_latex_protection': var replacement_latex_protection = __allkwargs0__ [__attrib0__]; break;
					case 'unknown_char_policy': var unknown_char_policy = __allkwargs0__ [__attrib0__]; break;
					case 'unknown_char_warning': var unknown_char_warning = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var key = tuple ([non_ascii_only, replacement_latex_protection, unknown_char_policy, unknown_char_warning]);
	if (__t__ (__in__ (key, _u2l_obj_cache))) {
		var u = __getitem__ (_u2l_obj_cache, key);
	}
	else {
		var u = __call__ (UnicodeToLatexEncoder, null, __kwargtrans__ ({non_ascii_only: non_ascii_only, replacement_latex_protection: replacement_latex_protection, unknown_char_policy: unknown_char_policy, unknown_char_warning: unknown_char_warning}));
		__setitem__ (_u2l_obj_cache, key, u);
	}
	return (function () {
		var __accu0__ = u;
		return __call__ (__accu0__.unicode_to_latex, __accu0__, s);
	}) ();
};

