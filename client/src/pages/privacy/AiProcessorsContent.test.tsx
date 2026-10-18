import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AI_PROCESSORS, AiProcessorsContent, OutsideAustraliaContent } from 'pages/privacy/AiProcessorsContent';

describe('AiProcessorsContent', () => {
  it('names every AI processor with a link to its terms', () => {
    render(<AiProcessorsContent />);

    for (const name of ['TypeSafe AI (Jev)', 'Google Gemini (paid Gemini API)', 'OpenAI']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(screen.getByText('Amazon Bedrock (Amazon Nova models, run by AWS)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'TypeSafe privacy policy' })).toHaveAttribute(
      'href',
      'https://typesafe.ai/legal/privacy-policy',
    );
    expect(screen.getByRole('link', { name: 'Gemini API additional terms' })).toHaveAttribute('target', '_blank');
  });

  it('says where each provider processes email outside Australia', () => {
    render(<OutsideAustraliaContent />);

    for (const processor of AI_PROCESSORS) {
      expect(screen.getByText(`${processor.name}:`)).toBeInTheDocument();
    }
    expect(screen.getAllByText('United States')).toHaveLength(2);
  });
});
