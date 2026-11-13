import { toPrintSafeEmailHtml } from './printSafeEmailHtml';

function parse(html: string): HTMLDivElement {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container;
}

describe('toPrintSafeEmailHtml', () => {
  it('returns an empty string for empty input', () => {
    expect(toPrintSafeEmailHtml('')).toBe('');
  });

  it('removes <style> and <link> elements but keeps the content', () => {
    const result = parse(
      toPrintSafeEmailHtml(
        '<style>body { display: none; }</style><link rel="stylesheet" href="https://x.test/a.css"><p>Hello</p>'
      )
    );
    expect(result.querySelector('style')).toBeNull();
    expect(result.querySelector('link')).toBeNull();
    expect(result.textContent).toBe('Hello');
  });

  it('drops id, class and background attributes', () => {
    const result = parse(
      toPrintSafeEmailHtml(
        '<table background="https://x.test/bg.png"><tr><td id="root" class="nav-bar">Cell</td></tr></table>'
      )
    );
    expect(result.querySelector('[id]')).toBeNull();
    expect(result.querySelector('[class]')).toBeNull();
    expect(result.querySelector('[background]')).toBeNull();
    expect(result.textContent).toBe('Cell');
  });

  it('strips url() values and positioning from inline styles but keeps harmless declarations', () => {
    const result = parse(
      toPrintSafeEmailHtml(
        '<div style="color: red; background-image: url(https://x.test/p.gif); position: fixed; z-index: 9999">Hi</div>'
      )
    );
    const div = result.querySelector('div') as HTMLDivElement;
    expect(div.style.color).toBe('red');
    expect(div.getAttribute('style')).not.toMatch(/url\(/i);
    expect(div.style.position).toBe('');
    expect(div.style.zIndex).toBe('');
  });

  it('strips url() values set through shorthand properties', () => {
    const result = parse(
      toPrintSafeEmailHtml('<span style="background: url(\'https://x.test/p.gif\') no-repeat">Hi</span>')
    );
    expect(result.innerHTML).not.toMatch(/url\(/i);
    expect(result.textContent).toBe('Hi');
  });

  it('removes the style attribute when no safe declarations remain', () => {
    const result = parse(toPrintSafeEmailHtml('<span style="position: fixed; z-index: 10">Hi</span>'));
    expect(result.querySelector('span')?.hasAttribute('style')).toBe(false);
  });

  it('keeps links, images and text formatting intact', () => {
    const result = parse(
      toPrintSafeEmailHtml(
        '<p><strong>Bold</strong> <a href="https://example.com">link</a> <img src="https://example.com/a.png" alt="a"></p>'
      )
    );
    expect(result.querySelector('strong')?.textContent).toBe('Bold');
    expect(result.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
    expect(result.querySelector('img')?.getAttribute('src')).toBe('https://example.com/a.png');
  });
});
