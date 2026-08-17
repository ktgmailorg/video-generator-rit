export class ProviderError extends Error {
  constructor(message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "ProviderError";
    this.code = options.code || "PROVIDER_ERROR";
    this.status = options.status;
    this.retryable = Boolean(options.retryable);
    this.details = options.details || {};
  }
}

export function providerHttpError(providerId, status, body = "") {
  const suffix = String(body).slice(0, 1000);
  if (status === 429) {
    return new ProviderError(`${providerId} rate limited the request`, {
      code: "RATE_LIMITED",
      status,
      retryable: true,
      details: { body: suffix },
    });
  }
  if (status === 408 || status === 409 || status >= 500) {
    return new ProviderError(
      `${providerId} is temporarily unavailable (HTTP ${status})`,
      {
        code: "PROVIDER_UNAVAILABLE",
        status,
        retryable: true,
        details: { body: suffix },
      },
    );
  }
  return new ProviderError(`${providerId} rejected the request (HTTP ${status})`, {
    code: status === 401 || status === 403 ? "AUTHENTICATION_FAILED" : "PROVIDER_ERROR",
    status,
    details: { body: suffix },
  });
}

export const isFallbackEligible = (error) =>
  ["RATE_LIMITED", "PROVIDER_UNAVAILABLE"].includes(error?.code);
