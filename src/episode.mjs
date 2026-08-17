import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { sha256 } from "./core/canonical.mjs";
import { assertSchema } from "./core/schema.mjs";
import { readStoryboard } from "./storyboard.mjs";
import { selectSourceContext } from "./grounding/source-pack.mjs";
import {
  meaningfulTerms,
  pruneUnsupportedClaimSources,
} from "./grounding/audit.mjs";

const episodeId = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "episode";

export async function episodeFromStoryboard(path, sourceEntries = []) {
  const markdown = await readFile(path, "utf8");
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const sections = await readStoryboard(path);
  const claims = [];
  const beats = sections.map((section) => {
    const claimIds = (section.claims || []).map((claim, claimIndex) => {
      const id = `${section.id}-claim-${String(claimIndex + 1).padStart(2, "0")}`;
      claims.push({
        id,
        text: claim.text,
        sourceIds: claim.sourceIds,
        verified: false,
      });
      return id;
    });
    return {
      id: section.id,
      title: section.title,
      narration: section.narration,
      visualDirection: section.visualDirection,
      equations: section.equations,
      plannedSeconds: Math.max(0.1, section.plannedSeconds),
      delivery: section.delivery,
      captionSpeaker: "NARRATOR",
      claimIds,
      assetRequests: [],
      accessibility: {
        describedInNarration: true,
        audioDescriptionCue: null,
      },
    };
  });
  const episode = {
    schemaVersion: 2,
    id: episodeId(heading || basename(path)),
    title: heading || basename(path),
    learningObjectives: [],
    sources: sourceEntries.map((entry) => entry.source),
    claims,
    pronunciations: [],
    beats,
  };
  await assertSchema("episode", episode);
  return episode;
}

export async function episodeFromTopic({
  topic,
  sourceEntries = [],
  engine,
  dataClassification,
  groundingMode = "source-pack",
  lessonProfile = "concise",
}) {
  if (!topic?.trim()) throw new TypeError("Topic is required");
  if (
    !["concise", "full-lesson", "fast-full-lesson"].includes(lessonProfile)
  ) {
    throw new TypeError(`Unsupported lesson profile: ${lessonProfile}`);
  }
  const fullLesson = ["full-lesson", "fast-full-lesson"].includes(
    lessonProfile,
  );
  const fastLesson = lessonProfile === "fast-full-lesson";
  let researchProvenance = null;
  if (groundingMode === "researched") {
    const research = await engine.executeRole("research", {
      schemaVersion: 1,
      capability: "research.search",
      dataClassification,
      schemaName: "course_research_sources",
      outputSchema: researchSourceSchema,
      input: {
        instructions:
          "Find authoritative sources for this course topic. Return concise relevant excerpts, stable URLs, titles, and authors when known. Do not invent a URL.",
        prompt: topic.trim(),
      },
      parameters: {},
    });
    const retrievedAt =
      engine.records.at(-1)?.startedAt || new Date().toISOString();
    const discovered = research.output.json.sources.map((source, index) => {
      const content = source.excerpt.trim();
      return {
        source: {
          id:
            source.id ||
            `research-${String(index + 1).padStart(3, "0")}`,
          title: source.title,
          type: "research",
          uri: source.url,
          sha256: sha256(content),
          verified: false,
          ...(source.author ? { author: source.author } : {}),
          retrievedAt,
          excerpt: content.slice(0, 800),
        },
        content,
      };
    });
    sourceEntries = mergeSourceEntries(sourceEntries, discovered);
    researchProvenance = {
      requestSha256: research.requestSha256,
      sourceCount: discovered.length,
    };
  }
  const sourceCharacters = sourceEntries.reduce(
    (total, entry) => total + entry.content.length,
    0,
  );
  const context =
    sourceCharacters > 80_000 && engine.config.roles.embedding
      ? await selectEmbeddingContext({
          sourceEntries,
          topic,
          engine,
          dataClassification,
        })
      : selectSourceContext(sourceEntries, topic);
  const result = await engine.executeRole("planner", {
    schemaVersion: 1,
    capability: "text.generate",
    dataClassification,
    schemaName: "course_episode_plan",
    outputSchema:
      fastLesson
        ? fastLessonPlanSchema(
            sourceEntries.map((entry) => entry.source.id),
          )
        : fullLesson
          ? fullLessonPlanSchema()
          : topicPlanSchema,
    input: {
      instructions: [
        fastLesson
          ? "Create a compact, accurate blueprint for an 8-to-12-minute educational lesson with exactly ten sequential teaching beats. Do not write full narration."
          : fullLesson
          ? "Create an accurate, substantial 8-to-12-minute educational lesson with exactly ten sequential teaching beats."
          : "Create a concise, accurate educational video plan.",
        ...(fastLesson
          ? [
              "Create exactly three measurable learning objectives.",
              "For every beat, provide one distinct complete factual claim, a concrete example, a concise editable visual direction, and one or two exact supplied source IDs. End the claim, example, and visual direction with complete punctuation.",
              "Every cited source excerpt must directly support the claim; reuse at least two important technical terms from each cited excerpt so support can be checked locally.",
              "Do not invent course assignments, policies, measurements, datasets, instruction encodings, or product behavior that is absent from the supplied excerpts.",
              "Keep the claim, example, and visual direction compact; a deterministic local expander will produce the full narration.",
              "Sequence the beats from foundations through application and end with a practical analysis checklist.",
            ]
          : fullLesson
          ? [
              "Write 100 to 125 narration words per beat, using concrete examples and explaining reasoning rather than listing facts.",
              "Create exactly three measurable learning objectives and at least one source-bound factual claim for every beat.",
              "Write every claim as a complete sentence under 180 characters.",
              "Use a distinct factual claim for each beat; do not repeat claim text or insert the same source sentence into multiple narrations.",
              "Plan each beat for 50 to 75 seconds and describe a clear, editable educational diagram.",
              "End by integrating the lesson into a practical analysis or problem-solving checklist.",
            ]
          : []),
        "Use only the supplied source excerpts for factual claims.",
        "Every factual claim must cite one or more supplied source IDs.",
        "Narration must describe information that is essential to understand visuals.",
        "Do not imitate a named creator or invent sources.",
      ].join(" "),
      prompt: [
        `Topic: ${topic.trim()}`,
        "Source excerpts:",
        ...context.map(
          (chunk) => `[${chunk.sourceId}]\n${chunk.content}`,
        ),
      ].join("\n\n"),
    },
    parameters: { temperature: 0, top_p: 0.95, top_k: 20 },
    seed: fullLesson ? 27 : undefined,
  });
  const planned = result.output.json;
  const sources = sourceEntries.map((entry) => entry.source);
  const episode = fastLesson
    ? expandFastLessonPlan(planned, topic, sources, sourceEntries)
    : normalizePlannedEpisode(planned, topic, sources);
  if (fastLesson) {
    episode.claims = pruneUnsupportedClaimSources(
      episode.claims,
      sourceEntries.map((entry) => ({
        ...entry.source,
        content: entry.content,
      })),
    );
  }
  await assertSchema("episode", episode);
  return {
    episode,
    provenance: {
      providerRequestSha256: result.requestSha256,
      modelRevision: result.modelRevision,
      sourceContextSha256: sha256(context),
      ...(researchProvenance ? { research: researchProvenance } : {}),
    },
  };
}

async function selectEmbeddingContext({
  sourceEntries,
  topic,
  engine,
  dataClassification,
}) {
  const chunks = selectSourceContext(sourceEntries, "", {
    maximumCharacters: Number.MAX_SAFE_INTEGER,
    chunkCharacters: 4_000,
  });
  const result = await engine.executeRole("embedding", {
    schemaVersion: 1,
    capability: "embedding.create",
    dataClassification,
    input: { texts: [topic, ...chunks.map((chunk) => chunk.content)] },
    parameters: {},
  });
  const embeddings = result.output.embeddings || [];
  if (embeddings.length !== chunks.length + 1) {
    throw new Error(
      `Embedding provider returned ${embeddings.length} vectors for ${chunks.length + 1} inputs`,
    );
  }
  const query = embeddings[0];
  const ranked = chunks.map((chunk, index) => ({
    ...chunk,
    score: cosineSimilarity(query, embeddings[index + 1]),
  }));
  ranked.sort(
    (left, right) =>
      right.score - left.score ||
      left.sourceId.localeCompare(right.sourceId) ||
      left.index - right.index,
  );
  const selected = [];
  let characters = 0;
  for (const chunk of ranked) {
    if (selected.length && characters + chunk.content.length > 40_000) {
      continue;
    }
    selected.push(chunk);
    characters += chunk.content.length;
    if (characters >= 40_000) break;
  }
  return selected.sort(
    (left, right) =>
      left.sourceId.localeCompare(right.sourceId) || left.index - right.index,
  );
}

function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    throw new TypeError("Embedding vectors must have matching dimensions");
  }
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

function mergeSourceEntries(existing, discovered) {
  const merged = new Map(
    existing.map((entry) => [entry.source.id, entry]),
  );
  for (const entry of discovered) {
    let id = entry.source.id;
    let suffix = 2;
    while (merged.has(id)) {
      id = `${entry.source.id}-${suffix}`;
      suffix += 1;
    }
    entry.source.id = id;
    merged.set(id, entry);
  }
  return [...merged.values()];
}

function expandFastLessonPlan(planned, topic, sources, sourceEntries) {
  const supportSources = sourceEntries.map((entry) => ({
    ...entry.source,
    content: entry.content,
  }));
  const usedClaimTexts = new Set();
  const claims = (planned.beats || []).map((beat, index) => {
    const supported = sourceBoundCompactClaim({
      text: beat.claim,
      sourceIds: beat.sourceIds || [],
      sources: supportSources,
      usedClaimTexts,
    });
    usedClaimTexts.add(supported.text.toLowerCase());
    return {
      id: `claim-${String(index + 1).padStart(3, "0")}`,
      text: supported.text,
      sourceIds: supported.sourceIds,
    };
  });
  return normalizePlannedEpisode(
    {
      title: planned.title || topic,
      learningObjectives: planned.learningObjectives || [],
      claims,
      beats: (planned.beats || []).map((beat, index) => {
        const claim = claims[index];
        const title =
          String(beat.title || "").replace(/\s+/g, " ").trim() ||
          `Concept ${index + 1}`;
        const example = completeCompactSentence(
          beat.example,
          `A learner maps the inputs, constraints, and observable result for ${sentenceFragment(title)}, then checks each step against the stated claim.`,
        );
        const visualDirection = completeCompactSentence(
          beat.visualDirection,
          `Create an editable process diagram for ${sentenceFragment(title)} with labeled inputs, decisions, state changes, and a checked output.`,
        );
        const narration = fastNarration({
          title,
          claim: claim.text,
          example,
          visualDirection,
          index,
        });
        return {
          id: `beat-${String(index + 1).padStart(2, "0")}`,
          title,
          narration,
          visualDirection,
          plannedSeconds: Math.max(
            50,
            Math.min(
              70,
              Math.round(
                narration.split(/\s+/).filter(Boolean).length / 2.05 + 6,
              ),
            ),
          ),
          claimIds: [claim.id],
          accessibility: {
            describedInNarration: true,
            audioDescriptionCue: null,
          },
        };
      }),
    },
    topic,
    sources,
  );
}

function fastNarration({
  title,
  claim,
  example,
  visualDirection,
  index,
}) {
  const focus = sentenceFragment(title) || "this concept";
  const openings = [
    `Begin by framing ${focus} as a question about inputs, decisions, and observable results.`,
    `Now define ${focus} precisely enough that another learner could test the definition.`,
    `With the foundation in place, examine how ${focus} operates in a concrete sequence.`,
    `Next, compare the choices involved in ${focus} and make the decision criteria explicit.`,
    `Apply ${focus} to a worked situation instead of treating it as an isolated definition.`,
    `Examine the tradeoffs in ${focus}, including what improves and what becomes more difficult.`,
    `Stress-test the reasoning around ${focus} with an edge case and identify which assumption controls the outcome.`,
    `Use ${focus} to diagnose a failure by separating symptoms, causes, and corrective action.`,
    `Connect ${focus} to the earlier ideas and explain how the pieces work as one system.`,
    `Finish with ${focus} as a practical checklist that can guide a new analysis.`,
  ];
  const analysisCues = [
    "List the givens before choosing a method, because an unstated assumption can change the conclusion.",
    "Separate the formal definition from an implementation detail, then identify what evidence would distinguish them.",
    "Follow every arrow in order and name the state before and after each transition.",
    "Compare alternatives against the same constraints so the evaluation does not move the goalposts.",
    "Work from the concrete inputs to the result, checking units, types, or invariants at each step.",
    "State the benefit, the cost, and the condition under which the tradeoff is acceptable.",
    "Change one assumption at a time and observe which part of the reasoning no longer holds.",
    "Locate the first point where observed behavior diverges from expected behavior, then test the smallest plausible cause.",
    "Explain each connection explicitly and verify that information retains the same meaning across representations.",
    "For each checklist item, record the evidence, the remaining uncertainty, and the next verification step.",
  ];
  const closings = [
    "This establishes the vocabulary and scope needed for the remaining sections.",
    "A precise definition makes later examples easier to evaluate and revise.",
    "The trace converts an abstract statement into an inspectable sequence.",
    "Using shared criteria turns a preference into a defensible technical choice.",
    "The worked case shows both how to apply the method and how to check it.",
    "Making the tradeoff visible prevents a local improvement from hiding a larger cost.",
    "The edge case reveals the boundary of the claim without discarding the useful core idea.",
    "The diagnosis is strongest when another person can reproduce the observation and the test.",
    "The synthesis matters only if every connection remains supported by the original evidence.",
    "The result is a repeatable procedure, not a conclusion that depends on memory or intuition.",
  ];
  const core = [
    openings[index % openings.length],
    completeSentence(claim),
    `Consider this worked case: ${sentenceFragment(example)}.`,
    "Trace each intermediate state in the example, connect it to the formal claim, and verify that the final result satisfies the stated condition.",
    analysisCues[index % analysisCues.length],
    closings[index % closings.length],
  ];
  const sentences = [...core];
  const padding = [
    "Name each dependency explicitly, and keep labels and representations consistent throughout the analysis.",
    "Then summarize what the example demonstrates, what it does not establish, and what evidence would be needed next.",
  ];
  for (const sentence of padding) {
    if (wordCount(sentences.join(" ")) >= 95) break;
    sentences.push(sentence);
  }
  return sentences.join(" ");
}

function completeCompactSentence(value, fallback) {
  const cleaned = String(value || "").replace(/\s+/g, " ").trim();
  if (/[.!?]$/.test(cleaned)) return cleaned;
  const lastComplete = Math.max(
    cleaned.lastIndexOf("."),
    cleaned.lastIndexOf("!"),
    cleaned.lastIndexOf("?"),
  );
  if (lastComplete >= 40) return cleaned.slice(0, lastComplete + 1);
  return completeSentence(fallback);
}

function lowercaseFirst(value) {
  const cleaned = String(value || "").trim();
  return cleaned
    ? `${cleaned[0].toLocaleLowerCase()}${cleaned.slice(1)}`
    : cleaned;
}

function sentenceFragment(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?]+$/, "");
}

function completeSentence(value) {
  const cleaned = sentenceFragment(value);
  return `${cleaned}.`;
}

function wordCount(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function normalizePlannedEpisode(planned, topic, sources) {
  const claimIdMap = new Map();
  const usedClaimIds = new Set();
  const claims = (planned.claims || []).map((claim, index) => {
    const fallback = `claim-${String(index + 1).padStart(3, "0")}`;
    let id = normalizedEntityId(claim.id, fallback);
    if (usedClaimIds.has(id)) id = fallback;
    usedClaimIds.add(id);
    if (claim.id) claimIdMap.set(String(claim.id), id);
    return {
      id,
      text: completeClaimText(claim.text, claim.sourceIds || [], sources),
      sourceIds: uniqueStrings(claim.sourceIds),
      verified: false,
    };
  });
  const knownClaimIds = new Set(claims.map((claim) => claim.id));
  return {
    schemaVersion: 2,
    id: episodeId(planned.id || topic),
    title: planned.title || topic,
    learningObjectives: planned.learningObjectives || [],
    sources,
    claims,
    pronunciations: planned.pronunciations || [],
    beats: (planned.beats || []).map((beat, index) => {
      const beatId = normalizedEntityId(
        beat.id,
        `beat-${String(index + 1).padStart(2, "0")}`,
      );
      return {
        id: beatId,
        title: beat.title,
        narration: completeNarrationText(beat.narration),
        visualDirection: beat.visualDirection || "",
        equations: beat.equations || [],
        plannedSeconds: beat.plannedSeconds || 30,
        delivery: beat.delivery || "Clear, direct, and conversational.",
        captionSpeaker: beat.captionSpeaker || "NARRATOR",
        claimIds: normalizeClaimBindings({
          requestedIds: beat.claimIds,
          beatId,
          beatIndex: index,
          claims,
          knownClaimIds,
          claimIdMap,
        }),
        assetRequests: beat.assetRequests || [],
        accessibility: {
          describedInNarration:
            beat.accessibility?.describedInNarration ?? true,
          audioDescriptionCue:
            beat.accessibility?.audioDescriptionCue ?? null,
        },
      };
    }),
  };
}

function normalizedEntityId(value, fallback) {
  const candidate = String(value || "").trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(candidate)
    ? candidate
    : fallback;
}

function uniqueStrings(values) {
  return [
    ...new Set((values || []).filter((value) => typeof value === "string")),
  ];
}

function normalizeClaimBindings({
  requestedIds,
  beatId,
  beatIndex,
  claims,
  knownClaimIds,
  claimIdMap,
}) {
  const valid = uniqueStrings(requestedIds)
    .map((id) => claimIdMap.get(id) || id)
    .filter((id) => knownClaimIds.has(id));
  if (valid.length > 0) return valid;
  if (beatId && knownClaimIds.has(beatId)) return [beatId];
  return claims[beatIndex] ? [claims[beatIndex].id] : [];
}

function completeNarrationText(text) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (/[.!?]$/.test(cleaned)) return cleaned;
  const lastComplete = Math.max(
    cleaned.lastIndexOf("."),
    cleaned.lastIndexOf("!"),
    cleaned.lastIndexOf("?"),
  );
  if (lastComplete >= 400) return cleaned.slice(0, lastComplete + 1);
  const withoutFragment = cleaned.replace(/\s+\S*$/, "").trim();
  return `${withoutFragment || cleaned}.`;
}

function completeClaimText(text, sourceIds, sources) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (/[.!?]$/.test(cleaned)) return cleaned;
  const lastComplete = Math.max(
    cleaned.lastIndexOf("."),
    cleaned.lastIndexOf("!"),
    cleaned.lastIndexOf("?"),
  );
  if (lastComplete >= 40) return cleaned.slice(0, lastComplete + 1);
  const sentence = closestSourceSentence(cleaned, sourceIds, sources);
  if (sentence) return sentence;
  const withoutFragment = cleaned.replace(/\s+\S*$/, "").trim();
  return `${withoutFragment || cleaned}.`;
}

function sourceBoundCompactClaim({
  text,
  sourceIds,
  sources,
  usedClaimTexts,
}) {
  const completed = completeClaimText(text, sourceIds, sources);
  const claimTerms = meaningfulTerms(completed);
  const sourceTerms = new Set();
  for (const source of sources) {
    if (!sourceIds.includes(source.id)) continue;
    for (const term of meaningfulTerms(
      [source.title, source.content, source.excerpt]
        .filter(Boolean)
        .join(" "),
    )) {
      sourceTerms.add(term);
    }
  }
  const supportedTerms = [...claimTerms].filter((term) =>
    sourceTerms.has(term),
  );
  const coverage =
    claimTerms.size > 0 ? supportedTerms.length / claimTerms.size : 0;
  const fallback = closestSourceSentenceCandidate(
    text,
    [],
    sources,
    usedClaimTexts,
  );
  if (fallback) {
    return { text: fallback.sentence, sourceIds: [fallback.sourceId] };
  }
  if (
    supportedTerms.length >= 2 &&
    coverage >= 0.8 &&
    !usedClaimTexts.has(completed.toLowerCase())
  ) {
    return { text: completed, sourceIds: uniqueStrings(sourceIds) };
  }
  return { text: completed, sourceIds: uniqueStrings(sourceIds) };
}

function closestSourceSentence(query, sourceIds, sources) {
  return closestSourceSentenceCandidate(
    query,
    sourceIds,
    sources,
    new Set(),
  )?.sentence || "";
}

function closestSourceSentenceCandidate(
  query,
  sourceIds,
  sources,
  usedClaimTexts,
) {
  const queryTerms = meaningfulTerms(query);
  const candidates = [];
  for (const source of sources) {
    if (sourceIds.length > 0 && !sourceIds.includes(source.id)) continue;
    const text = String(source.content || source.excerpt || "")
      .replace(/\be\.g\./gi, "for example")
      .replace(/\bi\.e\./gi, "that is")
      .replace(/\bvs\./gi, "versus")
      .replace(/\s+/g, " ")
      .trim();
    for (const rawSentence of text.match(/[^.!?]+(?:[.!?]+|$)/g) || []) {
      const sentence = rawSentence.trim();
      if (sentence.length < 20) continue;
      const completedSentence = /[.!?]$/.test(sentence)
        ? sentence
        : `${sentence}.`;
      if (
        /^(?:note|contact hours|prerequisites?|typically offered)\s*:/i.test(
          completedSentence,
        ) ||
        /\b(?:GE:|NTID|SMTL:)\b/.test(completedSentence)
      ) {
        continue;
      }
      if (usedClaimTexts.has(completedSentence.toLowerCase())) continue;
      const terms = meaningfulTerms(sentence);
      const shared = [...queryTerms].filter((term) => terms.has(term)).length;
      candidates.push({
        sentence: completedSentence,
        sourceId: source.id,
        shared,
        coverage: queryTerms.size ? shared / queryTerms.size : 0,
      });
    }
  }
  candidates.sort(
    (left, right) =>
      right.shared - left.shared ||
      right.coverage - left.coverage ||
      left.sentence.length - right.sentence.length ||
      left.sentence.localeCompare(right.sentence),
  );
  return candidates[0] || null;
}

const topicPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "learningObjectives", "claims", "beats"],
  properties: {
    id: { type: "string" },
    title: { type: "string", minLength: 1 },
    learningObjectives: {
      type: "array",
      items: { type: "string" },
    },
    pronunciations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["term", "pronunciation"],
        properties: {
          term: { type: "string" },
          pronunciation: { type: "string" },
        },
      },
    },
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "text", "sourceIds"],
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          sourceIds: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    },
    beats: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "title",
          "narration",
          "visualDirection",
          "plannedSeconds",
          "claimIds",
          "accessibility"
        ],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          narration: { type: "string" },
          visualDirection: { type: "string" },
          equations: { type: "array", items: { type: "string" } },
          plannedSeconds: { type: "number", exclusiveMinimum: 0 },
          delivery: { type: "string" },
          captionSpeaker: { type: "string" },
          claimIds: { type: "array", items: { type: "string" } },
          assetRequests: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
              required: ["capability", "prompt"],
              properties: {
                capability: {
                  enum: ["image.generate", "video.generate"],
                },
                prompt: { type: "string" },
              },
            },
          },
          accessibility: {
            type: "object",
            additionalProperties: false,
            required: ["describedInNarration", "audioDescriptionCue"],
            properties: {
              describedInNarration: { type: "boolean" },
              audioDescriptionCue: { type: ["string", "null"] },
            },
          },
        },
      },
    },
  },
};

function fastLessonPlanSchema(sourceIds) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["title", "learningObjectives", "beats"],
    properties: {
      title: { type: "string", minLength: 1, maxLength: 120 },
      learningObjectives: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: { type: "string", maxLength: 150 },
      },
      beats: {
        type: "array",
        minItems: 10,
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "title",
            "claim",
            "example",
            "visualDirection",
            "sourceIds",
          ],
          properties: {
            title: { type: "string", minLength: 4, maxLength: 80 },
            claim: {
              type: "string",
              minLength: 40,
              maxLength: 180,
            },
            example: {
              type: "string",
              minLength: 40,
              maxLength: 240,
            },
            visualDirection: {
              type: "string",
              minLength: 30,
              maxLength: 240,
            },
            sourceIds: {
              type: "array",
              minItems: 1,
              maxItems: 2,
              items: {
                type: "string",
                ...(sourceIds.length > 0 ? { enum: sourceIds } : {}),
              },
            },
          },
        },
      },
    },
  };
}

function fullLessonPlanSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["title", "learningObjectives", "claims", "beats"],
    properties: {
      title: { type: "string", minLength: 1, maxLength: 120 },
      learningObjectives: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: { type: "string", maxLength: 180 },
      },
      claims: {
        type: "array",
        minItems: 10,
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "text", "sourceIds"],
          properties: {
            id: { type: "string" },
            text: { type: "string", maxLength: 220 },
            sourceIds: {
              type: "array",
              minItems: 1,
              maxItems: 2,
              items: { type: "string" },
            },
          },
        },
      },
      beats: {
        type: "array",
        minItems: 10,
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "id",
            "title",
            "narration",
            "visualDirection",
            "plannedSeconds",
            "claimIds",
            "accessibility"
          ],
          properties: {
            id: { type: "string" },
            title: { type: "string", maxLength: 100 },
            narration: { type: "string", minLength: 650, maxLength: 860 },
            visualDirection: { type: "string", maxLength: 180 },
            plannedSeconds: { type: "number", minimum: 50, maximum: 75 },
            claimIds: {
              type: "array",
              minItems: 1,
              maxItems: 2,
              items: { type: "string" },
            },
            accessibility: {
              type: "object",
              additionalProperties: false,
              required: ["describedInNarration", "audioDescriptionCue"],
              properties: {
                describedInNarration: { const: true },
                audioDescriptionCue: { type: ["string", "null"] },
              },
            },
          },
        },
      },
    },
  };
}

const researchSourceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["sources"],
  properties: {
    sources: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "url", "excerpt"],
        properties: {
          id: { type: "string" },
          title: { type: "string", minLength: 1 },
          url: { type: "string", pattern: "^https?://" },
          excerpt: { type: "string", minLength: 1 },
          author: { type: "string" }
        }
      }
    }
  }
};
