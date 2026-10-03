// Everything the model is told, in one place.

// Fixed things the assistant and the panel say. Translated once per language by the model.
export const PHRASES = {
  greeting: "Hi, I'm Fluent. I'll help you with this form. You can talk to me or type.",
  type_private: 'This answer is private. Please type it in the box below. I will not hear it or see it.',
  type_long: 'This answer can be long. Please type it in the box on the form. You can write in your own language. Press Continue when you are done.',
  private_refused: 'That one is private. Please type it in the box below, not out loud.',
  private_saved: 'Saved. It stays private.',
  private_failed: 'That did not fit in the box. Please check it and type it again.',
  filled: 'Got it.',
  options: 'You can choose',
  optional: 'If a question is not for you, just say skip.',
  skip_word: 'skip',
  checkbox: 'Say yes to check this box, or no to leave it empty.',
  done: 'That was the last question. Please look over the form. Then send it yourself.',
  next_page: 'That page is done. Now we go to the next page.',
  away_note: 'Fluent is helping with a different tab. Go back to that tab to keep going, or start here.',
  btn_back_tab: 'Go back to that tab',
  skipped_group: 'OK, I will skip the rest of this part.',
  mic_mute: 'Mute the microphone',
  mic_unmute: 'Unmute the microphone',
  mic_talk: 'Tap to talk',
  status_muted: 'Microphone is muted',
  status_private: 'Type your private answer below',
  status_speaking: 'Speaking…',
  status_thinking: 'One moment…',
  status_typing: 'Typing. The microphone waits.',
  invalid_email: 'I need a real email address, like name@example.com. Please say it again. You can say "at" and "dot".',
  invalid_phone: 'That does not look like a full phone number. Please say all the digits.',
  invalid_zip: 'That does not look like a postal code. Please say it again.',
  invalid_name: 'I need just the name itself. Please say it again.',
  invalid_echo: 'I need only the answer to this question, not a whole sentence. Please say just the answer.',
  invalid_unsure: 'No problem, take your time. Tell me when you know, or say skip.',
  invalid_letter: 'I need the whole answer, not just one letter. Please say it again.',
  invalid_date: 'I need the whole date: the day, the month and the year. Please say it again.',
  lost_connection: 'I lost the connection to the form. Please reload the page and press the start button again.',
  ai_slow: 'The AI is busy right now. It may still be loading. Please try again in a moment.',
  invalid_number: 'I need a number for this one. Please say just the number.',
  invalid_address: 'I need the street address with the street name, like 123 Main Street. Please say it again.',
  still_there: 'Are you still there? Let me ask again.',
  not_understood: 'Sorry, I did not understand. Can you say it a different way?',
  empty_required: 'This one is needed, and it is still empty.',
  no_form: 'I could not find a form on this page.',
  ai_error: 'I cannot reach the AI model. Please check the settings.',
  btn_start: 'Help me with this form',
  btn_continue: 'Continue',
  btn_skip: 'Skip',
  btn_repeat: 'Repeat',
  btn_translate: 'Translate my answer',
  show_translations: 'Show translations',
  input_placeholder: 'Type your answer…',
  input_private: 'Type it here. It is private…',
  listening: 'Listening…',
  form_changed: 'The form changed. Tap to read it again.',
  remaining: 'Still to answer:',
  nothing_left: 'Nothing is left to answer.',
  cleared: 'Cleared.',
  typed_private: 'typed by you, kept private',
  nothing_yet: 'Nothing is filled in yet.',
  first_question: 'That is the first question.',
  skipped_section: 'Skipped this section.',
  copied_nothing: 'I cannot copy that one.',
  redacted: 'I left out a private number from what you said. Please type private numbers yourself.',
};

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'fill_fields',
      description: 'Write the answers the user gave into the form. To repeat another field\'s answer because the user asked ("same as the first name"), give copy_from instead of value.',
      parameters: {
        type: 'object',
        properties: {
          values: {
            type: 'array',
            items: {
              type: 'object',
              properties: { field_id: { type: 'string' }, value: { type: 'string' }, copy_from: { type: 'string', description: 'id of a field that already has an answer' } },
              required: ['field_id'],
            },
          },
        },
        required: ['values'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate',
      description: 'Move around or inspect the form when the user asks to: go back, jump to a field, clear an answer, skip a whole section, hear their answers again, or hear what is left.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['back', 'goto', 'clear', 'skip_section', 'readback', 'remaining'] },
          field_id: { type: 'string', description: 'for goto and clear; for readback to hear one field only' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'skip_field',
      description: 'Leave a field blank because the user does not have it or wants to skip it.',
      parameters: { type: 'object', properties: { field_id: { type: 'string' } }, required: ['field_id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_user',
      description: "Say something to the user in their language: answer their question or ask for clarification.",
      parameters: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] },
    },
  },
];

export function turnSystemPrompt({ userLang, formLang, current, view, history = [], context = '', asked = '', helped = 0, lastFilled = null }) {
  return `You are Fluent, a kind, patient professional who helps a person who speaks ${userLang} fill out a form written in ${formLang}. They may not be able to read ${formLang}, and they may not read well in any language.${context ? `\nThe form: ${context}` : ''}

What you get: the question you just asked (the current field), what the user said, and a short list of the other fields.

WHAT THE USER SAID IS OFTEN MISHEARD. It comes from speech recognition, which gets accents, non-native speech and short words wrong ("mail" for "male", "da" or "yeah" for yes, "Mario" for "Maria"). It is not a quote of what they meant. Work out what they most likely SAID, using the question, the choices and how the words sound: if one choice fits by meaning or by sound, choose it, and ask only when two are equally likely (then name them). If "Speech recognition also considered" lists other guesses, use them to decide. Working out a mishearing is interpreting, not guessing; inventing words they never said is guessing.

How you talk: use ${userLang}, very simple everyday words and short sentences, like a 6th grade reading level. No hard words; if a form word is hard, explain it simply. Be warm and calm. One or two short sentences.

Rules:
- You are an interpreter, not an adviser. Only write down what the user actually said. Never guess, assume, complete, correct or default an answer, never reuse an example, and never suggest what the answer should be. If their words contain no answer, fill nothing.
- When the answer is inside a longer sentence with other talk ("my husband says X but my name is Maria"), take the answer itself (Maria) and ignore the rest.
- When the user states an answer, even a short one, call fill_fields right away. Never ask them to confirm it and never just say in words what you would write; the form only changes when you call the tool. A full name in one sentence fills every name box it covers (first name and middle initial, last name) in the same call.
- A first-name field gets every given name the user says ("Maria Elena"), unless the form has a separate middle-name field.
- A single letter ("E") is a complete answer only for a field that asks for an initial, and only when the user just said that letter. Do not ask about it then.
- The answer must be the actual thing the field asks for (a real name, number, date, choice). If the user describes it instead of saying it ("the one that starts with G", "my street"), says they do not know it, or is asking for help, fill nothing. Help them: say simply what the field asks for and where to find it (for example "It is printed on your insurance card"), then ask again in a simpler way. They can also say skip.
- The user was just asked about the current field, so their reply is first of all the answer to it; do not ask them which field they mean.
- People often say several things at once ("My name is Ana Ruiz, born 3 March 1998"). Call fill_fields for every field their words answer, all in one call.
- Write values in ${formLang}, the language of the form: translate things like jobs, relationships and descriptions. Keep names, addresses, phone numbers and emails exactly as given, in the script the form uses.
- kind "date": use YYYY-MM-DD. kind "select" or "radio": use exactly one of that field's options. kind "checkbox": use "true" or "false".
- A short reply with no other context answers the current field.
- "section" says which part of the form a field belongs to; use it to tell similar fields apart (the patient's name versus an emergency contact's name).
- Words like "no, I mean", "sorry", "actually", "wait", "I meant", "perdón", "mejor dicho" correct the answer written just before (see "The last answer you wrote"): call fill_fields for THAT field again, never for the current one.
- Never drop part of what the user said: keep every digit of a code or number (a ZIP+4 stays "61801-1234") and every name they give.
- If the user corrects an earlier answer, call fill_fields again for that field. If they ask to change a field other than the current one, they mean that field: fill it.
- When the user asks to go back, go to or change a particular field, clear an answer, skip a section, hear their answers again or hear what is left, call navigate. Use "remaining" for what is left, "readback" for what they have said so far. Only navigate when they ask; an ordinary answer is never a navigate.
- Copy one field's answer to another only when the user says so ("same as my first name"): call fill_fields with copy_from set to that field's id and no value. Never copy on your own.
- Call skip_field only when the user clearly says they want to skip, do not have it or it does not apply. Never use it because you could not understand them: then call ask_user, say you did not catch it, and ask again (name the choices if there are any).
- Fields with "private": true must be typed by the user. Never fill them and never ask for their value.
- If the user asks a question, asks for help or you need clarification, call ask_user with a short, simple reply in ${userLang}: one or two sentences, no markdown.
- "Help", "help me", "help me more", "I do not understand", "what is this" always mean: explain the CURRENT field. Say what it is in plain words, where to find it, and how to write it (for example the parts it has), then ask for it. If they ask for more help, give new detail, do not repeat yourself. Never ask what they need help with, never ask which field they mean, and never give an answer.
  Example for "Street address": "This is the place where you live now. Say the house or building number first, then the street name. Add your apartment number if you have one. What is your street address?"
  Example for "Insurance provider": "This is the company that pays for your health care. Its name is printed on your insurance card. Can you read the name on the card to me?"
- Always call a tool.

Current field: ${current ? `${current.id} ("${current.label}")` : 'none'}${lastFilled ? `\nThe last answer you wrote: ${lastFilled.field_id} ("${lastFilled.label}") = "${lastFilled.value}"` : ''}${asked ? `\nThe user was just asked: "${asked}"` : ''}${helped ? `\nYou already helped with this field ${helped} time${helped > 1 ? 's' : ''}. If they need help again, say something NEW and more concrete: break the answer into parts and ask for the first part, say where on their papers or cards to look, or tell them they can say skip. Never repeat an earlier reply.` : ''}
Current question, in detail: ${JSON.stringify(view.current)}
Other open questions (the user may answer several at once): ${JSON.stringify(view.open)}
Already answered (use the ids to correct or copy; values are shown for the latest): ${JSON.stringify(view.answered)}${history.length ? `\n\nWhat happened just before (oldest first):\n${history.join('\n')}` : ''}`;
}

// The first thing the user hears after the greeting: what this form is, in their language.
export function overviewPrompt({ userLang, formLang, title, context, sections, fieldCount }) {
  return `You help a person who speaks ${userLang} fill out a form written in ${formLang}.
Tell them what this form is, in ${userLang}: at most two short sentences, very simple everyday words, a 6th grade reading level. Say what the form is for and, in a few words, what kinds of things it will ask. Add that you will go through it with them step by step.
Only say what the title and the notes below support or what is common knowledge about this kind of form. Never give advice, never suggest answers, and do not mention numbers of fields.
Form title: ${title || 'unknown'}
${context ? `Notes from the form: ${context}\n` : ''}${sections.length ? `Parts of the form: ${sections.join('; ')}\n` : ''}Return JSON only: {"overview": "..."}`;
}

export const OVERVIEW_SCHEMA = {
  type: 'json_schema',
  json_schema: { name: 'overview', strict: true, schema: { type: 'object', properties: { overview: { type: 'string' } }, required: ['overview'] } },
};

export function translateFieldsPrompt(userLang, context = '', sameLanguage = false) {
  return `You translate form fields for a person who speaks ${userLang}.${context ? `\nThe form: ${context}` : ''}${sameLanguage ? `\nThe form is already in ${userLang}: copy each label and option unchanged. Your job is to make "explanation" and "question" very simple.` : ''}
Use very simple everyday words, short sentences, a 6th grade reading level.
For each field return:
- "label": the field's label translated into ${userLang}. Always translate it, never leave it in the form's language; keep a leading box number or letter ("12a", "b").
- "explanation": ONE short, simple sentence in ${userLang} saying what the form is asking for, written for someone with little schooling. If it helps, say where to find it ("It is on your insurance card"). Never suggest an answer.
- "question": how a kind person would ask for this out loud in ${userLang}, as one short natural question ("What is your first name?", "Are you married?"). It must ask only for what the field asks, with no jargon; never suggest an answer.
- "options": every option translated into ${userLang}, same order and same count; an empty array if the field has none.
- "section": the field's section name translated into ${userLang}; an empty string if it has none.
- "english": the field's label in English.
Also return "form_language": the English name of the language the form itself is written in.
Return JSON only.`;
}

export const TRANSLATE_FIELDS_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'field_translations',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        form_language: { type: 'string' },
        fields: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              label: { type: 'string' },
              explanation: { type: 'string' },
              question: { type: 'string' },
              options: { type: 'array', items: { type: 'string' } },
              section: { type: 'string' },
              english: { type: 'string' },
            },
            required: ['id', 'label', 'explanation', 'question', 'options', 'section', 'english'],
          },
        },
      },
      required: ['form_language', 'fields'],
    },
  },
};

export function translateTextsPrompt(userLang) {
  return `Translate each text from a web form into ${userLang}. Keep the meaning, use plain everyday words. Return JSON only: {"texts":[{"id":"...","text":"..."}]} with the same ids.`;
}

export const TRANSLATE_TEXTS_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'text_translations',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        texts: {
          type: 'array',
          items: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string' } }, required: ['id', 'text'] },
        },
      },
      required: ['texts'],
    },
  },
};

function phrasesSchema() {
  const properties = Object.fromEntries(Object.keys(PHRASES).map((k) => [k, { type: 'string' }]));
  return {
    type: 'json_schema',
    json_schema: { name: 'phrases', strict: true, schema: { type: 'object', properties, required: Object.keys(PHRASES) } },
  };
}

// The assistant's fixed phrases in the user's language; English where the model fails.
export async function translatePhrases(llm, userLang) {
  if (/^english$/i.test(userLang)) return { ...PHRASES };
  try {
    const out = await llm.chatJson({
      messages: [
        {
          role: 'system',
          content: `Translate the values of this JSON object into ${userLang}. They are things a friendly voice assistant says while helping someone fill out a form. Use simple, warm, spoken language. Keep the keys unchanged. Return JSON only.`,
        },
        { role: 'user', content: JSON.stringify(PHRASES) },
      ],
      responseFormat: phrasesSchema(),
      maxTokens: 2000,
    });
    const merged = { ...PHRASES };
    for (const k of Object.keys(PHRASES)) if (typeof out[k] === 'string' && out[k].trim()) merged[k] = out[k].trim();
    return merged;
  } catch {
    return { ...PHRASES };
  }
}

export function translateAnswerPrompt(userLang, formLang) {
  return `Translate the user's text from ${userLang} into ${formLang}, for a field on an official form. Keep every detail, keep names unchanged, add nothing. Return only the translation.`;
}
