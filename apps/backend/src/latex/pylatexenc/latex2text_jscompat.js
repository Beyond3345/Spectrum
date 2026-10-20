var logging = {};
import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import * as __module_logging__ from './logging.js';
__nest__ (logging, '', __module_logging__);
var __name__ = 'latex2text_jscompat';
export var logger = (function () {
	var __accu0__ = logging;
	return __call__ (__accu0__.getLogger, __accu0__, __name__);
}) ();
export var apply_percent_substitution = function (simplify_repl, x) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'simplify_repl': var simplify_repl = __allkwargs0__ [__attrib0__]; break;
					case 'x': var x = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	var is_mapping = __call__ (isinstance, null, x, dict);
	var result = [];
	var args_used = 0;
	var i = 0;
	var num = __call__ (len, null, simplify_repl);
	while (__t__ (__lt__ (i, num))) {
		var c = __getitem__ (simplify_repl, i);
		if (__t__ (__ne__ (c, '%'))) {
			(function () {
				var __accu0__ = result;
				return __call__ (__accu0__.append, __accu0__, c);
			}) ();
			var i = __add__ (i, 1);
			continue;
		}
		var i = __add__ (i, 1);
		if (__t__ (__ge__ (i, num))) {
			var __except0__ = __call__ (ValueError, null, 'incomplete format');
			__except0__.__cause__ = null;
			throw __except0__;
		}
		if (__t__ (__eq__ (__getitem__ (simplify_repl, i), '%'))) {
			(function () {
				var __accu0__ = result;
				return __call__ (__accu0__.append, __accu0__, '%');
			}) ();
			var i = __add__ (i, 1);
			continue;
		}
		var key = null;
		if (__t__ (__eq__ (__getitem__ (simplify_repl, i), '('))) {
			var j = (function () {
				var __accu0__ = simplify_repl;
				return __call__ (__accu0__.find, __accu0__, ')', i);
			}) ();
			if (__t__ (__eq__ (j, __neg__ (1)))) {
				var __except0__ = __call__ (ValueError, null, 'incomplete format key');
				__except0__.__cause__ = null;
				throw __except0__;
			}
			var key = __getslice__ (simplify_repl, __add__ (i, 1), j, 1);
			var i = __add__ (j, 1);
			if (__t__ (__ge__ (i, num))) {
				var __except0__ = __call__ (ValueError, null, 'incomplete format');
				__except0__.__cause__ = null;
				throw __except0__;
			}
		}
		var conversion = __getitem__ (simplify_repl, i);
		var i = __add__ (i, 1);
		if (__t__ (__ne__ (conversion, 's'))) {
			var __except0__ = __call__ (ValueError, null, (function () {
				var __accu0__ = "unsupported format character '{}'";
				return __call__ (__accu0__.format, __accu0__, conversion);
			}) ());
			__except0__.__cause__ = null;
			throw __except0__;
		}
		if (__t__ (key !== null)) {
			if (__t__ (!__t__ ((is_mapping)))) {
				var __except0__ = __call__ (py_TypeError, null, 'format requires a mapping');
				__except0__.__cause__ = null;
				throw __except0__;
			}
			if (__t__ (!__in__ (key, x))) {
				var __except0__ = __call__ (KeyError, null, key);
				__except0__.__cause__ = null;
				throw __except0__;
			}
			(function () {
				var __accu0__ = result;
				return __call__ (__accu0__.append, __accu0__, __call__ (str, null, __getitem__ (x, key)));
			}) ();
			continue;
		}
		if (__t__ (is_mapping)) {
			var __except0__ = __call__ (py_TypeError, null, 'not enough arguments for format string');
			__except0__.__cause__ = null;
			throw __except0__;
		}
		if (__t__ (__ge__ (args_used, __call__ (len, null, x)))) {
			var __except0__ = __call__ (py_TypeError, null, 'not enough arguments for format string');
			__except0__.__cause__ = null;
			throw __except0__;
		}
		(function () {
			var __accu0__ = result;
			return __call__ (__accu0__.append, __accu0__, __call__ (str, null, __getitem__ (x, args_used)));
		}) ();
		var args_used = __add__ (args_used, 1);
	}
	if (__t__ (__t__ (!__t__ ((is_mapping))) && __lt__ (args_used, __call__ (len, null, x)))) {
		var __except0__ = __call__ (py_TypeError, null, 'not all arguments converted during string formatting');
		__except0__.__cause__ = null;
		throw __except0__;
	}
	return (function () {
		var __accu0__ = '';
		return __call__ (__accu0__.join, __accu0__, result);
	}) ();
};
export var fill_text_paragraph = function (text, width, initial_indent) {
	if (typeof initial_indent == 'undefined' || (initial_indent != null && initial_indent.hasOwnProperty ("__kwargtrans__"))) {;
		var initial_indent = '';
	};
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'text': var text = __allkwargs0__ [__attrib0__]; break;
					case 'width': var width = __allkwargs0__ [__attrib0__]; break;
					case 'initial_indent': var initial_indent = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	if (__t__ (__lt__ (width, 1))) {
		var __except0__ = __call__ (ValueError, null, (function () {
			var __accu0__ = 'invalid width {}';
			return __call__ (__accu0__.format, __accu0__, width);
		}) ());
		__except0__.__cause__ = null;
		throw __except0__;
	}
	var words = (function () {
		var __accu0__ = text;
		return __call__ (__accu0__.py_split, __accu0__);
	}) ();
	var lines = [];
	var cur = initial_indent;
	var have_word = false;
	var __iterable0__ = words;
	for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
		var word = __getitem__ (__iterable0__, __index0__);
		if (__t__ (have_word)) {
			var candidate = __add__ (__add__ (cur, ' '), word);
		}
		else {
			var candidate = __add__ (cur, word);
		}
		if (__t__ (__le__ (__call__ (len, null, candidate), width))) {
			var cur = candidate;
			var have_word = true;
			continue;
		}
		if (__t__ (__le__ (__call__ (len, null, word), width))) {
			(function () {
				var __accu0__ = lines;
				return __call__ (__accu0__.append, __accu0__, cur);
			}) ();
			var cur = word;
			var have_word = true;
			continue;
		}
		var space_left = __sub__ (width, __call__ (len, null, cur));
		if (__t__ (have_word)) {
			var space_left = __sub__ (space_left, 1);
		}
		if (__t__ (__gt__ (space_left, 0))) {
			if (__t__ (have_word)) {
				var cur = __add__ (__add__ (cur, ' '), __getslice__ (word, 0, space_left, 1));
			}
			else {
				var cur = __add__ (cur, __getslice__ (word, 0, space_left, 1));
			}
			var word = __getslice__ (word, space_left, null, 1);
		}
		(function () {
			var __accu0__ = lines;
			return __call__ (__accu0__.append, __accu0__, cur);
		}) ();
		while (__t__ (__gt__ (__call__ (len, null, word), width))) {
			(function () {
				var __accu0__ = lines;
				return __call__ (__accu0__.append, __accu0__, __getslice__ (word, 0, width, 1));
			}) ();
			var word = __getslice__ (word, width, null, 1);
		}
		var cur = word;
		var have_word = __gt__ (__call__ (len, null, cur), 0);
	}
	if (__t__ (have_word)) {
		(function () {
			var __accu0__ = lines;
			return __call__ (__accu0__.append, __accu0__, cur);
		}) ();
	}
	return (function () {
		var __accu0__ = '\n';
		return __call__ (__accu0__.join, __accu0__, lines);
	}) ();
};
export var compose_accented_char = function (s) {
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
	
	    return s.normalize('NFC');
	    
};
export var _month_names = tuple (['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']);
export var latex_today = function () {
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
	
	    var now = new Date();
	    return _month_names[now.getMonth()] + ' ' + now.getDate() + ', '
	        + now.getFullYear();
	    
};
export var read_latex_file = function (tex_input_directory, strict_input, fn) {
	if (arguments.length) {
		var __ilastarg0__ = arguments.length - 1;
		if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
			var __allkwargs0__ = arguments [__ilastarg0__--];
			for (var __attrib0__ in __allkwargs0__) {
				switch (__attrib0__) {
					case 'tex_input_directory': var tex_input_directory = __allkwargs0__ [__attrib0__]; break;
					case 'strict_input': var strict_input = __allkwargs0__ [__attrib0__]; break;
					case 'fn': var fn = __allkwargs0__ [__attrib0__]; break;
				}
			}
		}
	}
	else {
	}
	(function () {
		var __accu0__ = logger;
		return __call__ (__accu0__.warning, __accu0__, "Can't read the contents of '%s': reading input files is not supported in this build of pylatexenc", fn);
	}) ();
	return '';
};

