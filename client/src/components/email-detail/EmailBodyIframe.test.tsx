import React from 'react';
import { act, render } from '@testing-library/react';

import { EmailBodyIframe, nextIframeHeight } from './EmailBodyIframe';

const SRCDOC_URL = 'about:srcdoc';
const MIN_HEIGHT = 320;
const ONE_FRAME_MS = 20;

interface FakeEmailDocument {
  doc: Document;
  setContentHeight: (height: number) => void;
}

/**
 * Stands in for the parsed srcdoc document (jsdom never navigates an iframe to its srcdoc).
 * readyState stays `interactive`, as it does in a browser while a tracking pixel is still loading
 * and the iframe's `load` event has not fired.
 */
function installFakeEmailDocument(iframe: HTMLIFrameElement, initialContentHeight: number): FakeEmailDocument {
  const doc = document.implementation.createHTMLDocument('');
  let contentHeight = initialContentHeight;
  Object.defineProperty(doc, 'URL', { value: SRCDOC_URL });
  Object.defineProperty(doc, 'readyState', { value: 'interactive' });
  Object.defineProperty(doc.body, 'scrollHeight', { get: () => contentHeight });
  Object.defineProperty(doc.body, 'scrollWidth', { value: 600 });
  Object.defineProperty(iframe, 'contentDocument', { get: () => doc });
  return { doc, setContentHeight: height => (contentHeight = height) };
}

function renderedIframe(container: HTMLElement): HTMLIFrameElement {
  const iframe = container.querySelector('iframe');
  if (!iframe) {
    throw new Error('EmailBodyIframe rendered no iframe');
  }
  return iframe;
}

function iframeHeight(iframe: HTMLIFrameElement): number {
  return Number.parseFloat(iframe.style.height);
}

function advanceFrames(count = 1) {
  act(() => {
    vi.advanceTimersByTime(ONE_FRAME_MS * count);
  });
}

describe('EmailBodyIframe', () => {
  it('injects a muted hr rule so quoted-reply separators are not stark bars', () => {
    const { container } = render(
      <EmailBodyIframe html={'<p>Hi</p><hr style="display:inline-block;width:98%"><p>Quoted</p>'} />,
    );
    const iframe = container.querySelector('iframe');
    const srcDoc = iframe?.getAttribute('srcdoc') ?? '';

    // The email's own hr is preserved in the body...
    expect(srcDoc).toContain('<hr');
    // ...and our stylesheet normalises it (overriding the inline display/width hacks).
    expect(srcDoc).toMatch(/hr\s*\{[^}]*border-top:\s*1px solid[^}]*!important/);
  });

  it('forces a light color-scheme so the email does not inherit the OS dark mode', () => {
    const { container } = render(<EmailBodyIframe html={'<p>Hi</p>'} />);
    const iframe = container.querySelector('iframe');
    const srcDoc = iframe?.getAttribute('srcdoc') ?? '';

    expect(srcDoc).toContain('<meta name="color-scheme" content="light">');
    expect(srcDoc).toMatch(/color-scheme:\s*light/);
  });
});

describe('EmailBodyIframe sizing', () => {
  let resizeCallbacks: ResizeObserverCallback[];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    resizeCallbacks = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallbacks.push(callback);
        }
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('expands to the full email as soon as it is parsed, without waiting for every image to load', () => {
    const { container } = render(<EmailBodyIframe html="<p>Newsletter</p>" minHeight={MIN_HEIGHT} />);
    const iframe = renderedIframe(container);
    installFakeEmailDocument(iframe, 2000);

    // No iframe `load` event: a tracking pixel is holding the document open.
    advanceFrames();

    expect(iframeHeight(iframe)).toBeGreaterThanOrEqual(2000);
  });

  it('grows when an image finishes loading after the email is shown', () => {
    const { container } = render(<EmailBodyIframe html="<p>Newsletter</p>" minHeight={MIN_HEIGHT} />);
    const iframe = renderedIframe(container);
    const { doc, setContentHeight } = installFakeEmailDocument(iframe, 800);
    advanceFrames();
    expect(iframeHeight(iframe)).toBeGreaterThanOrEqual(800);

    const image = doc.createElement('img');
    doc.body.appendChild(image);
    setContentHeight(1600);
    act(() => {
      image.dispatchEvent(new Event('load'));
    });
    advanceFrames();

    // Taller than the content, so the email never gets its own inner scrollbar.
    expect(iframeHeight(iframe)).toBeGreaterThanOrEqual(1600);
  });

  it('does not keep growing when the email pins its body to the iframe height', () => {
    const { container } = render(<EmailBodyIframe html="<p>Pinned</p>" minHeight={MIN_HEIGHT} />);
    const iframe = renderedIframe(container);
    const doc = document.implementation.createHTMLDocument('');
    Object.defineProperty(doc, 'URL', { value: SRCDOC_URL });
    // `html, body { height: 100% }`: the body always reports the iframe's own height.
    Object.defineProperty(doc.body, 'scrollHeight', { get: () => iframeHeight(iframe) });
    Object.defineProperty(iframe, 'contentDocument', { get: () => doc });

    act(() => {
      iframe.dispatchEvent(new Event('load'));
    });
    for (let resize = 0; resize < 5; resize += 1) {
      act(() => {
        resizeCallbacks.forEach(callback => callback([], {} as ResizeObserver));
      });
      advanceFrames();
    }

    expect(iframeHeight(iframe)).toBe(MIN_HEIGHT);
  });
});

describe('nextIframeHeight', () => {
  it('grows to fit content that would overflow', () => {
    expect(nextIframeHeight(1000, 400, MIN_HEIGHT)).toBe(1010);
  });

  it('keeps its height when the content still fits within the buffer', () => {
    expect(nextIframeHeight(1005, 1010, MIN_HEIGHT)).toBe(1010);
  });

  it('shrinks when the content becomes clearly smaller, but never below the minimum', () => {
    expect(nextIframeHeight(500, 1010, MIN_HEIGHT)).toBe(510);
    expect(nextIframeHeight(50, 1010, MIN_HEIGHT)).toBe(MIN_HEIGHT);
  });
});
