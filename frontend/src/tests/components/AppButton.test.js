import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import AppButton from '../../components/ui/AppButton.vue';

describe('AppButton', () => {
  it('renders the default slot label', () => {
    const wrapper = mount(AppButton, { slots: { default: 'Save changes' } });
    expect(wrapper.text()).toBe('Save changes');
  });

  it('applies variant + size classes', () => {
    const wrapper = mount(AppButton, {
      props: { variant: 'danger', size: 'lg' },
      slots: { default: 'Delete' },
    });
    expect(wrapper.classes()).toContain('app-button--danger');
    expect(wrapper.classes()).toContain('app-button--lg');
  });

  it('disables interaction while loading', async () => {
    const wrapper = mount(AppButton, {
      props: { loading: true },
      slots: { default: 'Submit' },
    });
    expect(wrapper.attributes('aria-busy')).toBe('true');
    expect(wrapper.attributes('disabled')).toBeDefined();
    expect(wrapper.find('.app-button__spinner').exists()).toBe(true);

    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toBeUndefined();
  });

  it('emits click when enabled', async () => {
    const wrapper = mount(AppButton, { slots: { default: 'OK' } });
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
  });
});
