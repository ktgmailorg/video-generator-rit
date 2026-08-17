import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { sha256 } from "../core/canonical.mjs";

const slug = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "source";

export async function ingestSourcePack(inputs = [], options = {}) {
  const entries = [];
  for (const input of inputs) {
    if (/^https?:\/\//i.test(input)) {
      if (!options.allowNetwork) {
        throw new Error(`Network source requires allowNetwork: ${input}`);
      }
      entries.push(await ingestUrl(input, options));
      continue;
    }
    const path = resolve(input);
    if (extname(path).toLowerCase() === ".json") {
      const parsed = JSON.parse(await readFile(path, "utf8"));
      if (Array.isArray(parsed.sources)) {
        for (const source of parsed.sources) {
          entries.push(await ingestManifestSource(source, path, options));
        }
        continue;
      }
    }
    entries.push(await ingestFile(path, {}, options));
  }
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.source.id)) {
      throw new Error(`Duplicate source ID: ${entry.source.id}`);
    }
    seen.add(entry.source.id);
  }
  return entries;
}

async function ingestManifestSource(source, manifestPath, options) {
  if (!source.id || !source.title) {
    throw new TypeError(
      `Source manifest ${manifestPath} entries require id and title`,
    );
  }
  if (source.content) {
    return makeEntry(Buffer.from(source.content), {
      ...source,
      type: source.type || "note",
      uri: source.uri || manifestPath,
    });
  }
  if (/^https?:\/\//i.test(source.uri || "")) {
    if (!options.allowNetwork) {
      throw new Error(
        `Network source in ${manifestPath} requires --allow-network: ${source.uri}`,
      );
    }
    return ingestUrl(source.uri, { ...options, metadata: source });
  }
  return ingestFile(
    resolve(dirname(manifestPath), source.path || source.uri),
    source,
    options,
  );
}

async function ingestFile(path, metadata = {}, options = {}) {
  const details = await stat(path);
  if (!details.isFile()) throw new TypeError(`Source is not a file: ${path}`);
  const bytes = await readFile(path);
  const extension = extname(path).toLowerCase();
  const content =
    extension === ".pdf"
      ? await extractPdfText(bytes, options.pdfToText || "pdftotext")
      : bytes.toString("utf8");
  return makeEntry(Buffer.from(content), {
    id: metadata.id || slug(basename(path, extension)),
    title: metadata.title || basename(path),
    type: "file",
    uri: path,
    verified: metadata.verified ?? false,
    author: metadata.author,
  });
}

async function ingestUrl(url, options = {}) {
  const response = await fetch(url, {
    headers: { "user-agent": "rit-video-generator/1.0" },
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error(`Could not retrieve source ${url}: HTTP ${response.status}`);
  }
  const content = await response.text();
  const metadata = options.metadata || {};
  return makeEntry(Buffer.from(content), {
    id: metadata.id || slug(new URL(url).hostname + new URL(url).pathname),
    title: metadata.title || url,
    type: metadata.type || "url",
    uri: url,
    verified: metadata.verified ?? false,
    author: metadata.author,
    retrievedAt: new Date().toISOString(),
  });
}

function makeEntry(bytes, metadata) {
  const content = bytes.toString("utf8").replace(/\0/g, "").trim();
  return {
    source: {
      id: metadata.id,
      title: metadata.title,
      type: metadata.type,
      uri: metadata.uri,
      sha256: sha256(bytes),
      verified: Boolean(metadata.verified),
      ...(metadata.author ? { author: metadata.author } : {}),
      ...(metadata.retrievedAt ? { retrievedAt: metadata.retrievedAt } : {}),
      excerpt: content.slice(0, 800),
    },
    content,
  };
}

function extractPdfText(bytes, command) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, ["-", "-"], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });
    const chunks = [];
    let stderr = "";
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      const wrapped = new Error(
        `PDF extraction requires ${command}: ${error.message}`,
      );
      wrapped.code = "PDF_EXTRACTOR_UNAVAILABLE";
      reject(wrapped);
    });
    child.on("close", (code) => {
      if (code === 0) resolvePromise(Buffer.concat(chunks).toString("utf8"));
      else reject(new Error(`${command} failed: ${stderr.slice(-1000)}`));
    });
    child.stdin.end(bytes);
  });
}

const tokens = (value) =>
  new Set(
    String(value)
      .toLowerCase()
      .match(/[a-z0-9]{3,}/g) || [],
  );

export function selectSourceContext(entries, query, options = {}) {
  const maximumCharacters = options.maximumCharacters || 40_000;
  const queryTokens = tokens(query);
  const chunks = entries.flatMap((entry) =>
    chunkText(entry.content, options.chunkCharacters || 4_000).map(
      (content, index) => ({
        sourceId: entry.source.id,
        index,
        content,
        score: [...tokens(content)].filter((token) => queryTokens.has(token))
          .length,
      }),
    ),
  );
  chunks.sort(
    (left, right) =>
      right.score - left.score ||
      left.sourceId.localeCompare(right.sourceId) ||
      left.index - right.index,
  );
  const selected = [];
  let characters = 0;
  for (const chunk of chunks) {
    if (
      selected.length &&
      characters + chunk.content.length > maximumCharacters
    ) {
      continue;
    }
    selected.push(chunk);
    characters += chunk.content.length;
    if (characters >= maximumCharacters) break;
  }
  return selected.sort(
    (left, right) =>
      left.sourceId.localeCompare(right.sourceId) || left.index - right.index,
  );
}

function chunkText(value, maximum) {
  const paragraphs = String(value).split(/\n{2,}/);
  const chunks = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (current && next.length > maximum) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
