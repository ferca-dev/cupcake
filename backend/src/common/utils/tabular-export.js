import * as XLSX from 'xlsx';

const normaliseSheetName = (name = 'Export') =>
  String(name)
    .replace(/[:\\/?*[\]]/g, ' ')
    .trim()
    .slice(0, 31) || 'Export';

const cellValue = (value) => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return value;
};

export const buildXlsx = (columns, rows, { sheetName = 'Export' } = {}) => {
  const matrix = [
    columns.map((column) => column.label ?? column.key),
    ...rows.map((row) => columns.map((column) => cellValue(row?.[column.key]))),
  ];
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(matrix);
  worksheet['!cols'] = columns.map((column) => ({
    wch: Math.max(String(column.label ?? column.key).length + 2, 14),
  }));
  XLSX.utils.book_append_sheet(workbook, worksheet, normaliseSheetName(sheetName));
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};
