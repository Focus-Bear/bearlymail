import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AiProcessorsContent } from 'pages/privacy/AiProcessorsContent';

describe('AiProcessorsContent', () => {
  it('names every AI processor with a link to its terms', () => {
    render(<AiProcessorsContent />);

    for (const name of ['TypeSafe AI (Jev)', 'Google Gemini (Gemini API)', 'OpenAI']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(screen.getByText('Amazon Bedrock (Amazon Nova models, run by AWS)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'TypeSafe privacy policy' })).toHaveAttribute(
      'href',
      'https://typesafe.ai/legal/privacy-policy',
    );
    expect(screen.getByRole('link', { name: 'Gemini API additional terms' })).toHaveAttribute('target', '_blank');
  });
});
