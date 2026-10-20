var logging = {};
import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import * as __module_logging__ from './logging.js';
__nest__ (logging, '', __module_logging__);
var __name__ = 'pylatexenc.latexnodes._exctypes';
export var logger = (function () {
	var __accu0__ = logging;
	return __call__ (__accu0__.getLogger, __accu0__, __name__);
}) ();
export var __all__ = ['LatexWalkerError', 'LatexWalkerLocatedError', 'LatexWalkerParseError', 'LatexWalkerLocatedErrorFormatter', 'LatexWalkerNodesParseError', 'LatexWalkerTokenParseError', 'LatexWalkerEndOfStream'];
export var LatexWalkerError =  __class__ ('LatexWalkerError', [Exception], {
	__module__: __name__,
});
export var LatexWalkerLocatedError =  __class__ ('LatexWalkerLocatedError', [LatexWalkerError], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, msg, s, pos, lineno, colno, error_type_info) {
		if (typeof s == 'undefined' || (s != null && s.hasOwnProperty ("__kwargtrans__"))) {;
			var s = null;
		};
		if (typeof pos == 'undefined' || (pos != null && pos.hasOwnProperty ("__kwargtrans__"))) {;
			var pos = null;
		};
		if (typeof lineno == 'undefined' || (lineno != null && lineno.hasOwnProperty ("__kwargtrans__"))) {;
			var lineno = null;
		};
		if (typeof colno == 'undefined' || (colno != null && colno.hasOwnProperty ("__kwargtrans__"))) {;
			var colno = null;
		};
		if (typeof error_type_info == 'undefined' || (error_type_info != null && error_type_info.hasOwnProperty ("__kwargtrans__"))) {;
			var error_type_info = null;
		};
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'msg': var msg = __allkwargs0__ [__attrib0__]; break;
						case 's': var s = __allkwargs0__ [__attrib0__]; break;
						case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
						case 'lineno': var lineno = __allkwargs0__ [__attrib0__]; break;
						case 'colno': var colno = __allkwargs0__ [__attrib0__]; break;
						case 'error_type_info': var error_type_info = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		self.input_source = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'input_source', null);
		}) ();
		self.msg = msg;
		self.s = s;
		self.pos = pos;
		self.lineno = lineno;
		self.colno = colno;
		self.error_type_info = error_type_info;
		self.open_contexts = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'open_contexts', []);
		}) ();
		if (__t__ (__call__ (len, null, kwargs))) {
			var __except0__ = __call__ (ValueError, null, __add__ ('Unexpected keyword argument(s) to LatexWalkerLocatedError(): ', __call__ (repr, null, kwargs)));
			__except0__.__cause__ = null;
			throw __except0__;
		}
		__call__ (__call__ (__super__, null, LatexWalkerLocatedError, '__init__'), null, self, (function () {
			var __accu0__ = __call__ (LatexWalkerLocatedErrorFormatter, null, self);
			return __call__ (__accu0__.to_display_string, __accu0__);
		}) ());
	});},
	get __str__ () {return __get__ (this, function (self) {
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
		return (function () {
			var __accu0__ = __call__ (LatexWalkerLocatedErrorFormatter, null, self);
			return __call__ (__accu0__.to_display_string, __accu0__);
		}) ();
	});},
	get set_pos_or_add_open_context_from_node () {return __get__ (this, function (self, node, what) {
		if (typeof what == 'undefined' || (what != null && what.hasOwnProperty ("__kwargtrans__"))) {;
			var what = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'node': var node = __allkwargs0__ [__attrib0__]; break;
						case 'what': var what = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (node === null)) {
			return ;
		}
		var pos = node.pos;
		if (__t__ (__t__ (__call__ (hasattr, null, node, 'latex_walker')) && __t__ (node.latex_walker) && __call__ (hasattr, null, node.latex_walker, 'pos_to_lineno_colno'))) {
			var __left0__ = (function () {
				var __accu0__ = node.latex_walker;
				return __call__ (__accu0__.pos_to_lineno_colno, __accu0__, pos);
			}) ();
			var lineno = __left0__ [0];
			var colno = __left0__ [1];
		}
		else {
			var __left0__ = tuple ([null, null]);
			var lineno = __left0__ [0];
			var colno = __left0__ [1];
		}
		if (__t__ (what === null)) {
			var what = (function () {
				var __accu0__ = node;
				return __call__ (__accu0__.display_str, __accu0__);
			}) ();
		}
		if (__t__ (self.pos === null)) {
			self.pos = pos;
			self.lineno = lineno;
			self.colno = colno;
			return ;
		}
		if (__t__ (self.open_contexts === null)) {
			self.open_contexts = [];
		}
		(function () {
			var __accu0__ = self.open_contexts;
			return __call__ (__accu0__.append, __accu0__, tuple ([what, pos, lineno, colno]));
		}) ();
	});}
});
export var LatexWalkerParseError =  __class__ ('LatexWalkerParseError', [LatexWalkerLocatedError], {
	__module__: __name__,
});
export var LatexWalkerLocatedErrorFormatter =  __class__ ('LatexWalkerLocatedErrorFormatter', [object], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, exc) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'exc': var exc = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, LatexWalkerLocatedErrorFormatter, '__init__'), null, self);
		self.exc = exc;
	});},
	get format_open_blocks () {return __get__ (this, function (self) {
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
		var exc = self.exc;
		if (__t__ (!__t__ ((exc.open_contexts)))) {
			return null;
		}
		var disp = '';
		var __iterable0__ = __call__ (py_reversed, null, exc.open_contexts);
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var context = __getitem__ (__iterable0__, __index0__);
			var __left0__ = context;
			var what = __left0__ [0];
			var pos = __left0__ [1];
			var lineno = __left0__ [2];
			var colno = __left0__ [3];
			var disp = __call__ (__iadd__, null, disp, (function () {
				var __accu0__ = '{empty:4}{loc:<18}  {what}\n';
				return __call__ (__accu0__.format, __accu0__, __kwargtrans__ ({empty: '', loc: __call__ (format_pos, null, pos, lineno, colno), what: what}));
			}) ());
		}
		return disp;
	});},
	get format_pos () {return __get__ (this, function (self) {
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
		return __call__ (format_pos, null, self.exc.pos, self.exc.lineno, self.exc.colno);
	});},
	get format_full_traceback () {return __get__ (this, function (self) {
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
		var exc = self.exc;
		var msg = '';
		if (__t__ (exc.input_source)) {
			var msg = __call__ (__iadd__, null, msg, (function () {
				var __accu0__ = '  in {}';
				return __call__ (__accu0__.format, __accu0__, exc.input_source);
			}) ());
		}
		var msg = __call__ (__iadd__, null, msg, (function () {
			var __accu0__ = ' {}';
			return __call__ (__accu0__.format, __accu0__, (function () {
				var __accu1__ = self;
				return __call__ (__accu1__.format_pos, __accu1__);
			}) ());
		}) ());
		if (__t__ (exc.open_contexts)) {
			var msg = __call__ (__iadd__, null, msg, '\nOpen LaTeX blocks:\n');
			var msg = __call__ (__iadd__, null, msg, (function () {
				var __accu0__ = self;
				return __call__ (__accu0__.format_open_blocks, __accu0__);
			}) ());
		}
		return msg;
	});},
	get to_display_string () {return __get__ (this, function (self) {
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
		var exc = self.exc;
		var msg = __call__ (str, null, exc.msg);
		var msg = __call__ (__iadd__, null, msg, (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.format_full_traceback, __accu0__);
		}) ());
		return msg;
	});}
});
export var format_pos = function (pos, lineno, colno) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
					case 'lineno': var lineno = __allkwargs0__ [__attrib0__]; break;
					case 'colno': var colno = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	if (__t__ (lineno !== null)) {
		if (__t__ (colno !== null)) {
			return (function () {
				var __accu0__ = '@ (line {}, col {})';
				return __call__ (__accu0__.format, __accu0__, lineno, colno);
			}) ();
		}
		if (__t__ (__call__ (isinstance, null, lineno, str))) {
			return __add__ ('@ ', lineno);
		}
		return (function () {
			var __accu0__ = '@ line {}';
			return __call__ (__accu0__.format, __accu0__, lineno);
		}) ();
	}
	if (__t__ (__call__ (isinstance, null, pos, str))) {
		return __add__ ('@ ', pos);
	}
	if (__t__ (pos !== null)) {
		return (function () {
			var __accu0__ = '@ char pos {}';
			return __call__ (__accu0__.format, __accu0__, pos);
		}) ();
	}
	return '@ <unknown>';
};
export var LatexWalkerTokenParseError =  __class__ ('LatexWalkerTokenParseError', [LatexWalkerParseError], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, recovery_token_placeholder, recovery_token_at_pos) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'recovery_token_placeholder': var recovery_token_placeholder = __allkwargs0__ [__attrib0__]; break;
						case 'recovery_token_at_pos': var recovery_token_at_pos = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, LatexWalkerTokenParseError, '__init__'), null, self, __kwargtrans__ (kwargs));
		self.recovery_token_placeholder = recovery_token_placeholder;
		self.recovery_token_at_pos = recovery_token_at_pos;
	});}
});
export var LatexWalkerNodesParseError =  __class__ ('LatexWalkerNodesParseError', [LatexWalkerParseError], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, recovery_nodes, recovery_parsing_state_delta, recovery_at_token, recovery_past_token) {
		if (typeof recovery_nodes == 'undefined' || (recovery_nodes != null && recovery_nodes.hasOwnProperty ("__kwargtrans__"))) {;
			var recovery_nodes = null;
		};
		if (typeof recovery_parsing_state_delta == 'undefined' || (recovery_parsing_state_delta != null && recovery_parsing_state_delta.hasOwnProperty ("__kwargtrans__"))) {;
			var recovery_parsing_state_delta = null;
		};
		if (typeof recovery_at_token == 'undefined' || (recovery_at_token != null && recovery_at_token.hasOwnProperty ("__kwargtrans__"))) {;
			var recovery_at_token = null;
		};
		if (typeof recovery_past_token == 'undefined' || (recovery_past_token != null && recovery_past_token.hasOwnProperty ("__kwargtrans__"))) {;
			var recovery_past_token = null;
		};
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'recovery_nodes': var recovery_nodes = __allkwargs0__ [__attrib0__]; break;
						case 'recovery_parsing_state_delta': var recovery_parsing_state_delta = __allkwargs0__ [__attrib0__]; break;
						case 'recovery_at_token': var recovery_at_token = __allkwargs0__ [__attrib0__]; break;
						case 'recovery_past_token': var recovery_past_token = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, LatexWalkerNodesParseError, '__init__'), null, self, __kwargtrans__ (kwargs));
		self.recovery_nodes = recovery_nodes;
		self.recovery_parsing_state_delta = recovery_parsing_state_delta;
		self.recovery_at_token = recovery_at_token;
		self.recovery_past_token = recovery_past_token;
	});}
});
export var LatexWalkerEndOfStream =  __class__ ('LatexWalkerEndOfStream', [LatexWalkerError], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, final_space) {
		if (typeof final_space == 'undefined' || (final_space != null && final_space.hasOwnProperty ("__kwargtrans__"))) {;
			var final_space = '';
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'final_space': var final_space = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, LatexWalkerEndOfStream, '__init__'), null, self);
		self.final_space = final_space;
	});}
});

