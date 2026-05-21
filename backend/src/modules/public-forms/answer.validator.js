/**
 * Validates an incoming public form submission against the immutable
 * published schema. Returns a normalised list of answers shaped for the
 * `responses.answers` field, or throws `ValidationError` with structured
 * `details` describing every failed field.
 *
 * Phase 06 supports the core input field types end-to-end. Visibility rules
 * are accepted in the schema but not yet evaluated server-side — a hidden
 * required field would still block submission today, which Phase 07 will
 * relax. The shape stays compatible so the upgrade is additive.
 */

import { ValidationError } from '../../common/errors/index.js';

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

const isNil = (value) => value === null || value === undefined;
const isEmptyString = (value) => typeof value === 'string' && value.trim().length === 0;
const isEmpty = (value) =>
  isNil(value) || isEmptyString(value) || (Array.isArray(value) && value.length === 0);

const issue = (fieldId, message) => ({ path: ['answers', fieldId], message });

const coerceNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
};

const indexAnswers = (answers) => {
  const map = new Map();
  if (!Array.isArray(answers)) return map;
  for (const ans of answers) {
    if (!ans || typeof ans !== 'object') continue;
    if (typeof ans.fieldId === 'string' && ans.fieldId.length > 0) {
      map.set(ans.fieldId, ans);
    }
  }
  return map;
};

const validateField = (field, raw, errors) => {
  const validation = field.validation ?? {};
  const isRequired = Boolean(field.required);
  const empty = isEmpty(raw?.value);

  if (empty) {
    if (isRequired) {
      errors.push(issue(field.id, 'This field is required.'));
      return null;
    }
    return { fieldId: field.id, key: field.key ?? null, type: field.type, value: null };
  }

  let value = raw.value;

  switch (field.type) {
    case 'short_text':
    case 'long_text': {
      if (typeof value !== 'string') value = String(value);
      const trimmed = value.trim();
      if (validation.minLength != null && trimmed.length < validation.minLength) {
        errors.push(issue(field.id, `Must be at least ${validation.minLength} characters.`));
        return null;
      }
      if (validation.maxLength != null && trimmed.length > validation.maxLength) {
        errors.push(issue(field.id, `Must be at most ${validation.maxLength} characters.`));
        return null;
      }
      if (validation.regex) {
        try {
          const re = new RegExp(validation.regex);
          if (!re.test(trimmed)) {
            errors.push(issue(field.id, 'Value does not match the expected format.'));
            return null;
          }
        } catch {
          // A malformed stored regex should not block submission.
        }
      }
      value = trimmed;
      break;
    }

    case 'email': {
      if (typeof value !== 'string') value = String(value);
      const trimmed = value.trim().toLowerCase();
      if (!EMAIL_REGEX.test(trimmed)) {
        errors.push(issue(field.id, 'Enter a valid email address.'));
        return null;
      }
      value = trimmed;
      break;
    }

    case 'phone': {
      if (typeof value !== 'string') value = String(value);
      const trimmed = value.trim();
      if (!PHONE_REGEX.test(trimmed)) {
        errors.push(issue(field.id, 'Enter a valid phone number.'));
        return null;
      }
      value = trimmed;
      break;
    }

    case 'number': {
      const num = coerceNumber(value);
      if (num === null) {
        errors.push(issue(field.id, 'Enter a valid number.'));
        return null;
      }
      if (validation.min != null && num < validation.min) {
        errors.push(issue(field.id, `Must be at least ${validation.min}.`));
        return null;
      }
      if (validation.max != null && num > validation.max) {
        errors.push(issue(field.id, `Must be at most ${validation.max}.`));
        return null;
      }
      value = num;
      break;
    }

    case 'date': {
      if (typeof value !== 'string') value = String(value);
      const trimmed = value.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed) || Number.isNaN(Date.parse(trimmed))) {
        errors.push(issue(field.id, 'Enter a valid date (YYYY-MM-DD).'));
        return null;
      }
      value = trimmed;
      break;
    }

    case 'time': {
      if (typeof value !== 'string') value = String(value);
      const trimmed = value.trim();
      if (!/^\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
        errors.push(issue(field.id, 'Enter a valid time (HH:MM).'));
        return null;
      }
      value = trimmed;
      break;
    }

    case 'select':
    case 'radio_group': {
      const allowed = new Set((field.options ?? []).map((opt) => opt.key));
      const stringValue = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
      if (!allowed.has(stringValue)) {
        errors.push(issue(field.id, 'Select a valid option.'));
        return null;
      }
      value = stringValue;
      break;
    }

    case 'checkbox_group': {
      const allowed = new Set((field.options ?? []).map((opt) => opt.key));
      const list = Array.isArray(value) ? value : [value];
      const normalised = [];
      for (const entry of list) {
        const str = typeof entry === 'string' ? entry.trim() : String(entry ?? '').trim();
        if (!allowed.has(str)) {
          errors.push(issue(field.id, 'One or more selected options are invalid.'));
          return null;
        }
        if (!normalised.includes(str)) normalised.push(str);
      }
      if (isRequired && normalised.length === 0) {
        errors.push(issue(field.id, 'Select at least one option.'));
        return null;
      }
      value = normalised;
      break;
    }

    case 'checkbox':
    case 'yes_no': {
      if (typeof value === 'boolean') {
        // already boolean
      } else if (typeof value === 'string') {
        const lower = value.trim().toLowerCase();
        if (['true', 'yes', 'y', '1', 'on'].includes(lower)) value = true;
        else if (['false', 'no', 'n', '0', 'off'].includes(lower)) value = false;
        else {
          errors.push(issue(field.id, 'Select yes or no.'));
          return null;
        }
      } else if (typeof value === 'number') {
        value = value !== 0;
      } else {
        errors.push(issue(field.id, 'Select yes or no.'));
        return null;
      }
      if (field.type === 'checkbox' && isRequired && value !== true) {
        errors.push(issue(field.id, 'This field is required.'));
        return null;
      }
      break;
    }

    case 'rating': {
      const num = coerceNumber(value);
      const min = validation.min ?? 1;
      const max = validation.max ?? 5;
      if (num === null || num < min || num > max) {
        errors.push(issue(field.id, `Choose a rating between ${min} and ${max}.`));
        return null;
      }
      value = num;
      break;
    }

    case 'nps': {
      const num = coerceNumber(value);
      if (num === null || num < 0 || num > 10) {
        errors.push(issue(field.id, 'Choose a score between 0 and 10.'));
        return null;
      }
      value = num;
      break;
    }

    case 'file_upload': {
      // Phase 06 stores file metadata as opaque payloads; the upload pipeline
      // ships in a later phase. Accept any object/string but never trust it.
      if (typeof value === 'string') value = value.trim();
      break;
    }

    case 'hidden': {
      if (typeof value !== 'string') value = String(value);
      value = value.slice(0, 1000);
      break;
    }

    default: {
      // Presentational types must not appear in answers.
      errors.push(issue(field.id, 'This field does not accept answers.'));
      return null;
    }
  }

  return { fieldId: field.id, key: field.key ?? null, type: field.type, value };
};

/**
 * Validate and normalise incoming answers against a published schema.
 *
 * @param {object} schema published schema (already trusted, comes from
 *   `survey_versions.schema`).
 * @param {Array<object>} answers raw answers from the request body.
 * @returns {Array<object>} normalised answers ready for storage.
 * @throws {ValidationError} when any field fails validation.
 */
export const validateAnswersAgainstSchema = (schema, answers) => {
  const errors = [];
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  const incoming = indexAnswers(answers);
  const normalised = [];

  for (const field of fields) {
    if (!field || PRESENTATION_TYPES.has(field.type)) continue;
    if (HIDDEN_TYPES.has(field.type)) {
      const raw = incoming.get(field.id);
      if (raw && !isEmpty(raw.value)) {
        const result = validateField(field, raw, errors);
        if (result) normalised.push(result);
      }
      continue;
    }
    const raw = incoming.get(field.id) ?? { value: null };
    const result = validateField(field, raw, errors);
    if (result) normalised.push(result);
  }

  if (errors.length > 0) {
    throw new ValidationError('Some answers are invalid', errors);
  }

  return normalised;
};
