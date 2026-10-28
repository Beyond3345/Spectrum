{
  "targets": [
    {
      "target_name": "hunspell_core",
      "type": "static_library",
      "sources": [
        "core/src/hunspell/affentry.cxx",
        "core/src/hunspell/affixmgr.cxx",
        "core/src/hunspell/csutil.cxx",
        "core/src/hunspell/filemgr.cxx",
        "core/src/hunspell/hashmgr.cxx",
        "core/src/hunspell/hunspell.cxx",
        "core/src/hunspell/hunspelltrace.cxx",
        "core/src/hunspell/hunzip.cxx",
        "core/src/hunspell/phonet.cxx",
        "core/src/hunspell/replist.cxx",
        "core/src/hunspell/suggestmgr.cxx"
      ],
      "include_dirs": [ "core/src/hunspell" ],
      "defines": [ "HUNSPELL_STATIC" ],
      "direct_dependent_settings": {
        "include_dirs": [ "core/src/hunspell" ],
        "defines": [ "HUNSPELL_STATIC" ]
      },
      "cflags_cc": [ "-std=c++17" ],
      "xcode_settings": { "CLANG_CXX_LANGUAGE_STANDARD": "c++17" },
      "msvs_settings": { "VCCLCompilerTool": { "AdditionalOptions": [ "/std:c++17", "/utf-8" ] } }
    },
    {
      "target_name": "hunspell",
      "sources": [ "binding.cc" ],
      "include_dirs": [ "<!@(node -p \"require('node-addon-api').include\")" ],
      "dependencies": [ "<!(node -p \"require('node-addon-api').gyp\")", "hunspell_core" ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "cflags_cc": [ "-std=c++17" ],
      "xcode_settings": { "CLANG_CXX_LANGUAGE_STANDARD": "c++17" },
      "msvs_settings": { "VCCLCompilerTool": { "AdditionalOptions": [ "/std:c++17", "/utf-8" ] } }
    }
  ]
}
