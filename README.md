# Fluent

Fill out any web form in your own language. Fluent translates the form in place and a voice assistant asks one question at a time, then fills the fields for you. Sensitive fields (SSN, passport, card numbers) are always typed by you and never sent to the AI.

## Run it

1. **LM Studio:** start the local server (Developer tab → Start Server) with `google/gemma-4-e4b` loaded. Default endpoint: `http://localhost:1234/v1`.
2. **Load the extension:** `chrome://extensions` → Developer mode → Load unpacked → pick the `extension/` folder.
3. **Demo form:** `npm run demo`, then open <http://localhost:8765/demo/intake.html>.
4. Click the Fluent icon to open the side panel, pick a language, press the start button.
5. Voice is hands-free: the assistant speaks, then listens. The first time, tap the microphone; a tab opens asking for permission. Allow it, then tap the mic again. Tap the mic while it is talking to interrupt.

If the microphone does not work, the panel shows a yellow note with the reason and an error code (for example `not-allowed` or `network`). On a Mac, Chrome also needs microphone access in System Settings → Privacy & Security → Microphone.

Private fields (SSN, passport, card numbers) are typed in the chat box, which shows dots; the value goes straight into the form and never to the AI. Settings → "Talk over the assistant" controls whether speaking interrupts it (use headphones; tap the microphone to mute).

### PDF forms (Spanish W-2 demo, USCIS forms)

Fillable PDFs open in Fluent's own viewer, because Chrome's built-in PDF viewer cannot be scripted.

1. `npm run demo`, then open <http://localhost:8765/fw2_es.pdf> (the Spanish W-2 in the repo root).
2. Open the Fluent panel, pick **English**, press the start button. The tab switches to the Fluent viewer on the first fillable page (page 3), labels turn into English, and the assistant starts asking.
3. **Download filled PDF** saves a copy with your answers in it.

For a PDF on disk, drop it onto the viewer tab or use **Open PDF** (or turn on "Allow access to file URLs" for Fluent in `chrome://extensions` and open the `file://` link directly). Scanned PDFs without real form fields are not supported.

Any OpenAI-compatible endpoint works: open ⚙ in the panel and change the URL, model and API key.

## Test

```
npm test                 # unit tests for extension/lib
npm run demo             # serve the repo, then:
node tests/run-harness.mjs  # page-side scripts against the demo form in headless Chrome

# with LM Studio running (these call the real model):
node tests/run-harness.mjs "http://127.0.0.1:8765/tests/e2e.html"            # Spanish speaker, English web form
node tests/run-harness.mjs "http://127.0.0.1:8765/tests/e2e.html?case=w2"    # English speaker, Spanish W-2 PDF
node tests/run-harness.mjs "http://127.0.0.1:8765/extension/pdf/viewer.html?file=/fw2_es.pdf" shot.png @tests/pdf-check.js
```

`tests/panel-sim.html` runs the real side panel next to a form in an ordinary tab (chrome.* stubbed). It is a test page only. For the real Chrome extension, open `http://localhost:8765/demo/intake.html` directly; opening the simulator alongside the extension shows two panels, and the extension cannot scan the form inside the simulator's iframe.

## Layout

- `extension/content/` — runs in the web page: find fields, show translations, fill values.
- `extension/lib/` — AI client, conversation logic, privacy rules, speech.
- `extension/panel/` — the side panel UI.
- `extension/pdf/` — PDF viewer (pdf.js, vendored in `lib/`) and position-based label matching.
- `docs/superpowers/specs/` — design.

**Picking this project up?** Start with `docs/HANDOFF.md`.
