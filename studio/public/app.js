const form = document.querySelector("#create-form");
const submitButton = form.querySelector("button[type='submit']");
const scriptInput = document.querySelector("#script");
const scriptFile = document.querySelector("#script-file");
const fileName = document.querySelector("#file-name");
const scriptCount = document.querySelector("#script-count");
const inputMode = document.querySelector("#input-mode");
const aiTranscriptOption = document.querySelector("#ai-transcript-option");
const transcriptModeNote = document.querySelector("#transcript-mode-note");
const scriptLabel = document.querySelector("#script-label");
const scriptTarget = document.querySelector("#script-target");
const uploadRow = document.querySelector("#upload-row");
const durationOption = document.querySelector("#duration-option");
const productionDetails = document.querySelector("details");
const formError = document.querySelector("#form-error");
const configurationState = document.querySelector("#configuration-state");
const readyCard = document.querySelector("#ready-card");
const idleState = document.querySelector("#idle-state");
const progressState = document.querySelector("#progress-state");
const resultState = document.querySelector("#result-state");
const jobStage = document.querySelector("#job-stage");
const jobLog = document.querySelector("#job-log");
const resultVideo = document.querySelector("#result-video");
const qualityNotice = document.querySelector("#quality-notice");
const qualityList = document.querySelector("#quality-list");

let activeJobId = null;
let pollTimer = null;

const showError = (message) => {
  formError.textContent = message;
  formError.hidden = false;
};

const clearError = () => {
  formError.hidden = true;
  formError.textContent = "";
};

const wordCount = (value) =>
  String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

scriptInput.addEventListener("input", () => {
  scriptCount.textContent = `${wordCount(scriptInput.value).toLocaleString()} words`;
});

function updateInputMode() {
  const generatesTranscript = inputMode.value === "generate";
  scriptLabel.textContent = generatesTranscript
    ? "Topic or learning objective"
    : "Approved script or transcript";
  scriptInput.placeholder = generatesTranscript
    ? "Describe what students should learn and any points the draft should emphasize…"
    : "Paste the narration or corrected transcript here…";
  transcriptModeNote.textContent = generatesTranscript
    ? "The configured AI will draft narration only from the approved source notes below. Instructor script and evidence review is required."
    : "Your narration is preserved. AI planning may organize visuals but does not rewrite the script.";
  scriptTarget.textContent = generatesTranscript
    ? "Source-grounded AI draft"
    : "Target pilot: 300–750 words";
  uploadRow.hidden = generatesTranscript;
  durationOption.hidden = !generatesTranscript;
  if (generatesTranscript) productionDetails.open = true;
}

inputMode.addEventListener("change", updateInputMode);

scriptFile.addEventListener("change", async () => {
  const [file] = scriptFile.files;
  if (!file) return;
  if (file.size > 1_500_000) {
    showError("The selected file is larger than the 1.5 MB browser limit.");
    scriptFile.value = "";
    return;
  }
  scriptInput.value = await file.text();
  scriptInput.dispatchEvent(new Event("input"));
  fileName.textContent = file.name;
  clearError();
});

async function loadConfiguration() {
  try {
    const response = await fetch("/api/config", { cache: "no-store" });
    const config = await response.json();
    if (!response.ok) throw new Error(config.error || "Runtime check failed");
    document.querySelector("#config-preset").textContent = config.preset;
    document.querySelector("#config-data").textContent = config.fullyLocal
      ? `${config.classification} · fully local`
      : `${config.classification} · blocked non-local route`;
    document.querySelector("#config-providers").textContent =
      config.providers.length
        ? config.providers
            .map(
              (provider) => {
                const check = config.checks.find(
                  (candidate) => candidate.name === provider.name,
                );
                return `${check ? (check.ok ? "ready" : "setup needed") : "optional"} · ${provider.name} · ${provider.adapter} · ${provider.executionLocation}`;
              },
            )
            .join(" / ")
        : "No providers configured";
    configurationState.textContent = config.ready
      ? `Ready · ${config.configFile}`
      : `Setup needed · ${config.configFile}`;
    readyCard.hidden = false;
    submitButton.disabled = !config.ready;
    const aiTranscriptAvailable = Boolean(config.features?.aiTranscript);
    aiTranscriptOption.disabled = !aiTranscriptAvailable;
    aiTranscriptOption.textContent = aiTranscriptAvailable
      ? "Generate a draft transcript with configured AI"
      : "Generate a draft transcript with AI · planner setup required";
    if (!aiTranscriptAvailable && inputMode.value === "generate") {
      inputMode.value = "script";
      updateInputMode();
    }
    if (!config.ready) {
      showError(
        `Local setup is incomplete: ${config.checks
          .filter((check) => !check.ok)
          .map((check) => `${check.name} — ${check.error}`)
          .join("; ")}`,
      );
    }
  } catch (error) {
    configurationState.textContent = error.message;
    showError(
      "The local runtime is not ready. Restart the companion service and run the provider check.",
    );
  }
}

function renderLogs(logs) {
  jobLog.replaceChildren(
    ...logs.map((entry) => {
      const item = document.createElement("li");
      item.textContent = entry.message;
      return item;
    }),
  );
}

function setDownload(selector, url) {
  const element = document.querySelector(selector);
  element.href = url;
}

function renderResult(job) {
  progressState.hidden = true;
  resultState.hidden = false;
  idleState.hidden = true;
  document.querySelector("#result-title").textContent = job.title;
  resultVideo.src = job.files.video;
  resultVideo.poster = job.files.thumbnail;
  resultVideo.replaceChildren();
  const track = document.createElement("track");
  track.kind = "captions";
  track.label = "English";
  track.srclang = "en";
  track.src = job.files.captions;
  track.default = true;
  resultVideo.append(track);
  setDownload("#download-video", job.files.video);
  document.querySelector("#download-video").download = "course-video-draft.mp4";
  setDownload("#download-captions", job.files.captions);
  setDownload("#download-captions-srt", job.files.captionsSrt);
  setDownload("#download-transcript", job.files.transcript);
  setDownload("#download-transcript-html", job.files.transcriptHtml);
  setDownload("#download-quality-report", job.files.qualityReport);
  setDownload("#download-run-lock", job.files.runLock);
  const generatedTranscriptLink = document.querySelector(
    "#download-generated-transcript",
  );
  generatedTranscriptLink.hidden = !job.files.generatedTranscript;
  if (job.files.generatedTranscript) {
    setDownload(
      "#download-generated-transcript",
      job.files.generatedTranscript,
    );
  }
  qualityList.replaceChildren();
  if (job.qualityBlockers.length) {
    for (const blocker of job.qualityBlockers.slice(0, 8)) {
      const item = document.createElement("li");
      item.textContent = blocker;
      qualityList.append(item);
    }
    qualityNotice.hidden = false;
  } else {
    qualityNotice.hidden = true;
  }
}

async function pollJob() {
  if (!activeJobId) return;
  try {
    const response = await fetch(`/api/jobs/${activeJobId}`, {
      cache: "no-store",
    });
    const job = await response.json();
    if (!response.ok) throw new Error(job.error || "Could not read job status");
    jobStage.textContent = job.stage;
    renderLogs(job.logs);
    if (job.status === "complete") {
      activeJobId = null;
      submitButton.disabled = false;
      renderResult(job);
      return;
    }
    if (job.status === "failed") {
      activeJobId = null;
      submitButton.disabled = false;
      progressState.hidden = true;
      idleState.hidden = false;
      showError(job.error || "Video generation stopped.");
      return;
    }
    pollTimer = window.setTimeout(pollJob, 1_500);
  } catch (error) {
    activeJobId = null;
    submitButton.disabled = false;
    progressState.hidden = true;
    idleState.hidden = false;
    showError(error.message);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();
  if (pollTimer) window.clearTimeout(pollTimer);
  const data = new FormData(form);
  const payload = {
    title: data.get("title"),
    inputMode: data.get("inputMode"),
    targetMinutes: Number(data.get("targetMinutes") || 3),
    script: data.get("script"),
    sourceTitle: data.get("sourceTitle"),
    sourceNotes: data.get("sourceNotes"),
    voicePreset: data.get("voicePreset"),
    visualMode: data.get("visualMode"),
    acknowledged: data.get("acknowledged") === "on",
  };
  submitButton.disabled = true;
  idleState.hidden = true;
  resultState.hidden = true;
  progressState.hidden = false;
  jobStage.textContent = "Submitting the local job";
  jobLog.replaceChildren();
  try {
    const response = await fetch("/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const job = await response.json();
    if (!response.ok) throw new Error(job.error || "Could not start generation");
    activeJobId = job.id;
    jobStage.textContent = job.stage;
    renderLogs(job.logs);
    pollTimer = window.setTimeout(pollJob, 700);
  } catch (error) {
    submitButton.disabled = false;
    progressState.hidden = true;
    idleState.hidden = false;
    showError(error.message);
  }
});

updateInputMode();
void loadConfiguration();
