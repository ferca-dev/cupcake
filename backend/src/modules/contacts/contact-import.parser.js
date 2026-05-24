import ExcelJS from 'exceljs';

import { ValidationError } from '../../common/errors/index.js';

export const CONTACT_IMPORT_FIELDS = Object.freeze([
  'firstName',
  'lastName',
  'fullName',
  'email',
  'phone',
  'whatsappPhone',
  'tags',
  'groups',
  'metadata',
  'status',
  'emailConsent',
  'smsConsent',
  'whatsappConsent',
]);

export const CONTACT_IMPORT_DEDUPE_KEYS = Object.freeze(['email', 'phone', 'whatsappPhone']);

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const FIELD_ALIASES = Object.freeze({
  firstName: ['first name', 'firstname', 'given name', 'nombre'],
  lastName: ['last name', 'lastname', 'surname', 'family name', 'apellido'],
  fullName: ['name', 'full name', 'fullname', 'contact name', 'nombre completo'],
  email: ['email', 'email address', 'mail', 'correo', 'correo electronico'],
  phone: ['phone', 'phone number', 'mobile', 'sms', 'telefono', 'teléfono'],
  whatsappPhone: [
    'whatsapp',
    'whatsapp phone',
    'whatsapp number',
    'wa phone',
    'telefono whatsapp',
    'teléfono whatsapp',
  ],
  tags: ['tags', 'tag', 'labels', 'etiquetas'],
  groups: ['groups', 'group', 'group names', 'group ids', 'segment', 'grupos'],
  metadata: ['metadata', 'meta', 'custom fields', 'custom data', 'datos extra'],
  status: ['status', 'contact status', 'estado'],
  emailConsent: ['email consent', 'email consent status', 'consent email', 'correo consentimiento'],
  smsConsent: ['sms consent', 'sms consent status', 'consent sms'],
  whatsappConsent: [
    'whatsapp consent',
    'whatsapp consent status',
    'consent whatsapp',
    'wa consent',
  ],
});

const aliasLookup = new Map(
  Object.entries(FIELD_ALIASES).flatMap(([field, aliases]) =>
    aliases.map((alias) => [alias.replace(/\s+/g, ''), field]),
  ),
);

const trimCell = (value) => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
};

const isBlankRow = (row) => row.every((cell) => trimCell(cell) === '');

const normaliseHeaderKey = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

export const detectImportFormat = ({ originalName = '', mimeType = '' } = {}) => {
  const lowerName = originalName.toLowerCase();
  if (mimeType === XLSX_MIME || lowerName.endsWith('.xlsx')) return 'xlsx';
  if (
    mimeType === 'text/csv' ||
    mimeType === 'application/csv' ||
    mimeType === 'application/vnd.ms-excel' ||
    lowerName.endsWith('.csv')
  ) {
    return 'csv';
  }
  throw new ValidationError('Unsupported import file type', [
    { path: ['file'], message: 'Upload a CSV or XLSX file' },
  ]);
};

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }

  if (inQuotes) {
    throw new ValidationError('Invalid CSV file', [
      { path: ['file'], message: 'CSV contains an unterminated quoted value' },
    ]);
  }

  row.push(cell);
  rows.push(row);
  return rows;
};

const excelCellValue = (value) => {
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if (value.text !== undefined) return value.text;
    if (value.hyperlink && value.text) return value.text;
    if (Array.isArray(value.richText))
      return value.richText.map((part) => part.text ?? '').join('');
    if (value.result !== undefined) return value.result;
  }
  return value;
};

const parseXlsx = async (buffer) => {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new ValidationError('Invalid XLSX file', [
      { path: ['file'], message: 'The uploaded workbook could not be read' },
    ]);
  }
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new ValidationError('Invalid XLSX file', [
      { path: ['file'], message: 'The workbook does not contain any sheets' },
    ]);
  }
  const rows = [];
  const columnCount = worksheet.columnCount;
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values = [];
    for (let index = 1; index <= columnCount; index += 1) {
      values.push(excelCellValue(row.getCell(index).value));
    }
    rows.push(values);
  });
  return rows;
};

const normaliseMatrix = (matrix) =>
  matrix
    .map((row) => (Array.isArray(row) ? row.map(trimCell) : []))
    .filter((row) => !isBlankRow(row));

export const suggestColumnMapping = (headers) => {
  const mapping = {};
  for (const header of headers) {
    const field = aliasLookup.get(normaliseHeaderKey(header));
    if (field && !mapping[field]) mapping[field] = header;
  }
  return mapping;
};

const buildSampleRows = ({ headers, rows, limit = 5 }) =>
  rows
    .slice(0, limit)
    .map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, row.values[index] ?? ''])),
    );

export const parseContactImportBuffer = async ({ buffer, originalName, mimeType }) => {
  const format = detectImportFormat({ originalName, mimeType });
  const matrix =
    format === 'xlsx'
      ? normaliseMatrix(await parseXlsx(buffer))
      : normaliseMatrix(parseCsv(buffer.toString('utf8').replace(/^\uFEFF/, '')));

  if (matrix.length < 2) {
    throw new ValidationError('Import file must include headers and at least one data row', [
      { path: ['file'], message: 'Add a header row and at least one contact row' },
    ]);
  }

  const headers = matrix[0].map((header, index) => header || `Column ${index + 1}`);
  const rows = matrix.slice(1).map((values, index) => ({
    rowNumber: index + 2,
    values: headers.map((_, valueIndex) => trimCell(values[valueIndex])),
  }));

  if (headers.every((header) => !header.trim())) {
    throw new ValidationError('Import file has no readable headers', [
      { path: ['file'], message: 'Add a non-empty header row' },
    ]);
  }

  return {
    format,
    headers,
    rows,
    sampleRows: buildSampleRows({ headers, rows }),
    suggestedMapping: suggestColumnMapping(headers),
  };
};
