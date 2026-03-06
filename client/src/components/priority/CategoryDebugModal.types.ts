export interface CategoryDebugData {
  email: {
    from: string;
    fromName: string;
    senderJobTitle: string;
    subject: string;
    bodyPreview: string;
  };
  thread: {
    category: string | null;
    categoryExplanation: string | null;
  };
  emailCategories: Array<{ name: string; description?: string }>;
  protoCategories: Array<{ name: string; description?: string }>;
  userContext: {
    urgentItems: Array<{ value: string; explanation?: string }>;
    notUrgentItems: Array<{ value: string; explanation?: string }>;
    goals: Array<{ value: string; priority?: number }>;
    workingOn: Array<{ value: string; priority?: number }>;
    dontCare: Array<{ value: string }>;
  };
}

export interface CategoryDebugModalProps {
  emailId: string;
  onClose: () => void;
}
