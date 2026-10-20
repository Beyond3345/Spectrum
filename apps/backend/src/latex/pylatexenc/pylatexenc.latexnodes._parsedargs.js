import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
var __name__ = 'pylatexenc.latexnodes._parsedargs';
export var LatexArgumentSpec =  __class__ ('LatexArgumentSpec', [object], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, parser, argname, parsing_state_delta) {
		if (typeof argname == 'undefined' || (argname != null && argname.hasOwnProperty ("__kwargtrans__"))) {;
			var argname = null;
		};
		if (typeof parsing_state_delta == 'undefined' || (parsing_state_delta != null && parsing_state_delta.hasOwnProperty ("__kwargtrans__"))) {;
			var parsing_state_delta = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'parser': var parser = __allkwargs0__ [__attrib0__]; break;
						case 'argname': var argname = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state_delta': var parsing_state_delta = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		self.parser = parser;
		self.argname = argname;
		self.parsing_state_delta = parsing_state_delta;
	});},
	_fields: tuple (['parser', 'argname', 'parsing_state_delta']),
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
			var __accu0__ = '{cls}(argname={argname!r}, parser={parser!r}, parsing_state_delta={parsing_state_delta!r})';
			return __call__ (__accu0__.format, __accu0__, __kwargtrans__ ({cls: self.__class__.__name__, argname: self.argname, parser: self.parser, parsing_state_delta: self.parsing_state_delta}));
		}) ();
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
		var d = __call__ (dict, null, __kwargtrans__ ({parser: self.parser, argname: self.argname, parsing_state_delta: self.parsing_state_delta}));
		return d;
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
		if (__t__ (__t__ (other === null) || !__t__ ((__call__ (isinstance, null, other, LatexArgumentSpec))))) {
			return false;
		}
		return __t__ (__eq__ (self.parser, other.parser)) && __t__ (__eq__ (self.argname, other.argname)) && __eq__ (self.parsing_state_delta, other.parsing_state_delta);
	});}
});
export var ParsedArguments =  __class__ ('ParsedArguments', [object], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, argnlist, arguments_spec_list) {
		if (typeof argnlist == 'undefined' || (argnlist != null && argnlist.hasOwnProperty ("__kwargtrans__"))) {;
			var argnlist = null;
		};
		if (typeof arguments_spec_list == 'undefined' || (arguments_spec_list != null && arguments_spec_list.hasOwnProperty ("__kwargtrans__"))) {;
			var arguments_spec_list = null;
		};
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'argnlist': var argnlist = __allkwargs0__ [__attrib0__]; break;
						case 'arguments_spec_list': var arguments_spec_list = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		var argspec = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'argspec', null);
		}) ();
		__call__ (__call__ (__super__, null, ParsedArguments, '__init__'), null, self, __kwargtrans__ (kwargs));
		if (__t__ (__t__ (arguments_spec_list === null) && argspec !== null)) {
			var arguments_spec_list = argspec;
		}
		self.argnlist = (__t__ (argnlist) ? argnlist : []);
		self.arguments_spec_list = (__t__ (arguments_spec_list) ? arguments_spec_list : []);
	});},
	_fields: tuple (['arguments_spec_list', 'argnlist']),
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
			return __call__ (__accu0__.node_standard_process_parsed_arguments, __accu0__, self);
		}) ();
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
		if (__t__ (__t__ (other === null) || !__t__ ((__call__ (isinstance, null, other, ParsedArguments))))) {
			return false;
		}
		return __t__ (__eq__ (self.arguments_spec_list, other.arguments_spec_list)) && __eq__ (self.argnlist, other.argnlist);
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
		return __call__ (dict, null, __kwargtrans__ ({arguments_spec_list: self.arguments_spec_list, argnlist: self.argnlist}));
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
			var __accu0__ = '{}(arguments_spec_list={!r}, argnlist={!r})';
			return __call__ (__accu0__.format, __accu0__, self.__class__.__name__, self.arguments_spec_list, self.argnlist);
		}) ();
	});}
});

