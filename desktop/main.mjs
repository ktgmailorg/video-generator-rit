import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { app, BrowserWindow, dialog, shell, utilityProcess } from "electron";

const desktopRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));
const smokeMode = process.argv.includes("--smoke");

// In development the pipeline is the repository this directory sits in; in a
// packaged build electron-builder copies the same files into resources/pipeline.
const pipelineRoot = app.isPackaged
  ? join(process.resourcesPath, "pipeline")
  : resolve(desktopRoot, "..");

let serverProcess = null;
let mainWindow = null;
let quitting = false;

function bundledBinary(name) {
  // ffmpeg-static / ffprobe-static export the absolute path to their binary.
  // In a packaged build those files live under resources/pipeline/desktop-bin.
  if (app.isPackaged) {
    const suffix = process.platform === "win32" ? ".exe" : "";
    const candidate = join(process.resourcesPath, "desktop-bin", `${name}${suffix}`);
    return existsSync(candidate) ? candidate : null;
  }
  return null;
}

async function resolveFfmpegEnvironment() {
  const environment = {};
  if (!process.env.VIDEO_FFMPEG) {
    const packaged = bundledBinary("ffmpeg");
    if (packaged) {
      environment.VIDEO_FFMPEG = packaged;
    } else {
      try {
        const { default: ffmpegPath } = await import("ffmpeg-static");
        if (ffmpegPath && existsSync(ffmpegPath)) environment.VIDEO_FFMPEG = ffmpegPath;
      } catch {
        // Fall back to a system ffmpeg on PATH.
      }
    }
  }
  if (!process.env.VIDEO_FFPROBE) {
    const packaged = bundledBinary("ffprobe");
    if (packaged) {
      environment.VIDEO_FFPROBE = packaged;
    } else {
      try {
        const ffprobe = await import("ffprobe-static");
        const ffprobePath = ffprobe.path || ffprobe.default?.path;
        if (ffprobePath && existsSync(ffprobePath)) environment.VIDEO_FFPROBE = ffprobePath;
      } catch {
        // Fall back to a system ffprobe on PATH.
      }
    }
  }
  return environment;
}

async function ensureConfig(dataRoot) {
  // Users can drop a hand-edited video.config.json in the app data directory;
  // otherwise generate the zero-key generic preset (Edge TTS + deterministic
  // SVG visuals) on first run.
  const configPath = join(dataRoot, "video.config.json");
  if (!existsSync(configPath)) {
    const { writePresetConfig } = await import(
      pathToFileURL(join(pipelineRoot, "src", "config.mjs")).href
    );
    await writePresetConfig(configPath, "generic");
  }
  return configPath;
}

function freePort(preferred = 4173) {
  return new Promise((resolvePromise) => {
    const probe = createServer();
    probe.once("error", () => {
      probe.close();
      const random = createServer();
      random.listen(0, "127.0.0.1", () => {
        const { port } = random.address();
        random.close(() => resolvePromise(port));
      });
    });
    probe.listen(preferred, "127.0.0.1", () => {
      probe.close(() => resolvePromise(preferred));
    });
  });
}

async function waitForStudio(url, timeoutMilliseconds) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMilliseconds) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5_000),
        cache: "no-store",
      });
      if (response.ok) return await response.json();
      lastError = new Error(`${url} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error(
    `The studio did not start: ${lastError?.message || "timed out"}`,
  );
}

async function startStudio() {
  const dataRoot = join(app.getPath("userData"), "studio");
  const outputRoot = join(dataRoot, "output");
  await mkdir(outputRoot, { recursive: true });
  const configPath = await ensureConfig(dataRoot);
  const port = await freePort();
  const environment = {
    ...process.env,
    ...(await resolveFfmpegEnvironment()),
  };
  serverProcess = utilityProcess.fork(
    join(pipelineRoot, "studio", "server.mjs"),
    ["--config", configPath, "--port", String(port), "--output", outputRoot],
    {
      cwd: pipelineRoot,
      env: environment,
      stdio: "inherit",
      serviceName: "studio-server",
    },
  );
  serverProcess.once("exit", (code) => {
    serverProcess = null;
    if (!quitting && code !== 0) {
      dialog.showErrorBox(
        "Studio stopped",
        `The local studio server exited unexpectedly (code ${code}).`,
      );
      app.quit();
    }
  });
  const studioUrl = `http://127.0.0.1:${port}`;
  await waitForStudio(`${studioUrl}/api/config`, 90_000);
  return studioUrl;
}

function createWindow(studioUrl) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    title: "RIT Video Studio",
    webPreferences: {
      // The renderer is the served studio web app; it needs no Node access.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Downloads and external links open in the OS browser, not new app windows.
    if (url.startsWith("http://127.0.0.1")) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.loadURL(studioUrl);
}

function stopStudio() {
  quitting = true;
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}

app.whenReady().then(async () => {
  try {
    const studioUrl = await startStudio();
    if (smokeMode) {
      process.stdout.write(`SMOKE OK ${studioUrl}\n`);
      app.exit(0);
      return;
    }
    createWindow(studioUrl);
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0 && studioUrl) {
        createWindow(studioUrl);
      }
    });
  } catch (error) {
    if (smokeMode) {
      process.stderr.write(`SMOKE FAIL ${error.message}\n`);
      app.exit(1);
      return;
    }
    dialog.showErrorBox("RIT Video Studio could not start", error.message);
    app.exit(1);
  }
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", stopStudio);
process.on("exit", stopStudio);
