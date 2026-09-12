function csvCell(value) {
  if (value == null) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function rowsToCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

module.exports = {
  csvCell,
  rowsToCsv,
};
