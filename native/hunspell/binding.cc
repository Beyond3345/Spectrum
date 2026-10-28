// Spectrum's Hunspell binding (MIT, as Spectrum). Opens a dictionary from its paths, adds more
// word lists, spells a batch of words and suggests. Calls are synchronous: the spell worker's own
// thread makes them, one at a time. Paths are UTF-8; on Windows the caller gives them as \\?\ paths,
// which Hunspell opens as wide strings (csutil.cxx myopen).
#include <napi.h>
#include <hunspell.hxx>
#include <memory>
#include <string>
#include <vector>

namespace {

// A UTF-8 word as Latin-1 bytes; false when it has a character above U+00FF (or is not UTF-8).
bool toLatin1(const std::string& in, std::string& out) {
  out.clear();
  for (size_t i = 0; i < in.size(); i++) {
    unsigned char c = in[i];
    if (c < 0x80) out += static_cast<char>(c);
    else if ((c == 0xC2 || c == 0xC3) && i + 1 < in.size() && (static_cast<unsigned char>(in[i + 1]) & 0xC0) == 0x80) {
      out += static_cast<char>(((c & 0x03) << 6) | (static_cast<unsigned char>(in[++i]) & 0x3F));
    } else return false;
  }
  return true;
}

std::string fromLatin1(const std::string& in) {
  std::string out;
  for (unsigned char c : in) {
    if (c < 0x80) out += static_cast<char>(c);
    else {
      out += static_cast<char>(0xC0 | (c >> 6));
      out += static_cast<char>(0x80 | (c & 0x3F));
    }
  }
  return out;
}

class Speller : public Napi::ObjectWrap<Speller> {
 public:
  static Napi::Function Define(Napi::Env env) {
    return DefineClass(env, "Speller", {
      InstanceMethod("addDic", &Speller::AddDic),
      InstanceMethod("spell", &Speller::Spell),
      InstanceMethod("suggest", &Speller::Suggest),
      InstanceMethod("encoding", &Speller::Encoding),
      StaticMethod("version", &Speller::Version),
    });
  }

  explicit Speller(const Napi::CallbackInfo& info) : Napi::ObjectWrap<Speller>(info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {
      Napi::TypeError::New(env, "new Speller(affPath, dicPath)").ThrowAsJavaScriptException();
      return;
    }
    std::string aff = info[0].As<Napi::String>(), dic = info[1].As<Napi::String>();
    hunspell_ = std::make_unique<Hunspell>(aff.c_str(), dic.c_str());
    const std::string encoding = hunspell_->get_dict_encoding();
    if (encoding == "ISO8859-1") latin1_ = true;
    else if (encoding != "UTF-8") {
      hunspell_.reset();
      Napi::Error::New(env, "Unsupported dictionary encoding " + encoding).ThrowAsJavaScriptException();
    }
  }

 private:
  bool Ready(const Napi::CallbackInfo& info) {
    if (hunspell_) return true;
    Napi::Error::New(info.Env(), "This speller did not open").ThrowAsJavaScriptException();
    return false;
  }

  Napi::Value AddDic(const Napi::CallbackInfo& info) {
    if (!Ready(info)) return info.Env().Undefined();
    if (info.Length() < 1 || !info[0].IsString()) {
      Napi::TypeError::New(info.Env(), "addDic(dicPath)").ThrowAsJavaScriptException();
      return info.Env().Undefined();
    }
    std::string dic = info[0].As<Napi::String>();
    hunspell_->add_dic(dic.c_str());
    return info.Env().Undefined();
  }

  Napi::Value Spell(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!Ready(info)) return env.Undefined();
    if (info.Length() < 1 || !info[0].IsArray()) {
      Napi::TypeError::New(env, "spell(words)").ThrowAsJavaScriptException();
      return env.Undefined();
    }
    Napi::Array words = info[0].As<Napi::Array>();
    Napi::Array out = Napi::Array::New(env, words.Length());
    std::string latin;
    for (uint32_t i = 0; i < words.Length(); i++) {
      Napi::Value word = words.Get(i);
      bool ok = false;
      if (word.IsString()) {
        std::string w = word.As<Napi::String>();
        if (!latin1_) ok = hunspell_->spell(w);
        else if (toLatin1(w, latin)) ok = hunspell_->spell(latin);
      }
      out.Set(i, Napi::Boolean::New(env, ok));
    }
    return out;
  }

  Napi::Value Suggest(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!Ready(info)) return env.Undefined();
    if (info.Length() < 1 || !info[0].IsString()) {
      Napi::TypeError::New(env, "suggest(word)").ThrowAsJavaScriptException();
      return env.Undefined();
    }
    std::string w = info[0].As<Napi::String>(), latin;
    std::vector<std::string> found;
    if (!latin1_) found = hunspell_->suggest(w);
    else if (toLatin1(w, latin)) found = hunspell_->suggest(latin);
    Napi::Array out = Napi::Array::New(env, found.size());
    for (size_t i = 0; i < found.size(); i++) out.Set(i, Napi::String::New(env, latin1_ ? fromLatin1(found[i]) : found[i]));
    return out;
  }

  Napi::Value Encoding(const Napi::CallbackInfo& info) {
    if (!Ready(info)) return info.Env().Undefined();
    return Napi::String::New(info.Env(), hunspell_->get_dict_encoding());
  }

  static Napi::Value Version(const Napi::CallbackInfo& info) {
    return Napi::String::New(info.Env(), Hunspell::get_library_version());
  }

  std::unique_ptr<Hunspell> hunspell_;
  bool latin1_ = false;
};

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("Speller", Speller::Define(env));
  return exports;
}

}  // namespace

NODE_API_MODULE(hunspell, Init)
