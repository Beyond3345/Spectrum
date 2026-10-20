var logging = {};
import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import {LatexEnvironmentBodyContentsParser} from './pylatexenc.macrospec._environmentbodyparser.js';
import {LatexEnvironmentCallParser, LatexMacroCallParser, LatexSpecialsCallParser} from './pylatexenc.macrospec._macrocallparser.js';
import {LatexArgumentsParser, LatexNoArgumentsParser} from './pylatexenc.macrospec._argumentsparser.js';
import {CallableSpecBase, ParsingStateDeltaEnterMathMode} from './pylatexenc.latexnodes.js';
import * as __module_logging__ from './logging.js';
__nest__ (logging, '', __module_logging__);
export {LatexArgumentsParser, LatexMacroCallParser, LatexSpecialsCallParser, LatexEnvironmentCallParser, LatexNoArgumentsParser, CallableSpecBase, LatexEnvironmentBodyContentsParser, ParsingStateDeltaEnterMathMode};
var __name__ = 'pylatexenc.macrospec._specclasses';
export var logger = (function () {
	var __accu0__ = logging;
	return __call__ (__accu0__.getLogger, __accu0__, __name__);
}) ();
export var _legacy_pyltxenc2_do = (function __lambda__ () {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
			}
		}
		var args = tuple ([].slice.apply (arguments).slice (0, __ilastarg0__ + 1));
	}
	else {
		var args = tuple ();
	}
	return null;
});
export var _NotSpecified =  __class__ ('_NotSpecified', [object], {
	__module__: __name__,
});
export var _spec_node_parser_types = dict ({'macro': LatexMacroCallParser, 'environment': LatexEnvironmentCallParser, 'specials': LatexSpecialsCallParser});
export var CallableSpec =  __class__ ('CallableSpec', [CallableSpecBase], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, arguments_spec_list, spec_node_parser_type, macroname, environmentname, specials_chars, make_arguments_parsing_state_delta, make_body_parsing_state_delta, make_after_parsing_state_delta, make_body_parser, finalize_node) {
		if (typeof macroname == 'undefined' || (macroname != null && macroname.hasOwnProperty ("__kwargtrans__"))) {;
			var macroname = _NotSpecified;
		};
		if (typeof environmentname == 'undefined' || (environmentname != null && environmentname.hasOwnProperty ("__kwargtrans__"))) {;
			var environmentname = _NotSpecified;
		};
		if (typeof specials_chars == 'undefined' || (specials_chars != null && specials_chars.hasOwnProperty ("__kwargtrans__"))) {;
			var specials_chars = _NotSpecified;
		};
		if (typeof make_arguments_parsing_state_delta == 'undefined' || (make_arguments_parsing_state_delta != null && make_arguments_parsing_state_delta.hasOwnProperty ("__kwargtrans__"))) {;
			var make_arguments_parsing_state_delta = null;
		};
		if (typeof make_body_parsing_state_delta == 'undefined' || (make_body_parsing_state_delta != null && make_body_parsing_state_delta.hasOwnProperty ("__kwargtrans__"))) {;
			var make_body_parsing_state_delta = null;
		};
		if (typeof make_after_parsing_state_delta == 'undefined' || (make_after_parsing_state_delta != null && make_after_parsing_state_delta.hasOwnProperty ("__kwargtrans__"))) {;
			var make_after_parsing_state_delta = null;
		};
		if (typeof make_body_parser == 'undefined' || (make_body_parser != null && make_body_parser.hasOwnProperty ("__kwargtrans__"))) {;
			var make_body_parser = null;
		};
		if (typeof finalize_node == 'undefined' || (finalize_node != null && finalize_node.hasOwnProperty ("__kwargtrans__"))) {;
			var finalize_node = null;
		};
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'arguments_spec_list': var arguments_spec_list = __allkwargs0__ [__attrib0__]; break;
						case 'spec_node_parser_type': var spec_node_parser_type = __allkwargs0__ [__attrib0__]; break;
						case 'macroname': var macroname = __allkwargs0__ [__attrib0__]; break;
						case 'environmentname': var environmentname = __allkwargs0__ [__attrib0__]; break;
						case 'specials_chars': var specials_chars = __allkwargs0__ [__attrib0__]; break;
						case 'make_arguments_parsing_state_delta': var make_arguments_parsing_state_delta = __allkwargs0__ [__attrib0__]; break;
						case 'make_body_parsing_state_delta': var make_body_parsing_state_delta = __allkwargs0__ [__attrib0__]; break;
						case 'make_after_parsing_state_delta': var make_after_parsing_state_delta = __allkwargs0__ [__attrib0__]; break;
						case 'make_body_parser': var make_body_parser = __allkwargs0__ [__attrib0__]; break;
						case 'finalize_node': var finalize_node = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		self.arguments_spec_list = arguments_spec_list;
		self.spec_node_parser_type = spec_node_parser_type;
		if (__t__ (__call__ (isinstance, null, spec_node_parser_type, str))) {
			self.spec_node_parser_type = __getitem__ (_spec_node_parser_types, spec_node_parser_type);
		}
		if (__t__ (macroname !== _NotSpecified)) {
			self.macroname = macroname;
		}
		if (__t__ (environmentname !== _NotSpecified)) {
			self.environmentname = environmentname;
		}
		if (__t__ (specials_chars !== _NotSpecified)) {
			self.specials_chars = specials_chars;
		}
		if (__t__ (make_arguments_parsing_state_delta !== null)) {
			self._fn_make_arguments_parsing_state_delta = make_arguments_parsing_state_delta;
		}
		if (__t__ (make_body_parsing_state_delta !== null)) {
			self._fn_make_body_parsing_state_delta = make_body_parsing_state_delta;
		}
		if (__t__ (make_after_parsing_state_delta !== null)) {
			self._fn_make_after_parsing_state_delta = make_after_parsing_state_delta;
		}
		if (__t__ (make_body_parser !== null)) {
			self._fn_make_body_parser = make_body_parser;
		}
		if (__t__ (finalize_node !== null)) {
			self._fn_finalize_node = finalize_node;
		}
		var use_legacy_args_parser = __call__ (_legacy_pyltxenc2_do, null, 'CallableSpec_init_from_args_parser', self, arguments_spec_list, kwargs);
		var body_parsing_state_delta = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'body_parsing_state_delta', null);
		}) ();
		var is_math_mode = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'is_math_mode', null);
		}) ();
		if (__t__ (is_math_mode)) {
			if (__t__ (body_parsing_state_delta === null)) {
				var body_parsing_state_delta = __call__ (ParsingStateDeltaEnterMathMode, null);
			}
			else {
				var __except0__ = __call__ (ValueError, null, 'You cannot specify both is_math_mode= and body_parsing_state_delta=');
				__except0__.__cause__ = null;
				throw __except0__;
			}
		}
		self.body_parsing_state_delta = body_parsing_state_delta;
		__call__ (__call__ (__super__, null, CallableSpec, '__init__'), null, self, __kwargtrans__ (kwargs));
		if (__t__ (!__t__ ((use_legacy_args_parser)))) {
			if (__t__ (self.arguments_spec_list)) {
				self.arguments_parser = __call__ (LatexArgumentsParser, null, self.arguments_spec_list);
			}
			else {
				self.arguments_parser = __call__ (LatexNoArgumentsParser, null);
			}
		}
	});},
	get get_node_parser () {return __get__ (this, function (self, token, parsing_state) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'token': var token = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.spec_node_parser_type, __accu0__, token, self);
		}) ();
	});},
	get finalize_node () {return __get__ (this, function (self, node) {
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
		if (__t__ (__call__ (hasattr, null, self, '_fn_finalize_node'))) {
			return (function () {
				var __accu0__ = self;
				return __call__ (__accu0__._fn_finalize_node, __accu0__, node);
			}) ();
		}
		return node;
	});},
	get make_arguments_parsing_state_delta () {return __get__ (this, function (self, token, latex_walker) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'token': var token = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (__call__ (hasattr, null, self, '_fn_make_arguments_parsing_state_delta'))) {
			return (function () {
				var __accu0__ = self;
				return __call__ (__accu0__._fn_make_arguments_parsing_state_delta, __accu0__, __kwargtrans__ ({token: token, latex_walker: latex_walker}));
			}) ();
		}
		return null;
	});},
	get make_body_parsing_state_delta () {return __get__ (this, function (self, token, nodeargd, arg_parsing_state_delta, latex_walker) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'token': var token = __allkwargs0__ [__attrib0__]; break;
						case 'nodeargd': var nodeargd = __allkwargs0__ [__attrib0__]; break;
						case 'arg_parsing_state_delta': var arg_parsing_state_delta = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (__call__ (hasattr, null, self, '_fn_make_body_parsing_state_delta'))) {
			return (function () {
				var __accu0__ = self;
				return __call__ (__accu0__._fn_make_body_parsing_state_delta, __accu0__, __kwargtrans__ ({token: token, nodeargd: nodeargd, arg_parsing_state_delta: arg_parsing_state_delta, latex_walker: latex_walker}));
			}) ();
		}
		return self.body_parsing_state_delta;
	});},
	get make_after_parsing_state_delta () {return __get__ (this, function (self, parsed_node, latex_walker) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'parsed_node': var parsed_node = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (__call__ (hasattr, null, self, '_fn_make_after_parsing_state_delta'))) {
			return (function () {
				var __accu0__ = self;
				return __call__ (__accu0__._fn_make_after_parsing_state_delta, __accu0__, __kwargtrans__ ({parsed_node: parsed_node, latex_walker: latex_walker}));
			}) ();
		}
		return null;
	});},
	get make_body_parser () {return __get__ (this, function (self, token, nodeargd, arg_parsing_state_delta) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'token': var token = __allkwargs0__ [__attrib0__]; break;
						case 'nodeargd': var nodeargd = __allkwargs0__ [__attrib0__]; break;
						case 'arg_parsing_state_delta': var arg_parsing_state_delta = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (__call__ (hasattr, null, self, '_fn_make_body_parser'))) {
			return (function () {
				var __accu0__ = self;
				return __call__ (__accu0__._fn_make_body_parser, __accu0__, token, nodeargd, arg_parsing_state_delta);
			}) ();
		}
		return __call__ (LatexEnvironmentBodyContentsParser, null, __kwargtrans__ ({environmentname: token.arg}));
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
				var __iterable0__ = (function () {
					var __accu2__ = self.__dict__;
					return __call__ (__accu2__.py_items, __accu2__);
				}) ();
				for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
					var __left0__ = __getitem__ (__iterable0__, __index0__);
					var k = __left0__ [0];
					var v = __left0__ [1];
					if (__t__ (__t__ (!__t__ (((function () {
						var __accu2__ = k;
						return __call__ (__accu2__.startswith, __accu2__, '_');
					}) ()))) && __t__ (v !== null) && !__in__ (k, tuple (['spec_node_parser_type'])))) {
						(function () {
							var __accu2__ = __accu1__;
							return __call__ (__accu2__.append, __accu2__, (function () {
								var __accu3__ = '{}={!r}';
								return __call__ (__accu3__.format, __accu3__, k, v);
							}) ());
						}) ();
					}
				}
				return __accu1__;
			}) ());
		}) ()), ')');
	});}
});
export var MacroSpec =  __class__ ('MacroSpec', [CallableSpec], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, macroname, arguments_spec_list) {
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
						case 'macroname': var macroname = __allkwargs0__ [__attrib0__]; break;
						case 'arguments_spec_list': var arguments_spec_list = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, MacroSpec, '__init__'), null, self, __kwargtrans__ (__mergekwargtrans__ ({arguments_spec_list: arguments_spec_list, spec_node_parser_type: LatexMacroCallParser, macroname: macroname}, kwargs)));
	});}
});
export var EnvironmentSpec =  __class__ ('EnvironmentSpec', [CallableSpec], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, environmentname, arguments_spec_list) {
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
						case 'environmentname': var environmentname = __allkwargs0__ [__attrib0__]; break;
						case 'arguments_spec_list': var arguments_spec_list = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, EnvironmentSpec, '__init__'), null, self, __kwargtrans__ (__mergekwargtrans__ ({arguments_spec_list: arguments_spec_list, spec_node_parser_type: LatexEnvironmentCallParser, environmentname: environmentname}, kwargs)));
	});}
});
export var SpecialsSpec =  __class__ ('SpecialsSpec', [CallableSpec], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, specials_chars, arguments_spec_list) {
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
						case 'specials_chars': var specials_chars = __allkwargs0__ [__attrib0__]; break;
						case 'arguments_spec_list': var arguments_spec_list = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, SpecialsSpec, '__init__'), null, self, __kwargtrans__ (__mergekwargtrans__ ({arguments_spec_list: arguments_spec_list, spec_node_parser_type: LatexSpecialsCallParser, specials_chars: specials_chars}, kwargs)));
	});}
});

