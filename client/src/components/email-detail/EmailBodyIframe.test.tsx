import React from 'react';
import { render } from '@testing-library/react';

import { EmailBodyIframe } from './EmailBodyIframe';

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
