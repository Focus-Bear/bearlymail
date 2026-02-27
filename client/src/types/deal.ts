export interface Deal {
  id: string;
  title: string;
  details: string | null;
  value: number | null;
  currency: string | null;
  expectedCloseDate: string | null;
  stageId: string | null;
  stageName: string | null;
  contactId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface DealStage {
  id: string;
  name: string;
  sortOrder: number;
  color: string | null;
  isWon: boolean;
  isLost: boolean;
}

export interface KanbanBoard {
  stages: DealStage[];
  deals: Record<string, Deal[]>;
  totals: Record<string, number>;
}
