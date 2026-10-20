var logging = {};
import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import {LatexArgumentSpec, ParsedArguments, get_updated_parsing_state_from_delta} from './pylatexenc.latexnodes.js';
import {LatexParserBase, get_standard_argument_parser} from './pylatexenc.latexnodes.parsers.js';
import * as __module_logging__ from './logging.js';
__nest__ (logging, '', __module_logging__);
export {LatexArgumentSpec, get_updated_parsing_state_from_delta, get_standard_argument_parser, LatexParserBase, ParsedArguments};
var __name__ = 'pylatexenc.macrospec._argumentsparser';
export var logger = (function () {
	var __accu0__ = logging;
	return __call__ (__accu0__.getLogger, __accu0__, __name__);
}) ();
export var LatexNoArgumentsParser =  __class__ ('LatexNoArgumentsParser', [LatexParserBase], {
	__module__: __name__,
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
		var parsed = __call__ (ParsedArguments, null, __kwargtrans__ ({arguments_spec_list: [], argnlist: []}));
		return tuple ([parsed, null]);
	});},
	get __eq__ () {return __get__ (this, function (self, other) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'other': var other = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return self.__class__ === other.__class__;
	});}
});
export var LatexArgumentsParser =  __class__ ('LatexArgumentsParser', [LatexParserBase], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, arguments_spec_list) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'arguments_spec_list': var arguments_spec_list = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, LatexArgumentsParser, '__init__'), null, self, __kwargtrans__ (kwargs));
		if (__t__ (arguments_spec_list === null)) {
			var arguments_spec_list = [];
		}
		self.arguments_spec_list = (function () {
			var __accu0__ = [];
			var __iterable0__ = arguments_spec_list;
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var arg = __getitem__ (__iterable0__, __index0__);
				(function () {
					var __accu1__ = __accu0__;
					return __call__ (__accu1__.append, __accu1__, (__t__ (!__t__ ((__call__ (isinstance, null, arg, LatexArgumentSpec)))) ? __call__ (LatexArgumentSpec, null, arg) : arg));
				}) ();
			}
			return __accu0__;
		}) ();
		var __iterable0__ = self.arguments_spec_list;
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var arg = __getitem__ (__iterable0__, __index0__);
			if (__t__ (__call__ (isinstance, null, arg.parser, str))) {
				var std_parser = __call__ (get_standard_argument_parser, null, arg.parser);
				(function () {
					var __accu0__ = std_parser;
					return __call__ (__accu0__.get_arg_parser_instance, __accu0__, std_parser.arg_spec);
				}) ();
			}
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
		var argnlist = [];
		var __iterable0__ = __call__ (enumerate, null, self.arguments_spec_list);
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var __left0__ = __getitem__ (__iterable0__, __index0__);
			var argj = __left0__ [0];
			var arg = __left0__ [1];
			var arg_node_parser = arg.parser;
			// pass;
			var peeked_token = (function () {
				var __accu0__ = token_reader;
				return __call__ (__accu0__.peek_token_or_none, __accu0__, __kwargtrans__ ({parsing_state: parsing_state}));
			}) ();
			if (__t__ (__call__ (isinstance, null, arg_node_parser, str))) {
				var arg_node_parser = __call__ (get_standard_argument_parser, null, arg_node_parser);
			}
			var arg_parsing_state = __call__ (get_updated_parsing_state_from_delta, null, parsing_state, arg.parsing_state_delta, latex_walker);
			// pass;
			var __left0__ = (function () {
				var __accu0__ = latex_walker;
				return __call__ (__accu0__.parse_content, __accu0__, arg_node_parser, token_reader, arg_parsing_state, __kwargtrans__ ({open_context: tuple ([(function () {
					var __accu1__ = 'Argument {}';
					return __call__ (__accu1__.format, __accu1__, argj);
				}) (), peeked_token])}));
			}) ();
			var argnodes = __left0__ [0];
			var parsing_state_delta = __left0__ [1];
			if (__t__ (parsing_state_delta !== null)) {
				(function () {
					var __accu0__ = logger;
					return __call__ (__accu0__.warning, __accu0__, 'Parsing state changes information (%r) ignored in arguments!', parsing_state_delta);
				}) ();
			}
			(function () {
				var __accu0__ = argnlist;
				return __call__ (__accu0__.append, __accu0__, argnodes);
			}) ();
		}
		var parsed = __call__ (ParsedArguments, null, __kwargtrans__ ({arguments_spec_list: self.arguments_spec_list, argnlist: argnlist}));
		// pass;
		return tuple ([parsed, null]);
	});},
	get __eq__ () {return __get__ (this, function (self, other) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'other': var other = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return __t__ (self.__class__ === other.__class__) && __eq__ (self.arguments_spec_list, other.arguments_spec_list);
	});}
});

