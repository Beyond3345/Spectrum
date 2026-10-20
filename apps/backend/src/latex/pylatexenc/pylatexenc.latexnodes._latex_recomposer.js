var logging = {};
import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import {LatexNodesVisitor} from './pylatexenc.latexnodes.nodes.js';
import * as __module_logging__ from './logging.js';
__nest__ (logging, '', __module_logging__);
export {LatexNodesVisitor};
var __name__ = 'pylatexenc.latexnodes._latex_recomposer';
export var logger = (function () {
	var __accu0__ = logging;
	return __call__ (__accu0__.getLogger, __accu0__, __name__);
}) ();
export var LatexNodesLatexRecomposer =  __class__ ('LatexNodesLatexRecomposer', [LatexNodesVisitor], {
	__module__: __name__,
	get latex_recompose () {return __get__ (this, function (self, node) {
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
			return __call__ (__accu0__.start, __accu0__, node);
		}) ();
	});},
	get recompose_chars () {return __get__ (this, function (self, chars, n) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'chars': var chars = __allkwargs0__ [__attrib0__]; break;
						case 'n': var n = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (!__t__ ((chars)))) {
			var chars = '';
		}
		return __call__ (str, null, chars);
	});},
	get recompose_nodelist () {return __get__ (this, function (self, nodelist, n) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'nodelist': var nodelist = __allkwargs0__ [__attrib0__]; break;
						case 'n': var n = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var recomposed_list = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.descend_into_nodelist, __accu0__, nodelist);
		}) ();
		return (function () {
			var __accu0__ = '';
			return __call__ (__accu0__.join, __accu0__, (function () {
				var __accu1__ = [];
				var __iterable0__ = recomposed_list;
				for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
					var recomposed = __getitem__ (__iterable0__, __index0__);
					if (__t__ (recomposed !== null)) {
						(function () {
							var __accu2__ = __accu1__;
							return __call__ (__accu2__.append, __accu2__, recomposed);
						}) ();
					}
				}
				return __accu1__;
			}) ());
		}) ();
	});},
	get recompose_delimited_nodelist () {return __get__ (this, function (self, delimiters, nodelist, n) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'delimiters': var delimiters = __allkwargs0__ [__attrib0__]; break;
						case 'nodelist': var nodelist = __allkwargs0__ [__attrib0__]; break;
						case 'n': var n = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (!__t__ ((delimiters)))) {
			var delimiters = tuple (['', '']);
		}
		return __add__ (__add__ (__getitem__ (delimiters, 0), (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.recompose_nodelist, __accu0__, nodelist, n);
		}) ()), __getitem__ (delimiters, 1));
	});},
	get recompose_comment () {return __get__ (this, function (self, comment, comment_post_space, n) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'comment': var comment = __allkwargs0__ [__attrib0__]; break;
						case 'comment_post_space': var comment_post_space = __allkwargs0__ [__attrib0__]; break;
						case 'n': var n = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (!__t__ ((comment)))) {
			var comment = '';
		}
		if (__t__ (!__t__ ((comment_post_space)))) {
			var comment_post_space = '';
		}
		return __add__ (__add__ (n.parsing_state.comment_start, comment), comment_post_space);
	});},
	get recompose_macro_call () {return __get__ (this, function (self, macroname, macro_post_space, parsed_arguments, n) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'macroname': var macroname = __allkwargs0__ [__attrib0__]; break;
						case 'macro_post_space': var macro_post_space = __allkwargs0__ [__attrib0__]; break;
						case 'parsed_arguments': var parsed_arguments = __allkwargs0__ [__attrib0__]; break;
						case 'n': var n = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var recomposed_arguments = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.descend_into_parsed_arguments, __accu0__, parsed_arguments);
		}) ();
		return __add__ (__add__ (__add__ (n.parsing_state.macro_escape_char, macroname), macro_post_space), recomposed_arguments);
	});},
	get recompose_environment_call () {return __get__ (this, function (self, environmentname, parsed_arguments, body_node_list, n) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'environmentname': var environmentname = __allkwargs0__ [__attrib0__]; break;
						case 'parsed_arguments': var parsed_arguments = __allkwargs0__ [__attrib0__]; break;
						case 'body_node_list': var body_node_list = __allkwargs0__ [__attrib0__]; break;
						case 'n': var n = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var recomposed_arguments = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.descend_into_parsed_arguments, __accu0__, parsed_arguments);
		}) ();
		var recomposed_body = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.recompose_nodelist, __accu0__, body_node_list, n);
		}) ();
		var macro_escape_char = n.parsing_state.macro_escape_char;
		return __add__ (__add__ (__add__ (__add__ (__add__ (__add__ (__add__ (__add__ (__add__ (macro_escape_char, 'begin{'), __call__ (str, null, environmentname)), '}'), recomposed_arguments), recomposed_body), macro_escape_char), 'end{'), __call__ (str, null, environmentname)), '}');
	});},
	get recompose_specials_call () {return __get__ (this, function (self, specials_chars, parsed_arguments, n) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'specials_chars': var specials_chars = __allkwargs0__ [__attrib0__]; break;
						case 'parsed_arguments': var parsed_arguments = __allkwargs0__ [__attrib0__]; break;
						case 'n': var n = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var recomposed_arguments = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.descend_into_parsed_arguments, __accu0__, parsed_arguments);
		}) ();
		return __add__ (specials_chars, recomposed_arguments);
	});},
	get recompose_math_content () {return __get__ (this, function (self, delimiters, nodelist, n) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'delimiters': var delimiters = __allkwargs0__ [__attrib0__]; break;
						case 'nodelist': var nodelist = __allkwargs0__ [__attrib0__]; break;
						case 'n': var n = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.recompose_delimited_nodelist, __accu0__, delimiters, nodelist, n);
		}) ();
	});},
	get recompose_parsed_arguments () {return __get__ (this, function (self, parsed_arguments) {
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
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.recompose_nodelist, __accu0__, parsed_arguments.argnlist, null);
		}) ();
	});},
	get recompose_unknown () {return __get__ (this, function (self, node) {
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
		return __add__ (__add__ ('<<< UNKNOWN NODE: ', __call__ (repr, null, node)), ' >>>');
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
			return __call__ (__accu0__.recompose_chars, __accu0__, node.chars, node);
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
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.recompose_delimited_nodelist, __accu0__, node.delimiters, node.nodelist, node);
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
			return __call__ (__accu0__.recompose_comment, __accu0__, node.comment, node.comment_post_space, node);
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
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.recompose_macro_call, __accu0__, node.macroname, node.macro_post_space, node.nodeargd, node);
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
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.recompose_environment_call, __accu0__, node.environmentname, node.nodeargd, node.nodelist, node);
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
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.recompose_specials_call, __accu0__, node.specials_chars, node.nodeargd, node);
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
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.recompose_math_content, __accu0__, node.delimiters, node.nodelist, node);
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
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.recompose_nodelist, __accu0__, nodelist.nodelist, nodelist);
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
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.recompose_parsed_arguments, __accu0__, parsed_arguments);
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
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.recompose_unknown, __accu0__, node);
		}) ();
	});}
});

