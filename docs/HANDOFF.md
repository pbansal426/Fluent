# Fluent 2.0 — Executive Handoff Document

> **Date:** October 16, 2026  
> **Repository:** `/Users/prathambansal/Dev/Fluent` on branch `main`  
> **Remote:** `https://github.com/pbansal426/Fluent.git` (All commits pushed, working tree 100% clean)  
> **Test Suite Status:** **162 / 162 unit tests passing** (`npm test`) across 23 test suites.  
> **Live Server:** `http://127.0.0.1:8765/demo/app/` (Active on demo server)  
> **Active AI Model:** `google/gemma-4-26b-a4b-qat` on local LM Studio (`http://localhost:1234/v1`) — **Zero external API keys used**.

---

## 1. Accomplishments & Architecture State

1. **Local Balanced Model (`google/gemma-4-26b-a4b-qat`)**:
   - Upgraded away from `e4b` to `26b-qat` across `extension/panel/panel.js`, `demo/app/index.html`, and `tools/run-corpus.mjs`.
   - Measured turn latency: **~2.8s** with zero hallucinations or tool-calling loops (20/20 corpus tests passing).
2. **Edge Neural Conversational Speech Engine**:
   - Added `POST /audio/speech` streaming endpoint to [tools/demo-server-lib.mjs](file:///Users/prathambansal/Dev/Fluent/tools/demo-server-lib.mjs).
   - Zero-key Microsoft Edge Neural Voices:
     - Spanish: `es-US-PalomaNeural` (warm, natural, clinical).
     - English: `en-US-AvaMultilingualNeural` (conversational, expressive, caring).
     - All 12 languages dynamically mapped via `pickNeuralVoice(lang)` in [extension/lib/neural-tts.js](file:///Users/prathambansal/Dev/Fluent/extension/lib/neural-tts.js).
   - Sentence-by-sentence background prefetching (< 700ms latency, seamless sentence chaining).
3. **In-Bubble Interactive MCQs & Clinical UI**:
   - Rendered interactive touch/click chips inside assistant message bubbles for dropdowns, radios, and confirmations.
   - Clinical milestone progress bar with animated completion percentage.
   - Visual document location hint cards (e.g., Member ID).
4. **Typing-First Editing Flow**:
   - Tapping `[ ✎ Edit ]` on any field confirmation or in the bilingual review sheet triggers `startTypingEdit(item)`.
   - Audio is ducked/paused; `#text` input is pre-filled with the current value and text selected.
   - Direct submission via `state.agent.submitTypedEdit(fieldId, text)` bypasses LLM overhead and updates the form field instantly.

---

## 2. Identified Bugs & Immediate Next Tasks

### Bug 1: Spelled-Name Precedence ("Karen K a r a n" -> "Karan")
- **Symptom:** When the user said `"Karen K a r a n"`, the system filled `"Karen"` instead of `"Karan"`.
- **Root Cause:**
  - In [extension/lib/agent.js](file:///Users/prathambansal/Dev/Fluent/extension/lib/agent.js) and [extension/lib/metacognitive.js](file:///Users/prathambansal/Dev/Fluent/extension/lib/metacognitive.js), `normalizeSpelledWords` detects spelled letter sequences, but if the LLM emits `fill_fields` with the unspelled word from the first token (`Karen`), the agent accepted it without extracting the explicit spelled token (`K-a-r-a-n`).
- **Fix Needed:**
  - In `MetacognitiveResolver.assessSpelling` or `agent.js` pre-fill check: if the utterance contains an explicit spelled-out sequence matching the field (e.g. `/([a-z]\s+){2,}[a-z]/i` like `K a r a n`), the explicitly spelled string **MUST** override the spoken word.

### Bug 2: Microphone Reliability & Interruption (Talk-Over)
- **Symptom:** The user noted that the assistant should be interruptable, but the microphone isn't turning on reliably or hands-free.
- **Root Cause:**
  1. In [extension/panel/panel.js](file:///Users/prathambansal/Dev/Fluent/extension/panel/panel.js#L26), `const TALK_OVER = false;` is hardcoded to false because of earlier echo-cancellation issues on laptops.
  2. In `demo/app/index.html` and default settings, `live` defaults to `false` (opt-in) so the browser doesn't prompt for mic permission unasked. In `live: false`, the microphone only listens for a single turn when `#mic` is tapped.
- **Fix Needed:**
  - Default `live: true` when starting the session if mic permission is already granted, so the microphone automatically re-arms after the assistant speaks.
  - Re-enable `TALK_OVER = true` using `speech.duckSpeaking()` and the adaptive VAD energy gate in [extension/lib/live.js](file:///Users/prathambansal/Dev/Fluent/extension/lib/live.js) so speaking immediately interrupts the assistant.

---

## 3. How to Run & Verify
```bash
# 1. Ensure LM Studio server is running on localhost:1234 with google/gemma-4-26b-a4b-qat
curl -s http://localhost:1234/v1/models | jq .

# 2. Start local demo server (serves app on port 8765)
node tools/demo-server.mjs

# 3. Run unit tests (162 tests)
npm test

# 4. Rebuild site distribution after any edits
node tools/build-site.mjs

# 5. Open demo in browser
open http://127.0.0.1:8765/demo/app/
```
