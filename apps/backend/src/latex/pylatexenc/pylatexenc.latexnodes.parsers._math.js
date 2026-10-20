var logging = {};
import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import {LatexDelimitedExpressionParser, LatexDelimitedExpressionParserInfo} from './pylatexenc.latexnodes.parsers._delimited.js';
import {ParsingStateDeltaEnterMathMode, get_updated_parsing_state_from_delta} from './pylatexenc.latexnodes._parsingstatedelta.js';
import * as nodes from './pylatexenc.latexnodes.nodes.js';
import {LatexWalkerEndOfStream, LatexWalkerError, LatexWalkerLocatedError, LatexWalkerLocatedErrorFormatter, LatexWalkerNodesParseError, LatexWalkerParseError, LatexWalkerTokenParseError, __all__, format_pos} from './pylatexenc.latexnodes._exctypes.js';
import * as __module_logging__ from './logging.js';
__nest__ (logging, '', __module_logging__);
export {get_updated_parsing_state_from_delta, nodes, LatexDelimitedExpressionParserInfo, LatexWalkerLocatedErrorFormatter, LatexWalkerNodesParseError, LatexWalkerError, LatexWalkerLocatedError, __all__, LatexWalkerParseError, LatexWalkerTokenParseError, LatexWalkerEndOfStream, LatexDelimitedExpressionParser, ParsingStateDeltaEnterMathMode, format_pos};
var __name__ = 'pylatexenc.latexnodes.parsers._math';
export var logger = (function () {
	var __accu0__ = logging;
	return __call__ (__accu0__.getLogger, __accu0__, __name__);
}) ();
export var LatexMathParserInfo =  __class__ ('LatexMathParserInfo', [LatexDelimitedExpressionParserInfo], {
	__module__: __name__,
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
		if (__t__ (!__in__ (first_token.tok, tuple (['mathmode_inline', 'mathmode_display'])))) {
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
			var __iterable0__ = __add__ (group_parsing_state.latex_inline_math_delimiters, group_parsing_state.latex_display_math_delimiters);
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
		self.math_mode_type = self.first_token.tok;
		self.math_mode_delimiter = self.first_token.arg;
		self.math_parsing_state = __call__ (get_updated_parsing_state_from_delta, null, self.parsing_state, __call__ (ParsingStateDeltaEnterMathMode, null, __kwargtrans__ ({math_mode_delimiter: self.math_mode_delimiter, trigger_token: self.first_token})), self.latex_walker);
		self.contents_parsing_state = self.math_parsing_state;
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
		if (__t__ (__t__ (__eq__ (token.tok, self.math_mode_type)) && __eq__ (token.arg, __getitem__ (self.parsed_delimiters, 1)))) {
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
		return __getitem__ (self.math_parsing_state._math_expecting_close_delim_info, 'close_delim');
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
		if (__t__ (__eq__ (self.math_mode_type, 'mathmode_inline'))) {
			var displaytype = 'inline';
		}
		else if (__t__ (__eq__ (self.math_mode_type, 'mathmode_display'))) {
			var displaytype = 'display';
		}
		else {
			var displaytype = '<unknown>';
		}
		var math_node = (function () {
			var __accu0__ = latex_walker;
			return __call__ (__accu0__.make_node, __accu0__, nodes.LatexMathNode, __kwargtrans__ ({displaytype: displaytype, nodelist: nodelist, parsing_state: self.parsing_state, delimiters: self.parsed_delimiters, pos: self.first_token.pos, pos_end: pos_end}));
		}) ();
		return tuple ([math_node, parsing_state_delta]);
	});}
});
export var LatexMathParser =  __class__ ('LatexMathParser', [LatexDelimitedExpressionParser], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, math_mode_delimiters) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'math_mode_delimiters': var math_mode_delimiters = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, LatexMathParser, '__init__'), null, self, __kwargtrans__ (__mergekwargtrans__ ({delimiters: math_mode_delimiters, discard_parsing_state_delta: false, delimited_expression_parser_info_class: LatexMathParserInfo}, kwargs)));
	});}
});

