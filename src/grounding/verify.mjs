import { sha256 } from "../core/canonical.mjs";

export async function verifySourceUrls(episode, options = {}) {
  const results = [];
  for (const source of episode.sources || []) {
    if (!/^https?:\/\//i.test(source.uri || "")) continue;
    try {
      const timeout = AbortSignal.timeout(options.timeoutMs || 15_000);
      const signal = options.signal
        ? AbortSignal.any([options.signal, timeout])
        : timeout;
      const response = await fetch(source.uri, {
        headers: { "user-agent": "rit-video-generator/0.2" },
        signal,
      });
      const content = await response.text();
      const changed =
        response.ok && source.type === "url"
          ? sha256(content) !== source.sha256
          : response.ok && source.excerpt
            ? !content.includes(source.excerpt)
            : null;
      results.push({
        sourceId: source.id,
        uri: source.uri,
        reachable: response.ok,
        status: response.status,
        changed,
        warning: !response.ok
          ? `Source returned HTTP ${response.status}`
          : changed
            ? "Retrieved content no longer matches the reviewed source"
            : null,
      });
    } catch (error) {
      results.push({
        sourceId: source.id,
        uri: source.uri,
        reachable: false,
        changed: null,
        warning: error.message,
      });
    }
  }
  return {
    ok: results.every((result) => result.reachable && !result.changed),
    results,
  };
}
