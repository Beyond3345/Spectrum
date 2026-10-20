import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import {EnvironmentSpec, LatexSpecialsCallParser, MacroSpec, SpecialsSpec} from './pylatexenc.macrospec.js';
import {std_environment, std_macro, std_specials} from './pylatexenc.macrospec._spechelpers.js';
import {LatexCharsGroupParser, LatexDelimitedVerbatimParser, LatexExpressionParser, LatexStandardArgumentParser, LatexVerbatimEnvironmentContentsParser} from './pylatexenc.latexnodes.parsers.js';
import {LatexCharsNode} from './pylatexenc.latexnodes.nodes.js';
import {LatexArgumentSpec, ParsingStateDeltaEnterMathMode, ParsingStateDeltaLeaveMathMode} from './pylatexenc.latexnodes.js';
export {LatexArgumentSpec, LatexCharsNode, std_specials, LatexSpecialsCallParser, LatexExpressionParser, LatexVerbatimEnvironmentContentsParser, LatexCharsGroupParser, EnvironmentSpec, SpecialsSpec, MacroSpec, ParsingStateDeltaLeaveMathMode, LatexStandardArgumentParser, LatexDelimitedVerbatimParser, std_environment, ParsingStateDeltaEnterMathMode, std_macro};
var __name__ = 'pylatexenc.latexwalker._defaultspecs';
export var _SubSuperscriptSpec =  __class__ ('_SubSuperscriptSpec', [SpecialsSpec], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, specials_chars, argname) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'specials_chars': var specials_chars = __allkwargs0__ [__attrib0__]; break;
						case 'argname': var argname = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, _SubSuperscriptSpec, '__init__'), null, self, specials_chars, __kwargtrans__ ({arguments_spec_list: [__call__ (LatexArgumentSpec, null, __call__ (LatexExpressionParser, null, __kwargtrans__ ({parse_callable_arguments: true, return_full_node_list: false})), __kwargtrans__ ({argname: argname}))]}));
		self.text_mode_spec = __call__ (SpecialsSpec, null, specials_chars);
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
		if (__t__ (parsing_state.in_math_mode)) {
			return __call__ (__call__ (__super__, null, _SubSuperscriptSpec, 'get_node_parser'), null, self, token, parsing_state);
		}
		return __call__ (LatexSpecialsCallParser, null, token, self.text_mode_spec);
	});}
});
export var _arg_mathmode = function (parser) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'parser': var parser = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	return __call__ (LatexArgumentSpec, null, parser, __kwargtrans__ ({parsing_state_delta: __call__ (ParsingStateDeltaEnterMathMode, null)}));
};
export var _arg_textmode = function (parser) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'parser': var parser = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	return __call__ (LatexArgumentSpec, null, parser, __kwargtrans__ ({parsing_state_delta: __call__ (ParsingStateDeltaLeaveMathMode, null)}));
};
export var _arg_charsname = function (argname) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'argname': var argname = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	return __call__ (LatexArgumentSpec, null, __call__ (LatexCharsGroupParser, null), __kwargtrans__ ({argname: argname}));
};
export var _make_verbatim_environment_body_parser = function (token, nodeargd, arg_parsing_state_delta) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'token': var token = __allkwargs0__ [__attrib0__]; break;
					case 'nodeargd': var nodeargd = __allkwargs0__ [__attrib0__]; break;
					case 'arg_parsing_state_delta': var arg_parsing_state_delta = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	return __call__ (LatexVerbatimEnvironmentContentsParser, null, __kwargtrans__ ({environment_name: token.arg}));
};
export var _verbatim_chars_of = function (nodelist) {
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
		return null;
	}
	var chars = '';
	var __iterable0__ = nodelist;
	for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
		var n = __getitem__ (__iterable0__, __index0__);
		if (__t__ (__t__ (n !== null) && (function () {
			var __accu0__ = n;
			return __call__ (__accu0__.isNodeType, __accu0__, LatexCharsNode);
		}) ())) {
			var chars = __call__ (__iadd__, null, chars, n.chars);
		}
	}
	return chars;
};
export var _finalize_verb_macro_node = function (node) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'node': var node = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var __left0__ = tuple ([null, null]);
	var verbatim_text = __left0__ [0];
	var verbatim_delimiters = __left0__ [1];
	var argnlist = node.nodeargd.argnlist;
	if (__t__ (__t__ (argnlist) && __getitem__ (argnlist, 0) !== null)) {
		var verbatim_group_node = __getitem__ (argnlist, 0);
		var verbatim_text = __call__ (_verbatim_chars_of, null, verbatim_group_node.nodelist);
		var verbatim_delimiters = verbatim_group_node.delimiters;
	}
	node.nodeargd.verbatim_text = verbatim_text;
	node.nodeargd.verbatim_delimiters = verbatim_delimiters;
	return node;
};
export var _finalize_verbatim_environment_node = function (node) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'node': var node = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	node.nodeargd.verbatim_text = __call__ (_verbatim_chars_of, null, node.nodelist);
	node.nodeargd.verbatim_delimiters = null;
	return node;
};
export var _finalize_lstlisting_environment_node = function (node) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'node': var node = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var node = __call__ (_finalize_verbatim_environment_node, null, node);
	node.nodeargd.lstlisting_text = node.nodeargd.verbatim_text;
	return node;
};
export var specs = [tuple (['latex-paragraph', dict ({'macros': [], 'environments': [], 'specials': [__call__ (std_specials, null, '\n\n')]})]), tuple (['latex-base', dict ({'macros': [__call__ (MacroSpec, null, 'documentclass', __kwargtrans__ ({arguments_spec_list: ['[', __call__ (_arg_charsname, null, 'classname')]})), __call__ (MacroSpec, null, 'usepackage', __kwargtrans__ ({arguments_spec_list: ['[', __call__ (_arg_charsname, null, 'packagename')]})), __call__ (MacroSpec, null, 'RequirePackage', __kwargtrans__ ({arguments_spec_list: ['[', __call__ (_arg_charsname, null, 'packagename')]})), __call__ (std_macro, null, 'selectlanguage', true, 1), __call__ (std_macro, null, 'setlength', true, 2), __call__ (std_macro, null, 'addlength', true, 2), __call__ (std_macro, null, 'setcounter', true, 2), __call__ (std_macro, null, 'addcounter', true, 2), __call__ (std_macro, null, 'newcommand', '*{[[{'), __call__ (std_macro, null, 'renewcommand', '*{[[{'), __call__ (std_macro, null, 'providecommand', '*{[[{'), __call__ (std_macro, null, 'newenvironment', '*{[[{{'), __call__ (std_macro, null, 'renewenvironment', '*{[[{{'), __call__ (std_macro, null, 'provideenvironment', '*{[[{{'), __call__ (std_macro, null, 'DeclareMathOperator', '*{{'), __call__ (std_macro, null, 'operatorname', '*{'), __call__ (std_macro, null, 'hspace', '*{'), __call__ (std_macro, null, 'vspace', '*{'), __call__ (MacroSpec, null, 'mbox', __kwargtrans__ ({arguments_spec_list: [__call__ (_arg_textmode, null, '{')]})), __call__ (MacroSpec, null, 'title', '[{'), __call__ (MacroSpec, null, 'author', '[{'), __call__ (MacroSpec, null, 'date', '[{'), __call__ (MacroSpec, null, '\\', __kwargtrans__ ({arguments_spec_list: [__call__ (LatexArgumentSpec, null, '*'), __call__ (LatexArgumentSpec, null, __call__ (LatexStandardArgumentParser, null, '[', __kwargtrans__ ({allow_pre_space: false})))]})), __call__ (std_macro, null, 'item', true, 0), __call__ (MacroSpec, null, 'input', __kwargtrans__ ({arguments_spec_list: [__call__ (_arg_charsname, null, 'filename')]})), __call__ (MacroSpec, null, 'include', __kwargtrans__ ({arguments_spec_list: [__call__ (_arg_charsname, null, 'filename')]})), __call__ (MacroSpec, null, 'includegraphics', __kwargtrans__ ({arguments_spec_list: ['[', __call__ (_arg_charsname, null, 'filename')]})), __call__ (std_macro, null, 'part', '*[{'), __call__ (std_macro, null, 'chapter', '*[{'), __call__ (std_macro, null, 'section', '*[{'), __call__ (std_macro, null, 'subsection', '*[{'), __call__ (std_macro, null, 'subsubsection', '*[{'), __call__ (std_macro, null, 'paragraph', '*[{'), __call__ (std_macro, null, 'subparagraph', '*[{'), __call__ (MacroSpec, null, 'bibliography', __kwargtrans__ ({arguments_spec_list: [__call__ (_arg_charsname, null, 'filename')]})), __call__ (MacroSpec, null, 'bibitem', __kwargtrans__ ({arguments_spec_list: ['[', __call__ (_arg_charsname, null, 'citekey')]})), __call__ (std_macro, null, 'emph', false, 1), __call__ (MacroSpec, null, 'textrm', __kwargtrans__ ({arguments_spec_list: [__call__ (_arg_textmode, null, '{')]})), __call__ (MacroSpec, null, 'textit', __kwargtrans__ ({arguments_spec_list: [__call__ (_arg_textmode, null, '{')]})), __call__ (MacroSpec, null, 'textbf', __kwargtrans__ ({arguments_spec_list: [__call__ (_arg_textmode, null, '{')]})), __call__ (MacroSpec, null, 'textmd', __kwargtrans__ ({arguments_spec_list: [__call__ (_arg_textmode, null, '{')]})), __call__ (MacroSpec, null, 'textsc', __kwargtrans__ ({arguments_spec_list: [__call__ (_arg_textmode, null, '{')]})), __call__ (MacroSpec, null, 'textsf', __kwargtrans__ ({arguments_spec_list: [__call__ (_arg_textmode, null, '{')]})), __call__ (MacroSpec, null, 'textsl', __kwargtrans__ ({arguments_spec_list: [__call__ (_arg_textmode, null, '{')]})), __call__ (MacroSpec, null, 'texttt', __kwargtrans__ ({arguments_spec_list: [__call__ (_arg_textmode, null, '{')]})), __call__ (MacroSpec, null, 'textup', __kwargtrans__ ({arguments_spec_list: [__call__ (_arg_textmode, null, '{')]})), __call__ (MacroSpec, null, 'text', __kwargtrans__ ({arguments_spec_list: [__call__ (_arg_textmode, null, '{')]})), __call__ (std_macro, null, 'mathrm', false, 1), __call__ (std_macro, null, 'mathbb', false, 1), __call__ (std_macro, null, 'mathbf', false, 1), __call__ (std_macro, null, 'mathit', false, 1), __call__ (std_macro, null, 'mathsf', false, 1), __call__ (std_macro, null, 'mathtt', false, 1), __call__ (std_macro, null, 'mathcal', false, 1), __call__ (std_macro, null, 'mathscr', false, 1), __call__ (std_macro, null, 'mathfrak', false, 1), __call__ (MacroSpec, null, 'label', __kwargtrans__ ({arguments_spec_list: [__call__ (_arg_charsname, null, 'label')]})), __call__ (MacroSpec, null, 'ref', __kwargtrans__ ({arguments_spec_list: [__call__ (_arg_charsname, null, 'label')]})), __call__ (MacroSpec, null, 'autoref', __kwargtrans__ ({arguments_spec_list: [__call__ (_arg_charsname, null, 'label')]})), __call__ (MacroSpec, null, 'cref', __kwargtrans__ ({arguments_spec_list: [__call__ (_arg_charsname, null, 'label')]})), __call__ (MacroSpec, null, 'Cref', __kwargtrans__ ({arguments_spec_list: [__call__ (_arg_charsname, null, 'label')]})), __call__ (MacroSpec, null, 'eqref', __kwargtrans__ ({arguments_spec_list: [__call__ (_arg_charsname, null, 'label')]})), __call__ (MacroSpec, null, 'href', __kwargtrans__ ({arguments_spec_list: [__call__ (LatexArgumentSpec, null, __call__ (LatexDelimitedVerbatimParser, null, __kwargtrans__ ({delimiters: tuple (['{', '}'])})), __kwargtrans__ ({argname: 'url'})), '{']})), __call__ (MacroSpec, null, 'url', __kwargtrans__ ({arguments_spec_list: [__call__ (LatexArgumentSpec, null, __call__ (LatexDelimitedVerbatimParser, null, __kwargtrans__ ({delimiters: tuple (['{', '}'])})), __kwargtrans__ ({argname: 'url'}))]})), __call__ (std_macro, null, 'hypersetup', false, 1), __call__ (std_macro, null, 'footnote', true, 1), __call__ (std_macro, null, 'keywords', false, 1), __call__ (std_macro, null, 'hphantom', true, 1), __call__ (std_macro, null, 'vphantom', true, 1), __call__ (std_macro, null, "'", false, 1), __call__ (std_macro, null, '`', false, 1), __call__ (std_macro, null, '"', false, 1), __call__ (std_macro, null, 'c', false, 1), __call__ (std_macro, null, '^', false, 1), __call__ (std_macro, null, '~', false, 1), __call__ (std_macro, null, 'H', false, 1), __call__ (std_macro, null, 'k', false, 1), __call__ (std_macro, null, '=', false, 1), __call__ (std_macro, null, 'b', false, 1), __call__ (std_macro, null, '.', false, 1), __call__ (std_macro, null, 'd', false, 1), __call__ (std_macro, null, 'r', false, 1), __call__ (std_macro, null, 'u', false, 1), __call__ (std_macro, null, 'v', false, 1), __call__ (MacroSpec, null, 'ensuremath', __kwargtrans__ ({arguments_spec_list: [__call__ (_arg_mathmode, null, '{')]})), __call__ (std_macro, null, 'not', false, 1), __call__ (std_macro, null, 'vec', false, 1), __call__ (std_macro, null, 'dot', false, 1), __call__ (std_macro, null, 'hat', false, 1), __call__ (std_macro, null, 'check', false, 1), __call__ (std_macro, null, 'breve', false, 1), __call__ (std_macro, null, 'acute', false, 1), __call__ (std_macro, null, 'grave', false, 1), __call__ (std_macro, null, 'tilde', false, 1), __call__ (std_macro, null, 'bar', false, 1), __call__ (std_macro, null, 'ddot', false, 1), __call__ (std_macro, null, 'frac', false, 2), __call__ (std_macro, null, 'nicefrac', false, 2), __call__ (std_macro, null, 'textfrac', false, 2), __call__ (std_macro, null, 'sqrt', true, 1), __call__ (MacroSpec, null, 'pmod', '{'), __call__ (MacroSpec, null, 'mod', '{'), __call__ (MacroSpec, null, 'overline', '{'), __call__ (MacroSpec, null, 'underline', '{'), __call__ (MacroSpec, null, 'widehat', '{'), __call__ (MacroSpec, null, 'widetilde', '{'), __call__ (MacroSpec, null, 'wideparen', '{'), __call__ (MacroSpec, null, 'overleftarrow', '{'), __call__ (MacroSpec, null, 'overrightarrow', '{'), __call__ (MacroSpec, null, 'overleftrightarrow', '{'), __call__ (MacroSpec, null, 'underleftarrow', '{'), __call__ (MacroSpec, null, 'underrightarrow', '{'), __call__ (MacroSpec, null, 'underleftrightarrow', '{'), __call__ (MacroSpec, null, 'overbrace', '{'), __call__ (MacroSpec, null, 'underbrace', '{'), __call__ (MacroSpec, null, 'overgroup', '{'), __call__ (MacroSpec, null, 'undergroup', '{'), __call__ (MacroSpec, null, 'overbracket', '{'), __call__ (MacroSpec, null, 'underbracket', '{'), __call__ (MacroSpec, null, 'overlinesegment', '{'), __call__ (MacroSpec, null, 'underlinesegment', '{'), __call__ (MacroSpec, null, 'overleftharpoon', '{'), __call__ (MacroSpec, null, 'overrightharpoon', '{'), __call__ (MacroSpec, null, 'xleftarrow', '[{'), __call__ (MacroSpec, null, 'xrightarrow', '[{'), __call__ (std_macro, null, 'ket', false, 1), __call__ (std_macro, null, 'bra', false, 1), __call__ (std_macro, null, 'braket', false, 2), __call__ (std_macro, null, 'ketbra', false, 2), __call__ (std_macro, null, 'texorpdfstring', false, 2), __call__ (MacroSpec, null, 'definecolor', '[{{{'), __call__ (MacroSpec, null, 'providecolor', '[{{{'), __call__ (MacroSpec, null, 'colorlet', '[{[{'), __call__ (MacroSpec, null, 'color', '[{'), __call__ (MacroSpec, null, 'textcolor', '[{{'), __call__ (MacroSpec, null, 'pagecolor', '[{'), __call__ (MacroSpec, null, 'nopagecolor', ''), __call__ (MacroSpec, null, 'colorbox', '[{{'), __call__ (MacroSpec, null, 'fcolorbox', '[{[{{'), __call__ (MacroSpec, null, 'boxframe', '{{{'), __call__ (MacroSpec, null, 'rowcolors', '*[{{{')], 'environments': [__call__ (std_environment, null, 'figure', '['), __call__ (std_environment, null, 'figure*', '['), __call__ (std_environment, null, 'table', '['), __call__ (std_environment, null, 'table*', '['), __call__ (std_environment, null, 'abstract', null), __call__ (std_environment, null, 'tabular', '{'), __call__ (std_environment, null, 'tabular*', '{{'), __call__ (std_environment, null, 'tabularx', '{[{'), __call__ (std_environment, null, 'array', '[{'), __call__ (std_environment, null, 'equation', null, __kwargtrans__ ({is_math_mode: true})), __call__ (std_environment, null, 'equation*', null, __kwargtrans__ ({is_math_mode: true})), __call__ (std_environment, null, 'eqnarray', null, __kwargtrans__ ({is_math_mode: true})), __call__ (std_environment, null, 'eqnarray*', null, __kwargtrans__ ({is_math_mode: true})), __call__ (std_environment, null, 'align', null, __kwargtrans__ ({is_math_mode: true})), __call__ (std_environment, null, 'align*', null, __kwargtrans__ ({is_math_mode: true})), __call__ (std_environment, null, 'gather', null, __kwargtrans__ ({is_math_mode: true})), __call__ (std_environment, null, 'gather*', null, __kwargtrans__ ({is_math_mode: true})), __call__ (std_environment, null, 'flalign', null, __kwargtrans__ ({is_math_mode: true})), __call__ (std_environment, null, 'flalign*', null, __kwargtrans__ ({is_math_mode: true})), __call__ (std_environment, null, 'multline', null, __kwargtrans__ ({is_math_mode: true})), __call__ (std_environment, null, 'multline*', null, __kwargtrans__ ({is_math_mode: true})), __call__ (std_environment, null, 'alignat', '{', __kwargtrans__ ({is_math_mode: true})), __call__ (std_environment, null, 'alignat*', '{', __kwargtrans__ ({is_math_mode: true})), __call__ (std_environment, null, 'split', null, __kwargtrans__ ({is_math_mode: true}))], 'specials': [__call__ (std_specials, null, '&')]})]), tuple (['latex-base-subsuperscripts', dict ({'macros': [], 'environments': [], 'specials': [__call__ (_SubSuperscriptSpec, null, '^', 'superscript'), __call__ (_SubSuperscriptSpec, null, '_', 'subscript')]})]), tuple (['nonascii-specials', dict ({'macros': [], 'environments': [], 'specials': [__call__ (std_specials, null, '~'), __call__ (std_specials, null, '``'), __call__ (std_specials, null, "''"), __call__ (std_specials, null, '--'), __call__ (std_specials, null, '---'), __call__ (std_specials, null, '!`'), __call__ (std_specials, null, '?`')]})]), tuple (['verbatim', dict ({'macros': [__call__ (MacroSpec, null, 'verb', __kwargtrans__ ({arguments_spec_list: [__call__ (LatexArgumentSpec, null, __call__ (LatexDelimitedVerbatimParser, null), __kwargtrans__ ({argname: 'verbatim_content'}))], finalize_node: _finalize_verb_macro_node}))], 'environments': [__call__ (EnvironmentSpec, null, 'verbatim', __kwargtrans__ ({arguments_spec_list: [], make_body_parser: _make_verbatim_environment_body_parser, finalize_node: _finalize_verbatim_environment_node}))], 'specials': []})]), tuple (['lstlisting', dict ({'macros': [], 'environments': [__call__ (EnvironmentSpec, null, 'lstlisting', __kwargtrans__ ({arguments_spec_list: [__call__ (LatexArgumentSpec, null, __call__ (LatexStandardArgumentParser, null, '[', __kwargtrans__ ({allow_pre_space: false})), __kwargtrans__ ({argname: 'lstlisting_options'}))], make_body_parser: _make_verbatim_environment_body_parser, finalize_node: _finalize_lstlisting_environment_node}))], 'specials': []})]), tuple (['theorems', dict ({'macros': [], 'environments': [__call__ (std_environment, null, 'theorem', '['), __call__ (std_environment, null, 'proposition', '['), __call__ (std_environment, null, 'lemma', '['), __call__ (std_environment, null, 'corollary', '['), __call__ (std_environment, null, 'definition', '['), __call__ (std_environment, null, 'conjecture', '['), __call__ (std_environment, null, 'remark', '['), __call__ (std_environment, null, 'proof', '['), __call__ (std_environment, null, 'thm', '['), __call__ (std_environment, null, 'prop', '['), __call__ (std_environment, null, 'lem', '['), __call__ (std_environment, null, 'cor', '['), __call__ (std_environment, null, 'conj', '['), __call__ (std_environment, null, 'rem', '['), __call__ (std_environment, null, 'defn', '[')], 'specials': []})]), tuple (['enumitem', dict ({'macros': [], 'environments': [__call__ (std_environment, null, 'enumerate', '['), __call__ (std_environment, null, 'itemize', '['), __call__ (std_environment, null, 'description', '[')], 'specials': []})]), tuple (['natbib', dict ({'macros': [__call__ (MacroSpec, null, 'cite', __kwargtrans__ ({arguments_spec_list: ['*', '[', '[', __call__ (_arg_charsname, null, 'citekey')]})), __call__ (MacroSpec, null, 'citet', __kwargtrans__ ({arguments_spec_list: ['*', '[', '[', __call__ (_arg_charsname, null, 'citekey')]})), __call__ (MacroSpec, null, 'citep', __kwargtrans__ ({arguments_spec_list: ['*', '[', '[', __call__ (_arg_charsname, null, 'citekey')]})), __call__ (MacroSpec, null, 'citealt', __kwargtrans__ ({arguments_spec_list: ['*', '[', '[', __call__ (_arg_charsname, null, 'citekey')]})), __call__ (MacroSpec, null, 'citealp', __kwargtrans__ ({arguments_spec_list: ['*', '[', '[', __call__ (_arg_charsname, null, 'citekey')]})), __call__ (MacroSpec, null, 'citeauthor', __kwargtrans__ ({arguments_spec_list: ['*', '[', '[', __call__ (_arg_charsname, null, 'citekey')]})), __call__ (MacroSpec, null, 'citefullauthor', __kwargtrans__ ({arguments_spec_list: ['[', '[', __call__ (_arg_charsname, null, 'citekey')]})), __call__ (MacroSpec, null, 'citeyear', __kwargtrans__ ({arguments_spec_list: ['[', '[', __call__ (_arg_charsname, null, 'citekey')]})), __call__ (MacroSpec, null, 'citeyearpar', __kwargtrans__ ({arguments_spec_list: ['[', '[', __call__ (_arg_charsname, null, 'citekey')]})), __call__ (MacroSpec, null, 'Citet', __kwargtrans__ ({arguments_spec_list: ['*', '[', '[', __call__ (_arg_charsname, null, 'citekey')]})), __call__ (MacroSpec, null, 'Citep', __kwargtrans__ ({arguments_spec_list: ['*', '[', '[', __call__ (_arg_charsname, null, 'citekey')]})), __call__ (MacroSpec, null, 'Citealt', __kwargtrans__ ({arguments_spec_list: ['*', '[', '[', __call__ (_arg_charsname, null, 'citekey')]})), __call__ (MacroSpec, null, 'Citealp', __kwargtrans__ ({arguments_spec_list: ['*', '[', '[', __call__ (_arg_charsname, null, 'citekey')]})), __call__ (MacroSpec, null, 'Citeauthor', __kwargtrans__ ({arguments_spec_list: ['*', '[', '[', __call__ (_arg_charsname, null, 'citekey')]})), __call__ (std_macro, null, 'citetext', '{'), __call__ (MacroSpec, null, 'citenum', __kwargtrans__ ({arguments_spec_list: [__call__ (_arg_charsname, null, 'citekey')]})), __call__ (MacroSpec, null, 'defcitealias', __kwargtrans__ ({arguments_spec_list: [__call__ (_arg_charsname, null, 'citekey'), '{']})), __call__ (MacroSpec, null, 'citetalias', __kwargtrans__ ({arguments_spec_list: ['[', '[', __call__ (_arg_charsname, null, 'citekey')]})), __call__ (MacroSpec, null, 'citepalias', __kwargtrans__ ({arguments_spec_list: ['[', '[', __call__ (_arg_charsname, null, 'citekey')]}))], 'environments': [], 'specials': []})]), tuple (['latex-ethuebung', dict ({'macros': [__call__ (std_macro, null, 'UebungLoesungFont', false, 1), __call__ (std_macro, null, 'UebungHinweisFont', false, 1), __call__ (std_macro, null, 'UebungExTitleFont', false, 1), __call__ (std_macro, null, 'UebungSubExTitleFont', false, 1), __call__ (std_macro, null, 'UebungTipsFont', false, 1), __call__ (std_macro, null, 'UebungLabel', false, 1), __call__ (std_macro, null, 'UebungSubLabel', false, 1), __call__ (std_macro, null, 'UebungLabelEnum', false, 1), __call__ (std_macro, null, 'UebungLabelEnumSub', false, 1), __call__ (std_macro, null, 'UebungSolLabel', false, 1), __call__ (std_macro, null, 'UebungHinweisLabel', false, 1), __call__ (std_macro, null, 'UebungHinweiseLabel', false, 1), __call__ (std_macro, null, 'UebungSolEquationLabel', false, 1), __call__ (std_macro, null, 'UebungTipsLabel', false, 1), __call__ (std_macro, null, 'UebungTipsEquationLabel', false, 1), __call__ (std_macro, null, 'UebungsblattTitleSeries', false, 1), __call__ (std_macro, null, 'UebungsblattTitleSolutions', false, 1), __call__ (std_macro, null, 'UebungsblattTitleTips', false, 1), __call__ (std_macro, null, 'UebungsblattNumber', false, 1), __call__ (std_macro, null, 'UebungsblattTitleFont', false, 1), __call__ (std_macro, null, 'UebungTitleCenterVSpacing', false, 1), __call__ (std_macro, null, 'UebungAttachedSolutionTitleTop', false, 1), __call__ (std_macro, null, 'UebungAttachedSolutionTitleFont', false, 1), __call__ (std_macro, null, 'UebungAttachedSolutionTitle', false, 1), __call__ (std_macro, null, 'UebungTextAttachedSolution', false, 1), __call__ (std_macro, null, 'UebungDueByLabel', false, 1), __call__ (std_macro, null, 'UebungDueBy', false, 1), __call__ (std_macro, null, 'UebungLecture', false, 1), __call__ (std_macro, null, 'UebungProf', false, 1), __call__ (std_macro, null, 'UebungLecturer', false, 1), __call__ (std_macro, null, 'UebungSemester', false, 1), __call__ (std_macro, null, 'UebungLogoFile', false, 1), __call__ (std_macro, null, 'UebungLanguage', false, 1), __call__ (std_macro, null, 'UebungStyle', false, 1), __call__ (std_macro, null, 'uebung', '{['), __call__ (std_macro, null, 'exercise', '{['), __call__ (std_macro, null, 'keywords', false, 1), __call__ (std_macro, null, 'subuebung', false, 1), __call__ (std_macro, null, 'subexercise', false, 1), __call__ (std_macro, null, 'pdfloesung', true, 1), __call__ (std_macro, null, 'pdfsolution', true, 1), __call__ (std_macro, null, 'exenumfulllabel', false, 1), __call__ (std_macro, null, 'hint', false, 1), __call__ (std_macro, null, 'hints', false, 1), __call__ (std_macro, null, 'hinweis', false, 1), __call__ (std_macro, null, 'hinweise', false, 1)], 'environments': [], 'specials': []})])];

