# Edge Neural Conversational Speech Engine Implementation Plan

> **Goal:** Upgrade Fluent from robotic browser `speechSynthesis` to natural, warm, human-like neural speech (similar to Gemini Live) powered by Microsoft Edge Neural Voices via the demo server, with zero external API keys.

---

### Proposed Changes

#### Server
- [tools/demo-server-lib.mjs](file:///Users/prathambansal/Dev/Fluent/tools/demo-server-lib.mjs)
  - Add route `POST /audio/speech` matching OpenAI audio speech standard format.
  - Spawns `uvx edge-tts --voice <voice> --text <input> --write-media -` and streams MP3 output with `audio/mpeg` header.
  - Adds LRU/in-memory buffer cache for repeated short phrases (instant 0ms response).
- [tests/server.test.js](file:///Users/prathambansal/Dev/Fluent/tests/server.test.js)
  - Add integration tests verifying `/audio/speech` returns 200 with `audio/mpeg` content.

#### Audio Engine & Language Routing
- [extension/lib/neural-tts.js](file:///Users/prathambansal/Dev/Fluent/extension/lib/neural-tts.js)
  - Export `pickNeuralVoice(lang)` with top conversational neural voices for all 12 Fluent languages (`es` -> `es-US-PalomaNeural`, `en` -> `en-US-AvaMultilingualNeural`, etc.).
  - Update `createNeuralTts` to dynamically pick voice per sentence based on `lang`, and support local endpoints without requiring an OpenAI key or `api.openai.com`.
- [tests/speech.test.js](file:///Users/prathambansal/Dev/Fluent/tests/speech.test.js)
  - Add unit tests for `pickNeuralVoice(lang)` and language-specific dynamic voice dispatch.

#### Side Panel
- [extension/panel/panel.js](file:///Users/prathambansal/Dev/Fluent/extension/panel/panel.js)
  - Update `applyVoice()` to detect if the local demo server `/audio/speech` endpoint is available and auto-enable neural speech.
  - Keep seamless fallback to browser `speechSynthesis` if offline.

---

### Verification Plan
1. **Automated Unit Tests**:
   - `npm test` across all 23 suites (target: 160+ passing tests).
2. **Endpoint Verification**:
   - `curl -s -X POST http://127.0.0.1:8765/audio/speech -H "Content-Type: application/json" -d '{"input": "Hola", "voice": "es-US-PalomaNeural"}' | head -c 20` -> verify audio bytes.
3. **Live Browser Verification**:
   - Using Puppeteer on `http://127.0.0.1:8765/demo/app/?lang=es&speak=1&live=0`.
   - Verify `speech.neural` is active and audio elements play smoothly during agent turns.
