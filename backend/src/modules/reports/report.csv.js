/**
 * Minimal RFC-4180 CSV serialiser. We avoid pulling in a runtime dependency
 * for what is essentially a 30-line transformation and keep the formatting
 * predictable so report exports look identical regardless of consumer.
 *
 * The serialiser:
 *   - quotes every cell containing a comma, quote, newline, or carriage return
 *   - escapes internal quotes by doubling them
 *   - emits CRLF line endings to match the spec
 *   - flattens nested arrays/objects through JSON.stringify so checkbox
 *     answers and other compound values survive the round-trip
 */

const CRLF = '\r\n';

const needsQuoting = (value) =>
  typeof value === 'string' && /[",\r\n]/.test(value);

const stringifyCell = (value) => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
};

const quote = (raw) => {
  const stringified = stringifyCell(raw);
  if (needsQuoting(stringified)) {
    return `"${stringified.replace(/"/g, '""')}"`;
  }
  return stringified;
};

/**
 * Serialises an array of rows to CSV given a column descriptor array.
 *
 * @param {Array<{ key: string, label?: string }>} columns
 * @param {Array<Record<string, unknown>>} rows
 * @returns {string} CSV text
 */
export const buildCsv = (columns, rows) => {
  const headerCells = columns.map((col) => quote(col.label ?? col.key));
  const lines = [headerCells.join(',')];
  for (const row of rows) {
    const cells = columns.map((col) => quote(row?.[col.key]));
    lines.push(cells.join(','));
  }
  return lines.join(CRLF) + CRLF;
};
