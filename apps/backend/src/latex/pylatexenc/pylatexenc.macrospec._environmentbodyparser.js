var logging = {};
import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import {LatexDelimitedExpressionParser, LatexDelimitedExpressionParserInfo} from './pylatexenc.latexnodes.parsers.js';
import {get_updated_parsing_state_from_delta} from './pylatexenc.latexnodes.js';
import {LatexWalkerEndOfStream, LatexWalkerError, LatexWalkerLocatedError, LatexWalkerLocatedErrorFormatter, LatexWalkerNodesParseError, LatexWalkerParseError, LatexWalkerTokenParseError, __all__, format_pos} from './pylatexenc.latexnodes._exctypes.js';
import * as __module_logging__ from './logging.js';
__nest__ (logging, '', __module_logging__);
export {get_updated_parsing_state_from_delta, LatexDelimitedExpressionParserInfo, LatexWalkerLocatedErrorFormatter, LatexWalkerError, LatexWalkerLocatedError, __all__, LatexWalkerParseError, LatexWalkerTokenParseError, LatexWalkerEndOfStream, LatexDelimitedExpressionParser, LatexWalkerNodesParseError, format_pos};
var __name__ = 'pylatexenc.macrospec._environmentbodyparser';
export var logger = (function () {
	var __accu0__ = logging;
	return __call__ (__accu0__.getLogger, __accu0__, __name__);
}) ();
export var LatexEnvironmentBodyContentsParserInfo =  __class__ ('LatexEnvironmentBodyContentsParserInfo', [LatexDelimitedExpressionParserInfo], {
	__module__: __name__,
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
		return [];
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
		var contents_parsing_state_delta = (function () {
			var __accu0__ = self.delimited_expression_parser;
			return __call__ (__accu0__.get_contents_parsing_state_delta, __accu0__);
		}) ();
		self.contents_parsing_state = __call__ (get_updated_parsing_state_from_delta, null, self.group_parsing_state, contents_parsing_state_delta, self.latex_walker);
		self.child_parsing_state_delta = (function () {
			var __accu0__ = self.delimited_expression_parser;
			return __call__ (__accu0__.get_child_parsing_state_delta, __accu0__);
		}) ();
		self.parsed_delimiters = tuple ([(function () {
			var __accu0__ = '\\begin{}{}{}';
			return __call__ (__accu0__.format, __accu0__, '{', self.delimited_expression_parser.environmentname, '}');
		}) (), (function () {
			var __accu0__ = '\\end{}{}{}';
			return __call__ (__accu0__.format, __accu0__, '{', self.delimited_expression_parser.environmentname, '}');
		}) ()]);
		// pass;
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
		return null;
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
		if (__t__ (__t__ (__eq__ (token.tok, 'end_environment')) && __eq__ (token.arg, self.delimited_expression_parser.environmentname))) {
			return true;
		}
		return false;
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
		if (__t__ (nodelist === null)) {
			(function () {
				var __accu0__ = logger;
				return __call__ (__accu0__.warning, __accu0__, 'environment body contents parser: parsed nodelist is None');
			}) ();
			var nodelist = (function () {
				var __accu0__ = latex_walker;
				return __call__ (__accu0__.make_nodelist, __accu0__, __kwargtrans__ ({nodelist: [], parsing_state: self.contents_parsing_state}));
			}) ();
		}
		return tuple ([nodelist, parsing_state_delta]);
	});}
});
export var LatexEnvironmentBodyContentsParser =  __class__ ('LatexEnvironmentBodyContentsParser', [LatexDelimitedExpressionParser], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, environmentname, contents_parsing_state_delta, child_parsing_state_delta, discard_parsing_state_delta) {
		if (typeof contents_parsing_state_delta == 'undefined' || (contents_parsing_state_delta != null && contents_parsing_state_delta.hasOwnProperty ("__kwargtrans__"))) {;
			var contents_parsing_state_delta = null;
		};
		if (typeof child_parsing_state_delta == 'undefined' || (child_parsing_state_delta != null && child_parsing_state_delta.hasOwnProperty ("__kwargtrans__"))) {;
			var child_parsing_state_delta = null;
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
						case 'environmentname': var environmentname = __allkwargs0__ [__attrib0__]; break;
						case 'contents_parsing_state_delta': var contents_parsing_state_delta = __allkwargs0__ [__attrib0__]; break;
						case 'child_parsing_state_delta': var child_parsing_state_delta = __allkwargs0__ [__attrib0__]; break;
						case 'discard_parsing_state_delta': var discard_parsing_state_delta = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, LatexEnvironmentBodyContentsParser, '__init__'), null, self, __kwargtrans__ (__mergekwargtrans__ ({delimiters: null, discard_parsing_state_delta: discard_parsing_state_delta, delimited_expression_parser_info_class: LatexEnvironmentBodyContentsParserInfo}, kwargs)));
		self.environmentname = environmentname;
		self.contents_parsing_state_delta = contents_parsing_state_delta;
		self.child_parsing_state_delta = child_parsing_state_delta;
	});},
	get get_contents_parsing_state_delta () {return __get__ (this, function (self) {
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
		return self.contents_parsing_state_delta;
	});},
	get get_child_parsing_state_delta () {return __get__ (this, function (self) {
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
		return self.child_parsing_state_delta;
	});}
});

