# Fluent

Fill out any web form in your own language. Fluent translates the form in place and a voice assistant asks one question at a time, then fills the fields for you. Sensitive fields (SSN, passport, card numbers) are always typed by you and never sent to the AI.

## Run it

1. **LM Studio:** start the local server (Developer tab → Start Server) with `google/gemma-4-e4b` loaded. Default endpoint: `http://localhost:1234/v1`.
2. **Load the extension:** `chrome://extensions` → Developer mode → Load unpacked → pick the `extension/` folder.
3. **Demo form:** `npm run demo`, then open <http://localhost:8765/demo/intake.html>.
4. Click the Fluent icon to open the side panel, pick a language, press the start button.
5. First time you tap the microphone, a tab opens asking for permission. Allow it, then tap the mic again.

Any OpenAI-compatible endpoint works: open ⚙ in the panel and change the URL, model and API key.

## Test

```
npm test                 # unit tests for extension/lib
npm run demo             # serve the repo, then:
node tests/run-harness.mjs  # page-side scripts against the demo form in headless Chrome
```

## Layout

- `extension/content/` — runs in the web page: find fields, show translations, fill values.
- `extension/lib/` — AI client, conversation logic, privacy rules, speech.
- `extension/panel/` — the side panel UI.
- `docs/superpowers/specs/` — design.
