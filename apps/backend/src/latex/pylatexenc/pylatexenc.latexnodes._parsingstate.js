var logging = {};
var unique_object_id = {};
import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import * as __module_unique_object_id__ from './unique_object_id.js';
__nest__ (unique_object_id, '', __module_unique_object_id__);
import * as __module_logging__ from './logging.js';
__nest__ (logging, '', __module_logging__);
var __name__ = 'pylatexenc.latexnodes._parsingstate';
export var logger = (function () {
	var __accu0__ = logging;
	return __call__ (__accu0__.getLogger, __accu0__, __name__);
}) ();
export var _unisafe_arrow_s = '→';
export var _default_macro_alpha_chars = __add__ ((function () {
	var __accu0__ = '';
	return __call__ (__accu0__.join, __accu0__, (function () {
		var __accu1__ = [];
		for (var j = 0; j < 26; j++) {
			(function () {
				var __accu2__ = __accu1__;
				return __call__ (__accu2__.append, __accu2__, __call__ (chr, null, __add__ (__call__ (ord, null, 'a'), j)));
			}) ();
		}
		return __accu1__;
	}) ());
}) (), (function () {
	var __accu0__ = '';
	return __call__ (__accu0__.join, __accu0__, (function () {
		var __accu1__ = [];
		for (var j = 0; j < 26; j++) {
			(function () {
				var __accu2__ = __accu1__;
				return __call__ (__accu2__.append, __accu2__, __call__ (chr, null, __add__ (__call__ (ord, null, 'A'), j)));
			}) ();
		}
		return __accu1__;
	}) ());
}) ());
export var fn_unique_object_id = unique_object_id.fn_unique_object_id;
export var ParsingState =  __class__ ('ParsingState', [object], {
	__module__: __name__,
	_fields: tuple (['s', 'latex_context', 'in_math_mode', 'math_mode_delimiter', 'latex_group_delimiters', 'latex_inline_math_delimiters', 'latex_display_math_delimiters', 'enable_double_newline_paragraphs', 'enable_macros', 'enable_environments', 'enable_comments', 'enable_groups', 'enable_specials', 'enable_math', 'macro_alpha_chars', 'macro_escape_char', 'comment_start', 'forbidden_characters']),
	get __init__ () {return __get__ (this, function (self) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, ParsingState, '__init__'), null, self);
		self._parent_parsing_state_info = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, '_parent_parsing_state_info', tuple ([null, dict ({})]));
		}) ();
		(function () {
			var __accu0__ = self;
			return __call__ (__accu0__.set_fields, __accu0__, __kwargtrans__ (kwargs));
		}) ();
		(function () {
			var __accu0__ = self;
			return __call__ (__accu0__.finalize_state, __accu0__);
		}) ();
	});},
	get set_fields () {return __get__ (this, function (self, s, latex_context, in_math_mode, math_mode_delimiter, latex_group_delimiters, latex_inline_math_delimiters, latex_display_math_delimiters, enable_double_newline_paragraphs, enable_macros, enable_environments, enable_comments, enable_groups, enable_specials, enable_math, macro_alpha_chars, macro_escape_char, comment_start, forbidden_characters) {
		if (typeof s == 'undefined' || (s != null && s.hasOwnProperty ("__kwargtrans__"))) {;
			var s = null;
		};
		if (typeof latex_context == 'undefined' || (latex_context != null && latex_context.hasOwnProperty ("__kwargtrans__"))) {;
			var latex_context = null;
		};
		if (typeof in_math_mode == 'undefined' || (in_math_mode != null && in_math_mode.hasOwnProperty ("__kwargtrans__"))) {;
			var in_math_mode = false;
		};
		if (typeof math_mode_delimiter == 'undefined' || (math_mode_delimiter != null && math_mode_delimiter.hasOwnProperty ("__kwargtrans__"))) {;
			var math_mode_delimiter = null;
		};
		if (typeof latex_group_delimiters == 'undefined' || (latex_group_delimiters != null && latex_group_delimiters.hasOwnProperty ("__kwargtrans__"))) {;
			var latex_group_delimiters = null;
		};
		if (typeof latex_inline_math_delimiters == 'undefined' || (latex_inline_math_delimiters != null && latex_inline_math_delimiters.hasOwnProperty ("__kwargtrans__"))) {;
			var latex_inline_math_delimiters = null;
		};
		if (typeof latex_display_math_delimiters == 'undefined' || (latex_display_math_delimiters != null && latex_display_math_delimiters.hasOwnProperty ("__kwargtrans__"))) {;
			var latex_display_math_delimiters = null;
		};
		if (typeof enable_double_newline_paragraphs == 'undefined' || (enable_double_newline_paragraphs != null && enable_double_newline_paragraphs.hasOwnProperty ("__kwargtrans__"))) {;
			var enable_double_newline_paragraphs = true;
		};
		if (typeof enable_macros == 'undefined' || (enable_macros != null && enable_macros.hasOwnProperty ("__kwargtrans__"))) {;
			var enable_macros = true;
		};
		if (typeof enable_environments == 'undefined' || (enable_environments != null && enable_environments.hasOwnProperty ("__kwargtrans__"))) {;
			var enable_environments = true;
		};
		if (typeof enable_comments == 'undefined' || (enable_comments != null && enable_comments.hasOwnProperty ("__kwargtrans__"))) {;
			var enable_comments = true;
		};
		if (typeof enable_groups == 'undefined' || (enable_groups != null && enable_groups.hasOwnProperty ("__kwargtrans__"))) {;
			var enable_groups = true;
		};
		if (typeof enable_specials == 'undefined' || (enable_specials != null && enable_specials.hasOwnProperty ("__kwargtrans__"))) {;
			var enable_specials = true;
		};
		if (typeof enable_math == 'undefined' || (enable_math != null && enable_math.hasOwnProperty ("__kwargtrans__"))) {;
			var enable_math = true;
		};
		if (typeof macro_alpha_chars == 'undefined' || (macro_alpha_chars != null && macro_alpha_chars.hasOwnProperty ("__kwargtrans__"))) {;
			var macro_alpha_chars = _default_macro_alpha_chars;
		};
		if (typeof macro_escape_char == 'undefined' || (macro_escape_char != null && macro_escape_char.hasOwnProperty ("__kwargtrans__"))) {;
			var macro_escape_char = '\\';
		};
		if (typeof comment_start == 'undefined' || (comment_start != null && comment_start.hasOwnProperty ("__kwargtrans__"))) {;
			var comment_start = '%';
		};
		if (typeof forbidden_characters == 'undefined' || (forbidden_characters != null && forbidden_characters.hasOwnProperty ("__kwargtrans__"))) {;
			var forbidden_characters = '';
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 's': var s = __allkwargs0__ [__attrib0__]; break;
						case 'latex_context': var latex_context = __allkwargs0__ [__attrib0__]; break;
						case 'in_math_mode': var in_math_mode = __allkwargs0__ [__attrib0__]; break;
						case 'math_mode_delimiter': var math_mode_delimiter = __allkwargs0__ [__attrib0__]; break;
						case 'latex_group_delimiters': var latex_group_delimiters = __allkwargs0__ [__attrib0__]; break;
						case 'latex_inline_math_delimiters': var latex_inline_math_delimiters = __allkwargs0__ [__attrib0__]; break;
						case 'latex_display_math_delimiters': var latex_display_math_delimiters = __allkwargs0__ [__attrib0__]; break;
						case 'enable_double_newline_paragraphs': var enable_double_newline_paragraphs = __allkwargs0__ [__attrib0__]; break;
						case 'enable_macros': var enable_macros = __allkwargs0__ [__attrib0__]; break;
						case 'enable_environments': var enable_environments = __allkwargs0__ [__attrib0__]; break;
						case 'enable_comments': var enable_comments = __allkwargs0__ [__attrib0__]; break;
						case 'enable_groups': var enable_groups = __allkwargs0__ [__attrib0__]; break;
						case 'enable_specials': var enable_specials = __allkwargs0__ [__attrib0__]; break;
						case 'enable_math': var enable_math = __allkwargs0__ [__attrib0__]; break;
						case 'macro_alpha_chars': var macro_alpha_chars = __allkwargs0__ [__attrib0__]; break;
						case 'macro_escape_char': var macro_escape_char = __allkwargs0__ [__attrib0__]; break;
						case 'comment_start': var comment_start = __allkwargs0__ [__attrib0__]; break;
						case 'forbidden_characters': var forbidden_characters = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		self.s = s;
		self.latex_context = latex_context;
		self.in_math_mode = in_math_mode;
		self.math_mode_delimiter = math_mode_delimiter;
		if (__t__ (__t__ (!__t__ ((self.in_math_mode))) && self.math_mode_delimiter)) {
			(function () {
				var __accu0__ = logger;
				return __call__ (__accu0__.warning, __accu0__, 'ParsingState: You set math_mode_delimiter=%r but in_math_mode is False', self.math_mode_delimiter);
			}) ();
			self.math_mode_delimiter = null;
		}
		self.latex_group_delimiters = (__t__ (latex_group_delimiters !== null) ? latex_group_delimiters : [tuple (['{', '}'])]);
		self.latex_inline_math_delimiters = (__t__ (latex_inline_math_delimiters !== null) ? latex_inline_math_delimiters : [tuple (['$', '$']), tuple (['\\(', '\\)'])]);
		self.latex_display_math_delimiters = (__t__ (latex_display_math_delimiters !== null) ? latex_display_math_delimiters : [tuple (['$$', '$$']), tuple (['\\[', '\\]'])]);
		self.enable_double_newline_paragraphs = enable_double_newline_paragraphs;
		self.enable_macros = enable_macros;
		self.enable_environments = enable_environments;
		self.enable_comments = enable_comments;
		self.enable_groups = enable_groups;
		self.enable_specials = enable_specials;
		self.enable_math = enable_math;
		self.macro_alpha_chars = macro_alpha_chars;
		self.macro_escape_char = macro_escape_char;
		self.comment_start = comment_start;
		self.forbidden_characters = forbidden_characters;
	});},
	get _finalize_state_latex_group_delimiters_info () {return __get__ (this, function (self, parent, kwargs) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'parent': var parent = __allkwargs0__ [__attrib0__]; break;
						case 'kwargs': var kwargs = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (__t__ (parent !== null) && !__in__ ('latex_group_delimiters', kwargs))) {
			self._latex_group_delimchars_by_open = parent._latex_group_delimchars_by_open;
			self._latex_group_delimchars_close = parent._latex_group_delimchars_close;
			return ;
		}
		var __left0__ = __call__ (zip, null, ...self.latex_group_delimiters);
		var a = __left0__ [0];
		var b = __left0__ [1];
		self._latex_group_delimchars_by_open = __call__ (dict, null, self.latex_group_delimiters);
		self._latex_group_delimchars_close = __call__ (set, null, b);
	});},
	get _finalize_state_latex_math_delim_info () {return __get__ (this, function (self, parent, kwargs) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'parent': var parent = __allkwargs0__ [__attrib0__]; break;
						case 'kwargs': var kwargs = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (__t__ (parent !== null) && __t__ (!__in__ ('latex_inline_math_delimiters', kwargs)) && !__in__ ('latex_display_math_delimiters', kwargs))) {
			self._math_delims_info_startchars = parent._math_delims_info_startchars;
			self._math_all_delims_by_len = parent._math_all_delims_by_len;
			self._math_delims_info_by_open = parent._math_delims_info_by_open;
			self._math_delims_close = parent._math_delims_close;
			return ;
		}
		self._math_delims_info_startchars = (function () {
			var __accu0__ = '';
			return __call__ (__accu0__.join, __accu0__, (function () {
				var __accu1__ = [];
				var __iterable0__ = __add__ (self.latex_inline_math_delimiters, self.latex_display_math_delimiters);
				for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
					var pair = __getitem__ (__iterable0__, __index0__);
					var __iterable1__ = pair;
					for (var __index1__ = 0; __index1__ < len (__iterable1__); __index1__++) {
						var x = __getitem__ (__iterable1__, __index1__);
						(function () {
							var __accu2__ = __accu1__;
							return __call__ (__accu2__.append, __accu2__, __getslice__ (x, 0, 1, 1));
						}) ();
					}
				}
				return __accu1__;
			}) ());
		}) ();
		self._math_all_delims_by_len = __call__ (sorted, null, (function () {
			var __accu0__ = [];
			var __iterable0__ = tuple ([tuple ([self.latex_inline_math_delimiters, 'mathmode_inline']), tuple ([self.latex_display_math_delimiters, 'mathmode_display'])]);
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var __left0__ = __getitem__ (__iterable0__, __index0__);
				var delimlist = __left0__ [0];
				var tok_type = __left0__ [1];
				var __iterable1__ = __call__ (set, null, (function () {
					var __accu1__ = [];
					var __iterable2__ = delimlist;
					for (var __index1__ = 0; __index1__ < len (__iterable2__); __index1__++) {
						var dlmpair = __getitem__ (__iterable2__, __index1__);
						var __iterable3__ = dlmpair;
						for (var __index2__ = 0; __index2__ < len (__iterable3__); __index2__++) {
							var dlm = __getitem__ (__iterable3__, __index2__);
							(function () {
								var __accu2__ = __accu1__;
								return __call__ (__accu2__.append, __accu2__, dlm);
							}) ();
						}
					}
					return __accu1__;
				}) ());
				for (var __index1__ = 0; __index1__ < len (__iterable1__); __index1__++) {
					var delim = __getitem__ (__iterable1__, __index1__);
					(function () {
						var __accu1__ = __accu0__;
						return __call__ (__accu1__.append, __accu1__, tuple ([delim, tok_type]));
					}) ();
				}
			}
			return __accu0__;
		}) (), __kwargtrans__ ({key: (function __lambda__ (x) {
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
			return __call__ (len, null, __getitem__ (x, 0));
		}), reverse: true}));
		self._math_delims_info_by_open = __call__ (dict, null, __add__ ((function () {
			var __accu0__ = [];
			var __iterable0__ = self.latex_inline_math_delimiters;
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var __left0__ = __getitem__ (__iterable0__, __index0__);
				var open_delim = __left0__ [0];
				var close_delim = __left0__ [1];
				(function () {
					var __accu1__ = __accu0__;
					return __call__ (__accu1__.append, __accu1__, tuple ([open_delim, __call__ (dict, null, __kwargtrans__ ({close_delim: close_delim, tok: 'mathmode_inline'}))]));
				}) ();
			}
			return __accu0__;
		}) (), (function () {
			var __accu0__ = [];
			var __iterable0__ = self.latex_display_math_delimiters;
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var __left0__ = __getitem__ (__iterable0__, __index0__);
				var open_delim = __left0__ [0];
				var close_delim = __left0__ [1];
				(function () {
					var __accu1__ = __accu0__;
					return __call__ (__accu1__.append, __accu1__, tuple ([open_delim, __call__ (dict, null, __kwargtrans__ ({close_delim: close_delim, tok: 'mathmode_display'}))]));
				}) ();
			}
			return __accu0__;
		}) ()));
		self._math_delims_close = __call__ (set, null, (function () {
			var __accu0__ = [];
			var __iterable0__ = (function () {
				var __accu1__ = self._math_delims_info_by_open;
				return __call__ (__accu1__.py_items, __accu1__);
			}) ();
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var __left0__ = __getitem__ (__iterable0__, __index0__);
				var opendelim = __left0__ [0];
				var info = __left0__ [1];
				(function () {
					var __accu1__ = __accu0__;
					return __call__ (__accu1__.append, __accu1__, __getitem__ (info, 'close_delim'));
				}) ();
			}
			return __accu0__;
		}) ());
	});},
	get _finalize_state_inmathmode_info () {return __get__ (this, function (self, parent, kwargs) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'parent': var parent = __allkwargs0__ [__attrib0__]; break;
						case 'kwargs': var kwargs = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (__t__ (parent !== null) && __t__ (!__in__ ('in_math_mode', kwargs)) && __t__ (!__in__ ('math_mode_delimiter', kwargs)) && __t__ (!__in__ ('latex_inline_math_delimiters', kwargs)) && !__in__ ('latex_display_math_delimiters', kwargs))) {
			self._math_expecting_close_delim_info = parent._math_expecting_close_delim_info;
			return ;
		}
		if (__t__ (!__t__ ((self.in_math_mode)))) {
			self._math_expecting_close_delim_info = null;
		}
		else if (__t__ (__in__ (self.math_mode_delimiter, self._math_delims_info_by_open))) {
			self._math_expecting_close_delim_info = __getitem__ (self._math_delims_info_by_open, self.math_mode_delimiter);
		}
		else {
			self._math_expecting_close_delim_info = null;
		}
	});},
	get finalize_state () {return __get__ (this, function (self) {
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
		var __left0__ = self._parent_parsing_state_info;
		var parent = __left0__ [0];
		var kwargs = __left0__ [1];
		(function () {
			var __accu0__ = self;
			return __call__ (__accu0__._finalize_state_latex_group_delimiters_info, __accu0__, parent, kwargs);
		}) ();
		(function () {
			var __accu0__ = self;
			return __call__ (__accu0__._finalize_state_latex_math_delim_info, __accu0__, parent, kwargs);
		}) ();
		(function () {
			var __accu0__ = self;
			return __call__ (__accu0__._finalize_state_inmathmode_info, __accu0__, parent, kwargs);
		}) ();
	});},
	get sub_context () {return __get__ (this, function (self) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		var attrs = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.get_fields, __accu0__);
		}) ();
		var kwargs2 = (function () {
			var __accu0__ = [];
			var __iterable0__ = (function () {
				var __accu1__ = kwargs;
				return __call__ (__accu1__.py_items, __accu1__);
			}) ();
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var __left0__ = __getitem__ (__iterable0__, __index0__);
				var k = __left0__ [0];
				var v = __left0__ [1];
				if (__t__ (!__t__ ((__call__ (_safe_eq, null, v, __getitem__ (attrs, k)))))) {
					(function () {
						var __accu1__ = __accu0__;
						return __call__ (__accu1__.append, __accu1__, [k, v]);
					}) ();
				}
			}
			return dict (__accu0__);
		}) ();
		(function () {
			var __accu0__ = attrs;
			return __call__ (__accu0__.py_update, __accu0__, kwargs2);
		}) ();
		var p = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.__class__, __accu0__, __kwargtrans__ (__mergekwargtrans__ ({_parent_parsing_state_info: tuple ([self, kwargs2])}, attrs)));
		}) ();
		// pass;
		return p;
	});},
	get get_fields () {return __get__ (this, function (self) {
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
		return __call__ (dict, null, (function () {
			var __accu0__ = [];
			var __iterable0__ = self._fields;
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var f = __getitem__ (__iterable0__, __index0__);
				(function () {
					var __accu1__ = __accu0__;
					return __call__ (__accu1__.append, __accu1__, tuple ([f, __call__ (getattr, null, self, f)]));
				}) ();
			}
			return __accu0__;
		}) ());
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
		var clsname = self.__class__.__name__;
		var pswid = (function () {
			var __accu0__ = '{}<{:#x}>';
			return __call__ (__accu0__.format, __accu0__, clsname, __call__ (fn_unique_object_id, null, self));
		}) ();
		var __left0__ = self._parent_parsing_state_info;
		var parent_obj = __left0__ [0];
		var diff_kwargs = __left0__ [1];
		if (__t__ (!__t__ ((parent_obj)))) {
			return pswid;
		}
		return __add__ (__add__ (__add__ (pswid, (function () {
			var __accu0__ = '(<{:#x}> {} ';
			return __call__ (__accu0__.format, __accu0__, __call__ (fn_unique_object_id, null, parent_obj), _unisafe_arrow_s);
		}) ()), (function () {
			var __accu0__ = ', ';
			return __call__ (__accu0__.join, __accu0__, (function () {
				var __accu1__ = [];
				var __iterable0__ = (function () {
					var __accu2__ = diff_kwargs;
					return __call__ (__accu2__.py_items, __accu2__);
				}) ();
				for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
					var __left0__ = __getitem__ (__iterable0__, __index0__);
					var k = __left0__ [0];
					var v = __left0__ [1];
					if (__t__ (!__in__ (k, tuple (['s'])))) {
						(function () {
							var __accu2__ = __accu1__;
							return __call__ (__accu2__.append, __accu2__, (function () {
								var __accu3__ = '{}={!r}';
								return __call__ (__accu3__.format, __accu3__, k, v);
							}) ());
						}) ();
					}
				}
				return __accu1__;
			}) ());
		}) ()), ')');
	});},
	get to_json_object () {return __get__ (this, function (self) {
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
			var __accu0__ = [];
			var __iterable0__ = (function () {
				var __accu1__ = (function () {
					var __accu2__ = self;
					return __call__ (__accu2__.get_fields, __accu2__);
				}) ();
				return __call__ (__accu1__.py_items, __accu1__);
			}) ();
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var __left0__ = __getitem__ (__iterable0__, __index0__);
				var k = __left0__ [0];
				var v = __left0__ [1];
				if (__t__ (!__in__ (k, tuple (['latex_context', 's'])))) {
					(function () {
						var __accu1__ = __accu0__;
						return __call__ (__accu1__.append, __accu1__, [k, v]);
					}) ();
				}
			}
			return dict (__accu0__);
		}) ();
	});}
});
export var _safe_eq = function (a, b) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'a': var a = __allkwargs0__ [__attrib0__]; break;
					case 'b': var b = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	return __t__ (__t__ (a === null) && b === null) || __eq__ (a, b);
};

