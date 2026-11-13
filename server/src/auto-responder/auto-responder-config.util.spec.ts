import {
  mergeAutoResponderConfigUpdate,
  normaliseAutoResponderConfig,
} from "./auto-responder-config.util";
import {
  AutoResponderConfig,
  AutoResponderDeliveryMode,
  DEFAULT_AUTO_RESPONDER_CONFIG,
} from "./types/auto-responder.types";

const legacy = (enabled: boolean): Partial<AutoResponderConfig> => {
  const { deliveryMode: _omitted, ...rest } = DEFAULT_AUTO_RESPONDER_CONFIG;
  return { ...rest, enabled };
};

describe("normaliseAutoResponderConfig", () => {
  it("defaults new users to drafts for approval", () => {
    expect(normaliseAutoResponderConfig(null).deliveryMode).toBe(
      AutoResponderDeliveryMode.DRAFT,
    );
  });

  it("keeps automatic sending for users who had switched it on before delivery modes existed", () => {
    expect(normaliseAutoResponderConfig(legacy(true)).deliveryMode).toBe(
      AutoResponderDeliveryMode.AUTO_SEND_KNOWN_SENDERS,
    );
  });

  it("uses drafts for saved configs that were never switched on", () => {
    expect(normaliseAutoResponderConfig(legacy(false)).deliveryMode).toBe(
      AutoResponderDeliveryMode.DRAFT,
    );
  });

  it("respects an explicitly chosen mode", () => {
    expect(
      normaliseAutoResponderConfig({
        ...DEFAULT_AUTO_RESPONDER_CONFIG,
        enabled: true,
        deliveryMode: AutoResponderDeliveryMode.DRAFT,
      }).deliveryMode,
    ).toBe(AutoResponderDeliveryMode.DRAFT);
  });
});

describe("mergeAutoResponderConfigUpdate", () => {
  it("persists draft mode when a never-enabled user switches the auto-responder on", () => {
    const merged = mergeAutoResponderConfigUpdate(legacy(false), {
      enabled: true,
    });
    expect(merged.enabled).toBe(true);
    expect(merged.deliveryMode).toBe(AutoResponderDeliveryMode.DRAFT);
  });

  it("ignores an unknown delivery mode", () => {
    const merged = mergeAutoResponderConfigUpdate(null, {
      deliveryMode: "always_send" as AutoResponderDeliveryMode,
    });
    expect(merged.deliveryMode).toBe(AutoResponderDeliveryMode.DRAFT);
  });
});
