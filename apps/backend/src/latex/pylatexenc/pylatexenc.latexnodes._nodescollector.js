var logging = {};
import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import {ParsingStateDeltaEnterMathMode, ParsingStateDeltaReplaceParsingState, get_updated_parsing_state_from_delta} from './pylatexenc.latexnodes._parsingstatedelta.js';
import {LatexCharsNode, LatexCommentNode, LatexEnvironmentNode, LatexGroupNode, LatexMacroNode, LatexMathNode, LatexNode, LatexNodeList, LatexNodesVisitor, LatexSpecialsNode, LatexWalkerParseError, ParsedArguments, _UseList, __all__, _display_abbrev_str, _display_str_delimiters, _get_content_as_chars, _update_posposend_from_nodelist, latex_node_types} from './pylatexenc.latexnodes.nodes.js';
import {LatexWalkerEndOfStream, LatexWalkerError, LatexWalkerLocatedError, LatexWalkerLocatedErrorFormatter, LatexWalkerNodesParseError, LatexWalkerTokenParseError, format_pos} from './pylatexenc.latexnodes._exctypes.js';
import * as __module_logging__ from './logging.js';
__nest__ (logging, '', __module_logging__);
export {latex_node_types, LatexNodesVisitor, LatexCommentNode, _update_posposend_from_nodelist, __all__, LatexWalkerParseError, LatexGroupNode, LatexWalkerNodesParseError, format_pos, LatexCharsNode, LatexWalkerError, LatexWalkerLocatedError, LatexWalkerTokenParseError, ParsedArguments, LatexWalkerEndOfStream, LatexSpecialsNode, _UseList, _display_abbrev_str, get_updated_parsing_state_from_delta, LatexEnvironmentNode, LatexWalkerLocatedErrorFormatter, ParsingStateDeltaReplaceParsingState, LatexMathNode, _get_content_as_chars, LatexNode, _display_str_delimiters, LatexNodeList, LatexMacroNode, ParsingStateDeltaEnterMathMode};
var __name__ = 'pylatexenc.latexnodes._nodescollector';
export var logger = (function () {
	var __accu0__ = logging;
	return __call__ (__accu0__.getLogger, __accu0__, __name__);
}) ();
export var LatexNodesCollector =  __class__ ('LatexNodesCollector', [object], {
	__module__: __name__,
	ReachedEndOfStream: __class__ ('ReachedEndOfStream', [Exception], {
		__module__: __name__,
	}),
	ReachedStoppingCondition: __class__ ('ReachedStoppingCondition', [Exception], {
		__module__: __name__,
		get __init__ () {return __get__ (this, function (self, stop_data) {
			var kwargs = dict ();
			if (arguments.length) {
				var __ilastarg0__ = arguments.length - 1;
				if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
					var __allkwargs0__ = arguments [__ilastarg0__--];
					for (var __attrib0__ in __allkwargs0__) {
						switch (__attrib0__) {
							case 'self': var self = __allkwargs0__ [__attrib0__]; break;
							case 'stop_data': var stop_data = __allkwargs0__ [__attrib0__]; break;
							default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
						}
					}
					delete kwargs.__kwargtrans__;
				}
			}
			else {
			}
			__call__ (__call__ (__super__, null, LatexNodesCollector.ReachedStoppingCondition, '__init__'), null, self, __kwargtrans__ (kwargs));
			self.stop_data = stop_data;
		});}
	}),
	get __init__ () {return __get__ (this, function (self, latex_walker, token_reader, parsing_state, stop_token_condition, stop_nodelist_condition, make_child_parsing_state, include_stop_token_pre_space_chars) {
		if (typeof stop_token_condition == 'undefined' || (stop_token_condition != null && stop_token_condition.hasOwnProperty ("__kwargtrans__"))) {;
			var stop_token_condition = null;
		};
		if (typeof stop_nodelist_condition == 'undefined' || (stop_nodelist_condition != null && stop_nodelist_condition.hasOwnProperty ("__kwargtrans__"))) {;
			var stop_nodelist_condition = null;
		};
		if (typeof make_child_parsing_state == 'undefined' || (make_child_parsing_state != null && make_child_parsing_state.hasOwnProperty ("__kwargtrans__"))) {;
			var make_child_parsing_state = null;
		};
		if (typeof include_stop_token_pre_space_chars == 'undefined' || (include_stop_token_pre_space_chars != null && include_stop_token_pre_space_chars.hasOwnProperty ("__kwargtrans__"))) {;
			var include_stop_token_pre_space_chars = true;
		};
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
						case 'stop_token_condition': var stop_token_condition = __allkwargs0__ [__attrib0__]; break;
						case 'stop_nodelist_condition': var stop_nodelist_condition = __allkwargs0__ [__attrib0__]; break;
						case 'make_child_parsing_state': var make_child_parsing_state = __allkwargs0__ [__attrib0__]; break;
						case 'include_stop_token_pre_space_chars': var include_stop_token_pre_space_chars = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, LatexNodesCollector, '__init__'), null, self);
		self.latex_walker = latex_walker;
		self.token_reader = token_reader;
		self.stop_token_condition = stop_token_condition;
		self.stop_nodelist_condition = stop_nodelist_condition;
		self.include_stop_token_pre_space_chars = include_stop_token_pre_space_chars;
		self._stop_token_condition_met = false;
		self._stop_token_condition_met_token = null;
		self._stop_nodelist_condition_met = false;
		self._stop_condition_stop_data = null;
		self._reached_end_of_stream = false;
		self.parsing_state = parsing_state;
		self.start_parsing_state = parsing_state;
		self._nodelist = [];
		self._pending_chars_pos = null;
		self._pending_chars = '';
		self._finalized = false;
		self._make_child_parsing_state_fn = make_child_parsing_state;
	});},
	get get_final_nodelist () {return __get__ (this, function (self) {
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
		if (__t__ (!__t__ ((self._finalized)))) {
			var __except0__ = __call__ (RuntimeError, null, 'Call to get_final_nodelist() before finalize()');
			__except0__.__cause__ = null;
			throw __except0__;
		}
		return (function () {
			var __accu0__ = self.latex_walker;
			return __call__ (__accu0__.make_nodelist, __accu0__, __kwargtrans__ ({nodelist: self._nodelist, parsing_state: self.start_parsing_state}));
		}) ();
	});},
	get get_parser_parsing_state_delta () {return __get__ (this, function (self) {
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
		if (__t__ (!__t__ ((self._finalized)))) {
			var __except0__ = __call__ (RuntimeError, null, 'Call to get_parser_parsing_state_delta() before finalize()');
			__except0__.__cause__ = null;
			throw __except0__;
		}
		if (__t__ (self.start_parsing_state === self.parsing_state)) {
			return null;
		}
		return __call__ (ParsingStateDeltaReplaceParsingState, null, __kwargtrans__ ({set_parsing_state: self.parsing_state}));
	});},
	get pos_start () {return __get__ (this, function (self) {
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
		try {
			var p = __call__ (py_next, null, (function () {
				var __accu0__ = [];
				var __iterable0__ = self._nodelist;
				for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
					var n = __getitem__ (__iterable0__, __index0__);
					if (__t__ (n !== null)) {
						(function () {
							var __accu1__ = __accu0__;
							return __call__ (__accu1__.append, __accu1__, n.pos);
						}) ();
					}
				}
				return py_iter (__accu0__);
			}) ());
		}
		catch (__except0__) {
			if (isinstance (__except0__, StopIteration)) {
				var p = null;
			}
			else {
				throw __except0__;
			}
		}
		if (__t__ (p !== null)) {
			return p;
		}
		return self._pending_chars_pos;
	});},
	get pos_end () {return __get__ (this, function (self) {
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
		try {
			var lastnode = __call__ (py_next, null, (function () {
				var __accu0__ = [];
				var __iterable0__ = __call__ (py_reversed, null, self._nodelist);
				for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
					var n = __getitem__ (__iterable0__, __index0__);
					if (__t__ (n !== null)) {
						(function () {
							var __accu1__ = __accu0__;
							return __call__ (__accu1__.append, __accu1__, n);
						}) ();
					}
				}
				return py_iter (__accu0__);
			}) ());
		}
		catch (__except0__) {
			if (isinstance (__except0__, StopIteration)) {
				var lastnode = null;
			}
			else {
				throw __except0__;
			}
		}
		if (__t__ (lastnode === null)) {
			return null;
		}
		return lastnode.pos_end;
	});},
	get stop_token_condition_met () {return __get__ (this, function (self) {
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
		return self._stop_token_condition_met;
	});},
	get stop_token_condition_met_token () {return __get__ (this, function (self) {
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
		return self._stop_token_condition_met_token;
	});},
	get stop_nodelist_condition_met () {return __get__ (this, function (self) {
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
		return self._stop_nodelist_condition_met;
	});},
	get stop_condition_stop_data () {return __get__ (this, function (self) {
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
		return self._stop_condition_stop_data;
	});},
	get reached_end_of_stream () {return __get__ (this, function (self) {
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
		return self._reached_end_of_stream;
	});},
	get is_finalized () {return __get__ (this, function (self) {
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
		return self._finalized;
	});},
	get finalize () {return __get__ (this, function (self) {
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
		if (__t__ (self._finalized)) {
			return ;
		}
		var exc = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.flush_pending_chars, __accu0__);
		}) ();
		self._finalized = true;
		if (__t__ (exc !== null)) {
			// pass;
			var __except0__ = exc;
			__except0__.__cause__ = null;
			throw __except0__;
		}
	});},
	get push_pending_chars () {return __get__ (this, function (self, chars, pos) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'chars': var chars = __allkwargs0__ [__attrib0__]; break;
						case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		self._pending_chars = __call__ (__iadd__, null, self._pending_chars, chars);
		if (__t__ (self._pending_chars_pos === null)) {
			self._pending_chars_pos = pos;
		}
	});},
	get flush_pending_chars () {return __get__ (this, function (self) {
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
		if (__t__ (!__t__ ((self._pending_chars)))) {
			return null;
		}
		var __left0__ = tuple ([self._pending_chars_pos, self._pending_chars]);
		var charspos = __left0__ [0];
		var chars = __left0__ [1];
		self._pending_chars = '';
		self._pending_chars_pos = null;
		var strnode = (function () {
			var __accu0__ = self.latex_walker;
			return __call__ (__accu0__.make_node, __accu0__, LatexCharsNode, __kwargtrans__ ({parsing_state: self.parsing_state, chars: chars, pos: charspos, pos_end: __add__ (charspos, __call__ (len, null, chars))}));
		}) ();
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.push_to_nodelist, __accu0__, strnode);
		}) ();
	});},
	get push_to_nodelist () {return __get__ (this, function (self, node) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'node': var node = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (self._finalized)) {
			var __except0__ = __call__ (RuntimeError, null, 'You already called finalize()');
			__except0__.__cause__ = null;
			throw __except0__;
		}
		(function () {
			var __accu0__ = self._nodelist;
			return __call__ (__accu0__.append, __accu0__, node);
		}) ();
		var exc = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__._check_nodelist_stop_condition, __accu0__);
		}) ();
		if (__t__ (exc !== null)) {
			return exc;
		}
		return null;
	});},
	get update_state_from_parsing_state_delta () {return __get__ (this, function (self, parsing_state_delta) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state_delta': var parsing_state_delta = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (parsing_state_delta !== null)) {
			var ps = self.parsing_state;
			self.parsing_state = (function () {
				var __accu0__ = parsing_state_delta;
				return __call__ (__accu0__.get_updated_parsing_state, __accu0__, self.parsing_state, self.latex_walker);
			}) ();
			// pass;
		}
	});},
	get _check_nodelist_stop_condition () {return __get__ (this, function (self) {
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
		var stop_nodelist_condition = self.stop_nodelist_condition;
		if (__t__ (stop_nodelist_condition !== null)) {
			var stop_data = __call__ (stop_nodelist_condition, null, self._nodelist);
			if (__t__ (stop_data)) {
				self._stop_nodelist_condition_met = true;
				// pass;
				return (function () {
					var __accu0__ = LatexNodesCollector;
					return __call__ (__accu0__.ReachedStoppingCondition, __accu0__, __kwargtrans__ ({stop_data: stop_data}));
				}) ();
			}
		}
		return null;
	});},
	get _check_token_stop_condition () {return __get__ (this, function (self, tok) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'tok': var tok = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var stop_token_condition = self.stop_token_condition;
		if (__t__ (stop_token_condition !== null)) {
			var stop_data = __call__ (stop_token_condition, null, tok);
			if (__t__ (stop_data)) {
				self._stop_token_condition_met = true;
				self._stop_token_condition_met_token = tok;
				// pass;
				return (function () {
					var __accu0__ = LatexNodesCollector;
					return __call__ (__accu0__.ReachedStoppingCondition, __accu0__, __kwargtrans__ ({stop_data: stop_data}));
				}) ();
			}
		}
		return null;
	});},
	get process_tokens () {return __get__ (this, function (self) {
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
		try {
			while (__t__ (true)) {
				(function () {
					var __accu0__ = self;
					return __call__ (__accu0__.process_one_token, __accu0__);
				}) ();
			}
		}
		catch (__except0__) {
			if (isinstance (__except0__, LatexNodesCollector.ReachedStoppingCondition)) {
				var e = __except0__;
				self._stop_condition_stop_data = e.stop_data;
				// pass;
				return ;
			}
			else if (isinstance (__except0__, LatexNodesCollector.ReachedEndOfStream)) {
				var e = __except0__;
				self._reached_end_of_stream = true;
				// pass;
				return ;
			}
			else if (isinstance (__except0__, LatexWalkerError)) {
				var e = __except0__;
				// pass;
				__except0__.__cause__ = null;
				throw __except0__;
			}
			else {
				throw __except0__;
			}
		}
		finally {
			try {
				(function () {
					var __accu0__ = self;
					return __call__ (__accu0__.finalize, __accu0__);
				}) ();
			}
			catch (__except0__) {
				if (isinstance (__except0__, LatexNodesCollector.ReachedStoppingCondition)) {
					var e = __except0__;
					self._stop_condition_stop_data = e.stop_data;
					// pass;
				}
				else {
					throw __except0__;
				}
			}
		}
	});},
	get process_one_token () {return __get__ (this, function (self) {
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
		if (__t__ (self._finalized)) {
			var __except0__ = __call__ (RuntimeError, null, 'You already called finalize()');
			__except0__.__cause__ = null;
			throw __except0__;
		}
		var latex_walker = self.latex_walker;
		var token_reader = self.token_reader;
		try {
			var tok = (function () {
				var __accu0__ = token_reader;
				return __call__ (__accu0__.next_token, __accu0__, __kwargtrans__ ({parsing_state: self.parsing_state}));
			}) ();
			// pass;
		}
		catch (__except0__) {
			if (isinstance (__except0__, LatexWalkerEndOfStream)) {
				var e = __except0__;
				var final_space = (__t__ (__call__ (hasattr, null, e, 'final_space')) ? __call__ (getattr, null, e, 'final_space') : null);
				if (__t__ (final_space)) {
					var final_space_pos = __add__ ((function () {
						var __accu0__ = token_reader;
						return __call__ (__accu0__.cur_pos, __accu0__);
					}) (), __call__ (len, null, final_space));
					var tok = (function () {
						var __accu0__ = token_reader;
						return __call__ (__accu0__.make_token, __accu0__, __kwargtrans__ ({tok: 'char', arg: '', pre_space: final_space, pos: final_space_pos, pos_end: final_space_pos}));
					}) ();
					(function () {
						var __accu0__ = token_reader;
						return __call__ (__accu0__.move_past_token, __accu0__, tok);
					}) ();
				}
				else {
					var exc = (function () {
						var __accu0__ = LatexNodesCollector;
						return __call__ (__accu0__.ReachedEndOfStream, __accu0__);
					}) ();
					exc.pos_end = (function () {
						var __accu0__ = token_reader;
						return __call__ (__accu0__.cur_pos, __accu0__);
					}) ();
					// pass;
					var __except1__ = exc;
					__except1__.__cause__ = null;
					throw __except1__;
				}
			}
			else {
				throw __except0__;
			}
		}
		var stop_exc = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__._check_token_stop_condition, __accu0__, tok);
		}) ();
		if (__t__ (stop_exc !== null)) {
			if (__t__ (self.include_stop_token_pre_space_chars)) {
				(function () {
					var __accu0__ = self;
					return __call__ (__accu0__.push_pending_chars, __accu0__, __kwargtrans__ ({chars: tok.pre_space, pos: __sub__ (tok.pos, __call__ (len, null, tok.pre_space))}));
				}) ();
				var rewind_pre_space = false;
			}
			else {
				var rewind_pre_space = true;
			}
			(function () {
				var __accu0__ = token_reader;
				return __call__ (__accu0__.move_to_token, __accu0__, tok, __kwargtrans__ ({rewind_pre_space: rewind_pre_space}));
			}) ();
			stop_exc.pos_end = tok.pos_end;
			// pass;
			var __except0__ = stop_exc;
			__except0__.__cause__ = null;
			throw __except0__;
		}
		if (__t__ (__eq__ (tok.tok, 'char'))) {
			(function () {
				var __accu0__ = self;
				return __call__ (__accu0__.push_pending_chars, __accu0__, __kwargtrans__ ({chars: __add__ (tok.pre_space, tok.arg), pos: __sub__ (tok.pos, __call__ (len, null, tok.pre_space))}));
			}) ();
			return ;
		}
		if (__t__ (self._pending_chars)) {
			self._pending_chars = __call__ (__iadd__, null, self._pending_chars, tok.pre_space);
			tok.pre_space = '';
			var stop_exc = (function () {
				var __accu0__ = self;
				return __call__ (__accu0__.flush_pending_chars, __accu0__);
			}) ();
			if (__t__ (stop_exc !== null)) {
				(function () {
					var __accu0__ = token_reader;
					return __call__ (__accu0__.move_to_token, __accu0__, tok, __kwargtrans__ ({rewind_pre_space: false}));
				}) ();
				stop_exc.pos_end = tok.pos;
				// pass;
				var __except0__ = stop_exc;
				__except0__.__cause__ = null;
				throw __except0__;
			}
		}
		else if (__t__ (tok.pre_space)) {
			var spacestrnode = (function () {
				var __accu0__ = latex_walker;
				return __call__ (__accu0__.make_node, __accu0__, LatexCharsNode, __kwargtrans__ ({parsing_state: self.parsing_state, chars: tok.pre_space, pos: __sub__ (tok.pos, __call__ (len, null, tok.pre_space)), pos_end: tok.pos}));
			}) ();
			tok.pre_space = '';
			var stop_exc = (function () {
				var __accu0__ = self;
				return __call__ (__accu0__.push_to_nodelist, __accu0__, spacestrnode);
			}) ();
			if (__t__ (stop_exc !== null)) {
				(function () {
					var __accu0__ = token_reader;
					return __call__ (__accu0__.move_to_token, __accu0__, tok, __kwargtrans__ ({rewind_pre_space: false}));
				}) ();
				stop_exc.pos_end = tok.pos;
				// pass;
				var __except0__ = stop_exc;
				__except0__.__cause__ = null;
				throw __except0__;
			}
		}
		if (__t__ (__eq__ (tok.tok, 'brace_close'))) {
			var exc = (function () {
				var __accu0__ = latex_walker;
				return __call__ (__accu0__.check_tolerant_parsing_ignore_error, __accu0__, __call__ (LatexWalkerNodesParseError, null, __kwargtrans__ ({msg: (function () {
					var __accu1__ = 'Unexpected mismatching closing delimiter ‘{}’';
					return __call__ (__accu1__.format, __accu1__, tok.arg);
				}) (), pos: tok.pos, recovery_past_token: tok, error_type_info: dict ({'what': 'nodes_unexpected_closing_group_delimiter', 'delimiter': tok.arg})})));
			}) ();
			if (__t__ (exc !== null)) {
				var __except0__ = exc;
				__except0__.__cause__ = null;
				throw __except0__;
			}
			return ;
		}
		if (__t__ (__eq__ (tok.tok, 'end_environment'))) {
			var exc = (function () {
				var __accu0__ = latex_walker;
				return __call__ (__accu0__.check_tolerant_parsing_ignore_error, __accu0__, __call__ (LatexWalkerNodesParseError, null, __kwargtrans__ ({msg: (function () {
					var __accu1__ = 'Unexpected closing environment: ‘{}’';
					return __call__ (__accu1__.format, __accu1__, tok.arg);
				}) (), pos: tok.pos, recovery_past_token: tok, error_type_info: dict ({'what': 'nodes_unexpected_end_environment', 'environmentname': tok.arg})})));
			}) ();
			if (__t__ (exc !== null)) {
				var __except0__ = exc;
				__except0__.__cause__ = null;
				throw __except0__;
			}
			return ;
		}
		if (__t__ (__t__ (__in__ (tok.tok, tuple (['mathmode_inline', 'mathmode_display']))) && !__in__ (tok.arg, self.parsing_state._math_delims_info_by_open))) {
			var exc = (function () {
				var __accu0__ = latex_walker;
				return __call__ (__accu0__.check_tolerant_parsing_ignore_error, __accu0__, __call__ (LatexWalkerNodesParseError, null, __kwargtrans__ ({msg: (function () {
					var __accu1__ = 'Unexpected closing math mode token ‘{}’';
					return __call__ (__accu1__.format, __accu1__, tok.arg);
				}) (), pos: tok.pos, recovery_past_token: tok, error_type_info: dict ({'what': 'nodes_unexpected_closing_math_delimiter', 'mathmode_type': tok.tok, 'delimiter': tok.arg})})));
			}) ();
			if (__t__ (exc !== null)) {
				var __except0__ = exc;
				__except0__.__cause__ = null;
				throw __except0__;
			}
			return ;
		}
		if (__t__ (__eq__ (tok.tok, 'comment'))) {
			(function () {
				var __accu0__ = self;
				return __call__ (__accu0__.parse_comment_node, __accu0__, tok);
			}) ();
			return ;
		}
		else if (__t__ (__eq__ (tok.tok, 'brace_open'))) {
			(function () {
				var __accu0__ = self;
				return __call__ (__accu0__.parse_latex_group, __accu0__, tok);
			}) ();
			return ;
		}
		else if (__t__ (__eq__ (tok.tok, 'macro'))) {
			(function () {
				var __accu0__ = self;
				return __call__ (__accu0__.parse_macro, __accu0__, tok);
			}) ();
			return ;
		}
		else if (__t__ (__eq__ (tok.tok, 'begin_environment'))) {
			(function () {
				var __accu0__ = self;
				return __call__ (__accu0__.parse_environment, __accu0__, tok);
			}) ();
			return ;
		}
		else if (__t__ (__eq__ (tok.tok, 'specials'))) {
			(function () {
				var __accu0__ = self;
				return __call__ (__accu0__.parse_specials, __accu0__, tok);
			}) ();
			return ;
		}
		else if (__t__ (__in__ (tok.tok, tuple (['mathmode_inline', 'mathmode_display'])))) {
			(function () {
				var __accu0__ = self;
				return __call__ (__accu0__.parse_math, __accu0__, tok);
			}) ();
			return ;
		}
		else {
			var __except0__ = __call__ (LatexWalkerParseError, null, (function () {
				var __accu0__ = 'Unknown token type: {}';
				return __call__ (__accu0__.format, __accu0__, tok.tok);
			}) (), __kwargtrans__ ({pos: tok.pos}));
			__except0__.__cause__ = null;
			throw __except0__;
		}
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
		if (__t__ (self._make_child_parsing_state_fn !== null)) {
			return (function () {
				var __accu0__ = self;
				return __call__ (__accu0__._make_child_parsing_state_fn, __accu0__, __kwargtrans__ ({parsing_state: parsing_state, node_class: node_class, token: token}));
			}) ();
		}
		return self.parsing_state;
	});},
	get parse_comment_node () {return __get__ (this, function (self, tok) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'tok': var tok = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var commentnode = (function () {
			var __accu0__ = self.latex_walker;
			return __call__ (__accu0__.make_node, __accu0__, LatexCommentNode, __kwargtrans__ ({parsing_state: self.parsing_state, comment: tok.arg, comment_post_space: tok.post_space, pos: tok.pos, pos_end: tok.pos_end}));
		}) ();
		var stop_exc = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.push_to_nodelist, __accu0__, commentnode);
		}) ();
		if (__t__ (stop_exc !== null)) {
			stop_exc.pos_end = tok.pos_end;
			// pass;
			var __except0__ = stop_exc;
			__except0__.__cause__ = null;
			throw __except0__;
		}
	});},
	get parse_latex_group () {return __get__ (this, function (self, tok) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'tok': var tok = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		// pass;
		(function () {
			var __accu0__ = self.token_reader;
			return __call__ (__accu0__.move_to_token, __accu0__, tok, __kwargtrans__ ({rewind_pre_space: false}));
		}) ();
		var group_parser = (function () {
			var __accu0__ = self.latex_walker;
			return __call__ (__accu0__.make_latex_group_parser, __accu0__, __kwargtrans__ ({delimiters: tok.arg}));
		}) ();
		var __left0__ = (function () {
			var __accu0__ = self.latex_walker;
			return __call__ (__accu0__.parse_content, __accu0__, group_parser, __kwargtrans__ ({token_reader: self.token_reader, parsing_state: (function () {
				var __accu1__ = self;
				return __call__ (__accu1__.make_child_parsing_state, __accu1__, self.parsing_state, LatexGroupNode, __kwargtrans__ ({token: tok}));
			}) ()}));
		}) ();
		var groupnode = __left0__ [0];
		var parsing_state_delta = __left0__ [1];
		if (__t__ (parsing_state_delta !== null)) {
			(function () {
				var __accu0__ = logger;
				return __call__ (__accu0__.warning, __accu0__, 'parsing_state_delta is ignored after parsing a LaTeX group: %r', parsing_state_delta);
			}) ();
		}
		var stop_exc = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.push_to_nodelist, __accu0__, groupnode);
		}) ();
		if (__t__ (stop_exc !== null)) {
			stop_exc.pos_end = groupnode.pos_end;
			// pass;
			var __except0__ = stop_exc;
			__except0__.__cause__ = null;
			throw __except0__;
		}
		// pass;
	});},
	get parse_macro () {return __get__ (this, function (self, tok) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'tok': var tok = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var macroname = tok.arg;
		var mspec = null;
		if (__t__ (self.parsing_state.latex_context !== null)) {
			var mspec = (function () {
				var __accu0__ = self.parsing_state.latex_context;
				return __call__ (__accu0__.get_macro_spec, __accu0__, macroname);
			}) ();
		}
		if (__t__ (mspec === null)) {
			var exc = (function () {
				var __accu0__ = self.latex_walker;
				return __call__ (__accu0__.check_tolerant_parsing_ignore_error, __accu0__, __call__ (LatexWalkerParseError, null, __kwargtrans__ ({msg: (function () {
					var __accu1__ = 'Encountered unknown macro ‘\\{}’';
					return __call__ (__accu1__.format, __accu1__, macroname);
				}) (), pos: tok.pos, error_type_info: dict ({'what': 'nodes_unknown_macro_name', 'macroname': macroname})})));
			}) ();
			if (__t__ (exc !== null)) {
				var __except0__ = exc;
				__except0__.__cause__ = null;
				throw __except0__;
			}
			var mspec = null;
		}
		var node_class = LatexMacroNode;
		var what = (function () {
			var __accu0__ = 'macro ‘\\{}’';
			return __call__ (__accu0__.format, __accu0__, macroname);
		}) ();
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.parse_invocable_token_type, __accu0__, tok, mspec, node_class, what);
		}) ();
	});},
	get parse_environment () {return __get__ (this, function (self, tok) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'tok': var tok = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var latex_walker = self.latex_walker;
		var environmentname = tok.arg;
		var envspec = null;
		if (__t__ (self.parsing_state.latex_context !== null)) {
			var envspec = (function () {
				var __accu0__ = self.parsing_state.latex_context;
				return __call__ (__accu0__.get_environment_spec, __accu0__, environmentname);
			}) ();
		}
		if (__t__ (envspec === null)) {
			var exc = (function () {
				var __accu0__ = latex_walker;
				return __call__ (__accu0__.check_tolerant_parsing_ignore_error, __accu0__, __call__ (LatexWalkerParseError, null, __kwargtrans__ ({msg: (function () {
					var __accu1__ = 'Encountered unknown environment ‘{}{}{}’';
					return __call__ (__accu1__.format, __accu1__, '{', environmentname, '}');
				}) (), pos: tok.pos, error_type_info: dict ({'what': 'nodes_unknown_environment_name', 'environmentname': environmentname})})));
			}) ();
			if (__t__ (exc !== null)) {
				var __except0__ = exc;
				__except0__.__cause__ = null;
				throw __except0__;
			}
			var envspec = null;
		}
		var node_class = LatexEnvironmentNode;
		var what = (function () {
			var __accu0__ = 'environment ‘{}{}{}’';
			return __call__ (__accu0__.format, __accu0__, '{', environmentname, '}');
		}) ();
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.parse_invocable_token_type, __accu0__, tok, envspec, node_class, what);
		}) ();
	});},
	get parse_specials () {return __get__ (this, function (self, tok) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'tok': var tok = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var specials_spec = tok.arg;
		var node_class = LatexSpecialsNode;
		var what = (function () {
			var __accu0__ = 'specials ‘{}’';
			return __call__ (__accu0__.format, __accu0__, (__t__ (__call__ (hasattr, null, specials_spec, 'specials_chars')) ? __call__ (getattr, null, specials_spec, 'specials_chars') : '<unkonwn>'));
		}) ();
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.parse_invocable_token_type, __accu0__, tok, specials_spec, node_class, what);
		}) ();
	});},
	get parse_invocable_token_type () {return __get__ (this, function (self, tok, spec, node_class, what) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'tok': var tok = __allkwargs0__ [__attrib0__]; break;
						case 'spec': var spec = __allkwargs0__ [__attrib0__]; break;
						case 'node_class': var node_class = __allkwargs0__ [__attrib0__]; break;
						case 'what': var what = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var latex_walker = self.latex_walker;
		var token_reader = self.token_reader;
		if (__t__ (spec !== null)) {
			var node_parser = (function () {
				var __accu0__ = spec;
				return __call__ (__accu0__.get_node_parser, __accu0__, tok, self.parsing_state);
			}) ();
		}
		else {
			var node_parser = null;
		}
		if (__t__ (node_parser === null)) {
			var exc = (function () {
				var __accu0__ = latex_walker;
				return __call__ (__accu0__.check_tolerant_parsing_ignore_error, __accu0__, __call__ (LatexWalkerParseError, null, __kwargtrans__ ({msg: (function () {
					var __accu1__ = 'No parser found for callable token {!r}';
					return __call__ (__accu1__.format, __accu1__, tok);
				}) (), pos: tok.pos})));
			}) ();
			if (__t__ (exc !== null)) {
				// pass;
				var __except0__ = exc;
				__except0__.__cause__ = null;
				throw __except0__;
			}
			var result_node = null;
			var parsing_state_delta = null;
		}
		else {
			var __left0__ = (function () {
				var __accu0__ = latex_walker;
				return __call__ (__accu0__.parse_content, __accu0__, node_parser, token_reader, (function () {
					var __accu1__ = self;
					return __call__ (__accu1__.make_child_parsing_state, __accu1__, self.parsing_state, node_class, tok);
				}) (), __kwargtrans__ ({open_context: tuple ([what, tok])}));
			}) ();
			var result_node = __left0__ [0];
			var parsing_state_delta = __left0__ [1];
		}
		(function () {
			var __accu0__ = self;
			return __call__ (__accu0__.update_state_from_parsing_state_delta, __accu0__, parsing_state_delta);
		}) ();
		if (__t__ (result_node === null)) {
			(function () {
				var __accu0__ = logger;
				return __call__ (__accu0__.warning, __accu0__, 'Parser %r produced no node (None) for token %r', node_parser, tok);
			}) ();
			return ;
		}
		var exc = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.push_to_nodelist, __accu0__, result_node);
		}) ();
		if (__t__ (exc !== null)) {
			exc.pos_end = result_node.pos_end;
			// pass;
			var __except0__ = exc;
			__except0__.__cause__ = null;
			throw __except0__;
		}
	});},
	get parse_math () {return __get__ (this, function (self, tok) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'tok': var tok = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		// pass;
		(function () {
			var __accu0__ = self.token_reader;
			return __call__ (__accu0__.move_to_token, __accu0__, tok, __kwargtrans__ ({rewind_pre_space: false}));
		}) ();
		var child_math_parsing_state = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.make_child_parsing_state, __accu0__, self.parsing_state, LatexMathNode, tok);
		}) ();
		// pass;
		var math_parser = (function () {
			var __accu0__ = self.latex_walker;
			return __call__ (__accu0__.make_latex_math_parser, __accu0__, __kwargtrans__ ({math_mode_delimiters: tok.arg}));
		}) ();
		var __left0__ = (function () {
			var __accu0__ = self.latex_walker;
			return __call__ (__accu0__.parse_content, __accu0__, math_parser, __kwargtrans__ ({token_reader: self.token_reader, parsing_state: child_math_parsing_state}));
		}) ();
		var mathnode = __left0__ [0];
		var parsing_state_delta = __left0__ [1];
		(function () {
			var __accu0__ = self;
			return __call__ (__accu0__.update_state_from_parsing_state_delta, __accu0__, parsing_state_delta);
		}) ();
		if (__t__ (mathnode === null)) {
			(function () {
				var __accu0__ = logger;
				return __call__ (__accu0__.warning, __accu0__, 'Math parser produced no node (None) for token %r', tok);
			}) ();
			return ;
		}
		var stop_exc = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.push_to_nodelist, __accu0__, mathnode);
		}) ();
		if (__t__ (stop_exc !== null)) {
			stop_exc.pos_end = mathnode.pos_end;
			// pass;
			var __except0__ = stop_exc;
			__except0__.__cause__ = null;
			throw __except0__;
		}
	});}
});

