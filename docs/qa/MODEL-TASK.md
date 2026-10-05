# QA task: with the model (LM Studio is running, `google/gemma-4-e4b` is loaded)

You are a QA tester. Read `docs/BROWSER-QA.md`. The testing app is at http://localhost:8765/demo/app/ (already running).
Do sections 6, 7, 8 and 5 of the brief ("What to check (with LM Studio running)" and the grandma question). Do NOT edit code.
Use made-up personal data only. Speech/microphone cannot be used: type answers in the sidebar's text box instead
(the box and buttons appear after you press "Help me with this form").

Cover at least these forms, in this order: `Clinic intake (web form)`, `Clinic intake (Spanish)`, `Form I-9`, `W-4 (Spanish)`, one USCIS form (I-765).
For each form do a short conversation (6-12 turns) as an elderly, low-literate, non-native speaker would talk:
- answer the first questions normally (name, date of birth, phone);
- then misbehave: a typo-ridden answer, a tangent ("my grandson says I should ask about the weather"), "what is a middle name?",
  "I don't know", "can you just do it for me?", an answer to a different question than the one asked, a correction ("no wait, it is Maria not Mary");
- offer an SSN or card number as chat text once, and check it is refused and the masked box is offered instead.
After each turn record: what you typed, what the assistant said (exact text), what the form field now contains (check the form side).
Judge each reply: plain words (6th-grade)? Short? Patient? Correct field filled? Invented anything? Repeated itself? Stayed on the form?
Also time how long each reply takes and note any error banner.

Write the report to `docs/qa/<today>-<your-tool>-model.md` (tool name: agy or codex): per-form transcript tables, a findings table
(# | form | turn | expected | actual | severity | evidence), then "top 5 things that would stop a grandma", then what you could not test.
Save screenshots under `docs/qa/screenshots/`. Finish with a 5-line summary.
