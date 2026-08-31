

# PNG2ANSI-web

An offline, single-file browser port of the classic CP437/16-colour
[pyANSI](https://github.com/techrote/pyANSI) reference converter. The tracked
`PNG2ANSI-web.html` is the downloadable application: open it directly, choose
an image, tune the fit, and download ANSI, PNG preview, or JSON profile files.

The application makes no network requests. Images, ANSI references, profiles,
workers, rendering, and downloads stay inside the browser process.

## Use the app

1. Download `PNG2ANSI-web.html`.
2. Open it in a current Windows Terminal-era browser (Edge, Chrome, or Firefox).
3. Choose or drop a source image, or select **Load sample** to try the embedded
   cyberpunk machinery panel without an additional file.
4. Select `photographic` for direct colour fitting or `industrial` for sparse,
   structural texture.
5. Download the `.ans` and its `.ans.png` preview.

Start with the [quickstart tuning guide](QUICKSTART.md), then use the complete
[parameter reference](PARAMETERS.md) for defaults, ranges, processing stages,
visual effects, costs, and interactions. The same quickstart is embedded in the
artifact's offline Help section.

The default canvas is 80×40. Output consists only of CP437 cell bytes and
classic SGR colour sequences for the Windows Terminal 16-colour palette. It
does not append SAUCE or any visible metadata/footer.

The compact interface includes five presentation themes inspired by modern
ANSI art: `industrial-chase`, `magical-forest`, `spectral-gremlin`,
`cyber-fab`, and a monochrome `basic-bios` layout. The selected theme is saved
locally and never changes conversion output or portable profiles.

## Local references

Add one or more `.ans` files in **Glyph vocabulary**. Their frequency-ordered
union replaces the built-in vocabulary. A matching `.png` selected in the same
batch becomes a labelled visual card only; it never affects fitting. No URL
loading is available.

## Shared profiles

Profile JSON uses schema version 2 and the same key names, defaults, validation
ranges, Derez/NL settings, and five vocabulary IDs as pyANSI. Version 1 files
migrate automatically without changing old explicit values. Import a profile
from the console or export the current effective values. The canonical schema
is `png2ansi.schema.json`.

Photographic fitting defaults to 6 foreground and 5 background candidates.
Inputs commit transactionally, foreground is limited to 12, and background is
limited to the eight legal classic colours. Each cell shortlists 32 glyphs and
the UI initially blocks estimated work above 125,000,000 units before starting
a worker. The browser-only **Max work units** field can raise or lower that
ceiling. **GO / OVERRIDE** bypasses it for one conversion and may make the tab
unresponsive for a long-running fit; edits made afterward return to the normal
protected workflow. Neither control is written to shared JSON profiles.

## Develop

Only files below `src/` are edited manually. The build embeds the modular core,
worker, UI, CSS, CP437 tables, presets, and licensed font into the root HTML.

```powershell
npm run build
npm test
```

`npm test` checks the shared configuration contract, classic ANSI byte format,
reference unions, nonlinear-filter fixtures, workload limits, offline
constraints, and whether the tracked artifact is stale. It has no package
dependencies and requires only Node.js.

## Architecture

- `src/core.js` — profile contract, CP437 vocabularies, preprocessing, fitting,
  ANSI encoding, and preview rasterization.
- `src/worker.js` — cached mask worker with monotonically numbered jobs.
- `src/app.js` — debounced UI, stale-result rejection, local files, and downloads.
- `scripts/build.mjs` — deterministic single-file assembly and integrity check.
- `PNG2ANSI-web.html` — first-class offline release artifact.

The font is DejaVu Sans Mono; its separate license is included in `assets/`.
Application code is MIT licensed.

Conversions are replaceable jobs: changing a setting cancels the obsolete
worker immediately, coalesces further changes for 240 ms, and runs only the
latest configuration. This keeps rapid slider edits from building a queue of
CPU-heavy conversions.
