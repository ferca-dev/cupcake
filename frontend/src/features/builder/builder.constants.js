// Single source of truth for the builder's field catalog. The store, the
// sidebar, and the inspector all read from here so every field type is
// described in exactly one place. Keep this list aligned with the backend's
// `FIELD_TYPES` constant in `backend/src/modules/surveys/form-schema.validator.js`.

export const FIELD_TYPES = Object.freeze([
  'short_text',
  'long_text',
  'email',
  'phone',
  'number',
  'date',
  'time',
  'select',
  'radio_group',
  'checkbox_group',
  'checkbox',
  'yes_no',
  'rating',
  'nps',
  'file_upload',
  'image_block',
  'text_block',
  'divider',
  'section_title',
  'page_break',
  'hidden',
]);

// Fields that expose a closed list of options (key/label pairs).
export const OPTIONED_FIELD_TYPES = Object.freeze(
  new Set(['select', 'radio_group', 'checkbox_group']),
);

// Fields that are purely presentational. They don't collect input, so no
// key, no validation rules, and they shouldn't show up as targets in
// conditional logic value pickers.
export const PRESENTATION_FIELD_TYPES = Object.freeze(
  new Set(['image_block', 'text_block', 'divider', 'section_title', 'page_break']),
);

export const FIELD_WIDTHS = Object.freeze(['full', 'half', 'third', 'quarter']);

// Catalog metadata consumed by the sidebar palette and the inspector. The
// `category` field drives grouping in the sidebar; the `icon` is a short
// glyph used in the palette card.
export const FIELD_CATALOG = Object.freeze([
  {
    type: 'short_text',
    label: 'Short text',
    description: 'Single line of text.',
    icon: '✎',
    category: 'input',
    defaultLabel: 'Short text',
    defaultPlaceholder: 'Type your answer',
  },
  {
    type: 'long_text',
    label: 'Long text',
    description: 'Multi-line text area.',
    icon: '¶',
    category: 'input',
    defaultLabel: 'Long text',
    defaultPlaceholder: 'Type your answer',
  },
  {
    type: 'email',
    label: 'Email',
    description: 'Validated email address.',
    icon: '@',
    category: 'input',
    defaultLabel: 'Email',
    defaultPlaceholder: 'name@example.com',
  },
  {
    type: 'phone',
    label: 'Phone',
    description: 'Phone number.',
    icon: '☎',
    category: 'input',
    defaultLabel: 'Phone',
    defaultPlaceholder: '+1 555 000 0000',
  },
  {
    type: 'number',
    label: 'Number',
    description: 'Numeric input.',
    icon: '#',
    category: 'input',
    defaultLabel: 'Number',
    defaultPlaceholder: '0',
  },
  {
    type: 'date',
    label: 'Date',
    description: 'Date picker.',
    icon: '📅',
    category: 'input',
    defaultLabel: 'Date',
    defaultPlaceholder: '',
  },
  {
    type: 'time',
    label: 'Time',
    description: 'Time picker.',
    icon: '⏰',
    category: 'input',
    defaultLabel: 'Time',
    defaultPlaceholder: '',
  },
  {
    type: 'select',
    label: 'Dropdown',
    description: 'Single choice from a list.',
    icon: '▾',
    category: 'choice',
    defaultLabel: 'Dropdown',
    defaultPlaceholder: 'Select an option',
  },
  {
    type: 'radio_group',
    label: 'Radio group',
    description: 'Single choice with visible options.',
    icon: '◉',
    category: 'choice',
    defaultLabel: 'Pick one',
    defaultPlaceholder: '',
  },
  {
    type: 'checkbox_group',
    label: 'Checkboxes',
    description: 'Multiple choices.',
    icon: '☑',
    category: 'choice',
    defaultLabel: 'Pick any',
    defaultPlaceholder: '',
  },
  {
    type: 'checkbox',
    label: 'Single checkbox',
    description: 'Boolean opt-in / consent.',
    icon: '✔',
    category: 'choice',
    defaultLabel: 'I agree',
    defaultPlaceholder: '',
  },
  {
    type: 'yes_no',
    label: 'Yes / No',
    description: 'Binary answer.',
    icon: '◐',
    category: 'choice',
    defaultLabel: 'Yes or no?',
    defaultPlaceholder: '',
  },
  {
    type: 'rating',
    label: 'Rating',
    description: '1-5 star style rating.',
    icon: '★',
    category: 'rating',
    defaultLabel: 'Rate this',
    defaultPlaceholder: '',
  },
  {
    type: 'nps',
    label: 'NPS',
    description: '0-10 Net Promoter Score.',
    icon: '⌘',
    category: 'rating',
    defaultLabel: 'How likely are you to recommend us?',
    defaultPlaceholder: '',
  },
  {
    type: 'file_upload',
    label: 'File upload',
    description: 'Upload a file (Phase 06+).',
    icon: '📎',
    category: 'advanced',
    defaultLabel: 'Upload a file',
    defaultPlaceholder: '',
  },
  {
    type: 'hidden',
    label: 'Hidden field',
    description: 'Value populated by URL or context.',
    icon: '⌐',
    category: 'advanced',
    defaultLabel: 'Hidden value',
    defaultPlaceholder: '',
  },
  {
    type: 'section_title',
    label: 'Section title',
    description: 'Visual section header.',
    icon: 'H',
    category: 'layout',
    defaultLabel: 'Section title',
    defaultPlaceholder: '',
  },
  {
    type: 'text_block',
    label: 'Text block',
    description: 'Static paragraph of text.',
    icon: 'T',
    category: 'layout',
    defaultLabel: 'Add a description for your respondents.',
    defaultPlaceholder: '',
  },
  {
    type: 'image_block',
    label: 'Image',
    description: 'Static image.',
    icon: '🖼',
    category: 'layout',
    defaultLabel: 'Image',
    defaultPlaceholder: '',
  },
  {
    type: 'divider',
    label: 'Divider',
    description: 'Visual separator.',
    icon: '—',
    category: 'layout',
    defaultLabel: '',
    defaultPlaceholder: '',
  },
  {
    type: 'page_break',
    label: 'Page break',
    description: 'Starts a new page in paginated mode.',
    icon: '↵',
    category: 'layout',
    defaultLabel: '',
    defaultPlaceholder: '',
  },
]);

export const FIELD_CATEGORIES = Object.freeze([
  { key: 'input', label: 'Inputs' },
  { key: 'choice', label: 'Choices' },
  { key: 'rating', label: 'Ratings' },
  { key: 'advanced', label: 'Advanced' },
  { key: 'layout', label: 'Layout' },
]);

const CATALOG_BY_TYPE = new Map(FIELD_CATALOG.map((entry) => [entry.type, entry]));

export const getFieldCatalogEntry = (type) => CATALOG_BY_TYPE.get(type) ?? null;
