var logging = {};
import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import {get_updated_parsing_state_from_delta} from './pylatexenc.latexnodes.js';
import {LatexParserBase} from './pylatexenc.latexnodes.parsers.js';
import {LatexEnvironmentNode, LatexMacroNode, LatexSpecialsNode} from './pylatexenc.latexnodes.nodes.js';
import * as __module_logging__ from './logging.js';
__nest__ (logging, '', __module_logging__);
export {get_updated_parsing_state_from_delta, LatexEnvironmentNode, LatexParserBase, LatexSpecialsNode, LatexMacroNode};
var __name__ = 'pylatexenc.macrospec._macrocallparser';
export var logger = (function () {
	var __accu0__ = logging;
	return __call__ (__accu0__.getLogger, __accu0__, __name__);
}) ();
export var _LatexCallableParserBase =  __class__ ('_LatexCallableParserBase', [LatexParserBase], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, token_call, spec_object, what, node_class, node_extra_kwargs, parse_body) {
		if (typeof parse_body == 'undefined' || (parse_body != null && parse_body.hasOwnProperty ("__kwargtrans__"))) {;
			var parse_body = false;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'token_call': var token_call = __allkwargs0__ [__attrib0__]; break;
						case 'spec_object': var spec_object = __allkwargs0__ [__attrib0__]; break;
						case 'what': var what = __allkwargs0__ [__attrib0__]; break;
						case 'node_class': var node_class = __allkwargs0__ [__attrib0__]; break;
						case 'node_extra_kwargs': var node_extra_kwargs = __allkwargs0__ [__attrib0__]; break;
						case 'parse_body': var parse_body = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, _LatexCallableParserBase, '__init__'), null, self);
		// pass;
		self.token_call = token_call;
		self.spec_object = spec_object;
		self.what = what;
		self.node_class = node_class;
		self.node_extra_kwargs = node_extra_kwargs;
		self.arguments_parser = self.spec_object.arguments_parser;
		self.parse_body = parse_body;
		self.make_arguments_parsing_state_delta = self.spec_object.make_arguments_parsing_state_delta;
		self.make_body_parsing_state_delta = self.spec_object.make_body_parsing_state_delta;
		self.make_after_parsing_state_delta = self.spec_object.make_after_parsing_state_delta;
	});},
	get parse_call_arguments () {return __get__ (this, function (self, latex_walker, token_reader, parsing_state) {
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
		var arguments_parsing_state = __call__ (get_updated_parsing_state_from_delta, null, parsing_state, (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.make_arguments_parsing_state_delta, __accu0__, __kwargtrans__ ({token: self.token_call, latex_walker: latex_walker}));
		}) (), latex_walker);
		var __left0__ = (function () {
			var __accu0__ = latex_walker;
			return __call__ (__accu0__.parse_content, __accu0__, self.arguments_parser, token_reader, arguments_parsing_state, __kwargtrans__ (kwargs));
		}) ();
		var nodeargd = __left0__ [0];
		var parsing_state_delta = __left0__ [1];
		return tuple ([nodeargd, parsing_state_delta]);
	});},
	get make_body_parser_and_parsing_state () {return __get__ (this, function (self, nodeargd, arg_parsing_state_delta, parsing_state, latex_walker) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'nodeargd': var nodeargd = __allkwargs0__ [__attrib0__]; break;
						case 'arg_parsing_state_delta': var arg_parsing_state_delta = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __except0__ = __call__ (RuntimeError, null, 'No default implementation of make_body_parser_and_parsing_state() in base class');
		__except0__.__cause__ = null;
		throw __except0__;
	});},
	get parse_call_body () {return __get__ (this, function (self, nodeargd, arg_parsing_state_delta, latex_walker, token_reader, parsing_state) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'nodeargd': var nodeargd = __allkwargs0__ [__attrib0__]; break;
						case 'arg_parsing_state_delta': var arg_parsing_state_delta = __allkwargs0__ [__attrib0__]; break;
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
		var __left0__ = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.make_body_parser_and_parsing_state, __accu0__, nodeargd, arg_parsing_state_delta, parsing_state, latex_walker);
		}) ();
		var body_parser = __left0__ [0];
		var body_parsing_state = __left0__ [1];
		var __left0__ = (function () {
			var __accu0__ = latex_walker;
			return __call__ (__accu0__.parse_content, __accu0__, body_parser, token_reader, body_parsing_state, __kwargtrans__ (kwargs));
		}) ();
		var nodelist = __left0__ [0];
		var parsing_state_delta = __left0__ [1];
		return tuple ([nodelist, parsing_state_delta]);
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
		var pos_start = self.token_call.pos;
		if (__t__ (self.arguments_parser !== null)) {
			var __left0__ = (function () {
				var __accu0__ = self;
				return __call__ (__accu0__.parse_call_arguments, __accu0__, latex_walker, token_reader, parsing_state, __kwargtrans__ (kwargs));
			}) ();
			var nodeargd = __left0__ [0];
			var arg_parsing_state_delta = __left0__ [1];
		}
		else {
			var __left0__ = tuple ([null, null]);
			var nodeargd = __left0__ [0];
			var arg_parsing_state_delta = __left0__ [1];
		}
		// pass;
		if (__t__ (self.parse_body)) {
			var __left0__ = (function () {
				var __accu0__ = self;
				return __call__ (__accu0__.parse_call_body, __accu0__, nodeargd, arg_parsing_state_delta, latex_walker, token_reader, parsing_state, __kwargtrans__ (kwargs));
			}) ();
			var body_nodelist = __left0__ [0];
			var body_parsing_state_delta = __left0__ [1];
		}
		else {
			if (__t__ (arg_parsing_state_delta !== null)) {
				(function () {
					var __accu0__ = logger;
					return __call__ (__accu0__.warning, __accu0__, 'Parsing state delta (%r) ignored after arguments to %s!', arg_parsing_state_delta, self.what);
				}) ();
			}
			var body_nodelist = null;
			var body_parsing_state_delta = null;
		}
		if (__t__ (body_parsing_state_delta !== null)) {
			(function () {
				var __accu0__ = logger;
				return __call__ (__accu0__.warning, __accu0__, 'Parsing state delta (%r) ignored after body!', body_parsing_state_delta);
			}) ();
		}
		var pos_end = (function () {
			var __accu0__ = token_reader;
			return __call__ (__accu0__.cur_pos, __accu0__);
		}) ();
		var node_kwargs = __call__ (dict, null, self.node_extra_kwargs);
		if (__t__ (self.parse_body)) {
			__setitem__ (node_kwargs, 'nodelist', body_nodelist);
		}
		var node = (function () {
			var __accu0__ = latex_walker;
			return __call__ (__accu0__.make_node, __accu0__, self.node_class, __kwargtrans__ (__mergekwargtrans__ ({parsing_state: parsing_state, spec: self.spec_object, nodeargd: nodeargd, pos: pos_start, pos_end: pos_end}, node_kwargs)));
		}) ();
		var node = (function () {
			var __accu0__ = self.spec_object;
			return __call__ (__accu0__.finalize_node, __accu0__, node);
		}) ();
		var parsing_state_delta = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.make_after_parsing_state_delta, __accu0__, __kwargtrans__ ({parsed_node: node, latex_walker: latex_walker}));
		}) ();
		// pass;
		return tuple ([node, parsing_state_delta]);
	});}
});
export var LatexMacroCallParser =  __class__ ('LatexMacroCallParser', [_LatexCallableParserBase], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, token_call, macrospec) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'token_call': var token_call = __allkwargs0__ [__attrib0__]; break;
						case 'macrospec': var macrospec = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var macroname = token_call.arg;
		var macro_post_space = token_call.post_space;
		__call__ (__call__ (__super__, null, LatexMacroCallParser, '__init__'), null, self, __kwargtrans__ ({token_call: token_call, spec_object: macrospec, what: (function () {
			var __accu0__ = 'macro call (\\{})';
			return __call__ (__accu0__.format, __accu0__, macroname);
		}) (), node_class: LatexMacroNode, node_extra_kwargs: __call__ (dict, null, __kwargtrans__ ({macroname: macroname, macro_post_space: macro_post_space}))}));
		self.macroname = macroname;
		self.macro_post_space = macro_post_space;
	});}
});
export var LatexEnvironmentCallParser =  __class__ ('LatexEnvironmentCallParser', [_LatexCallableParserBase], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, token_call, environmentspec) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'token_call': var token_call = __allkwargs0__ [__attrib0__]; break;
						case 'environmentspec': var environmentspec = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var environmentname = token_call.arg;
		__call__ (__call__ (__super__, null, LatexEnvironmentCallParser, '__init__'), null, self, __kwargtrans__ ({token_call: token_call, spec_object: environmentspec, what: (function () {
			var __accu0__ = 'environment {}{}{}';
			return __call__ (__accu0__.format, __accu0__, '{', environmentname, '}');
		}) (), parse_body: true, node_class: LatexEnvironmentNode, node_extra_kwargs: __call__ (dict, null, __kwargtrans__ ({environmentname: environmentname}))}));
		self.environmentname = environmentname;
	});},
	get make_body_parser_and_parsing_state () {return __get__ (this, function (self, nodeargd, arg_parsing_state_delta, parsing_state, latex_walker) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'nodeargd': var nodeargd = __allkwargs0__ [__attrib0__]; break;
						case 'arg_parsing_state_delta': var arg_parsing_state_delta = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (arg_parsing_state_delta !== null)) {
			(function () {
				var __accu0__ = logger;
				return __call__ (__accu0__.warning, __accu0__, 'Parsing carry-over information (%r) ignored after arguments to %s!', arg_parsing_state_delta, self.what);
			}) ();
		}
		var parser = (function () {
			var __accu0__ = self.spec_object;
			return __call__ (__accu0__.make_body_parser, __accu0__, self.token_call, nodeargd, arg_parsing_state_delta);
		}) ();
		var body_parsing_state = __call__ (get_updated_parsing_state_from_delta, null, parsing_state, (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.make_body_parsing_state_delta, __accu0__, __kwargtrans__ ({token: self.token_call, nodeargd: nodeargd, arg_parsing_state_delta: arg_parsing_state_delta, latex_walker: latex_walker}));
		}) (), latex_walker);
		return tuple ([parser, body_parsing_state]);
	});},
	get _handle_stop_condition_token () {return __get__ (this, function (self, t, latex_walker, token_reader, parsing_state) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 't': var t = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
						case 'token_reader': var token_reader = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		(function () {
			var __accu0__ = token_reader;
			return __call__ (__accu0__.move_past_token, __accu0__, t);
		}) ();
	});},
	get _parse_body_token_stop_condition () {return __get__ (this, function (self, t) {
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
		if (__t__ (__t__ (__eq__ (t.tok, 'end_environment')) && __eq__ (t.arg, self.environmentname))) {
			return true;
		}
		return false;
	});}
});
export var LatexSpecialsCallParser =  __class__ ('LatexSpecialsCallParser', [_LatexCallableParserBase], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, token_call, specialsspec) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'token_call': var token_call = __allkwargs0__ [__attrib0__]; break;
						case 'specialsspec': var specialsspec = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var specials_chars = specialsspec.specials_chars;
		__call__ (__call__ (__super__, null, LatexSpecialsCallParser, '__init__'), null, self, __kwargtrans__ ({token_call: token_call, spec_object: specialsspec, what: (function () {
			var __accu0__ = 'specials ‘{}’';
			return __call__ (__accu0__.format, __accu0__, specials_chars);
		}) (), node_class: LatexSpecialsNode, node_extra_kwargs: __call__ (dict, null, __kwargtrans__ ({specials_chars: specials_chars}))}));
		self.specials_chars = specials_chars;
	});}
});

