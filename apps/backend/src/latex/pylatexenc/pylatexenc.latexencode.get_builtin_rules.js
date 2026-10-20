import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import * as _uni2latexmap_xml from './pylatexenc.latexencode._uni2latexmap_xml.js';
import {uni2latex as _uni2latex} from './pylatexenc.latexencode._uni2latexmap.js';
import {RULE_CALLABLE, RULE_DICT, RULE_REGEX, UnicodeToLatexConversionRule} from './pylatexenc.latexencode._rule.js';
export {RULE_REGEX, UnicodeToLatexConversionRule, RULE_CALLABLE, _uni2latex, RULE_DICT, _uni2latexmap_xml};
var __name__ = 'pylatexenc.latexencode.get_builtin_rules';
export var _MappingProxyType = dict;
export var get_builtin_uni2latex_dict = function () {
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
	return __call__ (_MappingProxyType, null, _uni2latex);
};
export var get_builtin_conversion_rules = function (builtin_name) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'builtin_name': var builtin_name = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	if (__t__ (__eq__ (builtin_name, 'defaults'))) {
		return [__call__ (UnicodeToLatexConversionRule, null, __kwargtrans__ ({rule_type: RULE_DICT, rule: __call__ (get_builtin_uni2latex_dict, null)}))];
	}
	if (__t__ (__eq__ (builtin_name, 'unicode-xml'))) {
		return [__call__ (UnicodeToLatexConversionRule, null, __kwargtrans__ ({rule_type: RULE_DICT, rule: _uni2latexmap_xml.uni2latex}))];
	}
	var __except0__ = __call__ (ValueError, null, (function () {
		var __accu0__ = 'Unknown builtin rule set: {}';
		return __call__ (__accu0__.format, __accu0__, builtin_name);
	}) ());
	__except0__.__cause__ = null;
	throw __except0__;
};

