var logging = {};
var re = {};
var unique_object_id = {};
import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import * as __module_unique_object_id__ from './unique_object_id.js';
__nest__ (unique_object_id, '', __module_unique_object_id__);
import * as __module_logging__ from './logging.js';
__nest__ (logging, '', __module_logging__);
import {ParsingState} from './pylatexenc.latexnodes.js';
import * as parsers from './pylatexenc.latexnodes.parsers.js';
import {LatexCharsNode, LatexCommentNode, LatexEnvironmentNode, LatexGroupNode, LatexMacroNode, LatexMathNode, LatexNode, LatexNodeList, LatexNodesVisitor, LatexSpecialsNode, LatexWalkerParseError, ParsedArguments, _UseList, __all__, _display_abbrev_str, _display_str_delimiters, _get_content_as_chars, _update_posposend_from_nodelist, latex_node_types} from './pylatexenc.latexnodes.nodes.js';
import {format_pos} from './pylatexenc.latexnodes._exctypes.js';
import {LatexWalkerEndOfStream, LatexWalkerError, LatexWalkerLocatedError, LatexWalkerLocatedErrorFormatter, LatexWalkerNodesParseError, LatexWalkerTokenParseError} from './pylatexenc.latexnodes._exctypes.js';
import * as macrospec from './pylatexenc.macrospec.js';
import * as latexnodes from './pylatexenc.latexnodes.js';
import * as _util from './pylatexenc._util.js';
import * as __module_re__ from './re.js';
__nest__ (re, '', __module_re__);
export {latex_node_types, macrospec, LatexNodesVisitor, LatexCommentNode, _update_posposend_from_nodelist, __all__, LatexWalkerParseError, LatexGroupNode, LatexWalkerNodesParseError, format_pos, LatexCharsNode, parsers, LatexWalkerError, LatexWalkerLocatedError, ParsingState, LatexWalkerTokenParseError, ParsedArguments, _util, latexnodes, LatexWalkerEndOfStream, LatexSpecialsNode, _UseList, _display_abbrev_str, LatexEnvironmentNode, LatexWalkerLocatedErrorFormatter, LatexMathNode, _get_content_as_chars, LatexNode, _display_str_delimiters, LatexNodeList, LatexMacroNode};
var __name__ = 'pylatexenc.latexwalker._walker';
export var get_default_latex_context_db = macrospec.LatexContextDb;
export var logger = (function () {
	var __accu0__ = logging;
	return __call__ (__accu0__.getLogger, __accu0__, __name__);
}) ();
export var _maketuple = (function __lambda__ () {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
			}
		}
		var args = tuple ([].slice.apply (arguments).slice (0, __ilastarg0__ + 1));
	}
	else {
		var args = tuple ();
	}
	return __call__ (tuple, null, args);
});
export var fn_unique_object_id = unique_object_id.fn_unique_object_id;
export var _legacy_pyltxenc1_do = (function __lambda__ () {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
			}
		}
		var args = tuple ([].slice.apply (arguments).slice (0, __ilastarg0__ + 1));
	}
	else {
		var args = tuple ();
	}
	return null;
});
export var LatexWalker =  __class__ ('LatexWalker', [latexnodes.LatexWalkerBase], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, s, latex_context) {
		if (typeof latex_context == 'undefined' || (latex_context != null && latex_context.hasOwnProperty ("__kwargtrans__"))) {;
			var latex_context = null;
		};
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 's': var s = __allkwargs0__ [__attrib0__]; break;
						case 'latex_context': var latex_context = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		var default_parsing_state = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'default_parsing_state', null);
		}) ();
		self.s = s;
		self.line_number_offset = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'line_number_offset', null);
		}) ();
		self.first_line_column_offset = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'first_line_column_offset', null);
		}) ();
		self.column_offset = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'column_offset', null);
		}) ();
		if (__t__ (self.line_number_offset === null)) {
			self.line_number_offset = 1;
		}
		if (__t__ (self.first_line_column_offset === null)) {
			self.first_line_column_offset = 0;
		}
		if (__t__ (self.column_offset === null)) {
			self.column_offset = 0;
		}
		self._line_no_calc = null;
		self.debug_nodes = false;
		if (__t__ (default_parsing_state !== null)) {
			self.default_parsing_state = default_parsing_state;
			if (__t__ (latex_context !== null)) {
				var __except0__ = __call__ (ValueError, null, 'You cannot specify both the default_parsing_state= and the latex_context= arguments');
				__except0__.__cause__ = null;
				throw __except0__;
			}
		}
		else {
			if (__t__ (latex_context === null)) {
				var latex_context = __call__ (_legacy_pyltxenc1_do, null, 'LatexWalker_init_from_macro_dict', self, kwargs);
				if (__t__ (latex_context === null)) {
					var latex_context = __call__ (get_default_latex_context_db, null);
				}
			}
			else if (__t__ (__in__ ('macro_dict', kwargs))) {
				var __except0__ = __call__ (py_TypeError, null, 'Cannot specify both `latex_context=` and `macro_dict=` arguments');
				__except0__.__cause__ = null;
				throw __except0__;
			}
			if (__t__ (latex_context !== null)) {
				(function () {
					var __accu0__ = latex_context;
					return __call__ (__accu0__.freeze, __accu0__);
				}) ();
				self.default_parsing_state = __call__ (ParsingState, null, __kwargtrans__ ({s: self.s, latex_context: latex_context}));
			}
			else {
				self.default_parsing_state = null;
			}
		}
		self.tolerant_parsing = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'tolerant_parsing', true);
		}) ();
		self.strict_braces = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'strict_braces', false);
		}) ();
		if (__t__ (__in__ ('keep_inline_math', kwargs))) {
			(function () {
				var __accu0__ = _util;
				return __call__ (__accu0__.pylatexenc_deprecated_2, __accu0__, 'The keep_inline_math=... option in LatexWalker() has no effect in pylatexenc 2.  Please consider using the more versatile option math_mode=... in LatexNodes2Text() instead.');
			}) ();
			delete __getitem__ (kwargs, 'keep_inline_math');
		}
		if (__t__ (kwargs)) {
			(function () {
				var __accu0__ = logger;
				return __call__ (__accu0__.warning, __accu0__, 'LatexWalker(): Unknown flag(s) encountered: %r', (function () {
					var __accu1__ = kwargs;
					return __call__ (__accu1__.py_keys, __accu1__);
				}) ());
			}) ();
		}
		__call__ (__call__ (__super__, null, LatexWalker, '__init__'), null, self);
	});},
	make_latex_group_parser: parsers.LatexDelimitedGroupParser,
	make_latex_math_parser: parsers.LatexMathParser,
	get make_parsing_state () {return __get__ (this, function (self) {
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
		return (function () {
			var __accu0__ = self.default_parsing_state;
			return __call__ (__accu0__.sub_context, __accu0__, __kwargtrans__ (kwargs));
		}) ();
	});},
	get parse_flags () {return __get__ (this, function (self) {
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
		return dict ({'tolerant_parsing': self.tolerant_parsing, 'strict_braces': self.strict_braces, 'keep_inline_math': null});
	});},
	get _report_ignore_parse_error () {return __get__ (this, function (self, exc) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'exc': var exc = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		(function () {
			var __accu0__ = logger;
			return __call__ (__accu0__.info, __accu0__, 'Ignoring parse error (tolerant parsing mode): %s', exc);
		}) ();
	});},
	get check_tolerant_parsing_ignore_error () {return __get__ (this, function (self, exc) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'exc': var exc = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (__t__ (!__t__ ((self.tolerant_parsing))) || !__t__ ((__call__ (isinstance, null, exc, LatexWalkerError))))) {
			return exc;
		}
		(function () {
			var __accu0__ = self;
			return __call__ (__accu0__._report_ignore_parse_error, __accu0__, exc);
		}) ();
		return null;
	});},
	_ParsingContext: __class__ ('_ParsingContext', [object], {
		__module__: __name__,
		get __init__ () {return __get__ (this, function (self, latex_walker, open_context) {
			if (arguments.length) {
				var __ilastarg0__ = arguments.length - 1;
				if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
					var __allkwargs0__ = arguments [__ilastarg0__--];
					for (var __attrib0__ in __allkwargs0__) {
						switch (__attrib0__) {
							case 'self': var self = __allkwargs0__ [__attrib0__]; break;
							case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
							case 'open_context': var open_context = __allkwargs0__ [__attrib0__]; break;
						}
					}
				}
			}
			else {
			}
			__call__ (__call__ (__super__, null, LatexWalker._ParsingContext, '__init__'), null, self);
			self.latex_walker = latex_walker;
			self.open_context = open_context;
			self.recovery_from_exception = null;
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
			return self;
		});},
		get __exit__ () {return __get__ (this, function (self, exc_type, exc_value, exc_traceback) {
			if (arguments.length) {
				var __ilastarg0__ = arguments.length - 1;
				if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
					var __allkwargs0__ = arguments [__ilastarg0__--];
					for (var __attrib0__ in __allkwargs0__) {
						switch (__attrib0__) {
							case 'self': var self = __allkwargs0__ [__attrib0__]; break;
							case 'exc_type': var exc_type = __allkwargs0__ [__attrib0__]; break;
							case 'exc_value': var exc_value = __allkwargs0__ [__attrib0__]; break;
							case 'exc_traceback': var exc_traceback = __allkwargs0__ [__attrib0__]; break;
						}
					}
				}
			}
			else {
			}
			if (__t__ (__t__ (exc_value !== null) && __call__ (isinstance, null, exc_value, LatexWalkerParseError))) {
				var e = exc_value;
				if (__t__ (self.open_context)) {
					var __left0__ = self.open_context;
					var what = __left0__ [0];
					var tok = __left0__ [1];
					if (__t__ (what !== null)) {
						if (__t__ (tok !== null)) {
							(function () {
								var __accu0__ = e.open_contexts;
								return __call__ (__accu0__.append, __accu0__, __call__ (_maketuple, null, what, tok.pos, ...(function () {
									var __accu1__ = self.latex_walker;
									return __call__ (__accu1__.pos_to_lineno_colno, __accu1__, tok.pos);
								}) ()));
							}) ();
						}
						else {
							(function () {
								var __accu0__ = e.open_contexts;
								return __call__ (__accu0__.append, __accu0__, __call__ (_maketuple, null, what, null, __neg__ (1), __neg__ (1)));
							}) ();
						}
					}
				}
				if (__t__ (__t__ (__call__ (hasattr, null, e, 'pos')) && __t__ (e.lineno === null) && e.colno === null)) {
					var epos = __call__ (getattr, null, e, 'pos');
					var __left0__ = (function () {
						var __accu0__ = self.latex_walker;
						return __call__ (__accu0__.pos_to_lineno_colno, __accu0__, epos);
					}) ();
					e.lineno = __left0__ [0];
					e.colno = __left0__ [1];
				}
				var e_reraise = (function () {
					var __accu0__ = self.latex_walker;
					return __call__ (__accu0__.check_tolerant_parsing_ignore_error, __accu0__, e);
				}) ();
				if (__t__ (e_reraise === null)) {
					self.recovery_from_exception = e;
					return true;
				}
				return null;
			}
		});},
		get perform_recovery_nodes_and_parsing_state_delta () {return __get__ (this, function (self, token_reader) {
			if (arguments.length) {
				var __ilastarg0__ = arguments.length - 1;
				if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
					var __allkwargs0__ = arguments [__ilastarg0__--];
					for (var __attrib0__ in __allkwargs0__) {
						switch (__attrib0__) {
							case 'self': var self = __allkwargs0__ [__attrib0__]; break;
							case 'token_reader': var token_reader = __allkwargs0__ [__attrib0__]; break;
						}
					}
				}
			}
			else {
			}
			if (__t__ (self.recovery_from_exception === null)) {
				var __except0__ = __call__ (RuntimeError, null, 'No exception had happened to try to recover nodes from');
				__except0__.__cause__ = null;
				throw __except0__;
			}
			var nodes = null;
			var parsing_state_delta = null;
			var reset_at_tok = null;
			if (__t__ (__call__ (hasattr, null, self.recovery_from_exception, 'recovery_nodes'))) {
				var nodes = self.recovery_from_exception.recovery_nodes;
			}
			if (__t__ (__call__ (hasattr, null, self.recovery_from_exception, 'recovery_parsing_state_delta'))) {
				var parsing_state_delta = self.recovery_from_exception.recovery_parsing_state_delta;
			}
			if (__t__ (__call__ (hasattr, null, self.recovery_from_exception, 'recovery_at_token'))) {
				var reset_at_tok = self.recovery_from_exception.recovery_at_token;
			}
			if (__t__ (reset_at_tok !== null)) {
				(function () {
					var __accu0__ = token_reader;
					return __call__ (__accu0__.move_to_token, __accu0__, reset_at_tok);
				}) ();
			}
			else {
				var reset_past_tok = null;
				if (__t__ (__call__ (hasattr, null, self.recovery_from_exception, 'recovery_past_token'))) {
					var reset_past_tok = self.recovery_from_exception.recovery_past_token;
				}
				if (__t__ (reset_past_tok !== null)) {
					(function () {
						var __accu0__ = token_reader;
						return __call__ (__accu0__.move_past_token, __accu0__, reset_past_tok);
					}) ();
				}
			}
			return tuple ([nodes, parsing_state_delta]);
		});}
	}),
	get new_parsing_open_context () {return __get__ (this, function (self, open_context_name, open_context_token) {
		if (typeof open_context_name == 'undefined' || (open_context_name != null && open_context_name.hasOwnProperty ("__kwargtrans__"))) {;
			var open_context_name = null;
		};
		if (typeof open_context_token == 'undefined' || (open_context_token != null && open_context_token.hasOwnProperty ("__kwargtrans__"))) {;
			var open_context_token = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'open_context_name': var open_context_name = __allkwargs0__ [__attrib0__]; break;
						case 'open_context_token': var open_context_token = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return (function () {
			var __accu0__ = LatexWalker;
			return __call__ (__accu0__._ParsingContext, __accu0__, self, tuple ([open_context_name, open_context_token]));
		}) ();
	});},
	get make_token_reader () {return __get__ (this, function (self, pos) {
		if (typeof pos == 'undefined' || (pos != null && pos.hasOwnProperty ("__kwargtrans__"))) {;
			var pos = null;
		};
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
		var token_reader = (function () {
			var __accu0__ = latexnodes;
			return __call__ (__accu0__.LatexTokenReader, __accu0__, self.s, __kwargtrans__ ({tolerant_parsing: self.tolerant_parsing}));
		}) ();
		if (__t__ (pos !== null)) {
			(function () {
				var __accu0__ = token_reader;
				return __call__ (__accu0__.move_to_pos_chars, __accu0__, pos);
			}) ();
		}
		return token_reader;
	});},
	get parse_content () {return __get__ (this, function (self, parser, token_reader, parsing_state, open_context) {
		if (typeof parser == 'undefined' || (parser != null && parser.hasOwnProperty ("__kwargtrans__"))) {;
			var parser = null;
		};
		if (typeof token_reader == 'undefined' || (token_reader != null && token_reader.hasOwnProperty ("__kwargtrans__"))) {;
			var token_reader = null;
		};
		if (typeof parsing_state == 'undefined' || (parsing_state != null && parsing_state.hasOwnProperty ("__kwargtrans__"))) {;
			var parsing_state = null;
		};
		if (typeof open_context == 'undefined' || (open_context != null && open_context.hasOwnProperty ("__kwargtrans__"))) {;
			var open_context = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'parser': var parser = __allkwargs0__ [__attrib0__]; break;
						case 'token_reader': var token_reader = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
						case 'open_context': var open_context = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var the_parser = null;
		var the_token_reader = null;
		var the_parsing_state = null;
		if (__t__ (parser === null)) {
			var the_parser = (function () {
				var __accu0__ = parsers;
				return __call__ (__accu0__.LatexGeneralNodesParser, __accu0__);
			}) ();
		}
		else {
			var the_parser = parser;
		}
		if (__t__ (token_reader === null)) {
			var the_token_reader = (function () {
				var __accu0__ = self;
				return __call__ (__accu0__.make_token_reader, __accu0__);
			}) ();
		}
		else {
			var the_token_reader = token_reader;
		}
		if (__t__ (parsing_state === null)) {
			var the_parsing_state = (function () {
				var __accu0__ = self;
				return __call__ (__accu0__.make_parsing_state, __accu0__);
			}) ();
		}
		else {
			var the_parsing_state = parsing_state;
		}
		var nodes = null;
		var info = null;
		var __left0__ = tuple ([null, null]);
		var open_context_name = __left0__ [0];
		var open_context_tok = __left0__ [1];
		if (__t__ (open_context)) {
			var __left0__ = open_context;
			var open_context_name = __left0__ [0];
			var open_context_tok = __left0__ [1];
		}
		var start_pos = (function () {
			var __accu0__ = the_token_reader;
			return __call__ (__accu0__.cur_pos, __accu0__);
		}) ();
		// pass;
		var pc = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.new_parsing_open_context, __accu0__, open_context_name, open_context_tok);
		}) ();
		try {
			pc.__enter__ ();
			try {
				var __left0__ = (function () {
					var __accu0__ = the_parser;
					return __call__ (__accu0__.parse, __accu0__, __kwargtrans__ ({latex_walker: self, token_reader: the_token_reader, parsing_state: the_parsing_state}));
				}) ();
				var nodes = __left0__ [0];
				var info = __left0__ [1];
			}
			catch (__except0__) {
				if (isinstance (__except0__, LatexWalkerEndOfStream)) {
					(function () {
						var __accu0__ = logger;
						return __call__ (__accu0__.warning, __accu0__, 'End of stream encountered when parsing content with %s (%s)', the_parser.__class__.__name__, open_context_name);
					}) ();
					var __left0__ = tuple ([null, null]);
					var nodes = __left0__ [0];
					var info = __left0__ [1];
				}
				else {
					throw __except0__;
				}
			}
			pc.__exit__ ();
		}
		catch (__except0__) {
			if (! (pc.__exit__ (__except0__.name, __except0__, __except0__.stack))) {
				throw __except0__;
			}
		}
		if (__t__ (pc.recovery_from_exception !== null)) {
			var __left0__ = (function () {
				var __accu0__ = pc;
				return __call__ (__accu0__.perform_recovery_nodes_and_parsing_state_delta, __accu0__, the_token_reader);
			}) ();
			var nodes = __left0__ [0];
			var info = __left0__ [1];
		}
		// pass;
		return tuple ([nodes, info]);
	});},
	get make_nodes_collector () {return __get__ (this, function (self, token_reader, parsing_state) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'token_reader': var token_reader = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		return (function () {
			var __accu0__ = latexnodes;
			return __call__ (__accu0__.LatexNodesCollector, __accu0__, self, token_reader, parsing_state, __kwargtrans__ (kwargs));
		}) ();
	});},
	get make_node () {return __get__ (this, function (self, node_class) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'node_class': var node_class = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		var __left0__ = tuple ([(function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'pos');
		}) (), (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'pos_end', null);
		}) (), (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'parsing_state');
		}) ()]);
		var pos = __left0__ [0];
		var pos_end = __left0__ [1];
		var parsing_state = __left0__ [2];
		if (__t__ (__t__ (pos_end === null) && __t__ (pos !== null) && __in__ ('len', kwargs))) {
			(function () {
				var __accu0__ = _util;
				return __call__ (__accu0__.pylatexenc_deprecated_3, __accu0__, 'make_node(..., len=..., ...); use ‘pos_end=’ instead of ‘len=’');
			}) ();
			var len_ = __getitem__ (kwargs, 'len');
			var pos_end = __add__ (pos, len_);
		}
		var node = __call__ (node_class, null, __kwargtrans__ (__mergekwargtrans__ ({pos: pos, pos_end: pos_end, parsing_state: parsing_state, latex_walker: self}, kwargs)));
		if (__t__ (self.debug_nodes)) {
			// pass;
		}
		return node;
	});},
	get make_nodelist () {return __get__ (this, function (self, nodelist) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'nodelist': var nodelist = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		var parsing_state = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'parsing_state');
		}) ();
		return __call__ (LatexNodeList, null, __kwargtrans__ (__mergekwargtrans__ ({nodelist: nodelist, parsing_state: parsing_state, latex_walker: self}, kwargs)));
	});},
	get format_pos () {return __get__ (this, function (self, pos) {
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
		if (__t__ (pos === null)) {
			return '(location unknown)';
		}
		var __left0__ = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.pos_to_lineno_colno, __accu0__, pos);
		}) ();
		var lineno = __left0__ [0];
		var colno = __left0__ [1];
		return __call__ (format_pos, null, pos, lineno, colno);
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
		if (__t__ (self._line_no_calc === null)) {
			self._line_no_calc = (function () {
				var __accu0__ = _util;
				return __call__ (__accu0__.LineNumbersCalculator, __accu0__, self.s, __kwargtrans__ ({line_number_offset: self.line_number_offset, first_line_column_offset: self.first_line_column_offset, column_offset: self.column_offset}));
			}) ();
		}
		return (function () {
			var __accu0__ = self._line_no_calc;
			return __call__ (__accu0__.pos_to_lineno_colno, __accu0__, pos, __kwargtrans__ ({as_dict: as_dict}));
		}) ();
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
			var __accu0__ = '<LatexWalker {}>';
			return __call__ (__accu0__.format, __accu0__, __call__ (fn_unique_object_id, null, self));
		}) ();
	});}
});

