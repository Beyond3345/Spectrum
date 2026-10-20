var logging = {};
import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import {LatexDelimitedVerbatimParser} from './pylatexenc.latexnodes.parsers._verbatim.js';
import {LatexExpressionParser} from './pylatexenc.latexnodes.parsers._expression.js';
import {LatexOptionalCharsMarkerParser, LatexOptionalEmbellishmentArgsParser} from './pylatexenc.latexnodes.parsers._optionals.js';
import {LatexDelimitedExpressionParserInfo, LatexDelimitedGroupParser, LatexDelimitedGroupParserInfo, LatexDelimitedMultiDelimGroupParser} from './pylatexenc.latexnodes.parsers._delimited.js';
import {LatexGeneralNodesParser} from './pylatexenc.latexnodes.parsers._generalnodes.js';
import {LatexParserBase} from './pylatexenc.latexnodes.parsers._base.js';
import {LatexCharsNode, LatexCommentNode, LatexEnvironmentNode, LatexGroupNode, LatexMacroNode, LatexMathNode, LatexNode, LatexNodeList, LatexNodesVisitor, LatexSpecialsNode, LatexWalkerParseError, ParsedArguments, _UseList, __all__, _display_abbrev_str, _display_str_delimiters, _get_content_as_chars, _update_posposend_from_nodelist, latex_node_types} from './pylatexenc.latexnodes.nodes.js';
import {} from './pylatexenc.latexnodes._exctypes.js';
import * as __module_logging__ from './logging.js';
__nest__ (logging, '', __module_logging__);
export {latex_node_types, LatexNodesVisitor, LatexCommentNode, _update_posposend_from_nodelist, LatexDelimitedMultiDelimGroupParser, __all__, LatexWalkerParseError, LatexGroupNode, LatexDelimitedGroupParserInfo, LatexOptionalEmbellishmentArgsParser, LatexGeneralNodesParser, LatexDelimitedGroupParser, LatexCharsNode, LatexOptionalCharsMarkerParser, LatexParserBase, ParsedArguments, LatexExpressionParser, LatexDelimitedVerbatimParser, LatexSpecialsNode, _UseList, _display_abbrev_str, LatexDelimitedExpressionParserInfo, LatexEnvironmentNode, LatexMathNode, _get_content_as_chars, LatexNode, _display_str_delimiters, LatexNodeList, LatexMacroNode};
var __name__ = 'pylatexenc.latexnodes.parsers._stdarg';
export var logger = (function () {
	var __accu0__ = logging;
	return __call__ (__accu0__.getLogger, __accu0__, __name__);
}) ();
export var _std_arg_parser_instances = dict ({});
export var get_standard_argument_parser = function (arg_spec) {
	var kwargs = dict ();
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'arg_spec': var arg_spec = __allkwargs0__ [__attrib0__]; break;
					default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
				}
			}
			delete kwargs.__kwargtrans__;
		}
	}
	else {
	}
	if (__t__ (!__t__ ((__call__ (len, null, kwargs))))) {
		var k = arg_spec;
	}
	else {
		var d = dict ({'arg_spec': arg_spec});
		(function () {
			var __accu0__ = d;
			return __call__ (__accu0__.py_update, __accu0__, kwargs);
		}) ();
		var k = __call__ (tuple, null, __call__ (list, null, __call__ (sorted, null, (function () {
			var __accu0__ = d;
			return __call__ (__accu0__.py_items, __accu0__);
		}) (), __kwargtrans__ ({key: (function __lambda__ (v) {
			if (arguments.length) {
				var __ilastarg0__ = arguments.length - 1;
				if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
					var __allkwargs0__ = arguments [__ilastarg0__--];
					for (var __attrib0__ in __allkwargs0__) {
						switch (__attrib0__) {
							case 'v': var v = __allkwargs0__ [__attrib0__]; break;
						}
					}
				}
			}
			else {
			}
			return __getitem__ (v, 0);
		})}))));
	}
	if (__t__ (!__in__ (k, _std_arg_parser_instances))) {
		var instance = __call__ (LatexStandardArgumentParser, null, arg_spec, __kwargtrans__ (kwargs));
		__setitem__ (_std_arg_parser_instances, k, instance);
		return instance;
	}
	return __getitem__ (_std_arg_parser_instances, k);
};
export var LatexStandardArgumentParser =  __class__ ('LatexStandardArgumentParser', [LatexParserBase], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, arg_spec, return_full_node_list, expression_single_token_requiring_arg_is_error, allow_pre_space) {
		if (typeof arg_spec == 'undefined' || (arg_spec != null && arg_spec.hasOwnProperty ("__kwargtrans__"))) {;
			var arg_spec = '{';
		};
		if (typeof return_full_node_list == 'undefined' || (return_full_node_list != null && return_full_node_list.hasOwnProperty ("__kwargtrans__"))) {;
			var return_full_node_list = false;
		};
		if (typeof expression_single_token_requiring_arg_is_error == 'undefined' || (expression_single_token_requiring_arg_is_error != null && expression_single_token_requiring_arg_is_error.hasOwnProperty ("__kwargtrans__"))) {;
			var expression_single_token_requiring_arg_is_error = true;
		};
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
						case 'arg_spec': var arg_spec = __allkwargs0__ [__attrib0__]; break;
						case 'return_full_node_list': var return_full_node_list = __allkwargs0__ [__attrib0__]; break;
						case 'expression_single_token_requiring_arg_is_error': var expression_single_token_requiring_arg_is_error = __allkwargs0__ [__attrib0__]; break;
						case 'allow_pre_space': var allow_pre_space = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, LatexStandardArgumentParser, '__init__'), null, self, __kwargtrans__ (kwargs));
		self.arg_spec = arg_spec;
		self.return_full_node_list = return_full_node_list;
		self.expression_single_token_requiring_arg_is_error = expression_single_token_requiring_arg_is_error;
		self.allow_pre_space = allow_pre_space;
		self._arg_parser = null;
	});},
	get get_arg_parser_instance () {return __get__ (this, function (self, arg_spec) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'arg_spec': var arg_spec = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (__in__ (arg_spec, tuple (['m', '{'])))) {
			return __call__ (LatexExpressionParser, null, __kwargtrans__ ({return_full_node_list: self.return_full_node_list, single_token_requiring_arg_is_error: self.expression_single_token_requiring_arg_is_error, allow_pre_space: self.allow_pre_space, allow_pre_comments: self.allow_pre_space}));
		}
		else if (__t__ (__in__ (arg_spec, tuple (['o', '['])))) {
			return __call__ (LatexDelimitedGroupParser, null, __kwargtrans__ ({delimiters: tuple (['[', ']']), optional: true, allow_pre_space: self.allow_pre_space}));
		}
		else if (__t__ (__in__ (arg_spec, tuple (['s', '*'])))) {
			return __call__ (LatexOptionalCharsMarkerParser, null, __kwargtrans__ ({chars_list: ['*'], allow_pre_space: self.allow_pre_space, return_full_node_list: self.return_full_node_list}));
		}
		else if (__t__ ((function () {
			var __accu0__ = arg_spec;
			return __call__ (__accu0__.startswith, __accu0__, 'e');
		}) ())) {
			var arg_spec_arg = (function () {
				var __accu0__ = __getslice__ (arg_spec, 1, null, 1);
				return __call__ (__accu0__.strip, __accu0__);
			}) ();
			if (__t__ (__t__ (__le__ (__call__ (len, null, arg_spec_arg), 2)) || __t__ (__ne__ (__getitem__ (arg_spec_arg, 0), '{')) || __ne__ (__getitem__ (arg_spec_arg, __sub__ (__call__ (len, null, arg_spec_arg), 1)), '}'))) {
				var __except0__ = __call__ (ValueError, null, __add__ ('Expected embellishment chars with syntax ‘e{<chars>}’ in ', (function () {
					var __accu0__ = 'arg_spec; got ‘{}’';
					return __call__ (__accu0__.format, __accu0__, arg_spec);
				}) ()));
				__except0__.__cause__ = null;
				throw __except0__;
			}
			var embellishment_chars = __getslice__ (arg_spec_arg, 1, __sub__ (__call__ (len, null, arg_spec_arg), 1), 1);
			return __call__ (LatexOptionalEmbellishmentArgsParser, null, __kwargtrans__ ({embellishment_chars: embellishment_chars, allow_pre_space: self.allow_pre_space}));
		}
		else if (__t__ ((function () {
			var __accu0__ = arg_spec;
			return __call__ (__accu0__.startswith, __accu0__, 't');
		}) ())) {
			if (__t__ (__ne__ (__call__ (len, null, arg_spec), 2))) {
				var __except0__ = __call__ (ValueError, null, 'arg_spec for an optional char argument should be of the form ‘t<char>’');
				__except0__.__cause__ = null;
				throw __except0__;
			}
			var the_char = __getitem__ (arg_spec, 1);
			return __call__ (LatexOptionalCharsMarkerParser, null, __kwargtrans__ ({chars_list: [the_char], allow_pre_space: self.allow_pre_space, return_full_node_list: self.return_full_node_list}));
		}
		else if (__t__ ((function () {
			var __accu0__ = arg_spec;
			return __call__ (__accu0__.startswith, __accu0__, 'r');
		}) ())) {
			if (__t__ (__ne__ (__call__ (len, null, arg_spec), 3))) {
				var __except0__ = __call__ (ValueError, null, 'arg_spec for a required delimited argument should be of the form ‘r<char1><char2>’');
				__except0__.__cause__ = null;
				throw __except0__;
			}
			var open_char = __getitem__ (arg_spec, 1);
			var close_char = __getitem__ (arg_spec, 2);
			return __call__ (LatexDelimitedGroupParser, null, __kwargtrans__ ({delimiters: tuple ([open_char, close_char]), optional: false, allow_pre_space: self.allow_pre_space}));
		}
		else if (__t__ ((function () {
			var __accu0__ = arg_spec;
			return __call__ (__accu0__.startswith, __accu0__, 'd');
		}) ())) {
			if (__t__ (__ne__ (__call__ (len, null, arg_spec), 3))) {
				var __except0__ = __call__ (ValueError, null, 'arg_spec for an optional delimited argument should be of the form ‘d<char1><char2>’');
				__except0__.__cause__ = null;
				throw __except0__;
			}
			var open_char = __getitem__ (arg_spec, 1);
			var close_char = __getitem__ (arg_spec, 2);
			return __call__ (LatexDelimitedGroupParser, null, __kwargtrans__ ({delimiters: tuple ([open_char, close_char]), optional: true, allow_pre_space: self.allow_pre_space}));
		}
		else if (__t__ ((function () {
			var __accu0__ = arg_spec;
			return __call__ (__accu0__.startswith, __accu0__, 'v');
		}) ())) {
			if (__t__ (__eq__ (__call__ (len, null, arg_spec), 1))) {
				var delimiter_chars = null;
			}
			else if (__t__ (__eq__ (__call__ (len, null, arg_spec), 3))) {
				var delimiter_chars = tuple ([__getitem__ (arg_spec, 1), __getitem__ (arg_spec, 2)]);
			}
			else {
				var __except0__ = __call__ (ValueError, null, 'arg_spec for a verbatim argument should be either ‘v’ or ‘v<char1><char2>’');
				__except0__.__cause__ = null;
				throw __except0__;
			}
			return __call__ (LatexDelimitedVerbatimParser, null, __kwargtrans__ ({delimiters: delimiter_chars}));
		}
		else if (__t__ (__eq__ (arg_spec, 'AnyDelimited'))) {
			return __call__ (LatexDelimitedMultiDelimGroupParser, null, __kwargtrans__ ({optional: false, allow_pre_space: self.allow_pre_space}));
		}
		else if (__t__ (__eq__ (arg_spec, 'AnyDelimitedOptional'))) {
			return __call__ (LatexDelimitedMultiDelimGroupParser, null, __kwargtrans__ ({optional: true, allow_pre_space: self.allow_pre_space}));
		}
		else {
			var __except0__ = __call__ (ValueError, null, (function () {
				var __accu0__ = 'Unknown argument specification: {!r}';
				return __call__ (__accu0__.format, __accu0__, arg_spec);
			}) ());
			__except0__.__cause__ = null;
			throw __except0__;
		}
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
		if (__t__ (self._arg_parser === null)) {
			try {
				self._arg_parser = (function () {
					var __accu0__ = self;
					return __call__ (__accu0__.get_arg_parser_instance, __accu0__, self.arg_spec);
				}) ();
			}
			catch (__except0__) {
				if (isinstance (__except0__, ValueError)) {
					var e = __except0__;
					var __except1__ = __call__ (LatexWalkerParseError, null, __kwargtrans__ ({msg: __call__ (str, null, e), pos: (function () {
						var __accu0__ = token_reader;
						return __call__ (__accu0__.cur_pos, __accu0__);
					}) ()}));
					__except1__.__cause__ = null;
					throw __except1__;
				}
				else {
					throw __except0__;
				}
			}
		}
		var arg_parser = self._arg_parser;
		var __left0__ = (function () {
			var __accu0__ = latex_walker;
			return __call__ (__accu0__.parse_content, __accu0__, arg_parser, __kwargtrans__ (__mergekwargtrans__ ({token_reader: token_reader, parsing_state: parsing_state}, kwargs)));
		}) ();
		var nodes = __left0__ [0];
		var parsing_state_delta = __left0__ [1];
		return tuple ([nodes, parsing_state_delta]);
	});}
});
export var LatexCharsGroupParser =  __class__ ('LatexCharsGroupParser', [LatexDelimitedGroupParser], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, delimiters, enable_comments, enable_groups) {
		if (typeof delimiters == 'undefined' || (delimiters != null && delimiters.hasOwnProperty ("__kwargtrans__"))) {;
			var delimiters = tuple (['{', '}']);
		};
		if (typeof enable_comments == 'undefined' || (enable_comments != null && enable_comments.hasOwnProperty ("__kwargtrans__"))) {;
			var enable_comments = true;
		};
		if (typeof enable_groups == 'undefined' || (enable_groups != null && enable_groups.hasOwnProperty ("__kwargtrans__"))) {;
			var enable_groups = true;
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
						case 'enable_comments': var enable_comments = __allkwargs0__ [__attrib0__]; break;
						case 'enable_groups': var enable_groups = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, LatexCharsGroupParser, '__init__'), null, self, __kwargtrans__ (__mergekwargtrans__ ({delimiters: delimiters, delimited_expression_parser_info_class: LatexCharsGroupParser.CharsContentsParserInfo}, kwargs)));
		self.enable_comments = enable_comments;
		self.enable_groups = enable_groups;
	});},
	CharsContentsParserInfo: __class__ ('CharsContentsParserInfo', [LatexDelimitedGroupParserInfo], {
		__module__: __name__,
		get initialize () {return __get__ (this, function (self) {
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
			self.contents_parsing_state = (function () {
				var __accu0__ = self.group_parsing_state;
				return __call__ (__accu0__.sub_context, __accu0__, __kwargtrans__ ({enable_macros: false, enable_environments: false, enable_comments: self.delimited_expression_parser.enable_comments, enable_groups: self.delimited_expression_parser.enable_groups, enable_specials: false, enable_math: false}));
			}) ();
			self.current_parsing_state = self.contents_parsing_state;
			self.parsed_delimiters = (function () {
				var __accu0__ = self;
				return __call__ (__accu0__.get_parsed_delimiters, __accu0__);
			}) ();
			// pass;
		});},
		get make_child_parsing_state () {return __get__ (this, function (self, parsing_state, node_class, token) {
			if (arguments.length) {
				var __ilastarg0__ = arguments.length - 1;
				if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
					var __allkwargs0__ = arguments [__ilastarg0__--];
					for (var __attrib0__ in __allkwargs0__) {
						switch (__attrib0__) {
							case 'self': var self = __allkwargs0__ [__attrib0__]; break;
							case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
							case 'node_class': var node_class = __allkwargs0__ [__attrib0__]; break;
							case 'token': var token = __allkwargs0__ [__attrib0__]; break;
						}
					}
				}
			}
			else {
			}
			return self.parsing_state;
		});},
		get stop_token_condition () {return __get__ (this, function (self, token) {
			if (arguments.length) {
				var __ilastarg0__ = arguments.length - 1;
				if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
					var __allkwargs0__ = arguments [__ilastarg0__--];
					for (var __attrib0__ in __allkwargs0__) {
						switch (__attrib0__) {
							case 'self': var self = __allkwargs0__ [__attrib0__]; break;
							case 'token': var token = __allkwargs0__ [__attrib0__]; break;
						}
					}
				}
			}
			else {
			}
			// pass;
			if (__t__ (__t__ (__eq__ (token.tok, 'brace_close')) && __eq__ (token.arg, __getitem__ (self.parsed_delimiters, 1)))) {
				return true;
			}
			if (__t__ (__t__ (__eq__ (token.tok, 'char')) && __eq__ (token.arg, __getitem__ (self.parsed_delimiters, 1)))) {
				return true;
			}
			return null;
		});}
	})
});
export var LatexCharsCommaSeparatedListParser =  __class__ ('LatexCharsCommaSeparatedListParser', [LatexDelimitedGroupParser], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, comma_char, delimiters, enable_comments, enable_groups, keep_empty_parts) {
		if (typeof comma_char == 'undefined' || (comma_char != null && comma_char.hasOwnProperty ("__kwargtrans__"))) {;
			var comma_char = ',';
		};
		if (typeof delimiters == 'undefined' || (delimiters != null && delimiters.hasOwnProperty ("__kwargtrans__"))) {;
			var delimiters = tuple (['{', '}']);
		};
		if (typeof enable_comments == 'undefined' || (enable_comments != null && enable_comments.hasOwnProperty ("__kwargtrans__"))) {;
			var enable_comments = true;
		};
		if (typeof enable_groups == 'undefined' || (enable_groups != null && enable_groups.hasOwnProperty ("__kwargtrans__"))) {;
			var enable_groups = true;
		};
		if (typeof keep_empty_parts == 'undefined' || (keep_empty_parts != null && keep_empty_parts.hasOwnProperty ("__kwargtrans__"))) {;
			var keep_empty_parts = false;
		};
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'comma_char': var comma_char = __allkwargs0__ [__attrib0__]; break;
						case 'delimiters': var delimiters = __allkwargs0__ [__attrib0__]; break;
						case 'enable_comments': var enable_comments = __allkwargs0__ [__attrib0__]; break;
						case 'enable_groups': var enable_groups = __allkwargs0__ [__attrib0__]; break;
						case 'keep_empty_parts': var keep_empty_parts = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, LatexCharsCommaSeparatedListParser, '__init__'), null, self, __kwargtrans__ (__mergekwargtrans__ ({delimiters: delimiters, delimited_expression_parser_info_class: LatexCharsCommaSeparatedListParser.CommaSepParserInfo}, kwargs)));
		self.comma_char = comma_char;
		self.enable_comments = enable_comments;
		self.enable_groups = enable_groups;
		self.keep_empty_parts = keep_empty_parts;
	});},
	CommaSepParserInfo: __class__ ('CommaSepParserInfo', [LatexDelimitedGroupParserInfo], {
		__module__: __name__,
		get initialize () {return __get__ (this, function (self) {
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
			self.comma_char = self.delimited_expression_parser.comma_char;
			self.keep_empty_parts = self.delimited_expression_parser.keep_empty_parts;
			self.contents_parsing_state = (function () {
				var __accu0__ = self.group_parsing_state;
				return __call__ (__accu0__.sub_context, __accu0__, __kwargtrans__ ({enable_macros: false, enable_environments: false, enable_comments: self.delimited_expression_parser.enable_comments, enable_groups: self.delimited_expression_parser.enable_groups, enable_specials: false, enable_math: false}));
			}) ();
			self.parsed_delimiters = (function () {
				var __accu0__ = self;
				return __call__ (__accu0__.get_parsed_delimiters, __accu0__);
			}) ();
			// pass;
		});},
		get make_child_parsing_state () {return __get__ (this, function (self, parsing_state, node_class, token) {
			if (arguments.length) {
				var __ilastarg0__ = arguments.length - 1;
				if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
					var __allkwargs0__ = arguments [__ilastarg0__--];
					for (var __attrib0__ in __allkwargs0__) {
						switch (__attrib0__) {
							case 'self': var self = __allkwargs0__ [__attrib0__]; break;
							case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
							case 'node_class': var node_class = __allkwargs0__ [__attrib0__]; break;
							case 'token': var token = __allkwargs0__ [__attrib0__]; break;
						}
					}
				}
			}
			else {
			}
			return self.parsing_state;
		});},
		get make_content_parser () {return __get__ (this, function (self, latex_walker, token_reader) {
			if (arguments.length) {
				var __ilastarg0__ = arguments.length - 1;
				if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
					var __allkwargs0__ = arguments [__ilastarg0__--];
					for (var __attrib0__ in __allkwargs0__) {
						switch (__attrib0__) {
							case 'self': var self = __allkwargs0__ [__attrib0__]; break;
							case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
							case 'token_reader': var token_reader = __allkwargs0__ [__attrib0__]; break;
						}
					}
				}
			}
			else {
			}
			return __call__ (_CommaSepContentCustomParser, null, self);
		});}
	})
});
export var _CommaSepContentCustomParser =  __class__ ('_CommaSepContentCustomParser', [LatexParserBase], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, contents_parser_info) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'contents_parser_info': var contents_parser_info = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, _CommaSepContentCustomParser, '__init__'), null, self, __kwargtrans__ (kwargs));
		self.contents_parser_info = contents_parser_info;
		self.main_content_parser = __call__ (LatexGeneralNodesParser, null, __kwargtrans__ ({stop_token_condition: self.stop_token_condition, make_child_parsing_state: contents_parser_info.make_child_parsing_state, require_stop_condition_met: true, handle_stop_condition_token: self.handle_stop_condition_token, stop_condition_message: (function () {
			var __accu0__ = 'Expected matching ‘{}’ of ‘{}’-separated group initiated by ‘{}’';
			return __call__ (__accu0__.format, __accu0__, __getitem__ (contents_parser_info.parsed_delimiters, 1), self.contents_parser_info.comma_char, __getitem__ (contents_parser_info.parsed_delimiters, 0));
		}) ()}));
		self.current_parsing_state = self.contents_parser_info.contents_parsing_state;
		self.comma_sep_arg_list = [];
		self.parsing_state_delta = null;
		self.parse_more = true;
		self.pos_start = null;
		self.is_very_first_element = true;
		self.last_element_pos_start = null;
		self.last_delimiter_token = null;
		self.last_element_pos_end = null;
	});},
	get stop_token_condition () {return __get__ (this, function (self, token) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'token': var token = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		// pass;
		if (__t__ (__t__ (__eq__ (token.tok, 'brace_close')) && __eq__ (token.arg, __getitem__ (self.contents_parser_info.parsed_delimiters, 1)))) {
			return true;
		}
		if (__t__ (__eq__ (token.tok, 'char'))) {
			if (__t__ (__eq__ (token.arg, __getitem__ (self.contents_parser_info.parsed_delimiters, 1)))) {
				return true;
			}
			else if (__t__ (__eq__ (token.arg, self.contents_parser_info.comma_char))) {
				return true;
			}
			return false;
		}
		return false;
	});},
	get handle_stop_condition_token () {return __get__ (this, function (self, token, latex_walker, token_reader, parsing_state) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'token': var token = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
						case 'token_reader': var token_reader = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		(function () {
			var __accu0__ = token_reader;
			return __call__ (__accu0__.move_past_token, __accu0__, token);
		}) ();
		if (__t__ (__eq__ (token.tok, 'brace_close'))) {
			self.last_delimiter_token = null;
			self.last_element_pos_end = token.pos;
			self.parse_more = false;
		}
		else {
			self.last_delimiter_token = token;
			self.last_element_pos_end = token.pos_end;
			self.parse_more = true;
		}
	});},
	get parse () {return __get__ (this, function (self, latex_walker, token_reader, parsing_state) {
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
					}
				}
			}
		}
		else {
		}
		// pass;
		self.pos_start = (function () {
			var __accu0__ = token_reader;
			return __call__ (__accu0__.cur_pos, __accu0__);
		}) ();
		self.parse_more = true;
		while (__t__ (self.parse_more)) {
			(function () {
				var __accu0__ = self;
				return __call__ (__accu0__._parse_one_commasep_arg, __accu0__, latex_walker, token_reader);
			}) ();
			if (__t__ (__t__ (self.parse_more) && self.parsing_state_delta !== null)) {
				self.current_parsing_state = (function () {
					var __accu0__ = self.parsing_state_delta;
					return __call__ (__accu0__.get_updated_parsing_state, __accu0__, self.current_parsing_state, latex_walker);
				}) ();
			}
		}
		var final_node_list = (function () {
			var __accu0__ = latex_walker;
			return __call__ (__accu0__.make_nodelist, __accu0__, self.comma_sep_arg_list, __kwargtrans__ ({pos: self.pos_start, pos_end: self.last_element_pos_end, parsing_state: parsing_state}));
		}) ();
		return tuple ([final_node_list, self.parsing_state_delta]);
	});},
	get _parse_one_commasep_arg () {return __get__ (this, function (self, latex_walker, token_reader) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
						case 'token_reader': var token_reader = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		// pass;
		self.last_element_pos_start = (function () {
			var __accu0__ = token_reader;
			return __call__ (__accu0__.cur_pos, __accu0__);
		}) ();
		self.last_element_pos_end = null;
		self.last_delimiter_token = null;
		var __left0__ = (function () {
			var __accu0__ = latex_walker;
			return __call__ (__accu0__.parse_content, __accu0__, self.main_content_parser, __kwargtrans__ ({token_reader: token_reader, parsing_state: self.current_parsing_state, open_context: tuple ([(function () {
				var __accu1__ = 'Element {} of list separated by ‘{}’';
				return __call__ (__accu1__.format, __accu1__, __call__ (len, null, self.comma_sep_arg_list), self.contents_parser_info.comma_char);
			}) (), self.contents_parser_info.first_token])}));
		}) ();
		var nodelist = __left0__ [0];
		var parsing_state_delta = __left0__ [1];
		// pass;
		var pos_end = self.last_element_pos_end;
		if (__t__ (pos_end === null)) {
			// pass;
			var pos_end = (function () {
				var __accu0__ = token_reader;
				return __call__ (__accu0__.cur_pos, __accu0__);
			}) ();
			self.parse_more = false;
		}
		if (__t__ (self.last_delimiter_token === null)) {
			var this_close_delim = '';
		}
		else {
			var this_close_delim = self.last_delimiter_token.arg;
		}
		var this_group_node = (function () {
			var __accu0__ = latex_walker;
			return __call__ (__accu0__.make_node, __accu0__, LatexGroupNode, __kwargtrans__ ({nodelist: nodelist, parsing_state: self.current_parsing_state, delimiters: tuple (['', this_close_delim]), pos: self.last_element_pos_start, pos_end: pos_end}));
		}) ();
		var add_group_node = true;
		if (__t__ (!__t__ ((__call__ (len, null, nodelist))))) {
			if (__t__ (__t__ (self.is_very_first_element) && self.last_delimiter_token === null)) {
				var add_group_node = false;
			}
			else if (__t__ (self.contents_parser_info.keep_empty_parts)) {
				var add_group_node = true;
			}
			else {
				var add_group_node = false;
			}
		}
		if (__t__ (add_group_node)) {
			(function () {
				var __accu0__ = self.comma_sep_arg_list;
				return __call__ (__accu0__.append, __accu0__, this_group_node);
			}) ();
		}
		self.parsing_state_delta = parsing_state_delta;
		self.is_very_first_element = false;
		// pass;
	});}
});
export var LatexTackOnInformationFieldMacrosParser =  __class__ ('LatexTackOnInformationFieldMacrosParser', [LatexParserBase], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, macronames, allow_multiple, macro_arg_parsers, default_macro_arg_parser) {
		if (typeof allow_multiple == 'undefined' || (allow_multiple != null && allow_multiple.hasOwnProperty ("__kwargtrans__"))) {;
			var allow_multiple = false;
		};
		if (typeof macro_arg_parsers == 'undefined' || (macro_arg_parsers != null && macro_arg_parsers.hasOwnProperty ("__kwargtrans__"))) {;
			var macro_arg_parsers = null;
		};
		if (typeof default_macro_arg_parser == 'undefined' || (default_macro_arg_parser != null && default_macro_arg_parser.hasOwnProperty ("__kwargtrans__"))) {;
			var default_macro_arg_parser = true;
		};
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'macronames': var macronames = __allkwargs0__ [__attrib0__]; break;
						case 'allow_multiple': var allow_multiple = __allkwargs0__ [__attrib0__]; break;
						case 'macro_arg_parsers': var macro_arg_parsers = __allkwargs0__ [__attrib0__]; break;
						case 'default_macro_arg_parser': var default_macro_arg_parser = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, LatexTackOnInformationFieldMacrosParser, '__init__'), null, self, __kwargtrans__ (kwargs));
		self.macronames = __call__ (set, null, macronames);
		if (__t__ (allow_multiple === false)) {
			self.allow_multiple = __call__ (set, null);
		}
		else if (__t__ (allow_multiple === true)) {
			self.allow_multiple = self.macronames;
		}
		else {
			self.allow_multiple = __call__ (set, null, allow_multiple);
		}
		if (__t__ (default_macro_arg_parser === true)) {
			self.default_macro_arg_parser = __call__ (LatexExpressionParser, null);
		}
		else {
			self.default_macro_arg_parser = default_macro_arg_parser;
		}
		self.macro_arg_parsers = macro_arg_parsers;
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
	get get_macro_arg_parser () {return __get__ (this, function (self, macroname) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'macroname': var macroname = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (self.macro_arg_parsers === null)) {
			return self.default_macro_arg_parser;
		}
		if (__t__ (!__in__ (macroname, self.macro_arg_parsers))) {
			return self.default_macro_arg_parser;
		}
		var parser = __getitem__ (self.macro_arg_parsers, macroname);
		if (__t__ (parser === true)) {
			return self.default_macro_arg_parser;
		}
		return parser;
	});},
	get parse () {return __get__ (this, function (self, latex_walker, token_reader, parsing_state) {
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
					}
				}
			}
		}
		else {
		}
		var arg_nodes = [];
		var seen_macronames = __call__ (set, null);
		while (__t__ (true)) {
			var tok = (function () {
				var __accu0__ = token_reader;
				return __call__ (__accu0__.peek_token_or_none, __accu0__, parsing_state);
			}) ();
			if (__t__ (__t__ (tok === null) || __t__ (__ne__ (tok.tok, 'macro')) || !__in__ (tok.arg, self.macronames))) {
				// pass;
				break;
			}
			var macroname = tok.arg;
			var tolerant_parsing_skip_add_this_node = false;
			(function () {
				var __accu0__ = token_reader;
				return __call__ (__accu0__.move_past_token, __accu0__, tok);
			}) ();
			if (__t__ (__t__ (__in__ (macroname, seen_macronames)) && !__t__ ((__in__ (macroname, self.allow_multiple))))) {
				var message = (function () {
					var __accu0__ = 'You cannot specify information field macro \\{} multiple times';
					return __call__ (__accu0__.format, __accu0__, macroname);
				}) ();
				var exc = __call__ (LatexWalkerParseError, null, __kwargtrans__ ({msg: message, pos: tok.pos, error_type_info: dict ({'what': 'nodes_stdarg_illegal_multiple_information_field_macro', 'macroname': macroname})}));
				var exc = (function () {
					var __accu0__ = latex_walker;
					return __call__ (__accu0__.check_tolerant_parsing_ignore_error, __accu0__, exc);
				}) ();
				if (__t__ (exc !== null)) {
					var __except0__ = exc;
					__except0__.__cause__ = null;
					throw __except0__;
				}
				(function () {
					var __accu0__ = logger;
					return __call__ (__accu0__.warning, __accu0__, '%s; ignoring the additional information field macros', message);
				}) ();
				var tolerant_parsing_skip_add_this_node = true;
			}
			(function () {
				var __accu0__ = seen_macronames;
				return __call__ (__accu0__.add, __accu0__, macroname);
			}) ();
			var macro_arg_parser = (function () {
				var __accu0__ = self;
				return __call__ (__accu0__.get_macro_arg_parser, __accu0__, macroname);
			}) ();
			if (__t__ (macro_arg_parser === null)) {
				var arg_content_node = null;
				var arg_parsing_state_delta = null;
			}
			else {
				var __left0__ = (function () {
					var __accu0__ = latex_walker;
					return __call__ (__accu0__.parse_content, __accu0__, macro_arg_parser, __kwargtrans__ ({token_reader: token_reader, parsing_state: parsing_state, open_context: tuple ([(function () {
						var __accu1__ = 'Argument of information field macro \\{}';
						return __call__ (__accu1__.format, __accu1__, macroname);
					}) (), tok])}));
				}) ();
				var arg_content_node = __left0__ [0];
				var arg_parsing_state_delta = __left0__ [1];
				if (__t__ (arg_parsing_state_delta !== null)) {
					(function () {
						var __accu0__ = logger;
						return __call__ (__accu0__.warning, __accu0__, (function () {
							var __accu1__ = 'Parsing state delta is ignored when parsing tack-on information field macro \\{}: {}';
							return __call__ (__accu1__.format, __accu1__, macroname, arg_parsing_state_delta);
						}) ());
					}) ();
				}
			}
			if (__t__ (tolerant_parsing_skip_add_this_node)) {
				continue;
			}
			if (__t__ (__call__ (isinstance, null, arg_content_node, LatexNodeList))) {
				var arg_content_nodelist = arg_content_node;
			}
			else {
				var arg_content_nodelist = (function () {
					var __accu0__ = latex_walker;
					return __call__ (__accu0__.make_nodelist, __accu0__, [arg_content_node], __kwargtrans__ ({parsing_state: parsing_state}));
				}) ();
			}
			var arg_node = (function () {
				var __accu0__ = latex_walker;
				return __call__ (__accu0__.make_node, __accu0__, LatexGroupNode, __kwargtrans__ ({parsing_state: parsing_state, delimiters: tuple ([__add__ ('\\', macroname), '']), nodelist: arg_content_nodelist, pos: tok.pos, pos_end: (__t__ (arg_content_node !== null) ? arg_content_node.pos_end : tok.pos_end)}));
			}) ();
			(function () {
				var __accu0__ = arg_nodes;
				return __call__ (__accu0__.append, __accu0__, arg_node);
			}) ();
		}
		var arg_nodelist = (function () {
			var __accu0__ = latex_walker;
			return __call__ (__accu0__.make_nodelist, __accu0__, arg_nodes, __kwargtrans__ ({parsing_state: parsing_state}));
		}) ();
		return tuple ([arg_nodelist, null]);
	});}
});

