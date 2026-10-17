import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PublicFieldRenderer from '../components/public-form/PublicFieldRenderer.vue';
import QuestionImageEditor from '../components/media/QuestionImageEditor.vue';
import {
  buildDefaultField,
  normalizeSchemaForApi,
  cloneFieldWithNewIds,
} from '../features/builder/builder.schema.js';
import { useBuilderStore } from '../stores/builder.store.js';
import {
  buildInitialAnswers,
  serializeAnswers,
  validateAnswers,
} from '../features/public-form/answers.js';
import { computeFieldVisibility } from '../features/logic/logic-engine.js';
import { parseFormSchema } from '../../../backend/src/modules/surveys/form-schema.validator.js';
import { mediaService } from '../services/media.service.js';
vi.mock('../services/media.service.js', () => ({ mediaService: { uploadImage: vi.fn() } }));

const choices = (type = 'radio_group') => ({
  ...buildDefaultField(type),
  id: 'problem',
  key: 'problem',
  required: true,
  options: [
    { id: 'water', key: 'water', label: 'Water' },
    {
      id: 'other',
      key: 'other',
      label: 'Other',
      isOther: true,
      imageUrl: 'https://example.test/other.png',
    },
  ],
  settings: { width: 'full', imageUrl: 'https://example.test/question.png' },
});
let wrapper;
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = '';
});

const mountField = (field) => {
  const modelValue = buildInitialAnswers({ fields: [field] })[field.id];
  wrapper = mount(PublicFieldRenderer, {
    attachTo: document.body,
    props: {
      field,
      modelValue,
      'onUpdate:modelValue': (value) => wrapper.setProps({ modelValue: value }),
    },
  });
  return wrapper;
};

describe('extended questions through builder and public renderer', () => {
  it('round-trips new settings through save, hydrate, edit and duplicate', () => {
    setActivePinia(createPinia());
    const builder = useBuilderStore();
    const names = buildDefaultField('multiple_text');
    const field = choices();
    const schema = parseFormSchema(normalizeSchemaForApi({ fields: [field, names] }));
    builder.setSurvey({ id: 'survey', currentDraftSchema: schema });
    builder.updateField('problem', { settings: { width: 'half' } });
    builder.updateOption('problem', builder.fields[0].options[1].id, { label: 'Something else' });
    const saved = parseFormSchema(normalizeSchemaForApi(builder.schema));
    expect(saved.fields[0].options[1]).toMatchObject({
      isOther: true,
      imageUrl: field.options[1].imageUrl,
    });
    expect(saved.fields[0].settings.imageUrl).toBe(field.settings.imageUrl);
    expect(saved.fields[1].settings.mentionLabels).toHaveLength(3);
    const clone = cloneFieldWithNewIds(builder.fields[1]);
    clone.settings.mentionLabels[0] = 'Changed';
    expect(builder.fields[1].settings.mentionLabels[0]).not.toBe('Changed');
  });
  it.each(['select', 'radio_group', 'checkbox_group'])(
    'collects Other text and clears it when deselected: %s',
    async (type) => {
      const field = choices(type);
      mountField(field);
      await wrapper.get('input[value="other"]').setValue(true);
      expect(
        validateAnswers({ fields: [field] }, { problem: wrapper.props('modelValue') }),
      ).toHaveProperty('problem');
      await wrapper.get('input[type="text"]').setValue('Traffic');
      const state = { problem: wrapper.props('modelValue') };
      expect(validateAnswers({ fields: [field] }, state)).toEqual({});
      expect(serializeAnswers({ fields: [field] }, state)[0]).toMatchObject({
        value: type === 'checkbox_group' ? ['other'] : 'other',
        otherText: 'Traffic',
      });
      if (type === 'checkbox_group') await wrapper.get('input[value="other"]').setValue(false);
      else await wrapper.get('input[value="water"]').setValue(true);
      expect(wrapper.find('input[type="text"]').exists()).toBe(false);
      expect(wrapper.props('modelValue').otherText).toBe('');
    },
  );
  it('evaluates conditional visibility using the option key with custom text', () => {
    const field = choices();
    const dependent = {
      ...buildDefaultField('short_text'),
      id: 'details',
      visibility: {
        mode: 'show_when',
        conditions: [{ fieldId: 'problem', operator: 'equals', value: 'other' }],
      },
    };
    expect(
      computeFieldVisibility(
        { fields: [field, dependent] },
        { problem: { selected: 'other', otherText: 'Traffic' } },
      ).get('details'),
    ).toBe(true);
  });
  it('collects ordered mentions without a none option and validates empty required answers', async () => {
    const field = { ...buildDefaultField('multiple_text'), id: 'names', required: true };
    mountField(field);
    expect(wrapper.findAll('input[type="text"]')).toHaveLength(3);
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
    expect(
      validateAnswers({ fields: [field] }, { names: wrapper.props('modelValue') }),
    ).toHaveProperty('names');
    await wrapper.findAll('input[type="text"]')[2].setValue(' Grace ');
    expect(validateAnswers({ fields: [field] }, { names: wrapper.props('modelValue') })).toEqual(
      {},
    );
    expect(
      serializeAnswers({ fields: [field] }, { names: wrapper.props('modelValue') })[0].value,
    ).toEqual(['', '', 'Grace']);
  });
  it('selects the whole image card and renders the title image inline without a modal', async () => {
    mountField(choices());
    expect(wrapper.get('.question-image img').attributes('src')).toBe(
      'https://example.test/question.png',
    );
    const card = wrapper.get('.choice-options__option:has(img)');
    await card.get('img').trigger('click');
    expect(wrapper.props('modelValue').selected).toBe('other');
    expect(card.classes()).toContain('is-selected');
    expect(wrapper.get('input[value="other"]').element.checked).toBe(true);
    expect(wrapper.find('dialog').exists()).toBe(false);
    expect(wrapper.find('button').exists()).toBe(false);
    await wrapper.get('input[value="water"]').setValue(true);
    expect(card.classes()).not.toContain('is-selected');
  });
  it('retains a dropdown for select questions without images', async () => {
    const field = choices('select');
    field.options[1].imageUrl = null;
    mountField(field);
    await wrapper.get('select').setValue('other');
    expect(wrapper.find('input[type="text"]').exists()).toBe(true);
  });
  it('supports selecting and deselecting multiple image cards', async () => {
    const field = choices('checkbox_group');
    field.options[0].imageUrl = 'https://example.test/water.png';
    mountField(field);
    const cards = wrapper.findAll('.choice-options__option');
    await cards[0].get('img').trigger('click');
    await cards[1].get('img').trigger('click');
    expect(wrapper.props('modelValue').selected).toEqual(['water', 'other']);
    expect(wrapper.findAll('.choice-options__option.is-selected')).toHaveLength(2);
    await cards[0].get('img').trigger('click');
    expect(wrapper.props('modelValue').selected).toEqual(['other']);
  });
  it.each([
    { type: 'yes_no', key: 'false', expected: false },
    { type: 'rating', key: '3', expected: 3 },
    { type: 'nps', key: '0', expected: 0 },
    { type: 'checkbox', key: 'true', expected: true },
  ])(
    'preserves the answer type when selecting a $type image card',
    async ({ type, key, expected }) => {
      const field = buildDefaultField(type);
      field.settings.optionImages = [{ key, imageUrl: 'https://example.test/option.png' }];
      mountField(field);
      await wrapper.get('.choice-options__option:has(img) img').trigger('click');
      expect(wrapper.props('modelValue')).toBe(expected);
      expect(wrapper.findAll('.choice-options__option.is-selected')).toHaveLength(1);
      if (type === 'checkbox') {
        await wrapper.get('.choice-options__option img').trigger('click');
        expect(wrapper.props('modelValue')).toBe(false);
      }
    },
  );
  it('discards an upload completed after switching the inspected field', async () => {
    let resolve;
    vi.spyOn(mediaService, 'uploadImage').mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    wrapper = mount(QuestionImageEditor);
    const input = wrapper.get('input[type="file"]');
    Object.defineProperty(input.element, 'files', {
      value: [new File(['x'], 'image.png', { type: 'image/png' })],
    });
    await input.trigger('change');
    wrapper.unmount();
    resolve({ asset: { id: 'image', publicUrl: 'https://example.test/image.png' } });
    await Promise.resolve();
    expect(wrapper.emitted('update')).toBeUndefined();
  });
});
