import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
var __name__ = 'pylatexenc.latexencode._rule';
export var RULE_DICT = 0;
export var RULE_REGEX = 1;
export var RULE_CALLABLE = 2;
export var UnicodeToLatexConversionRule =  __class__ ('UnicodeToLatexConversionRule', [object], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, rule_type, rule, replacement_latex_protection) {
		if (typeof rule == 'undefined' || (rule != null && rule.hasOwnProperty ("__kwargtrans__"))) {;
			var rule = null;
		};
		if (typeof replacement_latex_protection == 'undefined' || (replacement_latex_protection != null && replacement_latex_protection.hasOwnProperty ("__kwargtrans__"))) {;
			var replacement_latex_protection = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'rule_type': var rule_type = __allkwargs0__ [__attrib0__]; break;
						case 'rule': var rule = __allkwargs0__ [__attrib0__]; break;
						case 'replacement_latex_protection': var replacement_latex_protection = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		self.rule_type = rule_type;
		self.rule = rule;
		self.replacement_latex_protection = replacement_latex_protection;
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
			var __accu0__ = '{}(rule_type={!r}, rule=<{}>, replacement_latex_protection={})';
			return __call__ (__accu0__.format, __accu0__, self.__class__.__name__, self.rule_type, py_typeof (self.rule).__name__, __call__ (repr, null, self.replacement_latex_protection));
		}) ();
	});}
});

