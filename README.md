# Frame Studio

Complete source for the video editor, including the bundled media libraries and their licenses.

## Run locally

1. Install Node.js if it is not already installed.
2. Extract this ZIP.
3. Open a terminal in the extracted folder and run: node server.cjs
4. Open http://localhost:4173 in Chrome or Edge.

No npm install or build step is needed. Use the local server rather than double-clicking index.html, because export loads JavaScript modules.

## Contents

- dist/index.html: editor interface
- dist/style.css: styles
- dist/app.js: timeline, editing, preview and project saving
- dist/export-engine.mjs: timestamped video and audio export
- dist/vendor/: bundled libraries, license texts and attribution
- .openai/hosting.json: existing Sites hosting configuration
- server.cjs: local development server
- export-quality-tests.txt: verification results

## Projects and media

Imported footage and saved projects live in your browser's local storage/IndexedDB, not in the website source. They are not included in this ZIP. A project saved on the hosted site will not automatically appear on localhost.

Exports require browser codec support. The editor exports SDR; HDR sources need an SDR copy. The existing hosting configuration identifies your private hosted site; remove its project_id before registering an independent new Site.

## Mute a range and add sound

Open Audio edits above the timeline. Enter start and end times in seconds, enable Mute original sound if desired, and upload an audio file. Select its volume and optional sound in point, then click Add audio edit. Use Done to return to preview. Existing ranges can be updated or removed. Save project preserves the ranges and uploaded sound files in this browser. Ranges are attached to timeline times, not to individual clips.

## Export bundle

The complete export engine is bundled in dist/export-bundle.js to avoid relative dynamic-import errors in embedded browsers. Its editable source is dist/export-engine.mjs and dist/vendor/. No build step is required to run the included files.

After changing the engine source, rebuild it from this folder with:

npx --yes esbuild@0.28.2 dist/export-engine.mjs --bundle --format=iife --global-name=FrameExport --target=es2022 --minify --footer:js="globalThis.FrameExport=FrameExport;" --outfile=dist/export-bundle.js
