var logging = {};
var re = {};
import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import {LatexTokenReaderBase} from './pylatexenc.latexnodes._tokenreaderbase.js';
import {LatexToken} from './pylatexenc.latexnodes._token.js';
import {LatexWalkerEndOfStream, LatexWalkerTokenParseError} from './pylatexenc.latexnodes._exctypes.js';
import * as __module_logging__ from './logging.js';
__nest__ (logging, '', __module_logging__);
import * as __module_re__ from './re.js';
__nest__ (re, '', __module_re__);
export {LatexWalkerEndOfStream, LatexToken, LatexWalkerTokenParseError, LatexTokenReaderBase};
var __name__ = 'pylatexenc.latexnodes._tokenreader';
export var logger = (function () {
	var __accu0__ = logging;
	return __call__ (__accu0__.getLogger, __accu0__, __name__);
}) ();
export var LatexTokenReader =  __class__ ('LatexTokenReader', [LatexTokenReaderBase], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, s) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 's': var s = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, LatexTokenReader, '__init__'), null, self);
		self.s = s;
		self.tolerant_parsing = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'tolerant_parsing', false);
		}) ();
		if (__t__ (kwargs)) {
			var __except0__ = __call__ (ValueError, null, (function () {
				var __accu0__ = 'Invalid argument(s) to LatexTokenReader: {!r}';
				return __call__ (__accu0__.format, __accu0__, kwargs);
			}) ());
			__except0__.__cause__ = null;
			throw __except0__;
		}
		self._pos = 0;
	});},
	get move_to_token () {return __get__ (this, function (self, tok, rewind_pre_space) {
		if (typeof rewind_pre_space == 'undefined' || (rewind_pre_space != null && rewind_pre_space.hasOwnProperty ("__kwargtrans__"))) {;
			var rewind_pre_space = true;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'tok': var tok = __allkwargs0__ [__attrib0__]; break;
						case 'rewind_pre_space': var rewind_pre_space = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (rewind_pre_space)) {
			var new_pos = __sub__ (tok.pos, __call__ (len, null, tok.pre_space));
		}
		else {
			var new_pos = tok.pos;
		}
		(function () {
			var __accu0__ = self;
			return __call__ (__accu0__._advance_to_pos, __accu0__, new_pos);
		}) ();
	});},
	get move_past_token () {return __get__ (this, function (self, tok, fastforward_post_space) {
		if (typeof fastforward_post_space == 'undefined' || (fastforward_post_space != null && fastforward_post_space.hasOwnProperty ("__kwargtrans__"))) {;
			var fastforward_post_space = true;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'tok': var tok = __allkwargs0__ [__attrib0__]; break;
						case 'fastforward_post_space': var fastforward_post_space = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var new_pos = tok.pos_end;
		if (__t__ (!__t__ ((fastforward_post_space)))) {
			var post_space = __call__ (getattr, null, tok, 'post_space', null);
			if (__t__ (post_space)) {
				var new_pos = __call__ (__isub__, null, new_pos, __call__ (len, null, post_space));
			}
		}
		(function () {
			var __accu0__ = self;
			return __call__ (__accu0__._advance_to_pos, __accu0__, new_pos);
		}) ();
	});},
	get peek_chars () {return __get__ (this, function (self, num_chars, parsing_state) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'num_chars': var num_chars = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (__ge__ (self._pos, __call__ (len, null, self.s)))) {
			var __except0__ = __call__ (LatexWalkerEndOfStream, null);
			__except0__.__cause__ = null;
			throw __except0__;
		}
		return __getslice__ (self.s, self._pos, __add__ (self._pos, num_chars), 1);
	});},
	get next_chars () {return __get__ (this, function (self, num_chars, parsing_state) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'num_chars': var num_chars = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var chars = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.peek_chars, __accu0__, num_chars, parsing_state);
		}) ();
		self._pos = __call__ (__iadd__, null, self._pos, num_chars);
		if (__t__ (__gt__ (self._pos, __call__ (len, null, self.s)))) {
			self._pos = __call__ (len, null, self.s);
		}
		return chars;
	});},
	get cur_pos () {return __get__ (this, function (self) {
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
	get final_pos () {return __get__ (this, function (self) {
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
		return __call__ (len, null, self.s);
	});},
	get move_to_pos_chars () {return __get__ (this, function (self, pos) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		(function () {
			var __accu0__ = self;
			return __call__ (__accu0__._advance_to_pos, __accu0__, pos);
		}) ();
	});},
	get _advance_to_pos () {return __get__ (this, function (self, pos) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		self._pos = pos;
	});},
	get skip_space_chars () {return __get__ (this, function (self, parsing_state) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __left0__ = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.impl_peek_space_chars, __accu0__, self.s, self._pos, parsing_state);
		}) ();
		var space = __left0__ [0];
		var space_pos = __left0__ [1];
		var space_pos_end = __left0__ [2];
		(function () {
			var __accu0__ = self;
			return __call__ (__accu0__._advance_to_pos, __accu0__, space_pos_end);
		}) ();
		return tuple ([space, space_pos, space_pos_end]);
	});},
	get peek_space_chars () {return __get__ (this, function (self, parsing_state) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.impl_peek_space_chars, __accu0__, self.s, self._pos, parsing_state);
		}) ();
	});},
	get peek_token () {return __get__ (this, function (self, parsing_state) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var saved_pos = self._pos;
		try {
			return (function () {
				var __accu0__ = self;
				return __call__ (__accu0__.impl_peek_token, __accu0__, parsing_state);
			}) ();
		}
		catch (__except0__) {
			if (isinstance (__except0__, LatexWalkerTokenParseError)) {
				var exc = __except0__;
				if (__t__ (self.tolerant_parsing)) {
					self._pos = saved_pos;
					return exc.recovery_token_placeholder;
				}
				else {
					__except0__.__cause__ = null;
					throw __except0__;
				}
			}
			else {
				throw __except0__;
			}
		}
	});},
	get impl_peek_token () {return __get__ (this, function (self, parsing_state) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		// pass;
		var s = self.s;
		var len_s = __call__ (len, null, s);
		var pos = self._pos;
		var __left0__ = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.impl_peek_space_chars, __accu0__, s, pos, parsing_state);
		}) ();
		var pre_space = __left0__ [0];
		var space_pos = __left0__ [1];
		var space_pos_end = __left0__ [2];
		if (__t__ (__t__ (parsing_state.enable_double_newline_paragraphs) && __ge__ ((function () {
			var __accu0__ = pre_space;
			return __call__ (__accu0__.count, __accu0__, '\n');
		}) (), 2))) {
			var newpar_rel_pos_start = (function () {
				var __accu0__ = pre_space;
				return __call__ (__accu0__.find, __accu0__, '\n');
			}) ();
			var newpar_rel_pos_end = __add__ ((function () {
				var __accu0__ = pre_space;
				return __call__ (__accu0__.rfind, __accu0__, '\n');
			}) (), 1);
			var pre_space = __getslice__ (pre_space, 0, newpar_rel_pos_start, 1);
			var newpar_pos_start = __add__ (space_pos, newpar_rel_pos_start);
			var newpar_pos_end = __add__ (space_pos, newpar_rel_pos_end);
			if (__t__ (parsing_state.latex_context !== null)) {
				try {
					var sspec = (function () {
						var __accu0__ = parsing_state.latex_context;
						return __call__ (__accu0__.get_specials_spec, __accu0__, __kwargtrans__ ({specials_chars: '\n\n'}));
					}) ();
				}
				catch (__except0__) {
					if (isinstance (__except0__, KeyError)) {
						var sspec = null;
					}
					else {
						throw __except0__;
					}
				}
				if (__t__ (__t__ (sspec !== null) && __eq__ (sspec.specials_chars, '\n\n'))) {
					return (function () {
						var __accu0__ = self;
						return __call__ (__accu0__.make_token, __accu0__, __kwargtrans__ ({tok: 'specials', arg: sspec, pos: newpar_pos_start, pos_end: newpar_pos_end, pre_space: pre_space}));
					}) ();
				}
			}
			var par_space_tokens = __getslice__ (s, newpar_pos_start, newpar_pos_end, 1);
			return (function () {
				var __accu0__ = self;
				return __call__ (__accu0__.make_token, __accu0__, __kwargtrans__ ({tok: 'char', arg: par_space_tokens, pos: newpar_pos_start, pos_end: newpar_pos_end, pre_space: pre_space}));
			}) ();
		}
		var pos = space_pos_end;
		if (__t__ (__ge__ (pos, len_s))) {
			var __except0__ = __call__ (LatexWalkerEndOfStream, null, __kwargtrans__ ({final_space: pre_space}));
			__except0__.__cause__ = null;
			throw __except0__;
		}
		var c = __getitem__ (s, pos);
		if (__t__ (__t__ (__in__ (c, parsing_state._math_delims_info_startchars)) && parsing_state.enable_math)) {
			var t = (function () {
				var __accu0__ = self;
				return __call__ (__accu0__.impl_maybe_read_math_mode_delimiter, __accu0__, s, pos, parsing_state, pre_space);
			}) ();
			if (__t__ (t !== null)) {
				return t;
			}
		}
		if (__t__ (__eq__ (c, parsing_state.macro_escape_char))) {
			if (__t__ (parsing_state.enable_environments)) {
				if (__t__ ((function () {
					var __accu0__ = s;
					return __call__ (__accu0__.startswith, __accu0__, 'begin', __add__ (pos, 1));
				}) ())) {
					var beginend = 'begin';
				}
				else if (__t__ ((function () {
					var __accu0__ = s;
					return __call__ (__accu0__.startswith, __accu0__, 'end', __add__ (pos, 1));
				}) ())) {
					var beginend = 'end';
				}
				else {
					var beginend = null;
				}
				if (__t__ (beginend)) {
					var pastbeginendpos = __add__ (__add__ (pos, 1), __call__ (len, null, beginend));
					if (__t__ (__t__ (__ge__ (pastbeginendpos, __call__ (len, null, s))) || !__in__ (__getitem__ (s, pastbeginendpos), parsing_state.macro_alpha_chars))) {
						return (function () {
							var __accu0__ = self;
							return __call__ (__accu0__.impl_read_environment, __accu0__, __kwargtrans__ ({s: s, pos: pos, parsing_state: parsing_state, beginend: beginend, pre_space: pre_space}));
						}) ();
					}
				}
			}
			if (__t__ (parsing_state.enable_macros)) {
				return (function () {
					var __accu0__ = self;
					return __call__ (__accu0__.impl_read_macro, __accu0__, __kwargtrans__ ({s: s, pos: pos, parsing_state: parsing_state, pre_space: pre_space}));
				}) ();
			}
		}
		if (__t__ (__t__ (parsing_state.enable_comments) && __t__ (__eq__ (c, __getitem__ (parsing_state.comment_start, 0))) && (function () {
			var __accu0__ = s;
			return __call__ (__accu0__.startswith, __accu0__, parsing_state.comment_start, pos);
		}) ())) {
			return (function () {
				var __accu0__ = self;
				return __call__ (__accu0__.impl_read_comment, __accu0__, __kwargtrans__ ({s: s, pos: pos, parsing_state: parsing_state, pre_space: pre_space}));
			}) ();
		}
		if (__t__ (parsing_state.enable_groups)) {
			if (__t__ (__in__ (c, parsing_state._latex_group_delimchars_by_open))) {
				return (function () {
					var __accu0__ = self;
					return __call__ (__accu0__.make_token, __accu0__, __kwargtrans__ ({tok: 'brace_open', arg: c, pos: pos, pos_end: __add__ (pos, 1), pre_space: pre_space}));
				}) ();
			}
			if (__t__ (__in__ (c, parsing_state._latex_group_delimchars_close))) {
				return (function () {
					var __accu0__ = self;
					return __call__ (__accu0__.make_token, __accu0__, __kwargtrans__ ({tok: 'brace_close', arg: c, pos: pos, pos_end: __add__ (pos, 1), pre_space: pre_space}));
				}) ();
			}
		}
		if (__t__ (__t__ (parsing_state.latex_context !== null) && parsing_state.enable_specials)) {
			var sspec = (function () {
				var __accu0__ = parsing_state.latex_context;
				return __call__ (__accu0__.test_for_specials, __accu0__, s, pos, __kwargtrans__ ({parsing_state: parsing_state}));
			}) ();
			if (__t__ (sspec !== null)) {
				return (function () {
					var __accu0__ = self;
					return __call__ (__accu0__.make_token, __accu0__, __kwargtrans__ ({tok: 'specials', arg: sspec, pos: pos, pos_end: __add__ (pos, __call__ (len, null, sspec.specials_chars)), pre_space: pre_space}));
				}) ();
			}
		}
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.impl_char_token, __accu0__, c, pos, __add__ (pos, 1), parsing_state, pre_space);
		}) ();
	});},
	get impl_peek_space_chars () {return __get__ (this, function (self, s, pos, parsing_state) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 's': var s = __allkwargs0__ [__attrib0__]; break;
						case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var p2 = pos;
		var space = '';
		while (__t__ (true)) {
			if (__t__ (__ge__ (p2, __call__ (len, null, s)))) {
				break;
			}
			var c = __getitem__ (s, p2);
			if (__t__ (!__t__ (((function () {
				var __accu0__ = c;
				return __call__ (__accu0__.isspace, __accu0__);
			}) ())))) {
				break;
			}
			var space = __call__ (__iadd__, null, space, c);
			var p2 = __call__ (__iadd__, null, p2, 1);
		}
		return tuple ([space, pos, p2]);
	});},
	get impl_char_token () {return __get__ (this, function (self, c, pos, pos_end, parsing_state, pre_space) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'c': var c = __allkwargs0__ [__attrib0__]; break;
						case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
						case 'pos_end': var pos_end = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
						case 'pre_space': var pre_space = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (__in__ (c, parsing_state.forbidden_characters))) {
			var __except0__ = __call__ (LatexWalkerTokenParseError, null, __kwargtrans__ ({s: self.s, pos: pos, msg: (function () {
				var __accu0__ = 'Character is forbidden here: ‘{}’ ({:#x})';
				return __call__ (__accu0__.format, __accu0__, c, __call__ (ord, null, c));
			}) (), error_type_info: dict ({'what': 'token_forbidden_character', 'forbidden_character': c}), recovery_token_placeholder: (function () {
				var __accu0__ = self;
				return __call__ (__accu0__.make_token, __accu0__, __kwargtrans__ ({tok: 'char', arg: c, pos: pos, pos_end: pos_end, pre_space: pre_space}));
			}) (), recovery_token_at_pos: pos_end}));
			__except0__.__cause__ = null;
			throw __except0__;
		}
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.make_token, __accu0__, __kwargtrans__ ({tok: 'char', arg: c, pos: pos, pos_end: pos_end, pre_space: pre_space}));
		}) ();
	});},
	get impl_maybe_read_math_mode_delimiter () {return __get__ (this, function (self, s, pos, parsing_state, pre_space) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 's': var s = __allkwargs0__ [__attrib0__]; break;
						case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
						case 'pre_space': var pre_space = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (parsing_state.in_math_mode)) {
			var expecting_close = parsing_state._math_expecting_close_delim_info;
			if (__t__ (expecting_close !== null)) {
				var expecting_close_delim = __getitem__ (expecting_close, 'close_delim');
				var expecting_close_tok = __getitem__ (expecting_close, 'tok');
				// pass;
				if (__t__ ((function () {
					var __accu0__ = s;
					return __call__ (__accu0__.startswith, __accu0__, expecting_close_delim, pos);
				}) ())) {
					// pass;
					return (function () {
						var __accu0__ = self;
						return __call__ (__accu0__.make_token, __accu0__, __kwargtrans__ ({tok: expecting_close_tok, arg: expecting_close_delim, pos: pos, pos_end: __add__ (pos, __call__ (len, null, expecting_close_delim)), pre_space: pre_space}));
					}) ();
				}
			}
		}
		var __iterable0__ = parsing_state._math_all_delims_by_len;
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var __left0__ = __getitem__ (__iterable0__, __index0__);
			var delim = __left0__ [0];
			var tok_type = __left0__ [1];
			if (__t__ ((function () {
				var __accu0__ = s;
				return __call__ (__accu0__.startswith, __accu0__, delim, pos);
			}) ())) {
				// pass;
				return (function () {
					var __accu0__ = self;
					return __call__ (__accu0__.make_token, __accu0__, __kwargtrans__ ({tok: tok_type, arg: delim, pos: pos, pos_end: __add__ (pos, __call__ (len, null, delim)), pre_space: pre_space}));
				}) ();
			}
		}
		return null;
	});},
	get impl_read_macro () {return __get__ (this, function (self, s, pos, parsing_state, pre_space) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 's': var s = __allkwargs0__ [__attrib0__]; break;
						case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
						case 'pre_space': var pre_space = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (__ne__ (__getitem__ (s, pos), parsing_state.macro_escape_char))) {
			var __except0__ = __call__ (ValueError, null, "Internal error, expected '\\' in impl_read_macro()");
			__except0__.__cause__ = null;
			throw __except0__;
		}
		if (__t__ (__ge__ (__add__ (pos, 1), __call__ (len, null, s)))) {
			var __except0__ = __call__ (LatexWalkerTokenParseError, null, __kwargtrans__ ({s: s, pos: __add__ (pos, 1), msg: (function () {
				var __accu0__ = 'Expected macro name after ‘{}’ escape character';
				return __call__ (__accu0__.format, __accu0__, parsing_state.macro_escape_char);
			}) (), error_type_info: dict ({'what': 'token_end_of_stream_immediately_after_escape_character'}), recovery_token_placeholder: (function () {
				var __accu0__ = self;
				return __call__ (__accu0__.make_token, __accu0__, __kwargtrans__ ({tok: 'char', arg: '', pos: pos, pos_end: __add__ (pos, 1), pre_space: pre_space}));
			}) (), recovery_token_at_pos: __call__ (len, null, s)}));
			__except0__.__cause__ = null;
			throw __except0__;
		}
		var c = __getitem__ (s, __add__ (pos, 1));
		var macro = c;
		var isalphamacro = __in__ (c, parsing_state.macro_alpha_chars);
		var posi = __add__ (pos, 2);
		if (__t__ (isalphamacro)) {
			while (__t__ (__t__ (__lt__ (posi, __call__ (len, null, s))) && __in__ (__getitem__ (s, posi), parsing_state.macro_alpha_chars))) {
				var macro = __call__ (__iadd__, null, macro, __getitem__ (s, posi));
				var posi = __call__ (__iadd__, null, posi, 1);
			}
		}
		var post_space = '';
		if (__t__ (isalphamacro)) {
			var __left0__ = (function () {
				var __accu0__ = self;
				return __call__ (__accu0__.impl_peek_space_chars, __accu0__, s, posi, parsing_state);
			}) ();
			var post_space = __left0__ [0];
			var post_space_pos = __left0__ [1];
			var post_space_pos_end = __left0__ [2];
			if (__t__ (__ge__ ((function () {
				var __accu0__ = post_space;
				return __call__ (__accu0__.count, __accu0__, '\n');
			}) (), 2))) {
				var newline_rel_pos = (function () {
					var __accu0__ = post_space;
					return __call__ (__accu0__.find, __accu0__, '\n');
				}) ();
				var post_space_pos_end = __add__ (post_space_pos, newline_rel_pos);
				var post_space = __getslice__ (post_space, 0, newline_rel_pos, 1);
			}
			var posi = post_space_pos_end;
		}
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.make_token, __accu0__, __kwargtrans__ ({tok: 'macro', arg: macro, pos: pos, pos_end: posi, pre_space: pre_space, post_space: post_space}));
		}) ();
	});},
	rx_environment_name: (function () {
		var __accu0__ = re;
		return __call__ (__accu0__.compile, __accu0__, '\\s*\\{(?P<environmentname>[A-Za-z0-9*._ :/!^()\\[\\]-]+)\\}');
	}) (),
	get parse_latex_environment_name () {return __get__ (this, function (self, pos, beginend, pos_envname) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
						case 'beginend': var beginend = __allkwargs0__ [__attrib0__]; break;
						case 'pos_envname': var pos_envname = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var envmatch = (function () {
			var __accu0__ = self.rx_environment_name;
			return __call__ (__accu0__.match, __accu0__, __getslice__ (self.s, pos_envname, null, 1));
		}) ();
		if (__t__ (envmatch === null)) {
			return tuple ([null, null]);
		}
		var envmatch_end_pos = __add__ (pos_envname, (function () {
			var __accu0__ = envmatch;
			return __call__ (__accu0__.end, __accu0__);
		}) ());
		return tuple ([(function () {
			var __accu0__ = envmatch;
			return __call__ (__accu0__.group, __accu0__, 'environmentname');
		}) (), envmatch_end_pos]);
	});},
	get impl_read_environment () {return __get__ (this, function (self, s, pos, parsing_state, beginend, pre_space) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 's': var s = __allkwargs0__ [__attrib0__]; break;
						case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
						case 'beginend': var beginend = __allkwargs0__ [__attrib0__]; break;
						case 'pre_space': var pre_space = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (__ne__ (__getslice__ (s, pos, __add__ (__add__ (pos, 1), __call__ (len, null, beginend)), 1), __add__ (parsing_state.macro_escape_char, beginend)))) {
			var __except0__ = __call__ (ValueError, null, (function () {
				var __accu0__ = 'Internal error, expected ‘{}{}’ in read_environment()';
				return __call__ (__accu0__.format, __accu0__, parsing_state.macro_escape_char, beginend);
			}) ());
			__except0__.__cause__ = null;
			throw __except0__;
		}
		var pos_envname = __add__ (__add__ (pos, 1), __call__ (len, null, beginend));
		var __left0__ = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.parse_latex_environment_name, __accu0__, pos, beginend, pos_envname);
		}) ();
		var environment_name = __left0__ [0];
		var environment_pos_end = __left0__ [1];
		// pass;
		if (__t__ (environment_name === null)) {
			var tokarg = __add__ (parsing_state.macro_escape_char, beginend);
			var __except0__ = __call__ (LatexWalkerTokenParseError, null, __kwargtrans__ ({s: s, msg: (function () {
				var __accu0__ = 'Bad ‘\\{}’ call: expected {{environmentname}}';
				return __call__ (__accu0__.format, __accu0__, beginend);
			}) (), pos: pos, error_type_info: dict ({'what': 'token_error_parse_beginend_environment_name', 'beginend': beginend, 'macro_beginend': tokarg}), recovery_token_placeholder: __call__ (LatexToken, null, __kwargtrans__ ({tok: 'char', arg: tokarg, pos: pos, pos_end: __add__ (pos, __call__ (len, null, tokarg)), pre_space: pre_space})), recovery_token_at_pos: __add__ (pos, __call__ (len, null, tokarg))}));
			__except0__.__cause__ = null;
			throw __except0__;
		}
		var env_token = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.make_token, __accu0__, __kwargtrans__ ({tok: __add__ (beginend, '_environment'), arg: environment_name, pos: pos, pos_end: environment_pos_end, pre_space: pre_space}));
		}) ();
		// pass;
		return env_token;
	});},
	get impl_read_comment () {return __get__ (this, function (self, s, pos, parsing_state, pre_space) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 's': var s = __allkwargs0__ [__attrib0__]; break;
						case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
						case 'pre_space': var pre_space = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (!__t__ (((function () {
			var __accu0__ = s;
			return __call__ (__accu0__.startswith, __accu0__, parsing_state.comment_start, pos);
		}) ())))) {
			var __except0__ = __call__ (ValueError, null, (function () {
				var __accu0__ = 'Internal error, expected comment start ‘{}’ in read_comment()';
				return __call__ (__accu0__.format, __accu0__, parsing_state.comment_start);
			}) ());
			__except0__.__cause__ = null;
			throw __except0__;
		}
		var pos_inner_start = __add__ (pos, __call__ (len, null, parsing_state.comment_start));
		var sppos = (function () {
			var __accu0__ = s;
			return __call__ (__accu0__.find, __accu0__, '\n', pos_inner_start);
		}) ();
		if (__t__ (__eq__ (sppos, __neg__ (1)))) {
			var comment_pos_end = __call__ (len, null, s);
			var comment_with_whitespace_pos_end = __call__ (len, null, s);
			var post_space = '';
		}
		else {
			var __left0__ = (function () {
				var __accu0__ = self;
				return __call__ (__accu0__.impl_peek_space_chars, __accu0__, s, sppos, parsing_state);
			}) ();
			var post_space = __left0__ [0];
			var post_space_pos = __left0__ [1];
			var post_space_pos_end = __left0__ [2];
			if (__t__ (__ge__ ((function () {
				var __accu0__ = post_space;
				return __call__ (__accu0__.count, __accu0__, '\n');
			}) (), 2))) {
				var newline_rel_pos = (function () {
					var __accu0__ = post_space;
					return __call__ (__accu0__.find, __accu0__, '\n');
				}) ();
				var post_space_pos_end = __add__ (post_space_pos, newline_rel_pos);
				var post_space = __getslice__ (post_space, 0, newline_rel_pos, 1);
			}
			var comment_pos_end = sppos;
			var comment_with_whitespace_pos_end = post_space_pos_end;
		}
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.make_token, __accu0__, __kwargtrans__ ({tok: 'comment', arg: __getslice__ (s, pos_inner_start, comment_pos_end, 1), pos: pos, pos_end: comment_with_whitespace_pos_end, pre_space: pre_space, post_space: post_space}));
		}) ();
	});}
});

