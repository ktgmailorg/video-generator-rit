#!/usr/bin/env node
import { runCli } from "../src/cli.mjs";

try {
  await runCli();
} catch (error) {
  const detail =
    error.code === "APPROVAL_REQUIRED" && error.draftPath
      ? `${error.message}\nDraft review: ${error.draftPath}`
      : error.message;
  process.stderr.write(`${detail}\n`);
  if (process.env.RIT_VIDEO_DEBUG === "true" && error.stack) {
    process.stderr.write(`${error.stack}\n`);
  }
  process.exitCode = 1;
}
