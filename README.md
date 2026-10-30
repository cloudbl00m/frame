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
