/** Input the local-model inference Lambda expects for one thread. Field names
 * match the Lambda's payload contract (see local-models/lambda_handler.py). */
export interface LocalModelThreadInput {
  threadId: string;
  subject: string;
  body: string;
  senderDomain: string;
  senderHash?: string | null;
  isReceived: boolean;
  isRead: boolean;
  hasAttachments: boolean;
  receivedAt: string;
  threadLength: number;
}

/** The Lambda's response (see local-models/model.py Prediction.to_dict). */
export interface LocalModelPrediction {
  category: string;
  categoryConfidence: number;
  categoryMargin: number;
  categoryFallback: boolean;
  family: string;
  familyConfidence: number;
  familyFallback: boolean;
  priorityBand: string;
  priorityConfidence: number;
  priorityFallback: boolean;
  /** Present when the user has no model yet (cold start). */
  reason?: string;
}
