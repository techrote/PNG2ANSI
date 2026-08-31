# Reference and browser parity

PNG2ANSI-web follows pyANSI schema version 1 and emits the same output class:
one CP437 byte per cell, classic 16-colour SGR, no line breaks, a final reset,
and no SAUCE record.

The implementations share these deterministic inputs:

- Windows Terminal's 16-colour palette;
- five built-in vocabularies and frequency-ordered reference union rules;
- 80×40, 8×16 cell, 4×8 sampling, and 14 px font defaults;
- photographic and industrial parameter values;
- bundled DejaVu Sans Mono font bytes.

Browser canvas rasterization and image resampling are platform APIs, whereas
the reference uses Pillow. A byte-for-byte fixture is therefore meaningful
only when browser and Pillow glyph/sample pixels coincide. Contract tests are
exact for configuration, vocabulary order, CP437 cells, colour escapes, and
metadata exclusion. Preview acceptance permits per-channel antialiasing
differences at glyph boundaries; structural output and canvas dimensions must
still match.

This distinction is deliberate and documented rather than hiding renderer
differences behind a claimed exact hash.
