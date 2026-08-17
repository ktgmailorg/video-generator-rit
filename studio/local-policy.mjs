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

export function inspectFullyLocalStudioConfig(config) {
  const errors = [];
  const roleProfiles = new Set();

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

  for (const [profileName, profile] of Object.entries(
    config.providers || {},
  )) {
    if (profile.executionLocation !== "local") {
      errors.push(
        `${profileName} is declared ${profile.executionLocation || "without an execution location"}`,
      );
    }
    if (HOSTED_ONLY_ADAPTERS.has(profile.adapter)) {
      errors.push(
        `${profileName} uses hosted-only adapter ${profile.adapter}`,
      );
    }
    for (const key of ["baseUrl", "url", "endpoint"]) {
      if (!profile[key]) continue;
      try {
        const endpoint = new URL(profile[key]);
        if (!LOOPBACK_HOSTS.has(endpoint.hostname)) {
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
    profileNames: Object.keys(config.providers || {}).sort(),
  };
}

export function assertFullyLocalStudioConfig(config) {
  const inspection = inspectFullyLocalStudioConfig(config);
  if (!inspection.ok) {
    throw new LocalStudioPolicyError(
      `The local studio refuses non-local provider routes: ${inspection.errors.join("; ")}`,
      inspection,
    );
  }
  return inspection;
}
