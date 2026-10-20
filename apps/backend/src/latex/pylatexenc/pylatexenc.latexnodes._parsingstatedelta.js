var logging = {};
import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import * as __module_logging__ from './logging.js';
__nest__ (logging, '', __module_logging__);
var __name__ = 'pylatexenc.latexnodes._parsingstatedelta';
export var logger = (function () {
	var __accu0__ = logging;
	return __call__ (__accu0__.getLogger, __accu0__, __name__);
}) ();
export var ParsingStateDelta =  __class__ ('ParsingStateDelta', [object], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, set_attributes, _fields) {
		if (typeof set_attributes == 'undefined' || (set_attributes != null && set_attributes.hasOwnProperty ("__kwargtrans__"))) {;
			var set_attributes = null;
		};
		if (typeof _fields == 'undefined' || (_fields != null && _fields.hasOwnProperty ("__kwargtrans__"))) {;
			var _fields = null;
		};
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'set_attributes': var set_attributes = __allkwargs0__ [__attrib0__]; break;
						case '_fields': var _fields = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, ParsingStateDelta, '__init__'), null, self, __kwargtrans__ (kwargs));
		self.set_attributes = (__t__ (set_attributes) ? __call__ (dict, null, set_attributes) : null);
		self._fields = (__t__ (_fields !== null) ? _fields : tuple (['set_attributes']));
	});},
	get __repr__ () {return __get__ (this, function (self) {
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
		return __add__ (__add__ (__add__ (self.__class__.__name__, '('), (function () {
			var __accu0__ = ', ';
			return __call__ (__accu0__.join, __accu0__, (function () {
				var __accu1__ = [];
				var __iterable0__ = self._fields;
				for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
					var k = __getitem__ (__iterable0__, __index0__);
					(function () {
						var __accu2__ = __accu1__;
						return __call__ (__accu2__.append, __accu2__, (function () {
							var __accu3__ = '{}={!r}';
							return __call__ (__accu3__.format, __accu3__, k, (__t__ (__call__ (hasattr, null, self, k)) ? __call__ (getattr, null, self, k) : '<??>'));
						}) ());
					}) ();
				}
				return __accu1__;
			}) ());
		}) ()), ')');
	});},
	get get_updated_parsing_state () {return __get__ (this, function (self, parsing_state, latex_walker) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (self.set_attributes)) {
			return (function () {
				var __accu0__ = parsing_state;
				return __call__ (__accu0__.sub_context, __accu0__, __kwargtrans__ (self.set_attributes));
			}) ();
		}
		return parsing_state;
	});}
});
export var ParsingStateDeltaReplaceParsingState =  __class__ ('ParsingStateDeltaReplaceParsingState', [ParsingStateDelta], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, set_parsing_state) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'set_parsing_state': var set_parsing_state = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, ParsingStateDeltaReplaceParsingState, '__init__'), null, self, __kwargtrans__ (__mergekwargtrans__ ({_fields: tuple (['set_parsing_state'])}, kwargs)));
		self.set_parsing_state = set_parsing_state;
	});},
	get get_updated_parsing_state () {return __get__ (this, function (self, parsing_state, latex_walker) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (self.set_parsing_state !== null)) {
			return self.set_parsing_state;
		}
		return parsing_state;
	});}
});
export var ParsingStateDeltaChained =  __class__ ('ParsingStateDeltaChained', [ParsingStateDelta], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, parsing_state_deltas) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state_deltas': var parsing_state_deltas = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, ParsingStateDeltaChained, '__init__'), null, self, __kwargtrans__ (__mergekwargtrans__ ({_fields: tuple (['parsing_state_deltas'])}, kwargs)));
		self.parsing_state_deltas = parsing_state_deltas;
	});},
	get get_updated_parsing_state () {return __get__ (this, function (self, parsing_state, latex_walker) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var ps = parsing_state;
		var __iterable0__ = self.parsing_state_deltas;
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var delta = __getitem__ (__iterable0__, __index0__);
			if (__t__ (delta !== null)) {
				var ps = (function () {
					var __accu0__ = delta;
					return __call__ (__accu0__.get_updated_parsing_state, __accu0__, ps, latex_walker);
				}) ();
			}
		}
		return ps;
	});}
});
export var ParsingStateDeltaWalkerEvent =  __class__ ('ParsingStateDeltaWalkerEvent', [ParsingStateDelta], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, walker_event_name, walker_event_kwargs) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'walker_event_name': var walker_event_name = __allkwargs0__ [__attrib0__]; break;
						case 'walker_event_kwargs': var walker_event_kwargs = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, ParsingStateDeltaWalkerEvent, '__init__'), null, self, __kwargtrans__ ({_fields: tuple (['walker_event_name', 'walker_event_kwargs'])}));
		self.walker_event_name = walker_event_name;
		self.walker_event_kwargs = walker_event_kwargs;
	});},
	get get_updated_parsing_state () {return __get__ (this, function (self, parsing_state, latex_walker) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var handler = (function () {
			var __accu0__ = latex_walker;
			return __call__ (__accu0__.parsing_state_event_handler, __accu0__);
		}) ();
		var handler_fn = __call__ (getattr, null, handler, self.walker_event_name);
		var parsing_state_delta = __call__ (handler_fn, null, __kwargtrans__ (self.walker_event_kwargs));
		return __call__ (get_updated_parsing_state_from_delta, null, parsing_state, parsing_state_delta, latex_walker);
	});}
});
export var ParsingStateDeltaEnterMathMode =  __class__ ('ParsingStateDeltaEnterMathMode', [ParsingStateDeltaWalkerEvent], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, math_mode_delimiter, trigger_token) {
		if (typeof math_mode_delimiter == 'undefined' || (math_mode_delimiter != null && math_mode_delimiter.hasOwnProperty ("__kwargtrans__"))) {;
			var math_mode_delimiter = null;
		};
		if (typeof trigger_token == 'undefined' || (trigger_token != null && trigger_token.hasOwnProperty ("__kwargtrans__"))) {;
			var trigger_token = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'math_mode_delimiter': var math_mode_delimiter = __allkwargs0__ [__attrib0__]; break;
						case 'trigger_token': var trigger_token = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, ParsingStateDeltaEnterMathMode, '__init__'), null, self, __kwargtrans__ ({walker_event_name: 'enter_math_mode', walker_event_kwargs: __call__ (dict, null, __kwargtrans__ ({math_mode_delimiter: math_mode_delimiter, trigger_token: trigger_token}))}));
	});}
});
export var ParsingStateDeltaLeaveMathMode =  __class__ ('ParsingStateDeltaLeaveMathMode', [ParsingStateDeltaWalkerEvent], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, trigger_token) {
		if (typeof trigger_token == 'undefined' || (trigger_token != null && trigger_token.hasOwnProperty ("__kwargtrans__"))) {;
			var trigger_token = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'trigger_token': var trigger_token = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, ParsingStateDeltaLeaveMathMode, '__init__'), null, self, __kwargtrans__ ({walker_event_name: 'leave_math_mode', walker_event_kwargs: __call__ (dict, null, __kwargtrans__ ({trigger_token: trigger_token}))}));
	});}
});
export var get_updated_parsing_state_from_delta = function (parsing_state, parsing_state_delta, latex_walker) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
					case 'parsing_state_delta': var parsing_state_delta = __allkwargs0__ [__attrib0__]; break;
					case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	if (__t__ (parsing_state_delta === null)) {
		return parsing_state;
	}
	return (function () {
		var __accu0__ = parsing_state_delta;
		return __call__ (__accu0__.get_updated_parsing_state, __accu0__, parsing_state, latex_walker);
	}) ();
};

