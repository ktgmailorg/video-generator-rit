import { createReadStream, existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { atomicWriteJson } from "../src/core/canonical.mjs";
import { loadConfig } from "../src/config.mjs";
import { episodeFromStoryboard } from "../src/episode.mjs";
import { ingestSourcePack } from "../src/grounding/source-pack.mjs";
import { writePlanArtifacts } from "../src/pipeline/planning.mjs";
import { produceEpisode } from "../src/pipeline/produce.mjs";
import { ProviderExecutionEngine } from "../src/providers/execution-engine.mjs";
import { ProviderRegistry } from "../src/providers/registry.mjs";
import { scriptToStoryboard } from "./script-to-storyboard.mjs";
import { generateStudioTranscriptDraft } from "./transcript-generation.mjs";
import {
  assertFullyLocalStudioConfig,
  inspectFullyLocalStudioConfig,
} from "./local-policy.mjs";

const studioRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));
const publicRoot = join(studioRoot, "public");
const repositoryRoot = resolve(studioRoot, "..");
process.umask(0o077);
const { values } = parseArgs({
  options: {
    config: {
      type: "string",
      default: existsSync(resolve(repositoryRoot, "video.config.local.json"))
        ? "video.config.local.json"
        : "examples/video.config.studio-bonsai.json",
    },
    host: { type: "string", default: "127.0.0.1" },
    port: { type: "string", default: "4173" },
    output: { type: "string", default: "studio-output" },
  },
});
const host = values.host;
const port = Number.parseInt(values.port, 10);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new TypeError("--port must be an integer between 1 and 65535");
}
if (!["127.0.0.1", "::1", "localhost"].includes(host)) {
  throw new TypeError(
    "The studio binds to localhost only; use an authenticated deployment layer for remote access",
  );
}
const configPath = resolve(repositoryRoot, values.config);
const jobsRoot = resolve(repositoryRoot, values.output);
const jobs = new Map();
await mkdir(jobsRoot, { recursive: true });

const securityHeaders = {
  "content-security-policy": [
    "default-src 'self'",
    "base-uri 'none'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
  ].join("; "),
  "cross-origin-opener-policy": "same-origin",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

const json = (response, status, value) => {
  response.writeHead(status, {
    ...securityHeaders,
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(`${JSON.stringify(value)}\n`);
};

const publicJob = (job) => ({
  id: job.id,
  title: job.title,
  status: job.status,
  stage: job.stage,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
  logs: job.logs.slice(-30),
  error: job.error || null,
  qualityBlockers: job.qualityBlockers || [],
  files:
    job.status === "complete"
      ? {
          video: `/api/jobs/${job.id}/files/video`,
          reviewVideo: `/api/jobs/${job.id}/files/review-video`,
          captions: `/api/jobs/${job.id}/files/captions`,
          captionsSrt: `/api/jobs/${job.id}/files/captions-srt`,
          transcript: `/api/jobs/${job.id}/files/transcript`,
          transcriptHtml: `/api/jobs/${job.id}/files/transcript-html`,
          thumbnail: `/api/jobs/${job.id}/files/thumbnail`,
          qualityReport: `/api/jobs/${job.id}/files/quality-report`,
          runLock: `/api/jobs/${job.id}/files/run-lock`,
          ...(job.paths["generated-transcript"]
            ? {
                generatedTranscript: `/api/jobs/${job.id}/files/generated-transcript`,
              }
            : {}),
        }
      : null,
});

function updateJob(job, valuesToApply) {
  Object.assign(job, valuesToApply, { updatedAt: new Date().toISOString() });
}

function appendLog(job, message) {
  job.logs.push({
    at: new Date().toISOString(),
    message: String(message).slice(0, 500),
  });
  job.updatedAt = new Date().toISOString();
}

function applyVoice(config, voicePreset) {
  if (!voicePreset || voicePreset === "configured") return;
  const profileName = config.roles.narration?.primary;
  const profile = config.providers[profileName];
  if (!profile) {
    throw new TypeError("The selected configuration has no narration provider");
  }
  if (profile.adapter === "edge-tts") {
    delete profile.voice;
    profile.voicePreset = voicePreset;
    return;
  }
  const localMatch = Object.entries(config.providers).find(
    ([, candidate]) =>
      candidate.executionLocation === "local" &&
      candidate.voicePreset === voicePreset &&
      (candidate.capabilities || []).includes("speech.synthesize"),
  );
  if (!localMatch) {
    throw new TypeError(
      `No local ${voicePreset} speech profile is configured. Select “configured local voice” or add a Piper profile with voicePreset set to ${voicePreset}.`,
    );
  }
  config.roles.narration.primary = localMatch[0];
}

const studioPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["beats"],
  properties: {
    beats: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "visualDirection", "equations"],
        properties: {
          id: { type: "string" },
          title: { type: "string", minLength: 1 },
          visualDirection: { type: "string", minLength: 1 },
          equations: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    },
  },
};

function createPlanningEngine(config, job) {
  if (!config.roles.planner) return null;
  return new ProviderExecutionEngine({
    config,
    mode: "record",
    onEvent: (event) =>
      appendLog(
        job,
        [event.type, event.profileName, event.capability]
          .filter(Boolean)
          .join(" · "),
      ),
  });
}

async function generateTranscriptWithConfiguredAi({
  config,
  engine,
  input,
  job,
}) {
  if (!engine) {
    throw new TypeError(
      "AI transcript generation requires a configured planner such as local Bonsai",
    );
  }
  if (!input.sourceNotes?.trim()) {
    throw new TypeError(
      "AI transcript generation requires instructor-approved source notes",
    );
  }
  updateJob(job, { stage: "Generating a source-grounded transcript draft" });
  appendLog(job, `Generating the transcript with ${config.roles.planner.primary}`);
  const { narration } = await generateStudioTranscriptDraft({
    engine,
    title: input.title,
    topic: input.script,
    sourceTitle: input.sourceTitle,
    sourceNotes: input.sourceNotes,
    targetMinutes: input.targetMinutes,
    dataClassification: config.dataPolicy.classification,
  });
  appendLog(
    job,
    "AI transcript draft recorded; instructor script and evidence review is required",
  );
  return narration;
}

async function planWithConfiguredAi({ config, engine, episode, job }) {
  if (!engine) {
    appendLog(job, "No AI planner configured; using deterministic script segmentation");
    return { episode, planningRun: null };
  }
  appendLog(job, `Planning with ${config.roles.planner.primary}`);
  const result = await engine.executeRole("planner", {
    schemaVersion: 1,
    capability: "text.generate",
    dataClassification: config.dataPolicy.classification,
    schemaName: "studio_visual_plan",
    outputSchema: studioPlanSchema,
    input: {
      instructions: [
        "You are planning a professional educational video from an instructor-approved script.",
        "Return one entry for every supplied beat ID and preserve the exact order.",
        "Do not rewrite or add narration and do not introduce factual claims.",
        "Give each beat a concise title and an inspectable academic visual direction.",
        "Use equations only when they already appear in the supplied narration.",
        "Do not imitate a named creator or request decorative text inside generated images.",
      ].join(" "),
      prompt: episode.beats
        .map(
          (beat) =>
            `BEAT ${beat.id}\nCURRENT TITLE: ${beat.title}\nNARRATION:\n${beat.narration}`,
        )
        .join("\n\n"),
    },
    parameters: { temperature: 0 },
  });
  const plannedById = new Map(
    result.output.json.beats.map((beat) => [beat.id, beat]),
  );
  const missing = episode.beats
    .map((beat) => beat.id)
    .filter((id) => !plannedById.has(id));
  if (missing.length || plannedById.size !== episode.beats.length) {
    throw new Error(
      `AI planner returned a mismatched beat set${missing.length ? `; missing ${missing.join(", ")}` : ""}`,
    );
  }
  return {
    episode: {
      ...episode,
      beats: episode.beats.map((beat) => {
        const planned = plannedById.get(beat.id);
        return {
          ...beat,
          title: planned.title.trim().slice(0, 120),
          visualDirection: planned.visualDirection.trim(),
          equations: planned.equations,
        };
      }),
    },
    planningRun: {
      schemaVersion: 1,
      provenance: {
        providerRequestSha256: engine.records.map(
          (record) => record.requestSha256,
        ),
        modelRevision: result.modelRevision,
      },
      records: engine.records,
      providers: engine.providerManifests,
      totalCostUsd: engine.totalCostUsd,
    },
  };
}

async function runJob(job, input) {
  try {
    updateJob(job, { status: "running", stage: "Preparing the project" });
    const jobRoot = join(jobsRoot, job.id);
    await mkdir(jobRoot, { recursive: true });
    const sourceId = input.sourceNotes?.trim() ? "instructor-source" : null;

    let sourceEntries = [];
    if (sourceId) {
      const sourceManifestPath = join(jobRoot, "sources.json");
      await atomicWriteJson(
        sourceManifestPath,
        {
          sources: [
            {
              id: sourceId,
              title: input.sourceTitle?.trim() || "Instructor-provided source notes",
              type: "note",
              uri: "studio-input:instructor-source",
              content: input.sourceNotes.trim(),
              verified: false,
            },
          ],
        },
        { mode: 0o600 },
      );
      sourceEntries = await ingestSourcePack([sourceManifestPath]);
    }

    const { config: loadedConfig } = await loadConfig(configPath);
    const config = structuredClone(loadedConfig);
    assertFullyLocalStudioConfig(config);
    config.project.id = `studio-${job.id}`;
    config.project.title = input.title.trim();
    config.workflow.outputRoot = join(jobRoot, "output");
    config.workflow.cacheRoot = resolve(
      repositoryRoot,
      config.workflow.cacheRoot || ".video-cache/v2",
    );
    config.workflow.determinism = "record";
    config.workflow.approvals = [];
    config.workflow.groundingMode = sourceId ? "source-pack" : "open";
    applyVoice(config, input.voicePreset);
    assertFullyLocalStudioConfig(config);
    const planningEngine = createPlanningEngine(config, job);
    const generatedTranscript =
      input.inputMode === "generate"
        ? await generateTranscriptWithConfiguredAi({
            config,
            engine: planningEngine,
            input,
            job,
          })
        : null;
    const narrationScript = generatedTranscript || input.script;
    const generatedTranscriptPath = generatedTranscript
      ? join(jobRoot, "ai-transcript-draft.txt")
      : null;
    if (generatedTranscriptPath) {
      await writeFile(generatedTranscriptPath, `${generatedTranscript}\n`, {
        mode: 0o600,
      });
    }
    const storyboard = scriptToStoryboard({
      title: input.title,
      script: narrationScript,
      sourceId,
    });
    const storyboardPath = join(jobRoot, "storyboard.md");
    await writeFile(storyboardPath, storyboard, { mode: 0o600 });
    await atomicWriteJson(join(jobRoot, "video.config.json"), config, {
      mode: 0o600,
    });
    await atomicWriteJson(
      join(jobRoot, "studio-input.json"),
      {
        schemaVersion: 1,
        title: input.title.trim(),
        inputMode: input.inputMode,
        targetMinutes: Number(input.targetMinutes || 3),
        voicePreset: input.voicePreset,
        visualMode: input.visualMode,
        hasSourceNotes: Boolean(sourceId),
      },
      { mode: 0o600 },
    );

    updateJob(job, { stage: "Planning narration and visuals" });
    appendLog(job, `Using ${config.preset} workflow with ${config.dataPolicy.classification} data policy`);
    let episode = await episodeFromStoryboard(storyboardPath, sourceEntries);
    const aiPlan = await planWithConfiguredAi({
      config,
      engine: planningEngine,
      episode,
      job,
    });
    episode = aiPlan.episode;
    if (input.visualMode === "generated") {
      if (!config.roles.image) {
        throw new TypeError(
          "AI-generated visuals require a configured image provider role; select deterministic educational visuals or configure ComfyUI",
        );
      }
      episode = {
        ...episode,
        beats: episode.beats.map((beat) => ({
          ...beat,
          assetRequests: [
            {
              capability: "image.generate",
              prompt: [
                "Create a professional 16:9 educational visual.",
                "Do not imitate a named artist and do not render text.",
                `Lesson: ${episode.title}.`,
                `Section: ${beat.title}.`,
                `Direction: ${beat.visualDirection}`,
              ].join(" "),
              parameters: { width: 1920, height: 1080 },
            },
          ],
        })),
      };
    }
    await writePlanArtifacts({ config, episode });
    if (aiPlan.planningRun) {
      await atomicWriteJson(
        join(config.workflow.outputRoot, "planning-provider-records.json"),
        aiPlan.planningRun,
        { mode: 0o600 },
      );
    }

    updateJob(job, { stage: "Creating narration, visuals, captions, and video" });
    const result = await produceEpisode({
      config,
      mode: "record",
      until: "render",
      allowDraftQualityBlockers: true,
      onEvent: (event) =>
        appendLog(
          job,
          [event.type, event.profileName, event.capability]
            .filter(Boolean)
            .join(" · "),
        ),
    });
    job.paths = {
      video: result.render.masterPath,
      "review-video": result.render.draftPath,
      captions: result.narration.files.vtt,
      "captions-srt": result.narration.files.srt,
      transcript: result.narration.files.transcriptText,
      "transcript-html": result.narration.files.transcriptHtml,
      thumbnail: result.visuals.thumbnailPath,
      "quality-report": join(result.root, "quality-report.json"),
      "run-lock": join(result.root, "run.lock.json"),
      ...(generatedTranscriptPath
        ? { "generated-transcript": generatedTranscriptPath }
        : {}),
    };
    const qualityBlockers = [...result.qualityReport.blockers];
    if (generatedTranscript) {
      qualityBlockers.unshift(
        "AI-generated transcript requires instructor script and evidence approval",
      );
      result.qualityReport = {
        ...result.qualityReport,
        ok: false,
        blockers: qualityBlockers,
      };
      result.runLock.final.releaseAudit = result.qualityReport;
      await Promise.all([
        atomicWriteJson(
          join(result.root, "quality-report.json"),
          result.qualityReport,
          { mode: 0o600 },
        ),
        atomicWriteJson(join(result.root, "run.lock.json"), result.runLock, {
          mode: 0o600,
        }),
      ]);
    }
    updateJob(job, {
      status: "complete",
      stage: "Reviewable draft ready",
      qualityBlockers,
    });
    appendLog(job, "Draft completed; instructor review is still required");
  } catch (error) {
    updateJob(job, {
      status: "failed",
      stage: "Generation stopped",
      error: error.message,
    });
    appendLog(job, error.message);
  }
}

async function readRequestJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 2_000_000) {
      const error = new Error("Request exceeds the 2 MB studio limit");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function validateJobInput(input) {
  if (!input || typeof input !== "object") throw new TypeError("Invalid request");
  input.inputMode ||= "script";
  input.targetMinutes ||= 3;
  if (!input.acknowledged) {
    throw new TypeError(
      "Confirm that the material is approved for the configured data route",
    );
  }
  if (!String(input.title || "").trim()) throw new TypeError("Title is required");
  if (!String(input.script || "").trim()) {
    throw new TypeError(
      input.inputMode === "generate"
        ? "A topic or learning objective is required"
        : "Script or transcript is required",
    );
  }
  if (String(input.sourceNotes || "").length > 250_000) {
    throw new TypeError("Source notes exceed the 250,000 character limit");
  }
  if (!["configured", "female", "male"].includes(input.voicePreset)) {
    throw new TypeError("Invalid narration voice option");
  }
  if (!["script", "generate"].includes(input.inputMode)) {
    throw new TypeError("Invalid transcript starting mode");
  }
  if (
    ![2, 3, 5].includes(Number(input.targetMinutes || 3))
  ) {
    throw new TypeError("Target duration must be 2, 3, or 5 minutes");
  }
  if (input.inputMode === "generate" && !String(input.sourceNotes || "").trim()) {
    throw new TypeError(
      "AI transcript generation requires instructor-approved source notes",
    );
  }
  if (!["deterministic", "generated"].includes(input.visualMode)) {
    throw new TypeError("Invalid visual mode");
  }
}

async function configurationSummary() {
  const { config, path } = await loadConfig(configPath);
  const localPolicy = inspectFullyLocalStudioConfig(config);
  const registry = ProviderRegistry.fromConfig(config);
  const requiredStudioRoles = ["planner", "narration", "transcription"];
  const profileNames = [
    ...new Set(
      requiredStudioRoles.flatMap((roleName) => {
        const role = config.roles[roleName];
        return role ? [role.primary, ...(role.fallbacks || [])] : [];
      }),
    ),
  ];
  const checks = await Promise.all(
    profileNames.map(async (name) => {
      try {
        const probe = await registry.probe(name);
        return {
          name,
          ok: Boolean(probe.health.ok),
          error: probe.health.ok
            ? null
            : probe.health.error || "Provider health check failed",
        };
      } catch (error) {
        return { name, ok: false, error: error.message };
      }
    }),
  );
  if (!localPolicy.ok) {
    checks.unshift({
      name: "fully-local-policy",
      ok: false,
      error: localPolicy.errors.join("; "),
    });
  }
  return {
    configFile: path.split("/").at(-1),
    preset: config.preset,
    classification: config.dataPolicy.classification,
    ready: localPolicy.ok && checks.every((check) => check.ok),
    fullyLocal: localPolicy.ok,
    checks,
    providers: Object.entries(config.providers).map(([name, profile]) => ({
      name,
      adapter: profile.adapter,
      executionLocation: profile.executionLocation,
    })),
    roles: config.roles,
    features: {
      aiTranscript: Boolean(config.roles.planner?.primary),
    },
  };
}

const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
]);

async function serveFile(request, response, path, contentType, downloadName) {
  const details = await stat(path);
  const headers = {
    ...securityHeaders,
    "accept-ranges": "bytes",
    "cache-control": "no-store",
    "content-type": contentType,
    ...(downloadName
      ? { "content-disposition": `attachment; filename="${downloadName}"` }
      : {}),
  };
  const range = request.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2]
      ? Math.min(Number(range[2]), details.size - 1)
      : details.size - 1;
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end < start ||
      start >= details.size
    ) {
      response.writeHead(416, {
        ...headers,
        "content-range": `bytes */${details.size}`,
      });
      response.end();
      return;
    }
    response.writeHead(206, {
      ...headers,
      "content-length": end - start + 1,
      "content-range": `bytes ${start}-${end}/${details.size}`,
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(path, { start, end }).pipe(response);
    return;
  }
  response.writeHead(200, {
    ...headers,
    "content-length": details.size,
  });
  if (request.method === "HEAD") response.end();
  else createReadStream(path).pipe(response);
}

const fileDetails = {
  video: ["video/mp4", "course-video-draft.mp4"],
  "review-video": ["video/mp4", "course-video-review-with-slate.mp4"],
  captions: ["text/vtt; charset=utf-8", "captions.vtt"],
  "captions-srt": ["application/x-subrip; charset=utf-8", "captions.srt"],
  transcript: ["text/plain; charset=utf-8", "transcript.txt"],
  "transcript-html": ["text/html; charset=utf-8", "transcript.html"],
  thumbnail: ["image/png", "thumbnail.png"],
  "quality-report": ["application/json; charset=utf-8", "quality-report.json"],
  "run-lock": ["application/json; charset=utf-8", "run.lock.json"],
  "generated-transcript": [
    "text/plain; charset=utf-8",
    "ai-transcript-draft.txt",
  ],
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${host}:${port}`);
    if (request.method === "GET" && url.pathname === "/api/config") {
      json(response, 200, await configurationSummary());
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/jobs") {
      const input = await readRequestJson(request);
      validateJobInput(input);
      const id = randomUUID();
      const now = new Date().toISOString();
      const job = {
        id,
        title: input.title.trim(),
        status: "queued",
        stage: "Queued",
        createdAt: now,
        updatedAt: now,
        logs: [],
      };
      jobs.set(id, job);
      void runJob(job, input);
      json(response, 202, publicJob(job));
      return;
    }
    const jobMatch = url.pathname.match(/^\/api\/jobs\/([a-f0-9-]+)$/);
    if (request.method === "GET" && jobMatch) {
      const job = jobs.get(jobMatch[1]);
      if (!job) {
        json(response, 404, { error: "Job not found" });
        return;
      }
      json(response, 200, publicJob(job));
      return;
    }
    const fileMatch = url.pathname.match(
      /^\/api\/jobs\/([a-f0-9-]+)\/files\/([a-z-]+)$/,
    );
    if (["GET", "HEAD"].includes(request.method) && fileMatch) {
      const job = jobs.get(fileMatch[1]);
      const key = fileMatch[2];
      if (!job?.paths?.[key] || !fileDetails[key]) {
        json(response, 404, { error: "File not found" });
        return;
      }
      await serveFile(
        request,
        response,
        job.paths[key],
        fileDetails[key][0],
        key === "video" ? undefined : fileDetails[key][1],
      );
      return;
    }
    if (["GET", "HEAD"].includes(request.method) && staticFiles.has(url.pathname)) {
      const [filename, contentType] = staticFiles.get(url.pathname);
      await serveFile(
        request,
        response,
        join(publicRoot, filename),
        contentType,
      );
      return;
    }
    json(response, 404, { error: "Not found" });
  } catch (error) {
    json(response, error.status || 400, { error: error.message });
  }
});

server.listen(port, host, () => {
  process.stdout.write(
    [
      `RIT Video Studio: http://${host}:${port}`,
      `Configuration: ${configPath}`,
      `Jobs: ${jobsRoot}`,
      "The studio is bound to this machine only.",
      "",
    ].join("\n"),
  );
});
