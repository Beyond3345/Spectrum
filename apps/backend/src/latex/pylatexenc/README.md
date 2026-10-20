# Generated pylatexenc runtime

Upstream: https://github.com/phfaist/pylatexenc/tree/316f9c00814da019ec24d3b06e9866f3be94258d

Generated from pylatexenc 3.0b2 with its pinned Transcrypt 3.9.3 build. The modules stay separate because ordinary bundling breaks their circular imports. Adapted for Spectrum on 20 October 2026. Source-line annotations, generation timestamps and unused source-map links are removed; logging imports a bundled browser build of debug 4.4.3 without browser storage. Spectrum's entry point supplies the documented default contexts, plain text styles, TeX logos and link labels.

Rebuild with node scripts/build-pylatexenc.mjs /path/to/the/pinned/checkout. Build dependencies need uv and Python 3.10 or later. End users and ordinary app builds do not need Python. Do not edit the generated modules; edit the entry point or update the pinned upstream revision and run its tests.

The runtime is isolated in a worker because Transcrypt extends JavaScript built-in prototypes. Conversion does not enable file input. Licences are in licences/.
