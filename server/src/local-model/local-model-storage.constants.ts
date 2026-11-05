/** Key layout of the models bucket; must match local-models/train_job.py and lambda_handler.py. */
export const TRAINING_DATA_PREFIX = "training-data/";
export const MODELS_PREFIX = "models/";
export const LEGACY_MODEL_EXTENSION = ".joblib";
export const TRAINING_DATA_EXTENSION = ".json";

/** S3 DeleteObjects accepts at most this many keys per request. */
export const S3_DELETE_BATCH_SIZE = 1000;
