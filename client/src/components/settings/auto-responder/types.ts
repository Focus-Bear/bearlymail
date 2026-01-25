export interface AutoResponderConfig {
  enabled: boolean;
  sendFor: {
    standardPriority: boolean;
    highPriority: boolean;
    lowPriority: boolean;
  };
  customExclusionRules: string[];
  templates: {
    standard: string;
    highPriority: string;
    lowPriority: string;
    noAnswer: string;
    zeroBacklog: string;
  };
  qaContextEnabled: boolean;
  qaMinConfidence: number;
  maxAutoResponsesPerSender: number;
  cooldownPeriodDays: number;
}

export interface QueueStats {
  actionCount: number;
  triageCount: number;
  avgResponseTime: string;
  urgentResponseTime: string;
}

export interface AutoResponderAnalytics {
  totalSent: number;
  byPriority: { low: number; medium: number; high: number };
  qaAnswerRate: number;
  escalationRate: number;
  templateBreakdown: Record<string, number>;
}

export const DEFAULT_AUTO_RESPONDER_CONFIG: AutoResponderConfig = {
  enabled: false,
  sendFor: {
    standardPriority: true,
    highPriority: true,
    lowPriority: false,
  },
  customExclusionRules: [
    'Emails from automated systems (e.g., no-reply addresses, system notifications)',
    'Marketing newsletters and promotional emails',
    'Cold outreach that lacks genuine personalisation',
    'Obvious spam or unsolicited bulk messages',
  ],
  templates: {
    standard: '',
    highPriority: '',
    lowPriority: '',
    noAnswer: '',
    zeroBacklog: '',
  },
  qaContextEnabled: true,
  qaMinConfidence: 0.7,
  maxAutoResponsesPerSender: 1,
  cooldownPeriodDays: 7,
};
