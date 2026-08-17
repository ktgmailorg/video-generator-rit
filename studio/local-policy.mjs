const HOSTED_ONLY_ADAPTERS = new Set(["anthropic", "edge-tts", "openai"]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

export class LocalStudioPolicyError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "LocalStudioPolicyError";
    this.code = "LOCAL_STUDIO_POLICY_DENIED";
    this.details = details;
  }
}

/**
 * Two studio modes, chosen by the project's data classification:
 *
 * - **local-only** (the default, and required for `internal` or `restricted`
 *   material): every provider must execute locally against a loopback
 *   endpoint. This is the boundary that keeps course material and student
 *   data on the machine, so a config that does not declare what it handles is
 *   treated as sensitive.
 * - **public**: a project explicitly classified `public` may use hosted
 *   providers — Edge TTS narration, or a hosted planner — but only profiles
 *   the config lists in `dataPolicy.allowedHostedProviders`, so a stray or
 *   mislabeled profile stays unreachable by a dynamic role.
 *
 * Per-request enforcement still runs in src/core/data-policy.mjs; this is the
 * up-front gate that refuses to start a job at all.
 */
export function inspectFullyLocalStudioConfig(config) {
  const errors = [];
  const roleProfiles = new Set();
  // An absent classification is treated as sensitive: fail safe, never open.
  const hostedAllowed = config.dataPolicy?.classification === "public";
  const allowlist = new Set(config.dataPolicy?.allowedHostedProviders || []);

  for (const [roleName, role] of Object.entries(config.roles || {})) {
    for (const profileName of [role.primary, ...(role.fallbacks || [])]) {
      if (!profileName) continue;
      roleProfiles.add(profileName);
      const profile = config.providers?.[profileName];
      if (!profile) {
        errors.push(`${roleName} references missing provider ${profileName}`);
      }
    }
  }

  if (!roleProfiles.size) errors.push("No provider roles are configured");

  // Every profile is checked, including ones no role currently selects, so a
  // later dynamic route cannot reach an undeclared provider.
  for (const [profileName, profile] of Object.entries(
    config.providers || {},
  )) {
    const hosted = profile.executionLocation === "hosted";
    const hostedOk = hosted && hostedAllowed && allowlist.has(profileName);
    if (profile.executionLocation !== "local" && !hostedOk) {
      errors.push(
        hosted && hostedAllowed
          ? `${profileName} is hosted but missing from allowedHostedProviders`
          : `${profileName} is declared ${profile.executionLocation || "without an execution location"}`,
      );
    }
    if (HOSTED_ONLY_ADAPTERS.has(profile.adapter) && !hostedOk) {
      errors.push(`${profileName} uses hosted-only adapter ${profile.adapter}`);
    }
    for (const key of ["baseUrl", "url", "endpoint"]) {
      if (!profile[key]) continue;
      try {
        const endpoint = new URL(profile[key]);
        // A hosted, allowlisted provider legitimately points at its vendor
        // endpoint; a *local* profile claiming a remote host is the risk.
        if (!LOOPBACK_HOSTS.has(endpoint.hostname) && !hostedOk) {
          errors.push(
            `${profileName} uses non-local ${key} ${endpoint.hostname}`,
          );
        }
      } catch {
        errors.push(`${profileName} has an invalid ${key}`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    mode: hostedAllowed ? "public" : "local-only",
    profileNames: Object.keys(config.providers || {}).sort(),
  };
}

export function assertFullyLocalStudioConfig(config) {
  const inspection = inspectFullyLocalStudioConfig(config);
  if (!inspection.ok) {
    throw new LocalStudioPolicyError(
      `The studio refuses these provider routes: ${inspection.errors.join("; ")}`,
      inspection,
    );
  }
  return inspection;
}
