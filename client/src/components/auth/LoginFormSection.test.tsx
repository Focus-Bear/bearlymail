import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';

import { LoginFormSection } from './LoginFormSection';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock theme
vi.mock('theme/theme', () => ({
  theme: {
    spacing: { sm: '4px', md: '8px', lg: '16px', '2xl': '32px' },
    colors: {
      background: { paper: '#fff' },
      text: { primary: '#000', secondary: '#666' },
      border: { medium: '#ccc', light: '#eee' },
      primary: { main: '#007bff', dark: '#0056b3' },
      accent: { error: '#dc3545' },
    },
    borderRadius: { md: '4px', lg: '8px' },
    typography: {
      fontSize: { sm: '14px', base: '16px', '2xl': '24px' },
      fontWeight: { medium: 500, semibold: 600, bold: 700 },
      fontFamily: 'sans-serif',
    },
    shadows: { lg: '0 4px 6px rgba(0,0,0,0.1)' },
  },
}));

const defaultProps = {
  email: '',
  password: '',
  error: '',
  onEmailChange: vi.fn(),
  onPasswordChange: vi.fn(),
  onSubmit: vi.fn(),
  onGoogleLogin: vi.fn(),
  onMicrosoftLogin: vi.fn(),
  onZohoLogin: vi.fn(),
};

describe('LoginFormSection accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderInRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

  it('email label has htmlFor linking to email input id', () => {
    renderInRouter(<LoginFormSection {...defaultProps} />);
    const emailInput = screen.getByRole('textbox', { name: /auth\.email/i });
    expect(emailInput).toBeInTheDocument();
    expect(emailInput).toHaveAttribute('id', 'login-email');
  });

  it('password label has htmlFor linking to password input id', () => {
    renderInRouter(<LoginFormSection {...defaultProps} />);
    // password inputs don't have role textbox, use getByLabelText
    const passwordInput = screen.getByLabelText(/auth\.password/i);
    expect(passwordInput).toBeInTheDocument();
    expect(passwordInput).toHaveAttribute('id', 'login-password');
  });

  it('email input has correct name and autoComplete attributes', () => {
    renderInRouter(<LoginFormSection {...defaultProps} />);
    const emailInput = screen.getByRole('textbox', { name: /auth\.email/i });
    expect(emailInput).toHaveAttribute('name', 'email');
    expect(emailInput).toHaveAttribute('autocomplete', 'email');
  });

  it('password input has correct name and autoComplete attributes', () => {
    renderInRouter(<LoginFormSection {...defaultProps} />);
    const passwordInput = screen.getByLabelText(/auth\.password/i);
    expect(passwordInput).toHaveAttribute('name', 'password');
    expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('email label is programmatically linked to email input via getByLabelText', () => {
    renderInRouter(<LoginFormSection {...defaultProps} />);
    // getByLabelText will throw if label is not properly linked to input
    expect(screen.getByLabelText(/auth\.email/i)).toBeInTheDocument();
  });

  it('error div has role=alert and aria-live=polite when error is present', () => {
    renderInRouter(<LoginFormSection {...defaultProps} error="Invalid email or password" />);
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveAttribute('aria-live', 'polite');
    expect(alert).toHaveTextContent('Invalid email or password');
  });

  it('error div is not rendered when error is empty', () => {
    renderInRouter(<LoginFormSection {...defaultProps} error="" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('"Forgot password?" link renders and points to /forgot-password', () => {
    renderInRouter(<LoginFormSection {...defaultProps} />);
    const forgotLink = screen.getByRole('link', { name: /auth\.forgotPasswordLink/i });
    expect(forgotLink).toBeInTheDocument();
    expect(forgotLink).toHaveAttribute('href', '/forgot-password');
  });
});
