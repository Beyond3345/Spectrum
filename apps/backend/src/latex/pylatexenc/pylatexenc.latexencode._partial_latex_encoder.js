var logging = {};
import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import * as _walker from './pylatexenc.latexwalker._walker.js';
import {RULE_CALLABLE, UnicodeToLatexConversionRule, UnicodeToLatexEncoder} from './pylatexenc.latexencode._unicode_to_latex_encoder.js';
import * as __module_logging__ from './logging.js';
__nest__ (logging, '', __module_logging__);
export {UnicodeToLatexEncoder, RULE_CALLABLE, UnicodeToLatexConversionRule, _walker};
var __name__ = 'pylatexenc.latexencode._partial_latex_encoder';
export var logger = (function () {
	var __accu0__ = logging;
	return __call__ (__accu0__.getLogger, __accu0__, __name__);
}) ();
export var PartialLatexToLatexEncoder =  __class__ ('PartialLatexToLatexEncoder', [UnicodeToLatexEncoder], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, keep_latex_chars, conversion_rules) {
		if (typeof keep_latex_chars == 'undefined' || (keep_latex_chars != null && keep_latex_chars.hasOwnProperty ("__kwargtrans__"))) {;
			var keep_latex_chars = '\\${}^_';
		};
		if (typeof conversion_rules == 'undefined' || (conversion_rules != null && conversion_rules.hasOwnProperty ("__kwargtrans__"))) {;
			var conversion_rules = null;
		};
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'keep_latex_chars': var keep_latex_chars = __allkwargs0__ [__attrib0__]; break;
						case 'conversion_rules': var conversion_rules = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		var base_conversion_rules = conversion_rules;
		if (__t__ (base_conversion_rules === null)) {
			var base_conversion_rules = ['defaults'];
		}
		__call__ (__call__ (__super__, null, PartialLatexToLatexEncoder, '__init__'), null, self, __kwargtrans__ (__mergekwargtrans__ ({conversion_rules: __add__ ([__call__ (UnicodeToLatexConversionRule, null, __kwargtrans__ ({rule_type: RULE_CALLABLE, rule: self._do_partial_latex_encode_step, replacement_latex_protection: 'none'}))], base_conversion_rules)}, kwargs)));
		self.keep_latex_chars = keep_latex_chars;
	});},
	get _do_partial_latex_encode_step () {return __get__ (this, function (self, s, pos) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 's': var s = __allkwargs0__ [__attrib0__]; break;
						case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (__in__ (__getitem__ (s, pos), self.keep_latex_chars))) {
			var lw = (function () {
				var __accu0__ = _walker;
				return __call__ (__accu0__.LatexWalker, __accu0__, s, __kwargtrans__ ({tolerant_parsing: false}));
			}) ();
			var ps = (function () {
				var __accu0__ = lw;
				return __call__ (__accu0__.make_parsing_state, __accu0__);
			}) ();
			var tok = (function () {
				var __accu0__ = (function () {
					var __accu1__ = lw;
					return __call__ (__accu1__.make_token_reader, __accu1__, __kwargtrans__ ({pos: pos}));
				}) ();
				return __call__ (__accu0__.peek_token, __accu0__, __kwargtrans__ ({parsing_state: ps}));
			}) ();
			var tok_as_latex = __add__ (tok.pre_space, __getslice__ (s, tok.pos, __add__ (tok.pos, tok.len), 1));
			return tuple ([__sub__ (__add__ (tok.pos, tok.len), pos), tok_as_latex]);
		}
		return null;
	});}
});

