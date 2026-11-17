import {
  AutoResponderConfig,
  AutoResponderDeliveryMode,
  DEFAULT_AUTO_RESPONDER_CONFIG,
} from "./types/auto-responder.types";

const DELIVERY_MODES = new Set<string>(
  Object.values(AutoResponderDeliveryMode),
);

export function isAutoResponderDeliveryMode(
  value: unknown,
): value is AutoResponderDeliveryMode {
  return typeof value === "string" && DELIVERY_MODES.has(value);
}

/**
 * Fills a stored config with defaults. Configs saved before delivery modes
 * existed have no `deliveryMode`: a user who had switched the auto-responder
 * on had opted into automatic sending, so they keep it (now limited to known
 * senders); everyone else gets the draft-for-approval default.
 */
export function normaliseAutoResponderConfig(
  saved: Partial<AutoResponderConfig> | null | undefined,
): AutoResponderConfig {
  if (!saved) return DEFAULT_AUTO_RESPONDER_CONFIG;
  const { deliveryMode: savedMode, enabled } = saved;
  let deliveryMode = AutoResponderDeliveryMode.DRAFT;
  if (isAutoResponderDeliveryMode(savedMode)) {
    deliveryMode = savedMode;
  } else if (enabled === true) {
    deliveryMode = AutoResponderDeliveryMode.AUTO_SEND_KNOWN_SENDERS;
  }
  return { ...DEFAULT_AUTO_RESPONDER_CONFIG, ...saved, deliveryMode };
}

/**
 * Applies a partial update on top of the normalised stored config, so the
 * resolved delivery mode is persisted explicitly. An unrecognised
 * `deliveryMode` in the update is ignored.
 */
export function mergeAutoResponderConfigUpdate(
  saved: Partial<AutoResponderConfig> | null | undefined,
  update: Partial<AutoResponderConfig>,
): AutoResponderConfig {
  const current = normaliseAutoResponderConfig(saved);
  const merged = { ...current, ...update };
  if (!isAutoResponderDeliveryMode(merged.deliveryMode)) {
    merged.deliveryMode = current.deliveryMode;
  }
  return merged;
}
