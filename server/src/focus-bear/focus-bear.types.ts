/** `POST /mcp/tasks/suggest-project` on the Focus Bear API. */
export interface FocusBearProjectOption {
  id: string;
  name: string;
}

export interface FocusBearProjectSuggestionResponse {
  project: (FocusBearProjectOption & { confidence: number }) | null;
  min_confidence: number;
  projects: FocusBearProjectOption[];
}

/** `GET /mcp/tasks/next-free-date` on the Focus Bear API. */
export interface FocusBearNextFreeDateResponse {
  date: string | null;
  duration_minutes: number;
  free_minutes: number | null;
  full_working_days: number;
  search_days: number;
  timezone: string;
}

export interface FocusBearTaskToFile {
  title: string;
  description?: string;
  emailSubject?: string;
  sender?: string;
}

/** What "Save to Focus Bear" pre-fills: a suggested project and due date, each null when there is none. */
export interface FocusBearTaskSuggestions {
  connected: boolean;
  project: (FocusBearProjectOption & { confidence: number }) | null;
  projects: FocusBearProjectOption[];
  /** `YYYY-MM-DD` in the user's Focus Bear timezone. */
  dueDate: string | null;
}

export class FocusBearApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "FocusBearApiError";
  }
}
