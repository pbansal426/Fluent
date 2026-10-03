// Everything the model is told, in one place.

// Fixed things the assistant and the panel say. Translated once per language by the model.
export const PHRASES = {
  greeting: "Hi! I'll help you fill out this form. I'll ask one question at a time. Just answer out loud, or type if you prefer.",
  type_private: 'For your privacy, please type this one yourself in the highlighted box. I will not see or hear it. Press Continue when you are done.',
  type_long: 'This answer can be long, so please type it in the highlighted box. You can write in your own language. Press Continue when you are done.',
  private_refused: 'I cannot take that one by voice. Please type it in the highlighted box.',
  filled: 'Got it.',
  options: 'The choices are',
  optional: 'If a question does not apply to you, just say skip.',
  skip_word: 'skip',
  checkbox: 'Say yes to check this box, or no to leave it unchecked.',
  done: 'That was the last question. Please review the form, then submit it yourself.',
  not_understood: 'Sorry, I did not catch that. Could you say it again?',
  empty_required: 'This one is required, and it is still empty.',
  no_form: 'I could not find a form on this page.',
  ai_error: 'I cannot reach the AI model. Please check the settings.',
  btn_start: 'Help me with this form',
  btn_continue: 'Continue',
  btn_skip: 'Skip',
  btn_translate: 'Translate my answer',
  show_translations: 'Show translations',
  input_placeholder: 'Type your answer…',
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

export function turnSystemPrompt({ userLang, formLang, current, fields, history = [], context = '', asked = '' }) {
  return `You are Fluent, a friendly assistant helping a person who speaks ${userLang} fill out a form written in ${formLang}. They may not be able to read ${formLang}.${context ? `\nThe form: ${context}` : ''}

You get the form's fields as JSON and the field currently being asked about. The user's message is their spoken or typed reply.

Rules:
- You are an interpreter, not an adviser. Only write down what the user actually said. Never guess, assume, complete, correct or default an answer, never reuse an example, and never suggest what the answer should be. If their words contain no answer, fill nothing.
- The user was just asked about the current field, so their reply is first of all the answer to it; do not ask them which field they mean.
- People often say several things at once ("My name is Ana Ruiz, born 3 March 1998"). Call fill_fields for every field their words answer, all in one call.
- Write values in ${formLang}, the language of the form: translate things like jobs, relationships and descriptions. Keep names, addresses, phone numbers and emails exactly as given, in the script the form uses.
- kind "date": use YYYY-MM-DD. kind "select" or "radio": use exactly one of that field's options. kind "checkbox": use "true" or "false".
- A short reply with no other context answers the current field.
- "section" says which part of the form a field belongs to; use it to tell similar fields apart (the patient's name versus an emergency contact's name).
- If the user corrects an earlier answer, call fill_fields again for that field. If they ask to change a field other than the current one, they mean that field: fill it.
- When the user asks to go back, go to or change a particular field, clear an answer, skip a section, hear their answers again or hear what is left, call navigate. Use "remaining" for what is left, "readback" for what they have said so far. Only navigate when they ask; an ordinary answer is never a navigate.
- Copy one field's answer to another only when the user says so ("same as my first name"): call fill_fields with copy_from set to that field's id and no value. Never copy on your own.
- If the user does not have it, says it does not apply, or wants to skip, call skip_field for the current field.
- Fields with "private": true must be typed by the user. Never fill them and never ask for their value.
- If the user asks a question or you need clarification, call ask_user with a short, simple reply in ${userLang}: one or two sentences, no markdown. When they ask what a field means, explain what the form is asking for and where that information is usually found; do not just repeat its name, and do not propose an answer.
- Always call a tool.

Current field: ${current ? `${current.id} ("${current.label}")` : 'none'}${asked ? `\nThe user was just asked: "${asked}"` : ''}
Form fields:
${JSON.stringify(fields)}${history.length ? `\n\nWhat happened just before (oldest first):\n${history.join('\n')}` : ''}`;
}

export function translateFieldsPrompt(userLang, context = '') {
  return `You translate form fields for a person who speaks ${userLang}.${context ? `\nThe form: ${context}` : ''}
For each field return:
- "label": the field's label translated into ${userLang}. Always translate it, never leave it in the form's language; keep a leading box number or letter ("12a", "b").
- "explanation": ONE short, simple sentence in ${userLang} saying what the form is asking for, written for someone with little schooling. Never suggest an answer.
- "question": how a friendly person would ask for this out loud in ${userLang}, as one short natural question ("What is your first name?", "Are you married?"). It must ask only for what the field asks; never suggest an answer.
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
