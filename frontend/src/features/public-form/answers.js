// Client-side answer model for the public form renderer.
//
// `buildInitialAnswers(schema)` returns a map keyed by `fieldId` with shape-
// appropriate empty values. `serializeAnswers(schema, state)` turns the
// reactive state into the API payload. `validateAnswers(schema, state, t)`
// mirrors the backend rules in `backend/src/modules/public-forms/answer.validator.js`
// so users get instant feedback before submitting. The backend remains the
// source of truth for validation; any error returned by the API is surfaced
// alongside the local issues.

import { t as defaultT } from '../../i18n/index.js';
import { computeFieldVisibility } from '../logic/logic-engine.js';

const PRESENTATION_TYPES = new Set([
  'image_block',
  'text_block',
  'divider',
  'section_title',
  'page_break',
]);

const HIDDEN_TYPES = new Set(['hidden']);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+\d][\d\s().-]{4,30}$/;

export const isInputField = (field) =>
  field && !PRESENTATION_TYPES.has(field.type) && !HIDDEN_TYPES.has(field.type);

const initialValueFor = (field) => {
  switch (field.type) {
    case 'checkbox_group':
      return [];
    case 'checkbox':
    case 'yes_no':
      return null;
    case 'rating':
    case 'nps':
      return null;
    default:
      return '';
  }
};

export const buildInitialAnswers = (schema) => {
  const state = {};
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  for (const field of fields) {
    if (!isInputField(field)) continue;
    state[field.id] = initialValueFor(field);
  }
  return state;
};

const isEmpty = (value) => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
};

export const validateAnswers = (schema, state, translator = defaultT) => {
  const errors = {};
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  const visibility = computeFieldVisibility(schema, state);

  for (const field of fields) {
    if (!isInputField(field)) continue;
    if (visibility.get(field.id) === false) continue;
    const value = state[field.id];
    const required = Boolean(field.required);
    const validation = field.validation ?? {};

    if (isEmpty(value)) {
      if (required) errors[field.id] = translator('publicForm.fieldErrors.required');
      continue;
    }

    switch (field.type) {
      case 'short_text':
      case 'long_text': {
        const len = String(value).trim().length;
        if (validation.minLength != null && len < validation.minLength) {
          errors[field.id] = translator('publicForm.fieldErrors.minLength', {
            min: validation.minLength,
          });
        } else if (validation.maxLength != null && len > validation.maxLength) {
          errors[field.id] = translator('publicForm.fieldErrors.maxLength', {
            max: validation.maxLength,
          });
        } else if (validation.regex) {
          try {
            const re = new RegExp(validation.regex);
            if (!re.test(String(value).trim())) {
              errors[field.id] = translator('publicForm.fieldErrors.regex');
            }
          } catch {
            // ignore malformed stored regex
          }
        }
        break;
      }
      case 'email': {
        if (!EMAIL_REGEX.test(String(value).trim())) {
          errors[field.id] = translator('publicForm.fieldErrors.email');
        }
        break;
      }
      case 'phone': {
        if (!PHONE_REGEX.test(String(value).trim())) {
          errors[field.id] = translator('publicForm.fieldErrors.phone');
        }
        break;
      }
      case 'number': {
        const num = Number(value);
        if (!Number.isFinite(num)) {
          errors[field.id] = translator('publicForm.fieldErrors.number');
        } else if (validation.min != null && num < validation.min) {
          errors[field.id] = translator('publicForm.fieldErrors.min', { min: validation.min });
        } else if (validation.max != null && num > validation.max) {
          errors[field.id] = translator('publicForm.fieldErrors.max', { max: validation.max });
        }
        break;
      }
      case 'select':
      case 'radio_group': {
        const allowed = new Set((field.options ?? []).map((opt) => opt.key));
        if (!allowed.has(String(value))) {
          errors[field.id] = translator('publicForm.fieldErrors.option');
        }
        break;
      }
      case 'checkbox_group': {
        const allowed = new Set((field.options ?? []).map((opt) => opt.key));
        for (const entry of value) {
          if (!allowed.has(String(entry))) {
            errors[field.id] = translator('publicForm.fieldErrors.option');
            break;
          }
        }
        break;
      }
      case 'rating': {
        const num = Number(value);
        const min = validation.min ?? 1;
        const max = validation.max ?? 5;
        if (!Number.isFinite(num) || num < min || num > max) {
          errors[field.id] = translator('publicForm.fieldErrors.option');
        }
        break;
      }
      case 'nps': {
        const num = Number(value);
        if (!Number.isFinite(num) || num < 0 || num > 10) {
          errors[field.id] = translator('publicForm.fieldErrors.option');
        }
        break;
      }
      default:
        break;
    }
  }

  return errors;
};

export const serializeAnswers = (schema, state) => {
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  const visibility = computeFieldVisibility(schema, state);
  const answers = [];
  for (const field of fields) {
    if (!isInputField(field)) continue;
    if (visibility.get(field.id) === false) continue;
    const raw = state[field.id];
    if (isEmpty(raw) && !field.required) continue;

    let value = raw;
    switch (field.type) {
      case 'short_text':
      case 'long_text':
      case 'email':
      case 'phone':
      case 'date':
      case 'time':
      case 'select':
      case 'radio_group':
        value = String(raw ?? '').trim();
        if (value === '') value = null;
        break;
      case 'number':
      case 'rating':
      case 'nps': {
        const num = Number(raw);
        value = Number.isFinite(num) ? num : null;
        break;
      }
      case 'checkbox':
      case 'yes_no':
        value = raw === true || raw === 'true' || raw === 1;
        break;
      case 'checkbox_group':
        value = Array.isArray(raw) ? raw.map((entry) => String(entry)) : [];
        break;
      default:
        break;
    }

    if (value === null && !field.required) continue;
    answers.push({ fieldId: field.id, key: field.key ?? undefined, type: field.type, value });
  }
  return answers;
};
