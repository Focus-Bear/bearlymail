import { OVERLAY_VIEWPORT_MARGIN_PX, overlayWidthBounds } from './layout';

describe('overlayWidthBounds', () => {
  it('caps both min and max at the viewport minus a margin so overlays never overflow a narrow phone', () => {
    const { minWidth, maxWidth } = overlayWidthBounds(300, 400);
    const cap = `calc(100vw - ${OVERLAY_VIEWPORT_MARGIN_PX}px)`;
    expect(minWidth).toBe(`min(300px, ${cap})`);
    expect(maxWidth).toBe(`min(400px, ${cap})`);
  });

  it('keeps the requested px on wide screens (the min() resolves to the px there)', () => {
    // min(320px, calc(100vw - 32px)) === 320px whenever the viewport is >= 352px.
    expect(overlayWidthBounds(320, 400).minWidth).toContain('320px');
  });
});
