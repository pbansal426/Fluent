# Model QA 2026-10-05: combined findings (Codex + Antigravity, `gemma-4-e4b`, 5 forms, ~58 typed turns each)

Sources: `2026-10-05-codex-model.md`, `2026-10-05-agy-model.md`. Both ran the same brief independently; items found by both are marked **(both)**.
Speech was not testable. Claims below marked *verified* were re-checked by Claude.

## Fixed already
- **Private number in ordinary chat was shown in the bubble and written to the dev log** (Codex #1). *Verified* in `logs/fluent.log`
  (synthetic SSNs, local only). Fixed in `panel.js` `sendText`: the bubble and the log now use `redactPrivate(text)`; the agent
  already redacted before the model. Regression checks added to `tests/panel-private.js` (11/11). Old log lines scrubbed.

## P0: wrong data silently written, or the user is stuck
| # | Finding | Evidence | Likely fix |
|---|---|---|---|
| 1 | I-765: current legal name goes into "Other Names Used" because the PDF's field order lists aliases first; legal-name fields stay empty (both) | agy #2, codex #5 | Order sections by what the form means, not the AcroForm tree; ask "Have you used other names?" once and skip the whole alias group on No |
| 2 | I-765: birth date written into Attorney State Bar Number; an unrelated answer filled an unrelated field | codex #6 | Code guard: a value must fit the field's type (date only into date-like fields; reject otherwise) |
| 3 | W-4 combined "city, state, ZIP" field: the ZIP validator rejects "Dallas, TX 75201" and typing 75201 (loop until "skip") | agy #1, `lib/audit.js` ~L109 | Apply the ZIP check only when the label asks for a ZIP alone; for combined labels accept city + state + ZIP |
| 4 | "I don't have one" / "no other names" / "none" rejected on middle name and alias fields (both-ish) | agy #7, #8 | Treat clear negatives as an empty answer for optional fields, and skip the group |
| 5 | W-4 SSN field accepted "March 3, 1950" and said "Saved" | codex #4 | Format validation for private fields too (SSN = 9 digits), without ever sending the value to the model |
| 6 | After the SSN warning the assistant asks "Do you want to tell me that number now?" in ordinary chat and does not move to the masked box (codex #2, #3) | I-9, W-4, I-765 | On a private field: switch the composer to the masked keypad at once (see private-value design); never ask for the number in chat |
| 7 | W-4 marital-status question became "Do you have any cautions to add?" (the "AVISO:" notice was taken as the label) | agy #6 | Scanner: ignore notice/heading words as labels; use the option text |
| 8 | I-9: "the form has no phone field" while Telephone Number is on the page | codex #7 | Scan/label coverage check per page; the model should only see fields, never claim absence |

## P1: confusing or misleading
- I-765 opens with "Is this part needed?" (the attorney G-28 block) with no context; asking what it is gets a **hallucinated** explanation
  (both). Fix: start at the first applicant field, explain optional blocks in one plain sentence from a form profile.
- Raw PDF tooltip text leaks into spoken choices ("only one box): 1.A Select … my…."), cut off with an ellipsis (both). Clean labels, never speak raw tooltips.
- "Can you just do it for me?" gets "What is the next question on the paper?" (agy #9); "what is a middle name" explanations return to the wrong field (codex #11).
- Assistant and form highlight out of step on the clinic forms (codex #10).

## P2: UI
- PDF label text is tiny at fit width; translation badges crowd the W-4; fill receipts show long technical labels (codex #12).
- Sample bar needs sideways scrolling, so required samples sit offscreen (codex). (Testing app only.)
- The chat box has only a placeholder, no visible label; Send, mic, repeat, flag and settings are bare icons (both).
- Controls are hidden until Start (agy); a persistent banner says "Tap the microphone…" when audio input is off.

## What worked
SSN typed into the masked box never reached the model or transcript; Spanish form labels translate well into plain English;
no crashes or timeouts, 3 to 17 s per turn on `gemma-4-e4b`; name, birth date and a typo-ridden phone worked on the clinic forms.

## Turn these into work
Each P0/P1 item becomes a `tests/corpus.json` case (or a unit test) first, then a fix. P0 #6 and #7 and the P2 UI items fold into the
large changes (spoon-feed card UI, private keypad); #1-#5 and #8 are scanner/audit work that Codex can take in a worktree with the
corpus as its acceptance test. Limits of this QA: no speech, no later PDF pages, no formal reading-grade score, no screen-reader or keyboard-only run.
