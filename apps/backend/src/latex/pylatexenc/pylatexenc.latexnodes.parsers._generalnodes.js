var logging = {};
import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import {LatexParserBase} from './pylatexenc.latexnodes.parsers._base.js';
import * as nodes from './pylatexenc.latexnodes.nodes.js';
import {LatexWalkerEndOfStream, LatexWalkerError, LatexWalkerLocatedError, LatexWalkerLocatedErrorFormatter, LatexWalkerNodesParseError, LatexWalkerParseError, LatexWalkerTokenParseError, __all__, format_pos} from './pylatexenc.latexnodes._exctypes.js';
import * as __module_logging__ from './logging.js';
__nest__ (logging, '', __module_logging__);
export {LatexParserBase, nodes, LatexWalkerLocatedErrorFormatter, LatexWalkerLocatedError, LatexWalkerError, __all__, LatexWalkerParseError, LatexWalkerTokenParseError, LatexWalkerEndOfStream, LatexWalkerNodesParseError, format_pos};
var __name__ = 'pylatexenc.latexnodes.parsers._generalnodes';
export var logger = (function () {
	var __accu0__ = logging;
	return __call__ (__accu0__.getLogger, __accu0__, __name__);
}) ();
export var LatexGeneralNodesParser =  __class__ ('LatexGeneralNodesParser', [LatexParserBase], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, stop_token_condition, stop_nodelist_condition, require_stop_condition_met, stop_condition_message, make_child_parsing_state, handle_stop_condition_token, include_stop_token_pre_space_chars, handle_stop_data) {
		if (typeof stop_token_condition == 'undefined' || (stop_token_condition != null && stop_token_condition.hasOwnProperty ("__kwargtrans__"))) {;
			var stop_token_condition = null;
		};
		if (typeof stop_nodelist_condition == 'undefined' || (stop_nodelist_condition != null && stop_nodelist_condition.hasOwnProperty ("__kwargtrans__"))) {;
			var stop_nodelist_condition = null;
		};
		if (typeof require_stop_condition_met == 'undefined' || (require_stop_condition_met != null && require_stop_condition_met.hasOwnProperty ("__kwargtrans__"))) {;
			var require_stop_condition_met = true;
		};
		if (typeof stop_condition_message == 'undefined' || (stop_condition_message != null && stop_condition_message.hasOwnProperty ("__kwargtrans__"))) {;
			var stop_condition_message = null;
		};
		if (typeof make_child_parsing_state == 'undefined' || (make_child_parsing_state != null && make_child_parsing_state.hasOwnProperty ("__kwargtrans__"))) {;
			var make_child_parsing_state = null;
		};
		if (typeof handle_stop_condition_token == 'undefined' || (handle_stop_condition_token != null && handle_stop_condition_token.hasOwnProperty ("__kwargtrans__"))) {;
			var handle_stop_condition_token = null;
		};
		if (typeof include_stop_token_pre_space_chars == 'undefined' || (include_stop_token_pre_space_chars != null && include_stop_token_pre_space_chars.hasOwnProperty ("__kwargtrans__"))) {;
			var include_stop_token_pre_space_chars = true;
		};
		if (typeof handle_stop_data == 'undefined' || (handle_stop_data != null && handle_stop_data.hasOwnProperty ("__kwargtrans__"))) {;
			var handle_stop_data = null;
		};
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'stop_token_condition': var stop_token_condition = __allkwargs0__ [__attrib0__]; break;
						case 'stop_nodelist_condition': var stop_nodelist_condition = __allkwargs0__ [__attrib0__]; break;
						case 'require_stop_condition_met': var require_stop_condition_met = __allkwargs0__ [__attrib0__]; break;
						case 'stop_condition_message': var stop_condition_message = __allkwargs0__ [__attrib0__]; break;
						case 'make_child_parsing_state': var make_child_parsing_state = __allkwargs0__ [__attrib0__]; break;
						case 'handle_stop_condition_token': var handle_stop_condition_token = __allkwargs0__ [__attrib0__]; break;
						case 'include_stop_token_pre_space_chars': var include_stop_token_pre_space_chars = __allkwargs0__ [__attrib0__]; break;
						case 'handle_stop_data': var handle_stop_data = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, LatexGeneralNodesParser, '__init__'), null, self, __kwargtrans__ (kwargs));
		self.stop_token_condition = stop_token_condition;
		self.stop_nodelist_condition = stop_nodelist_condition;
		self.require_stop_condition_met = require_stop_condition_met;
		self.stop_condition_message = stop_condition_message;
		self.make_child_parsing_state = make_child_parsing_state;
		self.handle_stop_condition_token = handle_stop_condition_token;
		self.handle_stop_data = handle_stop_data;
		self.include_stop_token_pre_space_chars = include_stop_token_pre_space_chars;
	});},
	get make_nodes_collector () {return __get__ (this, function (self, latex_walker, token_reader, parsing_state) {
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
		return (function () {
			var __accu0__ = latex_walker;
			return __call__ (__accu0__.make_nodes_collector, __accu0__, __kwargtrans__ ({token_reader: token_reader, parsing_state: parsing_state, stop_token_condition: self.stop_token_condition, stop_nodelist_condition: self.stop_nodelist_condition, make_child_parsing_state: self.make_child_parsing_state, include_stop_token_pre_space_chars: self.include_stop_token_pre_space_chars}));
		}) ();
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
		var pos_start = (function () {
			var __accu0__ = token_reader;
			return __call__ (__accu0__.cur_pos, __accu0__);
		}) ();
		var collector = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.make_nodes_collector, __accu0__, latex_walker, token_reader, parsing_state);
		}) ();
		try {
			(function () {
				var __accu0__ = collector;
				return __call__ (__accu0__.process_tokens, __accu0__);
			}) ();
		}
		catch (__except0__) {
			if (isinstance (__except0__, LatexWalkerParseError)) {
				var e = __except0__;
				// pass;
				var thenodelist = (function () {
					var __accu0__ = collector;
					return __call__ (__accu0__.get_final_nodelist, __accu0__);
				}) ();
				if (__t__ (thenodelist.pos === null)) {
					thenodelist.pos = pos_start;
				}
				if (__t__ (thenodelist.pos_end === null)) {
					thenodelist.pos_end = pos_start;
				}
				var recovery_at_token = null;
				if (__t__ (__call__ (hasattr, null, e, 'recovery_at_token'))) {
					var recovery_at_token = e.recovery_at_token;
				}
				var recovery_past_token = null;
				if (__t__ (__call__ (hasattr, null, e, 'recovery_past_token'))) {
					var recovery_past_token = e.recovery_past_token;
				}
				var __except1__ = __call__ (LatexWalkerNodesParseError, null, __kwargtrans__ ({msg: e.msg, pos: e.pos, open_contexts: e.open_contexts, error_type_info: e.error_type_info, recovery_nodes: thenodelist, recovery_parsing_state_delta: (function () {
					var __accu0__ = collector;
					return __call__ (__accu0__.get_parser_parsing_state_delta, __accu0__);
				}) (), recovery_at_token: recovery_at_token, recovery_past_token: recovery_past_token}));
				__except1__.__cause__ = null;
				throw __except1__;
			}
			else {
				throw __except0__;
			}
		}
		var collected_nodelist = (function () {
			var __accu0__ = collector;
			return __call__ (__accu0__.get_final_nodelist, __accu0__);
		}) ();
		if (__t__ (collected_nodelist.pos === null)) {
			collected_nodelist.pos = pos_start;
		}
		if (__t__ (collected_nodelist.pos_end === null)) {
			collected_nodelist.pos_end = pos_start;
		}
		var stop_token_condition_met = (function () {
			var __accu0__ = collector;
			return __call__ (__accu0__.stop_token_condition_met, __accu0__);
		}) ();
		var stop_nodelist_condition_met = (function () {
			var __accu0__ = collector;
			return __call__ (__accu0__.stop_nodelist_condition_met, __accu0__);
		}) ();
		if (__t__ (!__t__ ((self.require_stop_condition_met)))) {
			var met_a_required_stop_condition = true;
		}
		else {
			var met_a_required_stop_condition = false;
			if (__t__ (__t__ (self.stop_token_condition === null) && self.stop_nodelist_condition === null)) {
				var met_a_required_stop_condition = true;
			}
			else {
				if (__t__ (self.stop_token_condition !== null)) {
					if (__t__ (stop_token_condition_met)) {
						var met_a_required_stop_condition = true;
					}
				}
				if (__t__ (self.stop_nodelist_condition !== null)) {
					if (__t__ (stop_nodelist_condition_met)) {
						var met_a_required_stop_condition = true;
					}
				}
			}
		}
		// pass;
		if (__t__ (!__t__ ((met_a_required_stop_condition)))) {
			var message = self.stop_condition_message;
			if (__t__ (message === null)) {
				var message = 'End of stream encountered while parsing nodes without stop condition being met [reporting starting position]';
			}
			var exc = __call__ (LatexWalkerNodesParseError, null, __kwargtrans__ ({msg: message, pos: (function () {
				var __accu0__ = collector;
				return __call__ (__accu0__.pos_start, __accu0__);
			}) (), recovery_nodes: collected_nodelist, recovery_parsing_state_delta: (function () {
				var __accu0__ = collector;
				return __call__ (__accu0__.get_parser_parsing_state_delta, __accu0__);
			}) (), error_type_info: dict ({'what': 'nodes_generalnodes_required_stop_condition_not_met', 'stop_condition_message': self.stop_condition_message})}));
			var __except0__ = exc;
			__except0__.__cause__ = null;
			throw __except0__;
		}
		if (__t__ (__t__ (stop_token_condition_met) && self.handle_stop_condition_token !== null)) {
			var stoptoken = (function () {
				var __accu0__ = collector;
				return __call__ (__accu0__.stop_token_condition_met_token, __accu0__);
			}) ();
			if (__t__ (stoptoken !== null)) {
				(function () {
					var __accu0__ = self;
					return __call__ (__accu0__.handle_stop_condition_token, __accu0__, stoptoken, __kwargtrans__ ({latex_walker: latex_walker, token_reader: token_reader, parsing_state: parsing_state}));
				}) ();
			}
		}
		var stop_data = (function () {
			var __accu0__ = collector;
			return __call__ (__accu0__.stop_condition_stop_data, __accu0__);
		}) ();
		if (__t__ (__t__ (stop_data !== null) && self.handle_stop_data !== null)) {
			(function () {
				var __accu0__ = self;
				return __call__ (__accu0__.handle_stop_data, __accu0__, stop_data, __kwargtrans__ ({latex_walker: latex_walker, token_reader: token_reader, parsing_state: parsing_state}));
			}) ();
		}
		var nodelist = collected_nodelist;
		var parsing_state_delta = (function () {
			var __accu0__ = collector;
			return __call__ (__accu0__.get_parser_parsing_state_delta, __accu0__);
		}) ();
		// pass;
		return tuple ([nodelist, parsing_state_delta]);
	});}
});
export var LatexSingleNodeParser =  __class__ ('LatexSingleNodeParser', [LatexGeneralNodesParser], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, stop_on_comment) {
		if (typeof stop_on_comment == 'undefined' || (stop_on_comment != null && stop_on_comment.hasOwnProperty ("__kwargtrans__"))) {;
			var stop_on_comment = true;
		};
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'stop_on_comment': var stop_on_comment = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, LatexSingleNodeParser, '__init__'), null, self, __kwargtrans__ (__mergekwargtrans__ ({stop_nodelist_condition: self._stop_nodelist_condition, require_stop_condition_met: false}, kwargs)));
		self.stop_on_comment = stop_on_comment;
	});},
	get _stop_nodelist_condition () {return __get__ (this, function (self, nodelist) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'nodelist': var nodelist = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var nl = nodelist;
		if (__t__ (!__t__ ((self.stop_on_comment)))) {
			var nl = (function () {
				var __accu0__ = [];
				var __iterable0__ = nl;
				for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
					var n = __getitem__ (__iterable0__, __index0__);
					if (__t__ (!__t__ (((function () {
						var __accu1__ = n;
						return __call__ (__accu1__.isNodeType, __accu1__, nodes.LatexCommentNode);
					}) ())))) {
						(function () {
							var __accu1__ = __accu0__;
							return __call__ (__accu1__.append, __accu1__, n);
						}) ();
					}
				}
				return __accu0__;
			}) ();
		}
		if (__t__ (__ge__ (__call__ (len, null, nl), 1))) {
			return true;
		}
		return false;
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
	});}
});

