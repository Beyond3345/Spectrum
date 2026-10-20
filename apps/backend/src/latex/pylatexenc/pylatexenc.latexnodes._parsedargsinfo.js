var logging = {};
import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import {LatexWalkerParseError} from './pylatexenc.latexnodes._exctypes.js';
import {LatexCharsNode, LatexCommentNode, LatexEnvironmentNode, LatexGroupNode, LatexMacroNode, LatexMathNode, LatexNode, LatexNodeList, LatexNodesVisitor, LatexSpecialsNode, ParsedArguments, _UseList, __all__, _display_abbrev_str, _display_str_delimiters, _get_content_as_chars, _update_posposend_from_nodelist, latex_node_types} from './pylatexenc.latexnodes.nodes.js';
import * as __module_logging__ from './logging.js';
__nest__ (logging, '', __module_logging__);
export {latex_node_types, LatexNodesVisitor, LatexCommentNode, _update_posposend_from_nodelist, __all__, LatexWalkerParseError, LatexGroupNode, LatexCharsNode, ParsedArguments, LatexSpecialsNode, _UseList, _display_abbrev_str, LatexEnvironmentNode, LatexMathNode, _get_content_as_chars, LatexNode, _display_str_delimiters, LatexNodeList, LatexMacroNode};
var __name__ = 'pylatexenc.latexnodes._parsedargsinfo';
export var logger = (function () {
	var __accu0__ = logging;
	return __call__ (__accu0__.getLogger, __accu0__, __name__);
}) ();
export var SingleParsedArgumentInfo =  __class__ ('SingleParsedArgumentInfo', [object], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, argument_node_object) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'argument_node_object': var argument_node_object = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, SingleParsedArgumentInfo, '__init__'), null, self);
		self.argument_node_object = argument_node_object;
	});},
	get was_provided () {return __get__ (this, function (self) {
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
		return self.argument_node_object !== null;
	});},
	get get_content_nodelist () {return __get__ (this, function (self, unwrap_double_group, make_nodelist) {
		if (typeof unwrap_double_group == 'undefined' || (unwrap_double_group != null && unwrap_double_group.hasOwnProperty ("__kwargtrans__"))) {;
			var unwrap_double_group = true;
		};
		if (typeof make_nodelist == 'undefined' || (make_nodelist != null && make_nodelist.hasOwnProperty ("__kwargtrans__"))) {;
			var make_nodelist = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'unwrap_double_group': var unwrap_double_group = __allkwargs0__ [__attrib0__]; break;
						case 'make_nodelist': var make_nodelist = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (make_nodelist === null)) {
			var make_nodelist = LatexNodeList;
		}
		var argument_node_object = self.argument_node_object;
		if (__t__ (argument_node_object === null)) {
			return __call__ (make_nodelist, null, [null]);
		}
		if (__t__ (__call__ (isinstance, null, argument_node_object, LatexNodeList))) {
			return argument_node_object;
		}
		if (__t__ ((function () {
			var __accu0__ = argument_node_object;
			return __call__ (__accu0__.isNodeType, __accu0__, LatexGroupNode);
		}) ())) {
			if (__t__ (__t__ (unwrap_double_group) && __t__ (__eq__ (__call__ (len, null, argument_node_object.nodelist), 1)) && __getitem__ (argument_node_object.nodelist, 0))) {
				var innernode = __getitem__ (argument_node_object.nodelist, 0);
				if (__t__ (__t__ ((function () {
					var __accu0__ = innernode;
					return __call__ (__accu0__.isNodeType, __accu0__, LatexGroupNode);
				}) ()) && __ne__ (__getitem__ (innernode.delimiters, 0), __getitem__ (argument_node_object.delimiters, 0)))) {
					return innernode.nodelist;
				}
			}
			return argument_node_object.nodelist;
		}
		return __call__ (make_nodelist, null, [argument_node_object]);
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
		var nodelist = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.get_content_nodelist, __accu0__);
		}) ();
		return (function () {
			var __accu0__ = nodelist;
			return __call__ (__accu0__.get_content_as_chars, __accu0__);
		}) ();
	});},
	get parse_content_as_keyval () {return __get__ (this, function (self) {
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
		var nodelist = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.get_content_nodelist, __accu0__);
		}) ();
		return (function () {
			var __accu0__ = nodelist;
			return __call__ (__accu0__.parse_keyval_content, __accu0__, __kwargtrans__ (kwargs));
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
		return (function () {
			var __accu0__ = '{}(argument_node_object={!r})';
			return __call__ (__accu0__.format, __accu0__, self.__class__.__name__, self.argument_node_object);
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
		if (__t__ (__t__ (other === null) || !__t__ ((__call__ (isinstance, null, other, SingleParsedArgumentInfo))))) {
			return false;
		}
		return __t__ (__t__ (self.argument_node_object === null) && other.argument_node_object === null) || __eq__ (self.argument_node_object, other.argument_node_object);
	});}
});
export var ParsedArgumentsInfo =  __class__ ('ParsedArgumentsInfo', [object], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, parsed_arguments, node) {
		if (typeof parsed_arguments == 'undefined' || (parsed_arguments != null && parsed_arguments.hasOwnProperty ("__kwargtrans__"))) {;
			var parsed_arguments = null;
		};
		if (typeof node == 'undefined' || (node != null && node.hasOwnProperty ("__kwargtrans__"))) {;
			var node = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'parsed_arguments': var parsed_arguments = __allkwargs0__ [__attrib0__]; break;
						case 'node': var node = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, ParsedArgumentsInfo, '__init__'), null, self);
		self.parsed_arguments = parsed_arguments;
		self.node = node;
		if (__t__ (self.node !== null)) {
			self.node_pos = self.node.pos;
			if (__t__ (__t__ (self.parsed_arguments === null) && __call__ (hasattr, null, self.node, 'nodeargd'))) {
				self.parsed_arguments = self.node.nodeargd;
			}
		}
		else {
			self.node_pos = null;
		}
		if (__t__ (__t__ (self.parsed_arguments === null) && self.node === null)) {
			(function () {
				var __accu0__ = logger;
				return __call__ (__accu0__.warning, __accu0__, 'You created ParsedArgumentsInfo with both node=None and parsed_arguments=None, might be a bug in your code?');
			}) ();
		}
	});},
	get get_argument_info () {return __get__ (this, function (self, arg) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'arg': var arg = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (self.parsed_arguments === null)) {
			var __except0__ = __call__ (LatexWalkerParseError, null, 'Cannot get argument information, there were no arguments specified', __kwargtrans__ ({pos: self.node_pos}));
			__except0__.__cause__ = null;
			throw __except0__;
		}
		var arg_i = arg;
		if (__t__ (__call__ (isinstance, null, arg_i, str))) {
			var argname = arg_i;
			var __break0__ = false;
			var __iterable0__ = __call__ (enumerate, null, self.parsed_arguments.arguments_spec_list);
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var __left0__ = __getitem__ (__iterable0__, __index0__);
				var j = __left0__ [0];
				var arg_spec = __left0__ [1];
				if (__t__ (__eq__ (arg_spec.argname, argname))) {
					var arg_i = j;
					__break0__ = true;
					break;
				}
			}
			if (!__break0__) {
				var __except0__ = __call__ (LatexWalkerParseError, null, (function () {
					var __accu0__ = 'Cannot find argument named ‘{}’';
					return __call__ (__accu0__.format, __accu0__, argname);
				}) (), __kwargtrans__ ({pos: self.node_pos}));
				__except0__.__cause__ = null;
				throw __except0__;
			}
		}
		return __call__ (SingleParsedArgumentInfo, null, __getitem__ (self.parsed_arguments.argnlist, arg_i));
	});},
	get get_all_arguments_info () {return __get__ (this, function (self, args, allow_additional_arguments, skip_nonexistent_arguments, include_unrequested_argnames, include_unrequested_argindices) {
		if (typeof args == 'undefined' || (args != null && args.hasOwnProperty ("__kwargtrans__"))) {;
			var args = null;
		};
		if (typeof allow_additional_arguments == 'undefined' || (allow_additional_arguments != null && allow_additional_arguments.hasOwnProperty ("__kwargtrans__"))) {;
			var allow_additional_arguments = false;
		};
		if (typeof skip_nonexistent_arguments == 'undefined' || (skip_nonexistent_arguments != null && skip_nonexistent_arguments.hasOwnProperty ("__kwargtrans__"))) {;
			var skip_nonexistent_arguments = false;
		};
		if (typeof include_unrequested_argnames == 'undefined' || (include_unrequested_argnames != null && include_unrequested_argnames.hasOwnProperty ("__kwargtrans__"))) {;
			var include_unrequested_argnames = null;
		};
		if (typeof include_unrequested_argindices == 'undefined' || (include_unrequested_argindices != null && include_unrequested_argindices.hasOwnProperty ("__kwargtrans__"))) {;
			var include_unrequested_argindices = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'args': var args = __allkwargs0__ [__attrib0__]; break;
						case 'allow_additional_arguments': var allow_additional_arguments = __allkwargs0__ [__attrib0__]; break;
						case 'skip_nonexistent_arguments': var skip_nonexistent_arguments = __allkwargs0__ [__attrib0__]; break;
						case 'include_unrequested_argnames': var include_unrequested_argnames = __allkwargs0__ [__attrib0__]; break;
						case 'include_unrequested_argindices': var include_unrequested_argindices = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (self.parsed_arguments === null)) {
			if (__t__ (skip_nonexistent_arguments)) {
				return dict ({});
			}
			var msg = 'Missing arguments';
			if (__t__ (self.node !== null)) {
				var msg = (function () {
					var __accu0__ = 'Missing arguments to {!r}';
					return __call__ (__accu0__.format, __accu0__, self.node);
				}) ();
			}
			var __except0__ = __call__ (LatexWalkerParseError, null, msg, self.node_pos);
			__except0__.__cause__ = null;
			throw __except0__;
		}
		var args_info = dict ({});
		var arg_names_seen = __call__ (set, null);
		var arg_i_seen = __call__ (set, null);
		if (__t__ (__t__ (args === null) && include_unrequested_argnames === null)) {
			var include_unrequested_argnames = true;
		}
		if (__t__ (__t__ (args === null) && include_unrequested_argindices === null)) {
			var include_unrequested_argindices = true;
		}
		var __iterable0__ = __call__ (enumerate, null, self.parsed_arguments.arguments_spec_list);
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var __left0__ = __getitem__ (__iterable0__, __index0__);
			var j = __left0__ [0];
			var arg_spec = __left0__ [1];
			var argument_node_object = __getitem__ (self.parsed_arguments.argnlist, j);
			var arg_requested = false;
			var arg_requested_by_name = false;
			var arg_requested_by_index = false;
			if (__t__ (args !== null)) {
				if (__t__ (__t__ (arg_spec.argname) && __in__ (arg_spec.argname, args))) {
					var arg_requested = true;
					var arg_requested_by_name = true;
					(function () {
						var __accu0__ = arg_names_seen;
						return __call__ (__accu0__.add, __accu0__, arg_spec.argname);
					}) ();
				}
				if (__t__ (__in__ (j, args))) {
					var arg_requested = true;
					var arg_requested_by_index = true;
					(function () {
						var __accu0__ = arg_i_seen;
						return __call__ (__accu0__.add, __accu0__, j);
					}) ();
				}
			}
			else {
				var arg_requested = true;
			}
			if (__t__ (!__t__ ((arg_requested)))) {
				if (__t__ (!__t__ ((allow_additional_arguments)))) {
					var __except0__ = __call__ (LatexWalkerParseError, null, (function () {
						var __accu0__ = 'Got unexpected argument ‘{}’';
						return __call__ (__accu0__.format, __accu0__, arg_spec.argname);
					}) (), __kwargtrans__ ({pos: (__t__ (argument_node_object !== null) ? argument_node_object.pos : null)}));
					__except0__.__cause__ = null;
					throw __except0__;
				}
				continue;
			}
			var arg_info = __call__ (SingleParsedArgumentInfo, null, argument_node_object);
			if (__t__ (__t__ (arg_spec.argname) && (__t__ (arg_requested_by_name) || include_unrequested_argnames))) {
				__setitem__ (args_info, arg_spec.argname, arg_info);
			}
			if (__t__ (__t__ (arg_requested_by_index) || include_unrequested_argindices)) {
				__setitem__ (args_info, j, arg_info);
			}
		}
		if (__t__ (__t__ (!__t__ ((skip_nonexistent_arguments))) && args !== null)) {
			var __iterable0__ = args;
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var arg_x = __getitem__ (__iterable0__, __index0__);
				if (__t__ (__t__ (!__in__ (arg_x, arg_names_seen)) && !__in__ (arg_x, arg_i_seen))) {
					var __except0__ = __call__ (ValueError, null, (function () {
						var __accu0__ = 'Missing argument {}';
						return __call__ (__accu0__.format, __accu0__, (__t__ (__call__ (isinstance, null, arg_x, str)) ? __add__ (__add__ ('‘', arg_x), '’') : __call__ (str, null, arg_x)));
					}) ());
					__except0__.__cause__ = null;
					throw __except0__;
				}
			}
		}
		return args_info;
	});}
});

