const CLASSIFICATION_ORDER = Object.freeze({
  public: 0,
  internal: 1,
  restricted: 2,
});

export class DataPolicyError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "DataPolicyError";
    this.code = "DATA_POLICY_DENIED";
    this.details = details;
  }
}

export function assertDataRoute({
  classification,
  profileName,
  provider,
  hostedConsent = false,
  allowedHostedProviders = [],
}) {
  if (!(classification in CLASSIFICATION_ORDER)) {
    throw new DataPolicyError(`Unknown data classification: ${classification}`);
  }
  if (!["local", "hosted"].includes(provider.executionLocation)) {
    throw new DataPolicyError(
      `Provider ${profileName} must declare executionLocation as local or hosted`,
    );
  }
  if (provider.executionLocation === "local") return true;
  if (classification === "public") return true;
  if (classification === "restricted") {
    throw new DataPolicyError(
      `Restricted data cannot be sent to hosted provider ${profileName}`,
      { classification, profileName },
    );
  }
  if (
    classification === "internal" &&
    hostedConsent &&
    allowedHostedProviders.includes(profileName)
  ) {
    return true;
  }
  throw new DataPolicyError(
    `Internal data requires recorded consent and an allowlisted hosted provider`,
    { classification, profileName },
  );
}

export function isAtLeast(classification, minimum) {
  return (
    CLASSIFICATION_ORDER[classification] >= CLASSIFICATION_ORDER[minimum]
  );
}
