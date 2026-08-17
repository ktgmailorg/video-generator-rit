import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  utilityProcess,
} from "electron";
import {
  PROVIDER_CATALOG,
  applyProviderSelections,
} from "./credential-providers.mjs";
import {
  configuredProviders,
  credentialEnv,
  discoverLocalProviders,
  encryptionAvailable,
  forgetProvider,
  readSettings,
  saveProvider,
  verifyProvider,
  writeSettings,
} from "./credentials.mjs";

const desktopRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));
const smokeMode = process.argv.includes("--smoke");

// In development the pipeline is the repository this directory sits in; in a
// packaged build electron-builder copies the same files into resources/pipeline.
const pipelineRoot = app.isPackaged
  ? join(process.resourcesPath, "pipeline")
  : resolve(desktopRoot, "..");

let serverProcess = null;
let mainWindow = null;
let setupWindow = null;
let studioUrl = null;
let quitting = false;

function bundledBinary(name) {
  // ffmpeg-static / ffprobe-static export the absolute path to their binary.
  // In a packaged build those files live under resources/desktop-bin.
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

function dataRoot() {
  return join(app.getPath("userData"), "studio");
}

/**
 * Rewrite the studio config from the current credential state: the zero-key
 * generic preset, plus a hosted planner for each provider holding a key.
 */
async function writeStudioConfig() {
  const { presetConfig } = await import(
    pathToFileURL(join(pipelineRoot, "src", "config.mjs")).href
  );
  const { atomicWriteJson } = await import(
    pathToFileURL(join(pipelineRoot, "src", "core", "canonical.mjs")).href
  );
  const configPath = join(dataRoot(), "video.config.json");
  const config = applyProviderSelections(
    presetConfig("generic"),
    await configuredProviders(),
  );
  await atomicWriteJson(configPath, config);
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

function stopStudio() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}

async function startStudio() {
  const outputRoot = join(dataRoot(), "output");
  await mkdir(outputRoot, { recursive: true });
  const configPath = await writeStudioConfig();
  const port = await freePort();
  const environment = {
    ...process.env,
    ...(await resolveFfmpegEnvironment()),
    // Provider keys are handed to the server process only, never to a renderer.
    ...(await credentialEnv()),
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
  studioUrl = `http://127.0.0.1:${port}`;
  await waitForStudio(`${studioUrl}/api/config`, 90_000);
  return studioUrl;
}

/** Credentials changed, so the server needs a fresh config and environment. */
async function restartStudio() {
  stopStudio();
  await startStudio();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(studioUrl);
}

function createStudioWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    title: "RIT Video Studio",
    webPreferences: {
      // The renderer is the served studio web app; it needs no Node access
      // and deliberately gets no preload bridge.
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

function createSetupWindow() {
  setupWindow = new BrowserWindow({
    width: 720,
    height: 760,
    resizable: true,
    title: "RIT Video Studio setup",
    webPreferences: {
      preload: join(desktopRoot, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  setupWindow.removeMenu?.();
  setupWindow.on("closed", () => {
    setupWindow = null;
    // Closing the setup window without choosing still opens the studio.
    if (!quitting && !mainWindow) createStudioWindow();
  });
  setupWindow.loadFile(join(desktopRoot, "setup", "index.html"));
}

function registerSetupHandlers() {
  ipcMain.handle("setup:state", async () => ({
    // Only presentational fields cross the bridge; nothing secret.
    providers: PROVIDER_CATALOG.map((provider) => ({
      id: provider.id,
      kind: provider.kind,
      label: provider.label,
      hint: provider.hint || null,
      baseUrl: provider.baseUrl || null,
      keyUrl: provider.keyUrl || null,
      setupUrl: provider.setupUrl || null,
      authKinds: [...provider.authKinds],
    })),
    configured: await configuredProviders(),
    encryptionAvailable: encryptionAvailable(),
    settings: await readSettings(),
  }));

  ipcMain.handle("setup:discover-local", async () => {
    try {
      return await discoverLocalProviders();
    } catch {
      return [];
    }
  });

  ipcMain.handle("setup:verify", async (_event, { id, key, baseUrl }) => {
    try {
      return { ok: true, ...(await verifyProvider({ id, key, baseUrl })) };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle("setup:save", async (_event, { id, key, model, baseUrl }) => {
    try {
      await saveProvider({ id, key, model, baseUrl });
      await restartStudio();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle("setup:forget", async (_event, { id }) => {
    try {
      await forgetProvider(id);
      await restartStudio();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle("setup:finish", async () => {
    await writeSettings({ setupCompleted: true });
    if (!mainWindow) createStudioWindow();
    if (setupWindow && !setupWindow.isDestroyed()) setupWindow.close();
    return { ok: true };
  });

  ipcMain.handle("setup:open-external", async (_event, { url }) => {
    // Only ever open the documented key or install pages from the catalog,
    // so a compromised renderer cannot use this as a generic URL opener.
    const allowed = new Set(
      PROVIDER_CATALOG.flatMap((provider) =>
        [provider.keyUrl, provider.setupUrl].filter(Boolean),
      ),
    );
    if (allowed.has(url)) await shell.openExternal(url);
    return { ok: true };
  });
}

app.whenReady().then(async () => {
  try {
    registerSetupHandlers();
    await startStudio();
    if (smokeMode) {
      process.stdout.write(`SMOKE OK ${studioUrl}\n`);
      app.exit(0);
      return;
    }
    const settings = await readSettings();
    if (settings.setupCompleted) {
      createStudioWindow();
    } else {
      createSetupWindow();
    }
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0 && studioUrl) {
        createStudioWindow();
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

app.on("before-quit", () => {
  quitting = true;
  stopStudio();
});
process.on("exit", stopStudio);
