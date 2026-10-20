var logging = {};
var unique_object_id = {};
import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import * as __module_unique_object_id__ from './unique_object_id.js';
__nest__ (unique_object_id, '', __module_unique_object_id__);
import * as __module_logging__ from './logging.js';
__nest__ (logging, '', __module_logging__);
import {ParsingStateDelta} from './pylatexenc.latexnodes.js';
import * as _util from './pylatexenc._util.js';
export {ParsingStateDelta, _util};
var __name__ = 'pylatexenc.macrospec._latexcontextdb';
export var logger = (function () {
	var __accu0__ = logging;
	return __call__ (__accu0__.getLogger, __accu0__, __name__);
}) ();
export var _autogen_category_prefix = '__lctxdb_cat_';
export var fn_unique_object_id = unique_object_id.fn_unique_object_id;
export var LatexContextDb =  __class__ ('LatexContextDb', [object], {
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
		__call__ (__call__ (__super__, null, LatexContextDb, '__init__'), null, self, __kwargtrans__ (kwargs));
		self.category_list = [];
		self.d = dict ({});
		self.frozen = false;
		self.lookup_chain_maps = dict ({'macros': (function () {
			var __accu0__ = _util;
			return __call__ (__accu0__.ChainMap, __accu0__, dict ({}));
		}) (), 'environments': (function () {
			var __accu0__ = _util;
			return __call__ (__accu0__.ChainMap, __accu0__, dict ({}));
		}) (), 'specials': (function () {
			var __accu0__ = _util;
			return __call__ (__accu0__.ChainMap, __accu0__, dict ({}));
		}) ()});
		var __iterable0__ = tuple (['macros', 'environments', 'specials']);
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var which = __getitem__ (__iterable0__, __index0__);
			__getitem__ (self.lookup_chain_maps, which).maps = [];
		}
		self.unknown_macro_spec = null;
		self.unknown_environment_spec = null;
		self.unknown_specials_spec = null;
		self._autogen_category_counter = 0;
	});},
	get freeze () {return __get__ (this, function (self) {
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
		self.frozen = true;
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
			var __accu0__ = '<LatexContextDb {:#x}{}>';
			return __call__ (__accu0__.format, __accu0__, __call__ (fn_unique_object_id, null, self), (__t__ (self.frozen) ? '' : ' unfrozen'));
		}) ();
	});},
	get add_context_category () {return __get__ (this, function (self, category, macros, environments, specials, prepend, insert_before, insert_after) {
		if (typeof macros == 'undefined' || (macros != null && macros.hasOwnProperty ("__kwargtrans__"))) {;
			var macros = [];
		};
		if (typeof environments == 'undefined' || (environments != null && environments.hasOwnProperty ("__kwargtrans__"))) {;
			var environments = [];
		};
		if (typeof specials == 'undefined' || (specials != null && specials.hasOwnProperty ("__kwargtrans__"))) {;
			var specials = [];
		};
		if (typeof prepend == 'undefined' || (prepend != null && prepend.hasOwnProperty ("__kwargtrans__"))) {;
			var prepend = false;
		};
		if (typeof insert_before == 'undefined' || (insert_before != null && insert_before.hasOwnProperty ("__kwargtrans__"))) {;
			var insert_before = null;
		};
		if (typeof insert_after == 'undefined' || (insert_after != null && insert_after.hasOwnProperty ("__kwargtrans__"))) {;
			var insert_after = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'category': var category = __allkwargs0__ [__attrib0__]; break;
						case 'macros': var macros = __allkwargs0__ [__attrib0__]; break;
						case 'environments': var environments = __allkwargs0__ [__attrib0__]; break;
						case 'specials': var specials = __allkwargs0__ [__attrib0__]; break;
						case 'prepend': var prepend = __allkwargs0__ [__attrib0__]; break;
						case 'insert_before': var insert_before = __allkwargs0__ [__attrib0__]; break;
						case 'insert_after': var insert_after = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (self.frozen)) {
			var __except0__ = __call__ (RuntimeError, null, 'You attempted to modify a frozen LatexContextDb object.');
			__except0__.__cause__ = null;
			throw __except0__;
		}
		if (__t__ (__t__ (category !== null) && (function () {
			var __accu0__ = category;
			return __call__ (__accu0__.startswith, __accu0__, _autogen_category_prefix);
		}) ())) {
			var __except0__ = __call__ (ValueError, null, (function () {
				var __accu0__ = 'Category name {} is unfortunately reserved for internal use';
				return __call__ (__accu0__.format, __accu0__, category);
			}) ());
			__except0__.__cause__ = null;
			throw __except0__;
		}
		if (__t__ (category === null)) {
			var __left0__ = (function () {
				var __accu0__ = self;
				return __call__ (__accu0__._get_new_autogen_category, __accu0__);
			}) ();
			var _autogen_category_counter = __left0__ [0];
			var category = __left0__ [1];
			self._autogen_category_counter = __add__ (_autogen_category_counter, 1);
		}
		if (__t__ (__in__ (category, self.category_list))) {
			var __except0__ = __call__ (ValueError, null, (function () {
				var __accu0__ = 'Category {} is already registered in the context database';
				return __call__ (__accu0__.format, __accu0__, category);
			}) ());
			__except0__.__cause__ = null;
			throw __except0__;
		}
		if (__t__ (__gt__ (__call__ (len, null, (function () {
			var __accu0__ = [];
			var __iterable0__ = tuple ([prepend, insert_before, insert_after]);
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
		}) ()), 1))) {
			var __except0__ = __call__ (py_TypeError, null, 'add_context_category(): You may only specify one of prepend=True, insert_before=... or insert_after=...');
			__except0__.__cause__ = null;
			throw __except0__;
		}
		var category_dicts = dict ({'macros': __call__ (dict, null, (function () {
			var __accu0__ = [];
			var __iterable0__ = macros;
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var m = __getitem__ (__iterable0__, __index0__);
				(function () {
					var __accu1__ = __accu0__;
					return __call__ (__accu1__.append, __accu1__, tuple ([m.macroname, m]));
				}) ();
			}
			return __accu0__;
		}) ()), 'environments': __call__ (dict, null, (function () {
			var __accu0__ = [];
			var __iterable0__ = environments;
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var e = __getitem__ (__iterable0__, __index0__);
				(function () {
					var __accu1__ = __accu0__;
					return __call__ (__accu1__.append, __accu1__, tuple ([e.environmentname, e]));
				}) ();
			}
			return __accu0__;
		}) ()), 'specials': __call__ (dict, null, (function () {
			var __accu0__ = [];
			var __iterable0__ = specials;
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var s = __getitem__ (__iterable0__, __index0__);
				(function () {
					var __accu1__ = __accu0__;
					return __call__ (__accu1__.append, __accu1__, tuple ([s.specials_chars, s]));
				}) ();
			}
			return __accu0__;
		}) ())});
		// pass;
		if (__t__ (prepend)) {
			var insert_fn = (function __lambda__ (listobj, item) {
				if (arguments.length) {
					var __ilastarg0__ = arguments.length - 1;
					if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
						var __allkwargs0__ = arguments [__ilastarg0__--];
						for (var __attrib0__ in __allkwargs0__) {
							switch (__attrib0__) {
								case 'listobj': var listobj = __allkwargs0__ [__attrib0__]; break;
								case 'item': var item = __allkwargs0__ [__attrib0__]; break;
							}
						}
					}
				}
				else {
				}
				return (function () {
					var __accu0__ = listobj;
					return __call__ (__accu0__.insert, __accu0__, 0, item);
				}) ();
			});
		}
		else if (__t__ (insert_before)) {
			if (__t__ (__in__ (insert_before, self.category_list))) {
				var i = (function () {
					var __accu0__ = self.category_list;
					return __call__ (__accu0__.index, __accu0__, insert_before);
				}) ();
			}
			else {
				var i = 0;
			}
			var insert_fn = (function __lambda__ (listobj, item) {
				if (arguments.length) {
					var __ilastarg0__ = arguments.length - 1;
					if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
						var __allkwargs0__ = arguments [__ilastarg0__--];
						for (var __attrib0__ in __allkwargs0__) {
							switch (__attrib0__) {
								case 'listobj': var listobj = __allkwargs0__ [__attrib0__]; break;
								case 'item': var item = __allkwargs0__ [__attrib0__]; break;
							}
						}
					}
				}
				else {
				}
				return (function () {
					var __accu0__ = listobj;
					return __call__ (__accu0__.insert, __accu0__, i, item);
				}) ();
			});
		}
		else if (__t__ (insert_after)) {
			if (__t__ (__in__ (insert_after, self.category_list))) {
				var i = __add__ ((function () {
					var __accu0__ = self.category_list;
					return __call__ (__accu0__.index, __accu0__, insert_after);
				}) (), 1);
			}
			else {
				var i = __call__ (len, null, self.category_list);
			}
			var insert_fn = (function __lambda__ (listobj, item) {
				if (arguments.length) {
					var __ilastarg0__ = arguments.length - 1;
					if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
						var __allkwargs0__ = arguments [__ilastarg0__--];
						for (var __attrib0__ in __allkwargs0__) {
							switch (__attrib0__) {
								case 'listobj': var listobj = __allkwargs0__ [__attrib0__]; break;
								case 'item': var item = __allkwargs0__ [__attrib0__]; break;
							}
						}
					}
				}
				else {
				}
				return (function () {
					var __accu0__ = listobj;
					return __call__ (__accu0__.insert, __accu0__, i, item);
				}) ();
			});
		}
		else {
			var insert_fn = (function __lambda__ (listobj, item) {
				if (arguments.length) {
					var __ilastarg0__ = arguments.length - 1;
					if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
						var __allkwargs0__ = arguments [__ilastarg0__--];
						for (var __attrib0__ in __allkwargs0__) {
							switch (__attrib0__) {
								case 'listobj': var listobj = __allkwargs0__ [__attrib0__]; break;
								case 'item': var item = __allkwargs0__ [__attrib0__]; break;
							}
						}
					}
				}
				else {
				}
				return (function () {
					var __accu0__ = listobj;
					return __call__ (__accu0__.append, __accu0__, item);
				}) ();
			});
		}
		__call__ (insert_fn, null, self.category_list, category);
		var __iterable0__ = tuple (['macros', 'environments', 'specials']);
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var which = __getitem__ (__iterable0__, __index0__);
			__call__ (insert_fn, null, __getitem__ (self.lookup_chain_maps, which).maps, __getitem__ (category_dicts, which));
		}
		__setitem__ (self.d, category, category_dicts);
	});},
	get set_unknown_macro_spec () {return __get__ (this, function (self, macrospec) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'macrospec': var macrospec = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (self.frozen)) {
			var __except0__ = __call__ (RuntimeError, null, 'You attempted to modify a frozen LatexContextDb object.');
			__except0__.__cause__ = null;
			throw __except0__;
		}
		self.unknown_macro_spec = macrospec;
	});},
	get set_unknown_environment_spec () {return __get__ (this, function (self, environmentspec) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'environmentspec': var environmentspec = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (self.frozen)) {
			var __except0__ = __call__ (RuntimeError, null, 'You attempted to modify a frozen LatexContextDb object.');
			__except0__.__cause__ = null;
			throw __except0__;
		}
		self.unknown_environment_spec = environmentspec;
	});},
	get set_unknown_specials_spec () {return __get__ (this, function (self, specialsspec) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'specialsspec': var specialsspec = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (self.frozen)) {
			var __except0__ = __call__ (RuntimeError, null, 'You attempted to modify a frozen LatexContextDb object.');
			__except0__.__cause__ = null;
			throw __except0__;
		}
		self.unknown_specials_spec = specialsspec;
	});},
	get categories () {return __get__ (this, function (self) {
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
		return __call__ (list, null, self.category_list);
	});},
	get get_macro_spec () {return __get__ (this, function (self, macroname, raise_if_not_found) {
		if (typeof raise_if_not_found == 'undefined' || (raise_if_not_found != null && raise_if_not_found.hasOwnProperty ("__kwargtrans__"))) {;
			var raise_if_not_found = false;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'macroname': var macroname = __allkwargs0__ [__attrib0__]; break;
						case 'raise_if_not_found': var raise_if_not_found = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		try {
			return __getitem__ (__getitem__ (self.lookup_chain_maps, 'macros'), macroname);
		}
		catch (__except0__) {
			if (isinstance (__except0__, KeyError)) {
				if (__t__ (raise_if_not_found)) {
					__except0__.__cause__ = null;
					throw __except0__;
				}
				return self.unknown_macro_spec;
			}
			else {
				throw __except0__;
			}
		}
	});},
	get get_environment_spec () {return __get__ (this, function (self, environmentname, raise_if_not_found) {
		if (typeof raise_if_not_found == 'undefined' || (raise_if_not_found != null && raise_if_not_found.hasOwnProperty ("__kwargtrans__"))) {;
			var raise_if_not_found = false;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'environmentname': var environmentname = __allkwargs0__ [__attrib0__]; break;
						case 'raise_if_not_found': var raise_if_not_found = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		try {
			return __getitem__ (__getitem__ (self.lookup_chain_maps, 'environments'), environmentname);
		}
		catch (__except0__) {
			if (isinstance (__except0__, KeyError)) {
				if (__t__ (raise_if_not_found)) {
					__except0__.__cause__ = null;
					throw __except0__;
				}
				return self.unknown_environment_spec;
			}
			else {
				throw __except0__;
			}
		}
	});},
	get get_specials_spec () {return __get__ (this, function (self, specials_chars, raise_if_not_found) {
		if (typeof raise_if_not_found == 'undefined' || (raise_if_not_found != null && raise_if_not_found.hasOwnProperty ("__kwargtrans__"))) {;
			var raise_if_not_found = false;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'specials_chars': var specials_chars = __allkwargs0__ [__attrib0__]; break;
						case 'raise_if_not_found': var raise_if_not_found = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		try {
			return __getitem__ (__getitem__ (self.lookup_chain_maps, 'specials'), specials_chars);
		}
		catch (__except0__) {
			if (isinstance (__except0__, KeyError)) {
				if (__t__ (raise_if_not_found)) {
					__except0__.__cause__ = null;
					throw __except0__;
				}
				return self.unknown_specials_spec;
			}
			else {
				throw __except0__;
			}
		}
	});},
	get test_for_specials () {return __get__ (this, function (self, s, pos, parsing_state) {
		if (typeof parsing_state == 'undefined' || (parsing_state != null && parsing_state.hasOwnProperty ("__kwargtrans__"))) {;
			var parsing_state = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 's': var s = __allkwargs0__ [__attrib0__]; break;
						case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var best_match_len = 0;
		var best_match_s = null;
		var __iterable0__ = self.category_list;
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var cat = __getitem__ (__iterable0__, __index0__);
			var __iterable1__ = (function () {
				var __accu0__ = __getitem__ (__getitem__ (self.d, cat), 'specials');
				return __call__ (__accu0__.py_keys, __accu0__);
			}) ();
			for (var __index1__ = 0; __index1__ < len (__iterable1__); __index1__++) {
				var specials_chars = __getitem__ (__iterable1__, __index1__);
				if (__t__ (__t__ (__gt__ (__call__ (len, null, specials_chars), best_match_len)) && (function () {
					var __accu0__ = s;
					return __call__ (__accu0__.startswith, __accu0__, specials_chars, pos);
				}) ())) {
					var best_match_s = __getitem__ (__getitem__ (__getitem__ (self.d, cat), 'specials'), specials_chars);
					var best_match_len = __call__ (len, null, specials_chars);
				}
			}
		}
		return best_match_s;
	});},
	get iter_macro_specs () {return __get__ (this, function* (self, categories) {
		if (typeof categories == 'undefined' || (categories != null && categories.hasOwnProperty ("__kwargtrans__"))) {;
			var categories = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'categories': var categories = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (categories === null)) {
			var categories = self.category_list;
		}
		var __iterable0__ = categories;
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var c = __getitem__ (__iterable0__, __index0__);
			if (__t__ (!__in__ (c, self.category_list))) {
				var __except0__ = __call__ (ValueError, null, (function () {
					var __accu0__ = 'Invalid latex macro spec db category: {!r} (Expected one of {!r})';
					return __call__ (__accu0__.format, __accu0__, c, self.category_list);
				}) ());
				__except0__.__cause__ = null;
				throw __except0__;
			}
			var __iterable1__ = (function () {
				var __accu0__ = __getitem__ (__getitem__ (self.d, c), 'macros');
				return __call__ (__accu0__.py_values, __accu0__);
			}) ();
			for (var __index1__ = 0; __index1__ < len (__iterable1__); __index1__++) {
				var spec = __getitem__ (__iterable1__, __index1__);
				yield spec;
			}
		}
		});},
	get iter_environment_specs () {return __get__ (this, function* (self, categories) {
		if (typeof categories == 'undefined' || (categories != null && categories.hasOwnProperty ("__kwargtrans__"))) {;
			var categories = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'categories': var categories = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (categories === null)) {
			var categories = self.category_list;
		}
		var __iterable0__ = categories;
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var c = __getitem__ (__iterable0__, __index0__);
			if (__t__ (!__in__ (c, self.category_list))) {
				var __except0__ = __call__ (ValueError, null, (function () {
					var __accu0__ = 'Invalid latex environment spec db category: {!r} (Expected one of {!r})';
					return __call__ (__accu0__.format, __accu0__, c, self.category_list);
				}) ());
				__except0__.__cause__ = null;
				throw __except0__;
			}
			var __iterable1__ = (function () {
				var __accu0__ = __getitem__ (__getitem__ (self.d, c), 'environments');
				return __call__ (__accu0__.py_values, __accu0__);
			}) ();
			for (var __index1__ = 0; __index1__ < len (__iterable1__); __index1__++) {
				var spec = __getitem__ (__iterable1__, __index1__);
				yield spec;
			}
		}
		});},
	get iter_specials_specs () {return __get__ (this, function* (self, categories) {
		if (typeof categories == 'undefined' || (categories != null && categories.hasOwnProperty ("__kwargtrans__"))) {;
			var categories = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'categories': var categories = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (categories === null)) {
			var categories = self.category_list;
		}
		var __iterable0__ = categories;
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var c = __getitem__ (__iterable0__, __index0__);
			if (__t__ (!__in__ (c, self.category_list))) {
				var __except0__ = __call__ (ValueError, null, (function () {
					var __accu0__ = 'Invalid latex environment spec db category: {!r} (Expected one of {!r})';
					return __call__ (__accu0__.format, __accu0__, c, self.category_list);
				}) ());
				__except0__.__cause__ = null;
				throw __except0__;
			}
			var __iterable1__ = (function () {
				var __accu0__ = __getitem__ (__getitem__ (self.d, c), 'specials');
				return __call__ (__accu0__.py_values, __accu0__);
			}) ();
			for (var __index1__ = 0; __index1__ < len (__iterable1__); __index1__++) {
				var spec = __getitem__ (__iterable1__, __index1__);
				yield spec;
			}
		}
		});},
	get filtered_context () {return __get__ (this, function (self, keep_categories, exclude_categories, keep_which, create_class) {
		if (typeof keep_categories == 'undefined' || (keep_categories != null && keep_categories.hasOwnProperty ("__kwargtrans__"))) {;
			var keep_categories = [];
		};
		if (typeof exclude_categories == 'undefined' || (exclude_categories != null && exclude_categories.hasOwnProperty ("__kwargtrans__"))) {;
			var exclude_categories = [];
		};
		if (typeof keep_which == 'undefined' || (keep_which != null && keep_which.hasOwnProperty ("__kwargtrans__"))) {;
			var keep_which = [];
		};
		if (typeof create_class == 'undefined' || (create_class != null && create_class.hasOwnProperty ("__kwargtrans__"))) {;
			var create_class = null;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'keep_categories': var keep_categories = __allkwargs0__ [__attrib0__]; break;
						case 'exclude_categories': var exclude_categories = __allkwargs0__ [__attrib0__]; break;
						case 'keep_which': var keep_which = __allkwargs0__ [__attrib0__]; break;
						case 'create_class': var create_class = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (create_class === null)) {
			var create_class = self.__class__;
		}
		var new_context = __call__ (create_class, null);
		new_context.unknown_macro_spec = self.unknown_macro_spec;
		new_context.unknown_environment_spec = self.unknown_environment_spec;
		new_context.unknown_specials_spec = self.unknown_specials_spec;
		var keep_macros = __t__ (!__t__ ((keep_which))) || __in__ ('macros', keep_which);
		var keep_environments = __t__ (!__t__ ((keep_which))) || __in__ ('environments', keep_which);
		var keep_specials = __t__ (!__t__ ((keep_which))) || __in__ ('specials', keep_which);
		var __iterable0__ = self.category_list;
		for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
			var cat = __getitem__ (__iterable0__, __index0__);
			if (__t__ (__t__ (keep_categories) && !__in__ (cat, keep_categories))) {
				continue;
			}
			if (__t__ (__t__ (exclude_categories) && __in__ (cat, exclude_categories))) {
				continue;
			}
			(function () {
				var __accu0__ = new_context;
				return __call__ (__accu0__.add_context_category, __accu0__, cat, __kwargtrans__ ({macros: (__t__ (keep_macros) ? (function () {
					var __accu1__ = __getitem__ (__getitem__ (self.d, cat), 'macros');
					return __call__ (__accu1__.py_values, __accu1__);
				}) () : []), environments: (__t__ (keep_environments) ? (function () {
					var __accu1__ = __getitem__ (__getitem__ (self.d, cat), 'environments');
					return __call__ (__accu1__.py_values, __accu1__);
				}) () : []), specials: (__t__ (keep_specials) ? (function () {
					var __accu1__ = __getitem__ (__getitem__ (self.d, cat), 'specials');
					return __call__ (__accu1__.py_values, __accu1__);
				}) () : [])}));
			}) ();
		}
		return new_context;
	});},
	get _get_new_autogen_category () {return __get__ (this, function (self) {
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
		while (__t__ (true)) {
			var category = __add__ (_autogen_category_prefix, __call__ (str, null, self._autogen_category_counter));
			if (__t__ (!__in__ (category, self.category_list))) {
				break;
			}
			self._autogen_category_counter = __call__ (__iadd__, null, self._autogen_category_counter, 1);
		}
		return tuple ([self._autogen_category_counter, category]);
	});},
	get extended_with () {return __get__ (this, function (self, category, macros, environments, specials, create_class) {
		if (typeof category == 'undefined' || (category != null && category.hasOwnProperty ("__kwargtrans__"))) {;
			var category = null;
		};
		if (typeof macros == 'undefined' || (macros != null && macros.hasOwnProperty ("__kwargtrans__"))) {;
			var macros = null;
		};
		if (typeof environments == 'undefined' || (environments != null && environments.hasOwnProperty ("__kwargtrans__"))) {;
			var environments = null;
		};
		if (typeof specials == 'undefined' || (specials != null && specials.hasOwnProperty ("__kwargtrans__"))) {;
			var specials = null;
		};
		if (typeof create_class == 'undefined' || (create_class != null && create_class.hasOwnProperty ("__kwargtrans__"))) {;
			var create_class = null;
		};
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'category': var category = __allkwargs0__ [__attrib0__]; break;
						case 'macros': var macros = __allkwargs0__ [__attrib0__]; break;
						case 'environments': var environments = __allkwargs0__ [__attrib0__]; break;
						case 'specials': var specials = __allkwargs0__ [__attrib0__]; break;
						case 'create_class': var create_class = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		if (__t__ (__in__ (category, self.category_list))) {
			var __except0__ = ValueError;
			__except0__.__cause__ = null;
			throw __except0__;
		}
		if (__t__ (!__t__ ((self.frozen)))) {
			var __except0__ = __call__ (RuntimeError, null, "You can only call extended_with() on frozen objects, because extended objects keep references to the original objects' data");
			__except0__.__cause__ = null;
			throw __except0__;
		}
		if (__t__ (create_class === null)) {
			var create_class = self.__class__;
		}
		var new_context = __call__ (create_class, null);
		new_context.unknown_macro_spec = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'unknown_macro_spec', self.unknown_macro_spec);
		}) ();
		new_context.unknown_environment_spec = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'unknown_environment_spec', self.unknown_environment_spec);
		}) ();
		new_context.unknown_specials_spec = (function () {
			var __accu0__ = kwargs;
			return __call__ (__accu0__.py_pop, __accu0__, 'unknown_specials_spec', self.unknown_specials_spec);
		}) ();
		if (__t__ (macros === null)) {
			var macros = [];
		}
		if (__t__ (environments === null)) {
			var environments = [];
		}
		if (__t__ (specials === null)) {
			var specials = [];
		}
		var new_category_dicts = dict ({'macros': __call__ (dict, null, (function () {
			var __accu0__ = [];
			var __iterable0__ = macros;
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var m = __getitem__ (__iterable0__, __index0__);
				(function () {
					var __accu1__ = __accu0__;
					return __call__ (__accu1__.append, __accu1__, tuple ([m.macroname, m]));
				}) ();
			}
			return __accu0__;
		}) ()), 'environments': __call__ (dict, null, (function () {
			var __accu0__ = [];
			var __iterable0__ = environments;
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var e = __getitem__ (__iterable0__, __index0__);
				(function () {
					var __accu1__ = __accu0__;
					return __call__ (__accu1__.append, __accu1__, tuple ([e.environmentname, e]));
				}) ();
			}
			return __accu0__;
		}) ()), 'specials': __call__ (dict, null, (function () {
			var __accu0__ = [];
			var __iterable0__ = specials;
			for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
				var s = __getitem__ (__iterable0__, __index0__);
				(function () {
					var __accu1__ = __accu0__;
					return __call__ (__accu1__.append, __accu1__, tuple ([s.specials_chars, s]));
				}) ();
			}
			return __accu0__;
		}) ())});
		new_context.category_list = __call__ (list, null, self.category_list);
		if (__t__ (__t__ (category === null) && __t__ (__gt__ (__call__ (len, null, self.category_list), 0)) && (function () {
			var __accu0__ = __getitem__ (self.category_list, 0);
			return __call__ (__accu0__.startswith, __accu0__, _autogen_category_prefix);
		}) ())) {
			var cat = __getitem__ (self.category_list, 0);
			var dd = __call__ (dict, null, self.d);
			var d_cat = __getitem__ (dd, cat);
			var d_cat = __call__ (dict, null, __kwargtrans__ ({macros: __call__ (dict, null, __getitem__ (d_cat, 'macros')), environments: __call__ (dict, null, __getitem__ (d_cat, 'environments')), specials: __call__ (dict, null, __getitem__ (d_cat, 'specials'))}));
			(function () {
				var __accu0__ = __getitem__ (d_cat, 'macros');
				return __call__ (__accu0__.py_update, __accu0__, __getitem__ (new_category_dicts, 'macros'));
			}) ();
			(function () {
				var __accu0__ = __getitem__ (d_cat, 'environments');
				return __call__ (__accu0__.py_update, __accu0__, __getitem__ (new_category_dicts, 'environments'));
			}) ();
			(function () {
				var __accu0__ = __getitem__ (d_cat, 'specials');
				return __call__ (__accu0__.py_update, __accu0__, __getitem__ (new_category_dicts, 'specials'));
			}) ();
			__setitem__ (dd, cat, d_cat);
			new_context.d = dd;
			new_context.lookup_chain_maps = dict ({'macros': (function () {
				var __accu0__ = _util;
				return __call__ (__accu0__.ChainMap, __accu0__, __getitem__ (d_cat, 'macros'), ...__getslice__ (__getitem__ (self.lookup_chain_maps, 'macros').maps, 1, null, 1));
			}) (), 'environments': (function () {
				var __accu0__ = _util;
				return __call__ (__accu0__.ChainMap, __accu0__, __getitem__ (d_cat, 'environments'), ...__getslice__ (__getitem__ (self.lookup_chain_maps, 'environments').maps, 1, null, 1));
			}) (), 'specials': (function () {
				var __accu0__ = _util;
				return __call__ (__accu0__.ChainMap, __accu0__, __getitem__ (d_cat, 'specials'), ...__getslice__ (__getitem__ (self.lookup_chain_maps, 'specials').maps, 1, null, 1));
			}) ()});
			new_context._autogen_category_counter = self._autogen_category_counter;
			new_context.frozen = true;
			// pass;
			return new_context;
		}
		if (__t__ (category === null)) {
			var __left0__ = (function () {
				var __accu0__ = self;
				return __call__ (__accu0__._get_new_autogen_category, __accu0__);
			}) ();
			var a = __left0__ [0];
			var category = __left0__ [1];
			new_context._autogen_category_counter = __add__ (a, 1);
		}
		else {
			new_context._autogen_category_counter = self._autogen_category_counter;
		}
		var dd = __call__ (dict, null, self.d);
		__setitem__ (dd, category, new_category_dicts);
		new_context.category_list = __add__ ([category], self.category_list);
		new_context.d = dd;
		new_context.lookup_chain_maps = dict ({'macros': (function () {
			var __accu0__ = __getitem__ (self.lookup_chain_maps, 'macros');
			return __call__ (__accu0__.new_child, __accu0__, __getitem__ (new_category_dicts, 'macros'));
		}) (), 'environments': (function () {
			var __accu0__ = __getitem__ (self.lookup_chain_maps, 'environments');
			return __call__ (__accu0__.new_child, __accu0__, __getitem__ (new_category_dicts, 'environments'));
		}) (), 'specials': (function () {
			var __accu0__ = __getitem__ (self.lookup_chain_maps, 'specials');
			return __call__ (__accu0__.new_child, __accu0__, __getitem__ (new_category_dicts, 'specials'));
		}) ()});
		new_context.frozen = true;
		// pass;
		return new_context;
	});}
});
export var ParsingStateDeltaExtendLatexContextDb =  __class__ ('ParsingStateDeltaExtendLatexContextDb', [ParsingStateDelta], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, extend_latex_context) {
		var kwargs = dict ();
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'extend_latex_context': var extend_latex_context = __allkwargs0__ [__attrib0__]; break;
						default: kwargs [__attrib0__] = __allkwargs0__ [__attrib0__];
					}
				}
				delete kwargs.__kwargtrans__;
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, ParsingStateDeltaExtendLatexContextDb, '__init__'), null, self, __kwargtrans__ (__mergekwargtrans__ ({_fields: tuple (['extend_latex_context', 'set_attributes'])}, kwargs)));
		self.extend_latex_context = extend_latex_context;
	});},
	get get_updated_parsing_state () {return __get__ (this, function (self, parsing_state, latex_walker) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
						case 'latex_walker': var latex_walker = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (self.extend_latex_context)) {
			if (__t__ (self.set_attributes)) {
				var set_attributes = self.set_attributes;
			}
			else {
				var set_attributes = dict ({});
			}
			var latex_context = (function () {
				var __accu0__ = parsing_state.latex_context;
				return __call__ (__accu0__.extended_with, __accu0__, __kwargtrans__ (__mergekwargtrans__ ({category: null}, self.extend_latex_context)));
			}) ();
			return (function () {
				var __accu0__ = parsing_state;
				return __call__ (__accu0__.sub_context, __accu0__, __kwargtrans__ (__mergekwargtrans__ ({latex_context: latex_context}, set_attributes)));
			}) ();
		}
		else if (__t__ (self.set_attributes)) {
			return (function () {
				var __accu0__ = parsing_state;
				return __call__ (__accu0__.sub_context, __accu0__, __kwargtrans__ (self.set_attributes));
			}) ();
		}
		return parsing_state;
	});}
});

