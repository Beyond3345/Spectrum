var logging = {};
import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import {LatexDelimitedGroupParser} from './pylatexenc.latexnodes.parsers._delimited.js';
import {ParsedArguments} from './pylatexenc.latexnodes._parsedargs.js';
import {LatexParserBase} from './pylatexenc.latexnodes.parsers._base.js';
import {LatexCharsNode, LatexCommentNode, LatexEnvironmentNode, LatexGroupNode, LatexMacroNode, LatexMathNode, LatexNode, LatexNodeList, LatexNodesVisitor, LatexSpecialsNode, LatexWalkerParseError, _UseList, __all__, _display_abbrev_str, _display_str_delimiters, _get_content_as_chars, _update_posposend_from_nodelist, latex_node_types} from './pylatexenc.latexnodes.nodes.js';
import {LatexWalkerEndOfStream, LatexWalkerNodesParseError, LatexWalkerTokenParseError} from './pylatexenc.latexnodes._exctypes.js';
import * as __module_logging__ from './logging.js';
__nest__ (logging, '', __module_logging__);
export {latex_node_types, LatexNodesVisitor, LatexCommentNode, _update_posposend_from_nodelist, __all__, LatexWalkerParseError, LatexGroupNode, LatexWalkerNodesParseError, LatexDelimitedGroupParser, LatexCharsNode, LatexWalkerTokenParseError, LatexParserBase, ParsedArguments, LatexWalkerEndOfStream, LatexSpecialsNode, _UseList, _display_abbrev_str, LatexEnvironmentNode, LatexMathNode, _get_content_as_chars, LatexNode, _display_str_delimiters, LatexNodeList, LatexMacroNode};
var __name__ = 'pylatexenc.latexnodes.parsers._expression';
export var logger = (function () {
	var __accu0__ = logging;
	return __call__ (__accu0__.getLogger, __accu0__, __name__);
}) ();
export var _TryAgainWithSkippedCommentOrWhitespaceNodes =  __class__ ('_TryAgainWithSkippedCommentOrWhitespaceNodes', [Exception], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, skipped_nodes, pos) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'skipped_nodes': var skipped_nodes = __allkwargs0__ [__attrib0__]; break;
						case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, _TryAgainWithSkippedCommentOrWhitespaceNodes, '__init__'), null, self, '<internal>');
		self.skipped_nodes = skipped_nodes;
		self.pos = pos;
	});}
});
export var LatexExpressionParser =  __class__ ('LatexExpressionParser', [LatexParserBase], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, allow_pre_space, allow_pre_comments, return_full_node_list, single_token_requiring_arg_is_error, parse_callable_arguments) {
		if (typeof allow_pre_space == 'undefined' || (allow_pre_space != null && allow_pre_space.hasOwnProperty ("__kwargtrans__"))) {;
			var allow_pre_space = true;
		};
		if (typeof allow_pre_comments == 'undefined' || (allow_pre_comments != null && allow_pre_comments.hasOwnProperty ("__kwargtrans__"))) {;
			var allow_pre_comments = true;
		};
		if (typeof return_full_node_list == 'undefined' || (return_full_node_list != null && return_full_node_list.hasOwnProperty ("__kwargtrans__"))) {;
			var return_full_node_list = true;
		};
		if (typeof single_token_requiring_arg_is_error == 'undefined' || (single_token_requiring_arg_is_error != null && single_token_requiring_arg_is_error.hasOwnProperty ("__kwargtrans__"))) {;
			var single_token_requiring_arg_is_error = true;
		};
		if (typeof parse_callable_arguments == 'undefined' || (parse_callable_arguments != null && parse_callable_arguments.hasOwnProperty ("__kwargtrans__"))) {;
			var parse_callable_arguments = false;
		};
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'allow_pre_space': var allow_pre_space = __allkwargs0__ [__attrib0__]; break;
						case 'allow_pre_comments': var allow_pre_comments = __allkwargs0__ [__attrib0__]; break;
						case 'return_full_node_list': var return_full_node_list = __allkwargs0__ [__attrib0__]; break;
						case 'single_token_requiring_arg_is_error': var single_token_requiring_arg_is_error = __allkwargs0__ [__attrib0__]; break;
						case 'parse_callable_arguments': var parse_callable_arguments = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, LatexExpressionParser, '__init__'), null, self, __kwargtrans__ (kwargs));
		self.allow_pre_space = allow_pre_space;
		self.allow_pre_comments = allow_pre_comments;
		self.return_full_node_list = return_full_node_list;
		self.single_token_requiring_arg_is_error = single_token_requiring_arg_is_error;
		self.parse_callable_arguments = parse_callable_arguments;
	});},
	get contents_can_be_empty () {return __get__ (this, function (self) {
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
		return false;
	});},
	get parse () {return __get__ (this, function (self, latex_walker, token_reader, parsing_state) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
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
		var expr_parsing_state = (function () {
			var __accu0__ = parsing_state;
			return __call__ (__accu0__.sub_context, __accu0__, __kwargtrans__ ({enable_environments: false}));
		}) ();
		var exprnodes = [];
		while (__t__ (true)) {
			try {
				var moreexprnodes = (function () {
					var __accu0__ = self;
					return __call__ (__accu0__._parse_single_token, __accu0__, latex_walker, token_reader, expr_parsing_state, __kwargtrans__ (__mergekwargtrans__ ({parsing_state: parsing_state}, kwargs)));
				}) ();
			}
			catch (__except0__) {
				if (isinstance (__except0__, _TryAgainWithSkippedCommentOrWhitespaceNodes)) {
					var e = __except0__;
					var exprnodes = __call__ (__iadd__, null, exprnodes, e.skipped_nodes);
					continue;
				}
				else {
					throw __except0__;
				}
			}
			var exprnodes = __call__ (__iadd__, null, exprnodes, moreexprnodes);
			if (__t__ (!__t__ ((__call__ (len, null, exprnodes))))) {
				var thenodelist = (function () {
					var __accu0__ = latex_walker;
					return __call__ (__accu0__.make_nodelist, __accu0__, [], __kwargtrans__ ({pos: (function () {
						var __accu1__ = token_reader;
						return __call__ (__accu1__.cur_pos, __accu1__);
					}) (), pos_end: (function () {
						var __accu1__ = token_reader;
						return __call__ (__accu1__.cur_pos, __accu1__);
					}) (), parsing_state: parsing_state}));
				}) ();
			}
			else {
				var thenodelist = (function () {
					var __accu0__ = latex_walker;
					return __call__ (__accu0__.make_nodelist, __accu0__, exprnodes, __kwargtrans__ ({parsing_state: parsing_state}));
				}) ();
			}
			// pass;
			if (__t__ (self.return_full_node_list)) {
				var result = thenodelist;
			}
			else if (__t__ (__call__ (len, null, thenodelist))) {
				var result = __getitem__ (thenodelist, __neg__ (1));
			}
			else {
				var result = (function () {
					var __accu0__ = latex_walker;
					return __call__ (__accu0__.make_node, __accu0__, LatexGroupNode, __kwargtrans__ ({parsing_state: parsing_state, nodelist: thenodelist, delimiters: tuple (['', '']), pos: thenodelist.pos, pos_end: thenodelist.pos_end}));
				}) ();
			}
			return tuple ([result, null]);
		}
	});},
	get _parse_single_token () {return __get__ (this, function (self, latex_walker, token_reader, expr_parsing_state, parsing_state) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
						case 'token_reader': var token_reader = __allkwargs0__ [__attrib0__]; break;
						case 'expr_parsing_state': var expr_parsing_state = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		try {
			var tok = (function () {
				var __accu0__ = token_reader;
				return __call__ (__accu0__.next_token, __accu0__, __kwargtrans__ ({parsing_state: expr_parsing_state}));
			}) ();
		}
		catch (__except0__) {
			if (isinstance (__except0__, LatexWalkerTokenParseError)) {
				var e = __except0__;
				var exc = (function () {
					var __accu0__ = latex_walker;
					return __call__ (__accu0__.check_tolerant_parsing_ignore_error, __accu0__, e);
				}) ();
				if (__t__ (exc !== null)) {
					var __except1__ = exc;
					__except1__.__cause__ = null;
					throw __except1__;
				}
				var tok = exc.recovery_token_placeholder;
				(function () {
					var __accu0__ = token_reader;
					return __call__ (__accu0__.move_to_pos_chars, __accu0__, exc.recovery_token_at_pos);
				}) ();
			}
			else if (isinstance (__except0__, LatexWalkerEndOfStream)) {
				var e = __except0__;
				var exc = (function () {
					var __accu0__ = latex_walker;
					return __call__ (__accu0__.check_tolerant_parsing_ignore_error, __accu0__, __call__ (LatexWalkerParseError, null, 'End of input encountered but we expected an expression', __kwargtrans__ ({pos: (function () {
						var __accu1__ = token_reader;
						return __call__ (__accu1__.cur_pos, __accu1__);
					}) (), error_type_info: dict ({'what': 'expression_required_got_unexpected', 'unexpected': 'end_of_stream'})})));
				}) ();
				if (__t__ (exc !== null)) {
					var __except1__ = exc;
					__except1__.__cause__ = null;
					throw __except1__;
				}
				return [];
			}
			else {
				throw __except0__;
			}
		}
		if (__t__ (__call__ (len, null, tok.pre_space))) {
			if (__t__ (self.allow_pre_space)) {
				(function () {
					var __accu0__ = token_reader;
					return __call__ (__accu0__.move_to_token, __accu0__, tok, __kwargtrans__ ({rewind_pre_space: false}));
				}) ();
				var wspos = __sub__ (tok.pos, __call__ (len, null, tok.pre_space));
				var cnodes = [(function () {
					var __accu0__ = latex_walker;
					return __call__ (__accu0__.make_node, __accu0__, LatexCharsNode, __kwargtrans__ ({parsing_state: parsing_state, chars: tok.pre_space, pos: wspos, pos_end: tok.pos}));
				}) ()];
				var __except0__ = __call__ (_TryAgainWithSkippedCommentOrWhitespaceNodes, null, cnodes, wspos);
				__except0__.__cause__ = null;
				throw __except0__;
			}
			var exc = (function () {
				var __accu0__ = latex_walker;
				return __call__ (__accu0__.check_tolerant_parsing_ignore_error, __accu0__, __call__ (LatexWalkerParseError, null, 'Expected expression w/o leading whitespace but found whitespace', __kwargtrans__ ({pos: __sub__ (tok.pos, __call__ (len, null, tok.pre_space)), error_type_info: dict ({'what': 'expression_required_got_unexpected', 'unexpected': 'whitespace', 'whitespace': tok.pre_space})})));
			}) ();
			if (__t__ (exc !== null)) {
				var __except0__ = exc;
				__except0__.__cause__ = null;
				throw __except0__;
			}
			(function () {
				var __accu0__ = token_reader;
				return __call__ (__accu0__.move_to_token, __accu0__, tok, __kwargtrans__ ({rewind_pre_space: false}));
			}) ();
			var __except0__ = __call__ (_TryAgainWithSkippedCommentOrWhitespaceNodes, null, [], tok.pos);
			__except0__.__cause__ = null;
			throw __except0__;
		}
		if (__t__ (__eq__ (tok.tok, 'macro'))) {
			var macroname = tok.arg;
			if (__t__ (__t__ (self.single_token_requiring_arg_is_error) && __in__ (macroname, tuple (['begin', 'end'])))) {
				(function () {
					var __accu0__ = token_reader;
					return __call__ (__accu0__.move_to_token, __accu0__, tok);
				}) ();
				var __except0__ = __call__ (LatexWalkerNodesParseError, null, __kwargtrans__ ({msg: (function () {
					var __accu0__ = 'Expected expression, got \\{}';
					return __call__ (__accu0__.format, __accu0__, macroname);
				}) (), pos: tok.pos, recovery_nodes: (function () {
					var __accu0__ = latex_walker;
					return __call__ (__accu0__.make_node, __accu0__, LatexCharsNode, __kwargtrans__ ({parsing_state: parsing_state, chars: '', pos: tok.pos, pos_end: tok.pos}));
				}) (), recovery_at_token: tok, error_type_info: dict ({'what': 'expression_required_got_unexpected', 'unexpected': 'beginend', 'beginend': macroname})}));
				__except0__.__cause__ = null;
				throw __except0__;
			}
			var mspec = (function () {
				var __accu0__ = parsing_state.latex_context;
				return __call__ (__accu0__.get_macro_spec, __accu0__, macroname);
			}) ();
			if (__t__ (self.parse_callable_arguments)) {
				return (function () {
					var __accu0__ = self;
					return __call__ (__accu0__._parse_callable_with_arguments, __accu0__, latex_walker, token_reader, parsing_state, tok, mspec, (function () {
						var __accu1__ = 'a single macro ‘\\{}’';
						return __call__ (__accu1__.format, __accu1__, macroname);
					}) ());
				}) ();
			}
			var parsed_arguments = (function () {
				var __accu0__ = self;
				return __call__ (__accu0__._check_if_requires_args, __accu0__, latex_walker, mspec, tok, parsing_state, (function () {
					var __accu1__ = 'a single macro ‘\\{}’';
					return __call__ (__accu1__.format, __accu1__, macroname);
				}) ());
			}) ();
			return [(function () {
				var __accu0__ = latex_walker;
				return __call__ (__accu0__.make_node, __accu0__, LatexMacroNode, __kwargtrans__ ({parsing_state: parsing_state, macroname: tok.arg, spec: mspec, nodeargd: parsed_arguments, macro_post_space: tok.post_space, pos: tok.pos, pos_end: tok.pos_end}));
			}) ()];
		}
		if (__t__ (__eq__ (tok.tok, 'specials'))) {
			var specialsspec = tok.arg;
			if (__t__ (self.parse_callable_arguments)) {
				return (function () {
					var __accu0__ = self;
					return __call__ (__accu0__._parse_callable_with_arguments, __accu0__, latex_walker, token_reader, parsing_state, tok, specialsspec, (function () {
						var __accu1__ = 'specials ‘{}’';
						return __call__ (__accu1__.format, __accu1__, specialsspec.specials_chars);
					}) ());
				}) ();
			}
			var parsed_arguments = (function () {
				var __accu0__ = self;
				return __call__ (__accu0__._check_if_requires_args, __accu0__, latex_walker, specialsspec, tok, parsing_state, (function () {
					var __accu1__ = 'specials ‘{}’';
					return __call__ (__accu1__.format, __accu1__, specialsspec.specials_chars);
				}) ());
			}) ();
			return [(function () {
				var __accu0__ = latex_walker;
				return __call__ (__accu0__.make_node, __accu0__, LatexSpecialsNode, __kwargtrans__ ({parsing_state: parsing_state, specials_chars: specialsspec.specials_chars, spec: specialsspec, nodeargd: parsed_arguments, pos: tok.pos, pos_end: tok.pos_end}));
			}) ()];
		}
		if (__t__ (__eq__ (tok.tok, 'comment'))) {
			if (__t__ (self.allow_pre_comments)) {
				var cnodes = [(function () {
					var __accu0__ = latex_walker;
					return __call__ (__accu0__.make_node, __accu0__, LatexCommentNode, __kwargtrans__ ({parsing_state: parsing_state, comment: tok.arg, comment_post_space: tok.post_space, pos: tok.pos, pos_end: tok.pos_end}));
				}) ()];
				var __except0__ = __call__ (_TryAgainWithSkippedCommentOrWhitespaceNodes, null, cnodes, tok.pos);
				__except0__.__cause__ = null;
				throw __except0__;
			}
			var exc = (function () {
				var __accu0__ = latex_walker;
				return __call__ (__accu0__.check_tolerant_parsing_ignore_error, __accu0__, __call__ (LatexWalkerParseError, null, (function () {
					var __accu1__ = 'Expected expression w/o leading comments but found comment ‘%{}’';
					return __call__ (__accu1__.format, __accu1__, tok.arg);
				}) (), __kwargtrans__ ({pos: tok.pos, error_type_info: dict ({'what': 'expression_required_got_unexpected', 'unexpected': 'comment', 'comment': tok.arg})})));
			}) ();
			if (__t__ (exc !== null)) {
				var __except0__ = exc;
				__except0__.__cause__ = null;
				throw __except0__;
			}
			var __except0__ = __call__ (_TryAgainWithSkippedCommentOrWhitespaceNodes, null, [], tok.pos);
			__except0__.__cause__ = null;
			throw __except0__;
		}
		if (__t__ (__eq__ (tok.tok, 'brace_open'))) {
			(function () {
				var __accu0__ = token_reader;
				return __call__ (__accu0__.move_to_token, __accu0__, tok);
			}) ();
			var __left0__ = (function () {
				var __accu0__ = latex_walker;
				return __call__ (__accu0__.parse_content, __accu0__, __call__ (LatexDelimitedGroupParser, null, __kwargtrans__ ({delimiters: tok.arg})), __kwargtrans__ ({token_reader: token_reader, parsing_state: parsing_state}));
			}) ();
			var groupnode = __left0__ [0];
			var parsing_state_delta = __left0__ [1];
			// pass;
			if (__t__ (parsing_state_delta !== null)) {
				(function () {
					var __accu0__ = logger;
					return __call__ (__accu0__.warning, __accu0__, 'Ignoring parsing_state_delta after parsing an expression group!');
				}) ();
			}
			return [groupnode];
		}
		if (__t__ (__eq__ (tok.tok, 'brace_close'))) {
			(function () {
				var __accu0__ = token_reader;
				return __call__ (__accu0__.move_to_token, __accu0__, tok);
			}) ();
			var exc = __call__ (LatexWalkerNodesParseError, null, __kwargtrans__ ({msg: (function () {
				var __accu0__ = 'Expected LaTeX expression, got closing brace ‘{}’';
				return __call__ (__accu0__.format, __accu0__, tok.arg);
			}) (), pos: tok.pos, recovery_nodes: (function () {
				var __accu0__ = latex_walker;
				return __call__ (__accu0__.make_node, __accu0__, LatexCharsNode, __kwargtrans__ ({parsing_state: parsing_state, chars: '', pos: tok.pos, pos_end: tok.pos}));
			}) (), recovery_at_token: tok, error_type_info: dict ({'what': 'expression_required_got_unexpected', 'unexpected': 'closing_latex_group', 'delimiter': tok.arg})}));
			exc._error_was_unexpected_closing_brace_in_expression = true;
			var __except0__ = exc;
			__except0__.__cause__ = null;
			throw __except0__;
		}
		if (__t__ (__eq__ (tok.tok, 'char'))) {
			return [(function () {
				var __accu0__ = latex_walker;
				return __call__ (__accu0__.make_node, __accu0__, LatexCharsNode, __kwargtrans__ ({parsing_state: parsing_state, chars: tok.arg, pos: tok.pos, pos_end: tok.pos_end}));
			}) ()];
		}
		if (__t__ (__in__ (tok.tok, tuple (['mathmode_inline', 'mathmode_display'])))) {
			(function () {
				var __accu0__ = token_reader;
				return __call__ (__accu0__.move_to_token, __accu0__, tok);
			}) ();
			var __except0__ = __call__ (LatexWalkerNodesParseError, null, __kwargtrans__ ({msg: (function () {
				var __accu0__ = 'Unexpected math mode delimiter ‘{}’, was expecting a LaTeX expression';
				return __call__ (__accu0__.format, __accu0__, tok.arg);
			}) (), pos: tok.pos, recovery_nodes: (function () {
				var __accu0__ = latex_walker;
				return __call__ (__accu0__.make_node, __accu0__, LatexCharsNode, __kwargtrans__ ({parsing_state: parsing_state, chars: '', pos: tok.pos, pos_end: tok.pos}));
			}) (), recovery_at_token: tok, error_type_info: dict ({'what': 'expression_required_got_unexpected', 'unexpected': 'math_mode_delimiter', 'mathmode_type': tok.tok, 'delimiter': tok.arg})}));
			__except0__.__cause__ = null;
			throw __except0__;
		}
		var __except0__ = __call__ (LatexWalkerParseError, null, (function () {
			var __accu0__ = 'Unknown token type: ‘{}’';
			return __call__ (__accu0__.format, __accu0__, tok.tok);
		}) (), __kwargtrans__ ({pos: tok.pos}));
		__except0__.__cause__ = null;
		throw __except0__;
	});},
	get _parse_callable_with_arguments () {return __get__ (this, function (self, latex_walker, token_reader, parsing_state, got_token, spec, what_we_got) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
						case 'token_reader': var token_reader = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
						case 'got_token': var got_token = __allkwargs0__ [__attrib0__]; break;
						case 'spec': var spec = __allkwargs0__ [__attrib0__]; break;
						case 'what_we_got': var what_we_got = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var node_parser = null;
		if (__t__ (spec !== null)) {
			var node_parser = (function () {
				var __accu0__ = spec;
				return __call__ (__accu0__.get_node_parser, __accu0__, got_token, parsing_state);
			}) ();
		}
		if (__t__ (node_parser === null)) {
			var exc = (function () {
				var __accu0__ = latex_walker;
				return __call__ (__accu0__.check_tolerant_parsing_ignore_error, __accu0__, __call__ (LatexWalkerParseError, null, (function () {
					var __accu1__ = 'No parser found for {}';
					return __call__ (__accu1__.format, __accu1__, what_we_got);
				}) (), __kwargtrans__ ({pos: got_token.pos, error_type_info: dict ({'what': 'expression_required_got_unexpected', 'unexpected': 'callable_without_parser', 'callable_token': got_token})})));
			}) ();
			if (__t__ (exc !== null)) {
				var __except0__ = exc;
				__except0__.__cause__ = null;
				throw __except0__;
			}
			return [];
		}
		var __left0__ = (function () {
			var __accu0__ = latex_walker;
			return __call__ (__accu0__.parse_content, __accu0__, node_parser, token_reader, parsing_state, __kwargtrans__ ({open_context: tuple ([what_we_got, got_token])}));
		}) ();
		var thenode = __left0__ [0];
		var _ = __left0__ [1];
		if (__t__ (thenode === null)) {
			return [];
		}
		return [thenode];
	});},
	get _check_if_requires_args () {return __get__ (this, function (self, latex_walker, spec, got_token, parsing_state, what_we_got) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
						case 'spec': var spec = __allkwargs0__ [__attrib0__]; break;
						case 'got_token': var got_token = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
						case 'what_we_got': var what_we_got = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (self.single_token_requiring_arg_is_error)) {
			var arg_contents_empty_ok = (function () {
				var __accu0__ = (function () {
					var __accu1__ = spec;
					return __call__ (__accu1__.get_node_parser, __accu1__, got_token, parsing_state);
				}) ();
				return __call__ (__accu0__.contents_can_be_empty, __accu0__);
			}) ();
			// pass;
			if (__t__ (!__t__ ((arg_contents_empty_ok)))) {
				var exc = (function () {
					var __accu0__ = latex_walker;
					return __call__ (__accu0__.check_tolerant_parsing_ignore_error, __accu0__, __call__ (LatexWalkerParseError, null, (function () {
						var __accu1__ = 'Expected a LaTeX expression but got {} which expects arguments; did you mean to provide an expression in {{curly braces}} ?';
						return __call__ (__accu1__.format, __accu1__, what_we_got);
					}) (), __kwargtrans__ ({pos: got_token.pos, error_type_info: dict ({'what': 'expression_required_got_unexpected', 'unexpected': 'callable_with_mandatory_arguments', 'callable_token': got_token})})));
				}) ();
				if (__t__ (exc !== null)) {
					var __except0__ = exc;
					__except0__.__cause__ = null;
					throw __except0__;
				}
				return null;
			}
		}
		return __call__ (ParsedArguments, null);
	});}
});

