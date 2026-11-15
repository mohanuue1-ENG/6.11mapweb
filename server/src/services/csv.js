// CSV export helpers. A cell that starts with = + - @ (or a tab/CR) would be run
// as a formula by Excel/Sheets, so such text is prefixed with an apostrophe.
export function csvCell(value) {
  if (value == null) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header, rows) {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
