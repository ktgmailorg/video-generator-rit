export const CAPABILITIES = Object.freeze([
  "text.generate",
  "image.generate",
  "video.generate",
  "speech.synthesize",
  "speech.transcribe",
  "embedding.create",
  "moderation.classify",
  "research.search",
]);

export function assertCapability(capability) {
  if (!CAPABILITIES.includes(capability)) {
    throw new TypeError(`Unsupported provider capability: ${capability}`);
  }
  return capability;
}

export function assertGenerationRequest(request) {
  if (!request || request.schemaVersion !== 1) {
    throw new TypeError("Generation requests require schemaVersion 1");
  }
  assertCapability(request.capability);
  if (!request.model && !["speech.synthesize", "speech.transcribe"].includes(request.capability)) {
    throw new TypeError(`${request.capability} requires an explicit model`);
  }
  if (!request.input || typeof request.input !== "object") {
    throw new TypeError("Generation request input must be an object");
  }
  if (
    request.dataClassification &&
    !["public", "internal", "restricted"].includes(
      request.dataClassification,
    )
  ) {
    throw new TypeError(
      `Unknown request data classification: ${request.dataClassification}`,
    );
  }
  return request;
}

export function assertProviderManifest(manifest) {
  if (!manifest?.id || !manifest?.version) {
    throw new TypeError("Provider manifest requires id and version");
  }
  if (!["local", "hosted"].includes(manifest.executionLocation)) {
    throw new TypeError(
      `Provider ${manifest.id} must declare local or hosted execution`,
    );
  }
  if (!Array.isArray(manifest.capabilities) || !manifest.capabilities.length) {
    throw new TypeError(`Provider ${manifest.id} has no capabilities`);
  }
  for (const capability of manifest.capabilities) {
    assertCapability(capability);
  }
  const mimeTypes = manifest.mimeTypes || {};
  return {
    ...manifest,
    mimeTypes: Object.fromEntries(
      manifest.capabilities.map((capability) => [
        capability,
        Array.isArray(mimeTypes[capability])
          ? mimeTypes[capability]
          : ["application/octet-stream"],
      ]),
    ),
    supportsStructuredOutput: Boolean(manifest.supportsStructuredOutput),
    supportsSeed: Boolean(manifest.supportsSeed),
    supportsAsyncJobs: Boolean(manifest.supportsAsyncJobs),
    supportsModelDiscovery: Boolean(manifest.supportsModelDiscovery),
  };
}
