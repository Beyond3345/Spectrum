var logging = {};
import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import {ParsedArguments} from './pylatexenc.latexnodes._parsedargs.js';
import {LatexWalkerParseError} from './pylatexenc.latexnodes._exctypes.js';
import * as __module_logging__ from './logging.js';
__nest__ (logging, '', __module_logging__);
export {LatexWalkerParseError, ParsedArguments};
var __name__ = 'pylatexenc.latexnodes.nodes';
export var logger = (function () {
	var __accu0__ = logging;
	return __call__ (__accu0__.getLogger, __accu0__, __name__);
}) ();
export var _display_abbrev_str = function (s, maxlen) {
	if (typeof maxlen == 'undefined' || (maxlen != null && maxlen.hasOwnProperty ("__kwargtrans__"))) {;
		var maxlen = 40;
	};
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 's': var s = __allkwargs0__ [__attrib0__]; break;
					case 'maxlen': var maxlen = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var s = __call__ (str, null, s);
	if (__t__ (__t__ (!__t__ ((maxlen))) || __lt__ (maxlen, 2))) {
		var maxlen = 2;
	}
	if (__t__ (__lt__ (__call__ (len, null, s), maxlen))) {
		return s;
	}
	return __add__ (__getslice__ (s, 0, __sub__ (maxlen, 2), 1), '…');
};
export var _display_str_delimiters = function (delimiters) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'delimiters': var delimiters = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var open_delim = '<??>';
	var close_delim = '<??>';
	try {
		var __left0__ = delimiters;
		var open_delim = __left0__ [0];
		var close_delim = __left0__ [1];
	}
	catch (__except0__) {
		// pass;
	}
	if (__t__ (open_delim === null)) {
		var open_delim = '';
	}
	if (__t__ (close_delim === null)) {
		var close_delim = '';
	}
	return tuple ([__call__ (str, null, open_delim), __call__ (str, null, close_delim)]);
};
export var LatexNode =  __class__ ('LatexNode', [object], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, _fields, _redundant_fields, parsing_state, pos, pos_end, latex_walker) {
		if (typeof _redundant_fields == 'undefined' || (_redundant_fields != null && _redundant_fields.hasOwnProperty ("__kwargtrans__"))) {;
			var _redundant_fields = null;
		};
		if (typeof parsing_state == 'undefined' || (parsing_state != null && parsing_state.hasOwnProperty ("__kwargtrans__"))) {;
			var parsing_state = null;
		};
		if (typeof pos == 'undefined' || (pos != null && pos.hasOwnProperty ("__kwargtrans__"))) {;
			var pos = null;
		};
		if (typeof pos_end == 'undefined' || (pos_end != null && pos_end.hasOwnProperty ("__kwargtrans__"))) {;
			var pos_end = null;
		};
		if (typeof latex_walker == 'undefined' || (latex_walker != null && latex_walker.hasOwnProperty ("__kwargtrans__"))) {;
			var latex_walker = null;
		};
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case '_fields': var _fields = __allkwargs0__ [__attrib0__]; break;
						case '_redundant_fields': var _redundant_fields = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
						case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
						case 'pos_end': var pos_end = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		var len_ = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'len', null);
		}) ();
		__call__ (__call__ (__super__, null, LatexNode, '__init__'), null, self, __kwargtrans__ (kwargs));
		self.parsing_state = parsing_state;
		self.latex_walker = latex_walker;
		self.pos = pos;
		self.pos_end = pos_end;
		if (__t__ (__t__ (pos_end === null) && len_ !== null)) {
			self.pos_end = __add__ (self.pos, len_);
		}
		self._fields = __call__ (tuple, null, __add__ (['pos', 'pos_end', 'parsing_state', 'latex_walker'], __call__ (list, null, _fields)));
		if (__t__ (_redundant_fields !== null)) {
			self._redundant_fields = __call__ (tuple, null, __add__ (__add__ (__call__ (list, null, self._fields), ['len']), __call__ (list, null, _redundant_fields)));
		}
		else {
			self._redundant_fields = __call__ (tuple, null, __add__ (__call__ (list, null, self._fields), ['len']));
		}
	});},
	get nodeType () {return __get__ (this, function (self) {
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
		return LatexNode;
	});},
	get isNodeType () {return __get__ (this, function (self, t) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 't': var t = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return __call__ (isinstance, null, self, t);
	});},
	get _get_len () {return __get__ (this, function (self) {
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
		if (__t__ (__t__ (self.pos === null) || self.pos_end === null)) {
			return null;
		}
		return __sub__ (self.pos_end, self.pos);
	});},
	get latex_verbatim () {return __get__ (this, function (self) {
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
		if (__t__ (self.latex_walker === null)) {
			var __except0__ = __call__ (py_TypeError, null, "Can't use latex_verbatim() on node because we don't have any latex_walker set");
			__except0__.__cause__ = null;
			throw __except0__;
		}
		return __getslice__ (self.latex_walker.s, self.pos, self.pos_end, 1);
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
		return __t__ (other !== null) && __t__ (__call__ (isinstance, null, other, LatexNode)) && __t__ ((function () {
			var __accu0__ = self;
			return __call__ (__accu0__.nodeType, __accu0__);
		}) () === (function () {
			var __accu0__ = other;
			return __call__ (__accu0__.nodeType, __accu0__);
		}) ()) && __t__ (other.parsing_state === self.parsing_state) && __t__ (other.latex_walker === self.latex_walker) && __t__ ((__t__ (__t__ (other.pos === null) && self.pos === null) || __eq__ (other.pos, self.pos))) && __t__ ((__t__ (__t__ (other.pos_end === null) && self.pos_end === null) || __eq__ (other.pos_end, self.pos_end))) && __call__ (all, null, (function () {
			var __accu0__ = [];
			var __iterable0__ = self._fields;
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var f = __getitem__ (__iterable0__, __index0__);
				(function () {
					var __accu1__ = __accu0__;
					return __call__ (__accu1__.append, __accu1__, __t__ (__t__ (__call__ (getattr, null, self, f) === null) && __call__ (getattr, null, other, f) === null) || __eq__ (__call__ (getattr, null, self, f), __call__ (getattr, null, other, f)));
				}) ();
			}
			return py_iter (__accu0__);
		}) ());
	});},
	get __ne__ () {return __get__ (this, function (self, other) {
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
		return NotImplemented;
	});},
	__hash__: null,
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
			var __accu0__ = self;
			return __call__ (__accu0__.__repr__, __accu0__);
		}) ();
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
		return __add__ (__add__ (__add__ ((function () {
			var __accu0__ = self;
			return __call__ (__accu0__.nodeType, __accu0__);
		}) ().__name__, '('), (function () {
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
							return __call__ (__accu3__.format, __accu3__, k, __call__ (getattr, null, self, k));
						}) ());
					}) ();
				}
				return __accu1__;
			}) ());
		}) ()), ')');
	});},
	get display_str () {return __get__ (this, function (self) {
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
		return __add__ ('<UNKNOWN NODE TYPE>: ', __call__ (repr, null, self));
	});},
	get accept_node_visitor () {return __get__ (this, function (self, visitor) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'visitor': var visitor = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return (function () {
			var __accu0__ = visitor;
			return __call__ (__accu0__.node_standard_process_unknown, __accu0__, self);
		}) ();
	});},
	get to_json_object_with_latexwalker () {return __get__ (this, function (self, latexwalker) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'latexwalker': var latexwalker = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var d = dict ({'nodetype': self.__class__.__name__});
		var __iterable0__ = self._fields;
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var fld = __getitem__ (__iterable0__, __index0__);
			if (__t__ (__eq__ (fld, 'spec'))) {
				__setitem__ (d, fld, __call__ (repr, null, self.spec));
			}
			else if (__t__ (__eq__ (fld, 'latex_walker'))) {
				// pass;
			}
			else {
				__setitem__ (d, fld, __call__ (getattr, null, self, fld));
			}
		}
		(function () {
			var __accu0__ = d;
			return __call__ (__accu0__.py_update, __accu0__, (function () {
				var __accu1__ = latexwalker;
				return __call__ (__accu1__.pos_to_lineno_colno, __accu1__, self.pos, __kwargtrans__ ({as_dict: true}));
			}) ());
		}) ();
		return d;
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
		if (__t__ (self.latex_walker !== null)) {
			return (function () {
				var __accu0__ = self.latex_walker;
				return __call__ (__accu0__.format_pos, __accu0__, self.pos);
			}) ();
		}
		return (function () {
			var __accu0__ = '[@ pos {}]';
			return __call__ (__accu0__.format, __accu0__, __call__ (repr, null, self.pos));
		}) ();
	});}
});
Object.defineProperty (LatexNode, 'len', property.call (LatexNode, LatexNode._get_len));;
export var LatexCharsNode =  __class__ ('LatexCharsNode', [LatexNode], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, chars) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'chars': var chars = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, LatexCharsNode, '__init__'), null, self, __kwargtrans__ (__mergekwargtrans__ ({_fields: tuple (['chars'])}, kwargs)));
		self.chars = chars;
	});},
	get nodeType () {return __get__ (this, function (self) {
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
		return LatexCharsNode;
	});},
	get display_str () {return __get__ (this, function (self) {
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
		return __add__ (__add__ ('chars ‘', __call__ (_display_abbrev_str, null, self.chars)), '’');
	});},
	get accept_node_visitor () {return __get__ (this, function (self, visitor) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'visitor': var visitor = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return (function () {
			var __accu0__ = visitor;
			return __call__ (__accu0__.node_standard_process_chars, __accu0__, self);
		}) ();
	});}
});
export var LatexGroupNode =  __class__ ('LatexGroupNode', [LatexNode], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, nodelist) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'nodelist': var nodelist = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		var delimiters = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'delimiters', tuple (['{', '}']));
		}) ();
		__call__ (__call__ (__super__, null, LatexGroupNode, '__init__'), null, self, __kwargtrans__ (__mergekwargtrans__ ({_fields: tuple (['nodelist', 'delimiters'])}, kwargs)));
		self.nodelist = nodelist;
		self.delimiters = delimiters;
	});},
	get nodeType () {return __get__ (this, function (self) {
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
		return LatexGroupNode;
	});},
	get display_str () {return __get__ (this, function (self) {
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
		var __left0__ = __call__ (_display_str_delimiters, null, self.delimiters);
		var open_delim = __left0__ [0];
		var close_delim = __left0__ [1];
		return __add__ (__add__ (__add__ (__add__ ('group ‘', __call__ (str, null, open_delim)), '…'), __call__ (str, null, close_delim)), '’');
	});},
	get accept_node_visitor () {return __get__ (this, function (self, visitor) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'visitor': var visitor = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return (function () {
			var __accu0__ = visitor;
			return __call__ (__accu0__.node_standard_process_group, __accu0__, self);
		}) ();
	});}
});
export var LatexCommentNode =  __class__ ('LatexCommentNode', [LatexNode], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, comment) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'comment': var comment = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		var comment_post_space = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'comment_post_space', '');
		}) ();
		__call__ (__call__ (__super__, null, LatexCommentNode, '__init__'), null, self, __kwargtrans__ (__mergekwargtrans__ ({_fields: tuple (['comment', 'comment_post_space'])}, kwargs)));
		self.comment = comment;
		self.comment_post_space = comment_post_space;
	});},
	get nodeType () {return __get__ (this, function (self) {
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
		return LatexCommentNode;
	});},
	get display_str () {return __get__ (this, function (self) {
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
		return __add__ (__add__ ('comment ‘', __call__ (_display_abbrev_str, null, (function () {
			var __accu0__ = self.comment;
			return __call__ (__accu0__.strip, __accu0__);
		}) ())), '’');
	});},
	get accept_node_visitor () {return __get__ (this, function (self, visitor) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'visitor': var visitor = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return (function () {
			var __accu0__ = visitor;
			return __call__ (__accu0__.node_standard_process_comment, __accu0__, self);
		}) ();
	});}
});
export var LatexMacroNode =  __class__ ('LatexMacroNode', [LatexNode], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, macroname) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'macroname': var macroname = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		var nodeargd = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'nodeargd', __call__ (ParsedArguments, null));
		}) ();
		var macro_post_space = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'macro_post_space', '');
		}) ();
		var spec = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'spec', null);
		}) ();
		__call__ (__call__ (__super__, null, LatexMacroNode, '__init__'), null, self, __kwargtrans__ (__mergekwargtrans__ ({_fields: tuple (['macroname', 'spec', 'nodeargd', 'macro_post_space']), _redundant_fields: tuple (['nodeoptarg', 'nodeargs'])}, kwargs)));
		self.macroname = macroname;
		self.spec = spec;
		self.nodeargd = nodeargd;
		self.macro_post_space = macro_post_space;
	});},
	get nodeType () {return __get__ (this, function (self) {
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
		return LatexMacroNode;
	});},
	get display_str () {return __get__ (this, function (self) {
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
		return __add__ (__add__ ('macro ‘\\', __call__ (str, null, __t__ (self.macroname) || '??')), '’');
	});},
	get accept_node_visitor () {return __get__ (this, function (self, visitor) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'visitor': var visitor = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return (function () {
			var __accu0__ = visitor;
			return __call__ (__accu0__.node_standard_process_macro, __accu0__, self);
		}) ();
	});}
});
export var LatexEnvironmentNode =  __class__ ('LatexEnvironmentNode', [LatexNode], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, environmentname, nodelist) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'environmentname': var environmentname = __allkwargs0__ [__attrib0__]; break;
						case 'nodelist': var nodelist = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		var nodeargd = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'nodeargd', __call__ (ParsedArguments, null));
		}) ();
		var spec = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'spec', null);
		}) ();
		__call__ (__call__ (__super__, null, LatexEnvironmentNode, '__init__'), null, self, __kwargtrans__ (__mergekwargtrans__ ({_fields: tuple (['environmentname', 'spec', 'nodelist', 'nodeargd']), _redundant_fields: tuple (['envname', 'optargs', 'args'])}, kwargs)));
		self.environmentname = environmentname;
		self.spec = spec;
		self.nodelist = nodelist;
		self.nodeargd = nodeargd;
	});},
	get nodeType () {return __get__ (this, function (self) {
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
		return LatexEnvironmentNode;
	});},
	get display_str () {return __get__ (this, function (self) {
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
		return __add__ (__add__ ('environment ‘{', __call__ (str, null, self.environmentname)), '}’');
	});},
	get accept_node_visitor () {return __get__ (this, function (self, visitor) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'visitor': var visitor = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return (function () {
			var __accu0__ = visitor;
			return __call__ (__accu0__.node_standard_process_environment, __accu0__, self);
		}) ();
	});}
});
export var LatexSpecialsNode =  __class__ ('LatexSpecialsNode', [LatexNode], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, specials_chars) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'specials_chars': var specials_chars = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		var spec = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'spec', null);
		}) ();
		var nodeargd = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'nodeargd', null);
		}) ();
		__call__ (__call__ (__super__, null, LatexSpecialsNode, '__init__'), null, self, __kwargtrans__ (__mergekwargtrans__ ({_fields: tuple (['specials_chars', 'spec', 'nodeargd'])}, kwargs)));
		self.specials_chars = specials_chars;
		self.spec = spec;
		self.nodeargd = nodeargd;
	});},
	get nodeType () {return __get__ (this, function (self) {
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
		return LatexSpecialsNode;
	});},
	get display_str () {return __get__ (this, function (self) {
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
		return __add__ (__add__ ('specials ‘', __call__ (str, null, self.specials_chars)), '’');
	});},
	get accept_node_visitor () {return __get__ (this, function (self, visitor) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'visitor': var visitor = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return (function () {
			var __accu0__ = visitor;
			return __call__ (__accu0__.node_standard_process_specials, __accu0__, self);
		}) ();
	});}
});
export var LatexMathNode =  __class__ ('LatexMathNode', [LatexNode], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, displaytype, nodelist) {
		if (typeof nodelist == 'undefined' || (nodelist != null && nodelist.hasOwnProperty ("__kwargtrans__"))) {;
			var nodelist = [];
		};
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'displaytype': var displaytype = __allkwargs0__ [__attrib0__]; break;
						case 'nodelist': var nodelist = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		var delimiters = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'delimiters', tuple ([null, null]));
		}) ();
		__call__ (__call__ (__super__, null, LatexMathNode, '__init__'), null, self, __kwargtrans__ (__mergekwargtrans__ ({_fields: tuple (['displaytype', 'nodelist', 'delimiters'])}, kwargs)));
		self.displaytype = displaytype;
		self.nodelist = nodelist;
		self.delimiters = delimiters;
	});},
	get nodeType () {return __get__ (this, function (self) {
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
		return LatexMathNode;
	});},
	get display_str () {return __get__ (this, function (self) {
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
		var __left0__ = __call__ (_display_str_delimiters, null, self.delimiters);
		var open_delim = __left0__ [0];
		var close_delim = __left0__ [1];
		return __add__ (__add__ (__add__ (__add__ (__add__ (self.displaytype, ' math ‘'), open_delim), '…'), close_delim), '’');
	});},
	get accept_node_visitor () {return __get__ (this, function (self, visitor) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'visitor': var visitor = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return (function () {
			var __accu0__ = visitor;
			return __call__ (__accu0__.node_standard_process_math, __accu0__, self);
		}) ();
	});}
});
export var LatexNodeList =  __class__ ('LatexNodeList', [object], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, nodelist) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'nodelist': var nodelist = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		if (__t__ (__call__ (isinstance, null, nodelist, LatexNodeList))) {
			var obj = nodelist;
			var copy_parsing_state = (function () {
				var __accu0__ = kwargs;
				return __call__ (__accu0__.py_pop, __accu0__, 'parsing_state', null);
			}) ();
			var copy_latex_walker = (function () {
				var __accu0__ = kwargs;
				return __call__ (__accu0__.py_pop, __accu0__, 'latex_walker', null);
			}) ();
			var copy_pos = (function () {
				var __accu0__ = kwargs;
				return __call__ (__accu0__.py_pop, __accu0__, 'pos', null);
			}) ();
			var copy_pos_end = (function () {
				var __accu0__ = kwargs;
				return __call__ (__accu0__.py_pop, __accu0__, 'pos_end', null);
			}) ();
			if (__t__ (__call__ (len, null, kwargs))) {
				var __except0__ = __call__ (ValueError, null, __add__ ('Unexpected keyword arguments to LatexNodeList: ', __call__ (repr, null, kwargs)));
				__except0__.__cause__ = null;
				throw __except0__;
			}
			self.nodelist = obj.nodelist;
			self.parsing_state = (__t__ (copy_parsing_state !== null) ? copy_parsing_state : obj.parsing_state);
			self.latex_walker = (__t__ (copy_latex_walker !== null) ? copy_latex_walker : obj.latex_walker);
			self.pos = (__t__ (copy_pos !== null) ? copy_pos : obj.pos);
			self.pos_end = (__t__ (copy_pos_end !== null) ? copy_pos_end : obj.pos_end);
			return ;
		}
		self.nodelist = nodelist;
		if (__t__ (self.nodelist === null)) {
			var __except0__ = __call__ (ValueError, null, 'Cannot create a LatexNodeList with nodelist=None');
			__except0__.__cause__ = null;
			throw __except0__;
		}
		self.parsing_state = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'parsing_state', null);
		}) ();
		self.latex_walker = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'latex_walker', null);
		}) ();
		self.pos = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'pos', null);
		}) ();
		self.pos_end = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'pos_end', null);
		}) ();
		if (__t__ (__call__ (len, null, kwargs))) {
			var __except0__ = __call__ (ValueError, null, __add__ ('Unexpected keyword arguments to LatexNodeList: ', __call__ (repr, null, kwargs)));
			__except0__.__cause__ = null;
			throw __except0__;
		}
		var __left0__ = __call__ (_update_posposend_from_nodelist, null, self.pos, self.pos_end, self.nodelist);
		self.pos = __left0__ [0];
		self.pos_end = __left0__ [1];
	});},
	_fields: tuple (['nodelist', 'parsing_state', 'latex_walker', 'pos', 'pos_end']),
	get _get_len () {return __get__ (this, function (self) {
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
		if (__t__ (__t__ (self.pos === null) || self.pos_end === null)) {
			return null;
		}
		return __sub__ (self.pos_end, self.pos);
	});},
	get __iter__ () {return __get__ (this, function (self) {
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
		if (__t__ (self.nodelist === null)) {
			return __call__ (py_iter, null, []);
		}
		return __call__ (py_iter, null, self.nodelist);
	});},
	[Symbol.iterator] () {return this.__iter__ ()},
	get __getitem__ () {return __get__ (this, function (self, index) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'index': var index = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		try {
			if (__t__ (__eq__ (__call__ (len, null, index), 3))) {
				var __left0__ = index;
				var lower = __left0__ [0];
				var upper = __left0__ [1];
				var step = __left0__ [2];
				return __getslice__ (self.nodelist, lower, upper, step);
			}
		}
		catch (__except0__) {
			// pass;
		}
		if (__t__ (__t__ (__call__ (isinstance, null, index, int)) && __lt__ (index, 0))) {
			var index = __add__ (__call__ (len, null, self.nodelist), index);
		}
		return __getitem__ (self.nodelist, index);
	});},
	get __len__ () {return __get__ (this, function (self) {
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
		return __call__ (len, null, self.nodelist);
	});},
	get latex_verbatim () {return __get__ (this, function (self) {
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
			var __accu0__ = '';
			return __call__ (__accu0__.join, __accu0__, (function () {
				var __accu1__ = [];
				var __iterable0__ = self.nodelist;
				for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
					var n = __getitem__ (__iterable0__, __index0__);
					if (__t__ (n !== null)) {
						(function () {
							var __accu2__ = __accu1__;
							return __call__ (__accu2__.append, __accu2__, (function () {
								var __accu3__ = n;
								return __call__ (__accu3__.latex_verbatim, __accu3__);
							}) ());
						}) ();
					}
				}
				return __accu1__;
			}) ());
		}) ();
	});},
	get display_str () {return __get__ (this, function (self) {
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
		if (__t__ (self.nodelist === null)) {
			var list_len = 'null list';
			var list_preview = '';
		}
		else {
			var list_len = __call__ (len, null, self.nodelist);
			var list_preview = __add__ (__add__ (': ', (function () {
				var __accu0__ = ', ';
				return __call__ (__accu0__.join, __accu0__, (function () {
					var __accu1__ = [];
					var __iterable0__ = __getslice__ (self.nodelist, 0, 2, 1);
					for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
						var n = __getitem__ (__iterable0__, __index0__);
						(function () {
							var __accu2__ = __accu1__;
							return __call__ (__accu2__.append, __accu2__, (__t__ (n !== null) ? (function () {
								var __accu3__ = n;
								return __call__ (__accu3__.display_str, __accu3__);
							}) () : 'None'));
						}) ();
					}
					return __accu1__;
				}) ());
			}) ()), (__t__ (__gt__ (list_len, 2)) ? ' …' : ''));
		}
		return __add__ (__add__ (__add__ ('list of nodes (', __call__ (str, null, list_len)), ')'), list_preview);
	});},
	get accept_node_visitor () {return __get__ (this, function (self, visitor) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'visitor': var visitor = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return (function () {
			var __accu0__ = visitor;
			return __call__ (__accu0__.node_standard_process_list, __accu0__, self);
		}) ();
	});},
	get filter () {return __get__ (this, function (self, node_predicate_fn, skip_none, skip_comments, skip_whitespace_char_nodes) {
		if (typeof node_predicate_fn == 'undefined' || (node_predicate_fn != null && node_predicate_fn.hasOwnProperty ("__kwargtrans__"))) {;
			var node_predicate_fn = null;
		};
		if (typeof skip_none == 'undefined' || (skip_none != null && skip_none.hasOwnProperty ("__kwargtrans__"))) {;
			var skip_none = true;
		};
		if (typeof skip_comments == 'undefined' || (skip_comments != null && skip_comments.hasOwnProperty ("__kwargtrans__"))) {;
			var skip_comments = false;
		};
		if (typeof skip_whitespace_char_nodes == 'undefined' || (skip_whitespace_char_nodes != null && skip_whitespace_char_nodes.hasOwnProperty ("__kwargtrans__"))) {;
			var skip_whitespace_char_nodes = false;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'node_predicate_fn': var node_predicate_fn = __allkwargs0__ [__attrib0__]; break;
						case 'skip_none': var skip_none = __allkwargs0__ [__attrib0__]; break;
						case 'skip_comments': var skip_comments = __allkwargs0__ [__attrib0__]; break;
						case 'skip_whitespace_char_nodes': var skip_whitespace_char_nodes = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (self.latex_walker !== null)) {
			var make_nodelist = self.latex_walker.make_nodelist;
		}
		else {
			var make_nodelist = (function __lambda__ (nl) {
				var kwargs = dict ();
				if (arguments.length) {
					var __ilastarg0__ = arguments.length - 1;
					if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
						var __allkwargs0__ = arguments [__ilastarg0__--];
						for (var __attrib0__ in __allkwargs0__) {
							switch (__attrib0__) {
								case 'nl': var nl = __allkwargs0__ [__attrib0__]; break;
								default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
							}
						}
						delete kwargs.__kwargtrans__;
					}
				}
				else {
				}
				return __call__ (LatexNodeList, null, nl, __kwargtrans__ (kwargs));
			});
		}
		var filter_full_predicate_fn = function (n) {
			if (arguments.length) {
				var __ilastarg0__ = arguments.length - 1;
				if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
					var __allkwargs0__ = arguments [__ilastarg0__--];
					for (var __attrib0__ in __allkwargs0__) {
						switch (__attrib0__) {
							case 'n': var n = __allkwargs0__ [__attrib0__]; break;
						}
					}
				}
			}
			else {
			}
			if (__t__ (__t__ (skip_none) && n === null)) {
				return false;
			}
			if (__t__ (__t__ (skip_comments) && (function () {
				var __accu0__ = n;
				return __call__ (__accu0__.isNodeType, __accu0__, LatexCommentNode);
			}) ())) {
				return false;
			}
			if (__t__ (__t__ (skip_whitespace_char_nodes) && __t__ ((function () {
				var __accu0__ = n;
				return __call__ (__accu0__.isNodeType, __accu0__, LatexCharsNode);
			}) ()) && __eq__ (__call__ (len, null, (function () {
				var __accu0__ = n.chars;
				return __call__ (__accu0__.strip, __accu0__);
			}) ()), 0))) {
				return false;
			}
			if (__t__ (node_predicate_fn !== null)) {
				return __call__ (node_predicate_fn, null, n);
			}
			return true;
		};
		var filtered_nodes = (function () {
			var __accu0__ = [];
			var __iterable0__ = self.nodelist;
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var n = __getitem__ (__iterable0__, __index0__);
				if (__t__ (__call__ (filter_full_predicate_fn, null, n))) {
					(function () {
						var __accu1__ = __accu0__;
						return __call__ (__accu1__.append, __accu1__, n);
					}) ();
				}
			}
			return __accu0__;
		}) ();
		return __call__ (make_nodelist, null, filtered_nodes, __kwargtrans__ ({parsing_state: self.parsing_state, pos: (__t__ (__call__ (len, null, filtered_nodes)) ? null : self.pos_end), pos_end: (__t__ (__call__ (len, null, filtered_nodes)) ? null : self.pos_end)}));
	});},
	get split_at_node () {return __get__ (this, function (self, node_predicate_fn, skip_none, keep_separators, max_split, call_make_nodelist) {
		if (typeof skip_none == 'undefined' || (skip_none != null && skip_none.hasOwnProperty ("__kwargtrans__"))) {;
			var skip_none = true;
		};
		if (typeof keep_separators == 'undefined' || (keep_separators != null && keep_separators.hasOwnProperty ("__kwargtrans__"))) {;
			var keep_separators = false;
		};
		if (typeof max_split == 'undefined' || (max_split != null && max_split.hasOwnProperty ("__kwargtrans__"))) {;
			var max_split = null;
		};
		if (typeof call_make_nodelist == 'undefined' || (call_make_nodelist != null && call_make_nodelist.hasOwnProperty ("__kwargtrans__"))) {;
			var call_make_nodelist = true;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'node_predicate_fn': var node_predicate_fn = __allkwargs0__ [__attrib0__]; break;
						case 'skip_none': var skip_none = __allkwargs0__ [__attrib0__]; break;
						case 'keep_separators': var keep_separators = __allkwargs0__ [__attrib0__]; break;
						case 'max_split': var max_split = __allkwargs0__ [__attrib0__]; break;
						case 'call_make_nodelist': var call_make_nodelist = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var nodelists_list = [[]];
		if (__t__ (__t__ (max_split !== null) && __eq__ (max_split, 0))) {
			var no_more_splits = true;
		}
		else {
			var no_more_splits = false;
		}
		var __iterable0__ = self.nodelist;
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var n = __getitem__ (__iterable0__, __index0__);
			if (__t__ (__t__ (skip_none) && n === null)) {
				continue;
			}
			if (__t__ (__t__ (!__t__ ((no_more_splits))) && __call__ (node_predicate_fn, null, n))) {
				if (__t__ (keep_separators)) {
					(function () {
						var __accu0__ = nodelists_list;
						return __call__ (__accu0__.append, __accu0__, [n]);
					}) ();
				}
				else {
					(function () {
						var __accu0__ = nodelists_list;
						return __call__ (__accu0__.append, __accu0__, []);
					}) ();
				}
				if (__t__ (__t__ (max_split !== null) && __ge__ (__call__ (len, null, nodelists_list), max_split))) {
					var no_more_splits = true;
				}
			}
			else {
				(function () {
					var __accu0__ = __getitem__ (nodelists_list, __sub__ (__call__ (len, null, nodelists_list), 1));
					return __call__ (__accu0__.append, __accu0__, n);
				}) ();
			}
		}
		if (__t__ (__t__ (call_make_nodelist) && self.latex_walker !== null)) {
			var make_latex_node_list = self.latex_walker.make_nodelist;
		}
		else {
			var make_latex_node_list = (function __lambda__ (nl) {
				var kwargs = dict ();
				if (arguments.length) {
					var __ilastarg0__ = arguments.length - 1;
					if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
						var __allkwargs0__ = arguments [__ilastarg0__--];
						for (var __attrib0__ in __allkwargs0__) {
							switch (__attrib0__) {
								case 'nl': var nl = __allkwargs0__ [__attrib0__]; break;
								default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
							}
						}
						delete kwargs.__kwargtrans__;
					}
				}
				else {
				}
				return __call__ (LatexNodeList, null, nl, __kwargtrans__ (kwargs));
			});
		}
		return (function () {
			var __accu0__ = [];
			var __iterable0__ = nodelists_list;
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var nl = __getitem__ (__iterable0__, __index0__);
				(function () {
					var __accu1__ = __accu0__;
					return __call__ (__accu1__.append, __accu1__, __call__ (make_latex_node_list, null, nl, __kwargtrans__ ({parsing_state: self.parsing_state})));
				}) ();
			}
			return __accu0__;
		}) ();
	});},
	get split_at_chars () {return __get__ (this, function (self, sep_chars, max_split, keep_empty, skip_none) {
		if (typeof max_split == 'undefined' || (max_split != null && max_split.hasOwnProperty ("__kwargtrans__"))) {;
			var max_split = null;
		};
		if (typeof keep_empty == 'undefined' || (keep_empty != null && keep_empty.hasOwnProperty ("__kwargtrans__"))) {;
			var keep_empty = false;
		};
		if (typeof skip_none == 'undefined' || (skip_none != null && skip_none.hasOwnProperty ("__kwargtrans__"))) {;
			var skip_none = true;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'sep_chars': var sep_chars = __allkwargs0__ [__attrib0__]; break;
						case 'max_split': var max_split = __allkwargs0__ [__attrib0__]; break;
						case 'keep_empty': var keep_empty = __allkwargs0__ [__attrib0__]; break;
						case 'skip_none': var skip_none = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var split_node_lists = [];
		var num_splits = [0];
		var get_split_match_start_end = function (m, offset) {
			if (typeof offset == 'undefined' || (offset != null && offset.hasOwnProperty ("__kwargtrans__"))) {;
				var offset = 0;
			};
			if (arguments.length) {
				var __ilastarg0__ = arguments.length - 1;
				if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
					var __allkwargs0__ = arguments [__ilastarg0__--];
					for (var __attrib0__ in __allkwargs0__) {
						switch (__attrib0__) {
							case 'm': var m = __allkwargs0__ [__attrib0__]; break;
							case 'offset': var offset = __allkwargs0__ [__attrib0__]; break;
						}
					}
				}
			}
			else {
			}
			if (__t__ (m === null)) {
				return tuple ([__neg__ (1), null]);
			}
			if (__t__ (__t__ (__call__ (hasattr, null, m, 'start')) && __call__ (hasattr, null, m, 'end'))) {
				return tuple ([__add__ (offset, (function () {
					var __accu0__ = m;
					return __call__ (__accu0__.start, __accu0__);
				}) ()), __add__ (offset, (function () {
					var __accu0__ = m;
					return __call__ (__accu0__.end, __accu0__);
				}) ())]);
			}
			if (__t__ (__t__ (!__t__ ((m))) || !__t__ ((__call__ (len, null, m))))) {
				return tuple ([__neg__ (1), null]);
			}
			var __left0__ = m;
			var start = __left0__ [0];
			var end = __left0__ [1];
			if (__t__ (start === null)) {
				var start = __neg__ (1);
			}
			else {
				var start = __add__ (offset, start);
			}
			var end = __add__ (offset, end);
			return tuple ([start, end]);
		};
		var get_next_split = function (chars, pos) {
			if (arguments.length) {
				var __ilastarg0__ = arguments.length - 1;
				if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
					var __allkwargs0__ = arguments [__ilastarg0__--];
					for (var __attrib0__ in __allkwargs0__) {
						switch (__attrib0__) {
							case 'chars': var chars = __allkwargs0__ [__attrib0__]; break;
							case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
						}
					}
				}
			}
			else {
			}
			if (__t__ (__t__ (max_split !== null) && __ge__ (__getitem__ (num_splits, 0), max_split))) {
				return tuple ([__neg__ (1), __call__ (len, null, chars)]);
			}
			if (__t__ (__call__ (hasattr, null, sep_chars, 'search'))) {
				var m = (function () {
					var __accu0__ = sep_chars;
					return __call__ (__accu0__.search, __accu0__, __getslice__ (chars, pos, null, 1));
				}) ();
				return __call__ (get_split_match_start_end, null, m, pos);
			}
			if (__t__ (__call__ (callable, null, sep_chars))) {
				var m = __call__ (sep_chars, null, chars, pos);
				return __call__ (get_split_match_start_end, null, m);
			}
			var idx = (function () {
				var __accu0__ = chars;
				return __call__ (__accu0__.find, __accu0__, sep_chars, pos);
			}) ();
			if (__t__ (__t__ (idx === null) || __eq__ (idx, __neg__ (1)))) {
				return tuple ([__neg__ (1), null]);
			}
			return tuple ([idx, __add__ (idx, __call__ (len, null, sep_chars))]);
		};
		var lw = self.latex_walker;
		if (__t__ (lw !== null)) {
			var make_node = lw.make_node;
			var make_nodelist = lw.make_nodelist;
		}
		else {
			var make_node = (function __lambda__ (cls) {
				var kwargs = dict ();
				if (arguments.length) {
					var __ilastarg0__ = arguments.length - 1;
					if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
						var __allkwargs0__ = arguments [__ilastarg0__--];
						for (var __attrib0__ in __allkwargs0__) {
							switch (__attrib0__) {
								case 'cls': var cls = __allkwargs0__ [__attrib0__]; break;
								default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
							}
						}
						delete kwargs.__kwargtrans__;
					}
				}
				else {
				}
				return __call__ (cls, null, __kwargtrans__ (kwargs));
			});
			var make_nodelist = (function __lambda__ (nl) {
				var kwargs = dict ();
				if (arguments.length) {
					var __ilastarg0__ = arguments.length - 1;
					if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
						var __allkwargs0__ = arguments [__ilastarg0__--];
						for (var __attrib0__ in __allkwargs0__) {
							switch (__attrib0__) {
								case 'nl': var nl = __allkwargs0__ [__attrib0__]; break;
								default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
							}
						}
						delete kwargs.__kwargtrans__;
					}
				}
				else {
				}
				return __call__ (LatexNodeList, null, nl, __kwargtrans__ (kwargs));
			});
		}
		var chars_to_node = function (chars, n, rel_pos, rel_pos_end) {
			if (arguments.length) {
				var __ilastarg0__ = arguments.length - 1;
				if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
					var __allkwargs0__ = arguments [__ilastarg0__--];
					for (var __attrib0__ in __allkwargs0__) {
						switch (__attrib0__) {
							case 'chars': var chars = __allkwargs0__ [__attrib0__]; break;
							case 'n': var n = __allkwargs0__ [__attrib0__]; break;
							case 'rel_pos': var rel_pos = __allkwargs0__ [__attrib0__]; break;
							case 'rel_pos_end': var rel_pos_end = __allkwargs0__ [__attrib0__]; break;
						}
					}
				}
			}
			else {
			}
			return __call__ (make_node, null, LatexCharsNode, __kwargtrans__ ({parsing_state: self.parsing_state, pos: __add__ (n.pos, rel_pos), pos_end: __add__ (n.pos, rel_pos_end), chars: chars}));
		};
		var flush_nodes = function (nodes, pos_end) {
			if (typeof pos_end == 'undefined' || (pos_end != null && pos_end.hasOwnProperty ("__kwargtrans__"))) {;
				var pos_end = null;
			};
			if (arguments.length) {
				var __ilastarg0__ = arguments.length - 1;
				if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
					var __allkwargs0__ = arguments [__ilastarg0__--];
					for (var __attrib0__ in __allkwargs0__) {
						switch (__attrib0__) {
							case 'nodes': var nodes = __allkwargs0__ [__attrib0__]; break;
							case 'pos_end': var pos_end = __allkwargs0__ [__attrib0__]; break;
						}
					}
				}
			}
			else {
			}
			var newnodelist = __call__ (make_nodelist, null, nodes, __kwargtrans__ ({parsing_state: self.parsing_state, pos: (__t__ (__call__ (len, null, nodes)) ? null : pos_end), pos_end: pos_end}));
			(function () {
				var __accu0__ = split_node_lists;
				return __call__ (__accu0__.append, __accu0__, newnodelist);
			}) ();
		};
		var pending_nodes = [];
		var __iterable0__ = self.nodelist;
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var n = __getitem__ (__iterable0__, __index0__);
			if (__t__ (n === null)) {
				if (__t__ (!__t__ ((skip_none)))) {
					(function () {
						var __accu0__ = pending_nodes;
						return __call__ (__accu0__.append, __accu0__, n);
					}) ();
				}
				continue;
			}
			if (__t__ ((function () {
				var __accu0__ = n;
				return __call__ (__accu0__.isNodeType, __accu0__, LatexCharsNode);
			}) ())) {
				var next_sep_end = 0;
				while (__t__ (true)) {
					var prev_sep_end = next_sep_end;
					var __left0__ = __call__ (get_next_split, null, n.chars, prev_sep_end);
					var next_sep_idx = __left0__ [0];
					var next_sep_end = __left0__ [1];
					if (__t__ (__ne__ (next_sep_idx, __neg__ (1)))) {
						__setitem__ (num_splits, 0, __call__ (__iadd__, null, __getitem__ (num_splits, 0), 1));
						var p = __getslice__ (n.chars, prev_sep_end, next_sep_idx, 1);
						if (__t__ (__eq__ (prev_sep_end, 0))) {
							if (__t__ (__call__ (len, null, p))) {
								(function () {
									var __accu0__ = pending_nodes;
									return __call__ (__accu0__.append, __accu0__, __call__ (chars_to_node, null, p, n, prev_sep_end, next_sep_idx));
								}) ();
							}
							if (__t__ (__t__ (__call__ (len, null, pending_nodes)) || keep_empty)) {
								__call__ (flush_nodes, null, pending_nodes, __kwargtrans__ ({pos_end: __add__ (n.pos, next_sep_idx)}));
							}
							var pending_nodes = [];
							continue;
						}
						else {
							var thenodes = [];
							if (__t__ (__call__ (len, null, p))) {
								var thenodes = [__call__ (chars_to_node, null, p, n, prev_sep_end, next_sep_idx)];
							}
							if (__t__ (__t__ (__call__ (len, null, thenodes)) || keep_empty)) {
								__call__ (flush_nodes, null, thenodes, __kwargtrans__ ({pos_end: __add__ (n.pos, next_sep_idx)}));
							}
							continue;
						}
					}
					else if (__t__ (__eq__ (prev_sep_end, 0))) {
						(function () {
							var __accu0__ = pending_nodes;
							return __call__ (__accu0__.append, __accu0__, n);
						}) ();
						break;
					}
					else {
						var p = __getslice__ (n.chars, prev_sep_end, null, 1);
						if (__t__ (__call__ (len, null, p))) {
							(function () {
								var __accu0__ = pending_nodes;
								return __call__ (__accu0__.append, __accu0__, __call__ (chars_to_node, null, p, n, prev_sep_end, __call__ (len, null, n.chars)));
							}) ();
						}
						break;
					}
				}
				continue;
			}
			(function () {
				var __accu0__ = pending_nodes;
				return __call__ (__accu0__.append, __accu0__, n);
			}) ();
		}
		if (__t__ (__t__ (pending_nodes) || keep_empty)) {
			__call__ (flush_nodes, null, pending_nodes, __kwargtrans__ ({pos_end: self.pos_end}));
		}
		return split_node_lists;
	});},
	get parse_keyval_content () {return __get__ (this, function (self, comma_sep_chars, eq_sep_chars, repeated_key_aggregate_action, default_value_nodelist, extract_value_group_contents, dict_type) {
		if (typeof comma_sep_chars == 'undefined' || (comma_sep_chars != null && comma_sep_chars.hasOwnProperty ("__kwargtrans__"))) {;
			var comma_sep_chars = ',';
		};
		if (typeof eq_sep_chars == 'undefined' || (eq_sep_chars != null && eq_sep_chars.hasOwnProperty ("__kwargtrans__"))) {;
			var eq_sep_chars = '=';
		};
		if (typeof repeated_key_aggregate_action == 'undefined' || (repeated_key_aggregate_action != null && repeated_key_aggregate_action.hasOwnProperty ("__kwargtrans__"))) {;
			var repeated_key_aggregate_action = 'concatenate';
		};
		if (typeof default_value_nodelist == 'undefined' || (default_value_nodelist != null && default_value_nodelist.hasOwnProperty ("__kwargtrans__"))) {;
			var default_value_nodelist = null;
		};
		if (typeof extract_value_group_contents == 'undefined' || (extract_value_group_contents != null && extract_value_group_contents.hasOwnProperty ("__kwargtrans__"))) {;
			var extract_value_group_contents = true;
		};
		if (typeof dict_type == 'undefined' || (dict_type != null && dict_type.hasOwnProperty ("__kwargtrans__"))) {;
			var dict_type = dict;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'comma_sep_chars': var comma_sep_chars = __allkwargs0__ [__attrib0__]; break;
						case 'eq_sep_chars': var eq_sep_chars = __allkwargs0__ [__attrib0__]; break;
						case 'repeated_key_aggregate_action': var repeated_key_aggregate_action = __allkwargs0__ [__attrib0__]; break;
						case 'default_value_nodelist': var default_value_nodelist = __allkwargs0__ [__attrib0__]; break;
						case 'extract_value_group_contents': var extract_value_group_contents = __allkwargs0__ [__attrib0__]; break;
						case 'dict_type': var dict_type = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var result_keyvals = __call__ (dict_type, null);
		var lw = self.latex_walker;
		if (__t__ (lw !== null)) {
			var make_nodelist = lw.make_nodelist;
		}
		else {
			var make_nodelist = (function __lambda__ (nl) {
				var kwargs = dict ();
				if (arguments.length) {
					var __ilastarg0__ = arguments.length - 1;
					if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
						var __allkwargs0__ = arguments [__ilastarg0__--];
						for (var __attrib0__ in __allkwargs0__) {
							switch (__attrib0__) {
								case 'nl': var nl = __allkwargs0__ [__attrib0__]; break;
								default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
							}
						}
						delete kwargs.__kwargtrans__;
					}
				}
				else {
				}
				return __call__ (LatexNodeList, null, nl, __kwargtrans__ (kwargs));
			});
		}
		var comma_sep_parts = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.split_at_chars, __accu0__, comma_sep_chars);
		}) ();
		var __iterable0__ = comma_sep_parts;
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var part = __getitem__ (__iterable0__, __index0__);
			var eq_sep_parts = (function () {
				var __accu0__ = part;
				return __call__ (__accu0__.split_at_chars, __accu0__, eq_sep_chars, __kwargtrans__ ({max_split: 1}));
			}) ();
			if (__t__ (__eq__ (__call__ (len, null, eq_sep_parts), 0))) {
				continue;
			}
			var key_nl = __getitem__ (eq_sep_parts, 0);
			var value_nl = null;
			if (__t__ (__gt__ (__call__ (len, null, eq_sep_parts), 2))) {
				var __except0__ = __call__ (RuntimeError, null, '[internal error?] unexpected split length past max_split?');
				__except0__.__cause__ = null;
				throw __except0__;
			}
			if (__t__ (__eq__ (__call__ (len, null, eq_sep_parts), 2))) {
				var value_nl = __getitem__ (eq_sep_parts, 1);
				if (__t__ (__t__ (extract_value_group_contents) && __t__ (value_nl !== null) && __t__ (__eq__ (__call__ (len, null, value_nl), 1)) && (function () {
					var __accu0__ = __getitem__ (value_nl.nodelist, 0);
					return __call__ (__accu0__.isNodeType, __accu0__, LatexGroupNode);
				}) ())) {
					var value_nl = __getitem__ (value_nl.nodelist, 0).nodelist;
				}
			}
			if (__t__ (value_nl === null)) {
				var value_nl = default_value_nodelist;
			}
			if (__t__ (!__t__ ((__call__ (isinstance, null, value_nl, LatexNodeList))))) {
				var value_nl = __call__ (make_nodelist, null, [value_nl], __kwargtrans__ ({parsing_state: self.parsing_state}));
			}
			var key_s = (function () {
				var __accu0__ = key_nl;
				return __call__ (__accu0__.get_content_as_chars, __accu0__);
			}) ();
			if (__t__ (__in__ (key_s, result_keyvals))) {
				if (__t__ (__eq__ (repeated_key_aggregate_action, 'concatenate'))) {
					var value_nl = __call__ (make_nodelist, null, __add__ (__getitem__ (result_keyvals, key_s).nodelist, (__t__ (__call__ (isinstance, null, value_nl, LatexNodeList)) ? value_nl.nodelist : [value_nl])), __kwargtrans__ ({parsing_state: self.parsing_state, pos: __getitem__ (result_keyvals, key_s).pos}));
				}
				else if (__t__ (__eq__ (repeated_key_aggregate_action, 'error'))) {
					var __except0__ = __call__ (ValueError, null, (function () {
						var __accu0__ = 'Repeated Key: ‘{}’';
						return __call__ (__accu0__.format, __accu0__, key_s);
					}) ());
					__except0__.__cause__ = null;
					throw __except0__;
				}
				else if (__t__ (__eq__ (repeated_key_aggregate_action, 'first'))) {
					var value_nl = __getitem__ (result_keyvals, key_s);
				}
				else if (__t__ (__eq__ (repeated_key_aggregate_action, 'last'))) {
					// pass;
				}
				else {
					var value_nl = __call__ (repeated_key_aggregate_action, null, key_s, __getitem__ (result_keyvals, key_s), value_nl, __kwargtrans__ ({result_keyvals: result_keyvals}));
				}
			}
			__setitem__ (result_keyvals, key_s, value_nl);
		}
		return result_keyvals;
	});},
	get get_content_as_chars () {return __get__ (this, function (self) {
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
		return __call__ (_get_content_as_chars, null, self.nodelist);
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
		if (__t__ (__call__ (isinstance, null, other, list))) {
			return __eq__ (self.nodelist, other);
		}
		if (__t__ (__t__ (other === null) || !__t__ ((__call__ (isinstance, null, other, LatexNodeList))))) {
			return false;
		}
		return __t__ (__eq__ (self.nodelist, other.nodelist)) && __t__ ((__t__ (__t__ (self.pos === null) && other.pos === null) || __eq__ (self.pos, other.pos))) && (__t__ (__t__ (self.pos_end === null) && other.pos_end === null) || __eq__ (self.pos_end, other.pos_end));
	});},
	get to_json_object () {return __get__ (this, function (self) {
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
		return self.nodelist;
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
		return (function () {
			var __accu0__ = 'LatexNodeList({nodelist!r}, pos={pos!r}, pos_end={pos_end!r})';
			return __call__ (__accu0__.format, __accu0__, __kwargtrans__ ({nodelist: self.nodelist, pos: self.pos, pos_end: self.pos_end}));
		}) ();
	});}
});
Object.defineProperty (LatexNodeList, 'len', property.call (LatexNodeList, LatexNodeList._get_len));;
export var _get_content_as_chars = function (nodelist) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'nodelist': var nodelist = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	if (__t__ (nodelist === null)) {
		return '';
	}
	var charslist = [];
	var __iterable0__ = nodelist;
	for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
		var n = __getitem__ (__iterable0__, __index0__);
		if (__t__ (n === null)) {
			continue;
		}
		if (__t__ ((function () {
			var __accu0__ = n;
			return __call__ (__accu0__.isNodeType, __accu0__, LatexCommentNode);
		}) ())) {
			continue;
		}
		if (__t__ ((function () {
			var __accu0__ = n;
			return __call__ (__accu0__.isNodeType, __accu0__, LatexGroupNode);
		}) ())) {
			(function () {
				var __accu0__ = charslist;
				return __call__ (__accu0__.append, __accu0__, __call__ (_get_content_as_chars, null, n.nodelist));
			}) ();
			continue;
		}
		if (__t__ ((function () {
			var __accu0__ = n;
			return __call__ (__accu0__.isNodeType, __accu0__, LatexCharsNode);
		}) ())) {
			(function () {
				var __accu0__ = charslist;
				return __call__ (__accu0__.append, __accu0__, n.chars);
			}) ();
			continue;
		}
		var __except0__ = __call__ (LatexWalkerParseError, null, (function () {
			var __accu0__ = 'Expected simple characters only, got ‘{}’';
			return __call__ (__accu0__.format, __accu0__, n.__class__.__name__);
		}) (), __kwargtrans__ ({pos: n.pos}));
		__except0__.__cause__ = null;
		throw __except0__;
	}
	return (function () {
		var __accu0__ = '';
		return __call__ (__accu0__.join, __accu0__, charslist);
	}) ();
};
export var _update_posposend_from_nodelist = function (pos, pos_end, nodelist) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
					case 'pos_end': var pos_end = __allkwargs0__ [__attrib0__]; break;
					case 'nodelist': var nodelist = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	if (__t__ (pos === null)) {
		var __break0__ = false;
		var __iterable0__ = nodelist;
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var n = __getitem__ (__iterable0__, __index0__);
			if (__t__ (n !== null)) {
				var pos = n.pos;
				__break0__ = true;
				break;
			}
		}
		if (!__break0__) {
			var pos = null;
		}
	}
	if (__t__ (pos_end === null)) {
		var __break0__ = false;
		var __iterable0__ = __call__ (py_reversed, null, nodelist);
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var n = __getitem__ (__iterable0__, __index0__);
			if (__t__ (n !== null)) {
				var pos_end = n.pos_end;
				__break0__ = true;
				break;
			}
		}
		if (!__break0__) {
			var pos_end = null;
		}
	}
	return tuple ([pos, pos_end]);
};
export var _UseList =  __class__ ('_UseList', [object], {
	__module__: __name__,
});
export var LatexNodesVisitor =  __class__ ('LatexNodesVisitor', [object], {
	__module__: __name__,
	get start () {return __get__ (this, function (self, node) {
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
		return (function () {
			var __accu0__ = node;
			return __call__ (__accu0__.accept_node_visitor, __accu0__, self);
		}) ();
	});},
	get visit () {return __get__ (this, function (self, node) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'node': var node = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		return null;
	});},
	get visit_chars_node () {return __get__ (this, function (self, node) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'node': var node = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.visit, __accu0__, node, __kwargtrans__ (kwargs));
		}) ();
	});},
	get visit_group_node () {return __get__ (this, function (self, node) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'node': var node = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.visit, __accu0__, node, __kwargtrans__ (kwargs));
		}) ();
	});},
	get visit_comment_node () {return __get__ (this, function (self, node) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'node': var node = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.visit, __accu0__, node, __kwargtrans__ (kwargs));
		}) ();
	});},
	get visit_macro_node () {return __get__ (this, function (self, node) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'node': var node = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.visit, __accu0__, node, __kwargtrans__ (kwargs));
		}) ();
	});},
	get visit_environment_node () {return __get__ (this, function (self, node) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'node': var node = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.visit, __accu0__, node, __kwargtrans__ (kwargs));
		}) ();
	});},
	get visit_specials_node () {return __get__ (this, function (self, node) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'node': var node = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.visit, __accu0__, node, __kwargtrans__ (kwargs));
		}) ();
	});},
	get visit_math_node () {return __get__ (this, function (self, node) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'node': var node = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.visit, __accu0__, node, __kwargtrans__ (kwargs));
		}) ();
	});},
	get visit_node_list () {return __get__ (this, function (self, nodes) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'nodes': var nodes = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.visit, __accu0__, nodes, __kwargtrans__ (kwargs));
		}) ();
	});},
	get visit_parsed_arguments () {return __get__ (this, function (self, parsed_args) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'parsed_args': var parsed_args = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.visit, __accu0__, parsed_args, __kwargtrans__ (kwargs));
		}) ();
	});},
	get visit_unknown_node () {return __get__ (this, function (self, node) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'node': var node = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.visit, __accu0__, node, __kwargtrans__ (kwargs));
		}) ();
	});},
	get descend_into_nodelist () {return __get__ (this, function (self, nodelist, py_default) {
		if (typeof py_default == 'undefined' || (py_default != null && py_default.hasOwnProperty ("__kwargtrans__"))) {;
			var py_default = _UseList;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'nodelist': var nodelist = __allkwargs0__ [__attrib0__]; break;
						case 'py_default': var py_default = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (nodelist === null)) {
			if (__t__ (py_default === _UseList)) {
				return [];
			}
			return py_default;
		}
		var visited_results_nodelist = [];
		var __iterable0__ = nodelist;
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var cnode = __getitem__ (__iterable0__, __index0__);
			if (__t__ (cnode !== null)) {
				(function () {
					var __accu0__ = visited_results_nodelist;
					return __call__ (__accu0__.append, __accu0__, (function () {
						var __accu1__ = cnode;
						return __call__ (__accu1__.accept_node_visitor, __accu1__, self);
					}) ());
				}) ();
			}
			else {
				(function () {
					var __accu0__ = visited_results_nodelist;
					return __call__ (__accu0__.append, __accu0__, null);
				}) ();
			}
		}
		return visited_results_nodelist;
	});},
	get descend_into_parsed_arguments () {return __get__ (this, function (self, parsed_arguments) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'parsed_arguments': var parsed_arguments = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (parsed_arguments === null)) {
			return '';
		}
		return (function () {
			var __accu0__ = parsed_arguments;
			return __call__ (__accu0__.accept_node_visitor, __accu0__, self);
		}) ();
	});},
	get node_standard_process_unknown () {return __get__ (this, function (self, node) {
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
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.visit_unknown_node, __accu0__, node);
		}) ();
	});},
	get node_standard_process_chars () {return __get__ (this, function (self, node) {
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
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.visit_chars_node, __accu0__, node);
		}) ();
	});},
	get node_standard_process_group () {return __get__ (this, function (self, node) {
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
		var visited_results_nodelist = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.descend_into_nodelist, __accu0__, node.nodelist);
		}) ();
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.visit_group_node, __accu0__, node, __kwargtrans__ ({visited_results_nodelist: visited_results_nodelist}));
		}) ();
	});},
	get node_standard_process_comment () {return __get__ (this, function (self, node) {
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
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.visit_comment_node, __accu0__, node);
		}) ();
	});},
	get node_standard_process_macro () {return __get__ (this, function (self, node) {
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
		var visited_results_arguments = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.descend_into_parsed_arguments, __accu0__, node.nodeargd);
		}) ();
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.visit_macro_node, __accu0__, node, __kwargtrans__ ({visited_results_arguments: visited_results_arguments}));
		}) ();
	});},
	get node_standard_process_environment () {return __get__ (this, function (self, node) {
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
		var visited_results_arguments = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.descend_into_parsed_arguments, __accu0__, node.nodeargd);
		}) ();
		var visited_results_body = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.descend_into_nodelist, __accu0__, node.nodelist);
		}) ();
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.visit_environment_node, __accu0__, node, __kwargtrans__ ({visited_results_arguments: visited_results_arguments, visited_results_body: visited_results_body}));
		}) ();
	});},
	get node_standard_process_specials () {return __get__ (this, function (self, node) {
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
		var visited_results_arguments = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.descend_into_parsed_arguments, __accu0__, node.nodeargd);
		}) ();
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.visit_specials_node, __accu0__, node, __kwargtrans__ ({visited_results_arguments: visited_results_arguments}));
		}) ();
	});},
	get node_standard_process_math () {return __get__ (this, function (self, node) {
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
		var visited_results_nodelist = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.descend_into_nodelist, __accu0__, node.nodelist, __kwargtrans__ ({py_default: null}));
		}) ();
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.visit_math_node, __accu0__, node, __kwargtrans__ ({visited_results_nodelist: visited_results_nodelist}));
		}) ();
	});},
	get node_standard_process_list () {return __get__ (this, function (self, nodelist) {
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
		var visited_results_nodelist = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.descend_into_nodelist, __accu0__, nodelist.nodelist);
		}) ();
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.visit_node_list, __accu0__, nodelist, __kwargtrans__ ({visited_results_nodelist: visited_results_nodelist}));
		}) ();
	});},
	get node_standard_process_parsed_arguments () {return __get__ (this, function (self, parsed_arguments) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'parsed_arguments': var parsed_arguments = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var visited_results_argnlist = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.descend_into_nodelist, __accu0__, parsed_arguments.argnlist, __kwargtrans__ ({py_default: null}));
		}) ();
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.visit_parsed_arguments, __accu0__, parsed_arguments, __kwargtrans__ ({visited_results_argnlist: visited_results_argnlist}));
		}) ();
	});}
});
export var latex_node_types = tuple ([LatexNode, LatexCharsNode, LatexGroupNode, LatexCommentNode, LatexMacroNode, LatexEnvironmentNode, LatexSpecialsNode, LatexMathNode]);
export var __all__ = __add__ ((function () {
	var __accu0__ = [];
	var __iterable0__ = latex_node_types;
	for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
		var nc = __getitem__ (__iterable0__, __index0__);
		(function () {
			var __accu1__ = __accu0__;
			return __call__ (__accu1__.append, __accu1__, nc.__name__);
		}) ();
	}
	return __accu0__;
}) (), ['LatexNodeList', 'LatexNodesVisitor']);

