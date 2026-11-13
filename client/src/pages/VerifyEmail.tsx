import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';

import { VERIFY_EMAIL_STATUS, VerifyEmailStatus, VerifyEmailView } from 'components/auth/VerifyEmailView';
import { API_URL } from 'config/api';
import { resendVerificationEmail } from 'contexts/AuthContext';

/** Landing page for the emailed verification link: `/verify-email?token=…`. */
const VerifyEmail: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<VerifyEmailStatus>(
    token ? VERIFY_EMAIL_STATUS.VERIFYING : VERIFY_EMAIL_STATUS.FAILED
  );
  // StrictMode runs effects twice in dev; a token can only be redeemed once.
  const submittedToken = useRef<string | null>(null);

  useEffect(() => {
    if (!token || submittedToken.current === token) {
      return;
    }
    submittedToken.current = token;
    axios
      .post(`${API_URL}/auth/verify-email`, { token })
      .then(() => setStatus(VERIFY_EMAIL_STATUS.VERIFIED))
      .catch(() => setStatus(VERIFY_EMAIL_STATUS.FAILED));
  }, [token]);

  return <VerifyEmailView status={status} onResend={resendVerificationEmail} />;
};

export default VerifyEmail;
