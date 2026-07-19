/** Returns true if the clipboard HTML contains a table element (e.g. pasted from Excel or Google Sheets). */
export function clipboardHtmlHasTable(clipboardData: DataTransfer | null): boolean {
  if (!clipboardData) {
    return false;
  }
  const html = clipboardData.getData('text/html');
  return /<table[\s>]/i.test(html);
}
