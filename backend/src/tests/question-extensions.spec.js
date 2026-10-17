import { describe, expect, it } from 'vitest';
import { parseFormSchema, FIELD_TYPES } from '../modules/surveys/form-schema.validator.js';
import { validateAnswersAgainstSchema } from '../modules/public-forms/answer.validator.js';
import { submitResponseSchema } from '../modules/public-forms/public-form.validation.js';

const choices = (type = 'radio_group') => ({
  id: 'problem',
  key: 'problem',
  type,
  required: true,
  options: [
    { key: 'water', label: 'Water' },
    { key: 'other', label: 'Other', isOther: true },
  ],
});
const mentions = {
  id: 'names',
  key: 'names',
  type: 'multiple_text',
  required: true,
  settings: { mentionLabels: ['First mention', 'Second mention', 'Third mention'] },
};
const validate = (field, value, extra = {}) =>
  validateAnswersAgainstSchema({ fields: [field] }, [{ fieldId: field.id, value, ...extra }]);

describe('question extensions schema and answer contracts', () => {
  it.each(FIELD_TYPES)('accepts a title image for %s', (type) => {
    const field = {
      ...choices(type),
      settings: { ...mentions.settings, imageUrl: 'https://example.test/question.png' },
    };
    if (!['radio_group', 'select', 'checkbox_group'].includes(type)) field.options = [];
    expect(parseFormSchema({ fields: [field] }).fields[0].settings.imageUrl).toBe(
      field.settings.imageUrl,
    );
  });
  it('preserves option media and rejects multiple custom options', () => {
    const field = choices();
    Object.assign(field.options[1], {
      imageUrl: 'https://example.test/other.png',
      mediaAssetId: 'a'.repeat(24),
    });
    expect(parseFormSchema({ fields: [field] }).fields[0].options[1]).toEqual(field.options[1]);
    field.options[0].isOther = true;
    expect(() => parseFormSchema({ fields: [field] })).toThrow();
  });
  it.each(['select', 'radio_group', 'checkbox_group'])(
    'requires custom text only when Other is selected in %s',
    (type) => {
      const field = choices(type);
      const value = type === 'checkbox_group' ? ['water', 'other'] : 'other';
      for (const otherText of [undefined, '', '   ', 'x'.repeat(1001), 123]) {
        expect(() => validate(field, value, { otherText })).toThrow();
      }
      const payload = submitResponseSchema.parse({
        answers: [{ fieldId: field.id, value, otherText: '  Traffic  ' }],
      });
      expect(validateAnswersAgainstSchema({ fields: [field] }, payload.answers)[0]).toMatchObject({
        value,
        otherText: 'Traffic',
      });
      expect(
        validate(field, type === 'checkbox_group' ? ['water'] : 'water', {
          otherText: 'Stale text',
        })[0],
      ).not.toHaveProperty('otherText');
    },
  );
  it('drops hidden custom answers and does not require their text', () => {
    const source = { id: 'gate', type: 'yes_no', key: 'gate' };
    const field = {
      ...choices(),
      visibility: {
        mode: 'show_when',
        conditions: [{ fieldId: 'gate', operator: 'equals', value: true }],
      },
    };
    const result = validateAnswersAgainstSchema({ fields: [source, field] }, [
      { fieldId: 'gate', value: false },
      { fieldId: 'problem', value: 'other' },
    ]);
    expect(result.some((answer) => answer.fieldId === 'problem')).toBe(false);
  });
  it('preserves mention positions, trims text, and permits fewer than all mentions', () => {
    expect(validate(mentions, [' Ada ', '', ' Grace '])[0].value).toEqual(['Ada', '', 'Grace']);
    expect(validate(mentions, ['Ada'])[0].value).toEqual(['Ada', '', '']);
  });
  it('requires at least one mention only when the question is required', () => {
    expect(() => validate(mentions, ['', ' ', ''])).toThrow();
    expect(validate({ ...mentions, required: false }, ['', ' ', ''])[0].value).toBeNull();
  });
  it.each(
    [['a', 'b', 'c', 'd'], [42], { none: true }, ['x'.repeat(501)]].map((value) => ({ value })),
  )('rejects malformed or oversized mentions: %j', ({ value }) => {
    expect(() => validate(mentions, value)).toThrow();
  });
  it.each([[], [''], Array(11).fill('Mention')])(
    'rejects invalid mention labels: %j',
    (...labels) => {
      // Vitest expands array cases into positional arguments.
      expect(() =>
        parseFormSchema({ fields: [{ ...mentions, settings: { mentionLabels: labels } }] }),
      ).toThrow();
    },
  );
});

describe('configurable exclusive mention option', () => {
  const field = {
    ...mentions,
    settings: { ...mentions.settings, exclusiveOption: { label: 'Not applicable' } },
  };
  it('accepts and preserves the custom option configuration', () => {
    const parsed = parseFormSchema({ fields: [field] });
    expect(parsed.fields[0].settings.exclusiveOption).toEqual({ label: 'Not applicable' });
    expect(() =>
      parseFormSchema({
        fields: [{ ...field, settings: { ...field.settings, exclusiveOption: { label: ' ' } } }],
      }),
    ).toThrow();
  });
  it('satisfies a required question without mentions and snapshots the configured label', () => {
    expect(validate(field, { exclusive: true })[0].value).toEqual({
      exclusive: true,
      label: 'Not applicable',
    });
    expect(() => validate(mentions, { exclusive: true })).toThrow();
  });
  it.each([
    { exclusive: false },
    { exclusive: 'true' },
    { exclusive: true, mentions: ['Ada'] },
    { exclusive: true, label: 'Forged label' },
  ])('rejects an invalid or contradictory exclusive answer: %j', (value) => {
    expect(() => validate(field, value)).toThrow();
  });
  it('does not require the exclusive option when mentions are supplied', () => {
    expect(validate(field, ['Ada'])[0].value).toEqual(['Ada', '', '']);
  });
});
