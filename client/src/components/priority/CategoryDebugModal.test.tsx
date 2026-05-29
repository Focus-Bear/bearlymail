import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios, { AxiosError } from 'axios';

import { CategoryDebugModal } from './CategoryDebugModal';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// createPortal renders inline for tests
vi.mock('react-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-dom')>()),
  createPortal: (node: React.ReactNode) => node,
}));

vi.mock('react-i18next', () => {
  const translate = (key: string) => key;
  return {
    useTranslation: () => ({ t: translate }),
  };
});

vi.mock('config/api', () => ({ API_URL: 'http://localhost:3001' }));

vi.mock('theme/theme', () => ({
  theme: {
    spacing: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '20px' },
    colors: {
      background: { subtle: '#f5f5f5', paper: '#fff', default: '#fafafa' },
      text: { primary: '#111', secondary: '#666', tertiary: '#999' },
      border: { default: '#e0e0e0', medium: '#ccc' },
      feedback: { error: '#d32f2f', success: '#388e3c' },
      primary: { main: '#1976d2' },
      error: { main: '#d32f2f' },
      success: { main: '#388e3c', light: '#e8f5e9' },
      warning: { main: '#f57c00', light: '#fff8e1' },
      greyscale: { 400: '#bdbdbd' },
    },
    borderRadius: { sm: '4px', md: '8px', lg: '12px' },
    typography: {
      fontSize: { xs: '11px', sm: '12px', base: '14px', xl: '18px' },
      fontWeight: { medium: 500, semibold: 600 },
    },
    shadows: { md: '0 2px 8px rgba(0,0,0,0.1)' },
  },
}));

vi.mock('components/inbox/debug/AccordionGroup', () => ({
  AccordionGroup: ({ children }: { children: React.ReactNode }) => <div data-testid="accordion">{children}</div>,
}));

vi.mock('components/modal', () => ({
  ModalBackdrop: ({ children }: { children: React.ReactNode }) => <div data-testid="modal-backdrop">{children}</div>,
  ModalContent: ({ children }: { children: React.ReactNode }) => <div data-testid="modal-content">{children}</div>,
}));

vi.mock('components/modal/ModalHeaderWithClose', () => ({
  ModalHeaderWithClose: ({ title, onClose }: { title: string; onClose: () => void }) => (
    <div>
      <span>{title}</span>
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

vi.mock('./CategoryDebugPanels', () => ({
  EmailSection: () => <div data-testid="email-section" />,
  CategorySection: () => <div data-testid="category-section" />,
  UserContextSection: () => <div data-testid="user-context-section" />,
  CategoriesList: () => <div data-testid="categories-list" />,
}));

vi.mock('./CategoryDebugTracePanel', () => ({
  CategoryDebugTracePanel: () => <div data-testid="trace-panel" />,
}));

vi.mock('./categoryDebugUtils', () => ({
  formatForGithubIssue: () => 'formatted debug info',
}));

vi.mock('constants/numbers', () => ({
  OPACITY_DISABLED_ALT: 0.5,
  OPACITY_FULL: 1,
}));

function makeMfaAxiosError(errorCode: string): AxiosError {
  const err = new Error('Request failed') as AxiosError;
  err.isAxiosError = true;
  err.response = { status: 403, data: { error: errorCode }, headers: {}, config: {} as never, statusText: 'Forbidden' };
  return err;
}

const debugData = {
  email: { from: 'test@example.com', subject: 'Test', bodyPreview: 'Body', senderJobTitle: null },
  thread: { category: 'Work', categoryExplanation: 'Matched rule' },
  emailCategories: [],
  protoCategories: [],
  userContext: { urgentItems: [], notUrgentItems: [], goals: [], workingOn: [], dontCare: [] },
};

const defaultProps = {
  emailId: 'email-123',
  onClose: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedAxios.isAxiosError.mockReturnValue(false);
});

describe('CategoryDebugModal', () => {
  it('renders loading state initially', () => {
    mockedAxios.get.mockReturnValue(new Promise(() => {}));
    render(<CategoryDebugModal {...defaultProps} />);
    expect(screen.getByText('common.loading')).toBeInTheDocument();
  });

  it('renders debug data on successful load', async () => {
    mockedAxios.get.mockResolvedValue({ data: debugData });
    render(<CategoryDebugModal {...defaultProps} />);
    await waitFor(() => expect(screen.getByTestId('email-section')).toBeInTheDocument());
  });

  it('shows generic error when non-MFA fetch fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('Network error'));
    render(<CategoryDebugModal {...defaultProps} />);
    await waitFor(() =>
      expect(screen.getByText('priority.categoryDebug.fetchError')).toBeInTheDocument()
    );
  });

  it('shows MFA verification form when 403 MFA_VERIFICATION_REQUIRED returned', async () => {
    const mfaError = makeMfaAxiosError('MFA_VERIFICATION_REQUIRED');
    mockedAxios.isAxiosError.mockReturnValue(true);
    mockedAxios.get.mockRejectedValue(mfaError);

    render(<CategoryDebugModal {...defaultProps} />);

    await waitFor(() =>
      expect(screen.getByText('priority.categoryDebug.mfaRequired')).toBeInTheDocument()
    );
    expect(screen.getByLabelText('priority.categoryDebug.mfaTokenLabel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'priority.categoryDebug.mfaVerify' })).toBeInTheDocument();
  });

  it('shows MFA setup required message when 403 MFA_SETUP_REQUIRED returned', async () => {
    const setupError = makeMfaAxiosError('MFA_SETUP_REQUIRED');
    mockedAxios.isAxiosError.mockReturnValue(true);
    mockedAxios.get.mockRejectedValue(setupError);

    render(<CategoryDebugModal {...defaultProps} />);

    await waitFor(() =>
      expect(screen.getByText('priority.categoryDebug.mfaSetupRequired')).toBeInTheDocument()
    );
    expect(screen.queryByLabelText('priority.categoryDebug.mfaTokenLabel')).not.toBeInTheDocument();
  });

  it('verify button is disabled until 6 digits are entered', async () => {
    const mfaError = makeMfaAxiosError('MFA_VERIFICATION_REQUIRED');
    mockedAxios.isAxiosError.mockReturnValue(true);
    mockedAxios.get.mockRejectedValue(mfaError);

    render(<CategoryDebugModal {...defaultProps} />);

    await waitFor(() =>
      expect(screen.getByLabelText('priority.categoryDebug.mfaTokenLabel')).toBeInTheDocument()
    );

    const verifyButton = screen.getByRole('button', { name: 'priority.categoryDebug.mfaVerify' });
    expect(verifyButton).toBeDisabled();

    const input = screen.getByLabelText('priority.categoryDebug.mfaTokenLabel');
    fireEvent.change(input, { target: { value: '12345' } });
    expect(verifyButton).toBeDisabled();

    fireEvent.change(input, { target: { value: '123456' } });
    expect(verifyButton).not.toBeDisabled();
  });

  it('retries load after successful MFA verification', async () => {
    const mfaError = makeMfaAxiosError('MFA_VERIFICATION_REQUIRED');
    mockedAxios.isAxiosError.mockReturnValue(true);
    mockedAxios.get.mockRejectedValue(mfaError);

    render(<CategoryDebugModal {...defaultProps} />);

    await waitFor(() =>
      expect(screen.getByLabelText('priority.categoryDebug.mfaTokenLabel')).toBeInTheDocument()
    );

    mockedAxios.post.mockResolvedValue({ data: { access_token: 'elevated-token' } });
    mockedAxios.get.mockResolvedValue({ data: debugData });

    const input = screen.getByLabelText('priority.categoryDebug.mfaTokenLabel');
    fireEvent.change(input, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'priority.categoryDebug.mfaVerify' }));

    await waitFor(() =>
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:3001/auth/mfa/verify',
        { token: '123456' }
      )
    );
    await waitFor(() => expect(screen.getByTestId('email-section')).toBeInTheDocument());
  });

  it('shows MFA error message on invalid code', async () => {
    const mfaError = makeMfaAxiosError('MFA_VERIFICATION_REQUIRED');
    mockedAxios.isAxiosError.mockReturnValue(true);
    mockedAxios.get.mockRejectedValue(mfaError);

    render(<CategoryDebugModal {...defaultProps} />);

    await waitFor(() =>
      expect(screen.getByLabelText('priority.categoryDebug.mfaTokenLabel')).toBeInTheDocument()
    );

    mockedAxios.post.mockRejectedValue(new Error('Invalid code'));

    const input = screen.getByLabelText('priority.categoryDebug.mfaTokenLabel');
    fireEvent.change(input, { target: { value: '999999' } });
    fireEvent.click(screen.getByRole('button', { name: 'priority.categoryDebug.mfaVerify' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('priority.categoryDebug.mfaError')
    );
  });

  it('strips non-digit characters from MFA input', async () => {
    const mfaError = makeMfaAxiosError('MFA_VERIFICATION_REQUIRED');
    mockedAxios.isAxiosError.mockReturnValue(true);
    mockedAxios.get.mockRejectedValue(mfaError);

    render(<CategoryDebugModal {...defaultProps} />);

    await waitFor(() =>
      expect(screen.getByLabelText('priority.categoryDebug.mfaTokenLabel')).toBeInTheDocument()
    );

    const input = screen.getByLabelText('priority.categoryDebug.mfaTokenLabel') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'abc123def' } });
    expect(input.value).toBe('123');
  });
});
