var logging = {};
import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import {LatexGeneralNodesParser} from './pylatexenc.latexnodes.parsers._generalnodes.js';
import {LatexParserBase} from './pylatexenc.latexnodes.parsers._base.js';
import {ParsingStateDeltaReplaceParsingState, get_updated_parsing_state_from_delta} from './pylatexenc.latexnodes._parsingstatedelta.js';
import * as nodes from './pylatexenc.latexnodes.nodes.js';
import {LatexWalkerEndOfStream, LatexWalkerError, LatexWalkerLocatedError, LatexWalkerLocatedErrorFormatter, LatexWalkerNodesParseError, LatexWalkerParseError, LatexWalkerTokenParseError, __all__, format_pos} from './pylatexenc.latexnodes._exctypes.js';
import * as __module_logging__ from './logging.js';
__nest__ (logging, '', __module_logging__);
export {get_updated_parsing_state_from_delta, LatexGeneralNodesParser, nodes, LatexWalkerLocatedErrorFormatter, ParsingStateDeltaReplaceParsingState, LatexWalkerError, LatexWalkerLocatedError, __all__, LatexWalkerParseError, LatexWalkerTokenParseError, LatexWalkerEndOfStream, LatexParserBase, LatexWalkerNodesParseError, format_pos};
var __name__ = 'pylatexenc.latexnodes.parsers._delimited';
export var logger = (function () {
	var __accu0__ = logging;
	return __call__ (__accu0__.getLogger, __accu0__, __name__);
}) ();
export var LatexDelimitedExpressionParserOpeningDelimiterNotFound =  __class__ ('LatexDelimitedExpressionParserOpeningDelimiterNotFound', [Exception], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, first_tokens, msg) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'first_tokens': var first_tokens = __allkwargs0__ [__attrib0__]; break;
						case 'msg': var msg = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, LatexDelimitedExpressionParserOpeningDelimiterNotFound, '__init__'), null, self, __kwargtrans__ (kwargs));
		self.first_tokens = first_tokens;
		self.msg = msg;
	});}
});
export var LatexDelimitedExpressionParserInfo =  __class__ ('LatexDelimitedExpressionParserInfo', [object], {
	__module__: __name__,
	get get_group_parsing_state () {return __getcm__ (this, function (cls, parsing_state, delimiters, delimited_expression_parser, latex_walker) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'cls': var cls = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
						case 'delimiters': var delimiters = __allkwargs0__ [__attrib0__]; break;
						case 'delimited_expression_parser': var delimited_expression_parser = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return parsing_state;
	});},
	get get_acceptable_open_delimiter_list () {return __getcm__ (this, function (cls, delimiters, group_parsing_state, delimited_expression_parser, latex_walker) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'cls': var cls = __allkwargs0__ [__attrib0__]; break;
						case 'delimiters': var delimiters = __allkwargs0__ [__attrib0__]; break;
						case 'group_parsing_state': var group_parsing_state = __allkwargs0__ [__attrib0__]; break;
						case 'delimited_expression_parser': var delimited_expression_parser = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return [];
	});},
	get parse_initial () {return __getcm__ (this, function (cls, delimiters, allow_pre_space, latex_walker, token_reader, group_parsing_state, delimited_expression_parser) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'cls': var cls = __allkwargs0__ [__attrib0__]; break;
						case 'delimiters': var delimiters = __allkwargs0__ [__attrib0__]; break;
						case 'allow_pre_space': var allow_pre_space = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
						case 'token_reader': var token_reader = __allkwargs0__ [__attrib0__]; break;
						case 'group_parsing_state': var group_parsing_state = __allkwargs0__ [__attrib0__]; break;
						case 'delimited_expression_parser': var delimited_expression_parser = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var first_token = (function () {
			var __accu0__ = token_reader;
			return __call__ (__accu0__.next_token, __accu0__, __kwargtrans__ ({parsing_state: group_parsing_state}));
		}) ();
		var ok = true;
		if (__t__ (__t__ (!__t__ ((allow_pre_space))) && first_token.pre_space)) {
			var ok = false;
		}
		else if (__t__ (!__t__ (((function () {
			var __accu0__ = cls;
			return __call__ (__accu0__.is_opening_delimiter, __accu0__, __kwargtrans__ ({delimiters: delimiters, first_token: first_token, group_parsing_state: group_parsing_state, delimited_expression_parser: delimited_expression_parser, latex_walker: latex_walker}));
		}) ())))) {
			var ok = false;
		}
		if (__t__ (!__t__ ((ok)))) {
			var acceptable_opening_delimiters = (function () {
				var __accu0__ = cls;
				return __call__ (__accu0__.get_acceptable_open_delimiter_list, __accu0__, __kwargtrans__ ({delimiters: delimiters, group_parsing_state: group_parsing_state, delimited_expression_parser: delimited_expression_parser, latex_walker: latex_walker}));
			}) ();
			if (__t__ (!__t__ ((acceptable_opening_delimiters)))) {
				var acceptable_delimiters_msg = '??';
			}
			else {
				var acceptable_delimiters_msg = (function () {
					var __accu0__ = ', ';
					return __call__ (__accu0__.join, __accu0__, (function () {
						var __accu1__ = [];
						var __iterable0__ = acceptable_opening_delimiters;
						for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
							var od = __getitem__ (__iterable0__, __index0__);
							(function () {
								var __accu2__ = __accu1__;
								return __call__ (__accu2__.append, __accu2__, (function () {
									var __accu3__ = '‘{}’';
									return __call__ (__accu3__.format, __accu3__, od);
								}) ());
							}) ();
						}
						return __accu1__;
					}) ());
				}) ();
			}
			var __except0__ = __call__ (LatexDelimitedExpressionParserOpeningDelimiterNotFound, null, __kwargtrans__ ({msg: (function () {
				var __accu0__ = 'Expected an opening LaTeX delimiter ({}), got {}/‘{}’{}';
				return __call__ (__accu0__.format, __accu0__, acceptable_delimiters_msg, first_token.tok, first_token.arg, (__t__ (first_token.pre_space) ? ' with leading whitespace' : ''));
			}) (), first_tokens: [first_token]}));
			__except0__.__cause__ = null;
			throw __except0__;
		}
		return [first_token];
	});},
	get is_opening_delimiter () {return __getcm__ (this, function (cls, delimiters, first_token, group_parsing_state, delimited_expression_parser, latex_walker) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'cls': var cls = __allkwargs0__ [__attrib0__]; break;
						case 'delimiters': var delimiters = __allkwargs0__ [__attrib0__]; break;
						case 'first_token': var first_token = __allkwargs0__ [__attrib0__]; break;
						case 'group_parsing_state': var group_parsing_state = __allkwargs0__ [__attrib0__]; break;
						case 'delimited_expression_parser': var delimited_expression_parser = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __except0__ = __call__ (RuntimeError, null, 'Subclasses must reimplement is_opening_delimiter()');
		__except0__.__cause__ = null;
		throw __except0__;
	});},
	get check_opening_delimiter () {return __getcm__ (this, function (cls, delimiters, parsed_opening_delimiter, latex_walker) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'cls': var cls = __allkwargs0__ [__attrib0__]; break;
						case 'delimiters': var delimiters = __allkwargs0__ [__attrib0__]; break;
						case 'parsed_opening_delimiter': var parsed_opening_delimiter = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (delimiters === null)) {
			return true;
		}
		if (__t__ (__call__ (isinstance, null, delimiters, str))) {
			var open_delim = delimiters;
		}
		else {
			var open_delim = __getitem__ (delimiters, 0);
		}
		if (__t__ (__ne__ (parsed_opening_delimiter, open_delim))) {
			return false;
		}
		return true;
	});},
	get __init__ () {return __get__ (this, function (self, delimited_expression_parser, opening_delimiter_tokens, group_parsing_state, parsing_state, delimiters, latex_walker) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'delimited_expression_parser': var delimited_expression_parser = __allkwargs0__ [__attrib0__]; break;
						case 'opening_delimiter_tokens': var opening_delimiter_tokens = __allkwargs0__ [__attrib0__]; break;
						case 'group_parsing_state': var group_parsing_state = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
						case 'delimiters': var delimiters = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, LatexDelimitedExpressionParserInfo, '__init__'), null, self);
		self.delimited_expression_parser = delimited_expression_parser;
		self.opening_delimiter_tokens = opening_delimiter_tokens;
		if (__t__ (opening_delimiter_tokens)) {
			self.first_token = __getitem__ (opening_delimiter_tokens, 0);
		}
		else {
			self.first_token = null;
		}
		self.group_parsing_state = group_parsing_state;
		self.parsing_state = parsing_state;
		self.delimiters = delimiters;
		self.latex_walker = latex_walker;
		self.contents_parsing_state = self.group_parsing_state;
		self.child_parsing_state_delta = null;
		self.parsed_delimiters = tuple ([null, null]);
	});},
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
		self.contents_parsing_state = self.group_parsing_state;
		self.child_parsing_state_delta = null;
		self.parsed_delimiters = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.get_parsed_delimiters, __accu0__);
		}) ();
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
		var __except0__ = __call__ (RuntimeError, null, 'Subclasses must reimplement stop_token_condition()');
		__except0__.__cause__ = null;
		throw __except0__;
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
		if (__t__ (self.child_parsing_state_delta !== null)) {
			// pass;
			return __call__ (get_updated_parsing_state_from_delta, null, self.group_parsing_state, self.child_parsing_state_delta, self.latex_walker);
		}
		// pass;
		return parsing_state;
	});},
	get get_matching_delimiter () {return __get__ (this, function (self, opening_delimiter) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'opening_delimiter': var opening_delimiter = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return opening_delimiter;
	});},
	get get_parsed_delimiters () {return __get__ (this, function (self) {
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
		var first_token = self.first_token;
		var delimiters = self.delimiters;
		if (__t__ (delimiters === null)) {
			var delimiters = first_token.arg;
		}
		if (__t__ (__call__ (isinstance, null, delimiters, str))) {
			var opening_delimiter = delimiters;
			var closing_delimiter = (function () {
				var __accu0__ = self;
				return __call__ (__accu0__.get_matching_delimiter, __accu0__, opening_delimiter);
			}) ();
			return tuple ([opening_delimiter, closing_delimiter]);
		}
		return delimiters;
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
		if (__t__ (__getitem__ (self.parsed_delimiters, 1))) {
			var expected_matching = (function () {
				var __accu0__ = 'matching ‘{}’';
				return __call__ (__accu0__.format, __accu0__, __getitem__ (self.parsed_delimiters, 1));
			}) ();
		}
		else {
			var expected_matching = 'matching closing delimiter';
		}
		return __call__ (LatexGeneralNodesParser, null, __kwargtrans__ ({make_child_parsing_state: self.make_child_parsing_state, stop_token_condition: self.stop_token_condition, require_stop_condition_met: true, handle_stop_condition_token: self.handle_stop_condition_token, stop_condition_message: (function () {
			var __accu0__ = 'Expected {} after ‘{}’';
			return __call__ (__accu0__.format, __accu0__, expected_matching, __getitem__ (self.parsed_delimiters, 0));
		}) ()}));
	});},
	get get_open_context_description () {return __get__ (this, function (self) {
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
		return tuple ([(function () {
			var __accu0__ = 'Delimited expression ‘{}…{}’';
			return __call__ (__accu0__.format, __accu0__, ...self.parsed_delimiters);
		}) (), self.first_token]);
	});},
	get make_group_node_and_parsing_state_delta () {return __get__ (this, function (self, latex_walker, token_reader, nodelist, parsing_state_delta) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
						case 'token_reader': var token_reader = __allkwargs0__ [__attrib0__]; break;
						case 'nodelist': var nodelist = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state_delta': var parsing_state_delta = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var pos_end = (function () {
			var __accu0__ = token_reader;
			return __call__ (__accu0__.cur_pos, __accu0__);
		}) ();
		var group_node = (function () {
			var __accu0__ = latex_walker;
			return __call__ (__accu0__.make_node, __accu0__, nodes.LatexGroupNode, __kwargtrans__ ({nodelist: nodelist, parsing_state: self.group_parsing_state, delimiters: self.parsed_delimiters, pos: self.first_token.pos, pos_end: pos_end}));
		}) ();
		return tuple ([group_node, parsing_state_delta]);
	});}
});
export var LatexDelimitedExpressionParser =  __class__ ('LatexDelimitedExpressionParser', [LatexParserBase], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, delimiters, delimited_expression_parser_info_class, optional, allow_pre_space, discard_parsing_state_delta) {
		if (typeof optional == 'undefined' || (optional != null && optional.hasOwnProperty ("__kwargtrans__"))) {;
			var optional = false;
		};
		if (typeof allow_pre_space == 'undefined' || (allow_pre_space != null && allow_pre_space.hasOwnProperty ("__kwargtrans__"))) {;
			var allow_pre_space = false;
		};
		if (typeof discard_parsing_state_delta == 'undefined' || (discard_parsing_state_delta != null && discard_parsing_state_delta.hasOwnProperty ("__kwargtrans__"))) {;
			var discard_parsing_state_delta = true;
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
						case 'delimited_expression_parser_info_class': var delimited_expression_parser_info_class = __allkwargs0__ [__attrib0__]; break;
						case 'optional': var optional = __allkwargs0__ [__attrib0__]; break;
						case 'allow_pre_space': var allow_pre_space = __allkwargs0__ [__attrib0__]; break;
						case 'discard_parsing_state_delta': var discard_parsing_state_delta = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, LatexDelimitedExpressionParser, '__init__'), null, self, __kwargtrans__ (kwargs));
		self.delimiters = delimiters;
		self.optional = optional;
		self.allow_pre_space = allow_pre_space;
		self.discard_parsing_state_delta = discard_parsing_state_delta;
		self.delimited_expression_parser_info_class = delimited_expression_parser_info_class;
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
		return self.optional;
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
		var group_parsing_state = (function () {
			var __accu0__ = self.delimited_expression_parser_info_class;
			return __call__ (__accu0__.get_group_parsing_state, __accu0__, __kwargtrans__ ({parsing_state: parsing_state, delimiters: self.delimiters, delimited_expression_parser: self, latex_walker: latex_walker}));
		}) ();
		var opening_delimiter_tokens = null;
		var opening_delimiter_not_found = null;
		try {
			var opening_delimiter_tokens = (function () {
				var __accu0__ = self.delimited_expression_parser_info_class;
				return __call__ (__accu0__.parse_initial, __accu0__, __kwargtrans__ ({delimiters: self.delimiters, allow_pre_space: self.allow_pre_space, latex_walker: latex_walker, token_reader: token_reader, group_parsing_state: group_parsing_state, delimited_expression_parser: self}));
			}) ();
		}
		catch (__except0__) {
			if (isinstance (__except0__, LatexDelimitedExpressionParserOpeningDelimiterNotFound)) {
				var e = __except0__;
				var opening_delimiter_not_found = e;
			}
			else if (isinstance (__except0__, LatexWalkerEndOfStream)) {
				var opening_delimiter_not_found = __call__ (LatexDelimitedExpressionParserOpeningDelimiterNotFound, null, __kwargtrans__ ({msg: 'Expected an opening LaTeX delimiter, got end of input', first_tokens: null}));
			}
			else {
				throw __except0__;
			}
		}
		if (__t__ (opening_delimiter_not_found !== null)) {
			var first_tokens = opening_delimiter_not_found.first_tokens;
			var recovery_token = null;
			if (__t__ (__t__ (first_tokens !== null) && __call__ (len, null, first_tokens))) {
				var recovery_token = __getitem__ (first_tokens, 0);
			}
			if (__t__ (self.optional)) {
				if (__t__ (recovery_token !== null)) {
					(function () {
						var __accu0__ = token_reader;
						return __call__ (__accu0__.move_to_token, __accu0__, recovery_token);
					}) ();
				}
				return tuple ([null, null]);
			}
			if (__t__ (recovery_token !== null)) {
				var pos = recovery_token.pos;
			}
			else {
				var pos = (function () {
					var __accu0__ = token_reader;
					return __call__ (__accu0__.cur_pos, __accu0__);
				}) ();
			}
			var __except0__ = __call__ (LatexWalkerNodesParseError, null, __kwargtrans__ ({msg: opening_delimiter_not_found.msg, pos: pos, recovery_nodes: (function () {
				var __accu0__ = latex_walker;
				return __call__ (__accu0__.make_nodelist, __accu0__, [], __kwargtrans__ ({parsing_state: group_parsing_state, pos: pos, pos_end: pos}));
			}) (), recovery_at_token: recovery_token, error_type_info: dict ({'what': 'nodes_delimited_expected_opening_delimiter_not_found', 'first_tokens': first_tokens})}));
			__except0__.__cause__ = null;
			throw __except0__;
		}
		var contents_parser_info = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.delimited_expression_parser_info_class, __accu0__, self, __kwargtrans__ ({opening_delimiter_tokens: opening_delimiter_tokens, group_parsing_state: group_parsing_state, parsing_state: parsing_state, delimiters: self.delimiters, latex_walker: latex_walker}));
		}) ();
		(function () {
			var __accu0__ = contents_parser_info;
			return __call__ (__accu0__.initialize, __accu0__);
		}) ();
		var contents_parser = (function () {
			var __accu0__ = contents_parser_info;
			return __call__ (__accu0__.make_content_parser, __accu0__, latex_walker, token_reader);
		}) ();
		var __left0__ = (function () {
			var __accu0__ = latex_walker;
			return __call__ (__accu0__.parse_content, __accu0__, contents_parser, __kwargtrans__ ({token_reader: token_reader, parsing_state: contents_parser_info.contents_parsing_state, open_context: (function () {
				var __accu1__ = contents_parser_info;
				return __call__ (__accu1__.get_open_context_description, __accu1__);
			}) ()}));
		}) ();
		var nodelist = __left0__ [0];
		var parsing_state_delta = __left0__ [1];
		if (__t__ (__t__ (self.discard_parsing_state_delta) && parsing_state_delta !== null)) {
			// pass;
			var parsing_state_delta = null;
		}
		var __left0__ = (function () {
			var __accu0__ = contents_parser_info;
			return __call__ (__accu0__.make_group_node_and_parsing_state_delta, __accu0__, __kwargtrans__ ({latex_walker: latex_walker, token_reader: token_reader, nodelist: nodelist, parsing_state_delta: parsing_state_delta}));
		}) ();
		var groupnode = __left0__ [0];
		var parsing_state_delta = __left0__ [1];
		return tuple ([groupnode, parsing_state_delta]);
	});}
});
export var LatexDelimitedGroupParserInfo =  __class__ ('LatexDelimitedGroupParserInfo', [LatexDelimitedExpressionParserInfo], {
	__module__: __name__,
	get get_group_parsing_state () {return __getcm__ (this, function (cls, parsing_state, delimiters, delimited_expression_parser, latex_walker) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'cls': var cls = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
						case 'delimiters': var delimiters = __allkwargs0__ [__attrib0__]; break;
						case 'delimited_expression_parser': var delimited_expression_parser = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		if (__t__ (delimiters === null)) {
			return parsing_state;
		}
		if (__t__ (__call__ (isinstance, null, delimiters, str))) {
			if (__t__ (!__in__ (delimiters, parsing_state._latex_group_delimchars_by_open))) {
				var __except0__ = __call__ (ValueError, null, (function () {
					var __accu0__ = 'Delimiter ‘{}’ not a valid latex group delimiter ({!r})';
					return __call__ (__accu0__.format, __accu0__, delimiters, parsing_state.latex_group_delimiters);
				}) ());
				__except0__.__cause__ = null;
				throw __except0__;
			}
			return parsing_state;
		}
		var delimiters_t = __call__ (tuple, null, delimiters);
		var __iterable0__ = parsing_state.latex_group_delimiters;
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var odcd = __getitem__ (__iterable0__, __index0__);
			if (__t__ (__eq__ (delimiters_t, odcd))) {
				return parsing_state;
			}
		}
		return (function () {
			var __accu0__ = parsing_state;
			return __call__ (__accu0__.sub_context, __accu0__, __kwargtrans__ ({latex_group_delimiters: __add__ (parsing_state.latex_group_delimiters, [delimiters_t])}));
		}) ();
	});},
	get get_acceptable_open_delimiter_list () {return __getcm__ (this, function (cls, delimiters, group_parsing_state, delimited_expression_parser, latex_walker) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'cls': var cls = __allkwargs0__ [__attrib0__]; break;
						case 'delimiters': var delimiters = __allkwargs0__ [__attrib0__]; break;
						case 'group_parsing_state': var group_parsing_state = __allkwargs0__ [__attrib0__]; break;
						case 'delimited_expression_parser': var delimited_expression_parser = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		if (__t__ (delimiters !== null)) {
			if (__t__ (__call__ (isinstance, null, delimiters, str))) {
				return [delimiters];
			}
			else {
				return [__getitem__ (delimiters, 0)];
			}
		}
		return (function () {
			var __accu0__ = [];
			var __iterable0__ = group_parsing_state.latex_group_delimiters;
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var __left0__ = __getitem__ (__iterable0__, __index0__);
				var od = __left0__ [0];
				var cd = __left0__ [1];
				(function () {
					var __accu1__ = __accu0__;
					return __call__ (__accu1__.append, __accu1__, od);
				}) ();
			}
			return __accu0__;
		}) ();
	});},
	get is_opening_delimiter () {return __getcm__ (this, function (cls, delimiters, first_token, group_parsing_state, delimited_expression_parser, latex_walker) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'cls': var cls = __allkwargs0__ [__attrib0__]; break;
						case 'delimiters': var delimiters = __allkwargs0__ [__attrib0__]; break;
						case 'first_token': var first_token = __allkwargs0__ [__attrib0__]; break;
						case 'group_parsing_state': var group_parsing_state = __allkwargs0__ [__attrib0__]; break;
						case 'delimited_expression_parser': var delimited_expression_parser = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		if (__t__ (__ne__ (first_token.tok, 'brace_open'))) {
			return false;
		}
		if (__t__ (!__t__ (((function () {
			var __accu0__ = cls;
			return __call__ (__accu0__.check_opening_delimiter, __accu0__, __kwargtrans__ ({delimiters: delimiters, parsed_opening_delimiter: first_token.arg, latex_walker: latex_walker}));
		}) ())))) {
			return false;
		}
		return true;
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
		if (__t__ (__t__ (__eq__ (token.tok, 'brace_close')) && __eq__ (token.arg, __getitem__ (self.parsed_delimiters, 1)))) {
			// pass;
			return true;
		}
		return false;
	});},
	get get_matching_delimiter () {return __get__ (this, function (self, opening_delimiter) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'opening_delimiter': var opening_delimiter = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return __getitem__ (self.group_parsing_state._latex_group_delimchars_by_open, opening_delimiter);
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
		if (__t__ (__t__ (__eq__ (token.tok, 'brace_open')) && __eq__ (token.arg, __getitem__ (self.parsed_delimiters, 0)))) {
			return self.contents_parsing_state;
		}
		return self.parsing_state;
	});}
});
export var LatexDelimitedGroupParser =  __class__ ('LatexDelimitedGroupParser', [LatexDelimitedExpressionParser], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, delimiters, delimited_expression_parser_info_class) {
		if (typeof delimited_expression_parser_info_class == 'undefined' || (delimited_expression_parser_info_class != null && delimited_expression_parser_info_class.hasOwnProperty ("__kwargtrans__"))) {;
			var delimited_expression_parser_info_class = LatexDelimitedGroupParserInfo;
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
						case 'delimited_expression_parser_info_class': var delimited_expression_parser_info_class = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, LatexDelimitedGroupParser, '__init__'), null, self, __kwargtrans__ (__mergekwargtrans__ ({delimiters: delimiters, delimited_expression_parser_info_class: delimited_expression_parser_info_class}, kwargs)));
	});}
});
export var _default_delimiter_multi_delim_list = tuple ([tuple (['{', '}']), tuple (['[', ']']), tuple (['(', ')']), tuple (['<', '>'])]);
export var LatexDelimitedMultiDelimGroupParserInfo =  __class__ ('LatexDelimitedMultiDelimGroupParserInfo', [LatexDelimitedGroupParserInfo], {
	__module__: __name__,
	get get_group_parsing_state () {return __getcm__ (this, function (cls, parsing_state, delimiters, delimited_expression_parser, latex_walker) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'cls': var cls = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
						case 'delimiters': var delimiters = __allkwargs0__ [__attrib0__]; break;
						case 'delimited_expression_parser': var delimited_expression_parser = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		assert (delimiters === null);
		var delimiters_list = delimited_expression_parser.delimiters_list;
		return (function () {
			var __accu0__ = parsing_state;
			return __call__ (__accu0__.sub_context, __accu0__, __kwargtrans__ ({latex_group_delimiters: delimiters_list}));
		}) ();
	});},
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
		__call__ (__call__ (__super__, null, LatexDelimitedMultiDelimGroupParserInfo, 'initialize'), null, self);
		var contents_delimiters_list = __call__ (list, null, self.parsing_state.latex_group_delimiters);
		var parsed_delimiters = self.parsed_delimiters;
		var parsed_open_delim = __getitem__ (parsed_delimiters, 0);
		var already_has_relevant_open_delim = false;
		var __iterable0__ = contents_delimiters_list;
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var __left0__ = __getitem__ (__iterable0__, __index0__);
			var od = __left0__ [0];
			var cd = __left0__ [1];
			if (__t__ (__eq__ (parsed_open_delim, od))) {
				var already_has_relevant_open_delim = true;
			}
		}
		if (__t__ (!__t__ ((already_has_relevant_open_delim)))) {
			(function () {
				var __accu0__ = contents_delimiters_list;
				return __call__ (__accu0__.append, __accu0__, parsed_delimiters);
			}) ();
		}
		self.contents_parsing_state = (function () {
			var __accu0__ = self.parsing_state;
			return __call__ (__accu0__.sub_context, __accu0__, __kwargtrans__ ({latex_group_delimiters: contents_delimiters_list}));
		}) ();
	});}
});
export var LatexDelimitedMultiDelimGroupParser =  __class__ ('LatexDelimitedMultiDelimGroupParser', [LatexDelimitedExpressionParser], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, delimiters_list, delimited_expression_parser_info_class) {
		if (typeof delimiters_list == 'undefined' || (delimiters_list != null && delimiters_list.hasOwnProperty ("__kwargtrans__"))) {;
			var delimiters_list = _default_delimiter_multi_delim_list;
		};
		if (typeof delimited_expression_parser_info_class == 'undefined' || (delimited_expression_parser_info_class != null && delimited_expression_parser_info_class.hasOwnProperty ("__kwargtrans__"))) {;
			var delimited_expression_parser_info_class = LatexDelimitedMultiDelimGroupParserInfo;
		};
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'delimiters_list': var delimiters_list = __allkwargs0__ [__attrib0__]; break;
						case 'delimited_expression_parser_info_class': var delimited_expression_parser_info_class = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, LatexDelimitedMultiDelimGroupParser, '__init__'), null, self, __kwargtrans__ (__mergekwargtrans__ ({delimiters: null, delimited_expression_parser_info_class: delimited_expression_parser_info_class}, kwargs)));
		self.delimiters_list = delimiters_list;
	});}
});

