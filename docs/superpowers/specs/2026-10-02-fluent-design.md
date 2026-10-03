# Fluent — design

2026-10-02. Product Space UIUC hackathon ("Hack to the Future"). Deadline Sat 2026-10-03, 5:15 PM CDT: Devpost write-up + 2-minute demo video.

## Problem

People who cannot read a form's language (immigrants, international students, patients) cannot fill it out reliably. Hackathon prompt: take a product meaningful groups struggle to use and substantially expand who can use it.

## What Fluent does

A Chrome extension. On any web form it:

1. Shows a translation under every label, option and instruction, keeping the official text visible.
2. Talks the user through the form in their language, one question at a time, and fills the fields from their spoken or typed answers. One answer can fill several fields.
3. Makes the user type sensitive values (SSN, passport, licence, card and account numbers, passwords, member IDs) and long free-text answers. Sensitive values never reach the model or the microphone.
4. Never submits the form; it ends by asking the user to review and submit.

## Scope

- **In:** HTML web forms, voice + translation.
- **Stretch:** fillable PDFs through a bundled pdf.js viewer with form rendering on (PDF fields become HTML inputs, so the same pipeline applies).
- **Cut:** scanned PDFs / OCR.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Voice | Chrome Web Speech API, turn-based | Free, no setup, many languages. Audio goes to Google, one more reason sensitive fields are typed. |
| AI | Any OpenAI-compatible endpoint; default LM Studio `http://localhost:1234/v1` | User requirement. |
| Default model | `google/gemma-4-e4b` with `reasoning_effort: "none"` | Measured: 0.4–2.6 s per turn with correct tool calls in Spanish and Hindi. With thinking on, turns take 14–30 s. |
| Agent shape | Code owns question order and privacy rules; model translates and interprets | Reliable on small local models. |
| Build | Plain ES modules, no build step | Load unpacked, fastest iteration. |

## Architecture

```
extension/
  manifest.json, background.js     MV3; icon click opens the side panel
  content/  scan.js overlay.js fill.js content.js   injected on demand, classic scripts sharing window.__fluent
  panel/    panel.html/.css/.js    transcript, mic, text box, language picker, settings
            permission.html/.js    one-time mic grant (side panels cannot show the prompt)
  lib/      llm.js agent.js sensitive.js speech.js prompts.js
demo/intake.html                   realistic English patient-intake form
tests/                             node --test for lib/, harness.html for content scripts in a real browser
```

- **scan** → `Field[]` `{id, kind, label, options[], required, placeholder, helpText, name, autocomplete, maxLength, value}` plus surrounding texts. Radios become one field per group. Ids are stable `data-fluent-id` attributes.
- **sensitive.classify(field)** → `{sensitive, long}` from input type, `autocomplete`, and label/name/id patterns.
- **llm** → `chat`, `chatJson`, `listModels`. Drops optional parameters a server rejects with HTTP 400 (`reasoning_effort`, `response_format`).
- **agent** → translate in chunks of 10 fields in the background; ask the next unfilled field; per turn one model call with three tools: `fill_fields`, `skip_field`, `ask_user`. Reads back what it wrote, in the user's language.
- **overlay** → badges under labels, translated option text, highlight on the current field, show/hide toggle.
- **fill** → native value setter + `input`/`change`/`blur` events; option matching for selects and radios; date normalisation.

## Data flow

Start → inject content scripts → scan → classify → greet → (background: translate chunks, apply badges) → loop: highlight field → speak question → listen → model tool calls → fill → read back → next. Typed fields: focus the field, mic and panel text box off for sensitive ones, user presses Continue.

## Errors

- Endpoint unreachable: checked before touching the page; clear message, form untouched.
- Mic denied or unsupported: typing in the panel always works.
- Unknown field id or invalid option from the model: ignored, question repeated.
- Form changes (multi-step): content script reports a change in control count, agent rescans and keeps what is done.

## Not yet verified by a person

- Speech recognition inside the side panel after the one-time permission tab. Fallback: run recognition in the content script.
- Behaviour on real third-party forms (React-controlled inputs, custom dropdowns that are not `<select>`).
