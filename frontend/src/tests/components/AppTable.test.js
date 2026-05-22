import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import AppTable from '../../components/ui/AppTable.vue';

const baseColumns = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
];

describe('AppTable', () => {
  it('renders header labels and row cells', () => {
    const wrapper = mount(AppTable, {
      props: {
        columns: baseColumns,
        rows: [{ id: '1', name: 'Ada', email: 'ada@example.com' }],
      },
    });
    expect(wrapper.findAll('th').map((th) => th.text())).toEqual(['Name', 'Email']);
    expect(wrapper.findAll('tbody td').map((td) => td.text())).toEqual(['Ada', 'ada@example.com']);
  });

  it('renders the empty state when there are no rows', () => {
    const wrapper = mount(AppTable, {
      props: { columns: baseColumns, rows: [], empty: 'No contacts yet.' },
    });
    expect(wrapper.text()).toContain('No contacts yet.');
  });

  it('renders the loading state when loading and no rows', () => {
    const wrapper = mount(AppTable, {
      props: { columns: baseColumns, rows: [], loading: true },
    });
    expect(wrapper.attributes('aria-busy')).toBe('true');
    expect(wrapper.find('.app-table__state').text()).toBe('Loading…');
  });

  it('renders the error state when error is provided and no rows', () => {
    const wrapper = mount(AppTable, {
      props: { columns: baseColumns, rows: [], error: 'Network is down' },
    });
    const state = wrapper.find('.app-table__state--error');
    expect(state.exists()).toBe(true);
    expect(state.text()).toContain('Network is down');
  });

  it('applies maxHeight inline and the scroll modifier class', () => {
    const wrapper = mount(AppTable, {
      props: { columns: baseColumns, rows: [], maxHeight: '40vh' },
    });
    expect(wrapper.element.style.maxHeight).toBe('40vh');
    expect(wrapper.classes()).toContain('app-table--scroll-y');
  });

  it('uses sticky column header markup for vertical scrolling', () => {
    const wrapper = mount(AppTable, {
      props: { columns: baseColumns, rows: [{ id: '1', name: 'Ada', email: 'a@b.c' }] },
    });
    const header = wrapper.find('thead');
    expect(header.exists()).toBe(true);
    // The scoped CSS makes `th` sticky. Verify the markup we depend on is present.
    expect(wrapper.findAll('th')).toHaveLength(2);
    expect(wrapper.find('thead tr').exists()).toBe(true);
  });

  it('supports cell scoped slots that receive the row and value', () => {
    const Parent = {
      components: { AppTable },
      data() {
        return {
          columns: baseColumns,
          rows: [{ id: '1', name: 'Ada', email: 'ada@example.com' }],
        };
      },
      template: `
        <AppTable :columns="columns" :rows="rows">
          <template #[\`cell:email\`]="{ row }">
            <a class="mail-link" :href="'mailto:' + row.email">{{ row.email }}</a>
          </template>
        </AppTable>
      `,
    };
    const wrapper = mount(Parent);
    const link = wrapper.find('.mail-link');
    expect(link.exists()).toBe(true);
    expect(link.attributes('href')).toBe('mailto:ada@example.com');
    expect(link.text()).toBe('ada@example.com');
  });

  it('honors sticky column markers via CSS class hooks', () => {
    const wrapper = mount(AppTable, {
      props: {
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'actions', label: 'Actions', sticky: 'right' },
        ],
        rows: [{ id: '1', name: 'Ada', actions: 'edit' }],
      },
    });
    const stickyCells = wrapper.findAll('.app-table__cell--sticky-right');
    // One header cell + one body cell get the sticky-right class.
    expect(stickyCells.length).toBeGreaterThanOrEqual(2);
  });
});
