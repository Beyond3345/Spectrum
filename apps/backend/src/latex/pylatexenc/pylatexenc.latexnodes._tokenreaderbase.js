var logging = {};
import {AssertionError, AttributeError, BaseException, DeprecationWarning, Exception, IndexError, IterableError, KeyError, NotImplementedError, RuntimeWarning, StopIteration, UserWarning, ValueError, Warning, __JsIterator__, __PyIterator__, __Terminal__, __add__, __and__, __call__, __class__, __envir__, __eq__, __floordiv__, __ge__, __get__, __getcm__, __getitem__, __getslice__, __getsm__, __gt__, __i__, __iadd__, __iand__, __idiv__, __ijsmod__, __ilshift__, __imatmul__, __imod__, __imul__, __in__, __init__, __ior__, __ipow__, __irshift__, __isub__, __ixor__, __jsUsePyNext__, __jsmod__, __k__, __kwargtrans__, __le__, __lshift__, __lt__, __matmul__, __mergefields__, __mergekwargtrans__, __mod__, __mul__, __ne__, __neg__, __nest__, __or__, __pow__, __pragma__, __pyUseJsNext__, __rshift__, __setitem__, __setproperty__, __setslice__, __sort__, __specialattrib__, __sub__, __super__, __t__, __terminal__, __truediv__, __withblock__, __xor__, _copy, _sort, abs, all, any, assert, bin, bool, bytearray, bytes, callable, chr, delattr, dict, dir, divmod, enumerate, filter, float, format, getattr, hasattr, hex, input, int, isinstance, issubclass, len, list, map, max, min, object, oct, ord, pow, print, property, py_TypeError, py_iter, py_metatype, py_next, py_reversed, py_typeof, range, repr, round, set, setattr, sorted, str, sum, tuple, zip} from './org.transcrypt.__runtime__.js';
import {LatexToken} from './pylatexenc.latexnodes._token.js';
import {LatexWalkerEndOfStream} from './pylatexenc.latexnodes._exctypes.js';
import * as __module_logging__ from './logging.js';
__nest__ (logging, '', __module_logging__);
export {LatexWalkerEndOfStream, LatexToken};
var __name__ = 'pylatexenc.latexnodes._tokenreaderbase';
export var logger = (function () {
	var __accu0__ = logging;
	return __call__ (__accu0__.getLogger, __accu0__, __name__);
}) ();
export var LatexTokenReaderBase =  __class__ ('LatexTokenReaderBase', [object], {
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
		__call__ (__call__ (__super__, null, LatexTokenReaderBase, '__init__'), null, self, __kwargtrans__ (kwargs));
	});},
	get make_token () {return __get__ (this, function (self) {
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
		return __call__ (LatexToken, null, __kwargtrans__ (kwargs));
	});},
	get move_to_token () {return __get__ (this, function (self, tok, rewind_pre_space) {
		if (typeof rewind_pre_space == 'undefined' || (rewind_pre_space != null && rewind_pre_space.hasOwnProperty ("__kwargtrans__"))) {;
			var rewind_pre_space = true;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'tok': var tok = __allkwargs0__ [__attrib0__]; break;
						case 'rewind_pre_space': var rewind_pre_space = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __except0__ = __call__ (RuntimeError, null, 'LatexTokenReaderBase subclasses must reimplement rewind_to_token()');
		__except0__.__cause__ = null;
		throw __except0__;
	});},
	get move_past_token () {return __get__ (this, function (self, tok, fastforward_post_space) {
		if (typeof fastforward_post_space == 'undefined' || (fastforward_post_space != null && fastforward_post_space.hasOwnProperty ("__kwargtrans__"))) {;
			var fastforward_post_space = true;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'tok': var tok = __allkwargs0__ [__attrib0__]; break;
						case 'fastforward_post_space': var fastforward_post_space = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __except0__ = __call__ (RuntimeError, null, 'LatexTokenReaderBase subclasses must reimplement move_past_token()');
		__except0__.__cause__ = null;
		throw __except0__;
	});},
	get peek_token () {return __get__ (this, function (self, parsing_state) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __except0__ = __call__ (RuntimeError, null, 'LatexTokenReaderBase subclasses must reimplement peek_token()');
		__except0__.__cause__ = null;
		throw __except0__;
	});},
	get peek_token_or_none () {return __get__ (this, function (self, parsing_state) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		try {
			return (function () {
				var __accu0__ = self;
				return __call__ (__accu0__.peek_token, __accu0__, __kwargtrans__ ({parsing_state: parsing_state}));
			}) ();
		}
		catch (__except0__) {
			if (isinstance (__except0__, LatexWalkerEndOfStream)) {
				return null;
			}
			else {
				throw __except0__;
			}
		}
	});},
	get next_token () {return __get__ (this, function (self, parsing_state) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var tok = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.peek_token, __accu0__, __kwargtrans__ ({parsing_state: parsing_state}));
		}) ();
		(function () {
			var __accu0__ = self;
			return __call__ (__accu0__.move_past_token, __accu0__, tok);
		}) ();
		return tok;
	});},
	get cur_pos () {return __get__ (this, function (self) {
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
		var __except0__ = __call__ (RuntimeError, null, 'LatexTokenReaderBase subclasses must reimplement cur_pos()');
		__except0__.__cause__ = null;
		throw __except0__;
	});},
	get peek_space_chars () {return __get__ (this, function (self, parsing_state) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __except0__ = __call__ (RuntimeError, null, 'This token reader does not support character-level access');
		__except0__.__cause__ = null;
		throw __except0__;
	});},
	get skip_space_chars () {return __get__ (this, function (self, parsing_state) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __except0__ = __call__ (RuntimeError, null, 'This token reader does not support character-level access');
		__except0__.__cause__ = null;
		throw __except0__;
	});},
	get peek_chars () {return __get__ (this, function (self, num_chars, parsing_state) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'num_chars': var num_chars = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __except0__ = __call__ (RuntimeError, null, 'This token reader does not support character-level access');
		__except0__.__cause__ = null;
		throw __except0__;
	});},
	get next_chars () {return __get__ (this, function (self, num_chars, parsing_state) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'num_chars': var num_chars = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __except0__ = __call__ (RuntimeError, null, 'This token reader does not support character-level access');
		__except0__.__cause__ = null;
		throw __except0__;
	});},
	get move_to_pos_chars () {return __get__ (this, function (self, pos) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'pos': var pos = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var __except0__ = __call__ (RuntimeError, null, 'This token reader does not support character-level access');
		__except0__.__cause__ = null;
		throw __except0__;
	});}
});
export var LatexTokenListTokenReader =  __class__ ('LatexTokenListTokenReader', [LatexTokenReaderBase], {
	__module__: __name__,
	get __init__ () {return __get__ (this, function (self, token_list) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'token_list': var token_list = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		__call__ (__call__ (__super__, null, LatexTokenListTokenReader, '__init__'), null, self);
		self.token_list = token_list;
		self._idx = 0;
	});},
	get peek_token () {return __get__ (this, function (self, parsing_state) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		if (__t__ (__ge__ (self._idx, __call__ (len, null, self.token_list)))) {
			var __except0__ = __call__ (LatexWalkerEndOfStream, null);
			__except0__.__cause__ = null;
			throw __except0__;
		}
		return __getitem__ (self.token_list, self._idx);
	});},
	get next_token () {return __get__ (this, function (self, parsing_state) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'parsing_state': var parsing_state = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		var tok = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__.peek_token, __accu0__, parsing_state);
		}) ();
		self._idx = __call__ (__iadd__, null, self._idx, 1);
		return tok;
	});},
	get _find_tok_idx () {return __get__ (this, function (self, tok, methname) {
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'tok': var tok = __allkwargs0__ [__attrib0__]; break;
						case 'methname': var methname = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		try {
			var i = __call__ (py_next, null, (function () {
				var __accu0__ = [];
				var __iterable0__ = __call__ (enumerate, null, self.token_list);
				for (var __index0__ = 0; __index0__ < len (__iterable0__); __index0__++) {
					var __left0__ = __getitem__ (__iterable0__, __index0__);
					var j = __left0__ [0];
					var t = __left0__ [1];
					if (__t__ (t === tok)) {
						(function () {
							var __accu1__ = __accu0__;
							return __call__ (__accu1__.append, __accu1__, j);
						}) ();
					}
				}
				return py_iter (__accu0__);
			}) ());
		}
		catch (__except0__) {
			if (isinstance (__except0__, StopIteration)) {
				var __except1__ = __call__ (IndexError, null, (function () {
					var __accu0__ = '{}({!r}): no such token in list';
					return __call__ (__accu0__.format, __accu0__, methname, tok);
				}) ());
				__except1__.__cause__ = null;
				throw __except1__;
			}
			else {
				throw __except0__;
			}
		}
		return i;
	});},
	get move_to_token () {return __get__ (this, function (self, tok, rewind_pre_space) {
		if (typeof rewind_pre_space == 'undefined' || (rewind_pre_space != null && rewind_pre_space.hasOwnProperty ("__kwargtrans__"))) {;
			var rewind_pre_space = true;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'tok': var tok = __allkwargs0__ [__attrib0__]; break;
						case 'rewind_pre_space': var rewind_pre_space = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		self._idx = (function () {
			var __accu0__ = self;
			return __call__ (__accu0__._find_tok_idx, __accu0__, tok, 'move_to_token');
		}) ();
	});},
	get move_past_token () {return __get__ (this, function (self, tok, fastforward_post_space) {
		if (typeof fastforward_post_space == 'undefined' || (fastforward_post_space != null && fastforward_post_space.hasOwnProperty ("__kwargtrans__"))) {;
			var fastforward_post_space = true;
		};
		if (arguments.length) {
			var __ilastarg0__ = arguments.length - 1;
			if (arguments [__ilastarg0__] && arguments [__ilastarg0__].hasOwnProperty ("__kwargtrans__")) {
				var __allkwargs0__ = arguments [__ilastarg0__--];
				for (var __attrib0__ in __allkwargs0__) {
					switch (__attrib0__) {
						case 'self': var self = __allkwargs0__ [__attrib0__]; break;
						case 'tok': var tok = __allkwargs0__ [__attrib0__]; break;
						case 'fastforward_post_space': var fastforward_post_space = __allkwargs0__ [__attrib0__]; break;
					}
				}
			}
		}
		else {
		}
		self._idx = __add__ ((function () {
			var __accu0__ = self;
			return __call__ (__accu0__._find_tok_idx, __accu0__, tok, 'move_past_token');
		}) (), 1);
	});},
	get cur_pos () {return __get__ (this, function (self) {
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
		if (__t__ (__ge__ (self._idx, __call__ (len, null, self.token_list)))) {
			if (__t__ (__eq__ (__call__ (len, null, self.token_list), 0))) {
				return null;
			}
			return (function () {
				var __accu0__ = self;
				return __call__ (__accu0__.final_pos, __accu0__);
			}) ();
		}
		return __getitem__ (self.token_list, self._idx).pos;
	});},
	get final_pos () {return __get__ (this, function (self) {
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
		return __getitem__ (self.token_list, __sub__ (__call__ (len, null, self.token_list), 1)).pos_end;
	});}
});

