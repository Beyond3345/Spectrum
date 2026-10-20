var logging = {};
import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import {get_updated_parsing_state_from_delta} from './pylatexenc.latexnodes._parsingstatedelta.js';
import {LatexCharsNode, LatexGroupNode, LatexNodeList} from './pylatexenc.latexnodes.nodes.js';
import {LatexExpressionParser} from './pylatexenc.latexnodes.parsers._expression.js';
import {LatexDelimitedGroupParser} from './pylatexenc.latexnodes.parsers._delimited.js';
import {LatexParserBase} from './pylatexenc.latexnodes.parsers._base.js';
import {LatexWalkerEndOfStream} from './pylatexenc.latexnodes._exctypes.js';
import * as __module_logging__ from './logging.js';
__nest__ (logging, '', __module_logging__);
export {get_updated_parsing_state_from_delta, LatexParserBase, LatexDelimitedGroupParser, LatexCharsNode, LatexExpressionParser, LatexGroupNode, LatexWalkerEndOfStream, LatexNodeList};
var __name__ = 'pylatexenc.latexnodes.parsers._optionals';
export var logger = (function () {
	var __accu0__ = logging;
	return __call__ (__accu0__.getLogger, __accu0__, __name__);
}) ();
export var LatexOptionalSquareBracketsParser =  __class__ ('LatexOptionalSquareBracketsParser', [LatexDelimitedGroupParser], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, delimiters, optional) {
		if (typeof delimiters == 'undefined' || (delimiters != null && delimiters.hasOwnProperty ("__kwargtrans__"))) {;
			var delimiters = tuple (['[', ']']);
		};
		if (typeof optional == 'undefined' || (optional != null && optional.hasOwnProperty ("__kwargtrans__"))) {;
			var optional = true;
		};
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'delimiters': var delimiters = __allkwargs0__ [__attrib0__]; break;
						case 'optional': var optional = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, LatexOptionalSquareBracketsParser, '__init__'), null, self, __kwargtrans__ (__mergekwargtrans__ ({delimiters: delimiters, optional: optional}, kwargs)));
	});}
});
export var LatexOptionalCharsMarkerParser =  __class__ ('LatexOptionalCharsMarkerParser', [LatexParserBase], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, chars_list, following_arg_parser, include_chars_node_before_following_arg, return_none_instead_of_empty, allow_pre_space, return_full_node_list, collect_chars_with_following_arg_as_delimited_group, max_num_args) {
		if (typeof following_arg_parser == 'undefined' || (following_arg_parser != null && following_arg_parser.hasOwnProperty ("__kwargtrans__"))) {;
			var following_arg_parser = null;
		};
		if (typeof include_chars_node_before_following_arg == 'undefined' || (include_chars_node_before_following_arg != null && include_chars_node_before_following_arg.hasOwnProperty ("__kwargtrans__"))) {;
			var include_chars_node_before_following_arg = true;
		};
		if (typeof return_none_instead_of_empty == 'undefined' || (return_none_instead_of_empty != null && return_none_instead_of_empty.hasOwnProperty ("__kwargtrans__"))) {;
			var return_none_instead_of_empty = true;
		};
		if (typeof allow_pre_space == 'undefined' || (allow_pre_space != null && allow_pre_space.hasOwnProperty ("__kwargtrans__"))) {;
			var allow_pre_space = true;
		};
		if (typeof return_full_node_list == 'undefined' || (return_full_node_list != null && return_full_node_list.hasOwnProperty ("__kwargtrans__"))) {;
			var return_full_node_list = true;
		};
		if (typeof collect_chars_with_following_arg_as_delimited_group == 'undefined' || (collect_chars_with_following_arg_as_delimited_group != null && collect_chars_with_following_arg_as_delimited_group.hasOwnProperty ("__kwargtrans__"))) {;
			var collect_chars_with_following_arg_as_delimited_group = false;
		};
		if (typeof max_num_args == 'undefined' || (max_num_args != null && max_num_args.hasOwnProperty ("__kwargtrans__"))) {;
			var max_num_args = null;
		};
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'chars_list': var chars_list = __allkwargs0__ [__attrib0__]; break;
						case 'following_arg_parser': var following_arg_parser = __allkwargs0__ [__attrib0__]; break;
						case 'include_chars_node_before_following_arg': var include_chars_node_before_following_arg = __allkwargs0__ [__attrib0__]; break;
						case 'return_none_instead_of_empty': var return_none_instead_of_empty = __allkwargs0__ [__attrib0__]; break;
						case 'allow_pre_space': var allow_pre_space = __allkwargs0__ [__attrib0__]; break;
						case 'return_full_node_list': var return_full_node_list = __allkwargs0__ [__attrib0__]; break;
						case 'collect_chars_with_following_arg_as_delimited_group': var collect_chars_with_following_arg_as_delimited_group = __allkwargs0__ [__attrib0__]; break;
						case 'max_num_args': var max_num_args = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, LatexOptionalCharsMarkerParser, '__init__'), null, self, __kwargtrans__ (kwargs));
		if (__t__ (__call__ (isinstance, null, chars_list, str))) {
			var chars_list = (function () {
				var __accu0__ = [];
				var __iterable0__ = chars_list;
				for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
					var c = __getitem__ (__iterable0__, __index0__);
					(function () {
						var __accu1__ = __accu0__;
						return __call__ (__accu1__.append, __accu1__, c);
					}) ();
				}
				return __accu0__;
			}) ();
		}
		var normalized_chars_list = [];
		var __iterable0__ = chars_list;
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var chars = __getitem__ (__iterable0__, __index0__);
			var normalized_chars = (function () {
				var __accu0__ = ' ';
				return __call__ (__accu0__.join, __accu0__, (function () {
					var __accu1__ = (function () {
						var __accu2__ = chars;
						return __call__ (__accu2__.strip, __accu2__);
					}) ();
					return __call__ (__accu1__.py_split, __accu1__);
				}) ());
			}) ();
			if (__t__ (normalized_chars)) {
				(function () {
					var __accu0__ = normalized_chars_list;
					return __call__ (__accu0__.append, __accu0__, normalized_chars);
				}) ();
			}
		}
		self.chars_list = normalized_chars_list;
		self.following_arg_parser = following_arg_parser;
		self.include_chars_node_before_following_arg = include_chars_node_before_following_arg;
		self.return_none_instead_of_empty = return_none_instead_of_empty;
		self.allow_pre_space = allow_pre_space;
		self.return_full_node_list = return_full_node_list;
		self.collect_chars_with_following_arg_as_delimited_group = collect_chars_with_following_arg_as_delimited_group;
		self.max_num_args = max_num_args;
		if (__t__ (!__t__ ((self.chars_list)))) {
			var __except0__ = __call__ (ValueError, null, (function () {
				var __accu0__ = 'Invalid chars_list={!r}, needs to be non-empty string (after stripping whitespce)';
				return __call__ (__accu0__.format, __accu0__, chars_list);
			}) ());
			__except0__.__cause__ = null;
			throw __except0__;
		}
		if (__t__ (__t__ (!__t__ ((self.return_full_node_list))) && !__t__ ((__t__ (__eq__ (__call__ (len, null, self.chars_list), 1)) || __t__ (self.max_num_args !== null) && __le__ (self.max_num_args, 1))))) {
			var __except0__ = __call__ (ValueError, null, 'Cannot set return_full_node_list=False if we can have multiple given chars marker options (len(chars_list) > 1 and max_num_args != 1)');
			__except0__.__cause__ = null;
			throw __except0__;
		}
		if (__t__ (__t__ (!__t__ ((self.return_full_node_list))) && self.collect_chars_with_following_arg_as_delimited_group)) {
			var __except0__ = __call__ (ValueError, null, 'If collect_chars_with_following_arg_as_delimited_group=True, then we must have return_full_node_list=True');
			__except0__.__cause__ = null;
			throw __except0__;
		}
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
		return true;
	});},
	get get_following_arg_parser () {return __get__ (this, function (self, chars) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'chars': var chars = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return self.following_arg_parser;
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
		var num_args = 0;
		var full_nodelist = [];
		var empty_pos = null;
		var remaining_chars_list = self.chars_list;
		while (__t__ (__t__ (self.max_num_args === null) || __lt__ (num_args, self.max_num_args))) {
			if (__t__ (!__t__ ((remaining_chars_list)))) {
				break;
			}
			var __left0__ = (function () {
				var __accu0__ = self;
				return __call__ (__accu0__._parse_single, __accu0__, remaining_chars_list, latex_walker, token_reader, parsing_state, __kwargtrans__ (kwargs));
			}) ();
			var arg_nodes = __left0__ [0];
			var parsing_state_delta = __left0__ [1];
			var matched_chars = __left0__ [2];
			var arg_pos = __left0__ [3];
			if (__t__ (empty_pos === null)) {
				var empty_pos = arg_pos;
			}
			if (__t__ (parsing_state_delta !== null)) {
				(function () {
					var __accu0__ = logger;
					return __call__ (__accu0__.warning, __accu0__, 'Parsing state delta ignored after parsing optional chars marker: %r', parsing_state_delta);
				}) ();
			}
			if (__t__ (matched_chars === null)) {
				break;
			}
			var num_args = __call__ (__iadd__, null, num_args, 1);
			var full_nodelist = __call__ (__iadd__, null, full_nodelist, arg_nodes);
			var remaining_chars_list = (function () {
				var __accu0__ = [];
				var __iterable0__ = remaining_chars_list;
				for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
					var chars = __getitem__ (__iterable0__, __index0__);
					if (__t__ (__ne__ (chars, matched_chars))) {
						(function () {
							var __accu1__ = __accu0__;
							return __call__ (__accu1__.append, __accu1__, chars);
						}) ();
					}
				}
				return __accu0__;
			}) ();
		}
		if (__t__ (__eq__ (num_args, 0))) {
			if (__t__ (self.return_none_instead_of_empty)) {
				return tuple ([null, null]);
			}
			var emptynl = (function () {
				var __accu0__ = latex_walker;
				return __call__ (__accu0__.make_nodelist, __accu0__, [], __kwargtrans__ ({pos: empty_pos, pos_end: empty_pos, parsing_state: parsing_state}));
			}) ();
			return tuple ([emptynl, null]);
		}
		if (__t__ (!__t__ ((self.return_full_node_list)))) {
			if (__t__ (__ne__ (__call__ (len, null, full_nodelist), 1))) {
				(function () {
					var __accu0__ = logger;
					return __call__ (__accu0__.error, __accu0__, 'Internal error, node list here should have length == 1');
				}) ();
			}
			var final_node_obj = __getitem__ (full_nodelist, 0);
		}
		else {
			var final_node_obj = (function () {
				var __accu0__ = latex_walker;
				return __call__ (__accu0__.make_nodelist, __accu0__, full_nodelist, __kwargtrans__ ({parsing_state: parsing_state}));
			}) ();
		}
		return tuple ([final_node_obj, null]);
	});},
	get _parse_single () {return __get__ (this, function (self, remaining_chars_list, latex_walker, token_reader, parsing_state) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'remaining_chars_list': var remaining_chars_list = __allkwargs0__ [__attrib0__]; break;
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
		try {
			var orig_pos_tok = (function () {
				var __accu0__ = token_reader;
				return __call__ (__accu0__.peek_token, __accu0__, __kwargtrans__ ({parsing_state: parsing_state}));
			}) ();
		}
		catch (__except0__) {
			if (isinstance (__except0__, LatexWalkerEndOfStream)) {
				return tuple ([null, null, null, (function () {
					var __accu0__ = token_reader;
					return __call__ (__accu0__.cur_pos, __accu0__);
				}) ()]);
			}
			else {
				throw __except0__;
			}
		}
		var pos_end = null;
		var read_s = '';
		var match_found = false;
		var matched_chars = null;
		var matched_last_token = null;
		var first_token = null;
		try {
			while (__t__ (true)) {
				try {
					var tok = (function () {
						var __accu0__ = token_reader;
						return __call__ (__accu0__.next_token, __accu0__, __kwargtrans__ ({parsing_state: parsing_state}));
					}) ();
				}
				catch (__except0__) {
					if (isinstance (__except0__, LatexWalkerEndOfStream)) {
						break;
					}
					else {
						throw __except0__;
					}
				}
				if (__t__ (first_token === null)) {
					var first_token = tok;
					if (__t__ (__t__ (__call__ (len, null, first_token.pre_space)) && !__t__ ((self.allow_pre_space)))) {
						return tuple ([null, null, null, first_token.pos]);
					}
				}
				if (__t__ (__eq__ (tok.tok, 'specials'))) {
					tok.tok = 'char';
					tok.arg = tok.arg.specials_chars;
				}
				if (__t__ (__ne__ (tok.tok, 'char'))) {
					break;
				}
				if (__t__ (__t__ (read_s) && __call__ (len, null, tok.pre_space))) {
					var read_s = __call__ (__iadd__, null, read_s, ' ');
				}
				var read_s = __call__ (__iadd__, null, read_s, tok.arg);
				if (__t__ (__in__ (read_s, remaining_chars_list))) {
					var match_found = true;
					var matched_chars = read_s;
					var matched_last_token = tok;
					var pos_end = tok.pos_end;
				}
				if (__t__ (__eq__ (__call__ (len, null, (function () {
					var __accu0__ = [];
					var __iterable0__ = remaining_chars_list;
					for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
						var chars = __getitem__ (__iterable0__, __index0__);
						if (__t__ (__t__ ((function () {
							var __accu1__ = chars;
							return __call__ (__accu1__.startswith, __accu1__, read_s);
						}) ()) && __ne__ (chars, read_s))) {
							(function () {
								var __accu1__ = __accu0__;
								return __call__ (__accu1__.append, __accu1__, chars);
							}) ();
						}
					}
					return __accu0__;
				}) ()), 0))) {
					break;
				}
			}
		}
		finally {
			if (__t__ (!__t__ ((match_found)))) {
				(function () {
					var __accu0__ = token_reader;
					return __call__ (__accu0__.move_to_token, __accu0__, orig_pos_tok);
				}) ();
			}
			else {
				(function () {
					var __accu0__ = token_reader;
					return __call__ (__accu0__.move_past_token, __accu0__, matched_last_token);
				}) ();
			}
		}
		if (__t__ (!__t__ ((match_found)))) {
			// pass;
			return tuple ([null, null, null, orig_pos_tok.pos]);
		}
		// pass;
		var arg_pos = orig_pos_tok.pos;
		var following_arg_parser = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.get_following_arg_parser, __accu0__, matched_chars);
		}) ();
		var parsing_state_delta = null;
		var following_nodes = null;
		if (__t__ (following_arg_parser !== null)) {
			var __left0__ = (function () {
				var __accu0__ = latex_walker;
				return __call__ (__accu0__.parse_content, __accu0__, following_arg_parser, __kwargtrans__ ({token_reader: token_reader, parsing_state: parsing_state}));
			}) ();
			var following_nodes = __left0__ [0];
			var parsing_state_delta = __left0__ [1];
		}
		if (__t__ (self.collect_chars_with_following_arg_as_delimited_group)) {
			if (__t__ (__call__ (isinstance, null, following_nodes, LatexNodeList))) {
				var final_nl = following_nodes;
			}
			else {
				var final_nl = (function () {
					var __accu0__ = latex_walker;
					return __call__ (__accu0__.make_nodelist, __accu0__, [following_nodes], __kwargtrans__ ({parsing_state: parsing_state}));
				}) ();
			}
			var final_nl_pos_end = final_nl.pos_end;
			if (__t__ (final_nl_pos_end === null)) {
				var final_nl_pos_end = arg_pos;
			}
			var nodes = [(function () {
				var __accu0__ = latex_walker;
				return __call__ (__accu0__.make_node, __accu0__, LatexGroupNode, __kwargtrans__ ({parsing_state: parsing_state, delimiters: tuple ([matched_chars, '']), nodelist: final_nl, pos: arg_pos, pos_end: final_nl_pos_end}));
			}) ()];
			return tuple ([nodes, parsing_state_delta, matched_chars, arg_pos]);
		}
		var chars_node = null;
		if (__t__ (__t__ (__t__ (!__t__ ((self.return_full_node_list))) && following_arg_parser === null) || self.include_chars_node_before_following_arg)) {
			var chars_node = (function () {
				var __accu0__ = latex_walker;
				return __call__ (__accu0__.make_node, __accu0__, LatexCharsNode, __kwargtrans__ ({parsing_state: parsing_state, chars: matched_chars, pos: arg_pos, pos_end: pos_end}));
			}) ();
		}
		if (__t__ (!__t__ ((self.return_full_node_list)))) {
			if (__t__ (following_arg_parser !== null)) {
				return tuple ([[following_nodes], parsing_state_delta, matched_chars, arg_pos]);
			}
			else {
				assert (chars_node !== null);
				return tuple ([[chars_node], parsing_state_delta, matched_chars, arg_pos]);
			}
		}
		var nodes = [];
		if (__t__ (self.include_chars_node_before_following_arg)) {
			assert (chars_node !== null);
			(function () {
				var __accu0__ = nodes;
				return __call__ (__accu0__.append, __accu0__, chars_node);
			}) ();
		}
		if (__t__ (following_arg_parser !== null)) {
			if (__t__ (__call__ (isinstance, null, following_nodes, LatexNodeList))) {
				var following_nodes_as_list = following_nodes;
			}
			else {
				var following_nodes_as_list = [following_nodes];
			}
			var nodes = __call__ (__iadd__, null, nodes, following_nodes_as_list);
		}
		return tuple ([nodes, parsing_state_delta, matched_chars, arg_pos]);
	});}
});
export var LatexOptionalEmbellishmentArgsParser =  __class__ ('LatexOptionalEmbellishmentArgsParser', [LatexOptionalCharsMarkerParser], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, embellishment_chars, allow_pre_space) {
		if (typeof allow_pre_space == 'undefined' || (allow_pre_space != null && allow_pre_space.hasOwnProperty ("__kwargtrans__"))) {;
			var allow_pre_space = true;
		};
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'embellishment_chars': var embellishment_chars = __allkwargs0__ [__attrib0__]; break;
						case 'allow_pre_space': var allow_pre_space = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, LatexOptionalEmbellishmentArgsParser, '__init__'), null, self, __kwargtrans__ (__mergekwargtrans__ ({chars_list: embellishment_chars, following_arg_parser: __call__ (LatexExpressionParser, null, __kwargtrans__ ({allow_pre_space: allow_pre_space, return_full_node_list: true})), allow_pre_space: allow_pre_space, collect_chars_with_following_arg_as_delimited_group: true, return_full_node_list: true}, kwargs)));
		self.embellishment_chars = embellishment_chars;
	});}
});

