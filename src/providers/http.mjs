import { ProviderError, providerHttpError } from "./errors.mjs";

const joinUrl = (baseUrl, path) =>
  `${String(baseUrl).replace(/\/+$/, "")}/${String(path).replace(/^\/+/, "")}`;

export async function fetchWithTimeout(url, options = {}, timeoutMs = 120_000) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;
  try {
    return await fetch(url, { ...options, signal });
  } catch (error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      throw new ProviderError(`Request timed out: ${url}`, {
        code: "PROVIDER_UNAVAILABLE",
        retryable: true,
        cause: error,
      });
    }
    throw new ProviderError(`Could not reach provider endpoint: ${url}`, {
      code: "PROVIDER_UNAVAILABLE",
      retryable: true,
      cause: error,
    });
  }
}

export async function requestJson({
  providerId,
  baseUrl,
  path,
  method = "POST",
  headers = {},
  body,
  signal,
  timeoutMs,
}) {
  const response = await fetchWithTimeout(
    joinUrl(baseUrl, path),
    {
      method,
      headers: {
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    },
    timeoutMs,
  );
  const text = await response.text();
  if (!response.ok) throw providerHttpError(providerId, response.status, text);
  try {
    return text ? JSON.parse(text) : {};
  } catch (error) {
    throw new ProviderError(`${providerId} returned invalid JSON`, {
      code: "INVALID_PROVIDER_RESPONSE",
      cause: error,
      details: { body: text.slice(0, 1000) },
    });
  }
}

export async function requestBytes({
  providerId,
  baseUrl,
  path,
  method = "GET",
  headers = {},
  body,
  signal,
  timeoutMs,
}) {
  const response = await fetchWithTimeout(
    joinUrl(baseUrl, path),
    { method, headers, body, signal },
    timeoutMs,
  );
  if (!response.ok) {
    throw providerHttpError(
      providerId,
      response.status,
      await response.text(),
    );
  }
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    mimeType: response.headers.get("content-type") || "application/octet-stream",
  };
}

export { joinUrl };
