var logging = {};
var re = {};
import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import {read_latex_file} from './latex2text_jscompat.js';
import * as __module_logging__ from './logging.js';
__nest__ (logging, '', __module_logging__);
import * as _util from './pylatexenc._util.js';
import * as macrospec from './pylatexenc.macrospec.js';
import * as latexnodes_parsers from './pylatexenc.latexnodes.parsers.js';
import * as latexnodes_nodes from './pylatexenc.latexnodes.nodes.js';
import * as latexwalker from './pylatexenc.latexwalker.js';
import {apply_percent_substitution as _apply_percent_substitution} from './latex2text_jscompat.js';
import {fill_text_paragraph as _fill_text_paragraph} from './latex2text_jscompat.js';
import * as __module_re__ from './re.js';
__nest__ (re, '', __module_re__);
export {macrospec, latexnodes_parsers, _fill_text_paragraph, _util, latexnodes_nodes, latexwalker, _apply_percent_substitution, read_latex_file};
var __name__ = 'pylatexenc.latex2text';
export var _simplify_repl_fn_arg_names = function (fn) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'fn': var fn = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	return tuple (['l2tobj', 'l2tstate', 'macroname', 'environmentname', 'specials_chars']);
};
export var logger = (function () {
	var __accu0__ = logging;
	return __call__ (__accu0__.getLogger, __accu0__, __name__);
}) ();
export var _split_chars = function (s) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 's': var s = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var chars = [];
	var i = 0;
	var num = __call__ (len, null, s);
	while (__t__ (__lt__ (i, num))) {
		var c = __getitem__ (s, i);
		var oc = __call__ (ord, null, c);
		if (__t__ (__t__ (__ge__ (oc, 55296)) && __t__ (__le__ (oc, 56319)) && __lt__ (__add__ (i, 1), num))) {
			(function () {
				var __accu0__ = chars;
				return __call__ (__accu0__.append, __accu0__, __getslice__ (s, i, __add__ (i, 2), 1));
			}) ();
			var i = __add__ (i, 2);
			continue;
		}
		(function () {
			var __accu0__ = chars;
			return __call__ (__accu0__.append, __accu0__, c);
		}) ();
		var i = __add__ (i, 1);
	}
	return chars;
};
export var _num_chars = function (s) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 's': var s = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	return __call__ (len, null, __call__ (_split_chars, null, s));
};
export var MacroTextSpec =  __class__ ('MacroTextSpec', [object], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, macroname, simplify_repl, discard) {
		if (typeof simplify_repl == 'undefined' || (simplify_repl != null && simplify_repl.hasOwnProperty ("__kwargtrans__"))) {;
			var simplify_repl = null;
		};
		if (typeof discard == 'undefined' || (discard != null && discard.hasOwnProperty ("__kwargtrans__"))) {;
			var discard = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'macroname': var macroname = __allkwargs0__ [__attrib0__]; break;
						case 'simplify_repl': var simplify_repl = __allkwargs0__ [__attrib0__]; break;
						case 'discard': var discard = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, MacroTextSpec, '__init__'), null, self);
		self.macroname = macroname;
		self.discard = (__t__ (discard === null) ? true : discard);
		self.simplify_repl = simplify_repl;
	});}
});
export var EnvironmentTextSpec =  __class__ ('EnvironmentTextSpec', [object], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, environmentname, simplify_repl, discard) {
		if (typeof simplify_repl == 'undefined' || (simplify_repl != null && simplify_repl.hasOwnProperty ("__kwargtrans__"))) {;
			var simplify_repl = null;
		};
		if (typeof discard == 'undefined' || (discard != null && discard.hasOwnProperty ("__kwargtrans__"))) {;
			var discard = false;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'environmentname': var environmentname = __allkwargs0__ [__attrib0__]; break;
						case 'simplify_repl': var simplify_repl = __allkwargs0__ [__attrib0__]; break;
						case 'discard': var discard = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, EnvironmentTextSpec, '__init__'), null, self);
		self.environmentname = environmentname;
		self.simplify_repl = simplify_repl;
		self.discard = discard;
	});}
});
export var SpecialsTextSpec =  __class__ ('SpecialsTextSpec', [object], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, specials_chars, simplify_repl) {
		if (typeof simplify_repl == 'undefined' || (simplify_repl != null && simplify_repl.hasOwnProperty ("__kwargtrans__"))) {;
			var simplify_repl = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'specials_chars': var specials_chars = __allkwargs0__ [__attrib0__]; break;
						case 'simplify_repl': var simplify_repl = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, SpecialsTextSpec, '__init__'), null, self);
		self.specials_chars = specials_chars;
		self.simplify_repl = simplify_repl;
	});}
});
export var EnvDef = function (envname, simplify_repl, discard) {
	if (typeof simplify_repl == 'undefined' || (simplify_repl != null && simplify_repl.hasOwnProperty ("__kwargtrans__"))) {;
		var simplify_repl = null;
	};
	if (typeof discard == 'undefined' || (discard != null && discard.hasOwnProperty ("__kwargtrans__"))) {;
		var discard = false;
	};
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'envname': var envname = __allkwargs0__ [__attrib0__]; break;
					case 'simplify_repl': var simplify_repl = __allkwargs0__ [__attrib0__]; break;
					case 'discard': var discard = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var e = __call__ (EnvironmentTextSpec, null, __kwargtrans__ ({environmentname: envname, simplify_repl: simplify_repl, discard: discard}));
	e.envname = e.environmentname;
	return e;
};
export var MacroDef = function (macname, simplify_repl, discard) {
	if (typeof simplify_repl == 'undefined' || (simplify_repl != null && simplify_repl.hasOwnProperty ("__kwargtrans__"))) {;
		var simplify_repl = null;
	};
	if (typeof discard == 'undefined' || (discard != null && discard.hasOwnProperty ("__kwargtrans__"))) {;
		var discard = null;
	};
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'macname': var macname = __allkwargs0__ [__attrib0__]; break;
					case 'simplify_repl': var simplify_repl = __allkwargs0__ [__attrib0__]; break;
					case 'discard': var discard = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var m = __call__ (MacroTextSpec, null, __kwargtrans__ ({macroname: macname, simplify_repl: simplify_repl, discard: discard}));
	m.macname = m.macroname;
	return m;
};
export var fmt_equation_environment = function (envnode, l2tobj) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'envnode': var envnode = __allkwargs0__ [__attrib0__]; break;
					case 'l2tobj': var l2tobj = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	return (function () {
		var __accu0__ = l2tobj;
		return __call__ (__accu0__.math_node_to_text, __accu0__, envnode);
	}) ();
};
export var fmt_input_macro = function (macronode, l2tobj) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'macronode': var macronode = __allkwargs0__ [__attrib0__]; break;
					case 'l2tobj': var l2tobj = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	return (function () {
		var __accu0__ = l2tobj;
		return __call__ (__accu0__._input_node_simplify_repl, __accu0__, macronode);
	}) ();
};
export var placeholder_node_formatter = function (placeholdertext, block) {
	if (typeof block == 'undefined' || (block != null && block.hasOwnProperty ("__kwargtrans__"))) {;
		var block = true;
	};
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'placeholdertext': var placeholdertext = __allkwargs0__ [__attrib0__]; break;
					case 'block': var block = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var formatter = function (n, l2tobj) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'n': var n = __allkwargs0__ [__attrib0__]; break;
						case 'l2tobj': var l2tobj = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return __call__ (_do_fmt_placeholder_node, null, placeholdertext, l2tobj, __kwargtrans__ ({block: block}));
	};
	return formatter;
};
export var _do_fmt_placeholder_node = function (placeholdertext, l2tobj, block) {
	if (typeof block == 'undefined' || (block != null && block.hasOwnProperty ("__kwargtrans__"))) {;
		var block = true;
	};
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'placeholdertext': var placeholdertext = __allkwargs0__ [__attrib0__]; break;
					case 'l2tobj': var l2tobj = __allkwargs0__ [__attrib0__]; break;
					case 'block': var block = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var txt = __add__ (__add__ ('< ', (function () {
		var __accu0__ = ' ';
		return __call__ (__accu0__.join, __accu0__, placeholdertext);
	}) ()), ' >');
	if (__t__ (block)) {
		return (function () {
			var __accu0__ = l2tobj;
			return __call__ (__accu0__._fmt_indented_block, __accu0__, txt, __kwargtrans__ ({indent: '    '}));
		}) ();
	}
	return __add__ (__add__ (' ', txt), ' ');
};
export var fmt_placeholder_node = function (node, l2tobj) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'node': var node = __allkwargs0__ [__attrib0__]; break;
					case 'l2tobj': var l2tobj = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var __break0__ = false;
	var __iterable0__ = tuple (['macroname', 'environmentname', 'specials_chars']);
	for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
		var att = __getitem__ (__iterable0__, __index0__);
		if (__t__ (__call__ (hasattr, null, node, att))) {
			var py_name = __call__ (getattr, null, node, att);
			__break0__ = true;
			break;
		}
	}
	if (!__break0__) {
		var py_name = '<unknown>';
	}
	return __call__ (_do_fmt_placeholder_node, null, py_name, l2tobj);
};
export var fmt_matrix_environment_node = function (node, l2tobj) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'node': var node = __allkwargs0__ [__attrib0__]; break;
					case 'l2tobj': var l2tobj = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var StateType = __class__ ('StateType', [object], {
		__module__: __name__,
		get __init__ () {return __get__ (this, function (self) {
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
			self.matrix_rows = [];
			self.buffer_this_column = [];
			self.buffer_nodes = [];
		});},
		get add_content () {return __get__ (this, function (self, node) {
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
			(function () {
				var __accu0__ = self.buffer_nodes;
				return __call__ (__accu0__.append, __accu0__, node);
			}) ();
		});},
		get new_column () {return __get__ (this, function (self) {
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
			if (__t__ (self.buffer_nodes)) {
				(function () {
					var __accu0__ = self.buffer_this_column;
					return __call__ (__accu0__.append, __accu0__, (function () {
						var __accu1__ = __call__ (str, null, (function () {
							var __accu2__ = l2tobj;
							return __call__ (__accu2__.nodelist_to_text, __accu2__, self.buffer_nodes);
						}) ());
						return __call__ (__accu1__.strip, __accu1__);
					}) ());
				}) ();
			}
			self.buffer_nodes = [];
		});},
		get new_row () {return __get__ (this, function (self) {
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
			(function () {
				var __accu0__ = self;
				return __call__ (__accu0__.new_column, __accu0__);
			}) ();
			(function () {
				var __accu0__ = self.matrix_rows;
				return __call__ (__accu0__.append, __accu0__, self.buffer_this_column);
			}) ();
			self.buffer_this_column = [];
		});}
	});
	var state = __call__ (StateType, null);
	var __iterable0__ = node.nodelist;
	for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
		var n = __getitem__ (__iterable0__, __index0__);
		if (__t__ (__t__ ((function () {
			var __accu0__ = n;
			return __call__ (__accu0__.isNodeType, __accu0__, latexnodes_nodes.LatexSpecialsNode);
		}) ()) && __eq__ (n.specials_chars, '&'))) {
			(function () {
				var __accu0__ = state;
				return __call__ (__accu0__.new_column, __accu0__);
			}) ();
			continue;
		}
		if (__t__ (__t__ ((function () {
			var __accu0__ = n;
			return __call__ (__accu0__.isNodeType, __accu0__, latexnodes_nodes.LatexMacroNode);
		}) ()) && __eq__ (n.macroname, '\\'))) {
			(function () {
				var __accu0__ = state;
				return __call__ (__accu0__.new_row, __accu0__);
			}) ();
			continue;
		}
		(function () {
			var __accu0__ = state;
			return __call__ (__accu0__.add_content, __accu0__, n);
		}) ();
	}
	(function () {
		var __accu0__ = state;
		return __call__ (__accu0__.new_row, __accu0__);
	}) ();
	var block = __call__ (_MathBlockPiece, null, __kwargtrans__ ({rows: state.matrix_rows, delimiters: tuple (['[', ']'])}));
	if (__t__ (__t__ (__eq__ (l2tobj.math_mode, 'fancy')) && l2tobj.state.in_math_mode)) {
		return block;
	}
	return (function () {
		var __accu0__ = block;
		return __call__ (__accu0__.to_text, __accu0__);
	}) ();
};
export var _itemize_markers = tuple (['•', '–', '*', '·']);
export var _fmt_counter_alph = function (value) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'value': var value = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var s = '';
	while (__t__ (__gt__ (value, 0))) {
		var __left0__ = __call__ (divmod, null, __sub__ (value, 1), 26);
		var value = __left0__ [0];
		var r = __left0__ [1];
		var s = __add__ (__call__ (chr, null, __add__ (__call__ (ord, null, 'a'), r)), s);
	}
	return s;
};
export var _roman_numerals = tuple ([tuple ([1000, 'm']), tuple ([900, 'cm']), tuple ([500, 'd']), tuple ([400, 'cd']), tuple ([100, 'c']), tuple ([90, 'xc']), tuple ([50, 'l']), tuple ([40, 'xl']), tuple ([10, 'x']), tuple ([9, 'ix']), tuple ([5, 'v']), tuple ([4, 'iv']), tuple ([1, 'i'])]);
export var _fmt_counter_roman = function (value) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'value': var value = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var s = '';
	var __iterable0__ = _roman_numerals;
	for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
		var __left0__ = __getitem__ (__iterable0__, __index0__);
		var numvalue = __left0__ [0];
		var numsym = __left0__ [1];
		while (__t__ (__ge__ (value, numvalue))) {
			var s = __call__ (__iadd__, null, s, numsym);
			var value = __call__ (__isub__, null, value, numvalue);
		}
	}
	return s;
};
export var _enumerate_markers = tuple ([(function __lambda__ (value) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'value': var value = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	return (function () {
		var __accu0__ = '{}.';
		return __call__ (__accu0__.format, __accu0__, value);
	}) ();
}), (function __lambda__ (value) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'value': var value = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	return (function () {
		var __accu0__ = '({})';
		return __call__ (__accu0__.format, __accu0__, __call__ (_fmt_counter_alph, null, value));
	}) ();
}), (function __lambda__ (value) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'value': var value = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	return (function () {
		var __accu0__ = '{}.';
		return __call__ (__accu0__.format, __accu0__, __call__ (_fmt_counter_roman, null, value));
	}) ();
}), (function __lambda__ (value) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'value': var value = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	return (function () {
		var __accu0__ = '{}.';
		return __call__ (__accu0__.format, __accu0__, (function () {
			var __accu1__ = __call__ (_fmt_counter_alph, null, value);
			return __call__ (__accu1__.upper, __accu1__);
		}) ());
	}) ();
})]);
export var _list_environment_kinds = dict ({'itemize': 'itemize', 'list': 'itemize', 'trivlist': 'itemize', 'enumerate': 'enumerate', 'exenumerate': 'enumerate', 'description': 'description'});
export var _ListLevel =  __class__ ('_ListLevel', [object], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, environmentname, kind, depth, marker_depth) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'environmentname': var environmentname = __allkwargs0__ [__attrib0__]; break;
						case 'kind': var kind = __allkwargs0__ [__attrib0__]; break;
						case 'depth': var depth = __allkwargs0__ [__attrib0__]; break;
						case 'marker_depth': var marker_depth = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, _ListLevel, '__init__'), null, self);
		self.environmentname = environmentname;
		self.kind = kind;
		self.depth = depth;
		self.marker_depth = marker_depth;
		self.counter = 0;
	});},
	get next_marker () {return __get__ (this, function (self) {
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
		self.counter = __call__ (__iadd__, null, self.counter, 1);
		if (__t__ (__eq__ (self.kind, 'description'))) {
			return '';
		}
		if (__t__ (__eq__ (self.kind, 'enumerate'))) {
			var fmt = __getitem__ (_enumerate_markers, __mod__ (__sub__ (self.marker_depth, 1), __call__ (len, null, _enumerate_markers)));
			return __call__ (fmt, null, self.counter);
		}
		return __getitem__ (_itemize_markers, __mod__ (__sub__ (self.marker_depth, 1), __call__ (len, null, _itemize_markers)));
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
			var __accu0__ = '_ListLevel(environmentname={!r}, kind={!r}, depth={!r}, marker_depth={!r}, counter={!r})';
			return __call__ (__accu0__.format, __accu0__, self.environmentname, self.kind, self.depth, self.marker_depth, self.counter);
		}) ();
	});}
});
export var _split_nodelist_at_items = function (nodelist) {
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
	var preamble = [];
	var py_items = [];
	var item_node = null;
	var item_body = null;
	var __iterable0__ = (__t__ (nodelist !== null) ? nodelist : []);
	for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
		var n = __getitem__ (__iterable0__, __index0__);
		if (__t__ (__t__ (n !== null) && __t__ ((function () {
			var __accu0__ = n;
			return __call__ (__accu0__.isNodeType, __accu0__, latexnodes_nodes.LatexMacroNode);
		}) ()) && __eq__ (n.macroname, 'item'))) {
			if (__t__ (item_body !== null)) {
				(function () {
					var __accu0__ = py_items;
					return __call__ (__accu0__.append, __accu0__, tuple ([item_node, item_body]));
				}) ();
			}
			var item_node = n;
			var item_body = [];
			continue;
		}
		if (__t__ (item_body === null)) {
			(function () {
				var __accu0__ = preamble;
				return __call__ (__accu0__.append, __accu0__, n);
			}) ();
		}
		else {
			(function () {
				var __accu0__ = item_body;
				return __call__ (__accu0__.append, __accu0__, n);
			}) ();
		}
	}
	if (__t__ (item_body !== null)) {
		(function () {
			var __accu0__ = py_items;
			return __call__ (__accu0__.append, __accu0__, tuple ([item_node, item_body]));
		}) ();
	}
	return tuple ([preamble, py_items]);
};
export var _fmt_indent_block = function (contents, indent) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'contents': var contents = __allkwargs0__ [__attrib0__]; break;
					case 'indent': var indent = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	return (function () {
		var __accu0__ = '\n';
		return __call__ (__accu0__.join, __accu0__, (function () {
			var __accu1__ = [];
			var __iterable0__ = (function () {
				var __accu2__ = contents;
				return __call__ (__accu2__.py_split, __accu2__, '\n');
			}) ();
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var line = __getitem__ (__iterable0__, __index0__);
				(function () {
					var __accu2__ = __accu1__;
					return __call__ (__accu2__.append, __accu2__, (__t__ ((function () {
						var __accu3__ = line;
						return __call__ (__accu3__.strip, __accu3__);
					}) ()) ? (function () {
						var __accu3__ = __add__ (indent, line);
						return __call__ (__accu3__.rstrip, __accu3__);
					}) () : ''));
				}) ();
			}
			return __accu1__;
		}) ());
	}) ();
};
export var _fmt_hanging_indent = function (prefix, contents) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'prefix': var prefix = __allkwargs0__ [__attrib0__]; break;
					case 'contents': var contents = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	if (__t__ (!__t__ ((contents)))) {
		return (function () {
			var __accu0__ = prefix;
			return __call__ (__accu0__.rstrip, __accu0__);
		}) ();
	}
	var lines = (function () {
		var __accu0__ = contents;
		return __call__ (__accu0__.py_split, __accu0__, '\n');
	}) ();
	var hang = __mul__ (' ', __call__ (_num_chars, null, prefix));
	return (function () {
		var __accu0__ = '\n';
		return __call__ (__accu0__.join, __accu0__, __add__ ([(function () {
			var __accu1__ = __add__ (prefix, __getitem__ (lines, 0));
			return __call__ (__accu1__.rstrip, __accu1__);
		}) ()], (function () {
			var __accu1__ = [];
			var __iterable0__ = __getslice__ (lines, 1, null, 1);
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var line = __getitem__ (__iterable0__, __index0__);
				(function () {
					var __accu2__ = __accu1__;
					return __call__ (__accu2__.append, __accu2__, (__t__ ((function () {
						var __accu3__ = line;
						return __call__ (__accu3__.strip, __accu3__);
					}) ()) ? (function () {
						var __accu3__ = __add__ (hang, line);
						return __call__ (__accu3__.rstrip, __accu3__);
					}) () : ''));
				}) ();
			}
			return __accu1__;
		}) ()));
	}) ();
};
export var fmt_list_environment = function (node, l2tobj, environmentname) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'node': var node = __allkwargs0__ [__attrib0__]; break;
					case 'l2tobj': var l2tobj = __allkwargs0__ [__attrib0__]; break;
					case 'environmentname': var environmentname = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var kind = (function () {
		var __accu0__ = _list_environment_kinds;
		return __call__ (__accu0__.py_get, __accu0__, environmentname, 'itemize');
	}) ();
	var list_stack = l2tobj.state.list_stack;
	var level = __call__ (_ListLevel, null, environmentname, kind, __kwargtrans__ ({depth: __add__ (__call__ (len, null, list_stack), 1), marker_depth: __add__ (1, __call__ (len, null, (function () {
		var __accu0__ = [];
		var __iterable0__ = list_stack;
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var lvl = __getitem__ (__iterable0__, __index0__);
			if (__t__ (__eq__ (lvl.kind, kind))) {
				(function () {
					var __accu1__ = __accu0__;
					return __call__ (__accu1__.append, __accu1__, lvl);
				}) ();
			}
		}
		return __accu0__;
	}) ()))}));
	var __withid0__ = (function () {
		var __accu0__ = l2tobj;
		return __call__ (__accu0__.push_state, __accu0__, __kwargtrans__ ({list_stack: __add__ (list_stack, [level])}));
	}) ();
	try {
		__withid0__.__enter__ ();
		var __left0__ = __call__ (_split_nodelist_at_items, null, node.nodelist);
		var preamble_nodes = __left0__ [0];
		var py_items = __left0__ [1];
		var preamble = (function () {
			var __accu0__ = __call__ (str, null, (function () {
				var __accu1__ = l2tobj;
				return __call__ (__accu1__.nodelist_to_text, __accu1__, preamble_nodes);
			}) ());
			return __call__ (__accu0__.strip, __accu0__);
		}) ();
		var item_texts = (function () {
			var __accu0__ = [];
			var __iterable0__ = py_items;
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var __left0__ = __getitem__ (__iterable0__, __index0__);
				var itemnode = __left0__ [0];
				var itembody = __left0__ [1];
				(function () {
					var __accu1__ = __accu0__;
					return __call__ (__accu1__.append, __accu1__, __call__ (fmt_list_item, null, itemnode, itembody, l2tobj, level));
				}) ();
			}
			return __accu0__;
		}) ();
		__withid0__.__exit__ ();
	}
	catch (__except0__) {
		if (! (__withid0__.__exit__ (__except0__.name, __except0__, __except0__.stack))) {
			throw __except0__;
		}
	}
	var chunks = (function () {
		var __accu0__ = [];
		var __iterable0__ = __add__ ([preamble], item_texts);
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var x = __getitem__ (__iterable0__, __index0__);
			if (__t__ (x)) {
				(function () {
					var __accu1__ = __accu0__;
					return __call__ (__accu1__.append, __accu1__, x);
				}) ();
			}
		}
		return __accu0__;
	}) ();
	if (__t__ (!__t__ ((chunks)))) {
		return '\n';
	}
	var contents = (function () {
		var __accu0__ = '\n';
		return __call__ (__accu0__.join, __accu0__, chunks);
	}) ();
	if (__t__ (__eq__ (level.depth, 1))) {
		var contents = __call__ (_fmt_indent_block, null, contents, '  ');
	}
	return __add__ (__add__ ('\n', contents), '\n');
};
export var fmt_list_item = function (itemnode, itembody, l2tobj, level) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'itemnode': var itemnode = __allkwargs0__ [__attrib0__]; break;
					case 'itembody': var itembody = __allkwargs0__ [__attrib0__]; break;
					case 'l2tobj': var l2tobj = __allkwargs0__ [__attrib0__]; break;
					case 'level': var level = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var label = '';
	if (__t__ (itemnode !== null)) {
		var label = (function () {
			var __accu0__ = (function () {
				var __accu1__ = l2tobj;
				return __call__ (__accu1__.node_arg_to_text, __accu1__, itemnode, 0);
			}) ();
			return __call__ (__accu0__.strip, __accu0__);
		}) ();
	}
	if (__t__ (label)) {
		var marker = label;
	}
	else {
		var marker = (function () {
			var __accu0__ = level;
			return __call__ (__accu0__.next_marker, __accu0__);
		}) ();
	}
	var contents = (function () {
		var __accu0__ = __call__ (str, null, (function () {
			var __accu1__ = l2tobj;
			return __call__ (__accu1__.nodelist_to_text, __accu1__, itembody);
		}) ());
		return __call__ (__accu0__.strip, __accu0__);
	}) ();
	var prefix = (__t__ (marker) ? __add__ (marker, ' ') : '');
	return __call__ (_fmt_hanging_indent, null, prefix, contents);
};
export var fmt_item_macro = function (node, l2tobj) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'node': var node = __allkwargs0__ [__attrib0__]; break;
					case 'l2tobj': var l2tobj = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var label = (function () {
		var __accu0__ = (function () {
			var __accu1__ = l2tobj;
			return __call__ (__accu1__.node_arg_to_text, __accu1__, node, 0);
		}) ();
		return __call__ (__accu0__.strip, __accu0__);
	}) ();
	if (__t__ (!__t__ ((label)))) {
		var list_stack = l2tobj.state.list_stack;
		if (__t__ (list_stack)) {
			var label = (function () {
				var __accu0__ = __getitem__ (list_stack, __neg__ (1));
				return __call__ (__accu0__.next_marker, __accu0__);
			}) ();
		}
		else {
			var label = __getitem__ (_itemize_markers, 0);
		}
		var label = __add__ (label, ' ');
	}
	return __add__ ('\n  ', label);
};
export var _fmt_math_style_offsets = dict ({'bold': tuple ([119808, 119834]), 'italic': tuple ([119860, 119886]), 'bold-italic': tuple ([119912, 119938]), 'script': tuple ([119964, 119990]), 'bold-script': tuple ([120016, 120042]), 'fraktur': tuple ([120068, 120094]), 'doublestruck': tuple ([120120, 120146]), 'bold-fraktur': tuple ([120172, 120198]), 'sans': tuple ([120224, 120250]), 'sans-bold': tuple ([120276, 120302]), 'sans-italic': tuple ([120328, 120354]), 'sans-bold-italic': tuple ([120380, 120406]), 'monospace': tuple ([120432, 120458])});
export var _fmt_math_style_exceptions = dict ({'italic': dict ([[__call__ (ord, null, 'h'), __call__ (chr, null, 8462)]]), 'script': dict ([[__call__ (ord, null, 'B'), __call__ (chr, null, 8492)], [__call__ (ord, null, 'E'), __call__ (chr, null, 8496)], [__call__ (ord, null, 'F'), __call__ (chr, null, 8497)], [__call__ (ord, null, 'H'), __call__ (chr, null, 8459)], [__call__ (ord, null, 'I'), __call__ (chr, null, 8464)], [__call__ (ord, null, 'L'), __call__ (chr, null, 8466)], [__call__ (ord, null, 'M'), __call__ (chr, null, 8499)], [__call__ (ord, null, 'R'), __call__ (chr, null, 8475)], [__call__ (ord, null, 'e'), __call__ (chr, null, 8495)], [__call__ (ord, null, 'g'), __call__ (chr, null, 8458)], [__call__ (ord, null, 'o'), __call__ (chr, null, 8500)]]), 'fraktur': dict ([[__call__ (ord, null, 'C'), __call__ (chr, null, 8493)], [__call__ (ord, null, 'H'), __call__ (chr, null, 8460)], [__call__ (ord, null, 'I'), __call__ (chr, null, 8465)], [__call__ (ord, null, 'R'), __call__ (chr, null, 8476)], [__call__ (ord, null, 'Z'), __call__ (chr, null, 8488)]]), 'doublestruck': dict ([[__call__ (ord, null, 'C'), __call__ (chr, null, 8450)], [__call__ (ord, null, 'H'), __call__ (chr, null, 8461)], [__call__ (ord, null, 'N'), __call__ (chr, null, 8469)], [__call__ (ord, null, 'P'), __call__ (chr, null, 8473)], [__call__ (ord, null, 'Q'), __call__ (chr, null, 8474)], [__call__ (ord, null, 'R'), __call__ (chr, null, 8477)], [__call__ (ord, null, 'Z'), __call__ (chr, null, 8484)]])});
var __left0__ = tuple ([__call__ (ord, null, 'A'), __call__ (ord, null, 'Z'), __call__ (ord, null, 'a'), __call__ (ord, null, 'z')]);
export var _oA = __left0__ [0];
export var _oZ = __left0__ [1];
export var _oa = __left0__ [2];
export var _oz = __left0__ [3];
export var _fmt_math_style_char = function (c, style) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'c': var c = __allkwargs0__ [__attrib0__]; break;
					case 'style': var style = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var oc = __call__ (ord, null, c);
	var z = (function () {
		var __accu0__ = (function () {
			var __accu1__ = _fmt_math_style_exceptions;
			return __call__ (__accu1__.py_get, __accu1__, style, dict ({}));
		}) ();
		return __call__ (__accu0__.py_get, __accu0__, oc, null);
	}) ();
	if (__t__ (z !== null)) {
		return z;
	}
	var __left0__ = (function () {
		var __accu0__ = _fmt_math_style_offsets;
		return __call__ (__accu0__.py_get, __accu0__, style, tuple ([_oA, _oa]));
	}) ();
	var offset_up = __left0__ [0];
	var offset_lo = __left0__ [1];
	if (__t__ (__t__ (__ge__ (oc, _oA)) && __le__ (oc, _oZ))) {
		return __call__ (chr, null, __sub__ (__add__ (offset_up, oc), _oA));
	}
	if (__t__ (__t__ (__ge__ (oc, _oa)) && __le__ (oc, _oz))) {
		return __call__ (chr, null, __sub__ (__add__ (offset_lo, oc), _oa));
	}
	return c;
};
export var fmt_math_text_style = function (text, style) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'text': var text = __allkwargs0__ [__attrib0__]; break;
					case 'style': var style = __allkwargs0__ [__attrib0__]; break;
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
			var __iterable0__ = __call__ (_split_chars, null, text);
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var c = __getitem__ (__iterable0__, __index0__);
				(function () {
					var __accu2__ = __accu1__;
					return __call__ (__accu2__.append, __accu2__, __call__ (_fmt_math_style_char, null, c, __kwargtrans__ ({style: style})));
				}) ();
			}
			return __accu1__;
		}) ());
	}) ();
};
export var _make_fmt_math_style_plain_chars = function () {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
			}
		}
	}
	else {
	}
	var d = dict ({});
	var __iterable0__ = (function () {
		var __accu0__ = _fmt_math_style_offsets;
		return __call__ (__accu0__.py_values, __accu0__);
	}) ();
	for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
		var offsets = __getitem__ (__iterable0__, __index0__);
		var __left0__ = offsets;
		var offset_up = __left0__ [0];
		var offset_lo = __left0__ [1];
		for (var k = 0; k < 26; k++) {
			__setitem__ (d, __call__ (chr, null, __add__ (offset_up, k)), __call__ (chr, null, __add__ (_oA, k)));
			__setitem__ (d, __call__ (chr, null, __add__ (offset_lo, k)), __call__ (chr, null, __add__ (_oa, k)));
		}
	}
	var __iterable0__ = (function () {
		var __accu0__ = _fmt_math_style_exceptions;
		return __call__ (__accu0__.py_values, __accu0__);
	}) ();
	for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
		var exceptions = __getitem__ (__iterable0__, __index0__);
		var __iterable1__ = (function () {
			var __accu0__ = exceptions;
			return __call__ (__accu0__.py_items, __accu0__);
		}) ();
		for (var __index1__ = 0; __index1__ < len (__iterable1__); __index1__++) {
			var __left0__ = __getitem__ (__iterable1__, __index1__);
			var oc = __left0__ [0];
			var c = __left0__ [1];
			__setitem__ (d, c, __call__ (chr, null, oc));
		}
	}
	return d;
};
export var _fmt_math_style_plain_chars = __call__ (_make_fmt_math_style_plain_chars, null);
export var _fmt_superscript_chars = dict ({'0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', 'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ', 'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ', 'i': 'ⁱ', 'j': 'ʲ', 'k': 'ᵏ', 'l': 'ˡ', 'm': 'ᵐ', 'n': 'ⁿ', 'o': 'ᵒ', 'p': 'ᵖ', 'r': 'ʳ', 's': 'ˢ', 't': 'ᵗ', 'u': 'ᵘ', 'v': 'ᵛ', 'w': 'ʷ', 'x': 'ˣ', 'y': 'ʸ', 'z': 'ᶻ', 'A': 'ᴬ', 'B': 'ᴮ', 'D': 'ᴰ', 'E': 'ᴱ', 'G': 'ᴳ', 'H': 'ᴴ', 'I': 'ᴵ', 'J': 'ᴶ', 'K': 'ᴷ', 'L': 'ᴸ', 'M': 'ᴹ', 'N': 'ᴺ', 'O': 'ᴼ', 'P': 'ᴾ', 'R': 'ᴿ', 'T': 'ᵀ', 'U': 'ᵁ', 'V': 'ⱽ', 'W': 'ᵂ', 'β': 'ᵝ', 'γ': 'ᵞ', 'δ': 'ᵟ', 'θ': 'ᶿ', 'ϑ': 'ᶿ', 'φ': 'ᵠ', 'ϕ': 'ᵠ', 'χ': 'ᵡ'});
export var _fmt_subscript_chars = dict ({'0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎', 'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ', 'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ', 'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ', 'v': 'ᵥ', 'x': 'ₓ', 'β': 'ᵦ', 'γ': 'ᵧ', 'ρ': 'ᵨ', 'ϱ': 'ᵨ', 'φ': 'ᵩ', 'ϕ': 'ᵩ', 'χ': 'ᵪ'});
export var _fmt_subsuperscript_charmaps = dict ({'superscript': _fmt_superscript_chars, 'subscript': _fmt_subscript_chars});
export var fmt_subsuperscript_text = function (text, which, normalize_math_style_chars) {
	if (typeof normalize_math_style_chars == 'undefined' || (normalize_math_style_chars != null && normalize_math_style_chars.hasOwnProperty ("__kwargtrans__"))) {;
		var normalize_math_style_chars = false;
	};
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'text': var text = __allkwargs0__ [__attrib0__]; break;
					case 'which': var which = __allkwargs0__ [__attrib0__]; break;
					case 'normalize_math_style_chars': var normalize_math_style_chars = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var charmap = __getitem__ (_fmt_subsuperscript_charmaps, which);
	var result = [];
	var __iterable0__ = __call__ (_split_chars, null, text);
	for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
		var c = __getitem__ (__iterable0__, __index0__);
		if (__t__ (normalize_math_style_chars)) {
			var c = (function () {
				var __accu0__ = _fmt_math_style_plain_chars;
				return __call__ (__accu0__.py_get, __accu0__, c, c);
			}) ();
		}
		var cc = (function () {
			var __accu0__ = charmap;
			return __call__ (__accu0__.py_get, __accu0__, c, null);
		}) ();
		if (__t__ (cc === null)) {
			return null;
		}
		(function () {
			var __accu0__ = result;
			return __call__ (__accu0__.append, __accu0__, cc);
		}) ();
	}
	return (function () {
		var __accu0__ = '';
		return __call__ (__accu0__.join, __accu0__, result);
	}) ();
};
export var _math_expression_in_presets = dict ({'braces': tuple (['{', '}']), 'parens': tuple (['(', ')'])});
export var default_math_expression_in = 'parens';
export var _parse_math_expression_in = function (math_expression_in) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'math_expression_in': var math_expression_in = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	if (__t__ (math_expression_in === null)) {
		return null;
	}
	if (__t__ (__call__ (isinstance, null, math_expression_in, str))) {
		if (__t__ (!__in__ (math_expression_in, _math_expression_in_presets))) {
			var __except0__ = __call__ (ValueError, null, (function () {
				var __accu0__ = "invalid value for math_expression_in: {!r} (expected 'braces', 'parens', a pair of delimiters, or None)";
				return __call__ (__accu0__.format, __accu0__, math_expression_in);
			}) ());
			__except0__.__cause__ = null;
			throw __except0__;
		}
		return __getitem__ (_math_expression_in_presets, math_expression_in);
	}
	var delimiters = __call__ (tuple, null, math_expression_in);
	if (__t__ (__ne__ (__call__ (len, null, delimiters), 2))) {
		var __except0__ = __call__ (ValueError, null, (function () {
			var __accu0__ = 'invalid value for math_expression_in: {!r} (a pair of delimiters must have exactly two items)';
			return __call__ (__accu0__.format, __accu0__, math_expression_in);
		}) ());
		__except0__.__cause__ = null;
		throw __except0__;
	}
	return delimiters;
};
export var fmt_math_expression_in_delimiters = function (text, math_expression_in) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'text': var text = __allkwargs0__ [__attrib0__]; break;
					case 'math_expression_in': var math_expression_in = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var delimiters = __call__ (_parse_math_expression_in, null, math_expression_in);
	if (__t__ (__t__ (delimiters === null) || __le__ (__call__ (_num_chars, null, text), 1))) {
		return text;
	}
	return __add__ (__add__ (__getitem__ (delimiters, 0), text), __getitem__ (delimiters, 1));
};
export var _ORD = 'ord';
export var _OP = 'op';
export var _BIN = 'bin';
export var _REL = 'rel';
export var _OPEN = 'open';
export var _CLOSE = 'close';
export var _PUNCT = 'punct';
export var _OPENEND = 'openend';
export var _TEXT = 'text';
export var _SCRIPT = 'script';
export var _BLOCK = 'block';
export var _math_atom_classes = tuple ([_ORD, _OP, _BIN, _REL, _OPEN, _CLOSE, _PUNCT, _OPENEND, _TEXT, _SCRIPT, _BLOCK]);
export var _math_unary_left_classes = tuple ([_BIN, _REL, _OPEN, _PUNCT]);
export var _math_self_delimited_classes = tuple ([_CLOSE, _BLOCK]);
export var _parse_math_cls = function (cls) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'cls': var cls = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	if (__t__ (cls === null)) {
		return tuple ([_ORD, _ORD]);
	}
	if (__t__ (__call__ (isinstance, null, cls, str))) {
		if (__t__ (!__in__ (cls, _math_atom_classes))) {
			var __except0__ = __call__ (ValueError, null, (function () {
				var __accu0__ = 'Invalid math atom class: {!r}';
				return __call__ (__accu0__.format, __accu0__, cls);
			}) ());
			__except0__.__cause__ = null;
			throw __except0__;
		}
		return tuple ([cls, cls]);
	}
	var cls_pair = __call__ (tuple, null, cls);
	if (__t__ (__ne__ (__call__ (len, null, cls_pair), 2))) {
		var __except0__ = __call__ (ValueError, null, (function () {
			var __accu0__ = 'Invalid math atom class specification: {!r} (expected a class, or a pair of classes for the left and the right edge)';
			return __call__ (__accu0__.format, __accu0__, cls);
		}) ());
		__except0__.__cause__ = null;
		throw __except0__;
	}
	var __iterable0__ = cls_pair;
	for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
		var c = __getitem__ (__iterable0__, __index0__);
		if (__t__ (!__in__ (c, _math_atom_classes))) {
			var __except0__ = __call__ (ValueError, null, (function () {
				var __accu0__ = 'Invalid math atom class: {!r}';
				return __call__ (__accu0__.format, __accu0__, c);
			}) ());
			__except0__.__cause__ = null;
			throw __except0__;
		}
	}
	return cls_pair;
};
export var _MathPiece =  __class__ ('_MathPiece', [object], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, text, cls, script_kind, script_latex_notation) {
		if (typeof text == 'undefined' || (text != null && text.hasOwnProperty ("__kwargtrans__"))) {;
			var text = null;
		};
		if (typeof cls == 'undefined' || (cls != null && cls.hasOwnProperty ("__kwargtrans__"))) {;
			var cls = null;
		};
		if (typeof script_kind == 'undefined' || (script_kind != null && script_kind.hasOwnProperty ("__kwargtrans__"))) {;
			var script_kind = null;
		};
		if (typeof script_latex_notation == 'undefined' || (script_latex_notation != null && script_latex_notation.hasOwnProperty ("__kwargtrans__"))) {;
			var script_latex_notation = false;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'text': var text = __allkwargs0__ [__attrib0__]; break;
						case 'cls': var cls = __allkwargs0__ [__attrib0__]; break;
						case 'script_kind': var script_kind = __allkwargs0__ [__attrib0__]; break;
						case 'script_latex_notation': var script_latex_notation = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, _MathPiece, '__init__'), null, self);
		self.text = text;
		var __left0__ = __call__ (_parse_math_cls, null, cls);
		var cls_left = __left0__ [0];
		var cls_right = __left0__ [1];
		self.cls_left = cls_left;
		self.cls_right = cls_right;
		self.script_kind = script_kind;
		self.script_latex_notation = script_latex_notation;
	});},
	get to_text () {return __get__ (this, function (self, display) {
		if (typeof display == 'undefined' || (display != null && display.hasOwnProperty ("__kwargtrans__"))) {;
			var display = false;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'display': var display = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (self.text === null)) {
			return '';
		}
		return self.text;
	});},
	get realize () {return __get__ (this, function (self, cls_left_neighbor, cls_right_neighbor, display) {
		if (typeof cls_left_neighbor == 'undefined' || (cls_left_neighbor != null && cls_left_neighbor.hasOwnProperty ("__kwargtrans__"))) {;
			var cls_left_neighbor = null;
		};
		if (typeof cls_right_neighbor == 'undefined' || (cls_right_neighbor != null && cls_right_neighbor.hasOwnProperty ("__kwargtrans__"))) {;
			var cls_right_neighbor = null;
		};
		if (typeof display == 'undefined' || (display != null && display.hasOwnProperty ("__kwargtrans__"))) {;
			var display = false;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'cls_left_neighbor': var cls_left_neighbor = __allkwargs0__ [__attrib0__]; break;
						case 'cls_right_neighbor': var cls_right_neighbor = __allkwargs0__ [__attrib0__]; break;
						case 'display': var display = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return tuple ([(function () {
			var __accu0__ = self;
			return __call__ (__accu0__.to_text, __accu0__, __kwargtrans__ ({display: display}));
		}) (), self.cls_left, self.cls_right]);
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
			var __accu0__ = self;
			return __call__ (__accu0__.to_text, __accu0__);
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
			var __accu0__ = '{}(text={!r}, cls=({!r}, {!r}))';
			return __call__ (__accu0__.format, __accu0__, self.__class__.__name__, (function () {
				var __accu1__ = self;
				return __call__ (__accu1__.to_text, __accu1__);
			}) (), self.cls_left, self.cls_right);
		}) ();
	});}
});
export var _MathWrappablePiece =  __class__ ('_MathWrappablePiece', [_MathPiece], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, inner_text, prefix, math_expression_in, cls, cls_wrapped, inner_cls, script_kind, script_latex_notation) {
		if (typeof inner_text == 'undefined' || (inner_text != null && inner_text.hasOwnProperty ("__kwargtrans__"))) {;
			var inner_text = '';
		};
		if (typeof prefix == 'undefined' || (prefix != null && prefix.hasOwnProperty ("__kwargtrans__"))) {;
			var prefix = '';
		};
		if (typeof math_expression_in == 'undefined' || (math_expression_in != null && math_expression_in.hasOwnProperty ("__kwargtrans__"))) {;
			var math_expression_in = null;
		};
		if (typeof cls == 'undefined' || (cls != null && cls.hasOwnProperty ("__kwargtrans__"))) {;
			var cls = null;
		};
		if (typeof cls_wrapped == 'undefined' || (cls_wrapped != null && cls_wrapped.hasOwnProperty ("__kwargtrans__"))) {;
			var cls_wrapped = null;
		};
		if (typeof inner_cls == 'undefined' || (inner_cls != null && inner_cls.hasOwnProperty ("__kwargtrans__"))) {;
			var inner_cls = null;
		};
		if (typeof script_kind == 'undefined' || (script_kind != null && script_kind.hasOwnProperty ("__kwargtrans__"))) {;
			var script_kind = null;
		};
		if (typeof script_latex_notation == 'undefined' || (script_latex_notation != null && script_latex_notation.hasOwnProperty ("__kwargtrans__"))) {;
			var script_latex_notation = false;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'inner_text': var inner_text = __allkwargs0__ [__attrib0__]; break;
						case 'prefix': var prefix = __allkwargs0__ [__attrib0__]; break;
						case 'math_expression_in': var math_expression_in = __allkwargs0__ [__attrib0__]; break;
						case 'cls': var cls = __allkwargs0__ [__attrib0__]; break;
						case 'cls_wrapped': var cls_wrapped = __allkwargs0__ [__attrib0__]; break;
						case 'inner_cls': var inner_cls = __allkwargs0__ [__attrib0__]; break;
						case 'script_kind': var script_kind = __allkwargs0__ [__attrib0__]; break;
						case 'script_latex_notation': var script_latex_notation = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, _MathWrappablePiece, '__init__'), null, self, __kwargtrans__ ({text: null, cls: cls, script_kind: script_kind, script_latex_notation: script_latex_notation}));
		self.inner_text = inner_text;
		self.prefix = prefix;
		self.math_expression_in = math_expression_in;
		if (__t__ (cls_wrapped === null)) {
			var cls_wrapped = tuple ([self.cls_left, _CLOSE]);
		}
		var __left0__ = __call__ (_parse_math_cls, null, cls_wrapped);
		var cls_wrapped_left = __left0__ [0];
		var cls_wrapped_right = __left0__ [1];
		self.cls_wrapped_left = cls_wrapped_left;
		self.cls_wrapped_right = cls_wrapped_right;
		if (__t__ (inner_cls === null)) {
			var inner_cls = __call__ (_classify_plain_str, null, inner_text);
		}
		var __left0__ = __call__ (_parse_math_cls, null, inner_cls);
		var inner_cls_left = __left0__ [0];
		var inner_cls_right = __left0__ [1];
		self.inner_cls_left = inner_cls_left;
		self.inner_cls_right = inner_cls_right;
	});},
	get to_text () {return __get__ (this, function (self, display) {
		if (typeof display == 'undefined' || (display != null && display.hasOwnProperty ("__kwargtrans__"))) {;
			var display = false;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'display': var display = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return __add__ (self.prefix, self.inner_text);
	});},
	get needs_wrapping () {return __get__ (this, function (self, cls_right_neighbor) {
		if (typeof cls_right_neighbor == 'undefined' || (cls_right_neighbor != null && cls_right_neighbor.hasOwnProperty ("__kwargtrans__"))) {;
			var cls_right_neighbor = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'cls_right_neighbor': var cls_right_neighbor = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (__eq__ (cls_right_neighbor, _SCRIPT))) {
			return true;
		}
		if (__t__ (__in__ (' ', self.inner_text))) {
			return true;
		}
		if (__t__ (__eq__ (self.inner_cls_right, _OPENEND))) {
			return true;
		}
		return false;
	});},
	get realize () {return __get__ (this, function (self, cls_left_neighbor, cls_right_neighbor, display) {
		if (typeof cls_left_neighbor == 'undefined' || (cls_left_neighbor != null && cls_left_neighbor.hasOwnProperty ("__kwargtrans__"))) {;
			var cls_left_neighbor = null;
		};
		if (typeof cls_right_neighbor == 'undefined' || (cls_right_neighbor != null && cls_right_neighbor.hasOwnProperty ("__kwargtrans__"))) {;
			var cls_right_neighbor = null;
		};
		if (typeof display == 'undefined' || (display != null && display.hasOwnProperty ("__kwargtrans__"))) {;
			var display = false;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'cls_left_neighbor': var cls_left_neighbor = __allkwargs0__ [__attrib0__]; break;
						case 'cls_right_neighbor': var cls_right_neighbor = __allkwargs0__ [__attrib0__]; break;
						case 'display': var display = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var wrapped_inner = __call__ (fmt_math_expression_in_delimiters, null, self.inner_text, self.math_expression_in);
		if (__t__ (__t__ (__ne__ (wrapped_inner, self.inner_text)) && (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.needs_wrapping, __accu0__, __kwargtrans__ ({cls_right_neighbor: cls_right_neighbor}));
		}) ())) {
			return tuple ([__add__ (self.prefix, wrapped_inner), self.cls_wrapped_left, self.cls_wrapped_right]);
		}
		return tuple ([__add__ (self.prefix, self.inner_text), self.cls_left, self.cls_right]);
	});}
});
export var _MathBlockPiece =  __class__ ('_MathBlockPiece', [_MathPiece], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, rows, delimiters, cls) {
		if (typeof rows == 'undefined' || (rows != null && rows.hasOwnProperty ("__kwargtrans__"))) {;
			var rows = null;
		};
		if (typeof delimiters == 'undefined' || (delimiters != null && delimiters.hasOwnProperty ("__kwargtrans__"))) {;
			var delimiters = null;
		};
		if (typeof cls == 'undefined' || (cls != null && cls.hasOwnProperty ("__kwargtrans__"))) {;
			var cls = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'rows': var rows = __allkwargs0__ [__attrib0__]; break;
						case 'delimiters': var delimiters = __allkwargs0__ [__attrib0__]; break;
						case 'cls': var cls = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (cls === null)) {
			var cls = _BLOCK;
		}
		__call__ (__call__ (__super__, null, _MathBlockPiece, '__init__'), null, self, __kwargtrans__ ({text: null, cls: cls}));
		if (__t__ (rows === null)) {
			var rows = [];
		}
		self.rows = rows;
		if (__t__ (delimiters === null)) {
			var delimiters = tuple (['[', ']']);
		}
		self.delimiters = delimiters;
	});},
	get to_text () {return __get__ (this, function (self, display) {
		if (typeof display == 'undefined' || (display != null && display.hasOwnProperty ("__kwargtrans__"))) {;
			var display = false;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'display': var display = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.to_text_inline, __accu0__);
		}) ();
	});},
	get column_width () {return __get__ (this, function (self) {
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
		var all_char_widths = (function () {
			var __accu0__ = [];
			var __iterable0__ = self.rows;
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var row = __getitem__ (__iterable0__, __index0__);
				var __iterable1__ = row;
				for (var __index1__ = 0; __index1__ < len (__iterable1__); __index1__++) {
					var x = __getitem__ (__iterable1__, __index1__);
					(function () {
						var __accu1__ = __accu0__;
						return __call__ (__accu1__.append, __accu1__, __call__ (_num_chars, null, x));
					}) ();
				}
			}
			return __accu0__;
		}) ();
		return (__t__ (all_char_widths) ? __call__ (max, null, all_char_widths) : 0);
	});},
	get to_text_inline () {return __get__ (this, function (self) {
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
		var max_char_width = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.column_width, __accu0__);
		}) ();
		var contents = (function () {
			var __accu0__ = '; ';
			return __call__ (__accu0__.join, __accu0__, (function () {
				var __accu1__ = [];
				var __iterable0__ = self.rows;
				for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
					var row = __getitem__ (__iterable0__, __index0__);
					(function () {
						var __accu2__ = __accu1__;
						return __call__ (__accu2__.append, __accu2__, (function () {
							var __accu3__ = ' ';
							return __call__ (__accu3__.join, __accu3__, (function () {
								var __accu4__ = [];
								var __iterable1__ = row;
								for (var __index1__ = 0; __index1__ < len (__iterable1__); __index1__++) {
									var x = __getitem__ (__iterable1__, __index1__);
									(function () {
										var __accu5__ = __accu4__;
										return __call__ (__accu5__.append, __accu5__, __add__ (__mul__ (' ', __sub__ (max_char_width, __call__ (_num_chars, null, x))), x));
									}) ();
								}
								return __accu4__;
							}) ());
						}) ());
					}) ();
				}
				return __accu1__;
			}) ());
		}) ();
		return __add__ (__add__ (__add__ (__add__ (__getitem__ (self.delimiters, 0), ' '), contents), ' '), __getitem__ (self.delimiters, 1));
	});}
});
export var _math_bin_chars = '+-*−±∓×÷·⋅∗⋆∘∙⊕⊖⊗⊘⊙∪∩⊎⊔⊓∧∨∖≀†‡';
export var _math_rel_chars = '=<>:≠≤≥≪≫≡≈≃≅∼≍≐≜∝∈∉∋⊂⊃⊆⊇⊏⊐⊑⊒≺≻≼≽⊢⊣⊥⊨∣∥→←↔⇒⇐⇔↦⟶⟵⟷⟹⟸⟺⟼';
export var _math_open_chars = '([{⟨〈⌈⌊⟦⟮';
export var _math_close_chars = ')]}!⟩〉⌉⌋⟧⟯';
export var _math_punct_chars = ',;';
export var _math_op_chars = '∑∏∐∫∬∭∮⋃⋂⋀⋁⨁⨂⨀⨆⨄';
export var _make_math_char_classes = function () {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
			}
		}
	}
	else {
	}
	var d = dict ({});
	var __iterable0__ = tuple ([tuple ([_math_bin_chars, _BIN]), tuple ([_math_rel_chars, _REL]), tuple ([_math_open_chars, _OPEN]), tuple ([_math_close_chars, _CLOSE]), tuple ([_math_punct_chars, _PUNCT]), tuple ([_math_op_chars, _OP])]);
	for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
		var __left0__ = __getitem__ (__iterable0__, __index0__);
		var chars = __left0__ [0];
		var cls = __left0__ [1];
		var __iterable1__ = chars;
		for (var __index1__ = 0; __index1__ < len (__iterable1__); __index1__++) {
			var c = __getitem__ (__iterable1__, __index1__);
			__setitem__ (d, c, cls);
		}
	}
	return d;
};
export var _math_char_classes = __call__ (_make_math_char_classes, null);
export var _is_ascii_digit = function (c) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'c': var c = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	return __t__ (__ge__ (c, '0')) && __le__ (c, '9');
};
export var _is_upright_latin_letter = function (c) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'c': var c = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	return __t__ (__t__ (__ge__ (c, 'a')) && __le__ (c, 'z')) || __t__ (__ge__ (c, 'A')) && __le__ (c, 'Z');
};
export var _segment_plain_str = function (s, upright_letters_are_op) {
	if (typeof upright_letters_are_op == 'undefined' || (upright_letters_are_op != null && upright_letters_are_op.hasOwnProperty ("__kwargtrans__"))) {;
		var upright_letters_are_op = true;
	};
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 's': var s = __allkwargs0__ [__attrib0__]; break;
					case 'upright_letters_are_op': var upright_letters_are_op = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var atoms = [];
	var chars = __call__ (_split_chars, null, s);
	var i = 0;
	var num = __call__ (len, null, chars);
	while (__t__ (__lt__ (i, num))) {
		var c = __getitem__ (chars, i);
		if (__t__ (__call__ (_is_upright_latin_letter, null, c))) {
			if (__t__ (upright_letters_are_op)) {
				var j = i;
				while (__t__ (__t__ (__lt__ (j, num)) && __call__ (_is_upright_latin_letter, null, __getitem__ (chars, j)))) {
					var j = __add__ (j, 1);
				}
				if (__t__ (__ge__ (__sub__ (j, i), 2))) {
					(function () {
						var __accu0__ = atoms;
						return __call__ (__accu0__.append, __accu0__, tuple ([(function () {
							var __accu1__ = '';
							return __call__ (__accu1__.join, __accu1__, __getslice__ (chars, i, j, 1));
						}) (), _OP]));
					}) ();
					var i = j;
					continue;
				}
			}
			(function () {
				var __accu0__ = atoms;
				return __call__ (__accu0__.append, __accu0__, tuple ([c, _ORD]));
			}) ();
			var i = __add__ (i, 1);
			continue;
		}
		if (__t__ (__call__ (_is_ascii_digit, null, c))) {
			var j = i;
			while (__t__ (__lt__ (j, num))) {
				if (__t__ (__call__ (_is_ascii_digit, null, __getitem__ (chars, j)))) {
					var j = __add__ (j, 1);
					continue;
				}
				if (__t__ (__t__ (__eq__ (__getitem__ (chars, j), '.')) && __t__ (__lt__ (__add__ (j, 1), num)) && __call__ (_is_ascii_digit, null, __getitem__ (chars, __add__ (j, 1))))) {
					var j = __add__ (j, 1);
					continue;
				}
				break;
			}
			(function () {
				var __accu0__ = atoms;
				return __call__ (__accu0__.append, __accu0__, tuple ([(function () {
					var __accu1__ = '';
					return __call__ (__accu1__.join, __accu1__, __getslice__ (chars, i, j, 1));
				}) (), _ORD]));
			}) ();
			var i = j;
			continue;
		}
		var cls = (function () {
			var __accu0__ = _math_char_classes;
			return __call__ (__accu0__.py_get, __accu0__, c, _ORD);
		}) ();
		(function () {
			var __accu0__ = atoms;
			return __call__ (__accu0__.append, __accu0__, tuple ([c, cls]));
		}) ();
		var i = __add__ (i, 1);
	}
	return atoms;
};
export var _classify_plain_str = function (s, upright_letters_are_op) {
	if (typeof upright_letters_are_op == 'undefined' || (upright_letters_are_op != null && upright_letters_are_op.hasOwnProperty ("__kwargtrans__"))) {;
		var upright_letters_are_op = true;
	};
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 's': var s = __allkwargs0__ [__attrib0__]; break;
					case 'upright_letters_are_op': var upright_letters_are_op = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var atoms = __call__ (_segment_plain_str, null, s, __kwargtrans__ ({upright_letters_are_op: upright_letters_are_op}));
	if (__t__ (!__t__ ((atoms)))) {
		return tuple ([_ORD, _ORD]);
	}
	return tuple ([__getitem__ (__getitem__ (atoms, 0), 1), __getitem__ (__getitem__ (atoms, __neg__ (1)), 1)]);
};
export var _math_needs_space = function (cls_left, cls_right, text_left, text_right) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'cls_left': var cls_left = __allkwargs0__ [__attrib0__]; break;
					case 'cls_right': var cls_right = __allkwargs0__ [__attrib0__]; break;
					case 'text_left': var text_left = __allkwargs0__ [__attrib0__]; break;
					case 'text_right': var text_right = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	if (__t__ (__eq__ (cls_left, _BLOCK))) {
		var cls_left = _CLOSE;
	}
	if (__t__ (__eq__ (cls_right, _BLOCK))) {
		var cls_right = _OPEN;
	}
	if (__t__ (__t__ (__eq__ (cls_left, _BIN)) || __t__ (__eq__ (cls_left, _REL)) || __t__ (__eq__ (cls_right, _BIN)) || __eq__ (cls_right, _REL))) {
		return true;
	}
	if (__t__ (__t__ (__eq__ (cls_left, _OPENEND)) || __eq__ (cls_right, _OPENEND))) {
		return true;
	}
	if (__t__ (__t__ ((__t__ (__eq__ (cls_left, _OP)) || __eq__ (cls_left, _TEXT))) && __t__ (__ne__ (cls_right, _OPEN)) && __ne__ (cls_right, _CLOSE))) {
		return true;
	}
	if (__t__ (__t__ ((__t__ (__eq__ (cls_right, _OP)) || __eq__ (cls_right, _TEXT))) && __ne__ (cls_left, _OPEN))) {
		return true;
	}
	if (__t__ (__eq__ (cls_left, _PUNCT))) {
		return true;
	}
	if (__t__ (__t__ (text_left) && __t__ (text_right) && __t__ (__call__ (_is_ascii_digit, null, __getitem__ (text_left, __neg__ (1)))) && __call__ (_is_ascii_digit, null, __getitem__ (text_right, 0)))) {
		return true;
	}
	return false;
};
export var _math_separator = function (cls_left, cls_right, text_left, text_right) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'cls_left': var cls_left = __allkwargs0__ [__attrib0__]; break;
					case 'cls_right': var cls_right = __allkwargs0__ [__attrib0__]; break;
					case 'text_left': var text_left = __allkwargs0__ [__attrib0__]; break;
					case 'text_right': var text_right = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	if (__t__ (__t__ (text_left) && __eq__ (__getitem__ (text_left, __neg__ (1)), ' '))) {
		return '';
	}
	if (__t__ (__t__ (text_right) && __eq__ (__getitem__ (text_right, 0), ' '))) {
		return '';
	}
	if (__t__ (__call__ (_math_needs_space, null, cls_left, cls_right, text_left, text_right))) {
		return ' ';
	}
	return '';
};
export var _math_pieces_prepare = function (pieces, upright_letters_are_op) {
	if (typeof upright_letters_are_op == 'undefined' || (upright_letters_are_op != null && upright_letters_are_op.hasOwnProperty ("__kwargtrans__"))) {;
		var upright_letters_are_op = true;
	};
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'pieces': var pieces = __allkwargs0__ [__attrib0__]; break;
					case 'upright_letters_are_op': var upright_letters_are_op = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var py_items = [];
	var __iterable0__ = pieces;
	for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
		var piece = __getitem__ (__iterable0__, __index0__);
		if (__t__ (piece === null)) {
			continue;
		}
		if (__t__ (__call__ (isinstance, null, piece, _MathPiece))) {
			(function () {
				var __accu0__ = py_items;
				return __call__ (__accu0__.append, __accu0__, piece);
			}) ();
			continue;
		}
		if (__t__ (!__t__ ((__call__ (isinstance, null, piece, str))))) {
			var piece = __call__ (str, null, piece);
		}
		if (__t__ (!__t__ ((piece)))) {
			continue;
		}
		var __iterable1__ = __call__ (_segment_plain_str, null, piece, __kwargtrans__ ({upright_letters_are_op: upright_letters_are_op}));
		for (var __index1__ = 0; __index1__ < len (__iterable1__); __index1__++) {
			var atom = __getitem__ (__iterable1__, __index1__);
			(function () {
				var __accu0__ = py_items;
				return __call__ (__accu0__.append, __accu0__, __call__ (_MathPiece, null, __kwargtrans__ ({text: __getitem__ (atom, 0), cls: __getitem__ (atom, 1)})));
			}) ();
		}
	}
	for (var i = 0; i < __sub__ (__call__ (len, null, py_items), 1); i++) {
		if (__t__ (__t__ (__eq__ (__getitem__ (py_items, i).script_kind, 'superscript')) && __eq__ (__getitem__ (py_items, __add__ (i, 1)).script_kind, 'subscript'))) {
			var item = __getitem__ (py_items, i);
			__setitem__ (py_items, i, __getitem__ (py_items, __add__ (i, 1)));
			__setitem__ (py_items, __add__ (i, 1), item);
		}
	}
	return py_items;
};
export var _join_math_pieces = function (pieces, display, upright_letters_are_op) {
	if (typeof display == 'undefined' || (display != null && display.hasOwnProperty ("__kwargtrans__"))) {;
		var display = false;
	};
	if (typeof upright_letters_are_op == 'undefined' || (upright_letters_are_op != null && upright_letters_are_op.hasOwnProperty ("__kwargtrans__"))) {;
		var upright_letters_are_op = true;
	};
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'pieces': var pieces = __allkwargs0__ [__attrib0__]; break;
					case 'display': var display = __allkwargs0__ [__attrib0__]; break;
					case 'upright_letters_are_op': var upright_letters_are_op = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var py_items = __call__ (_math_pieces_prepare, null, pieces, __kwargtrans__ ({upright_letters_are_op: upright_letters_are_op}));
	var r_items = [];
	var r_texts = [];
	var r_cls_left = [];
	var r_cls_right = [];
	for (var i = 0; i < __call__ (len, null, py_items); i++) {
		var cls_left_neighbor = (__t__ (__gt__ (i, 0)) ? __getitem__ (py_items, __sub__ (i, 1)).cls_right : null);
		var cls_right_neighbor = (__t__ (__lt__ (__add__ (i, 1), __call__ (len, null, py_items))) ? __getitem__ (py_items, __add__ (i, 1)).cls_left : null);
		var __left0__ = (function () {
			var __accu0__ = __getitem__ (py_items, i);
			return __call__ (__accu0__.realize, __accu0__, __kwargtrans__ ({cls_left_neighbor: cls_left_neighbor, cls_right_neighbor: cls_right_neighbor, display: display}));
		}) ();
		var text = __left0__ [0];
		var cls_left = __left0__ [1];
		var cls_right = __left0__ [2];
		if (__t__ (!__t__ ((text)))) {
			continue;
		}
		(function () {
			var __accu0__ = r_items;
			return __call__ (__accu0__.append, __accu0__, __getitem__ (py_items, i));
		}) ();
		(function () {
			var __accu0__ = r_texts;
			return __call__ (__accu0__.append, __accu0__, text);
		}) ();
		(function () {
			var __accu0__ = r_cls_left;
			return __call__ (__accu0__.append, __accu0__, cls_left);
		}) ();
		(function () {
			var __accu0__ = r_cls_right;
			return __call__ (__accu0__.append, __accu0__, cls_right);
		}) ();
	}
	var num = __call__ (len, null, r_texts);
	if (__t__ (__eq__ (num, 0))) {
		return __call__ (_MathPiece, null, __kwargtrans__ ({text: '', cls: _ORD}));
	}
	var is_unary = [];
	for (var i = 0; i < num; i++) {
		(function () {
			var __accu0__ = is_unary;
			return __call__ (__accu0__.append, __accu0__, __t__ (__eq__ (__getitem__ (r_cls_left, i), _BIN)) && (__t__ (__eq__ (i, 0)) || __in__ (__getitem__ (r_cls_right, __sub__ (i, 1)), _math_unary_left_classes)));
		}) ();
	}
	for (var i = 0; i < num; i++) {
		if (__t__ (__getitem__ (is_unary, i))) {
			__setitem__ (r_cls_left, i, _ORD);
			if (__t__ (__eq__ (__getitem__ (r_cls_right, i), _BIN))) {
				__setitem__ (r_cls_right, i, _ORD);
			}
		}
	}
	for (var i = 1; i < num; i++) {
		if (__t__ (__t__ (__eq__ (__getitem__ (r_cls_left, i), _SCRIPT)) && __ne__ (__getitem__ (r_cls_right, i), _OPENEND))) {
			__setitem__ (r_cls_right, i, __getitem__ (r_cls_right, __sub__ (i, 1)));
		}
	}
	var seps = [];
	for (var i = 0; i < __sub__ (num, 1); i++) {
		(function () {
			var __accu0__ = seps;
			return __call__ (__accu0__.append, __accu0__, __call__ (_math_separator, null, __getitem__ (r_cls_right, i), __getitem__ (r_cls_left, __add__ (i, 1)), __getitem__ (r_texts, i), __getitem__ (r_texts, __add__ (i, 1))));
		}) ();
	}
	for (var i = 1; i < num; i++) {
		if (__t__ (__ne__ (__getitem__ (r_cls_left, i), _SCRIPT))) {
			continue;
		}
		__setitem__ (seps, __sub__ (i, 1), '');
		if (__t__ (!__t__ ((__getitem__ (r_items, i).script_latex_notation)))) {
			continue;
		}
		if (__t__ (__lt__ (i, 2))) {
			continue;
		}
		if (__t__ (__eq__ (__getitem__ (r_cls_left, __sub__ (i, 1)), _SCRIPT))) {
			continue;
		}
		if (__t__ (__in__ (__getitem__ (r_cls_right, __sub__ (i, 1)), _math_self_delimited_classes))) {
			continue;
		}
		if (__t__ (__ne__ (__getitem__ (seps, __sub__ (i, 2)), ''))) {
			continue;
		}
		if (__t__ (__t__ ((function () {
			var __accu0__ = __getitem__ (r_texts, __sub__ (i, 2));
			return __call__ (__accu0__.endswith, __accu0__, ' ');
		}) ()) || (function () {
			var __accu0__ = __getitem__ (r_texts, __sub__ (i, 1));
			return __call__ (__accu0__.startswith, __accu0__, ' ');
		}) ())) {
			continue;
		}
		__setitem__ (seps, __sub__ (i, 2), ' ');
	}
	var result = [__getitem__ (r_texts, 0)];
	for (var i = 0; i < __sub__ (num, 1); i++) {
		(function () {
			var __accu0__ = result;
			return __call__ (__accu0__.append, __accu0__, __getitem__ (seps, i));
		}) ();
		(function () {
			var __accu0__ = result;
			return __call__ (__accu0__.append, __accu0__, __getitem__ (r_texts, __add__ (i, 1)));
		}) ();
	}
	return __call__ (_MathPiece, null, __kwargtrans__ ({text: (function () {
		var __accu0__ = '';
		return __call__ (__accu0__.join, __accu0__, result);
	}) (), cls: tuple ([__getitem__ (r_cls_left, 0), __getitem__ (r_cls_right, __sub__ (num, 1))])}));
};
export var get_default_latex_context_db = macrospec.LatexContextDb;
export var default_text_replacements = tuple ([]);
export var _strict_latex_spaces_predef = dict ({'based-on-source': dict ({'between-macro-and-chars': false, 'between-latex-constructs': false, 'after-comment': false, 'in-equations': null}), 'macros': dict ({'between-macro-and-chars': true, 'between-latex-constructs': true, 'after-comment': false, 'in-equations': 'based-on-source'}), 'except-in-equations': dict ({'between-macro-and-chars': true, 'between-latex-constructs': true, 'after-comment': true, 'in-equations': 'based-on-source'})});
export var _parse_strict_latex_spaces_dict = function (strict_latex_spaces) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'strict_latex_spaces': var strict_latex_spaces = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var d = dict ({'between-macro-and-chars': false, 'between-latex-constructs': false, 'after-comment': false, 'in-equations': null});
	if (__t__ (strict_latex_spaces === null)) {
		return d;
	}
	else if (__t__ (strict_latex_spaces === false)) {
		return __call__ (dict, null, __getitem__ (_strict_latex_spaces_predef, 'macros'));
	}
	else if (__t__ (strict_latex_spaces === true)) {
		return __call__ (dict, null, (function () {
			var __accu0__ = [];
			var __iterable0__ = (function () {
				var __accu1__ = d;
				return __call__ (__accu1__.py_keys, __accu1__);
			}) ();
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var k = __getitem__ (__iterable0__, __index0__);
				(function () {
					var __accu1__ = __accu0__;
					return __call__ (__accu1__.append, __accu1__, tuple ([k, true]));
				}) ();
			}
			return __accu0__;
		}) ());
	}
	else if (__t__ (__call__ (isinstance, null, strict_latex_spaces, dict))) {
		(function () {
			var __accu0__ = d;
			return __call__ (__accu0__.py_update, __accu0__, strict_latex_spaces);
		}) ();
		return d;
	}
	else if (__t__ (__call__ (isinstance, null, strict_latex_spaces, str))) {
		if (__t__ (__eq__ (strict_latex_spaces, 'on'))) {
			return __call__ (_parse_strict_latex_spaces_dict, null, true);
		}
		if (__t__ (__eq__ (strict_latex_spaces, 'off'))) {
			return __call__ (_parse_strict_latex_spaces_dict, null, false);
		}
		if (__t__ (__eq__ (strict_latex_spaces, 'default'))) {
			(function () {
				var __accu0__ = _util;
				return __call__ (__accu0__.pylatexenc_deprecated_2, __accu0__, "The value 'default' for `strict_latex_spaces=` in LatexNodes2Text() is deprecated. The actual default changed to 'macros', and for backwards compatibility the obsolete value 'default' still refers to the earlier default which is now called 'based-on-source'.", __kwargtrans__ ({stacklevel: 3}));
			}) ();
			var strict_latex_spaces = 'based-on-source';
		}
		if (__t__ (!__in__ (strict_latex_spaces, _strict_latex_spaces_predef))) {
			var __except0__ = __call__ (ValueError, null, (function () {
				var __accu0__ = 'invalid value for strict_latex_spaces preset: {}';
				return __call__ (__accu0__.format, __accu0__, strict_latex_spaces);
			}) ());
			__except0__.__cause__ = null;
			throw __except0__;
		}
		return __call__ (dict, null, __getitem__ (_strict_latex_spaces_predef, strict_latex_spaces));
	}
	else {
		var __except0__ = __call__ (ValueError, null, (function () {
			var __accu0__ = 'Invalid value for strict_latex_spaces: {!r}';
			return __call__ (__accu0__.format, __accu0__, strict_latex_spaces);
		}) ());
		__except0__.__cause__ = null;
		throw __except0__;
	}
};
export var TextConversionState =  __class__ ('TextConversionState', [object], {
	__module__: __name__,
	_fields: tuple (['strict_latex_spaces', 'in_math_mode', 'list_stack', 'math_expression_in', 'text_fontstyle', 'math_fontstyle']),
	get __init__ () {return __get__ (this, function (self, strict_latex_spaces, in_math_mode, list_stack, math_expression_in, text_fontstyle, math_fontstyle) {
		if (typeof strict_latex_spaces == 'undefined' || (strict_latex_spaces != null && strict_latex_spaces.hasOwnProperty ("__kwargtrans__"))) {;
			var strict_latex_spaces = null;
		};
		if (typeof in_math_mode == 'undefined' || (in_math_mode != null && in_math_mode.hasOwnProperty ("__kwargtrans__"))) {;
			var in_math_mode = false;
		};
		if (typeof list_stack == 'undefined' || (list_stack != null && list_stack.hasOwnProperty ("__kwargtrans__"))) {;
			var list_stack = null;
		};
		if (typeof math_expression_in == 'undefined' || (math_expression_in != null && math_expression_in.hasOwnProperty ("__kwargtrans__"))) {;
			var math_expression_in = default_math_expression_in;
		};
		if (typeof text_fontstyle == 'undefined' || (text_fontstyle != null && text_fontstyle.hasOwnProperty ("__kwargtrans__"))) {;
			var text_fontstyle = null;
		};
		if (typeof math_fontstyle == 'undefined' || (math_fontstyle != null && math_fontstyle.hasOwnProperty ("__kwargtrans__"))) {;
			var math_fontstyle = 'italic';
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'strict_latex_spaces': var strict_latex_spaces = __allkwargs0__ [__attrib0__]; break;
						case 'in_math_mode': var in_math_mode = __allkwargs0__ [__attrib0__]; break;
						case 'list_stack': var list_stack = __allkwargs0__ [__attrib0__]; break;
						case 'math_expression_in': var math_expression_in = __allkwargs0__ [__attrib0__]; break;
						case 'text_fontstyle': var text_fontstyle = __allkwargs0__ [__attrib0__]; break;
						case 'math_fontstyle': var math_fontstyle = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, TextConversionState, '__init__'), null, self);
		self.strict_latex_spaces = strict_latex_spaces;
		self.in_math_mode = in_math_mode;
		self.list_stack = (__t__ (list_stack !== null) ? list_stack : []);
		self.math_expression_in = math_expression_in;
		self.text_fontstyle = text_fontstyle;
		self.math_fontstyle = math_fontstyle;
	});},
	get sub_state () {return __get__ (this, function (self) {
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
		var d = __call__ (dict, null, (function () {
			var __accu0__ = [];
			var __iterable0__ = self._fields;
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var field = __getitem__ (__iterable0__, __index0__);
				(function () {
					var __accu1__ = __accu0__;
					return __call__ (__accu1__.append, __accu1__, tuple ([field, __call__ (getattr, null, self, field)]));
				}) ();
			}
			return __accu0__;
		}) ());
		var __iterable0__ = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_items, __accu0__);
		}) ();
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var __left0__ = __getitem__ (__iterable0__, __index0__);
			var field = __left0__ [0];
			var value = __left0__ [1];
			if (__t__ (!__in__ (field, self._fields))) {
				var __except0__ = __call__ (ValueError, null, (function () {
					var __accu0__ = 'Invalid latex2text state field: {!r}';
					return __call__ (__accu0__.format, __accu0__, field);
				}) ());
				__except0__.__cause__ = null;
				throw __except0__;
			}
			__setitem__ (d, field, value);
		}
		return __call__ (TextConversionState, null, __kwargtrans__ (d));
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
			var __accu0__ = '{}({})';
			return __call__ (__accu0__.format, __accu0__, self.__class__.__name__, (function () {
				var __accu1__ = ', ';
				return __call__ (__accu1__.join, __accu1__, (function () {
					var __accu2__ = [];
					var __iterable0__ = self._fields;
					for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
						var field = __getitem__ (__iterable0__, __index0__);
						(function () {
							var __accu3__ = __accu2__;
							return __call__ (__accu3__.append, __accu3__, (function () {
								var __accu4__ = '{}={!r}';
								return __call__ (__accu4__.format, __accu4__, field, __call__ (getattr, null, self, field));
							}) ());
						}) ();
					}
					return __accu2__;
				}) ());
			}) ());
		}) ();
	});}
});
export var LatexNodes2Text =  __class__ ('LatexNodes2Text', [object], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, latex_context) {
		if (typeof latex_context == 'undefined' || (latex_context != null && latex_context.hasOwnProperty ("__kwargtrans__"))) {;
			var latex_context = null;
		};
		var flags = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'latex_context': var latex_context = __allkwargs0__ [__attrib0__]; break;
						default: flags [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete flags.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, LatexNodes2Text, '__init__'), null, self);
		self.state = __call__ (TextConversionState, null);
		if (__t__ (latex_context === null)) {
			if (__t__ (__t__ (__in__ ('macro_dict', flags)) || __in__ ('env_dict', flags))) {
				(function () {
					var __accu0__ = _util;
					return __call__ (__accu0__.pylatexenc_deprecated_2, __accu0__, 'The `macro_dict=...` and `env_dict=...` options in LatexNodes2Text() are obsolete since pylatexenc 2.  They will still work, but please consider using instead the more versatile option `latex_context=...`.');
				}) ();
				var macro_dict = (function () {
					var __accu0__ = flags;
					return __call__ (__accu0__.py_pop, __accu0__, 'macro_dict', []);
				}) ();
				var env_dict = (function () {
					var __accu0__ = flags;
					return __call__ (__accu0__.py_pop, __accu0__, 'env_dict', []);
				}) ();
				var latex_context = (function () {
					var __accu0__ = macrospec;
					return __call__ (__accu0__.LatexContextDb, __accu0__);
				}) ();
				(function () {
					var __accu0__ = latex_context;
					return __call__ (__accu0__.add_context_category, __accu0__, 'custom', __kwargtrans__ ({macros: (function () {
						var __accu1__ = macro_dict;
						return __call__ (__accu1__.py_values, __accu1__);
					}) (), environments: (function () {
						var __accu1__ = env_dict;
						return __call__ (__accu1__.py_values, __accu1__);
					}) (), specials: []}));
				}) ();
			}
			else {
				var latex_context = __call__ (get_default_latex_context_db, null);
			}
		}
		self.latex_context = latex_context;
		self.tex_input_directory = null;
		self.strict_input = true;
		if (__t__ (__in__ ('keep_inline_math', flags))) {
			if (__t__ (__in__ ('math_mode', flags))) {
				var __except0__ = __call__ (py_TypeError, null, 'Cannot specify both math_mode= and keep_inline_math= for LatexNodes2Text()');
				__except0__.__cause__ = null;
				throw __except0__;
			}
			(function () {
				var __accu0__ = _util;
				return __call__ (__accu0__.pylatexenc_deprecated_2, __accu0__, 'The keep_inline_math=... option in LatexNodes2Text() has been replaced by the math_mode=... option.');
			}) ();
			self.math_mode = (__t__ ((function () {
				var __accu0__ = flags;
				return __call__ (__accu0__.py_pop, __accu0__, 'keep_inline_math');
			}) ()) ? 'verbatim' : 'text');
		}
		else {
			self.math_mode = (function () {
				var __accu0__ = flags;
				return __call__ (__accu0__.py_pop, __accu0__, 'math_mode', 'fancy');
			}) ();
		}
		if (__t__ (!__in__ (self.math_mode, tuple (['fancy', 'text', 'with-delimiters', 'verbatim', 'remove'])))) {
			var __except0__ = __call__ (ValueError, null, "math_mode= option must be one of 'fancy', 'text', 'with-delimiters', 'verbatim', 'remove'");
			__except0__.__cause__ = null;
			throw __except0__;
		}
		var math_expression_in = (function () {
			var __accu0__ = flags;
			return __call__ (__accu0__.py_pop, __accu0__, 'math_expression_in', default_math_expression_in);
		}) ();
		self.math_expression_in = __call__ (_parse_math_expression_in, null, math_expression_in);
		if (__t__ (__in__ ('text_fontstyle', flags))) {
			self.state.text_fontstyle = (function () {
				var __accu0__ = flags;
				return __call__ (__accu0__.py_pop, __accu0__, 'text_fontstyle');
			}) ();
		}
		if (__t__ (__in__ ('math_fontstyle', flags))) {
			self.state.math_fontstyle = (function () {
				var __accu0__ = flags;
				return __call__ (__accu0__.py_pop, __accu0__, 'math_fontstyle');
			}) ();
		}
		self.keep_comments = (function () {
			var __accu0__ = flags;
			return __call__ (__accu0__.py_pop, __accu0__, 'keep_comments', false);
		}) ();
		var strict_latex_spaces = (function () {
			var __accu0__ = flags;
			return __call__ (__accu0__.py_pop, __accu0__, 'strict_latex_spaces', false);
		}) ();
		self.strict_latex_spaces = __call__ (_parse_strict_latex_spaces_dict, null, strict_latex_spaces);
		self.keep_braced_groups = (function () {
			var __accu0__ = flags;
			return __call__ (__accu0__.py_pop, __accu0__, 'keep_braced_groups', false);
		}) ();
		self.keep_braced_groups_minlen = (function () {
			var __accu0__ = flags;
			return __call__ (__accu0__.py_pop, __accu0__, 'keep_braced_groups_minlen', 2);
		}) ();
		self.fill_text = (function () {
			var __accu0__ = flags;
			return __call__ (__accu0__.py_pop, __accu0__, 'fill_text', null);
		}) ();
		if (__t__ (!__t__ ((self.fill_text)))) {
			self.fill_text = null;
		}
		if (__t__ (self.fill_text === true)) {
			self.fill_text = 80;
		}
		if (__t__ (__in__ ('text_replacements', flags))) {
			delete __getitem__ (flags, 'text_replacements');
			(function () {
				var __accu0__ = _util;
				return __call__ (__accu0__.pylatexenc_deprecated_2, __accu0__, 'The text_replacements= argument is ignored since pylatexenc 2. To keep existing code working, add a call to `LatexNodes2Text.apply_text_replacements()`. New code should use "latex specials" instead.');
			}) ();
		}
		if (__t__ (flags)) {
			(function () {
				var __accu0__ = logger;
				return __call__ (__accu0__.warning, __accu0__, 'LatexNodes2Text(): Unknown flag(s) encountered: %r', __call__ (list, null, (function () {
					var __accu1__ = flags;
					return __call__ (__accu1__.py_keys, __accu1__);
				}) ()));
			}) ();
		}
	});},
	get _get_strict_latex_spaces () {return __get__ (this, function (self) {
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
		return self.state.strict_latex_spaces;
	});},
	get _set_strict_latex_spaces () {return __get__ (this, function (self, value) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'value': var value = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		self.state.strict_latex_spaces = value;
	});},
	get _get_math_expression_in () {return __get__ (this, function (self) {
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
		return self.state.math_expression_in;
	});},
	get _set_math_expression_in () {return __get__ (this, function (self, value) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'value': var value = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		self.state.math_expression_in = value;
	});},
	get push_state () {return __get__ (this, function (self) {
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
		return (function () {
			var __accu0__ = _util;
			return __call__ (__accu0__.PushPropOverride, __accu0__, self, 'state', (function () {
				var __accu1__ = self.state;
				return __call__ (__accu1__.sub_state, __accu1__, __kwargtrans__ (kwargs));
			}) ());
		}) ();
	});},
	get set_tex_input_directory () {return __get__ (this, function (self, tex_input_directory, latex_walker_init_args, strict_input) {
		if (typeof latex_walker_init_args == 'undefined' || (latex_walker_init_args != null && latex_walker_init_args.hasOwnProperty ("__kwargtrans__"))) {;
			var latex_walker_init_args = null;
		};
		if (typeof strict_input == 'undefined' || (strict_input != null && strict_input.hasOwnProperty ("__kwargtrans__"))) {;
			var strict_input = true;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'tex_input_directory': var tex_input_directory = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker_init_args': var latex_walker_init_args = __allkwargs0__ [__attrib0__]; break;
						case 'strict_input': var strict_input = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		self.tex_input_directory = tex_input_directory;
		self.latex_walker_init_args = (__t__ (latex_walker_init_args) ? latex_walker_init_args : dict ({}));
		self.strict_input = strict_input;
	});},
	get read_input_file () {return __get__ (this, function (self, fn) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'fn': var fn = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (self.tex_input_directory === null)) {
			return '';
		}
		return __call__ (read_latex_file, null, self.tex_input_directory, self.strict_input, fn);
	});},
	get _input_node_simplify_repl () {return __get__ (this, function (self, n) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'n': var n = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var nodeargs = (__t__ (n.nodeargd !== null) ? n.nodeargd.argnlist : []);
		if (__t__ (__ne__ (__call__ (len, null, nodeargs), 1))) {
			(function () {
				var __accu0__ = logger;
				return __call__ (__accu0__.warning, __accu0__, "Expected exactly one argument for '\\input' ! Got = %r", nodeargs);
			}) ();
		}
		var inputtex = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.read_input_file, __accu0__, (function () {
				var __accu1__ = __call__ (str, null, (function () {
					var __accu2__ = self;
					return __call__ (__accu2__.nodelist_to_text, __accu2__, [__getitem__ (nodeargs, 0)]);
				}) ());
				return __call__ (__accu1__.strip, __accu1__);
			}) ());
		}) ();
		if (__t__ (!__t__ ((inputtex)))) {
			return '';
		}
		var lw = (function () {
			var __accu0__ = latexwalker;
			return __call__ (__accu0__.LatexWalker, __accu0__, inputtex, __kwargtrans__ (self.latex_walker_init_args));
		}) ();
		var __left0__ = (function () {
			var __accu0__ = lw;
			return __call__ (__accu0__.parse_content, __accu0__, (function () {
				var __accu1__ = latexnodes_parsers;
				return __call__ (__accu1__.LatexGeneralNodesParser, __accu1__);
			}) ());
		}) ();
		var nodelist = __left0__ [0];
		var _ = __left0__ [1];
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.nodelist_to_text, __accu0__, nodelist);
		}) ();
	});},
	get latex_to_text () {return __get__ (this, function (self, latex) {
		var parse_flags = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'latex': var latex = __allkwargs0__ [__attrib0__]; break;
						default: parse_flags [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete parse_flags.__kwargtrans__;
			}
		}
		else {
		}
		var lw = (function () {
			var __accu0__ = latexwalker;
			return __call__ (__accu0__.LatexWalker, __accu0__, latex, __kwargtrans__ (parse_flags));
		}) ();
		var __left0__ = (function () {
			var __accu0__ = lw;
			return __call__ (__accu0__.parse_content, __accu0__, (function () {
				var __accu1__ = latexnodes_parsers;
				return __call__ (__accu1__.LatexGeneralNodesParser, __accu1__);
			}) ());
		}) ();
		var nodelist = __left0__ [0];
		var _ = __left0__ [1];
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.nodelist_to_text, __accu0__, nodelist);
		}) ();
	});},
	get nodelist_to_text () {return __get__ (this, function (self, nodelist, state) {
		if (typeof state == 'undefined' || (state != null && state.hasOwnProperty ("__kwargtrans__"))) {;
			var state = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'nodelist': var nodelist = __allkwargs0__ [__attrib0__]; break;
						case 'state': var state = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (nodelist === null)) {
			return '';
		}
		var __withid0__ = (function () {
			var __accu0__ = _util;
			return __call__ (__accu0__.PushPropOverride, __accu0__, self, 'state', state);
		}) ();
		try {
			__withid0__.__enter__ ();
			var fancy_math = __t__ (__eq__ (self.math_mode, 'fancy')) && self.state.in_math_mode;
			var parts = [];
			var s = '';
			var prev_node = null;
			var __iterable0__ = nodelist;
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var node = __getitem__ (__iterable0__, __index0__);
				if (__t__ (__t__ ((function () {
					var __accu0__ = self;
					return __call__ (__accu0__._is_bare_macro_node, __accu0__, prev_node);
				}) ()) && (function () {
					var __accu0__ = node;
					return __call__ (__accu0__.isNodeType, __accu0__, latexnodes_nodes.LatexCharsNode);
				}) ())) {
					if (__t__ (__t__ (!__t__ ((fancy_math))) && !__t__ ((__getitem__ (self.strict_latex_spaces, 'between-macro-and-chars'))))) {
						var s = __call__ (__iadd__, null, s, prev_node.macro_post_space);
					}
				}
				if (__t__ (fancy_math)) {
					var textcol = 0;
				}
				else {
					var last_nl_pos = (function () {
						var __accu0__ = s;
						return __call__ (__accu0__.rfind, __accu0__, '\n');
					}) ();
					if (__t__ (__ne__ (last_nl_pos, __neg__ (1)))) {
						var textcol = __call__ (_num_chars, null, __getslice__ (s, __add__ (last_nl_pos, 1), null, 1));
					}
					else {
						var textcol = __call__ (_num_chars, null, s);
					}
				}
				var r = (function () {
					var __accu0__ = self;
					return __call__ (__accu0__.node_to_text, __accu0__, node, __kwargtrans__ ({textcol: textcol}));
				}) ();
				if (__t__ (fancy_math)) {
					(function () {
						var __accu0__ = parts;
						return __call__ (__accu0__.append, __accu0__, r);
					}) ();
				}
				else {
					var s = __call__ (__iadd__, null, s, r);
				}
				var prev_node = node;
			}
			if (__t__ (fancy_math)) {
				var result = __call__ (_join_math_pieces, null, parts, __kwargtrans__ ({upright_letters_are_op: __call__ (bool, null, self.state.math_fontstyle)}));
			}
			else {
				var result = s;
			}
			__withid0__.__exit__ ();
		}
		catch (__except0__) {
			if (! (__withid0__.__exit__ (__except0__.name, __except0__, __except0__.stack))) {
				throw __except0__;
			}
		}
		return result;
	});},
	get node_to_text () {return __get__ (this, function (self, node, prev_node_hint, textcol, state) {
		if (typeof prev_node_hint == 'undefined' || (prev_node_hint != null && prev_node_hint.hasOwnProperty ("__kwargtrans__"))) {;
			var prev_node_hint = null;
		};
		if (typeof textcol == 'undefined' || (textcol != null && textcol.hasOwnProperty ("__kwargtrans__"))) {;
			var textcol = 0;
		};
		if (typeof state == 'undefined' || (state != null && state.hasOwnProperty ("__kwargtrans__"))) {;
			var state = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'node': var node = __allkwargs0__ [__attrib0__]; break;
						case 'prev_node_hint': var prev_node_hint = __allkwargs0__ [__attrib0__]; break;
						case 'textcol': var textcol = __allkwargs0__ [__attrib0__]; break;
						case 'state': var state = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (node === null)) {
			return '';
		}
		var __withid0__ = (function () {
			var __accu0__ = _util;
			return __call__ (__accu0__.PushPropOverride, __accu0__, self, 'state', state);
		}) ();
		try {
			__withid0__.__enter__ ();
			if (__t__ ((function () {
				var __accu0__ = node;
				return __call__ (__accu0__.isNodeType, __accu0__, latexnodes_nodes.LatexCharsNode);
			}) ())) {
				var result = (function () {
					var __accu0__ = self;
					return __call__ (__accu0__.chars_node_to_text, __accu0__, node, __kwargtrans__ ({textcol: textcol}));
				}) ();
			}
			else if (__t__ ((function () {
				var __accu0__ = node;
				return __call__ (__accu0__.isNodeType, __accu0__, latexnodes_nodes.LatexCommentNode);
			}) ())) {
				var result = (function () {
					var __accu0__ = self;
					return __call__ (__accu0__.comment_node_to_text, __accu0__, node);
				}) ();
			}
			else if (__t__ ((function () {
				var __accu0__ = node;
				return __call__ (__accu0__.isNodeType, __accu0__, latexnodes_nodes.LatexGroupNode);
			}) ())) {
				var result = (function () {
					var __accu0__ = self;
					return __call__ (__accu0__.group_node_to_text, __accu0__, node);
				}) ();
			}
			else if (__t__ ((function () {
				var __accu0__ = node;
				return __call__ (__accu0__.isNodeType, __accu0__, latexnodes_nodes.LatexMacroNode);
			}) ())) {
				var result = (function () {
					var __accu0__ = self;
					return __call__ (__accu0__.macro_node_to_text, __accu0__, node);
				}) ();
			}
			else if (__t__ ((function () {
				var __accu0__ = node;
				return __call__ (__accu0__.isNodeType, __accu0__, latexnodes_nodes.LatexEnvironmentNode);
			}) ())) {
				var result = (function () {
					var __accu0__ = self;
					return __call__ (__accu0__.environment_node_to_text, __accu0__, node);
				}) ();
			}
			else if (__t__ ((function () {
				var __accu0__ = node;
				return __call__ (__accu0__.isNodeType, __accu0__, latexnodes_nodes.LatexSpecialsNode);
			}) ())) {
				var result = (function () {
					var __accu0__ = self;
					return __call__ (__accu0__.specials_node_to_text, __accu0__, node);
				}) ();
			}
			else if (__t__ ((function () {
				var __accu0__ = node;
				return __call__ (__accu0__.isNodeType, __accu0__, latexnodes_nodes.LatexMathNode);
			}) ())) {
				var result = (function () {
					var __accu0__ = self;
					return __call__ (__accu0__.math_node_to_text, __accu0__, node);
				}) ();
			}
			else {
				(function () {
					var __accu0__ = logger;
					return __call__ (__accu0__.warning, __accu0__, 'LatexNodes2Text.node_to_text(): Unknown node: %r', node);
				}) ();
				var result = '';
			}
			__withid0__.__exit__ ();
		}
		catch (__except0__) {
			if (! (__withid0__.__exit__ (__except0__.name, __except0__, __except0__.stack))) {
				throw __except0__;
			}
		}
		return result;
	});},
	get chars_node_to_text () {return __get__ (this, function (self, node, textcol) {
		if (typeof textcol == 'undefined' || (textcol != null && textcol.hasOwnProperty ("__kwargtrans__"))) {;
			var textcol = 0;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'node': var node = __allkwargs0__ [__attrib0__]; break;
						case 'textcol': var textcol = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var content = node.chars;
		if (__t__ (__t__ (__eq__ (self.math_mode, 'fancy')) && self.state.in_math_mode)) {
			var content = (function () {
				var __accu0__ = re;
				return __call__ (__accu0__.sub, __accu0__, '\\s+', '', content);
			}) ();
			var content = (function () {
				var __accu0__ = self;
				return __call__ (__accu0__._apply_fontstyle, __accu0__, content);
			}) ();
			return content;
		}
		if (__t__ (self.fill_text)) {
			var content = (function () {
				var __accu0__ = self;
				return __call__ (__accu0__.do_fill_text, __accu0__, content, __kwargtrans__ ({textcol: textcol}));
			}) ();
		}
		if (__t__ (__t__ (!__t__ ((__getitem__ (self.strict_latex_spaces, 'between-latex-constructs')))) && __eq__ (__call__ (len, null, (function () {
			var __accu0__ = content;
			return __call__ (__accu0__.strip, __accu0__);
		}) ()), 0))) {
			return '';
		}
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__._apply_fontstyle, __accu0__, content);
		}) ();
	});},
	get _apply_fontstyle () {return __get__ (this, function (self, content) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'content': var content = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (self.state.in_math_mode)) {
			var fontstyle = self.state.math_fontstyle;
		}
		else {
			var fontstyle = self.state.text_fontstyle;
		}
		if (__t__ (fontstyle)) {
			return __call__ (fmt_math_text_style, null, content, fontstyle);
		}
		return content;
	});},
	get comment_node_to_text () {return __get__ (this, function (self, node) {
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
		if (__t__ (self.keep_comments)) {
			if (__t__ (__getitem__ (self.strict_latex_spaces, 'after-comment'))) {
				var nl = '\n';
				if (__t__ (__eq__ (node.comment_post_space, ''))) {
					var nl = '';
				}
				return __add__ (__add__ ('%', node.comment), nl);
			}
			else {
				return __add__ (__add__ ('%', node.comment), node.comment_post_space);
			}
		}
		else if (__t__ (__getitem__ (self.strict_latex_spaces, 'after-comment'))) {
			return '';
		}
		else {
			return node.comment_post_space;
		}
	});},
	get group_node_to_text () {return __get__ (this, function (self, node) {
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
		var contents = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__._groupnodecontents_to_text, __accu0__, node);
		}) ();
		if (__t__ (__t__ (self.keep_braced_groups) && __ge__ (__call__ (_num_chars, null, contents), self.keep_braced_groups_minlen))) {
			return __add__ (__add__ (__getitem__ (node.delimiters, 0), contents), __getitem__ (node.delimiters, 1));
		}
		return contents;
	});},
	get macro_node_to_text () {return __get__ (this, function (self, node) {
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
		var macroname = node.macroname;
		var mac = (function () {
			var __accu0__ = self.latex_context;
			return __call__ (__accu0__.get_macro_spec, __accu0__, macroname);
		}) ();
		if (__t__ (mac === null)) {
			var mac = __call__ (MacroTextSpec, null, '', __kwargtrans__ ({discard: true}));
		}
		var get_macro_str_repl = function (node, macroname, mac) {
			if (arguments.length) {
				var __ilastarg0__ = arguments.length - 1;
				if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
					var __allkwargs0__ = arguments [__ilastarg0__--];
					for (var __attrib0__ in __allkwargs0__) {
						switch (__attrib0__) {
							case 'node': var node = __allkwargs0__ [__attrib0__]; break;
							case 'macroname': var macroname = __allkwargs0__ [__attrib0__]; break;
							case 'mac': var mac = __allkwargs0__ [__attrib0__]; break;
						}
					}
				}
			}
			else {
			}
			if (__t__ (mac.simplify_repl)) {
				return (function () {
					var __accu0__ = self;
					return __call__ (__accu0__.apply_simplify_repl, __accu0__, node, mac.simplify_repl, __kwargtrans__ ({what: (function () {
						var __accu1__ = "macro '\\{}'";
						return __call__ (__accu1__.format, __accu1__, macroname);
					}) ()}));
				}) ();
			}
			if (__t__ (mac.discard)) {
				return '';
			}
			var a = [];
			if (__t__ (__t__ (node.nodeargd) && node.nodeargd.argnlist)) {
				var a = node.nodeargd.argnlist;
			}
			return (function () {
				var __accu0__ = '';
				return __call__ (__accu0__.join, __accu0__, (function () {
					var __accu1__ = [];
					var __iterable0__ = a;
					for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
						var n = __getitem__ (__iterable0__, __index0__);
						(function () {
							var __accu2__ = __accu1__;
							return __call__ (__accu2__.append, __accu2__, (function () {
								var __accu3__ = self;
								return __call__ (__accu3__._groupnodecontents_to_text, __accu3__, n);
							}) ());
						}) ();
					}
					return __accu1__;
				}) ());
			}) ();
		};
		var macrostr = __call__ (get_macro_str_repl, null, node, macroname, mac);
		return macrostr;
	});},
	get environment_node_to_text () {return __get__ (this, function (self, node) {
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
		var environmentname = node.environmentname;
		var envdef = (function () {
			var __accu0__ = self.latex_context;
			return __call__ (__accu0__.get_environment_spec, __accu0__, environmentname);
		}) ();
		if (__t__ (envdef === null)) {
			var envdef = __call__ (EnvironmentTextSpec, null, '', __kwargtrans__ ({discard: false}));
		}
		if (__t__ (envdef.simplify_repl)) {
			return (function () {
				var __accu0__ = self;
				return __call__ (__accu0__.apply_simplify_repl, __accu0__, node, envdef.simplify_repl, __kwargtrans__ ({what: (function () {
					var __accu1__ = "environment '{}'";
					return __call__ (__accu1__.format, __accu1__, environmentname);
				}) ()}));
			}) ();
		}
		if (__t__ (envdef.discard)) {
			return '';
		}
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.nodelist_to_text, __accu0__, node.nodelist);
		}) ();
	});},
	get specials_node_to_text () {return __get__ (this, function (self, node) {
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
		var specials_chars = node.specials_chars;
		var sspec = (function () {
			var __accu0__ = self.latex_context;
			return __call__ (__accu0__.get_specials_spec, __accu0__, specials_chars);
		}) ();
		if (__t__ (sspec === null)) {
			return specials_chars;
		}
		var get_specials_str_repl = function (node, specials_chars, spec) {
			if (arguments.length) {
				var __ilastarg0__ = arguments.length - 1;
				if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
					var __allkwargs0__ = arguments [__ilastarg0__--];
					for (var __attrib0__ in __allkwargs0__) {
						switch (__attrib0__) {
							case 'node': var node = __allkwargs0__ [__attrib0__]; break;
							case 'specials_chars': var specials_chars = __allkwargs0__ [__attrib0__]; break;
							case 'spec': var spec = __allkwargs0__ [__attrib0__]; break;
						}
					}
				}
			}
			else {
			}
			if (__t__ (spec.simplify_repl)) {
				return (function () {
					var __accu0__ = self;
					return __call__ (__accu0__.apply_simplify_repl, __accu0__, node, spec.simplify_repl, __kwargtrans__ ({what: (function () {
						var __accu1__ = "specials '{}'";
						return __call__ (__accu1__.format, __accu1__, specials_chars);
					}) ()}));
				}) ();
			}
			if (__t__ (spec.discard)) {
				return '';
			}
			var a = [];
			if (__t__ (__t__ (node.nodeargd) && node.nodeargd.argnlist)) {
				var a = node.nodeargd.argnlist;
			}
			return (function () {
				var __accu0__ = '';
				return __call__ (__accu0__.join, __accu0__, (function () {
					var __accu1__ = [];
					var __iterable0__ = a;
					for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
						var n = __getitem__ (__iterable0__, __index0__);
						(function () {
							var __accu2__ = __accu1__;
							return __call__ (__accu2__.append, __accu2__, (function () {
								var __accu3__ = self;
								return __call__ (__accu3__._groupnodecontents_to_text, __accu3__, n);
							}) ());
						}) ();
					}
					return __accu1__;
				}) ());
			}) ();
		};
		var s = __call__ (get_specials_str_repl, null, node, specials_chars, sspec);
		return s;
	});},
	get math_node_to_text () {return __get__ (this, function (self, node) {
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
		if (__t__ (__eq__ (self.math_mode, 'verbatim'))) {
			if (__t__ (__t__ ((function () {
				var __accu0__ = node;
				return __call__ (__accu0__.isNodeType, __accu0__, latexnodes_nodes.LatexEnvironmentNode);
			}) ()) || __eq__ (node.displaytype, 'display'))) {
				return (function () {
					var __accu0__ = self;
					return __call__ (__accu0__._fmt_indented_block, __accu0__, (function () {
						var __accu1__ = node;
						return __call__ (__accu1__.latex_verbatim, __accu1__);
					}) (), __kwargtrans__ ({indent: ''}));
				}) ();
			}
			else {
				return (function () {
					var __accu0__ = node;
					return __call__ (__accu0__.latex_verbatim, __accu0__);
				}) ();
			}
		}
		else if (__t__ (__eq__ (self.math_mode, 'remove'))) {
			return '';
		}
		else if (__t__ (__eq__ (self.math_mode, 'with-delimiters'))) {
			var __withid0__ = __call__ (_PushEquationState, null, self);
			try {
				__withid0__.__enter__ ();
				var content = (function () {
					var __accu0__ = (function () {
						var __accu1__ = self;
						return __call__ (__accu1__.nodelist_to_text, __accu1__, node.nodelist);
					}) ();
					return __call__ (__accu0__.strip, __accu0__);
				}) ();
				__withid0__.__exit__ ();
			}
			catch (__except0__) {
				if (! (__withid0__.__exit__ (__except0__.name, __except0__, __except0__.stack))) {
					throw __except0__;
				}
			}
			if (__t__ ((function () {
				var __accu0__ = node;
				return __call__ (__accu0__.isNodeType, __accu0__, latexnodes_nodes.LatexMathNode);
			}) ())) {
				var delims = node.delimiters;
			}
			else {
				var delims = tuple ([__add__ (__add__ ('\\begin{', node.environmentname), '}'), __add__ (__add__ ('\\end{', node.environmentname), '}')]);
			}
			if (__t__ (__t__ ((function () {
				var __accu0__ = node;
				return __call__ (__accu0__.isNodeType, __accu0__, latexnodes_nodes.LatexEnvironmentNode);
			}) ()) || __eq__ (node.displaytype, 'display'))) {
				return __add__ (__add__ (__getitem__ (delims, 0), (function () {
					var __accu0__ = self;
					return __call__ (__accu0__._fmt_indented_block, __accu0__, content, __kwargtrans__ ({indent: ''}));
				}) ()), __getitem__ (delims, 1));
			}
			else {
				return __add__ (__add__ (__getitem__ (delims, 0), content), __getitem__ (delims, 1));
			}
		}
		else if (__t__ (__eq__ (self.math_mode, 'fancy'))) {
			var is_display = __t__ ((function () {
				var __accu0__ = node;
				return __call__ (__accu0__.isNodeType, __accu0__, latexnodes_nodes.LatexEnvironmentNode);
			}) ()) || __eq__ (node.displaytype, 'display');
			var __withid0__ = __call__ (_PushEquationState, null, self);
			try {
				__withid0__.__enter__ ();
				var rendered = (function () {
					var __accu0__ = self;
					return __call__ (__accu0__.nodelist_to_text, __accu0__, node.nodelist);
				}) ();
				__withid0__.__exit__ ();
			}
			catch (__except0__) {
				if (! (__withid0__.__exit__ (__except0__.name, __except0__, __except0__.stack))) {
					throw __except0__;
				}
			}
			if (__t__ (__call__ (isinstance, null, rendered, _MathPiece))) {
				var content = (function () {
					var __accu0__ = rendered;
					return __call__ (__accu0__.to_text, __accu0__, __kwargtrans__ ({display: is_display}));
				}) ();
			}
			else {
				var content = __call__ (str, null, rendered);
			}
			var content = (function () {
				var __accu0__ = content;
				return __call__ (__accu0__.strip, __accu0__);
			}) ();
			if (__t__ (is_display)) {
				return (function () {
					var __accu0__ = self;
					return __call__ (__accu0__._fmt_indented_block, __accu0__, content);
				}) ();
			}
			else {
				return content;
			}
		}
		else if (__t__ (__eq__ (self.math_mode, 'text'))) {
			var __withid0__ = __call__ (_PushEquationState, null, self);
			try {
				__withid0__.__enter__ ();
				var content = (function () {
					var __accu0__ = (function () {
						var __accu1__ = self;
						return __call__ (__accu1__.nodelist_to_text, __accu1__, node.nodelist);
					}) ();
					return __call__ (__accu0__.strip, __accu0__);
				}) ();
				__withid0__.__exit__ ();
			}
			catch (__except0__) {
				if (! (__withid0__.__exit__ (__except0__.name, __except0__, __except0__.stack))) {
					throw __except0__;
				}
			}
			if (__t__ (__t__ ((function () {
				var __accu0__ = node;
				return __call__ (__accu0__.isNodeType, __accu0__, latexnodes_nodes.LatexEnvironmentNode);
			}) ()) || __eq__ (node.displaytype, 'display'))) {
				return (function () {
					var __accu0__ = self;
					return __call__ (__accu0__._fmt_indented_block, __accu0__, content);
				}) ();
			}
			else {
				return content;
			}
		}
		else {
			var __except0__ = __call__ (RuntimeError, null, (function () {
				var __accu0__ = 'unknown math_mode={} !';
				return __call__ (__accu0__.format, __accu0__, self.math_mode);
			}) ());
			__except0__.__cause__ = null;
			throw __except0__;
		}
	});},
	get make_math_piece () {return __get__ (this, function (self) {
		var text = null;
		var cls = null;
		var inner_text = null;
		var prefix = '';
		var cls_wrapped = null;
		var inner_cls = null;
		var script_kind = null;
		var script_latex_notation = false;
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'text': var text = __allkwargs0__ [__attrib0__]; break;
						case 'cls': var cls = __allkwargs0__ [__attrib0__]; break;
						case 'inner_text': var inner_text = __allkwargs0__ [__attrib0__]; break;
						case 'prefix': var prefix = __allkwargs0__ [__attrib0__]; break;
						case 'cls_wrapped': var cls_wrapped = __allkwargs0__ [__attrib0__]; break;
						case 'inner_cls': var inner_cls = __allkwargs0__ [__attrib0__]; break;
						case 'script_kind': var script_kind = __allkwargs0__ [__attrib0__]; break;
						case 'script_latex_notation': var script_latex_notation = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (inner_text !== null)) {
			if (__t__ (text !== null)) {
				var __except0__ = __call__ (ValueError, null, 'make_math_piece(): give either text= or inner_text=, not both');
				__except0__.__cause__ = null;
				throw __except0__;
			}
			return __call__ (_MathWrappablePiece, null, __kwargtrans__ ({inner_text: inner_text, prefix: prefix, math_expression_in: self.state.math_expression_in, cls: cls, cls_wrapped: cls_wrapped, inner_cls: inner_cls, script_kind: script_kind, script_latex_notation: script_latex_notation}));
		}
		if (__t__ (__t__ (prefix) || __t__ (cls_wrapped !== null) || inner_cls !== null)) {
			var __except0__ = __call__ (ValueError, null, 'make_math_piece(): prefix=, cls_wrapped= and inner_cls= only make sense for a piece created with inner_text=');
			__except0__.__cause__ = null;
			throw __except0__;
		}
		return __call__ (_MathPiece, null, __kwargtrans__ ({text: text, cls: cls, script_kind: script_kind, script_latex_notation: script_latex_notation}));
	});},
	get do_fill_text () {return __get__ (this, function (self, text, textcol) {
		if (typeof textcol == 'undefined' || (textcol != null && textcol.hasOwnProperty ("__kwargtrans__"))) {;
			var textcol = 0;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'text': var text = __allkwargs0__ [__attrib0__]; break;
						case 'textcol': var textcol = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var head_ws = (function () {
			var __accu0__ = (function () {
				var __accu1__ = re;
				return __call__ (__accu1__.search, __accu1__, '^\\s*', text);
			}) ();
			return __call__ (__accu0__.group, __accu0__);
		}) ();
		var head_par = (__t__ (__in__ ('\n\n', head_ws)) ? '\n\n' : '');
		var trail_ws = (function () {
			var __accu0__ = (function () {
				var __accu1__ = re;
				return __call__ (__accu1__.search, __accu1__, '\\s*$', text);
			}) ();
			return __call__ (__accu0__.group, __accu0__);
		}) ();
		var trail_par = (__t__ (__in__ ('\n\n', trail_ws)) ? '\n\n' : '');
		var text = (function () {
			var __accu0__ = text;
			return __call__ (__accu0__.strip, __accu0__);
		}) ();
		var fill_chunk = function (x, textcol) {
			if (arguments.length) {
				var __ilastarg0__ = arguments.length - 1;
				if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
					var __allkwargs0__ = arguments [__ilastarg0__--];
					for (var __attrib0__ in __allkwargs0__) {
						switch (__attrib0__) {
							case 'x': var x = __allkwargs0__ [__attrib0__]; break;
							case 'textcol': var textcol = __allkwargs0__ [__attrib0__]; break;
						}
					}
				}
			}
			else {
			}
			var __left0__ = tuple (['', '']);
			var head_ws = __left0__ [0];
			var trail_ws = __left0__ [1];
			var x = (function () {
				var __accu0__ = x;
				return __call__ (__accu0__.strip, __accu0__);
			}) ();
			if (__t__ (__ge__ (textcol, __sub__ (self.fill_text, 4)))) {
				return __add__ (__add__ ('\n', __call__ (_fill_text_paragraph, null, x, self.fill_text)), trail_ws);
			}
			else {
				return __add__ (__add__ (head_ws, __getslice__ (__call__ (_fill_text_paragraph, null, x, self.fill_text, __kwargtrans__ ({initial_indent: __mul__ ('X', textcol)})), textcol, null, 1)), trail_ws);
			}
		};
		var rawchunks = (function () {
			var __accu0__ = (function () {
				var __accu1__ = re;
				return __call__ (__accu1__.compile, __accu1__, '\\n{2,}');
			}) ();
			return __call__ (__accu0__.py_split, __accu0__, text);
		}) ();
		var chunks = [];
		var __iterable0__ = __call__ (enumerate, null, rawchunks);
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var __left0__ = __getitem__ (__iterable0__, __index0__);
			var j = __left0__ [0];
			var x = __left0__ [1];
			var thechunk = __call__ (fill_chunk, null, x, (__t__ (__eq__ (j, 0)) ? textcol : 0));
			if (__t__ ((function () {
				var __accu0__ = thechunk;
				return __call__ (__accu0__.strip, __accu0__);
			}) ())) {
				(function () {
					var __accu0__ = chunks;
					return __call__ (__accu0__.append, __accu0__, thechunk);
				}) ();
			}
		}
		return __add__ (__add__ (__add__ (__add__ (head_par, (__t__ (__t__ (__gt__ (textcol, 0)) && __t__ (head_ws) && !__t__ ((head_par))) ? ' ' : '')), (function () {
			var __accu0__ = '\n\n';
			return __call__ (__accu0__.join, __accu0__, chunks);
		}) ()), (__t__ (__t__ (trail_ws) && !__t__ ((trail_par))) ? ' ' : '')), trail_par);
	});},
	get apply_simplify_repl () {return __get__ (this, function (self, node, simplify_repl, what) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'node': var node = __allkwargs0__ [__attrib0__]; break;
						case 'simplify_repl': var simplify_repl = __allkwargs0__ [__attrib0__]; break;
						case 'what': var what = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (__call__ (callable, null, simplify_repl))) {
			var kwargs = dict ({});
			var fn_args = __call__ (_simplify_repl_fn_arg_names, null, simplify_repl);
			if (__t__ (__in__ ('l2tobj', fn_args))) {
				__setitem__ (kwargs, 'l2tobj', self);
			}
			if (__t__ (__in__ ('l2tstate', fn_args))) {
				__setitem__ (kwargs, 'l2tstate', self.state);
			}
			if (__t__ (__t__ ((function () {
				var __accu0__ = node;
				return __call__ (__accu0__.isNodeType, __accu0__, latexnodes_nodes.LatexEnvironmentNode);
			}) ()) && __in__ ('environmentname', fn_args))) {
				__setitem__ (kwargs, 'environmentname', node.environmentname);
			}
			if (__t__ (__t__ ((function () {
				var __accu0__ = node;
				return __call__ (__accu0__.isNodeType, __accu0__, latexnodes_nodes.LatexMacroNode);
			}) ()) && __in__ ('macroname', fn_args))) {
				__setitem__ (kwargs, 'macroname', node.macroname);
			}
			if (__t__ (__t__ ((function () {
				var __accu0__ = node;
				return __call__ (__accu0__.isNodeType, __accu0__, latexnodes_nodes.LatexSpecialsNode);
			}) ()) && __in__ ('specials_chars', fn_args))) {
				__setitem__ (kwargs, 'specials_chars', node.specials_chars);
			}
			var r = __call__ (simplify_repl, null, node, __kwargtrans__ (kwargs));
			if (__t__ (r)) {
				return r;
			}
			return '';
		}
		if (__t__ (__t__ (__in__ ('%', simplify_repl)) && __ne__ (__call__ (len, null, simplify_repl), 1))) {
			var nodeargs = [];
			if (__t__ (__t__ (node.nodeargd) && node.nodeargd.argnlist)) {
				var nodeargs = __call__ (list, null, node.nodeargd.argnlist);
			}
			var spec = __call__ (getattr, null, node, 'spec', null);
			if (__t__ (__t__ (spec !== null) && __t__ (spec.arguments_spec_list !== null) && __lt__ (__call__ (len, null, nodeargs), __call__ (len, null, spec.arguments_spec_list)))) {
				var nodeargs = __call__ (__iadd__, null, nodeargs, (function () {
					var __accu0__ = [];
					for (var _ = 0; _ < __sub__ (__call__ (len, null, spec.arguments_spec_list), __call__ (len, null, nodeargs)); _++) {
						(function () {
							var __accu1__ = __accu0__;
							return __call__ (__accu1__.append, __accu1__, null);
						}) ();
					}
					return __accu0__;
				}) ());
			}
			var has_percent_s = (function () {
				var __accu0__ = re;
				return __call__ (__accu0__.search, __accu0__, '(^|[^%])(%%)*%s', simplify_repl);
			}) ();
			if (__t__ ((function () {
				var __accu0__ = node;
				return __call__ (__accu0__.isNodeType, __accu0__, latexnodes_nodes.LatexEnvironmentNode);
			}) ())) {
				if (__t__ (has_percent_s)) {
					var x = tuple ([(function () {
						var __accu0__ = self;
						return __call__ (__accu0__.nodelist_to_text, __accu0__, node.nodelist);
					}) ()]);
				}
				else {
					var x = (function () {
						var __accu0__ = self;
						return __call__ (__accu0__._numbered_args_dict, __accu0__, nodeargs);
					}) ();
					__setitem__ (x, 'body', (function () {
						var __accu0__ = self;
						return __call__ (__accu0__.nodelist_to_text, __accu0__, node.nodelist);
					}) ());
				}
			}
			else if (__t__ (has_percent_s)) {
				var x = __call__ (tuple, null, (function () {
					var __accu0__ = [];
					var __iterable0__ = nodeargs;
					for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
						var nn = __getitem__ (__iterable0__, __index0__);
						(function () {
							var __accu1__ = __accu0__;
							return __call__ (__accu1__.append, __accu1__, (function () {
								var __accu2__ = self;
								return __call__ (__accu2__._groupnodecontents_to_text, __accu2__, nn);
							}) ());
						}) ();
					}
					return __accu0__;
				}) ());
			}
			else {
				var x = (function () {
					var __accu0__ = self;
					return __call__ (__accu0__._numbered_args_dict, __accu0__, nodeargs);
				}) ();
			}
			try {
				return __call__ (_apply_percent_substitution, null, simplify_repl, x);
			}
			catch (__except0__) {
				if (isinstance (__except0__, tuple ([py_TypeError, ValueError, KeyError]))) {
					(function () {
						var __accu0__ = logger;
						return __call__ (__accu0__.warning, __accu0__, (function () {
							var __accu1__ = 'WARNING: Error in configuration: {} failed its substitution!';
							return __call__ (__accu1__.format, __accu1__, what);
						}) ());
					}) ();
					return simplify_repl;
				}
				else {
					throw __except0__;
				}
			}
		}
		return simplify_repl;
	});},
	get _numbered_args_dict () {return __get__ (this, function (self, nodeargs) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'nodeargs': var nodeargs = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return __call__ (dict, null, (function () {
			var __accu0__ = [];
			var __iterable0__ = __call__ (enumerate, null, nodeargs);
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var __left0__ = __getitem__ (__iterable0__, __index0__);
				var j = __left0__ [0];
				var nn = __left0__ [1];
				(function () {
					var __accu1__ = __accu0__;
					return __call__ (__accu1__.append, __accu1__, tuple ([__call__ (str, null, __add__ (1, j)), (function () {
						var __accu2__ = self;
						return __call__ (__accu2__._groupnodecontents_to_text, __accu2__, nn);
					}) ()]));
				}) ();
			}
			return __accu0__;
		}) ());
	});},
	get _fmt_indented_block () {return __get__ (this, function (self, contents, indent) {
		if (typeof indent == 'undefined' || (indent != null && indent.hasOwnProperty ("__kwargtrans__"))) {;
			var indent = __mul__ (' ', 4);
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'contents': var contents = __allkwargs0__ [__attrib0__]; break;
						case 'indent': var indent = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var block = __add__ (__add__ (__add__ ('\n', indent), (function () {
			var __accu0__ = contents;
			return __call__ (__accu0__.py_replace, __accu0__, '\n', __add__ ('\n', indent));
		}) ()), '\n');
		if (__t__ (self.fill_text)) {
			var block = __add__ (__add__ ('\n', block), '\n');
		}
		return block;
	});},
	get _is_bare_macro_node () {return __get__ (this, function (self, node) {
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
		if (__t__ (__t__ (node === null) || !__t__ (((function () {
			var __accu0__ = node;
			return __call__ (__accu0__.isNodeType, __accu0__, latexnodes_nodes.LatexMacroNode);
		}) ())))) {
			return false;
		}
		if (__t__ (__t__ (node.nodeargd === null) || !__t__ ((node.nodeargd.argnlist)))) {
			return true;
		}
		var __iterable0__ = node.nodeargd.argnlist;
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var n = __getitem__ (__iterable0__, __index0__);
			if (__t__ (n !== null)) {
				return false;
			}
		}
		return true;
	});},
	get _groupnodecontents_to_text () {return __get__ (this, function (self, groupnode) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'groupnode': var groupnode = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (groupnode === null)) {
			return '';
		}
		if (__t__ (__call__ (isinstance, null, groupnode, latexnodes_nodes.LatexNodeList))) {
			return __call__ (str, null, (function () {
				var __accu0__ = self;
				return __call__ (__accu0__.nodelist_to_text, __accu0__, groupnode);
			}) ());
		}
		if (__t__ (!__t__ (((function () {
			var __accu0__ = groupnode;
			return __call__ (__accu0__.isNodeType, __accu0__, latexnodes_nodes.LatexGroupNode);
		}) ())))) {
			return __call__ (str, null, (function () {
				var __accu0__ = self;
				return __call__ (__accu0__.node_to_text, __accu0__, groupnode);
			}) ());
		}
		return __call__ (str, null, (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.nodelist_to_text, __accu0__, groupnode.nodelist);
		}) ());
	});},
	get node_arg_to_text () {return __get__ (this, function (self, node, k) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'node': var node = __allkwargs0__ [__attrib0__]; break;
						case 'k': var k = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (__t__ (node.nodeargd) && node.nodeargd.argnlist)) {
			return (function () {
				var __accu0__ = self;
				return __call__ (__accu0__._groupnodecontents_to_text, __accu0__, __getitem__ (node.nodeargd.argnlist, k));
			}) ();
		}
		return '';
	});},
	get apply_text_replacements () {return __get__ (this, function (self, s, text_replacements) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 's': var s = __allkwargs0__ [__attrib0__]; break;
						case 'text_replacements': var text_replacements = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __iterable0__ = text_replacements;
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var __left0__ = __getitem__ (__iterable0__, __index0__);
			var pattern = __left0__ [0];
			var replacement = __left0__ [1];
			if (__t__ (__call__ (hasattr, null, pattern, 'sub'))) {
				var s = (function () {
					var __accu0__ = pattern;
					return __call__ (__accu0__.sub, __accu0__, replacement, s);
				}) ();
			}
			else {
				var s = (function () {
					var __accu0__ = s;
					return __call__ (__accu0__.py_replace, __accu0__, pattern, replacement);
				}) ();
			}
		}
		return s;
	});}
});
Object.defineProperty (LatexNodes2Text, 'math_expression_in', property.call (LatexNodes2Text, LatexNodes2Text._get_math_expression_in, LatexNodes2Text._set_math_expression_in));
Object.defineProperty (LatexNodes2Text, 'strict_latex_spaces', property.call (LatexNodes2Text, LatexNodes2Text._get_strict_latex_spaces, LatexNodes2Text._set_strict_latex_spaces));;
export var _PushEquationState =  __class__ ('_PushEquationState', [_util.PushPropOverride], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, l2t) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'l2t': var l2t = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var changes = dict ({'in_math_mode': true});
		if (__t__ (__getitem__ (l2t.strict_latex_spaces, 'in-equations') !== null)) {
			__setitem__ (changes, 'strict_latex_spaces', __call__ (_parse_strict_latex_spaces_dict, null, __getitem__ (l2t.strict_latex_spaces, 'in-equations')));
		}
		__call__ (__call__ (__super__, null, _PushEquationState, '__init__'), null, self, l2t, 'state', (function () {
			var __accu0__ = l2t.state;
			return __call__ (__accu0__.sub_state, __accu0__, __kwargtrans__ (changes));
		}) ());
	});}
});
export var latex2text = function (content, tolerant_parsing, keep_inline_math, keep_comments) {
	if (typeof tolerant_parsing == 'undefined' || (tolerant_parsing != null && tolerant_parsing.hasOwnProperty ("__kwargtrans__"))) {;
		var tolerant_parsing = false;
	};
	if (typeof keep_inline_math == 'undefined' || (keep_inline_math != null && keep_inline_math.hasOwnProperty ("__kwargtrans__"))) {;
		var keep_inline_math = false;
	};
	if (typeof keep_comments == 'undefined' || (keep_comments != null && keep_comments.hasOwnProperty ("__kwargtrans__"))) {;
		var keep_comments = false;
	};
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'content': var content = __allkwargs0__ [__attrib0__]; break;
					case 'tolerant_parsing': var tolerant_parsing = __allkwargs0__ [__attrib0__]; break;
					case 'keep_inline_math': var keep_inline_math = __allkwargs0__ [__attrib0__]; break;
					case 'keep_comments': var keep_comments = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	(function () {
		var __accu0__ = _util;
		return __call__ (__accu0__.pylatexenc_deprecated_ver, __accu0__, '1.0', 'The module-level function `pylatexenc.latex2text.latex2text()` is deprecated in favor of the `pylatexenc.latex2text.LatexNodes2Text` class.');
	}) ();
	var lw = (function () {
		var __accu0__ = latexwalker;
		return __call__ (__accu0__.LatexWalker, __accu0__, content, __kwargtrans__ ({tolerant_parsing: tolerant_parsing}));
	}) ();
	var __left0__ = (function () {
		var __accu0__ = lw;
		return __call__ (__accu0__.parse_content, __accu0__, (function () {
			var __accu1__ = latexnodes_parsers;
			return __call__ (__accu1__.LatexGeneralNodesParser, __accu1__);
		}) ());
	}) ();
	var nodelist = __left0__ [0];
	var _ = __left0__ [1];
	return __call__ (_latexnodes2text, null, nodelist, __kwargtrans__ ({keep_inline_math: keep_inline_math, keep_comments: keep_comments}));
};
export var latexnodes2text = function (nodelist, keep_inline_math, keep_comments) {
	if (typeof keep_inline_math == 'undefined' || (keep_inline_math != null && keep_inline_math.hasOwnProperty ("__kwargtrans__"))) {;
		var keep_inline_math = false;
	};
	if (typeof keep_comments == 'undefined' || (keep_comments != null && keep_comments.hasOwnProperty ("__kwargtrans__"))) {;
		var keep_comments = false;
	};
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'nodelist': var nodelist = __allkwargs0__ [__attrib0__]; break;
					case 'keep_inline_math': var keep_inline_math = __allkwargs0__ [__attrib0__]; break;
					case 'keep_comments': var keep_comments = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	(function () {
		var __accu0__ = _util;
		return __call__ (__accu0__.pylatexenc_deprecated_ver, __accu0__, '1.0', 'The module-level function `pylatexenc.latex2text.latexnodes2text()` is deprecated in favor of the `pylatexenc.latex2text.LatexNodes2Text` class.');
	}) ();
	return __call__ (_latexnodes2text, null, nodelist, __kwargtrans__ ({keep_inline_math: keep_inline_math, keep_comments: keep_comments}));
};
export var _latexnodes2text = function (nodelist, keep_inline_math, keep_comments) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'nodelist': var nodelist = __allkwargs0__ [__attrib0__]; break;
					case 'keep_inline_math': var keep_inline_math = __allkwargs0__ [__attrib0__]; break;
					case 'keep_comments': var keep_comments = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	return (function () {
		var __accu0__ = __call__ (LatexNodes2Text, null, __kwargtrans__ ({math_mode: (__t__ (keep_inline_math) ? 'verbatim' : 'text'), math_fontstyle: null, text_fontstyle: false, keep_comments: keep_comments}));
		return __call__ (__accu0__.nodelist_to_text, __accu0__, nodelist);
	}) ();
};

