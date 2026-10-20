import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import {EnvironmentTextSpec, MacroTextSpec, SpecialsTextSpec, _split_chars, fmt_equation_environment, fmt_input_macro, fmt_item_macro, fmt_list_environment, fmt_math_expression_in_delimiters, fmt_math_text_style, fmt_matrix_environment_node, fmt_subsuperscript_text, placeholder_node_formatter} from './pylatexenc.latex2text.js';
import {latex_today as _latex_today} from './latex2text_jscompat.js';
import {compose_accented_char as _compose_accented_char} from './latex2text_jscompat.js';
export {fmt_math_text_style, EnvironmentTextSpec, MacroTextSpec, _split_chars, _compose_accented_char, fmt_math_expression_in_delimiters, fmt_subsuperscript_text, placeholder_node_formatter, fmt_matrix_environment_node, fmt_input_macro, fmt_list_environment, SpecialsTextSpec, _latex_today, fmt_item_macro, fmt_equation_environment};
var __name__ = 'pylatexenc.latex2text._defaultspecs';
export var _format_uebung = function (n, l2tobj) {
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
	var nodeargs = (__t__ (n.nodeargd !== null) ? n.nodeargd.argnlist : []);
	var s = __add__ (__add__ ('\n', __call__ (str, null, (function () {
		var __accu0__ = l2tobj;
		return __call__ (__accu0__.nodelist_to_text, __accu0__, [__getitem__ (nodeargs, 0)]);
	}) ())), '\n');
	var optarg = __getitem__ (nodeargs, 1);
	if (__t__ (optarg !== null)) {
		var s = __call__ (__iadd__, null, s, (function () {
			var __accu0__ = '[{}]\n';
			return __call__ (__accu0__.format, __accu0__, (function () {
				var __accu1__ = l2tobj;
				return __call__ (__accu1__.nodelist_to_text, __accu1__, [optarg]);
			}) ());
		}) ());
	}
	return s;
};
export var _sqrt_root_signs = dict ({'3': '∛', '4': '∜'});
export var _format_sqrt = function (n, l2tobj) {
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
	var radicand_text = (function () {
		var __accu0__ = l2tobj;
		return __call__ (__accu0__.node_arg_to_text, __accu0__, n, 1);
	}) ();
	var degree = (function () {
		var __accu0__ = (function () {
			var __accu1__ = l2tobj;
			return __call__ (__accu1__.node_arg_to_text, __accu1__, n, 0);
		}) ();
		return __call__ (__accu0__.strip, __accu0__);
	}) ();
	if (__t__ (__t__ (!__t__ ((__call__ (_is_fancy_math, null, l2tobj)))) || !__t__ ((l2tobj.state.in_math_mode)))) {
		if (__t__ (!__t__ ((degree)))) {
			return __add__ (__add__ ('√(', radicand_text), ')');
		}
		if (__t__ (__in__ (degree, _sqrt_root_signs))) {
			return __add__ (__add__ (__add__ (__getitem__ (_sqrt_root_signs, degree), '('), radicand_text), ')');
		}
		return __add__ (__add__ (__add__ (degree, '√('), radicand_text), ')');
	}
	var radicand = __call__ (fmt_math_expression_in_delimiters, null, radicand_text, l2tobj.state.math_expression_in);
	var root_sign = '√';
	var prefix = '';
	if (__t__ (degree)) {
		if (__t__ (__in__ (degree, _sqrt_root_signs))) {
			var root_sign = __getitem__ (_sqrt_root_signs, degree);
		}
		else {
			var prefix = degree;
		}
	}
	if (__t__ (__ne__ (radicand, radicand_text))) {
		var cls_right = 'close';
	}
	else {
		var cls_right = 'openend';
	}
	return (function () {
		var __accu0__ = l2tobj;
		return __call__ (__accu0__.make_math_piece, __accu0__, __kwargtrans__ ({text: __add__ (__add__ (prefix, root_sign), radicand), cls: tuple (['ord', cls_right])}));
	}) ();
};
export var _format_maketitle = function (title, author, date) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'title': var title = __allkwargs0__ [__attrib0__]; break;
					case 'author': var author = __allkwargs0__ [__attrib0__]; break;
					case 'date': var date = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var s = __add__ (title, '\n');
	var s = __call__ (__iadd__, null, s, __add__ (__add__ ('    ', author), '\n'));
	var s = __call__ (__iadd__, null, s, __add__ (__add__ ('    ', date), '\n'));
	var s = __call__ (__iadd__, null, s, __add__ (__mul__ ('=', __call__ (max, null, __call__ (len, null, __call__ (_split_chars, null, title)), __add__ (4, __call__ (len, null, __call__ (_split_chars, null, author))), __add__ (4, __call__ (len, null, __call__ (_split_chars, null, date))))), '\n\n'));
	return s;
};
export var _is_fancy_math = function (l2tobj) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'l2tobj': var l2tobj = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	return __eq__ (l2tobj.math_mode, 'fancy');
};
export var _mathxx_formatter = function (style) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'style': var style = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var formatter = function (node, l2tobj) {
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
		if (__t__ (l2tobj.state.in_math_mode)) {
			if (__t__ (l2tobj.state.math_fontstyle === false)) {
				return (function () {
					var __accu0__ = l2tobj;
					return __call__ (__accu0__.node_arg_to_text, __accu0__, node, 0);
				}) ();
			}
			var __withid0__ = (function () {
				var __accu0__ = l2tobj;
				return __call__ (__accu0__.push_state, __accu0__, __kwargtrans__ ({math_fontstyle: style}));
			}) ();
			try {
				__withid0__.__enter__ ();
				var arg_text = (function () {
					var __accu0__ = l2tobj;
					return __call__ (__accu0__.node_arg_to_text, __accu0__, node, 0);
				}) ();
				__withid0__.__exit__ ();
			}
			catch (__except0__) {
				if (! (__withid0__.__exit__ (__except0__.name, __except0__, __except0__.stack))) {
					throw __except0__;
				}
			}
			return arg_text;
		}
		if (__t__ (l2tobj.state.text_fontstyle === false)) {
			return (function () {
				var __accu0__ = l2tobj;
				return __call__ (__accu0__.node_arg_to_text, __accu0__, node, 0);
			}) ();
		}
		var __withid0__ = (function () {
			var __accu0__ = l2tobj;
			return __call__ (__accu0__.push_state, __accu0__, __kwargtrans__ ({text_fontstyle: style}));
		}) ();
		try {
			__withid0__.__enter__ ();
			var arg_text = (function () {
				var __accu0__ = l2tobj;
				return __call__ (__accu0__.node_arg_to_text, __accu0__, node, 0);
			}) ();
			__withid0__.__exit__ ();
		}
		catch (__except0__) {
			if (! (__withid0__.__exit__ (__except0__.name, __except0__, __except0__.stack))) {
				throw __except0__;
			}
		}
		return arg_text;
	};
	return formatter;
};
export var _textxx_fontstyles = dict ({'textrm': null, 'textup': null, 'textmd': null, 'textbf': 'bold', 'textit': 'italic', 'textsl': 'italic', 'textsf': 'sans', 'texttt': 'monospace'});
export var _textxx_formatter = function (macroname) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'macroname': var macroname = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var set_fontstyle = __in__ (macroname, _textxx_fontstyles);
	var style = (function () {
		var __accu0__ = _textxx_fontstyles;
		return __call__ (__accu0__.py_get, __accu0__, macroname, null);
	}) ();
	var formatter = function (node, l2tobj) {
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
		var in_math_mode = l2tobj.state.in_math_mode;
		var state_changes = dict ({'in_math_mode': false});
		if (__t__ (__t__ (set_fontstyle) && l2tobj.state.text_fontstyle !== false)) {
			__setitem__ (state_changes, 'text_fontstyle', style);
		}
		var __withid0__ = (function () {
			var __accu0__ = l2tobj;
			return __call__ (__accu0__.push_state, __accu0__, __kwargtrans__ (state_changes));
		}) ();
		try {
			__withid0__.__enter__ ();
			var arg_text = (function () {
				var __accu0__ = l2tobj;
				return __call__ (__accu0__.node_arg_to_text, __accu0__, node, 0);
			}) ();
			__withid0__.__exit__ ();
		}
		catch (__except0__) {
			if (! (__withid0__.__exit__ (__except0__.name, __except0__, __except0__.stack))) {
				throw __except0__;
			}
		}
		if (__t__ (__t__ (!__t__ ((in_math_mode))) || !__t__ ((__call__ (_is_fancy_math, null, l2tobj))))) {
			return arg_text;
		}
		return (function () {
			var __accu0__ = l2tobj;
			return __call__ (__accu0__.make_math_piece, __accu0__, __kwargtrans__ ({text: arg_text, cls: 'text'}));
		}) ();
	};
	return formatter;
};
export var _emph_toggle_fontstyles = dict ({null: 'italic', 'italic': null, 'bold': 'bold-italic', 'bold-italic': 'bold', 'sans': 'sans-italic', 'sans-italic': 'sans', 'sans-bold': 'sans-bold-italic', 'sans-bold-italic': 'sans-bold'});
export var _emph_formatter = function (node, l2tobj) {
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
	var in_math_mode = l2tobj.state.in_math_mode;
	if (__t__ (l2tobj.state.text_fontstyle === false)) {
		var style = false;
	}
	else {
		var style = (function () {
			var __accu0__ = _emph_toggle_fontstyles;
			return __call__ (__accu0__.py_get, __accu0__, l2tobj.state.text_fontstyle, 'italic');
		}) ();
	}
	var __withid0__ = (function () {
		var __accu0__ = l2tobj;
		return __call__ (__accu0__.push_state, __accu0__, __kwargtrans__ ({in_math_mode: false, text_fontstyle: style}));
	}) ();
	try {
		__withid0__.__enter__ ();
		var arg_text = (function () {
			var __accu0__ = l2tobj;
			return __call__ (__accu0__.node_arg_to_text, __accu0__, node, 0);
		}) ();
		__withid0__.__exit__ ();
	}
	catch (__except0__) {
		if (! (__withid0__.__exit__ (__except0__.name, __except0__, __except0__.stack))) {
			throw __except0__;
		}
	}
	if (__t__ (__t__ (!__t__ ((in_math_mode))) || !__t__ ((__call__ (_is_fancy_math, null, l2tobj))))) {
		return arg_text;
	}
	return (function () {
		var __accu0__ = l2tobj;
		return __call__ (__accu0__.make_math_piece, __accu0__, __kwargtrans__ ({text: arg_text, cls: 'text'}));
	}) ();
};
export var _math_operator_names = tuple ([tuple (['cos', 'cos']), tuple (['sin', 'sin']), tuple (['tan', 'tan']), tuple (['sec', 'sec']), tuple (['csc', 'csc']), tuple (['cot', 'cot']), tuple (['arccos', 'arccos']), tuple (['arcsin', 'arcsin']), tuple (['arctan', 'arctan']), tuple (['cosh', 'cosh']), tuple (['sinh', 'sinh']), tuple (['tanh', 'tanh']), tuple (['coth', 'coth']), tuple (['arccosh', 'arccosh']), tuple (['arcsinh', 'arcsinh']), tuple (['arctanh', 'arctanh']), tuple (['ln', 'ln']), tuple (['lg', 'lg']), tuple (['log', 'log']), tuple (['exp', 'exp']), tuple (['max', 'max']), tuple (['min', 'min']), tuple (['sup', 'sup']), tuple (['inf', 'inf']), tuple (['lim', 'lim']), tuple (['limsup', 'lim sup']), tuple (['liminf', 'lim inf']), tuple (['injlim', 'inj lim']), tuple (['projlim', 'proj lim']), tuple (['varlimsup', 'lim sup']), tuple (['varliminf', 'lim inf']), tuple (['varinjlim', 'inj lim']), tuple (['varprojlim', 'proj lim']), tuple (['arg', 'arg']), tuple (['deg', 'deg']), tuple (['det', 'det']), tuple (['dim', 'dim']), tuple (['gcd', 'gcd']), tuple (['hom', 'hom']), tuple (['ker', 'ker']), tuple (['Pr', 'Pr'])]);
export var _math_operator_formatter = function (text) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'text': var text = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var formatter = function (node, l2tobj) {
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
		if (__t__ (__t__ (!__t__ ((__call__ (_is_fancy_math, null, l2tobj)))) || !__t__ ((l2tobj.state.in_math_mode)))) {
			return text;
		}
		return (function () {
			var __accu0__ = l2tobj;
			return __call__ (__accu0__.make_math_piece, __accu0__, __kwargtrans__ ({text: text, cls: 'op'}));
		}) ();
	};
	return formatter;
};
export var _operatorname_formatter = function (node, l2tobj) {
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
	if (__t__ (__t__ (!__t__ ((__call__ (_is_fancy_math, null, l2tobj)))) || !__t__ ((l2tobj.state.in_math_mode)))) {
		return (function () {
			var __accu0__ = l2tobj;
			return __call__ (__accu0__.node_arg_to_text, __accu0__, node, 1);
		}) ();
	}
	var __withid0__ = (function () {
		var __accu0__ = l2tobj;
		return __call__ (__accu0__.push_state, __accu0__, __kwargtrans__ ({math_fontstyle: null}));
	}) ();
	try {
		__withid0__.__enter__ ();
		var arg_text = (function () {
			var __accu0__ = l2tobj;
			return __call__ (__accu0__.node_arg_to_text, __accu0__, node, 1);
		}) ();
		__withid0__.__exit__ ();
	}
	catch (__except0__) {
		if (! (__withid0__.__exit__ (__except0__.name, __except0__, __except0__.stack))) {
			throw __except0__;
		}
	}
	return (function () {
		var __accu0__ = l2tobj;
		return __call__ (__accu0__.make_math_piece, __accu0__, __kwargtrans__ ({text: arg_text, cls: 'op'}));
	}) ();
};
export var _bmod_formatter = function (node, l2tobj) {
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
	if (__t__ (__t__ (!__t__ ((__call__ (_is_fancy_math, null, l2tobj)))) || !__t__ ((l2tobj.state.in_math_mode)))) {
		return 'mod';
	}
	return (function () {
		var __accu0__ = l2tobj;
		return __call__ (__accu0__.make_math_piece, __accu0__, __kwargtrans__ ({text: 'mod', cls: 'bin'}));
	}) ();
};
export var _mod_formatter = function (prefix, suffix, cls_right) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'prefix': var prefix = __allkwargs0__ [__attrib0__]; break;
					case 'suffix': var suffix = __allkwargs0__ [__attrib0__]; break;
					case 'cls_right': var cls_right = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var formatter = function (node, l2tobj) {
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
		var text = __add__ (__add__ (prefix, (function () {
			var __accu0__ = l2tobj;
			return __call__ (__accu0__.node_arg_to_text, __accu0__, node, 0);
		}) ()), suffix);
		if (__t__ (__t__ (!__t__ ((__call__ (_is_fancy_math, null, l2tobj)))) || !__t__ ((l2tobj.state.in_math_mode)))) {
			return text;
		}
		return (function () {
			var __accu0__ = l2tobj;
			return __call__ (__accu0__.make_math_piece, __accu0__, __kwargtrans__ ({text: text, cls: tuple (['op', cls_right])}));
		}) ();
	};
	return formatter;
};
export var _subsuperscript_formatter = function (which) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'which': var which = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var formatter = function (node, l2tobj, specials_chars) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'node': var node = __allkwargs0__ [__attrib0__]; break;
						case 'l2tobj': var l2tobj = __allkwargs0__ [__attrib0__]; break;
						case 'specials_chars': var specials_chars = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (__t__ (node.nodeargd === null) || !__t__ ((node.nodeargd.argnlist)))) {
			return specials_chars;
		}
		var fancy = __t__ (__call__ (_is_fancy_math, null, l2tobj)) && l2tobj.state.in_math_mode;
		var arg_text = (function () {
			var __accu0__ = (function () {
				var __accu1__ = l2tobj;
				return __call__ (__accu1__.node_arg_to_text, __accu1__, node, 0);
			}) ();
			return __call__ (__accu0__.strip, __accu0__);
		}) ();
		if (__t__ (!__t__ ((arg_text)))) {
			return '';
		}
		var subsuper_text = __call__ (fmt_subsuperscript_text, null, arg_text, which, __kwargtrans__ ({normalize_math_style_chars: true}));
		if (__t__ (__t__ (subsuper_text === null) && __t__ (fancy) && __in__ (' ', arg_text))) {
			var subsuper_text = __call__ (fmt_subsuperscript_text, null, (function () {
				var __accu0__ = arg_text;
				return __call__ (__accu0__.py_replace, __accu0__, ' ', '');
			}) (), which, __kwargtrans__ ({normalize_math_style_chars: true}));
		}
		if (__t__ (subsuper_text !== null)) {
			if (__t__ (!__t__ ((fancy)))) {
				return subsuper_text;
			}
			return (function () {
				var __accu0__ = l2tobj;
				return __call__ (__accu0__.make_math_piece, __accu0__, __kwargtrans__ ({text: subsuper_text, cls: tuple (['script', 'ord']), script_kind: which}));
			}) ();
		}
		if (__t__ (!__t__ ((fancy)))) {
			return __add__ (specials_chars, __call__ (fmt_math_expression_in_delimiters, null, arg_text, l2tobj.state.math_expression_in));
		}
		return (function () {
			var __accu0__ = l2tobj;
			return __call__ (__accu0__.make_math_piece, __accu0__, __kwargtrans__ ({inner_text: arg_text, prefix: specials_chars, cls: tuple (['script', 'openend']), script_kind: which, script_latex_notation: true}));
		}) ();
	};
	return formatter;
};
export var _format_frac = function (n, l2tobj) {
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
	var math_expression_in = l2tobj.state.math_expression_in;
	var numerator_text = (function () {
		var __accu0__ = l2tobj;
		return __call__ (__accu0__.node_arg_to_text, __accu0__, n, 0);
	}) ();
	var numerator = __call__ (fmt_math_expression_in_delimiters, null, numerator_text, math_expression_in);
	var denominator_text = (function () {
		var __accu0__ = l2tobj;
		return __call__ (__accu0__.node_arg_to_text, __accu0__, n, 1);
	}) ();
	var denominator = __call__ (fmt_math_expression_in_delimiters, null, denominator_text, math_expression_in);
	var text = __add__ (__add__ (numerator, '/'), denominator);
	if (__t__ (__t__ (!__t__ ((__call__ (_is_fancy_math, null, l2tobj)))) || !__t__ ((l2tobj.state.in_math_mode)))) {
		return text;
	}
	if (__t__ (__ne__ (numerator, numerator_text))) {
		var cls_left = 'open';
	}
	else {
		var cls_left = 'openend';
	}
	if (__t__ (__ne__ (denominator, denominator_text))) {
		var cls_right = 'close';
	}
	else {
		var cls_right = 'openend';
	}
	return (function () {
		var __accu0__ = l2tobj;
		return __call__ (__accu0__.make_math_piece, __accu0__, __kwargtrans__ ({text: text, cls: tuple ([cls_left, cls_right])}));
	}) ();
};
export var _latex_specs_placeholders = dict ({'environments': [], 'specials': [], 'macros': __add__ ([], (function () {
	var __accu0__ = [];
	var __iterable0__ = tuple ([tuple (['includegraphics', __call__ (placeholder_node_formatter, null, 'graphics')]), tuple (['ref', '<ref>']), tuple (['autoref', '<ref>']), tuple (['cref', '<ref>']), tuple (['Cref', '<Ref>']), tuple (['eqref', '(<ref>)']), tuple (['cite', '<cit.>']), tuple (['citet', '<cit.>']), tuple (['citep', '<cit.>'])]);
	for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
		var __left0__ = __getitem__ (__iterable0__, __index0__);
		var x = __left0__ [0];
		var y = __left0__ [1];
		(function () {
			var __accu1__ = __accu0__;
			return __call__ (__accu1__.append, __accu1__, __call__ (MacroTextSpec, null, x, __kwargtrans__ ({simplify_repl: y})));
		}) ();
	}
	return __accu0__;
}) ())});
export var _latex_specs_approximations = dict ({'environments': [__call__ (EnvironmentTextSpec, null, 'center', __kwargtrans__ ({simplify_repl: '\n%s\n'})), __call__ (EnvironmentTextSpec, null, 'flushleft', __kwargtrans__ ({simplify_repl: '\n%s\n'})), __call__ (EnvironmentTextSpec, null, 'flushright', __kwargtrans__ ({simplify_repl: '\n%s\n'})), __call__ (EnvironmentTextSpec, null, 'exenumerate', __kwargtrans__ ({simplify_repl: fmt_list_environment})), __call__ (EnvironmentTextSpec, null, 'enumerate', __kwargtrans__ ({simplify_repl: fmt_list_environment})), __call__ (EnvironmentTextSpec, null, 'list', __kwargtrans__ ({simplify_repl: fmt_list_environment})), __call__ (EnvironmentTextSpec, null, 'itemize', __kwargtrans__ ({simplify_repl: fmt_list_environment})), __call__ (EnvironmentTextSpec, null, 'description', __kwargtrans__ ({simplify_repl: fmt_list_environment})), __call__ (EnvironmentTextSpec, null, 'subequations', __kwargtrans__ ({discard: false})), __call__ (EnvironmentTextSpec, null, 'figure', __kwargtrans__ ({discard: false})), __call__ (EnvironmentTextSpec, null, 'table', __kwargtrans__ ({discard: false})), __call__ (EnvironmentTextSpec, null, 'array', __kwargtrans__ ({simplify_repl: fmt_matrix_environment_node})), __call__ (EnvironmentTextSpec, null, 'pmatrix', __kwargtrans__ ({simplify_repl: fmt_matrix_environment_node})), __call__ (EnvironmentTextSpec, null, 'bmatrix', __kwargtrans__ ({simplify_repl: fmt_matrix_environment_node})), __call__ (EnvironmentTextSpec, null, 'smallmatrix', __kwargtrans__ ({simplify_repl: fmt_matrix_environment_node})), __call__ (EnvironmentTextSpec, null, 'psmallmatrix', __kwargtrans__ ({simplify_repl: fmt_matrix_environment_node})), __call__ (EnvironmentTextSpec, null, 'bsmallmatrix', __kwargtrans__ ({simplify_repl: fmt_matrix_environment_node})), __call__ (EnvironmentTextSpec, null, 'equation', __kwargtrans__ ({simplify_repl: fmt_equation_environment})), __call__ (EnvironmentTextSpec, null, 'equation*', __kwargtrans__ ({simplify_repl: fmt_equation_environment})), __call__ (EnvironmentTextSpec, null, 'eqnarray', __kwargtrans__ ({simplify_repl: fmt_equation_environment})), __call__ (EnvironmentTextSpec, null, 'eqnarray*', __kwargtrans__ ({simplify_repl: fmt_equation_environment})), __call__ (EnvironmentTextSpec, null, 'align', __kwargtrans__ ({simplify_repl: fmt_equation_environment})), __call__ (EnvironmentTextSpec, null, 'multline', __kwargtrans__ ({simplify_repl: fmt_equation_environment})), __call__ (EnvironmentTextSpec, null, 'gather', __kwargtrans__ ({simplify_repl: fmt_equation_environment})), __call__ (EnvironmentTextSpec, null, 'align*', __kwargtrans__ ({simplify_repl: fmt_equation_environment})), __call__ (EnvironmentTextSpec, null, 'multline*', __kwargtrans__ ({simplify_repl: fmt_equation_environment})), __call__ (EnvironmentTextSpec, null, 'gather*', __kwargtrans__ ({simplify_repl: fmt_equation_environment})), __call__ (EnvironmentTextSpec, null, 'dmath', __kwargtrans__ ({simplify_repl: fmt_equation_environment})), __call__ (EnvironmentTextSpec, null, 'dmath*', __kwargtrans__ ({simplify_repl: fmt_equation_environment}))], 'specials': [__call__ (SpecialsTextSpec, null, '&', '   ')], 'macros': __add__ ([__call__ (MacroTextSpec, null, 'emph', __kwargtrans__ ({simplify_repl: _emph_formatter})), __call__ (MacroTextSpec, null, 'textrm', __kwargtrans__ ({simplify_repl: __call__ (_textxx_formatter, null, 'textrm')})), __call__ (MacroTextSpec, null, 'textit', __kwargtrans__ ({simplify_repl: __call__ (_textxx_formatter, null, 'textit')})), __call__ (MacroTextSpec, null, 'textbf', __kwargtrans__ ({simplify_repl: __call__ (_textxx_formatter, null, 'textbf')})), __call__ (MacroTextSpec, null, 'textsc', __kwargtrans__ ({discard: false})), __call__ (MacroTextSpec, null, 'textsl', __kwargtrans__ ({simplify_repl: __call__ (_textxx_formatter, null, 'textsl')})), __call__ (MacroTextSpec, null, 'text', __kwargtrans__ ({simplify_repl: __call__ (_textxx_formatter, null, 'text')})), __call__ (MacroTextSpec, null, 'textmd', __kwargtrans__ ({simplify_repl: __call__ (_textxx_formatter, null, 'textmd')})), __call__ (MacroTextSpec, null, 'textsf', __kwargtrans__ ({simplify_repl: __call__ (_textxx_formatter, null, 'textsf')})), __call__ (MacroTextSpec, null, 'texttt', __kwargtrans__ ({simplify_repl: __call__ (_textxx_formatter, null, 'texttt')})), __call__ (MacroTextSpec, null, 'textup', __kwargtrans__ ({simplify_repl: __call__ (_textxx_formatter, null, 'textup')})), __call__ (MacroTextSpec, null, 'mbox', __kwargtrans__ ({simplify_repl: __call__ (_textxx_formatter, null, 'mbox')}))], (function () {
	var __accu0__ = [];
	var __iterable0__ = tuple ([tuple (['title', (function __lambda__ (n, l2tobj) {
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
		return __call__ (setattr, null, l2tobj, '_doc_title', __call__ (str, null, (function () {
			var __accu1__ = l2tobj;
			return __call__ (__accu1__.nodelist_to_text, __accu1__, __getslice__ (n.nodeargd.argnlist, __neg__ (1), null, 1));
		}) ()));
	})]), tuple (['author', (function __lambda__ (n, l2tobj) {
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
		return __call__ (setattr, null, l2tobj, '_doc_author', __call__ (str, null, (function () {
			var __accu1__ = l2tobj;
			return __call__ (__accu1__.nodelist_to_text, __accu1__, __getslice__ (n.nodeargd.argnlist, __neg__ (1), null, 1));
		}) ()));
	})]), tuple (['date', (function __lambda__ (n, l2tobj) {
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
		return __call__ (setattr, null, l2tobj, '_doc_date', __call__ (str, null, (function () {
			var __accu1__ = l2tobj;
			return __call__ (__accu1__.nodelist_to_text, __accu1__, __getslice__ (n.nodeargd.argnlist, __neg__ (1), null, 1));
		}) ()));
	})]), tuple (['maketitle', (function __lambda__ (n, l2tobj) {
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
		return __call__ (_format_maketitle, null, __call__ (getattr, null, l2tobj, '_doc_title', '[NO \\title GIVEN]'), __call__ (getattr, null, l2tobj, '_doc_author', '[NO \\author GIVEN]'), __call__ (getattr, null, l2tobj, '_doc_date', __call__ (_latex_today, null)));
	})]), tuple (['url', '<%s>']), tuple (['item', fmt_item_macro]), tuple (['footnote', '[%(2)s]']), tuple (['href', (function __lambda__ (n, l2tobj) {
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
		return (function () {
			var __accu1__ = '{} <{}>';
			return __call__ (__accu1__.format, __accu1__, (function () {
				var __accu2__ = l2tobj;
				return __call__ (__accu2__.nodelist_to_text, __accu2__, [__getitem__ (n.nodeargd.argnlist, 1)]);
			}) (), (function () {
				var __accu2__ = l2tobj;
				return __call__ (__accu2__.nodelist_to_text, __accu2__, [__getitem__ (n.nodeargd.argnlist, 0)]);
			}) ());
		}) ();
	})]), tuple (['part', (function __lambda__ (n, l2tobj) {
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
		return (function () {
			var __accu1__ = '\n\nPART: {}\n';
			return __call__ (__accu1__.format, __accu1__, (function () {
				var __accu2__ = (function () {
					var __accu3__ = l2tobj;
					return __call__ (__accu3__.node_arg_to_text, __accu3__, n, 2);
				}) ();
				return __call__ (__accu2__.upper, __accu2__);
			}) ());
		}) ();
	})]), tuple (['chapter', (function __lambda__ (n, l2tobj) {
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
		return (function () {
			var __accu1__ = '\n\nCHAPTER: {}\n';
			return __call__ (__accu1__.format, __accu1__, (function () {
				var __accu2__ = (function () {
					var __accu3__ = l2tobj;
					return __call__ (__accu3__.node_arg_to_text, __accu3__, n, 2);
				}) ();
				return __call__ (__accu2__.upper, __accu2__);
			}) ());
		}) ();
	})]), tuple (['section', (function __lambda__ (n, l2tobj) {
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
		return (function () {
			var __accu1__ = '\n\n§ {}\n';
			return __call__ (__accu1__.format, __accu1__, (function () {
				var __accu2__ = (function () {
					var __accu3__ = l2tobj;
					return __call__ (__accu3__.node_arg_to_text, __accu3__, n, 2);
				}) ();
				return __call__ (__accu2__.upper, __accu2__);
			}) ());
		}) ();
	})]), tuple (['subsection', (function __lambda__ (n, l2tobj) {
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
		return (function () {
			var __accu1__ = '\n\n §.§ {}\n';
			return __call__ (__accu1__.format, __accu1__, (function () {
				var __accu2__ = l2tobj;
				return __call__ (__accu2__.node_arg_to_text, __accu2__, n, 2);
			}) ());
		}) ();
	})]), tuple (['subsubsection', (function __lambda__ (n, l2tobj) {
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
		return (function () {
			var __accu1__ = '\n\n  §.§.§ {}\n';
			return __call__ (__accu1__.format, __accu1__, (function () {
				var __accu2__ = l2tobj;
				return __call__ (__accu2__.node_arg_to_text, __accu2__, n, 2);
			}) ());
		}) ();
	})]), tuple (['paragraph', (function __lambda__ (n, l2tobj) {
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
		return (function () {
			var __accu1__ = '\n\n  {}\n';
			return __call__ (__accu1__.format, __accu1__, (function () {
				var __accu2__ = l2tobj;
				return __call__ (__accu2__.node_arg_to_text, __accu2__, n, 2);
			}) ());
		}) ();
	})]), tuple (['subparagraph', (function __lambda__ (n, l2tobj) {
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
		return (function () {
			var __accu1__ = '\n\n    {}\n';
			return __call__ (__accu1__.format, __accu1__, (function () {
				var __accu2__ = l2tobj;
				return __call__ (__accu2__.node_arg_to_text, __accu2__, n, 2);
			}) ());
		}) ();
	})]), tuple (['textcolor', '%(3)s']), tuple (['colorbox', '%(3)s']), tuple (['fcolorbox', '%(5)s']), tuple (['hspace', '']), tuple (['vspace', '\n']), tuple (['\\', '\n']), tuple (['frac', _format_frac]), tuple (['nicefrac', _format_frac]), tuple (['textfrac', _format_frac]), tuple (['overline', '%s']), tuple (['underline', '%s']), tuple (['widehat', '%s']), tuple (['widetilde', '%s']), tuple (['wideparen', '%s']), tuple (['overleftarrow', '%s']), tuple (['overrightarrow', '%s']), tuple (['overleftrightarrow', '%s']), tuple (['underleftarrow', '%s']), tuple (['underrightarrow', '%s']), tuple (['underleftrightarrow', '%s']), tuple (['overbrace', '%s']), tuple (['underbrace', '%s']), tuple (['overgroup', '%s']), tuple (['undergroup', '%s']), tuple (['overbracket', '%s']), tuple (['underbracket', '%s']), tuple (['overlinesegment', '%s']), tuple (['underlinesegment', '%s']), tuple (['overleftharpoon', '%s']), tuple (['overrightharpoon', '%s'])]);
	for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
		var __left0__ = __getitem__ (__iterable0__, __index0__);
		var x = __left0__ [0];
		var y = __left0__ [1];
		(function () {
			var __accu1__ = __accu0__;
			return __call__ (__accu1__.append, __accu1__, __call__ (MacroTextSpec, null, x, __kwargtrans__ ({simplify_repl: y})));
		}) ();
	}
	return __accu0__;
}) ())});
export var _latex_specs_subsuperscripts = dict ({'environments': [], 'specials': [__call__ (SpecialsTextSpec, null, '^', __kwargtrans__ ({simplify_repl: __call__ (_subsuperscript_formatter, null, 'superscript')})), __call__ (SpecialsTextSpec, null, '_', __kwargtrans__ ({simplify_repl: __call__ (_subsuperscript_formatter, null, 'subscript')}))], 'macros': []});
export var _latex_specs_base = dict ({'environments': [], 'specials': [], 'macros': __add__ (__add__ ([__call__ (MacroTextSpec, null, 'mathrm', __kwargtrans__ ({simplify_repl: __call__ (_mathxx_formatter, null, null)})), __call__ (MacroTextSpec, null, 'mathbf', __kwargtrans__ ({simplify_repl: __call__ (_mathxx_formatter, null, 'bold')})), __call__ (MacroTextSpec, null, 'mathit', __kwargtrans__ ({simplify_repl: __call__ (_mathxx_formatter, null, 'italic')})), __call__ (MacroTextSpec, null, 'mathsf', __kwargtrans__ ({simplify_repl: __call__ (_mathxx_formatter, null, 'sans')})), __call__ (MacroTextSpec, null, 'mathbb', __kwargtrans__ ({simplify_repl: __call__ (_mathxx_formatter, null, 'doublestruck')})), __call__ (MacroTextSpec, null, 'mathtt', __kwargtrans__ ({simplify_repl: __call__ (_mathxx_formatter, null, 'monospace')})), __call__ (MacroTextSpec, null, 'mathcal', __kwargtrans__ ({simplify_repl: __call__ (_mathxx_formatter, null, 'script')})), __call__ (MacroTextSpec, null, 'mathscr', __kwargtrans__ ({simplify_repl: __call__ (_mathxx_formatter, null, 'script')})), __call__ (MacroTextSpec, null, 'mathfrak', __kwargtrans__ ({simplify_repl: __call__ (_mathxx_formatter, null, 'fraktur')})), __call__ (MacroTextSpec, null, 'operatorname', __kwargtrans__ ({simplify_repl: _operatorname_formatter})), __call__ (MacroTextSpec, null, 'bmod', __kwargtrans__ ({simplify_repl: _bmod_formatter})), __call__ (MacroTextSpec, null, 'pmod', __kwargtrans__ ({simplify_repl: __call__ (_mod_formatter, null, '(mod ', ')', 'close')})), __call__ (MacroTextSpec, null, 'mod', __kwargtrans__ ({simplify_repl: __call__ (_mod_formatter, null, 'mod ', '', 'ord')})), __call__ (MacroTextSpec, null, 'input', __kwargtrans__ ({simplify_repl: fmt_input_macro})), __call__ (MacroTextSpec, null, 'include', __kwargtrans__ ({simplify_repl: fmt_input_macro}))], (function () {
	var __accu0__ = [];
	var __iterable0__ = tuple ([tuple (['today', __call__ (_latex_today, null)]), tuple (['texorpdfstring', (function __lambda__ (node, l2tobj) {
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
		return (function () {
			var __accu1__ = l2tobj;
			return __call__ (__accu1__.nodelist_to_text, __accu1__, __getslice__ (node.nodeargd.argnlist, 1, 2, 1));
		}) ();
	})]), tuple (['oe', 'œ']), tuple (['OE', 'Œ']), tuple (['ae', 'æ']), tuple (['AE', 'Æ']), tuple (['aa', 'å']), tuple (['AA', 'Å']), tuple (['o', 'ø']), tuple (['O', 'Ø']), tuple (['ss', 'ß']), tuple (['L', 'Ł']), tuple (['l', 'ł']), tuple (['i', 'ı']), tuple (['j', 'ȷ']), tuple (['~', '~']), tuple (['&', '&']), tuple (['$', '$']), tuple (['{', '{']), tuple (['}', '}']), tuple (['%', (function __lambda__ (arg) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'arg': var arg = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return '%';
	})]), tuple (['#', '#']), tuple (['_', '_']), tuple (['textquoteleft', '‘']), tuple (['textquoteright', '’']), tuple (['textquotedblright', '”']), tuple (['textquotedblleft', '“']), tuple (['textendash', '–']), tuple (['textemdash', '—']), tuple (['textpm', '±']), tuple (['textmp', '∓']), tuple (['texteuro', '€']), tuple (['backslash', '\\']), tuple (['textbackslash', '\\']), tuple (['ensuremath', '%s']), tuple (['hbar', 'ħ']), tuple (['ell', 'ℓ']), tuple (['forall', '∀']), tuple (['complement', '∁']), tuple (['partial', '∂']), tuple (['exists', '∃']), tuple (['nexists', '∄']), tuple (['varnothing', '∅']), tuple (['emptyset', '∅']), tuple (['aleph', 'ℵ']), tuple (['nabla', '∇']), tuple (['in', '∈']), tuple (['notin', '∉']), tuple (['ni', '∋']), tuple (['prod', '∏']), tuple (['coprod', '∐']), tuple (['sum', '∑']), tuple (['setminus', '∖']), tuple (['smallsetminus', '∖']), tuple (['ast', '∗']), tuple (['circ', '∘']), tuple (['bullet', '∙']), tuple (['sqrt', _format_sqrt]), tuple (['propto', '∝']), tuple (['infty', '∞']), tuple (['parallel', '∥']), tuple (['nparallel', '∦']), tuple (['wedge', '∧']), tuple (['land', '∧']), tuple (['vee', '∨']), tuple (['lor', '∨']), tuple (['cap', '∩']), tuple (['cup', '∪']), tuple (['int', '∫']), tuple (['iint', '∬']), tuple (['iiint', '∭']), tuple (['oint', '∮']), tuple (['sim', '∼']), tuple (['backsim', '∽']), tuple (['simeq', '≃']), tuple (['approx', '≈']), tuple (['neq', '≠']), tuple (['ne', '≠']), tuple (['equiv', '≡']), tuple (['le', '≤']), tuple (['ge', '≥']), tuple (['leq', '≤']), tuple (['geq', '≥']), tuple (['leqslant', '⩽']), tuple (['geqslant', '⩾']), tuple (['leqq', '≦']), tuple (['geqq', '≧']), tuple (['lneqq', '≨']), tuple (['gneqq', '≩']), tuple (['ll', '≪']), tuple (['gg', '≫']), tuple (['nless', '≮']), tuple (['ngtr', '≯']), tuple (['nleq', '≰']), tuple (['ngeq', '≱']), tuple (['lesssim', '≲']), tuple (['gtrsim', '≳']), tuple (['lessgtr', '≶']), tuple (['gtrless', '≷']), tuple (['prec', '≺']), tuple (['succ', '≻']), tuple (['preceq', '≼']), tuple (['succeq', '≽']), tuple (['precsim', '≾']), tuple (['succsim', '≿']), tuple (['nprec', '⊀']), tuple (['nsucc', '⊁']), tuple (['subset', '⊂']), tuple (['supset', '⊃']), tuple (['subseteq', '⊆']), tuple (['supseteq', '⊇']), tuple (['nsubseteq', '⊈']), tuple (['nsupseteq', '⊉']), tuple (['subsetneq', '⊊']), tuple (['supsetneq', '⊋']), tuple (['cdot', '·']), tuple (['times', '×']), tuple (['otimes', '⊗']), tuple (['oplus', '⊕']), tuple (['bigotimes', '⊗']), tuple (['bigoplus', '⊕']), tuple (['prime', "'"]), tuple (['dag', '†']), tuple (['dagger', '†']), tuple (['pm', '±']), tuple (['mp', '∓']), tuple ([',', ' ']), tuple ([';', ' ']), tuple ([':', ' ']), tuple ([' ', ' ']), tuple (['\n', ' ']), tuple (['!', '']), tuple (['quad', '  ']), tuple (['qquad', '    ']), tuple (['ldots', '…']), tuple (['cdots', '⋯']), tuple (['ddots', '⋱']), tuple (['iddots', '⋰']), tuple (['vdots', '⋮']), tuple (['dots', '…']), tuple (['dotsc', '…']), tuple (['dotsb', '…']), tuple (['dotsm', '…']), tuple (['dotsi', '…']), tuple (['dotso', '…']), tuple (['langle', '⟨']), tuple (['rangle', '⟩']), tuple (['lvert', '|']), tuple (['rvert', '|']), tuple (['vert', '|']), tuple (['lVert', '‖']), tuple (['rVert', '‖']), tuple (['Vert', '‖']), tuple (['mid', '|']), tuple (['nmid', '∤']), tuple (['ket', '|%s⟩']), tuple (['bra', '⟨%s|']), tuple (['braket', '⟨%s|%s⟩']), tuple (['ketbra', '|%s⟩⟨%s|']), tuple (['uparrow', '↑']), tuple (['downarrow', '↓']), tuple (['rightarrow', '→']), tuple (['to', '→']), tuple (['leftarrow', '←']), tuple (['longrightarrow', '⟶']), tuple (['longleftarrow', '⟵'])]);
	for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
		var __left0__ = __getitem__ (__iterable0__, __index0__);
		var x = __left0__ [0];
		var y = __left0__ [1];
		(function () {
			var __accu1__ = __accu0__;
			return __call__ (__accu1__.append, __accu1__, __call__ (MacroTextSpec, null, x, __kwargtrans__ ({simplify_repl: y})));
		}) ();
	}
	return __accu0__;
}) ()), (function () {
	var __accu0__ = [];
	var __iterable0__ = _math_operator_names;
	for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
		var __left0__ = __getitem__ (__iterable0__, __index0__);
		var x = __left0__ [0];
		var y = __left0__ [1];
		(function () {
			var __accu1__ = __accu0__;
			return __call__ (__accu1__.append, __accu1__, __call__ (MacroTextSpec, null, x, __kwargtrans__ ({simplify_repl: __call__ (_math_operator_formatter, null, y)})));
		}) ();
	}
	return __accu0__;
}) ())});
export var advanced_symbols_macros = [__call__ (MacroTextSpec, null, 'textasciicircum', '^'), __call__ (MacroTextSpec, null, 'textasciitilde', '~'), __call__ (MacroTextSpec, null, 'textexclamdown', '¡'), __call__ (MacroTextSpec, null, 'textcent', '¢'), __call__ (MacroTextSpec, null, 'textsterling', '£'), __call__ (MacroTextSpec, null, 'textcurrency', '¤'), __call__ (MacroTextSpec, null, 'textyen', '¥'), __call__ (MacroTextSpec, null, 'textbrokenbar', '¦'), __call__ (MacroTextSpec, null, 'textsection', '§'), __call__ (MacroTextSpec, null, 'textasciidieresis', '¨'), __call__ (MacroTextSpec, null, 'textcopyright', '©'), __call__ (MacroTextSpec, null, 'textordfeminine', 'ª'), __call__ (MacroTextSpec, null, 'guillemotleft', '«'), __call__ (MacroTextSpec, null, 'textlnot', '¬'), __call__ (MacroTextSpec, null, '-', '\xad'), __call__ (MacroTextSpec, null, 'textregistered', '®'), __call__ (MacroTextSpec, null, 'textasciimacron', '¯'), __call__ (MacroTextSpec, null, 'textdegree', '°'), __call__ (MacroTextSpec, null, 'texttwosuperior', '²'), __call__ (MacroTextSpec, null, 'textthreesuperior', '³'), __call__ (MacroTextSpec, null, 'textasciiacute', '´'), __call__ (MacroTextSpec, null, 'textmu', 'µ'), __call__ (MacroTextSpec, null, 'textparagraph', '¶'), __call__ (MacroTextSpec, null, 'textperiodcentered', '·'), __call__ (MacroTextSpec, null, 'textonesuperior', '¹'), __call__ (MacroTextSpec, null, 'textordmasculine', 'º'), __call__ (MacroTextSpec, null, 'guillemotright', '»'), __call__ (MacroTextSpec, null, 'textonequarter', '¼'), __call__ (MacroTextSpec, null, 'textonehalf', '½'), __call__ (MacroTextSpec, null, 'textthreequarters', '¾'), __call__ (MacroTextSpec, null, 'textquestiondown', '¿'), __call__ (MacroTextSpec, null, 'DH', 'Ð'), __call__ (MacroTextSpec, null, 'texttimes', '×'), __call__ (MacroTextSpec, null, 'TH', 'Þ'), __call__ (MacroTextSpec, null, 'dh', 'ð'), __call__ (MacroTextSpec, null, 'textdiv', '÷'), __call__ (MacroTextSpec, null, 'th', 'þ'), __call__ (MacroTextSpec, null, 'DJ', 'Đ'), __call__ (MacroTextSpec, null, 'dj', 'đ'), __call__ (MacroTextSpec, null, 'IJ', 'Ĳ'), __call__ (MacroTextSpec, null, 'ij', 'ĳ'), __call__ (MacroTextSpec, null, 'NG', 'Ŋ'), __call__ (MacroTextSpec, null, 'ng', 'ŋ'), __call__ (MacroTextSpec, null, 'textflorin', 'ƒ'), __call__ (MacroTextSpec, null, 'texthvlig', 'ƕ'), __call__ (MacroTextSpec, null, 'textnrleg', 'ƞ'), __call__ (MacroTextSpec, null, 'textschwa', 'ə'), __call__ (MacroTextSpec, null, 'textphi', 'ɸ'), __call__ (MacroTextSpec, null, 'textglotstop', 'ʔ'), __call__ (MacroTextSpec, null, 'textturnk', 'ʞ'), __call__ (MacroTextSpec, null, 'textasciicircum', 'ˆ'), __call__ (MacroTextSpec, null, 'textasciicaron', 'ˇ'), __call__ (MacroTextSpec, null, 'textasciibreve', '˘'), __call__ (MacroTextSpec, null, 'textperiodcentered', '˙'), __call__ (MacroTextSpec, null, 'textasciitilde', '˜'), __call__ (MacroTextSpec, null, 'textacutedbl', '˝'), __call__ (MacroTextSpec, null, 'varkappa', 'ϰ'), __call__ (MacroTextSpec, null, 'backepsilon', '϶'), __call__ (MacroTextSpec, null, 'CYRYO', 'Ё'), __call__ (MacroTextSpec, null, 'CYRDJE', 'Ђ'), __call__ (MacroTextSpec, null, 'CYRIE', 'Є'), __call__ (MacroTextSpec, null, 'CYRDZE', 'Ѕ'), __call__ (MacroTextSpec, null, 'CYRII', 'І'), __call__ (MacroTextSpec, null, 'CYRYI', 'Ї'), __call__ (MacroTextSpec, null, 'CYRJE', 'Ј'), __call__ (MacroTextSpec, null, 'CYRLJE', 'Љ'), __call__ (MacroTextSpec, null, 'CYRNJE', 'Њ'), __call__ (MacroTextSpec, null, 'CYRTSHE', 'Ћ'), __call__ (MacroTextSpec, null, 'CYRUSHRT', 'Ў'), __call__ (MacroTextSpec, null, 'CYRDZHE', 'Џ'), __call__ (MacroTextSpec, null, 'CYRA', 'А'), __call__ (MacroTextSpec, null, 'CYRB', 'Б'), __call__ (MacroTextSpec, null, 'CYRV', 'В'), __call__ (MacroTextSpec, null, 'CYRG', 'Г'), __call__ (MacroTextSpec, null, 'CYRD', 'Д'), __call__ (MacroTextSpec, null, 'CYRE', 'Е'), __call__ (MacroTextSpec, null, 'CYRZH', 'Ж'), __call__ (MacroTextSpec, null, 'CYRZ', 'З'), __call__ (MacroTextSpec, null, 'CYRI', 'И'), __call__ (MacroTextSpec, null, 'CYRISHRT', 'Й'), __call__ (MacroTextSpec, null, 'CYRK', 'К'), __call__ (MacroTextSpec, null, 'CYRL', 'Л'), __call__ (MacroTextSpec, null, 'CYRM', 'М'), __call__ (MacroTextSpec, null, 'CYRN', 'Н'), __call__ (MacroTextSpec, null, 'CYRO', 'О'), __call__ (MacroTextSpec, null, 'CYRP', 'П'), __call__ (MacroTextSpec, null, 'CYRR', 'Р'), __call__ (MacroTextSpec, null, 'CYRS', 'С'), __call__ (MacroTextSpec, null, 'CYRT', 'Т'), __call__ (MacroTextSpec, null, 'CYRU', 'У'), __call__ (MacroTextSpec, null, 'CYRF', 'Ф'), __call__ (MacroTextSpec, null, 'CYRH', 'Х'), __call__ (MacroTextSpec, null, 'CYRC', 'Ц'), __call__ (MacroTextSpec, null, 'CYRCH', 'Ч'), __call__ (MacroTextSpec, null, 'CYRSH', 'Ш'), __call__ (MacroTextSpec, null, 'CYRSHCH', 'Щ'), __call__ (MacroTextSpec, null, 'CYRHRDSN', 'Ъ'), __call__ (MacroTextSpec, null, 'CYRERY', 'Ы'), __call__ (MacroTextSpec, null, 'CYRSFTSN', 'Ь'), __call__ (MacroTextSpec, null, 'CYREREV', 'Э'), __call__ (MacroTextSpec, null, 'CYRYU', 'Ю'), __call__ (MacroTextSpec, null, 'CYRYA', 'Я'), __call__ (MacroTextSpec, null, 'cyra', 'а'), __call__ (MacroTextSpec, null, 'cyrb', 'б'), __call__ (MacroTextSpec, null, 'cyrv', 'в'), __call__ (MacroTextSpec, null, 'cyrg', 'г'), __call__ (MacroTextSpec, null, 'cyrd', 'д'), __call__ (MacroTextSpec, null, 'cyre', 'е'), __call__ (MacroTextSpec, null, 'cyrzh', 'ж'), __call__ (MacroTextSpec, null, 'cyrz', 'з'), __call__ (MacroTextSpec, null, 'cyri', 'и'), __call__ (MacroTextSpec, null, 'cyrishrt', 'й'), __call__ (MacroTextSpec, null, 'cyrk', 'к'), __call__ (MacroTextSpec, null, 'cyrl', 'л'), __call__ (MacroTextSpec, null, 'cyrm', 'м'), __call__ (MacroTextSpec, null, 'cyrn', 'н'), __call__ (MacroTextSpec, null, 'cyro', 'о'), __call__ (MacroTextSpec, null, 'cyrp', 'п'), __call__ (MacroTextSpec, null, 'cyrr', 'р'), __call__ (MacroTextSpec, null, 'cyrs', 'с'), __call__ (MacroTextSpec, null, 'cyrt', 'т'), __call__ (MacroTextSpec, null, 'cyru', 'у'), __call__ (MacroTextSpec, null, 'cyrf', 'ф'), __call__ (MacroTextSpec, null, 'cyrh', 'х'), __call__ (MacroTextSpec, null, 'cyrc', 'ц'), __call__ (MacroTextSpec, null, 'cyrch', 'ч'), __call__ (MacroTextSpec, null, 'cyrsh', 'ш'), __call__ (MacroTextSpec, null, 'cyrshch', 'щ'), __call__ (MacroTextSpec, null, 'cyrhrdsn', 'ъ'), __call__ (MacroTextSpec, null, 'cyrery', 'ы'), __call__ (MacroTextSpec, null, 'cyrsftsn', 'ь'), __call__ (MacroTextSpec, null, 'cyrerev', 'э'), __call__ (MacroTextSpec, null, 'cyryu', 'ю'), __call__ (MacroTextSpec, null, 'cyrya', 'я'), __call__ (MacroTextSpec, null, 'cyryo', 'ё'), __call__ (MacroTextSpec, null, 'cyrdje', 'ђ'), __call__ (MacroTextSpec, null, 'cyrie', 'є'), __call__ (MacroTextSpec, null, 'cyrdze', 'ѕ'), __call__ (MacroTextSpec, null, 'cyrii', 'і'), __call__ (MacroTextSpec, null, 'cyryi', 'ї'), __call__ (MacroTextSpec, null, 'cyrje', 'ј'), __call__ (MacroTextSpec, null, 'cyrlje', 'љ'), __call__ (MacroTextSpec, null, 'cyrnje', 'њ'), __call__ (MacroTextSpec, null, 'cyrtshe', 'ћ'), __call__ (MacroTextSpec, null, 'cyrushrt', 'ў'), __call__ (MacroTextSpec, null, 'cyrdzhe', 'џ'), __call__ (MacroTextSpec, null, 'CYRYAT', 'Ѣ'), __call__ (MacroTextSpec, null, 'cyryat', 'ѣ'), __call__ (MacroTextSpec, null, 'CYRBYUS', 'Ѫ'), __call__ (MacroTextSpec, null, 'cyrbyus', 'ѫ'), __call__ (MacroTextSpec, null, 'CYRFITA', 'Ѳ'), __call__ (MacroTextSpec, null, 'cyrfita', 'ѳ'), __call__ (MacroTextSpec, null, 'CYRIZH', 'Ѵ'), __call__ (MacroTextSpec, null, 'cyrizh', 'ѵ'), __call__ (MacroTextSpec, null, 'CYRSEMISFTSN', 'Ҍ'), __call__ (MacroTextSpec, null, 'cyrsemisftsn', 'ҍ'), __call__ (MacroTextSpec, null, 'CYRRTICK', 'Ҏ'), __call__ (MacroTextSpec, null, 'cyrrtick', 'ҏ'), __call__ (MacroTextSpec, null, 'CYRGUP', 'Ґ'), __call__ (MacroTextSpec, null, 'cyrgup', 'ґ'), __call__ (MacroTextSpec, null, 'CYRGHCRS', 'Ғ'), __call__ (MacroTextSpec, null, 'cyrghcrs', 'ғ'), __call__ (MacroTextSpec, null, 'CYRGHK', 'Ҕ'), __call__ (MacroTextSpec, null, 'cyrghk', 'ҕ'), __call__ (MacroTextSpec, null, 'CYRZHDSC', 'Җ'), __call__ (MacroTextSpec, null, 'cyrzhdsc', 'җ'), __call__ (MacroTextSpec, null, 'CYRZDSC', 'Ҙ'), __call__ (MacroTextSpec, null, 'cyrzdsc', 'ҙ'), __call__ (MacroTextSpec, null, 'CYRKDSC', 'Қ'), __call__ (MacroTextSpec, null, 'cyrkdsc', 'қ'), __call__ (MacroTextSpec, null, 'CYRKVCRS', 'Ҝ'), __call__ (MacroTextSpec, null, 'cyrkvcrs', 'ҝ'), __call__ (MacroTextSpec, null, 'CYRKHCRS', 'Ҟ'), __call__ (MacroTextSpec, null, 'cyrkhcrs', 'ҟ'), __call__ (MacroTextSpec, null, 'CYRKBEAK', 'Ҡ'), __call__ (MacroTextSpec, null, 'cyrkbeak', 'ҡ'), __call__ (MacroTextSpec, null, 'CYRNDSC', 'Ң'), __call__ (MacroTextSpec, null, 'cyrndsc', 'ң'), __call__ (MacroTextSpec, null, 'CYRNG', 'Ҥ'), __call__ (MacroTextSpec, null, 'cyrng', 'ҥ'), __call__ (MacroTextSpec, null, 'CYRPHK', 'Ҧ'), __call__ (MacroTextSpec, null, 'cyrphk', 'ҧ'), __call__ (MacroTextSpec, null, 'CYRABHHA', 'Ҩ'), __call__ (MacroTextSpec, null, 'cyrabhha', 'ҩ'), __call__ (MacroTextSpec, null, 'CYRSDSC', 'Ҫ'), __call__ (MacroTextSpec, null, 'cyrsdsc', 'ҫ'), __call__ (MacroTextSpec, null, 'CYRTDSC', 'Ҭ'), __call__ (MacroTextSpec, null, 'cyrtdsc', 'ҭ'), __call__ (MacroTextSpec, null, 'CYRY', 'Ү'), __call__ (MacroTextSpec, null, 'cyry', 'ү'), __call__ (MacroTextSpec, null, 'CYRYHCRS', 'Ұ'), __call__ (MacroTextSpec, null, 'cyryhcrs', 'ұ'), __call__ (MacroTextSpec, null, 'CYRHDSC', 'Ҳ'), __call__ (MacroTextSpec, null, 'cyrhdsc', 'ҳ'), __call__ (MacroTextSpec, null, 'CYRTETSE', 'Ҵ'), __call__ (MacroTextSpec, null, 'cyrtetse', 'ҵ'), __call__ (MacroTextSpec, null, 'CYRCHRDSC', 'Ҷ'), __call__ (MacroTextSpec, null, 'cyrchrdsc', 'ҷ'), __call__ (MacroTextSpec, null, 'CYRCHVCRS', 'Ҹ'), __call__ (MacroTextSpec, null, 'cyrchvcrs', 'ҹ'), __call__ (MacroTextSpec, null, 'CYRSHHA', 'Һ'), __call__ (MacroTextSpec, null, 'cyrshha', 'һ'), __call__ (MacroTextSpec, null, 'CYRABHCH', 'Ҽ'), __call__ (MacroTextSpec, null, 'cyrabhch', 'ҽ'), __call__ (MacroTextSpec, null, 'CYRABHCHDSC', 'Ҿ'), __call__ (MacroTextSpec, null, 'cyrabhchdsc', 'ҿ'), __call__ (MacroTextSpec, null, 'CYRpalochka', 'Ӏ'), __call__ (MacroTextSpec, null, 'CYRKHK', 'Ӄ'), __call__ (MacroTextSpec, null, 'cyrkhk', 'ӄ'), __call__ (MacroTextSpec, null, 'CYRLDSC', 'Ӆ'), __call__ (MacroTextSpec, null, 'cyrldsc', 'ӆ'), __call__ (MacroTextSpec, null, 'CYRNHK', 'Ӈ'), __call__ (MacroTextSpec, null, 'cyrnhk', 'ӈ'), __call__ (MacroTextSpec, null, 'CYRCHLDSC', 'Ӌ'), __call__ (MacroTextSpec, null, 'cyrchldsc', 'ӌ'), __call__ (MacroTextSpec, null, 'CYRMDSC', 'Ӎ'), __call__ (MacroTextSpec, null, 'cyrmdsc', 'ӎ'), __call__ (MacroTextSpec, null, 'CYRAE', 'Ӕ'), __call__ (MacroTextSpec, null, 'cyrae', 'ӕ'), __call__ (MacroTextSpec, null, 'CYRSCHWA', 'Ә'), __call__ (MacroTextSpec, null, 'cyrschwa', 'ә'), __call__ (MacroTextSpec, null, 'CYRABHDZE', 'Ӡ'), __call__ (MacroTextSpec, null, 'cyrabhdze', 'ӡ'), __call__ (MacroTextSpec, null, 'CYROTLD', 'Ө'), __call__ (MacroTextSpec, null, 'cyrotld', 'ө'), __call__ (MacroTextSpec, null, 'CYRGDSC', 'Ӷ'), __call__ (MacroTextSpec, null, 'cyrgdsc', 'ӷ'), __call__ (MacroTextSpec, null, 'CYRGDSCHCRS', 'Ӻ'), __call__ (MacroTextSpec, null, 'cyrgdschcrs', 'ӻ'), __call__ (MacroTextSpec, null, 'CYRHHK', 'Ӽ'), __call__ (MacroTextSpec, null, 'cyrhhk', 'ӽ'), __call__ (MacroTextSpec, null, 'CYRHHCRS', 'Ӿ'), __call__ (MacroTextSpec, null, 'cyrhhcrs', 'ӿ'), __call__ (MacroTextSpec, null, 'textbaht', '฿'), __call__ (MacroTextSpec, null, 'enskip', '\u2000'), __call__ (MacroTextSpec, null, 'enskip', '\u2002'), __call__ (MacroTextSpec, null, 'textcompwordmark', '\u200c'), __call__ (MacroTextSpec, null, 'quotesinglbase', '‚'), __call__ (MacroTextSpec, null, 'quotedblbase', '„'), __call__ (MacroTextSpec, null, 'textdagger', '†'), __call__ (MacroTextSpec, null, 'textdaggerdbl', '‡'), __call__ (MacroTextSpec, null, 'textbullet', '•'), __call__ (MacroTextSpec, null, 'textellipsis', '…'), __call__ (MacroTextSpec, null, 'textperthousand', '‰'), __call__ (MacroTextSpec, null, 'textpertenthousand', '‱'), __call__ (MacroTextSpec, null, 'backprime', '‵'), __call__ (MacroTextSpec, null, 'guilsinglleft', '‹'), __call__ (MacroTextSpec, null, 'guilsinglright', '›'), __call__ (MacroTextSpec, null, 'textreferencemark', '※'), __call__ (MacroTextSpec, null, 'textinterrobang', '‽'), __call__ (MacroTextSpec, null, 'textfractionsolidus', '⁄'), __call__ (MacroTextSpec, null, 'textasteriskcentered', '⁎'), __call__ (MacroTextSpec, null, 'textdiscount', '⁒'), __call__ (MacroTextSpec, null, 'nolinebreak', '\u2060'), __call__ (MacroTextSpec, null, 'textcolonmonetary', '₡'), __call__ (MacroTextSpec, null, 'textlira', '₤'), __call__ (MacroTextSpec, null, 'textnaira', '₦'), __call__ (MacroTextSpec, null, 'textwon', '₩'), __call__ (MacroTextSpec, null, 'textdong', '₫'), __call__ (MacroTextSpec, null, 'textpeso', '₱'), __call__ (MacroTextSpec, null, 'textcelsius', '℃'), __call__ (MacroTextSpec, null, 'textnumero', '№'), __call__ (MacroTextSpec, null, 'textcircledP', '℗'), __call__ (MacroTextSpec, null, 'wp', '℘'), __call__ (MacroTextSpec, null, 'textrecipe', '℞'), __call__ (MacroTextSpec, null, 'textservicemark', '℠'), __call__ (MacroTextSpec, null, 'texttrademark', '™'), __call__ (MacroTextSpec, null, 'textohm', 'Ω'), __call__ (MacroTextSpec, null, 'textmho', '℧'), __call__ (MacroTextSpec, null, 'textestimated', '℮'), __call__ (MacroTextSpec, null, 'beth', 'ℶ'), __call__ (MacroTextSpec, null, 'gimel', 'ℷ'), __call__ (MacroTextSpec, null, 'daleth', 'ℸ'), __call__ (MacroTextSpec, null, 'textleftarrow', '←'), __call__ (MacroTextSpec, null, 'textuparrow', '↑'), __call__ (MacroTextSpec, null, 'textrightarrow', '→'), __call__ (MacroTextSpec, null, 'textdownarrow', '↓'), __call__ (MacroTextSpec, null, 'leftrightarrow', '↔'), __call__ (MacroTextSpec, null, 'updownarrow', '↕'), __call__ (MacroTextSpec, null, 'nwarrow', '↖'), __call__ (MacroTextSpec, null, 'nearrow', '↗'), __call__ (MacroTextSpec, null, 'searrow', '↘'), __call__ (MacroTextSpec, null, 'swarrow', '↙'), __call__ (MacroTextSpec, null, 'nleftarrow', '↚'), __call__ (MacroTextSpec, null, 'nrightarrow', '↛'), __call__ (MacroTextSpec, null, 'arrowwaveleft', '↜'), __call__ (MacroTextSpec, null, 'arrowwaveright', '↝'), __call__ (MacroTextSpec, null, 'twoheadleftarrow', '↞'), __call__ (MacroTextSpec, null, 'twoheadrightarrow', '↠'), __call__ (MacroTextSpec, null, 'leftarrowtail', '↢'), __call__ (MacroTextSpec, null, 'rightarrowtail', '↣'), __call__ (MacroTextSpec, null, 'mapsto', '↦'), __call__ (MacroTextSpec, null, 'hookleftarrow', '↩'), __call__ (MacroTextSpec, null, 'hookrightarrow', '↪'), __call__ (MacroTextSpec, null, 'looparrowleft', '↫'), __call__ (MacroTextSpec, null, 'looparrowright', '↬'), __call__ (MacroTextSpec, null, 'leftrightsquigarrow', '↭'), __call__ (MacroTextSpec, null, 'nleftrightarrow', '↮'), __call__ (MacroTextSpec, null, 'Lsh', '↰'), __call__ (MacroTextSpec, null, 'Rsh', '↱'), __call__ (MacroTextSpec, null, 'curvearrowleft', '↶'), __call__ (MacroTextSpec, null, 'curvearrowright', '↷'), __call__ (MacroTextSpec, null, 'circlearrowleft', '↺'), __call__ (MacroTextSpec, null, 'circlearrowright', '↻'), __call__ (MacroTextSpec, null, 'leftharpoonup', '↼'), __call__ (MacroTextSpec, null, 'leftharpoondown', '↽'), __call__ (MacroTextSpec, null, 'upharpoonright', '↾'), __call__ (MacroTextSpec, null, 'upharpoonleft', '↿'), __call__ (MacroTextSpec, null, 'rightharpoonup', '⇀'), __call__ (MacroTextSpec, null, 'rightharpoondown', '⇁'), __call__ (MacroTextSpec, null, 'downharpoonright', '⇂'), __call__ (MacroTextSpec, null, 'downharpoonleft', '⇃'), __call__ (MacroTextSpec, null, 'rightleftarrows', '⇄'), __call__ (MacroTextSpec, null, 'dblarrowupdown', '⇅'), __call__ (MacroTextSpec, null, 'leftrightarrows', '⇆'), __call__ (MacroTextSpec, null, 'leftleftarrows', '⇇'), __call__ (MacroTextSpec, null, 'upuparrows', '⇈'), __call__ (MacroTextSpec, null, 'rightrightarrows', '⇉'), __call__ (MacroTextSpec, null, 'downdownarrows', '⇊'), __call__ (MacroTextSpec, null, 'leftrightharpoons', '⇋'), __call__ (MacroTextSpec, null, 'rightleftharpoons', '⇌'), __call__ (MacroTextSpec, null, 'nLeftarrow', '⇍'), __call__ (MacroTextSpec, null, 'nLeftrightarrow', '⇎'), __call__ (MacroTextSpec, null, 'nRightarrow', '⇏'), __call__ (MacroTextSpec, null, 'Leftarrow', '⇐'), __call__ (MacroTextSpec, null, 'Uparrow', '⇑'), __call__ (MacroTextSpec, null, 'Rightarrow', '⇒'), __call__ (MacroTextSpec, null, 'Downarrow', '⇓'), __call__ (MacroTextSpec, null, 'Leftrightarrow', '⇔'), __call__ (MacroTextSpec, null, 'Updownarrow', '⇕'), __call__ (MacroTextSpec, null, 'Lleftarrow', '⇚'), __call__ (MacroTextSpec, null, 'Rrightarrow', '⇛'), __call__ (MacroTextSpec, null, 'rightsquigarrow', '⇝'), __call__ (MacroTextSpec, null, 'DownArrowUpArrow', '⇵'), __call__ (MacroTextSpec, null, 'blacksquare', '∎'), __call__ (MacroTextSpec, null, 'dotplus', '∔'), __call__ (MacroTextSpec, null, 'rightangle', '∟'), __call__ (MacroTextSpec, null, 'angle', '∠'), __call__ (MacroTextSpec, null, 'measuredangle', '∡'), __call__ (MacroTextSpec, null, 'sphericalangle', '∢'), __call__ (MacroTextSpec, null, 'surfintegral', '∯'), __call__ (MacroTextSpec, null, 'volintegral', '∰'), __call__ (MacroTextSpec, null, 'clwintegral', '∱'), __call__ (MacroTextSpec, null, 'therefore', '∴'), __call__ (MacroTextSpec, null, 'because', '∵'), __call__ (MacroTextSpec, null, 'homothetic', '∻'), __call__ (MacroTextSpec, null, 'lazysinv', '∾'), __call__ (MacroTextSpec, null, 'wr', '≀'), __call__ (MacroTextSpec, null, 'cong', '≅'), __call__ (MacroTextSpec, null, 'approxnotequal', '≆'), __call__ (MacroTextSpec, null, 'approxeq', '≊'), __call__ (MacroTextSpec, null, 'tildetrpl', '≋'), __call__ (MacroTextSpec, null, 'allequal', '≌'), __call__ (MacroTextSpec, null, 'asymp', '≍'), __call__ (MacroTextSpec, null, 'Bumpeq', '≎'), __call__ (MacroTextSpec, null, 'bumpeq', '≏'), __call__ (MacroTextSpec, null, 'doteq', '≐'), __call__ (MacroTextSpec, null, 'doteqdot', '≑'), __call__ (MacroTextSpec, null, 'fallingdotseq', '≒'), __call__ (MacroTextSpec, null, 'risingdotseq', '≓'), __call__ (MacroTextSpec, null, 'eqcirc', '≖'), __call__ (MacroTextSpec, null, 'circeq', '≗'), __call__ (MacroTextSpec, null, 'estimates', '≙'), __call__ (MacroTextSpec, null, 'starequal', '≛'), __call__ (MacroTextSpec, null, 'triangleq', '≜'), __call__ (MacroTextSpec, null, 'between', '≬'), __call__ (MacroTextSpec, null, 'notlessgreater', '≸'), __call__ (MacroTextSpec, null, 'notgreaterless', '≹'), __call__ (MacroTextSpec, null, 'uplus', '⊎'), __call__ (MacroTextSpec, null, 'sqsubset', '⊏'), __call__ (MacroTextSpec, null, 'sqsupset', '⊐'), __call__ (MacroTextSpec, null, 'sqsubseteq', '⊑'), __call__ (MacroTextSpec, null, 'sqsupseteq', '⊒'), __call__ (MacroTextSpec, null, 'sqcap', '⊓'), __call__ (MacroTextSpec, null, 'sqcup', '⊔'), __call__ (MacroTextSpec, null, 'ominus', '⊖'), __call__ (MacroTextSpec, null, 'oslash', '⊘'), __call__ (MacroTextSpec, null, 'odot', '⊙'), __call__ (MacroTextSpec, null, 'circledcirc', '⊚'), __call__ (MacroTextSpec, null, 'circledast', '⊛'), __call__ (MacroTextSpec, null, 'circleddash', '⊝'), __call__ (MacroTextSpec, null, 'boxplus', '⊞'), __call__ (MacroTextSpec, null, 'boxminus', '⊟'), __call__ (MacroTextSpec, null, 'boxtimes', '⊠'), __call__ (MacroTextSpec, null, 'boxdot', '⊡'), __call__ (MacroTextSpec, null, 'vdash', '⊢'), __call__ (MacroTextSpec, null, 'dashv', '⊣'), __call__ (MacroTextSpec, null, 'top', '⊤'), __call__ (MacroTextSpec, null, 'perp', '⊥'), __call__ (MacroTextSpec, null, 'truestate', '⊧'), __call__ (MacroTextSpec, null, 'forcesextra', '⊨'), __call__ (MacroTextSpec, null, 'Vdash', '⊩'), __call__ (MacroTextSpec, null, 'Vvdash', '⊪'), __call__ (MacroTextSpec, null, 'VDash', '⊫'), __call__ (MacroTextSpec, null, 'nvdash', '⊬'), __call__ (MacroTextSpec, null, 'nvDash', '⊭'), __call__ (MacroTextSpec, null, 'nVdash', '⊮'), __call__ (MacroTextSpec, null, 'nVDash', '⊯'), __call__ (MacroTextSpec, null, 'vartriangleleft', '⊲'), __call__ (MacroTextSpec, null, 'vartriangleright', '⊳'), __call__ (MacroTextSpec, null, 'trianglelefteq', '⊴'), __call__ (MacroTextSpec, null, 'trianglerighteq', '⊵'), __call__ (MacroTextSpec, null, 'original', '⊶'), __call__ (MacroTextSpec, null, 'image', '⊷'), __call__ (MacroTextSpec, null, 'multimap', '⊸'), __call__ (MacroTextSpec, null, 'hermitconjmatrix', '⊹'), __call__ (MacroTextSpec, null, 'intercal', '⊺'), __call__ (MacroTextSpec, null, 'veebar', '⊻'), __call__ (MacroTextSpec, null, 'rightanglearc', '⊾'), __call__ (MacroTextSpec, null, 'bigwedge', '⋀'), __call__ (MacroTextSpec, null, 'bigvee', '⋁'), __call__ (MacroTextSpec, null, 'bigcap', '⋂'), __call__ (MacroTextSpec, null, 'bigcup', '⋃'), __call__ (MacroTextSpec, null, 'diamond', '⋄'), __call__ (MacroTextSpec, null, 'star', '⋆'), __call__ (MacroTextSpec, null, 'divideontimes', '⋇'), __call__ (MacroTextSpec, null, 'bowtie', '⋈'), __call__ (MacroTextSpec, null, 'ltimes', '⋉'), __call__ (MacroTextSpec, null, 'rtimes', '⋊'), __call__ (MacroTextSpec, null, 'leftthreetimes', '⋋'), __call__ (MacroTextSpec, null, 'rightthreetimes', '⋌'), __call__ (MacroTextSpec, null, 'backsimeq', '⋍'), __call__ (MacroTextSpec, null, 'curlyvee', '⋎'), __call__ (MacroTextSpec, null, 'curlywedge', '⋏'), __call__ (MacroTextSpec, null, 'Subset', '⋐'), __call__ (MacroTextSpec, null, 'Supset', '⋑'), __call__ (MacroTextSpec, null, 'Cap', '⋒'), __call__ (MacroTextSpec, null, 'Cup', '⋓'), __call__ (MacroTextSpec, null, 'pitchfork', '⋔'), __call__ (MacroTextSpec, null, 'lessdot', '⋖'), __call__ (MacroTextSpec, null, 'gtrdot', '⋗'), __call__ (MacroTextSpec, null, 'verymuchless', '⋘'), __call__ (MacroTextSpec, null, 'verymuchgreater', '⋙'), __call__ (MacroTextSpec, null, 'lesseqgtr', '⋚'), __call__ (MacroTextSpec, null, 'gtreqless', '⋛'), __call__ (MacroTextSpec, null, 'curlyeqprec', '⋞'), __call__ (MacroTextSpec, null, 'curlyeqsucc', '⋟'), __call__ (MacroTextSpec, null, 'lnsim', '⋦'), __call__ (MacroTextSpec, null, 'gnsim', '⋧'), __call__ (MacroTextSpec, null, 'precedesnotsimilar', '⋨'), __call__ (MacroTextSpec, null, 'succnsim', '⋩'), __call__ (MacroTextSpec, null, 'ntriangleleft', '⋪'), __call__ (MacroTextSpec, null, 'ntriangleright', '⋫'), __call__ (MacroTextSpec, null, 'ntrianglelefteq', '⋬'), __call__ (MacroTextSpec, null, 'ntrianglerighteq', '⋭'), __call__ (MacroTextSpec, null, 'vdots', '⋮'), __call__ (MacroTextSpec, null, 'udots', '⋰'), __call__ (MacroTextSpec, null, 'barwedge', '⌅'), __call__ (MacroTextSpec, null, 'varperspcorrespond', '⌆'), __call__ (MacroTextSpec, null, 'lceil', '⌈'), __call__ (MacroTextSpec, null, 'rceil', '⌉'), __call__ (MacroTextSpec, null, 'lfloor', '⌊'), __call__ (MacroTextSpec, null, 'rfloor', '⌋'), __call__ (MacroTextSpec, null, 'recorder', '⌕'), __call__ (MacroTextSpec, null, 'ulcorner', '⌜'), __call__ (MacroTextSpec, null, 'urcorner', '⌝'), __call__ (MacroTextSpec, null, 'llcorner', '⌞'), __call__ (MacroTextSpec, null, 'lrcorner', '⌟'), __call__ (MacroTextSpec, null, 'frown', '⌢'), __call__ (MacroTextSpec, null, 'smile', '⌣'), __call__ (MacroTextSpec, null, 'lmoustache', '⎰'), __call__ (MacroTextSpec, null, 'rmoustache', '⎱'), __call__ (MacroTextSpec, null, 'textlangle', '〈'), __call__ (MacroTextSpec, null, 'textrangle', '〉'), __call__ (MacroTextSpec, null, 'textblank', '␢'), __call__ (MacroTextSpec, null, 'textvisiblespace', '␣'), __call__ (MacroTextSpec, null, 'blacksquare', '■'), __call__ (MacroTextSpec, null, 'square', '□'), __call__ (MacroTextSpec, null, 'bigtriangleup', '△'), __call__ (MacroTextSpec, null, 'blacktriangle', '▴'), __call__ (MacroTextSpec, null, 'vartriangle', '▵'), __call__ (MacroTextSpec, null, 'blacktriangleright', '▸'), __call__ (MacroTextSpec, null, 'triangleright', '▹'), __call__ (MacroTextSpec, null, 'bigtriangledown', '▽'), __call__ (MacroTextSpec, null, 'blacktriangledown', '▾'), __call__ (MacroTextSpec, null, 'triangledown', '▿'), __call__ (MacroTextSpec, null, 'blacktriangleleft', '◂'), __call__ (MacroTextSpec, null, 'triangleleft', '◃'), __call__ (MacroTextSpec, null, 'lozenge', '◊'), __call__ (MacroTextSpec, null, 'bigcirc', '○'), __call__ (MacroTextSpec, null, 'textopenbullet', '◦'), __call__ (MacroTextSpec, null, 'textbigcircle', '◯'), __call__ (MacroTextSpec, null, 'diamond', '♢'), __call__ (MacroTextSpec, null, 'textmusicalnote', '♪'), __call__ (MacroTextSpec, null, 'quarternote', '♩'), __call__ (MacroTextSpec, null, 'flat', '♭'), __call__ (MacroTextSpec, null, 'natural', '♮'), __call__ (MacroTextSpec, null, 'sharp', '♯'), __call__ (MacroTextSpec, null, 'longleftrightarrow', '⟷'), __call__ (MacroTextSpec, null, 'Longleftarrow', '⟸'), __call__ (MacroTextSpec, null, 'Longrightarrow', '⟹'), __call__ (MacroTextSpec, null, 'Longleftrightarrow', '⟺'), __call__ (MacroTextSpec, null, 'longmapsto', '⟼'), __call__ (MacroTextSpec, null, 'blacklozenge', '⧫'), __call__ (MacroTextSpec, null, 'clockoint', '⨏'), __call__ (MacroTextSpec, null, 'sqrint', '⨖'), __call__ (MacroTextSpec, null, 'amalg', '⨿'), __call__ (MacroTextSpec, null, 'lessapprox', '⪅'), __call__ (MacroTextSpec, null, 'gtrapprox', '⪆'), __call__ (MacroTextSpec, null, 'lneq', '⪇'), __call__ (MacroTextSpec, null, 'gneq', '⪈'), __call__ (MacroTextSpec, null, 'lnapprox', '⪉'), __call__ (MacroTextSpec, null, 'gnapprox', '⪊'), __call__ (MacroTextSpec, null, 'lesseqqgtr', '⪋'), __call__ (MacroTextSpec, null, 'gtreqqless', '⪌'), __call__ (MacroTextSpec, null, 'eqslantless', '⪕'), __call__ (MacroTextSpec, null, 'eqslantgtr', '⪖'), __call__ (MacroTextSpec, null, 'precneqq', '⪵'), __call__ (MacroTextSpec, null, 'succneqq', '⪶'), __call__ (MacroTextSpec, null, 'precapprox', '⪷'), __call__ (MacroTextSpec, null, 'succapprox', '⪸'), __call__ (MacroTextSpec, null, 'precnapprox', '⪹'), __call__ (MacroTextSpec, null, 'succnapprox', '⪺'), __call__ (MacroTextSpec, null, 'subseteqq', '⫅'), __call__ (MacroTextSpec, null, 'supseteqq', '⫆'), __call__ (MacroTextSpec, null, 'subsetneqq', '⫋'), __call__ (MacroTextSpec, null, 'supsetneqq', '⫌'), __call__ (MacroTextSpec, null, 'textdollar', '$'), __call__ (MacroTextSpec, null, 'textquotesingle', "'"), __call__ (MacroTextSpec, null, 'textasciigrave', '`'), __call__ (MacroTextSpec, null, 'lbrace', '{'), __call__ (MacroTextSpec, null, 'rbrace', '}'), __call__ (MacroTextSpec, null, 'textasciitilde', '~'), __call__ (MacroTextSpec, null, 'textexclamdown', '¡'), __call__ (MacroTextSpec, null, 'textcent', '¢'), __call__ (MacroTextSpec, null, 'textsterling', '£'), __call__ (MacroTextSpec, null, 'textcurrency', '¤'), __call__ (MacroTextSpec, null, 'textyen', '¥'), __call__ (MacroTextSpec, null, 'textbrokenbar', '¦'), __call__ (MacroTextSpec, null, 'textsection', '§'), __call__ (MacroTextSpec, null, 'textasciidieresis', '¨'), __call__ (MacroTextSpec, null, 'textcopyright', '©'), __call__ (MacroTextSpec, null, 'textordfeminine', 'ª'), __call__ (MacroTextSpec, null, 'guillemotleft', '«'), __call__ (MacroTextSpec, null, 'lnot', '¬'), __call__ (MacroTextSpec, null, '-', '\xad'), __call__ (MacroTextSpec, null, 'textregistered', '®'), __call__ (MacroTextSpec, null, 'textasciimacron', '¯'), __call__ (MacroTextSpec, null, 'textdegree', '°'), __call__ (MacroTextSpec, null, 'textasciiacute', '´'), __call__ (MacroTextSpec, null, 'textparagraph', '¶'), __call__ (MacroTextSpec, null, 'textordmasculine', 'º'), __call__ (MacroTextSpec, null, 'guillemotright', '»'), __call__ (MacroTextSpec, null, 'textonequarter', '¼'), __call__ (MacroTextSpec, null, 'textonehalf', '½'), __call__ (MacroTextSpec, null, 'textthreequarters', '¾'), __call__ (MacroTextSpec, null, 'textquestiondown', '¿'), __call__ (MacroTextSpec, null, 'DH', 'Ð'), __call__ (MacroTextSpec, null, 'texttimes', '×'), __call__ (MacroTextSpec, null, 'TH', 'Þ'), __call__ (MacroTextSpec, null, 'dh', 'ð'), __call__ (MacroTextSpec, null, 'div', '÷'), __call__ (MacroTextSpec, null, 'th', 'þ'), __call__ (MacroTextSpec, null, 'DJ', 'Đ'), __call__ (MacroTextSpec, null, 'dj', 'đ'), __call__ (MacroTextSpec, null, 'NG', 'Ŋ'), __call__ (MacroTextSpec, null, 'ng', 'ŋ'), __call__ (MacroTextSpec, null, 'texthvlig', 'ƕ'), __call__ (MacroTextSpec, null, 'textnrleg', 'ƞ'), __call__ (MacroTextSpec, null, 'eth', 'ƪ'), __call__ (MacroTextSpec, null, 'textdoublepipe', 'ǂ'), __call__ (MacroTextSpec, null, 'textphi', 'ɸ'), __call__ (MacroTextSpec, null, 'textturnk', 'ʞ'), __call__ (MacroTextSpec, null, 'textasciicaron', 'ˇ'), __call__ (MacroTextSpec, null, 'textasciibreve', '˘'), __call__ (MacroTextSpec, null, 'textperiodcentered', '˙'), __call__ (MacroTextSpec, null, 'texttildelow', '˜'), __call__ (MacroTextSpec, null, 'texttheta', 'θ'), __call__ (MacroTextSpec, null, 'textvartheta', 'ϑ'), __call__ (MacroTextSpec, null, 'Stigma', 'Ϛ'), __call__ (MacroTextSpec, null, 'Digamma', 'Ϝ'), __call__ (MacroTextSpec, null, 'digamma', 'ϝ'), __call__ (MacroTextSpec, null, 'Koppa', 'Ϟ'), __call__ (MacroTextSpec, null, 'Sampi', 'Ϡ'), __call__ (MacroTextSpec, null, 'varkappa', 'ϰ'), __call__ (MacroTextSpec, null, 'textTheta', 'ϴ'), __call__ (MacroTextSpec, null, 'backepsilon', '϶'), __call__ (MacroTextSpec, null, 'textdagger', '†'), __call__ (MacroTextSpec, null, 'textdaggerdbl', '‡'), __call__ (MacroTextSpec, null, 'textbullet', '•'), __call__ (MacroTextSpec, null, 'textperthousand', '‰'), __call__ (MacroTextSpec, null, 'textpertenthousand', '‱'), __call__ (MacroTextSpec, null, 'backprime', '‵'), __call__ (MacroTextSpec, null, 'guilsinglleft', '‹'), __call__ (MacroTextSpec, null, 'guilsinglright', '›'), __call__ (MacroTextSpec, null, 'nolinebreak', '\u2060'), __call__ (MacroTextSpec, null, 'dddot', '⃛'), __call__ (MacroTextSpec, null, 'ddddot', '⃜'), __call__ (MacroTextSpec, null, 'hslash', 'ℏ'), __call__ (MacroTextSpec, null, 'wp', '℘'), __call__ (MacroTextSpec, null, 'texttrademark', '™'), __call__ (MacroTextSpec, null, 'mho', '℧'), __call__ (MacroTextSpec, null, 'beth', 'ℶ'), __call__ (MacroTextSpec, null, 'gimel', 'ℷ'), __call__ (MacroTextSpec, null, 'daleth', 'ℸ'), __call__ (MacroTextSpec, null, 'leftrightarrow', '↔'), __call__ (MacroTextSpec, null, 'updownarrow', '↕'), __call__ (MacroTextSpec, null, 'nwarrow', '↖'), __call__ (MacroTextSpec, null, 'nearrow', '↗'), __call__ (MacroTextSpec, null, 'searrow', '↘'), __call__ (MacroTextSpec, null, 'swarrow', '↙'), __call__ (MacroTextSpec, null, 'nleftarrow', '↚'), __call__ (MacroTextSpec, null, 'nrightarrow', '↛'), __call__ (MacroTextSpec, null, 'arrowwaveleft', '↜'), __call__ (MacroTextSpec, null, 'arrowwaveright', '↝'), __call__ (MacroTextSpec, null, 'twoheadleftarrow', '↞'), __call__ (MacroTextSpec, null, 'twoheadrightarrow', '↠'), __call__ (MacroTextSpec, null, 'leftarrowtail', '↢'), __call__ (MacroTextSpec, null, 'rightarrowtail', '↣'), __call__ (MacroTextSpec, null, 'mapsto', '↦'), __call__ (MacroTextSpec, null, 'hookleftarrow', '↩'), __call__ (MacroTextSpec, null, 'hookrightarrow', '↪'), __call__ (MacroTextSpec, null, 'looparrowleft', '↫'), __call__ (MacroTextSpec, null, 'looparrowright', '↬'), __call__ (MacroTextSpec, null, 'leftrightsquigarrow', '↭'), __call__ (MacroTextSpec, null, 'nleftrightarrow', '↮'), __call__ (MacroTextSpec, null, 'Lsh', '↰'), __call__ (MacroTextSpec, null, 'Rsh', '↱'), __call__ (MacroTextSpec, null, 'curvearrowleft', '↶'), __call__ (MacroTextSpec, null, 'curvearrowright', '↷'), __call__ (MacroTextSpec, null, 'circlearrowleft', '↺'), __call__ (MacroTextSpec, null, 'circlearrowright', '↻'), __call__ (MacroTextSpec, null, 'leftharpoonup', '↼'), __call__ (MacroTextSpec, null, 'leftharpoondown', '↽'), __call__ (MacroTextSpec, null, 'upharpoonright', '↾'), __call__ (MacroTextSpec, null, 'upharpoonleft', '↿'), __call__ (MacroTextSpec, null, 'rightharpoonup', '⇀'), __call__ (MacroTextSpec, null, 'rightharpoondown', '⇁'), __call__ (MacroTextSpec, null, 'downharpoonright', '⇂'), __call__ (MacroTextSpec, null, 'downharpoonleft', '⇃'), __call__ (MacroTextSpec, null, 'rightleftarrows', '⇄'), __call__ (MacroTextSpec, null, 'dblarrowupdown', '⇅'), __call__ (MacroTextSpec, null, 'leftrightarrows', '⇆'), __call__ (MacroTextSpec, null, 'leftleftarrows', '⇇'), __call__ (MacroTextSpec, null, 'upuparrows', '⇈'), __call__ (MacroTextSpec, null, 'rightrightarrows', '⇉'), __call__ (MacroTextSpec, null, 'downdownarrows', '⇊'), __call__ (MacroTextSpec, null, 'leftrightharpoons', '⇋'), __call__ (MacroTextSpec, null, 'rightleftharpoons', '⇌'), __call__ (MacroTextSpec, null, 'nLeftarrow', '⇍'), __call__ (MacroTextSpec, null, 'nLeftrightarrow', '⇎'), __call__ (MacroTextSpec, null, 'nRightarrow', '⇏'), __call__ (MacroTextSpec, null, 'Leftarrow', '⇐'), __call__ (MacroTextSpec, null, 'Uparrow', '⇑'), __call__ (MacroTextSpec, null, 'Rightarrow', '⇒'), __call__ (MacroTextSpec, null, 'Downarrow', '⇓'), __call__ (MacroTextSpec, null, 'Leftrightarrow', '⇔'), __call__ (MacroTextSpec, null, 'Updownarrow', '⇕'), __call__ (MacroTextSpec, null, 'Lleftarrow', '⇚'), __call__ (MacroTextSpec, null, 'Rrightarrow', '⇛'), __call__ (MacroTextSpec, null, 'rightsquigarrow', '⇝'), __call__ (MacroTextSpec, null, 'DownArrowUpArrow', '⇵'), __call__ (MacroTextSpec, null, 'dotplus', '∔'), __call__ (MacroTextSpec, null, 'surd', '√'), __call__ (MacroTextSpec, null, 'rightangle', '∟'), __call__ (MacroTextSpec, null, 'angle', '∠'), __call__ (MacroTextSpec, null, 'measuredangle', '∡'), __call__ (MacroTextSpec, null, 'sphericalangle', '∢'), __call__ (MacroTextSpec, null, 'surfintegral', '∯'), __call__ (MacroTextSpec, null, 'volintegral', '∰'), __call__ (MacroTextSpec, null, 'clwintegral', '∱'), __call__ (MacroTextSpec, null, 'therefore', '∴'), __call__ (MacroTextSpec, null, 'because', '∵'), __call__ (MacroTextSpec, null, 'Colon', '∷'), __call__ (MacroTextSpec, null, 'homothetic', '∻'), __call__ (MacroTextSpec, null, 'lazysinv', '∾'), __call__ (MacroTextSpec, null, 'wr', '≀'), __call__ (MacroTextSpec, null, 'cong', '≅'), __call__ (MacroTextSpec, null, 'approxnotequal', '≆'), __call__ (MacroTextSpec, null, 'approxeq', '≊'), __call__ (MacroTextSpec, null, 'tildetrpl', '≋'), __call__ (MacroTextSpec, null, 'allequal', '≌'), __call__ (MacroTextSpec, null, 'asymp', '≍'), __call__ (MacroTextSpec, null, 'Bumpeq', '≎'), __call__ (MacroTextSpec, null, 'bumpeq', '≏'), __call__ (MacroTextSpec, null, 'doteq', '≐'), __call__ (MacroTextSpec, null, 'doteqdot', '≑'), __call__ (MacroTextSpec, null, 'fallingdotseq', '≒'), __call__ (MacroTextSpec, null, 'risingdotseq', '≓'), __call__ (MacroTextSpec, null, 'eqcirc', '≖'), __call__ (MacroTextSpec, null, 'circeq', '≗'), __call__ (MacroTextSpec, null, 'estimates', '≙'), __call__ (MacroTextSpec, null, 'starequal', '≛'), __call__ (MacroTextSpec, null, 'triangleq', '≜'), __call__ (MacroTextSpec, null, 'between', '≬'), __call__ (MacroTextSpec, null, 'lessequivlnt', '≲'), __call__ (MacroTextSpec, null, 'greaterequivlnt', '≳'), __call__ (MacroTextSpec, null, 'notlessgreater', '≸'), __call__ (MacroTextSpec, null, 'notgreaterless', '≹'), __call__ (MacroTextSpec, null, 'preccurlyeq', '≼'), __call__ (MacroTextSpec, null, 'succcurlyeq', '≽'), __call__ (MacroTextSpec, null, 'precapprox', '≾'), __call__ (MacroTextSpec, null, 'succapprox', '≿'), __call__ (MacroTextSpec, null, 'uplus', '⊎'), __call__ (MacroTextSpec, null, 'sqsubset', '⊏'), __call__ (MacroTextSpec, null, 'sqsupset', '⊐'), __call__ (MacroTextSpec, null, 'sqsubseteq', '⊑'), __call__ (MacroTextSpec, null, 'sqsupseteq', '⊒'), __call__ (MacroTextSpec, null, 'sqcap', '⊓'), __call__ (MacroTextSpec, null, 'sqcup', '⊔'), __call__ (MacroTextSpec, null, 'ominus', '⊖'), __call__ (MacroTextSpec, null, 'oslash', '⊘'), __call__ (MacroTextSpec, null, 'odot', '⊙'), __call__ (MacroTextSpec, null, 'circledcirc', '⊚'), __call__ (MacroTextSpec, null, 'circledast', '⊛'), __call__ (MacroTextSpec, null, 'circleddash', '⊝'), __call__ (MacroTextSpec, null, 'boxplus', '⊞'), __call__ (MacroTextSpec, null, 'boxminus', '⊟'), __call__ (MacroTextSpec, null, 'boxtimes', '⊠'), __call__ (MacroTextSpec, null, 'boxdot', '⊡'), __call__ (MacroTextSpec, null, 'vdash', '⊢'), __call__ (MacroTextSpec, null, 'dashv', '⊣'), __call__ (MacroTextSpec, null, 'top', '⊤'), __call__ (MacroTextSpec, null, 'perp', '⊥'), __call__ (MacroTextSpec, null, 'truestate', '⊧'), __call__ (MacroTextSpec, null, 'forcesextra', '⊨'), __call__ (MacroTextSpec, null, 'Vdash', '⊩'), __call__ (MacroTextSpec, null, 'Vvdash', '⊪'), __call__ (MacroTextSpec, null, 'VDash', '⊫'), __call__ (MacroTextSpec, null, 'nvdash', '⊬'), __call__ (MacroTextSpec, null, 'nvDash', '⊭'), __call__ (MacroTextSpec, null, 'nVdash', '⊮'), __call__ (MacroTextSpec, null, 'nVDash', '⊯'), __call__ (MacroTextSpec, null, 'vartriangleleft', '⊲'), __call__ (MacroTextSpec, null, 'vartriangleright', '⊳'), __call__ (MacroTextSpec, null, 'trianglelefteq', '⊴'), __call__ (MacroTextSpec, null, 'trianglerighteq', '⊵'), __call__ (MacroTextSpec, null, 'original', '⊶'), __call__ (MacroTextSpec, null, 'image', '⊷'), __call__ (MacroTextSpec, null, 'multimap', '⊸'), __call__ (MacroTextSpec, null, 'hermitconjmatrix', '⊹'), __call__ (MacroTextSpec, null, 'intercal', '⊺'), __call__ (MacroTextSpec, null, 'veebar', '⊻'), __call__ (MacroTextSpec, null, 'rightanglearc', '⊾'), __call__ (MacroTextSpec, null, 'bigcap', '⋂'), __call__ (MacroTextSpec, null, 'bigcup', '⋃'), __call__ (MacroTextSpec, null, 'diamond', '⋄'), __call__ (MacroTextSpec, null, 'star', '⋆'), __call__ (MacroTextSpec, null, 'divideontimes', '⋇'), __call__ (MacroTextSpec, null, 'bowtie', '⋈'), __call__ (MacroTextSpec, null, 'ltimes', '⋉'), __call__ (MacroTextSpec, null, 'rtimes', '⋊'), __call__ (MacroTextSpec, null, 'leftthreetimes', '⋋'), __call__ (MacroTextSpec, null, 'rightthreetimes', '⋌'), __call__ (MacroTextSpec, null, 'backsimeq', '⋍'), __call__ (MacroTextSpec, null, 'curlyvee', '⋎'), __call__ (MacroTextSpec, null, 'curlywedge', '⋏'), __call__ (MacroTextSpec, null, 'Subset', '⋐'), __call__ (MacroTextSpec, null, 'Supset', '⋑'), __call__ (MacroTextSpec, null, 'Cap', '⋒'), __call__ (MacroTextSpec, null, 'Cup', '⋓'), __call__ (MacroTextSpec, null, 'pitchfork', '⋔'), __call__ (MacroTextSpec, null, 'lessdot', '⋖'), __call__ (MacroTextSpec, null, 'gtrdot', '⋗'), __call__ (MacroTextSpec, null, 'verymuchless', '⋘'), __call__ (MacroTextSpec, null, 'verymuchgreater', '⋙'), __call__ (MacroTextSpec, null, 'lesseqgtr', '⋚'), __call__ (MacroTextSpec, null, 'gtreqless', '⋛'), __call__ (MacroTextSpec, null, 'curlyeqprec', '⋞'), __call__ (MacroTextSpec, null, 'curlyeqsucc', '⋟'), __call__ (MacroTextSpec, null, 'lnsim', '⋦'), __call__ (MacroTextSpec, null, 'gnsim', '⋧'), __call__ (MacroTextSpec, null, 'precedesnotsimilar', '⋨'), __call__ (MacroTextSpec, null, 'succnsim', '⋩'), __call__ (MacroTextSpec, null, 'ntriangleleft', '⋪'), __call__ (MacroTextSpec, null, 'ntriangleright', '⋫'), __call__ (MacroTextSpec, null, 'ntrianglelefteq', '⋬'), __call__ (MacroTextSpec, null, 'ntrianglerighteq', '⋭'), __call__ (MacroTextSpec, null, 'vdots', '⋮'), __call__ (MacroTextSpec, null, 'upslopeellipsis', '⋰'), __call__ (MacroTextSpec, null, 'downslopeellipsis', '⋱'), __call__ (MacroTextSpec, null, 'barwedge', '⌅'), __call__ (MacroTextSpec, null, 'varperspcorrespond', '⌆'), __call__ (MacroTextSpec, null, 'lceil', '⌈'), __call__ (MacroTextSpec, null, 'rceil', '⌉'), __call__ (MacroTextSpec, null, 'lfloor', '⌊'), __call__ (MacroTextSpec, null, 'rfloor', '⌋'), __call__ (MacroTextSpec, null, 'recorder', '⌕'), __call__ (MacroTextSpec, null, 'ulcorner', '⌜'), __call__ (MacroTextSpec, null, 'urcorner', '⌝'), __call__ (MacroTextSpec, null, 'llcorner', '⌞'), __call__ (MacroTextSpec, null, 'lrcorner', '⌟'), __call__ (MacroTextSpec, null, 'frown', '⌢'), __call__ (MacroTextSpec, null, 'smile', '⌣'), __call__ (MacroTextSpec, null, 'lmoustache', '⎰'), __call__ (MacroTextSpec, null, 'rmoustache', '⎱'), __call__ (MacroTextSpec, null, 'textvisiblespace', '␣'), __call__ (MacroTextSpec, null, 'circledS', 'Ⓢ'), __call__ (MacroTextSpec, null, 'diagup', '╱'), __call__ (MacroTextSpec, null, 'square', '□'), __call__ (MacroTextSpec, null, 'blacksquare', '▪'), __call__ (MacroTextSpec, null, 'bigtriangleup', '△'), __call__ (MacroTextSpec, null, 'blacktriangle', '▴'), __call__ (MacroTextSpec, null, 'vartriangle', '▵'), __call__ (MacroTextSpec, null, 'blacktriangleright', '▸'), __call__ (MacroTextSpec, null, 'triangleright', '▹'), __call__ (MacroTextSpec, null, 'bigtriangledown', '▽'), __call__ (MacroTextSpec, null, 'blacktriangledown', '▾'), __call__ (MacroTextSpec, null, 'triangledown', '▿'), __call__ (MacroTextSpec, null, 'blacktriangleleft', '◂'), __call__ (MacroTextSpec, null, 'triangleleft', '◃'), __call__ (MacroTextSpec, null, 'lozenge', '◊'), __call__ (MacroTextSpec, null, 'bigcirc', '○'), __call__ (MacroTextSpec, null, 'bigcirc', '◯'), __call__ (MacroTextSpec, null, 'rightmoon', '☾'), __call__ (MacroTextSpec, null, 'mercury', '☿'), __call__ (MacroTextSpec, null, 'venus', '♀'), __call__ (MacroTextSpec, null, 'male', '♂'), __call__ (MacroTextSpec, null, 'jupiter', '♃'), __call__ (MacroTextSpec, null, 'saturn', '♄'), __call__ (MacroTextSpec, null, 'uranus', '♅'), __call__ (MacroTextSpec, null, 'neptune', '♆'), __call__ (MacroTextSpec, null, 'pluto', '♇'), __call__ (MacroTextSpec, null, 'aries', '♈'), __call__ (MacroTextSpec, null, 'taurus', '♉'), __call__ (MacroTextSpec, null, 'gemini', '♊'), __call__ (MacroTextSpec, null, 'cancer', '♋'), __call__ (MacroTextSpec, null, 'leo', '♌'), __call__ (MacroTextSpec, null, 'virgo', '♍'), __call__ (MacroTextSpec, null, 'libra', '♎'), __call__ (MacroTextSpec, null, 'scorpio', '♏'), __call__ (MacroTextSpec, null, 'sagittarius', '♐'), __call__ (MacroTextSpec, null, 'capricornus', '♑'), __call__ (MacroTextSpec, null, 'aquarius', '♒'), __call__ (MacroTextSpec, null, 'pisces', '♓'), __call__ (MacroTextSpec, null, 'diamond', '♢'), __call__ (MacroTextSpec, null, 'quarternote', '♩'), __call__ (MacroTextSpec, null, 'eighthnote', '♪'), __call__ (MacroTextSpec, null, 'flat', '♭'), __call__ (MacroTextSpec, null, 'natural', '♮'), __call__ (MacroTextSpec, null, 'sharp', '♯'), __call__ (MacroTextSpec, null, 'longleftrightarrow', '⟷'), __call__ (MacroTextSpec, null, 'Longleftarrow', '⟸'), __call__ (MacroTextSpec, null, 'Longrightarrow', '⟹'), __call__ (MacroTextSpec, null, 'Longleftrightarrow', '⟺'), __call__ (MacroTextSpec, null, 'longmapsto', '⟼'), __call__ (MacroTextSpec, null, 'UpArrowBar', '⤒'), __call__ (MacroTextSpec, null, 'DownArrowBar', '⤓'), __call__ (MacroTextSpec, null, 'LeftRightVector', '⥎'), __call__ (MacroTextSpec, null, 'RightUpDownVector', '⥏'), __call__ (MacroTextSpec, null, 'DownLeftRightVector', '⥐'), __call__ (MacroTextSpec, null, 'LeftUpDownVector', '⥑'), __call__ (MacroTextSpec, null, 'LeftVectorBar', '⥒'), __call__ (MacroTextSpec, null, 'RightVectorBar', '⥓'), __call__ (MacroTextSpec, null, 'RightUpVectorBar', '⥔'), __call__ (MacroTextSpec, null, 'RightDownVectorBar', '⥕'), __call__ (MacroTextSpec, null, 'DownLeftVectorBar', '⥖'), __call__ (MacroTextSpec, null, 'DownRightVectorBar', '⥗'), __call__ (MacroTextSpec, null, 'LeftUpVectorBar', '⥘'), __call__ (MacroTextSpec, null, 'LeftDownVectorBar', '⥙'), __call__ (MacroTextSpec, null, 'LeftTeeVector', '⥚'), __call__ (MacroTextSpec, null, 'RightTeeVector', '⥛'), __call__ (MacroTextSpec, null, 'RightUpTeeVector', '⥜'), __call__ (MacroTextSpec, null, 'RightDownTeeVector', '⥝'), __call__ (MacroTextSpec, null, 'DownLeftTeeVector', '⥞'), __call__ (MacroTextSpec, null, 'DownRightTeeVector', '⥟'), __call__ (MacroTextSpec, null, 'LeftUpTeeVector', '⥠'), __call__ (MacroTextSpec, null, 'LeftDownTeeVector', '⥡'), __call__ (MacroTextSpec, null, 'UpEquilibrium', '⥮'), __call__ (MacroTextSpec, null, 'ReverseUpEquilibrium', '⥯'), __call__ (MacroTextSpec, null, 'RoundImplies', '⥰'), __call__ (MacroTextSpec, null, 'Angle', '⦜'), __call__ (MacroTextSpec, null, 'LeftTriangleBar', '⧏'), __call__ (MacroTextSpec, null, 'RightTriangleBar', '⧐'), __call__ (MacroTextSpec, null, 'blacklozenge', '⧫'), __call__ (MacroTextSpec, null, 'RuleDelayed', '⧴'), __call__ (MacroTextSpec, null, 'clockoint', '⨏'), __call__ (MacroTextSpec, null, 'sqrint', '⨖'), __call__ (MacroTextSpec, null, 'amalg', '⨿'), __call__ (MacroTextSpec, null, 'perspcorrespond', '⩞'), __call__ (MacroTextSpec, null, 'Equal', '⩵'), __call__ (MacroTextSpec, null, 'lessapprox', '⪅'), __call__ (MacroTextSpec, null, 'gtrapprox', '⪆'), __call__ (MacroTextSpec, null, 'lneq', '⪇'), __call__ (MacroTextSpec, null, 'gneq', '⪈'), __call__ (MacroTextSpec, null, 'lnapprox', '⪉'), __call__ (MacroTextSpec, null, 'gnapprox', '⪊'), __call__ (MacroTextSpec, null, 'lesseqqgtr', '⪋'), __call__ (MacroTextSpec, null, 'gtreqqless', '⪌'), __call__ (MacroTextSpec, null, 'eqslantless', '⪕'), __call__ (MacroTextSpec, null, 'eqslantgtr', '⪖'), __call__ (MacroTextSpec, null, 'NestedLessLess', '⪡'), __call__ (MacroTextSpec, null, 'NestedGreaterGreater', '⪢'), __call__ (MacroTextSpec, null, 'precneqq', '⪵'), __call__ (MacroTextSpec, null, 'succneqq', '⪶'), __call__ (MacroTextSpec, null, 'precapprox', '⪷'), __call__ (MacroTextSpec, null, 'succapprox', '⪸'), __call__ (MacroTextSpec, null, 'precnapprox', '⪹'), __call__ (MacroTextSpec, null, 'succnapprox', '⪺'), __call__ (MacroTextSpec, null, 'subseteqq', '⫅'), __call__ (MacroTextSpec, null, 'supseteqq', '⫆'), __call__ (MacroTextSpec, null, 'subsetneqq', '⫋'), __call__ (MacroTextSpec, null, 'supsetneqq', '⫌'), __call__ (MacroTextSpec, null, 'openbracketleft', '〚'), __call__ (MacroTextSpec, null, 'openbracketright', '〛')];
export var specs = [tuple (['latex-base', _latex_specs_base]), tuple (['latex-base-subsuperscripts', _latex_specs_subsuperscripts]), tuple (['latex-approximations', _latex_specs_approximations]), tuple (['latex-placeholders', _latex_specs_placeholders]), tuple (['nonascii-specials', dict ({'macros': [], 'environments': [], 'specials': [__call__ (SpecialsTextSpec, null, '~', '\xa0'), __call__ (SpecialsTextSpec, null, '``', '“'), __call__ (SpecialsTextSpec, null, "''", '”'), __call__ (SpecialsTextSpec, null, '--', '–'), __call__ (SpecialsTextSpec, null, '---', '—'), __call__ (SpecialsTextSpec, null, '!`', '¡'), __call__ (SpecialsTextSpec, null, '?`', '¿')]})]), tuple (['advanced-symbols', dict ({'macros': advanced_symbols_macros, 'environments': [], 'specials': []})]), tuple (['latex-ethuebung', dict ({'macros': [__call__ (MacroTextSpec, null, 'exercise', __kwargtrans__ ({simplify_repl: _format_uebung})), __call__ (MacroTextSpec, null, 'uebung', __kwargtrans__ ({simplify_repl: _format_uebung})), __call__ (MacroTextSpec, null, 'hint', 'Hint: %s'), __call__ (MacroTextSpec, null, 'hints', 'Hints: %s'), __call__ (MacroTextSpec, null, 'hinweis', 'Hinweis: %s'), __call__ (MacroTextSpec, null, 'hinweise', 'Hinweise: %s')], 'environments': [], 'specials': []})]), tuple (['nonstandard-qit', dict ({'environments': [], 'specials': [], 'macros': [__call__ (MacroTextSpec, null, 'id', '𝕀'), __call__ (MacroTextSpec, null, 'Ident', '𝕀')]})])];
export var _greek_letters = tuple ([tuple (['alpha', 'α', 'Α']), tuple (['beta', 'β', 'Β']), tuple (['gamma', 'γ', 'Γ']), tuple (['delta', 'δ', 'Δ']), tuple (['epsilon', 'ϵ', 'Ε']), tuple (['zeta', 'ζ', 'Ζ']), tuple (['eta', 'η', 'Η']), tuple (['theta', 'θ', 'Θ']), tuple (['iota', 'ι', 'Ι']), tuple (['kappa', 'κ', 'Κ']), tuple (['lambda', 'λ', 'Λ']), tuple (['mu', 'μ', 'Μ']), tuple (['nu', 'ν', 'Ν']), tuple (['xi', 'ξ', 'Ξ']), tuple (['omicron', 'ο', 'Ο']), tuple (['pi', 'π', 'Π']), tuple (['rho', 'ρ', 'Ρ']), tuple (['sigma', 'σ', 'Σ']), tuple (['tau', 'τ', 'Τ']), tuple (['upsilon', 'υ', 'Υ']), tuple (['phi', 'ϕ', 'Φ']), tuple (['chi', 'χ', 'Χ']), tuple (['psi', 'ψ', 'Ψ']), tuple (['omega', 'ω', 'Ω'])]);
export var _add_greekletters = function (letterlist) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'letterlist': var letterlist = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var __iterable0__ = letterlist;
	for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
		var letterinfo = __getitem__ (__iterable0__, __index0__);
		var __left0__ = letterinfo;
		var l = __left0__ [0];
		var small = __left0__ [1];
		var capital = __left0__ [2];
		(function () {
			var __accu0__ = __getitem__ (_latex_specs_base, 'macros');
			return __call__ (__accu0__.append, __accu0__, __call__ (MacroTextSpec, null, l, small));
		}) ();
		(function () {
			var __accu0__ = __getitem__ (_latex_specs_base, 'macros');
			return __call__ (__accu0__.append, __accu0__, __call__ (MacroTextSpec, null, __add__ ((function () {
				var __accu1__ = __getitem__ (l, 0);
				return __call__ (__accu1__.upper, __accu1__);
			}) (), __getslice__ (l, 1, null, 1)), capital));
		}) ();
		(function () {
			var __accu0__ = __getitem__ (_latex_specs_base, 'macros');
			return __call__ (__accu0__.append, __accu0__, __call__ (MacroTextSpec, null, __add__ ('up', l), small));
		}) ();
		(function () {
			var __accu0__ = __getitem__ (_latex_specs_base, 'macros');
			return __call__ (__accu0__.append, __accu0__, __call__ (MacroTextSpec, null, __add__ ('Up', l), capital));
		}) ();
	}
};
__call__ (_add_greekletters, null, _greek_letters);
__setitem__ (_latex_specs_base, 'macros', __call__ (__iadd__, null, __getitem__ (_latex_specs_base, 'macros'), [__call__ (MacroTextSpec, null, 'varepsilon', 'ε'), __call__ (MacroTextSpec, null, 'vartheta', 'ϑ'), __call__ (MacroTextSpec, null, 'varpi', 'ϖ'), __call__ (MacroTextSpec, null, 'varrho', 'ϱ'), __call__ (MacroTextSpec, null, 'varsigma', 'ς'), __call__ (MacroTextSpec, null, 'varphi', 'φ'), __call__ (MacroTextSpec, null, 'upvarepsilon', 'ε'), __call__ (MacroTextSpec, null, 'upvartheta', 'ϑ'), __call__ (MacroTextSpec, null, 'upvarpi', 'ϖ'), __call__ (MacroTextSpec, null, 'upvarrho', 'ϱ'), __call__ (MacroTextSpec, null, 'upvarsigma', 'ς'), __call__ (MacroTextSpec, null, 'upvarphi', 'φ')]));
export var unicode_accents_list = tuple ([tuple (["'", '́']), tuple (['`', '̀']), tuple (['"', '̈']), tuple (['c', '̧']), tuple (['^', '̂']), tuple (['~', '̃']), tuple (['H', '̋']), tuple (['k', '̨']), tuple (['=', '̄']), tuple (['b', '̱']), tuple (['.', '̇']), tuple (['d', '̣']), tuple (['r', '̊']), tuple (['u', '̆']), tuple (['v', '̌']), tuple (['vec', '⃗']), tuple (['dot', '̇']), tuple (['hat', '̂']), tuple (['check', '̌']), tuple (['breve', '̆']), tuple (['acute', '́']), tuple (['grave', '̀']), tuple (['tilde', '̃']), tuple (['bar', '̅']), tuple (['ddot', '̈']), tuple (['not', '̸'])]);
export var make_accented_char = function (node, combining, l2tobj) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'node': var node = __allkwargs0__ [__attrib0__]; break;
					case 'combining': var combining = __allkwargs0__ [__attrib0__]; break;
					case 'l2tobj': var l2tobj = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	if (__t__ (__t__ (node.nodeargd !== null) && node.nodeargd.argnlist)) {
		var nodearg = __getitem__ (node.nodeargd.argnlist, 0);
		var c = (function () {
			var __accu0__ = __call__ (str, null, (function () {
				var __accu1__ = l2tobj;
				return __call__ (__accu1__.nodelist_to_text, __accu1__, [nodearg]);
			}) ());
			return __call__ (__accu0__.strip, __accu0__);
		}) ();
	}
	else {
		var c = ' ';
	}
	var getaccented = function (ch, combining) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'ch': var ch = __allkwargs0__ [__attrib0__]; break;
						case 'combining': var combining = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var ch = __call__ (str, null, ch);
		var combining = __call__ (str, null, combining);
		if (__t__ (__eq__ (ch, 'ı'))) {
			var ch = 'i';
		}
		if (__t__ (__eq__ (ch, 'ȷ'))) {
			var ch = 'j';
		}
		return __call__ (_compose_accented_char, null, __add__ (__call__ (str, null, ch), combining));
	};
	return (function () {
		var __accu0__ = '';
		return __call__ (__accu0__.join, __accu0__, (function () {
			var __accu1__ = [];
			var __iterable0__ = __call__ (_split_chars, null, c);
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var ch = __getitem__ (__iterable0__, __index0__);
				(function () {
					var __accu2__ = __accu1__;
					return __call__ (__accu2__.append, __accu2__, __call__ (getaccented, null, ch, combining));
				}) ();
			}
			return __accu1__;
		}) ());
	}) ();
};
export var _accent_formatter = function (combining) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'combining': var combining = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var formatter = function (x, l2tobj) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'x': var x = __allkwargs0__ [__attrib0__]; break;
						case 'l2tobj': var l2tobj = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return __call__ (make_accented_char, null, x, combining, l2tobj);
	};
	return formatter;
};
var __iterable0__ = unicode_accents_list;
for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
	var u = __getitem__ (__iterable0__, __index0__);
	var __left0__ = u;
	var mname = __left0__ [0];
	var mcombining = __left0__ [1];
	(function () {
		var __accu0__ = __getitem__ (_latex_specs_base, 'macros');
		return __call__ (__accu0__.append, __accu0__, __call__ (MacroTextSpec, null, mname, __call__ (_accent_formatter, null, mcombining)));
	}) ();
}

