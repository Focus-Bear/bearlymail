import { clipboardHtmlHasTable } from 'utils/clipboardUtils';

function makeDataTransfer(html: string): DataTransfer {
  return {
    getData: (type: string) => (type === 'text/html' ? html : ''),
  } as unknown as DataTransfer;
}

describe('clipboardHtmlHasTable', () => {
  it('returns false for null clipboard data', () => {
    expect(clipboardHtmlHasTable(null)).toBe(false);
  });

  it('returns false when clipboard has no HTML', () => {
    const dt = { getData: () => '' } as unknown as DataTransfer;
    expect(clipboardHtmlHasTable(dt)).toBe(false);
  });

  it('returns false for HTML without a table', () => {
    const html = '<p>Hello <strong>world</strong></p>';
    expect(clipboardHtmlHasTable(makeDataTransfer(html))).toBe(false);
  });

  it('returns true for a simple HTML table', () => {
    const html = '<table><tr><td>A</td><td>B</td></tr></table>';
    expect(clipboardHtmlHasTable(makeDataTransfer(html))).toBe(true);
  });

  it('returns true for Excel HTML with MS Office namespaces', () => {
    const excelHtml = `<html xmlns:v="urn:schemas-microsoft-com:vml"
xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:x="urn:schemas-microsoft-com:office:excel"
xmlns="http://www.w3.org/TR/REC-html40">
<body>
<table><tr><td>Session</td><td>Date</td></tr><tr><td>1</td><td>26 May 2026</td></tr></table>
</body></html>`;
    expect(clipboardHtmlHasTable(makeDataTransfer(excelHtml))).toBe(true);
  });

  it('returns true for Google Sheets HTML', () => {
    const sheetsHtml =
      '<google-sheets-html-origin><table><tbody><tr><td>Col1</td><td>Col2</td></tr></tbody></table></google-sheets-html-origin>';
    expect(clipboardHtmlHasTable(makeDataTransfer(sheetsHtml))).toBe(true);
  });

  it('returns true for table with attributes on the tag', () => {
    const html = '<table border="1" cellpadding="4"><tr><td>X</td></tr></table>';
    expect(clipboardHtmlHasTable(makeDataTransfer(html))).toBe(true);
  });
});
