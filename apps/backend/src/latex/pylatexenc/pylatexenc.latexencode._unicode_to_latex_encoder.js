var functools = {};
var itertools = {};
var logging = {};
var unicodedata = {};
import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import {RULE_CALLABLE, RULE_DICT, RULE_REGEX, UnicodeToLatexConversionRule} from './pylatexenc.latexencode._rule.js';
import * as __module_unicodedata__ from './unicodedata.js';
__nest__ (unicodedata, '', __module_unicodedata__);
import * as __module_itertools__ from './itertools.js';
__nest__ (itertools, '', __module_itertools__);
import * as __module_functools__ from './functools.js';
__nest__ (functools, '', __module_functools__);
import * as __module_logging__ from './logging.js';
__nest__ (logging, '', __module_logging__);
export {RULE_CALLABLE, RULE_REGEX, UnicodeToLatexConversionRule, RULE_DICT};
var __name__ = 'pylatexenc.latexencode._unicode_to_latex_encoder';
export var unicode_str = function (s) {
	if (typeof s == 'undefined' || (s != null && s.hasOwnProperty ("__kwargtrans__"))) {;
		var s = null;
	};
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
	if (__t__ (s === null)) {
		return '';
	}
	return __call__ (str, null, s);
};
export var logger = (function () {
	var __accu0__ = logging;
	return __call__ (__accu0__.getLogger, __accu0__, __name__);
}) ();
export var _callable_accepts_u2lobj_arg = function (fn) {
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
	return true;
};
var HexstrN = (v, N=4) => (+v).toString(16).toUpperCase().padStart(N, "0")

var re_match_expand = (m, repl) => repl.replace(/\\((\d)|g<(\w+)>)/g, (esc, x, digit, gname) => m.group((digit != null) ? parseInt(digit) : gname)) ;
var regex_match_pos = (rx, s, pos) => rx.match(s.slice(pos)) ;

export var UnicodeToLatexEncoder =  __class__ ('UnicodeToLatexEncoder', [object], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self) {
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
		self.non_ascii_only = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'non_ascii_only', false);
		}) ();
		self.conversion_rules = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'conversion_rules', ['defaults']);
		}) ();
		self.replacement_latex_protection = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'replacement_latex_protection', 'braces');
		}) ();
		self.unknown_char_policy = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'unknown_char_policy', 'keep');
		}) ();
		self.unknown_char_warning = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'unknown_char_warning', true);
		}) ();
		self.latex_string_class = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'latex_string_class', unicode_str);
		}) ();
		if (__t__ (__call__ (len, null, kwargs))) {
			(function () {
				var __accu0__ = logger;
				return __call__ (__accu0__.warning, __accu0__, 'Ignoring unknown keyword arguments: %s', (function () {
					var __accu1__ = ',';
					return __call__ (__accu1__.join, __accu1__, (function () {
						var __accu2__ = kwargs;
						return __call__ (__accu2__.py_keys, __accu2__);
					}) ());
				}) ());
			}) ();
		}
		__call__ (__call__ (__super__, null, UnicodeToLatexEncoder, '__init__'), null, self, __kwargtrans__ (kwargs));
		var expanded_conversion_rules = [];
		var __iterable0__ = self.conversion_rules;
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var r = __getitem__ (__iterable0__, __index0__);
			if (__t__ (__call__ (isinstance, null, r, str))) {
				(function () {
					var __accu0__ = logger;
					return __call__ (__accu0__.warning, __accu0__, 'The pylatexenc.latexencode module was preprocessed and/or transpiled without support for implicit/string-specified default rules.  Please import the pylatexenc.latexencode.get_builtin_rules module and specify the relevant rules manually.');
				}) ();
				continue;
			}
			(function () {
				var __accu0__ = expanded_conversion_rules;
				return __call__ (__accu0__.append, __accu0__, r);
			}) ();
		}
		self._compiled_rules = [];
		var __iterable0__ = expanded_conversion_rules;
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var rule = __getitem__ (__iterable0__, __index0__);
			if (__t__ (__eq__ (rule.rule_type, RULE_DICT))) {
				(function () {
					var __accu0__ = self._compiled_rules;
					return __call__ (__accu0__.append, __accu0__, (function () {
						var __accu1__ = functools;
						return __call__ (__accu1__.partial, __accu1__, self._apply_rule_dict, rule.rule, rule);
					}) ());
				}) ();
			}
			else if (__t__ (__eq__ (rule.rule_type, RULE_REGEX))) {
				(function () {
					var __accu0__ = self._compiled_rules;
					return __call__ (__accu0__.append, __accu0__, (function () {
						var __accu1__ = functools;
						return __call__ (__accu1__.partial, __accu1__, self._apply_rule_regex, rule.rule, rule);
					}) ());
				}) ();
			}
			else if (__t__ (__eq__ (rule.rule_type, RULE_CALLABLE))) {
				var thecallable = rule.rule;
				if (__t__ (__call__ (_callable_accepts_u2lobj_arg, null, thecallable))) {
					var thecallable = (function () {
						var __accu0__ = functools;
						return __call__ (__accu0__.partial, __accu0__, rule.rule, __kwargtrans__ ({u2lobj: self}));
					}) ();
				}
				(function () {
					var __accu0__ = self._compiled_rules;
					return __call__ (__accu0__.append, __accu0__, (function () {
						var __accu1__ = functools;
						return __call__ (__accu1__.partial, __accu1__, self._apply_rule_callable, thecallable, rule);
					}) ());
				}) ();
			}
			else {
				var __except0__ = __call__ (py_TypeError, null, (function () {
					var __accu0__ = 'Invalid rule type: {}';
					return __call__ (__accu0__.format, __accu0__, rule.rule_type);
				}) ());
				__except0__.__cause__ = null;
				throw __except0__;
			}
		}
		if (__t__ (__call__ (isinstance, null, self.unknown_char_policy, str))) {
			self._do_unknown_char = (function () {
				var __accu0__ = self;
				return __call__ (__accu0__._get_method_fn, __accu0__, 'do_unknown_char', self.unknown_char_policy, __kwargtrans__ ({what: 'unknown_char_policy'}));
			}) ();
		}
		else if (__t__ (__call__ (callable, null, self.unknown_char_policy))) {
			var fn = self.unknown_char_policy;
			if (__t__ (__call__ (_callable_accepts_u2lobj_arg, null, fn))) {
				self._do_unknown_char = (function () {
					var __accu0__ = functools;
					return __call__ (__accu0__.partial, __accu0__, self.unknown_char_policy, __kwargtrans__ ({u2lobj: self}));
				}) ();
			}
			else {
				self._do_unknown_char = self.unknown_char_policy;
			}
		}
		else {
			var __except0__ = __call__ (py_TypeError, null, (function () {
				var __accu0__ = 'Invalid argument for unknown_char_policy: {}';
				return __call__ (__accu0__.format, __accu0__, __call__ (repr, null, self.unknown_char_policy));
			}) ());
			__except0__.__cause__ = null;
			throw __except0__;
		}
		if (__t__ (!__t__ ((self.unknown_char_warning)))) {
			self._do_warn_unknown_char = (function __lambda__ (ch) {
				if (arguments.length) {
					var __ilastarg0__ = arguments.length - 1;
					if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
						var __allkwargs0__ = arguments [__ilastarg0__--];
						for (var __attrib0__ in __allkwargs0__) {
							switch (__attrib0__) {
								case 'ch': var ch = __allkwargs0__ [__attrib0__]; break;
							}
						}
					}
				}
				else {
				}
				return null;
			});
		}
		else {
			self._do_warn_unknown_char = self._do_warn_unknown_char_defaultimpl;
		}
		if (__t__ (self.non_ascii_only)) {
			self._maybe_skip_ascii = self._check_do_skip_ascii;
		}
		else {
			self._maybe_skip_ascii = (function __lambda__ (s, p) {
				if (arguments.length) {
					var __ilastarg0__ = arguments.length - 1;
					if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
						var __allkwargs0__ = arguments [__ilastarg0__--];
						for (var __attrib0__ in __allkwargs0__) {
							switch (__attrib0__) {
								case 's': var s = __allkwargs0__ [__attrib0__]; break;
								case 'p': var p = __allkwargs0__ [__attrib0__]; break;
							}
						}
					}
				}
				else {
				}
				return false;
			});
		}
		self._apply_protection = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__._get_replacement_latex_fn, __accu0__, self.replacement_latex_protection);
		}) ();
	});},
	get _get_method_fn () {return __get__ (this, function (self, base, py_name, what) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'base': var base = __allkwargs0__ [__attrib0__]; break;
						case 'py_name': var py_name = __allkwargs0__ [__attrib0__]; break;
						case 'what': var what = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var selfmethname = __add__ (__add__ (__add__ ('_', base), '_'), (function () {
			var __accu0__ = py_name;
			return __call__ (__accu0__.py_replace, __accu0__, '-', '_');
		}) ());
		if (__t__ (!__t__ ((__call__ (hasattr, null, self, selfmethname))))) {
			var __except0__ = __call__ (ValueError, null, (function () {
				var __accu0__ = 'Invalid {}: {}';
				return __call__ (__accu0__.format, __accu0__, what, py_name);
			}) ());
			__except0__.__cause__ = null;
			throw __except0__;
		}
		return __call__ (getattr, null, self, selfmethname);
	});},
	get _get_replacement_latex_fn () {return __get__ (this, function (self, replacement_latex_protection) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'replacement_latex_protection': var replacement_latex_protection = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (__call__ (callable, null, replacement_latex_protection))) {
			return replacement_latex_protection;
		}
		return (function () {
			var __accu0__ = self;
			return __call__ (__accu0__._get_method_fn, __accu0__, 'apply_protection', replacement_latex_protection, __kwargtrans__ ({what: 'replacement_latex_protection'}));
		}) ();
	});},
	get unicode_to_latex () {return __get__ (this, function (self, s) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 's': var s = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var s = __call__ (unicode_str, null, s);
		var s = (function () {
			var __accu0__ = unicodedata;
			return __call__ (__accu0__.normalize, __accu0__, 'NFC', s);
		}) ();
		var _NS = __class__ ('_NS', [object], {
			__module__: __name__,
		});
		var p = __call__ (_NS, null);
		p.latex = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.latex_string_class, __accu0__);
		}) ();
		p.pos = 0;
		while (__t__ (__lt__ (p.pos, __call__ (len, null, s)))) {
			if (__t__ ((function () {
				var __accu0__ = self;
				return __call__ (__accu0__._maybe_skip_ascii, __accu0__, s, p);
			}) ())) {
				continue;
			}
			var __break1__ = false;
			var __iterable0__ = self._compiled_rules;
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var compiledrule = __getitem__ (__iterable0__, __index0__);
				if (__t__ (__call__ (compiledrule, null, s, p))) {
					__break1__ = true;
					break;
				}
			}
			if (!__break1__) {
				var ch = __getitem__ (s, p.pos);
				var o = __call__ (ord, null, ch);
				if (__t__ (__t__ (__t__ (__ge__ (o, 32)) && __le__ (o, 127)) || __in__ (ch, '\n\r\t'))) {
					p.latex = __call__ (__iadd__, null, p.latex, ch);
					p.pos = __call__ (__iadd__, null, p.pos, 1);
				}
				else {
					(function () {
						var __accu0__ = self;
						return __call__ (__accu0__._do_warn_unknown_char, __accu0__, ch);
					}) ();
					p.latex = __call__ (__iadd__, null, p.latex, (function () {
						var __accu0__ = self;
						return __call__ (__accu0__._do_unknown_char, __accu0__, ch);
					}) ());
					p.pos = __call__ (__iadd__, null, p.pos, 1);
				}
			}
		}
		return p.latex;
	});},
	get _check_do_skip_ascii () {return __get__ (this, function (self, s, p) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 's': var s = __allkwargs0__ [__attrib0__]; break;
						case 'p': var p = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (__lt__ (__call__ (ord, null, __getitem__ (s, p.pos)), 127))) {
			p.latex = __call__ (__iadd__, null, p.latex, __getitem__ (s, p.pos));
			p.pos = __call__ (__iadd__, null, p.pos, 1);
			return true;
		}
		return false;
	});},
	get _apply_rule_dict () {return __get__ (this, function (self, ruledict, rule, s, p) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'ruledict': var ruledict = __allkwargs0__ [__attrib0__]; break;
						case 'rule': var rule = __allkwargs0__ [__attrib0__]; break;
						case 's': var s = __allkwargs0__ [__attrib0__]; break;
						case 'p': var p = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var o = __call__ (ord, null, __getitem__ (s, p.pos));
		if (__t__ (__in__ (o, ruledict))) {
			(function () {
				var __accu0__ = self;
				return __call__ (__accu0__._apply_replacement, __accu0__, p, __getitem__ (ruledict, o), 1, rule);
			}) ();
			return true;
		}
		return null;
	});},
	get _apply_rule_regex () {return __get__ (this, function (self, ruleregexes, rule, s, p) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'ruleregexes': var ruleregexes = __allkwargs0__ [__attrib0__]; break;
						case 'rule': var rule = __allkwargs0__ [__attrib0__]; break;
						case 's': var s = __allkwargs0__ [__attrib0__]; break;
						case 'p': var p = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __iterable0__ = ruleregexes;
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var __left0__ = __getitem__ (__iterable0__, __index0__);
			var regex = __left0__ [0];
			var repl = __left0__ [1];
			var m = __call__ (regex_match_pos, null, regex, s, p.pos);
			if (__t__ (m !== null)) {
				if (__t__ (__call__ (callable, null, repl))) {
					var replstr = __call__ (repl, null, m);
				}
				else {
					var replstr = __call__ (re_match_expand, null, m, repl);
				}
				(function () {
					var __accu0__ = self;
					return __call__ (__accu0__._apply_replacement, __accu0__, p, replstr, __sub__ ((function () {
						var __accu1__ = m;
						return __call__ (__accu1__.end, __accu1__);
					}) (), (function () {
						var __accu1__ = m;
						return __call__ (__accu1__.start, __accu1__);
					}) ()), rule);
				}) ();
				return true;
			}
		}
		return null;
	});},
	get _apply_rule_callable () {return __get__ (this, function (self, rulecallable, rule, s, p) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'rulecallable': var rulecallable = __allkwargs0__ [__attrib0__]; break;
						case 'rule': var rule = __allkwargs0__ [__attrib0__]; break;
						case 's': var s = __allkwargs0__ [__attrib0__]; break;
						case 'p': var p = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var res = __call__ (rulecallable, null, s, p.pos);
		if (__t__ (res === null)) {
			return null;
		}
		var __left0__ = res;
		var consumed = __left0__ [0];
		var repl = __left0__ [1];
		if (__t__ (__le__ (consumed, 0))) {
			var __except0__ = __call__ (ValueError, null, (function () {
				var __accu0__ = 'A RULE_CALLABLE reported that it consumed {} characters at position {} (near ‘{}’); it must consume at least one character.  Return None instead to indicate that the rule does not apply here.';
				return __call__ (__accu0__.format, __accu0__, consumed, p.pos, __getslice__ (s, p.pos, __add__ (p.pos, 16), 1));
			}) ());
			__except0__.__cause__ = null;
			throw __except0__;
		}
		(function () {
			var __accu0__ = self;
			return __call__ (__accu0__._apply_replacement, __accu0__, p, repl, consumed, rule);
		}) ();
		return true;
	});},
	get _apply_replacement () {return __get__ (this, function (self, p, repl, numchars, ruleobj) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'p': var p = __allkwargs0__ [__attrib0__]; break;
						case 'repl': var repl = __allkwargs0__ [__attrib0__]; break;
						case 'numchars': var numchars = __allkwargs0__ [__attrib0__]; break;
						case 'ruleobj': var ruleobj = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var protect_fn = self._apply_protection;
		if (__t__ (ruleobj.replacement_latex_protection !== null)) {
			var protect_fn = (function () {
				var __accu0__ = self;
				return __call__ (__accu0__._get_replacement_latex_fn, __accu0__, ruleobj.replacement_latex_protection);
			}) ();
		}
		var repl = __call__ (protect_fn, null, repl);
		p.latex = __call__ (__iadd__, null, p.latex, repl);
		p.pos = __call__ (__iadd__, null, p.pos, numchars);
	});},
	get _apply_protection_none () {return __get__ (this, function (self, repl) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'repl': var repl = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return repl;
	});},
	get _apply_protection_braces () {return __get__ (this, function (self, repl) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'repl': var repl = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var k = (function () {
			var __accu0__ = repl;
			return __call__ (__accu0__.rfind, __accu0__, '\\');
		}) ();
		if (__t__ (__t__ (__ge__ (k, 0)) && (function () {
			var __accu0__ = __getslice__ (repl, __add__ (k, 1), null, 1);
			return __call__ (__accu0__.isalpha, __accu0__);
		}) ())) {
			return __add__ (__add__ ('{', repl), '}');
		}
		return repl;
	});},
	get _apply_protection_braces_almost_all () {return __get__ (this, function (self, repl) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'repl': var repl = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (__eq__ (__getslice__ (repl, 0, 1, 1), '\\'))) {
			return __add__ (__add__ ('{', repl), '}');
		}
		return repl;
	});},
	get _apply_protection_braces_all () {return __get__ (this, function (self, repl) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'repl': var repl = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return __add__ (__add__ ('{', repl), '}');
	});},
	get _apply_protection_braces_after_macro () {return __get__ (this, function (self, repl) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'repl': var repl = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var k = (function () {
			var __accu0__ = repl;
			return __call__ (__accu0__.rfind, __accu0__, '\\');
		}) ();
		if (__t__ (__t__ (__ge__ (k, 0)) && (function () {
			var __accu0__ = __getslice__ (repl, __add__ (k, 1), null, 1);
			return __call__ (__accu0__.isalpha, __accu0__);
		}) ())) {
			return __add__ (repl, '{}');
		}
		return repl;
	});},
	get _do_unknown_char_keep () {return __get__ (this, function (self, ch) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'ch': var ch = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return ch;
	});},
	get _do_unknown_char_replace () {return __get__ (this, function (self, ch) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'ch': var ch = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return '{\\bfseries ?}';
	});},
	get _do_unknown_char_ignore () {return __get__ (this, function (self, ch) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'ch': var ch = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return '';
	});},
	get _do_unknown_char_fail () {return __get__ (this, function (self, ch) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'ch': var ch = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __except0__ = __call__ (ValueError, null, (function () {
			var __accu0__ = 'No known latex representation for character: U+{} - ‘{}’';
			return __call__ (__accu0__.format, __accu0__, __call__ (HexstrN, null, __call__ (ord, null, ch), 4), ch);
		}) ());
		__except0__.__cause__ = null;
		throw __except0__;
	});},
	get _do_unknown_char_unihex () {return __get__ (this, function (self, ch) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'ch': var ch = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		return __add__ (__add__ ('\\ensuremath{\\langle}\\texttt{U+', __call__ (HexstrN, null, __call__ (ord, null, ch), 4)), '}\\ensuremath{\\rangle}');
	});},
	get _do_warn_unknown_char_defaultimpl () {return __get__ (this, function (self, ch) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'ch': var ch = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		(function () {
			var __accu0__ = logger;
			return __call__ (__accu0__.warning, __accu0__, (function () {
				var __accu1__ = 'No known latex representation for character: U+{} - ‘{}’';
				return __call__ (__accu1__.format, __accu1__, __call__ (HexstrN, null, __call__ (ord, null, ch), 4), ch);
			}) ());
		}) ();
	});}
});

