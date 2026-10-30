/** Standard mail ports; picking a security mode moves the port to its usual partner. */
export const IMAP_PORTS = { SSL: 993, STARTTLS: 143 } as const;
export const SMTP_PORTS = { SSL: 465, STARTTLS: 587 } as const;

export const IMAP_ENDPOINTS = {
  CONNECT: '/imap-accounts/connect',
  LIST: '/imap-accounts',
} as const;
