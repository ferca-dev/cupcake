import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import SurveyFormFields from '../../components/public-form/SurveyFormFields.vue';
import PublicFieldRenderer from '../../components/public-form/PublicFieldRenderer.vue';

const question = (id, type = 'short_text', extra = {}) => ({ id, type, label: id, ...extra });
let wrapper;
afterEach(() => wrapper?.unmount());

describe('survey progress and navigation', () => {
  it('counts only visible questions and treats zero and false as answers', async () => {
    const schema = {
      fields: [
        question('heading', 'section_title'),
        question('source', 'hidden'),
        question('score', 'nps'),
        question('visit', 'yes_no'),
        question('details', 'short_text', {
          visibility: {
            mode: 'show_when',
            conditions: [{ fieldId: 'visit', operator: 'equals', value: true }],
          },
        }),
      ],
    };
    wrapper = mount(SurveyFormFields, { props: { schema, answers: { score: null, visit: null } } });
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuemax')).toBe('2');
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('0');
    await wrapper.setProps({ answers: { score: 0, visit: false } });
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('2');
    await wrapper.setProps({ answers: { score: 0, visit: true } });
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuemax')).toBe('3');
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('2');
  });

  it('does not count invalid emails, empty mentions, or Other without its text', async () => {
    const schema = {
      fields: [
        question('email', 'email'),
        question('mentions', 'multiple_text', {
          settings: { mentionLabels: ['First', 'Second'], exclusiveOption: { label: 'None' } },
        }),
        question('topic', 'radio_group', {
          options: [{ key: 'other', label: 'Other', isOther: true }],
        }),
      ],
    };
    wrapper = mount(SurveyFormFields, {
      props: {
        schema,
        answers: {
          email: 'missing',
          mentions: ['', ' '],
          topic: { selected: 'other', otherText: '' },
        },
      },
    });
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('0');
    await wrapper.setProps({
      answers: {
        email: 'marina@example.com',
        mentions: { exclusive: true },
        topic: { selected: 'other', otherText: 'Transport' },
      },
    });
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('3');
  });

  it('moves keyboard focus to the next unanswered question and linked errors', async () => {
    wrapper = mount(SurveyFormFields, {
      attachTo: document.body,
      props: {
        schema: { fields: [question('name'), question('email', 'email')] },
        answers: { name: 'Marina', email: '' },
        errors: { name: 'Please review this answer.' },
      },
    });
    await wrapper.get('.survey-fields__continue').trigger('click');
    await flushPromises();
    expect(document.activeElement.id).toBe('public-field-email');
    await wrapper.get('.survey-fields__errors button').trigger('click');
    await flushPromises();
    expect(document.activeElement.id).toBe('public-field-name');
  });

  it('omits progress when disabled in the survey settings and ignores hidden errors', () => {
    wrapper = mount(SurveyFormFields, {
      props: {
        schema: {
          layout: { showProgress: false },
          fields: [question('name'), question('source', 'hidden')],
        },
        answers: {},
        errors: { source: 'Invalid' },
      },
    });
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false);
    expect(wrapper.find('.survey-fields__errors').exists()).toBe(false);
  });

  it('does not preselect zero on an unanswered score and exposes pressed state', async () => {
    wrapper = mount(PublicFieldRenderer, {
      props: { field: question('score', 'nps'), modelValue: null },
    });
    expect(wrapper.find('[aria-pressed="true"]').exists()).toBe(false);
    await wrapper.setProps({ modelValue: 0 });
    expect(wrapper.findAll('[aria-pressed="true"]')).toHaveLength(1);
    expect(wrapper.get('[aria-pressed="true"]').text()).toBe('0');
  });
});
