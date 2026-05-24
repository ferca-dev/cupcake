import ExcelJS from 'exceljs';

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

export const buildXlsx = async (columns, rows, { sheetName = 'Export' } = {}) => {
  const matrix = [
    columns.map((column) => column.label ?? column.key),
    ...rows.map((row) => columns.map((column) => cellValue(row?.[column.key]))),
  ];
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(normaliseSheetName(sheetName));
  worksheet.addRows(matrix);
  worksheet.columns = columns.map((column) => ({
    width: Math.max(String(column.label ?? column.key).length + 2, 14),
  }));
  return Buffer.from(await workbook.xlsx.writeBuffer());
};
