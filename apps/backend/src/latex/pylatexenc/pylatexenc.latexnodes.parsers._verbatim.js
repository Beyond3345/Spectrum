import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import {LatexParserBase} from './pylatexenc.latexnodes.parsers._base.js';
import {LatexCharsNode, LatexCommentNode, LatexEnvironmentNode, LatexGroupNode, LatexMacroNode, LatexMathNode, LatexNode, LatexNodeList, LatexNodesVisitor, LatexSpecialsNode, LatexWalkerParseError, ParsedArguments, _UseList, __all__, _display_abbrev_str, _display_str_delimiters, _get_content_as_chars, _update_posposend_from_nodelist, latex_node_types, logger} from './pylatexenc.latexnodes.nodes.js';
import {LatexWalkerEndOfStream, LatexWalkerError, LatexWalkerLocatedError, LatexWalkerLocatedErrorFormatter, LatexWalkerNodesParseError, LatexWalkerTokenParseError, format_pos} from './pylatexenc.latexnodes._exctypes.js';
export {latex_node_types, LatexNodesVisitor, LatexCommentNode, _update_posposend_from_nodelist, __all__, LatexWalkerParseError, LatexGroupNode, LatexWalkerNodesParseError, format_pos, LatexCharsNode, LatexWalkerError, LatexWalkerLocatedError, LatexWalkerTokenParseError, LatexParserBase, ParsedArguments, LatexWalkerEndOfStream, LatexSpecialsNode, logger, _UseList, _display_abbrev_str, LatexEnvironmentNode, LatexWalkerLocatedErrorFormatter, LatexMathNode, _get_content_as_chars, LatexNode, _display_str_delimiters, LatexNodeList, LatexMacroNode};
var __name__ = 'pylatexenc.latexnodes.parsers._verbatim';
export var LatexVerbatimBaseParser =  __class__ ('LatexVerbatimBaseParser', [LatexParserBase], {
	__module__: __name__,
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
		__call__ (__call__ (__super__, null, LatexVerbatimBaseParser, '__init__'), null, self, __kwargtrans__ (kwargs));
	});},
	VerbatimInfo: __class__ ('VerbatimInfo', [object], {
		__module__: __name__,
		get __init__ () {return __get__ (this, function (self) {
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
			__call__ (__call__ (__super__, null, LatexVerbatimBaseParser.VerbatimInfo, '__init__'), null, self);
			self.parsed_delimiters = tuple ([null, null]);
		});}
	}),
	get new_char_check_stop_condition () {return __get__ (this, function (self, char, verbatim_string, verbatim_info, parsing_state) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'char': var char = __allkwargs0__ [__attrib0__]; break;
						case 'verbatim_string': var verbatim_string = __allkwargs0__ [__attrib0__]; break;
						case 'verbatim_info': var verbatim_info = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (verbatim_string)) {
			return true;
		}
		return false;
	});},
	get error_end_of_stream () {return __get__ (this, function (self, pos, recovery_nodes, latex_walker, verbatim_info) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
						case 'recovery_nodes': var recovery_nodes = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
						case 'verbatim_info': var verbatim_info = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __except0__ = __call__ (LatexWalkerNodesParseError, null, __kwargtrans__ ({msg: 'End of stream reached while reading verbatim content', pos: pos, recovery_nodes: recovery_nodes, error_type_info: dict ({'what': 'verbatim_unexpected_end_of_stream', 'verbatim_delimiters': verbatim_info.parsed_delimiters})}));
		__except0__.__cause__ = null;
		throw __except0__;
	});},
	get finalize_verbatim_string () {return __get__ (this, function (self, verbatim_string, verbatim_info) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'verbatim_string': var verbatim_string = __allkwargs0__ [__attrib0__]; break;
						case 'verbatim_info': var verbatim_info = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		verbatim_info.pos_start = verbatim_info.content_pos_start;
		verbatim_info.pos_end = __add__ (verbatim_info.content_pos_start, __call__ (len, null, verbatim_string));
		return verbatim_string;
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
		var verbatim_info = (function () {
			var __accu0__ = LatexVerbatimBaseParser;
			return __call__ (__accu0__.VerbatimInfo, __accu0__);
		}) ();
		verbatim_info.original_pos = (function () {
			var __accu0__ = token_reader;
			return __call__ (__accu0__.cur_pos, __accu0__);
		}) ();
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.read_verbatim_content, __accu0__, latex_walker, token_reader, parsing_state, __kwargtrans__ (__mergekwargtrans__ ({verbatim_info: verbatim_info}, kwargs)));
		}) ();
	});},
	get read_verbatim_content () {return __get__ (this, function (self, latex_walker, token_reader, parsing_state, verbatim_info) {
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
						case 'verbatim_info': var verbatim_info = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		var verbatim_string = '';
		var stop_condition_met = false;
		var ended_with_eos = false;
		verbatim_info.content_pos_start = (function () {
			var __accu0__ = token_reader;
			return __call__ (__accu0__.cur_pos, __accu0__);
		}) ();
		while (__t__ (!__t__ ((stop_condition_met)))) {
			try {
				var char = (function () {
					var __accu0__ = token_reader;
					return __call__ (__accu0__.next_chars, __accu0__, 1, __kwargtrans__ ({parsing_state: parsing_state}));
				}) ();
			}
			catch (__except0__) {
				if (isinstance (__except0__, LatexWalkerEndOfStream)) {
					var char = null;
					var ended_with_eos = true;
				}
				else {
					throw __except0__;
				}
			}
			var stopinfo = (function () {
				var __accu0__ = self;
				return __call__ (__accu0__.new_char_check_stop_condition, __accu0__, char, verbatim_string, verbatim_info, parsing_state);
			}) ();
			if (__t__ (stopinfo)) {
				var stop_condition_met = true;
				if (__t__ (__t__ (stopinfo !== true) && __t__ (char !== null) && __getitem__ (stopinfo, 'put_back_char'))) {
					(function () {
						var __accu0__ = token_reader;
						return __call__ (__accu0__.move_to_pos_chars, __accu0__, __sub__ ((function () {
							var __accu1__ = token_reader;
							return __call__ (__accu1__.cur_pos, __accu1__);
						}) (), 1));
					}) ();
				}
			}
			else {
				if (__t__ (char === null)) {
					break;
				}
				var verbatim_string = __call__ (__iadd__, null, verbatim_string, char);
			}
		}
		var verbatim_string = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.finalize_verbatim_string, __accu0__, verbatim_string, verbatim_info);
		}) ();
		var pos_start = verbatim_info.pos_start;
		var pos_end = verbatim_info.pos_end;
		var nodes = (function () {
			var __accu0__ = latex_walker;
			return __call__ (__accu0__.make_node, __accu0__, LatexCharsNode, __kwargtrans__ ({chars: verbatim_string, pos: pos_start, pos_end: pos_end, parsing_state: (function () {
				var __accu1__ = parsing_state;
				return __call__ (__accu1__.sub_context, __accu1__, __kwargtrans__ ({enable_double_newline_paragraphs: false, enable_macros: false, enable_environments: false, enable_specials: false, enable_comments: false, enable_groups: false, enable_math: false}));
			}) ()}));
		}) ();
		if (__t__ (__t__ (!__t__ ((stop_condition_met))) && ended_with_eos)) {
			return (function () {
				var __accu0__ = self;
				return __call__ (__accu0__.error_end_of_stream, __accu0__, __kwargtrans__ ({pos: pos_end, recovery_nodes: nodes, latex_walker: latex_walker, verbatim_info: verbatim_info}));
			}) ();
		}
		return tuple ([nodes, null]);
	});}
});
export var LatexDelimitedVerbatimParser =  __class__ ('LatexDelimitedVerbatimParser', [LatexVerbatimBaseParser], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, delimiters, auto_delimiters) {
		if (typeof delimiters == 'undefined' || (delimiters != null && delimiters.hasOwnProperty ("__kwargtrans__"))) {;
			var delimiters = null;
		};
		if (typeof auto_delimiters == 'undefined' || (auto_delimiters != null && auto_delimiters.hasOwnProperty ("__kwargtrans__"))) {;
			var auto_delimiters = null;
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
						case 'auto_delimiters': var auto_delimiters = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, LatexDelimitedVerbatimParser, '__init__'), null, self, __kwargtrans__ (kwargs));
		self.delimiters = delimiters;
		if (__t__ (auto_delimiters !== null)) {
			self.auto_delimiters = __call__ (dict, null, auto_delimiters);
		}
		else {
			self.auto_delimiters = dict ({'{': '}', '[': ']', '<': '>', '(': ')'});
		}
		self.depth_counter = 1;
		self.parsed_delimiters = null;
	});},
	get new_char_check_stop_condition () {return __get__ (this, function (self, char, verbatim_string, verbatim_info, parsing_state) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'char': var char = __allkwargs0__ [__attrib0__]; break;
						case 'verbatim_string': var verbatim_string = __allkwargs0__ [__attrib0__]; break;
						case 'verbatim_info': var verbatim_info = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (char === null)) {
			return false;
		}
		if (__t__ (__eq__ (char, __getitem__ (verbatim_info.parsed_delimiters, 1)))) {
			self.depth_counter = __call__ (__isub__, null, self.depth_counter, 1);
			if (__t__ (__le__ (self.depth_counter, 0))) {
				return true;
			}
		}
		else if (__t__ (__eq__ (char, __getitem__ (verbatim_info.parsed_delimiters, 0)))) {
			self.depth_counter = __call__ (__iadd__, null, self.depth_counter, 1);
		}
		return false;
	});},
	get error_end_of_stream () {return __get__ (this, function (self, pos, recovery_nodes, latex_walker, verbatim_info) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
						case 'recovery_nodes': var recovery_nodes = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
						case 'verbatim_info': var verbatim_info = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return __call__ (__call__ (__super__, null, LatexDelimitedVerbatimParser, 'error_end_of_stream'), null, self, __kwargtrans__ ({pos: pos, recovery_nodes: (function () {
			var __accu0__ = latex_walker;
			return __call__ (__accu0__.make_node, __accu0__, LatexGroupNode, __kwargtrans__ ({delimiters: verbatim_info.parsed_delimiters, nodelist: (function () {
				var __accu1__ = latex_walker;
				return __call__ (__accu1__.make_nodelist, __accu1__, [recovery_nodes], __kwargtrans__ ({parsing_state: recovery_nodes.parsing_state}));
			}) (), pos: verbatim_info.original_pos, pos_end: recovery_nodes.pos_end, parsing_state: recovery_nodes.parsing_state}));
		}) (), latex_walker: latex_walker, verbatim_info: verbatim_info}));
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
		self.depth_counter = 1;
		var verbatim_info = (function () {
			var __accu0__ = LatexVerbatimBaseParser;
			return __call__ (__accu0__.VerbatimInfo, __accu0__);
		}) ();
		(function () {
			var __accu0__ = token_reader;
			return __call__ (__accu0__.skip_space_chars, __accu0__, parsing_state);
		}) ();
		verbatim_info.original_pos = (function () {
			var __accu0__ = token_reader;
			return __call__ (__accu0__.cur_pos, __accu0__);
		}) ();
		if (__t__ (self.delimiters === null)) {
			var open_delim_char = (function () {
				var __accu0__ = token_reader;
				return __call__ (__accu0__.next_chars, __accu0__, 1, __kwargtrans__ ({parsing_state: parsing_state}));
			}) ();
			var close_delim_char = (function () {
				var __accu0__ = self.auto_delimiters;
				return __call__ (__accu0__.py_get, __accu0__, open_delim_char, open_delim_char);
			}) ();
			verbatim_info.parsed_delimiters = tuple ([open_delim_char, close_delim_char]);
		}
		else {
			verbatim_info.parsed_delimiters = self.delimiters;
			var first_char = (function () {
				var __accu0__ = token_reader;
				return __call__ (__accu0__.next_chars, __accu0__, 1, __kwargtrans__ ({parsing_state: parsing_state}));
			}) ();
			if (__t__ (__ne__ (first_char, __getitem__ (verbatim_info.parsed_delimiters, 0)))) {
				var __except0__ = __call__ (LatexWalkerParseError, null, __kwargtrans__ ({msg: (function () {
					var __accu0__ = 'Expected opening delimiter ‘{}’ for verbatim content';
					return __call__ (__accu0__.format, __accu0__, __getitem__ (verbatim_info.parsed_delimiters, 0));
				}) (), pos: verbatim_info.original_pos, error_type_info: dict ({'what': 'verbatim_expected_opening_delimiter_not_found', 'expected_delimiters': verbatim_info.parsed_delimiters})}));
				__except0__.__cause__ = null;
				throw __except0__;
			}
		}
		var __left0__ = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.read_verbatim_content, __accu0__, latex_walker, token_reader, parsing_state, __kwargtrans__ (__mergekwargtrans__ ({verbatim_info: verbatim_info}, kwargs)));
		}) ();
		var verbatim_node = __left0__ [0];
		var _ = __left0__ [1];
		var nodes = (function () {
			var __accu0__ = latex_walker;
			return __call__ (__accu0__.make_node, __accu0__, LatexGroupNode, __kwargtrans__ ({delimiters: verbatim_info.parsed_delimiters, nodelist: (function () {
				var __accu1__ = latex_walker;
				return __call__ (__accu1__.make_nodelist, __accu1__, [verbatim_node], __kwargtrans__ ({parsing_state: parsing_state}));
			}) (), pos: verbatim_info.original_pos, pos_end: __add__ (verbatim_node.pos_end, __call__ (len, null, __getitem__ (verbatim_info.parsed_delimiters, 1))), parsing_state: parsing_state}));
		}) ();
		return tuple ([nodes, null]);
	});}
});
export var LatexVerbatimEnvironmentContentsParser =  __class__ ('LatexVerbatimEnvironmentContentsParser', [LatexVerbatimBaseParser], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, environment_name) {
		if (typeof environment_name == 'undefined' || (environment_name != null && environment_name.hasOwnProperty ("__kwargtrans__"))) {;
			var environment_name = 'verbatim';
		};
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'environment_name': var environment_name = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, LatexVerbatimEnvironmentContentsParser, '__init__'), null, self, __kwargtrans__ (kwargs));
		self.environment_name = environment_name;
	});},
	get new_char_check_stop_condition () {return __get__ (this, function (self, char, verbatim_string, verbatim_info, parsing_state) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'char': var char = __allkwargs0__ [__attrib0__]; break;
						case 'verbatim_string': var verbatim_string = __allkwargs0__ [__attrib0__]; break;
						case 'verbatim_info': var verbatim_info = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ ((function () {
			var __accu0__ = verbatim_string;
			return __call__ (__accu0__.endswith, __accu0__, verbatim_info.end_environment_code);
		}) ())) {
			return dict ({'put_back_char': true});
		}
		return false;
	});},
	get error_end_of_stream () {return __get__ (this, function (self, pos, recovery_nodes, latex_walker, verbatim_info) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
						case 'recovery_nodes': var recovery_nodes = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
						case 'verbatim_info': var verbatim_info = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return __call__ (__call__ (__super__, null, LatexVerbatimEnvironmentContentsParser, 'error_end_of_stream'), null, self, __kwargtrans__ ({pos: pos, recovery_nodes: (function () {
			var __accu0__ = latex_walker;
			return __call__ (__accu0__.make_nodelist, __accu0__, [recovery_nodes], __kwargtrans__ ({parsing_state: recovery_nodes.parsing_state}));
		}) (), latex_walker: latex_walker, verbatim_info: verbatim_info}));
	});},
	get finalize_verbatim_string () {return __get__ (this, function (self, verbatim_string, verbatim_info) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'verbatim_string': var verbatim_string = __allkwargs0__ [__attrib0__]; break;
						case 'verbatim_info': var verbatim_info = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var end_environment_code = verbatim_info.end_environment_code;
		if (__t__ ((function () {
			var __accu0__ = verbatim_string;
			return __call__ (__accu0__.endswith, __accu0__, end_environment_code);
		}) ())) {
			var verbatim_string = __getslice__ (verbatim_string, 0, __neg__ (__call__ (len, null, end_environment_code)), 1);
		}
		var pos_start = verbatim_info.original_pos;
		if (__t__ ((function () {
			var __accu0__ = verbatim_string;
			return __call__ (__accu0__.startswith, __accu0__, '\n');
		}) ())) {
			var verbatim_string = __getslice__ (verbatim_string, 1, null, 1);
			var pos_start = __call__ (__iadd__, null, pos_start, 1);
		}
		verbatim_info.pos_start = pos_start;
		verbatim_info.pos_end = __add__ (pos_start, __call__ (len, null, verbatim_string));
		return verbatim_string;
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
		var verbatim_info = (function () {
			var __accu0__ = LatexVerbatimBaseParser;
			return __call__ (__accu0__.VerbatimInfo, __accu0__);
		}) ();
		verbatim_info.original_pos = (function () {
			var __accu0__ = token_reader;
			return __call__ (__accu0__.cur_pos, __accu0__);
		}) ();
		verbatim_info.end_environment_code = __add__ (__add__ (__add__ (parsing_state.macro_escape_char, 'end{'), self.environment_name), '}');
		var __left0__ = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.read_verbatim_content, __accu0__, latex_walker, token_reader, parsing_state, verbatim_info, __kwargtrans__ (kwargs));
		}) ();
		var verbatim_chars_node = __left0__ [0];
		var _ = __left0__ [1];
		var nodes = (function () {
			var __accu0__ = latex_walker;
			return __call__ (__accu0__.make_nodelist, __accu0__, [verbatim_chars_node], __kwargtrans__ ({parsing_state: parsing_state}));
		}) ();
		return tuple ([nodes, null]);
	});}
});

