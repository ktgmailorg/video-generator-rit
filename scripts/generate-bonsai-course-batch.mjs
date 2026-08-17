import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const sourceRoot = resolve("courses/long-form-lessons");
const modelDigest = String(process.env.BONSAI_27B_SHA256 || "").toLowerCase();
if (!/^[a-f0-9]{64}$/.test(modelDigest)) {
  throw new Error(
    "BONSAI_27B_SHA256 must contain the SHA-256 of Bonsai-27B-Q1_0.gguf",
  );
}

const lessons = [
  {
    slug: "operating-systems-processes-memory",
    template: "showcase-operating-systems",
    title: "Operating Systems: Processes, System Calls, and Virtual Memory",
    topic:
      "Operating systems foundations: explain process isolation, user and kernel mode, system calls, scheduling, context switches, page tables, virtual memory, and a disciplined trace of one program operation through the OS.",
    area: "Computing",
    subject: "Operating Systems",
    description:
      "Trace how an operating system isolates processes, crosses the kernel boundary, schedules work, and maps virtual memory to physical resources.",
    sources: [
      {
        id: "mit-xv6-book",
        title: "xv6: a simple, Unix-like teaching operating system",
        uri: "https://pdos.csail.mit.edu/6.828/2025/xv6/book-riscv-rev5.pdf",
        author: "MIT PDOS",
        content:
          "The xv6 book presents a small Unix-like operating system for teaching. A process combines a private user address space with kernel-maintained execution state. User programs request protected services through system calls, which deliberately transfer control into the kernel. The kernel multiplexes processors among runnable processes, saves and restores register state during context switches, and uses page tables to translate virtual addresses. Virtual memory gives each process an isolated address space while allowing the kernel to control physical memory and selected sharing. Traps provide a common mechanism for system calls, device interrupts, and faults. Correct analysis distinguishes user code, privileged kernel code, hardware translation, and scheduler state.",
      },
      {
        id: "posix-fork",
        title: "POSIX fork() specification",
        uri: "https://pubs.opengroup.org/onlinepubs/9799919799/functions/fork.html",
        author: "The Open Group",
        content:
          "POSIX fork creates a new process. The child begins with a logical copy of the parent's process image but has a distinct process identifier and separate subsequent execution. The call returns different values in parent and child, enabling each branch to choose its behavior. File descriptors and other inherited resources follow defined sharing rules. Implementations may use copy-on-write virtual memory so pages are copied only after a write, but that optimization must preserve the specified process behavior. Process creation, execution replacement, waiting, and termination form a lifecycle whose resource ownership and failure cases must be handled explicitly.",
      },
    ],
  },
  {
    slug: "computer-networks-tcp-routing",
    template: "showcase-networks",
    title: "Computer Networks: Packets, IP Routing, and Reliable TCP",
    topic:
      "Computer networking foundations: teach layering, encapsulation, packet forwarding, IP addressing and routing, TCP connections, sequence numbers, acknowledgments, retransmission, flow control, congestion awareness, and how to diagnose one end-to-end request.",
    area: "Computing",
    subject: "Computer Networks",
    description:
      "Follow data through network layers and explain how IP forwarding and TCP reliability cooperate without hiding delay, loss, or congestion.",
    sources: [
      {
        id: "rfc-9293",
        title: "RFC 9293: Transmission Control Protocol",
        uri: "https://www.rfc-editor.org/rfc/rfc9293.html",
        author: "IETF",
        content:
          "RFC 9293 specifies TCP as a reliable, in-order byte-stream protocol between endpoints. Connections use sequence numbers, acknowledgments, checksums, retransmission, receive windows, and a defined state machine. TCP segments travel inside an internet protocol and may be lost, duplicated, delayed, or reordered. Reliability is therefore an endpoint behavior rather than a property guaranteed by each link. Acknowledgments identify received sequence space, timers trigger retransmission, and flow control prevents a sender from overrunning receiver capacity. Connection establishment and termination use explicit state transitions, and robust implementations must handle duplicate or unexpected segments according to the specification.",
      },
      {
        id: "rfc-8200",
        title: "RFC 8200: Internet Protocol, Version 6",
        uri: "https://www.rfc-editor.org/rfc/rfc8200.html",
        author: "IETF",
        content:
          "RFC 8200 specifies IPv6. An IPv6 packet has a fixed base header containing source and destination addresses, payload length, next-header information, hop limit, and traffic-related fields. Routers forward packets toward a destination while decrementing the hop limit; they do not provide TCP-style reliability. Extension headers carry optional internet-layer information in a defined order. The network layer offers best-effort datagram delivery, while transport protocols and applications decide how to detect and recover from loss. Layered reasoning separates a local link frame, an IP packet forwarded across networks, and the transport data interpreted only at endpoints.",
      },
    ],
  },
  {
    slug: "compiler-design-front-end",
    template: "showcase-compilers",
    title: "Compiler Design: From Source Text to Intermediate Representation",
    topic:
      "Compiler front-end foundations: explain lexical analysis, tokens, parsing, grammars, abstract syntax trees, semantic checks, symbol information, lowering to an intermediate representation, optimization boundaries, code generation, diagnostics, and how to trace one expression.",
    area: "Computing",
    subject: "Compiler Design",
    description:
      "Transform one expression from characters to tokens, syntax, semantic meaning, intermediate representation, and executable code.",
    sources: [
      {
        id: "llvm-frontend",
        title: "My First Language Frontend with LLVM",
        uri: "https://llvm.org/docs/tutorial/MyFirstLanguageFrontend/",
        author: "LLVM Project",
        content:
          "LLVM's Kaleidoscope tutorial builds a language frontend incrementally. A lexer groups input characters into tokens. A parser applies language grammar and operator precedence to construct an abstract syntax tree whose nodes represent expressions, function prototypes, and definitions. Code generation lowers validated AST nodes into LLVM intermediate representation. Later stages add optimization, just-in-time execution, control flow, mutable variables, object-file generation, and debug information. The tutorial emphasizes that each representation has a specific contract and that language features must be reflected consistently across lexing, parsing, AST design, and code generation.",
      },
      {
        id: "llvm-langref",
        title: "LLVM Language Reference Manual",
        uri: "https://llvm.org/docs/LangRef.html",
        author: "LLVM Project",
        content:
          "LLVM IR is a typed, low-level intermediate representation organized into modules, functions, basic blocks, and instructions. Control flow is explicit through terminators and basic-block edges. Values have types, instructions define and use values, and static single assignment form gives each register-like value one definition. A frontend must produce valid IR that obeys dominance, type, control-flow, and calling-convention rules. Verification catches structural violations before later optimization or code generation. IR is neither source syntax nor final machine code; it is a stable transformation boundary that makes analyses and target-independent optimizations possible.",
      },
    ],
  },
  {
    slug: "distributed-systems-consensus",
    template: "showcase-distributed",
    title: "Distributed Systems: Replication, Failures, and Raft Consensus",
    topic:
      "Distributed systems foundations: explain partial failure, replicated state machines, logs, leader election, terms, majority quorums, Raft log replication, commit rules, safety versus liveness, client retries, and a trace of one command through a three-node cluster.",
    area: "Computing",
    subject: "Distributed Systems",
    description:
      "Reason about partial failure and trace a client command through leader election, replicated logs, majority commitment, and recovery.",
    sources: [
      {
        id: "raft-paper",
        title: "In Search of an Understandable Consensus Algorithm",
        uri: "https://raft.github.io/raft.pdf",
        author: "Diego Ongaro and John Ousterhout",
        content:
          "Raft is a consensus algorithm for managing a replicated log. Servers occupy follower, candidate, or leader roles and advance through numbered terms. Randomized election timeouts help a candidate obtain votes and become leader. The leader accepts client commands, appends log entries, and replicates them to followers. An entry becomes committed according to majority and term rules, after which servers apply it to their state machines in order. Raft's election restriction, log-matching property, and commitment rules preserve safety across delays, restarts, and message loss. A majority is required for progress, so loss of quorum affects availability without permitting conflicting committed histories.",
      },
      {
        id: "mit-distributed-systems",
        title: "MIT 6.5840 Distributed Systems",
        uri: "https://pdos.csail.mit.edu/6.824/",
        author: "MIT PDOS",
        content:
          "MIT's distributed systems course studies abstraction, implementation, and performance in systems made from multiple networked computers. Core problems include concurrency, partial failure, replication, fault tolerance, and consistency. Labs use replicated services and Raft to connect algorithms with executable behavior under dropped messages, crashed servers, and changing timing. Distributed correctness requires explicit assumptions because a slow node can be indistinguishable from a failed node, messages can be delayed or duplicated, and retries can repeat an operation. Tests must explore schedules and failures rather than only the no-failure path.",
      },
    ],
  },
  {
    slug: "analog-circuits-rc-filters",
    template: "showcase-circuits",
    title: "Analog Circuits: RC Dynamics and First-Order Filters",
    topic:
      "Analog circuit foundations: teach the lumped abstraction, voltage and current reference directions, Kirchhoff laws, resistor and capacitor constitutive relations, RC time constant, charging and discharging, transient versus steady state, low-pass filtering, cutoff frequency, energy, and a complete step-response calculation.",
    area: "Engineering",
    subject: "Electrical Engineering",
    description:
      "Build and analyze a first-order RC circuit from conservation laws through transient response, time constant, and low-pass behavior.",
    sources: [
      {
        id: "mit-circuits",
        title: "MIT 6.002 Circuits and Electronics",
        uri: "https://ocw.mit.edu/courses/6-002-circuits-and-electronics-spring-2007/",
        author: "MIT OpenCourseWare",
        content:
          "MIT 6.002 introduces the lumped circuit abstraction, resistive networks, independent and dependent sources, switches, transistors, amplifiers, energy-storage elements, and first- and second-order dynamics. Circuit analysis combines element constitutive relations with Kirchhoff current and voltage constraints. A capacitor relates current to the rate of voltage change and stores electric-field energy. With one independent storage element, an RC network has a first-order natural response characterized by a time constant. Time-domain step response and frequency-domain filtering are complementary descriptions of the same linear circuit behavior.",
      },
      {
        id: "mit-circuit-notes",
        title: "MIT 6.002 Lecture Notes",
        uri: "https://ocw.mit.edu/courses/6-002-circuits-and-electronics-spring-2007/pages/lecture-notes/",
        author: "MIT OpenCourseWare",
        content:
          "The 6.002 lecture sequence develops a systematic circuit analysis method: choose reference polarities and current directions, write element laws, apply Kirchhoff constraints, and solve the resulting equations. It covers superposition, Thévenin and Norton equivalents, energy storage, transient analysis, and frequency response. A valid solution must satisfy both the interconnection constraints and each element's constitutive law. Initial capacitor voltage is continuous unless an impulse supplies unbounded current, and final steady-state behavior can be checked independently. Limiting cases at zero time, long time, zero frequency, and high frequency provide useful error checks.",
      },
    ],
  },
  {
    slug: "signals-sampling-fourier",
    template: "showcase-signals",
    title: "Signals and Systems: Sampling, Convolution, and Fourier Reasoning",
    topic:
      "Signals and systems foundations: distinguish continuous and discrete signals, model linear time-invariant systems, explain impulse response and convolution, introduce complex exponentials and Fourier representation, interpret frequency response, teach sampling and aliasing, and trace a sinusoid through a filter and sampler.",
    area: "Engineering",
    subject: "Signals and Systems",
    description:
      "Connect time-domain signals, LTI systems, convolution, frequency response, sampling, and aliasing in one coherent analysis.",
    sources: [
      {
        id: "mit-signals",
        title: "MIT 6.003 Signals and Systems",
        uri: "https://ocw.mit.edu/courses/6-003-signals-and-systems-fall-2011/",
        author: "MIT OpenCourseWare",
        content:
          "MIT 6.003 covers continuous-time and discrete-time signals; complex exponential representations; linear, time-invariant systems; differential and difference equations; convolution; impulse, step, and frequency responses; Fourier, Laplace, and Z-transform representations; and sampling. An LTI system is characterized by its response to an impulse, and convolution combines that impulse response with an arbitrary input. Complex exponentials are eigenfunctions of LTI systems, so frequency response describes how magnitude and phase change by frequency. Equivalent time- and frequency-domain views should produce consistent predictions.",
      },
      {
        id: "mit-sampling",
        title: "MIT 6.003 Lecture 21: Sampling",
        uri: "https://ocw.mit.edu/courses/6-003-signals-and-systems-fall-2011/12e6e5d7567fca2e993ef8563fef5a60_MIT6_003F11_lec21.pdf",
        author: "MIT OpenCourseWare",
        content:
          "Sampling represents a continuous-time signal by values taken at discrete times. Periodic sampling creates repeated copies of the signal spectrum separated by the sampling frequency. If those copies overlap, different continuous frequencies become indistinguishable after sampling; this is aliasing. A bandlimited signal can be reconstructed when the sample rate and anti-alias filtering prevent spectral overlap. Increasing sample rate does not repair aliasing that already occurred before conversion. A correct workflow identifies the signal bandwidth, applies appropriate analog filtering, selects a sample rate with margin, and verifies reconstruction assumptions.",
      },
    ],
  },
  {
    slug: "fluid-mechanics-continuity-bernoulli",
    template: "showcase-fluids",
    title: "Fluid Mechanics: Continuity, Pressure, and Bernoulli’s Equation",
    topic:
      "Introductory fluid mechanics: explain control volumes, density, mass flow rate, continuity, static and dynamic pressure, Bernoulli's equation, its assumptions, area-velocity-pressure relationships, pitot measurement, losses and invalid applications, and solve one narrowing-pipe example with units.",
    area: "Engineering",
    subject: "Fluid Mechanics",
    description:
      "Apply conservation of mass and energy to flow through changing area while stating exactly when Bernoulli’s equation is valid.",
    sources: [
      {
        id: "nasa-mass-flow",
        title: "Mass Flow Rate",
        uri: "https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/mass-flow-rate/",
        author: "NASA Glenn Research Center",
        content:
          "NASA Glenn explains mass conservation for flow through a tube. Mass flow rate is the mass crossing a plane per unit time and can be written as density times area times average velocity for a one-dimensional model. With no accumulation or source inside a steady control volume, inlet and outlet mass flow rates match. For incompressible flow, constant density reduces continuity to an area-velocity relationship. A smaller area therefore requires a larger average velocity for the same volumetric flow rate. Compressible gas flow needs the density change to remain in the equation, and high-speed flow introduces additional limits.",
      },
      {
        id: "nasa-bernoulli",
        title: "Bernoulli’s Equation",
        uri: "https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/bernoullis-equation/",
        author: "NASA Glenn Research Center",
        content:
          "NASA Glenn presents Bernoulli's equation as a conservation-of-energy relation for restricted flow conditions. A common form relates static pressure and one-half density times velocity squared to total pressure. That simplified form assumes steady, inviscid, incompressible flow without heat addition, shaft work, or significant elevation change along the comparison. Different assumptions require a more general energy equation. Applications include changing-area ducts and pitot-static speed measurement. Bernoulli's equation must not be used as a universal explanation when viscosity, compressibility, pumps, turbines, heat transfer, or unsteady behavior materially affect the flow.",
      },
    ],
  },
  {
    slug: "solid-mechanics-stress-strain",
    template: "showcase-mechanics",
    title: "Solid Mechanics: Equilibrium, Stress, Strain, and Material Limits",
    topic:
      "Solid mechanics foundations: teach free-body diagrams, force and moment equilibrium, internal resultants, normal and shear stress, normal strain, elastic modulus, linear elasticity, stress-strain curves, yielding, plasticity, fracture, safety factors, and a complete axial-member calculation with units.",
    area: "Engineering",
    subject: "Solid Mechanics",
    description:
      "Move from a free-body diagram to internal load, stress, strain, deformation, material limits, and an engineering design check.",
    sources: [
      {
        id: "mit-solid-mechanics",
        title: "MIT 1.050 Solid Mechanics",
        uri: "https://ocw.mit.edu/courses/1-050-solid-mechanics-fall-2004/",
        author: "MIT OpenCourseWare",
        content:
          "MIT 1.050 introduces static equilibrium, force resultants, support conditions, determinate beams, trusses and frames, stress and strain in structural elements, shear, bending, torsion, displacements, deformation, elastic stability, and design reasoning. Analysis begins by isolating a body, replacing connections with forces and moments, and enforcing translational and rotational equilibrium. Internal resultants follow from cuts through a member. Stress describes internal force intensity rather than total external load, while deformation depends on geometry, material behavior, and boundary conditions. Units, signs, and the chosen section must remain explicit.",
      },
      {
        id: "mit-materials-structures",
        title: "MIT Unified Engineering: Materials and Structures",
        uri: "https://ocw.mit.edu/courses/16-001-unified-engineering-materials-and-structures-fall-2021/",
        author: "MIT OpenCourseWare",
        content:
          "MIT's materials and structures course covers statics, trusses, determinate and indeterminate systems, stress-strain behavior, beam bending, buckling, torsion, plasticity, fracture, fatigue, and structural failure. In uniaxial loading, normal stress is axial force divided by cross-sectional area and normal strain is change in length divided by original length. Linear elastic behavior relates stress and strain through an elastic modulus over a limited range. Yielding marks the onset of significant permanent deformation, while fracture and fatigue involve different failure mechanisms. Design checks compare predicted demands with material and structural limits using stated safety assumptions.",
      },
    ],
  },
];

const pendingLessons = [...lessons];
await generateWorker();

console.log(
  JSON.stringify(
    {
      model: "prism-ml/Bonsai-27B-gguf",
      modelFile: "Bonsai-27B-Q1_0.gguf",
      modelSha256: modelDigest,
      count: lessons.length,
      lessons: lessons.map(({ slug, title }) => ({ slug, title })),
    },
    null,
    2,
  ),
);

async function generateLesson(lesson) {
  const directory = join(sourceRoot, lesson.slug);
  const outputRoot = `.demo-output/long-form-lessons/${lesson.slug}`;
  await mkdir(directory, { recursive: true });
  try {
    const generation = JSON.parse(
      await readFile(join(directory, "generation.json"), "utf8"),
    );
    await readFile(join(directory, "storyboard.md"), "utf8");
    if (generation.modelSha256 === modelDigest) {
      console.log(`[${lesson.slug}] Reusing validated Bonsai lesson`);
      return;
    }
  } catch {
    // A partial or differently versioned lesson is regenerated below.
  }
  const sources = {
    schemaVersion: 1,
    sources: lesson.sources.map((source) => ({
      ...source,
      type: "note",
      verified: true,
    })),
  };
  const config = {
    schemaVersion: 1,
    preset: "rit-course",
    project: {
      id: `long-form-${lesson.slug}`,
      title: lesson.title,
      owner: "Kenju Tomita",
      courseCode: lesson.subject.toUpperCase(),
      department: "RIT AI Club",
      audience: "introductory undergraduate students",
    },
    dataPolicy: {
      classification: "public",
      hostedConsent: true,
      allowedHostedProviders: ["edge-narration"],
    },
    providers: {
      "bonsai-27b-planner": {
        adapter: "openai-compatible",
        executionLocation: "local",
        baseUrl: "http://127.0.0.1:8080/v1",
        model: "Bonsai-27B-Q1_0.gguf",
        modelDigest: modelDigest,
        requireModelDigest: true,
        supportsStructuredOutput: true,
        supportsSeed: true,
        capabilities: ["text.generate"],
        estimatedCostUsd: 0,
        timeoutMs: 900000,
      },
      "edge-narration": {
        adapter: "edge-tts",
        executionLocation: "hosted",
        model: "edge-tts-7.2.8",
        voice: "en-US-AndrewMultilingualNeural",
        rate: "-30%",
        pitch: "+0Hz",
      },
    },
    roles: {
      planner: { primary: "bonsai-27b-planner", fallbacks: [] },
      narration: { primary: "edge-narration", fallbacks: [] },
    },
    workflow: {
      groundingMode: "source-pack",
      determinism: "record",
      approvals: [],
      outputRoot,
      cacheRoot: ".video-cache/v2",
      maxCostUsd: 0,
      allowUnknownCost: false,
    },
    brandPack: null,
  };
  const sourcesPath = join(directory, "sources.json");
  const configPath = join(directory, "video.config.json");
  await writeJson(sourcesPath, sources);
  await writeJson(configPath, config);
  await run([
    "bin/rit-video.mjs",
    "plan",
    "--config",
    configPath,
    "--topic",
    lesson.topic,
    "--sources",
    sourcesPath,
    "--lesson-profile",
    "full-lesson",
  ], lesson.slug);

  const episodePath = resolve(outputRoot, "episode.json");
  const episode = JSON.parse(await readFile(episodePath, "utf8"));
  validateEpisode(episode, lesson);
  await writeFile(
    join(directory, "storyboard.md"),
    `${storyboardFromEpisode(episode, lesson.template)}\n`,
  );
  await writeJson(join(directory, "catalog.json"), {
    id: `full-${lesson.slug}`,
    title: lesson.title,
    area: lesson.area,
    subject: lesson.subject,
    format: "Full lesson",
    level: "Introductory",
    description: lesson.description,
    outcomes: episode.learningObjectives,
    paths: ["Computing & Engineering", "STEM Foundations"],
    aiContribution: {
      stage: "source-grounded planning and narration draft",
      provider: "local-openai-compatible",
      model: "prism-ml/Bonsai-27B-gguf",
      modelRevision: `sha256:${modelDigest}`,
      humanReviewRequired: true,
    },
  });
  const planning = JSON.parse(
    await readFile(resolve(outputRoot, "planning-provider-records.json"), "utf8"),
  );
  await writeJson(join(directory, "generation.json"), {
    schemaVersion: 1,
    provider: "local-openai-compatible",
    model: "prism-ml/Bonsai-27B-gguf",
    modelFile: "Bonsai-27B-Q1_0.gguf",
    modelSha256: modelDigest,
    requestSha256: planning.provenance.providerRequestSha256,
    resolvedModelRevision: planning.provenance.modelRevision,
    sourceContextSha256: planning.provenance.sourceContextSha256,
    sourceIds: lesson.sources.map((source) => source.id),
    acceptedOutput: {
      episodeId: episode.id,
      beatCount: episode.beats.length,
      claimCount: episode.claims.length,
    },
  });
}

async function generateWorker() {
  while (pendingLessons.length) {
    const lesson = pendingLessons.shift();
    await generateLesson(lesson);
  }
}

function validateEpisode(episode, lesson) {
  if (episode.beats.length !== 10) {
    throw new Error(`${lesson.slug}: expected 10 beats, got ${episode.beats.length}`);
  }
  if (episode.learningObjectives.length !== 3) {
    throw new Error(`${lesson.slug}: expected 3 learning objectives`);
  }
  const sourceIds = new Set(lesson.sources.map((source) => source.id));
  const claims = new Map(episode.claims.map((claim) => [claim.id, claim]));
  for (const claim of episode.claims) {
    if (!claim.sourceIds.length || claim.sourceIds.some((id) => !sourceIds.has(id))) {
      throw new Error(`${lesson.slug}: claim ${claim.id} has an invalid source`);
    }
  }
  for (const beat of episode.beats) {
    const words = beat.narration.split(/\s+/).filter(Boolean).length;
    if (words < 85) {
      throw new Error(`${lesson.slug}: ${beat.id} has only ${words} narration words`);
    }
    if (!beat.claimIds.length || beat.claimIds.some((id) => !claims.has(id))) {
      throw new Error(`${lesson.slug}: ${beat.id} lacks a valid claim binding`);
    }
  }
}

function storyboardFromEpisode(episode, template) {
  let start = 0;
  const sections = episode.beats.map((beat) => {
    const words = beat.narration.split(/\s+/).filter(Boolean).length;
    const duration = Math.max(
      55,
      Math.min(78, Math.round(Math.max(beat.plannedSeconds, words / 2.1 + 5))),
    );
    const end = start + duration;
    const boundClaims = beat.claimIds
      .map((id) => episode.claims.find((claim) => claim.id === id))
      .filter(Boolean);
    const claims = boundClaims
      .map(
        (claim) =>
          `**[CLAIM ${claim.sourceIds.join(", ")}]** ${claim.text}`,
      )
      .join("\n");
    const equations = (beat.equations || [])
      .map((equation) => `**[EQUATION]** ${equation}`)
      .join("\n");
    const section = [
      `## ${clock(start)} - ${clock(end)} — ${beat.title}`,
      "",
      `**[VISUAL]** template:${template} | ${beat.visualDirection}`,
      claims,
      equations,
      "",
      "**[VOICEOVER]**",
      "",
      beat.narration,
      "",
      `**Delivery:** ${beat.delivery || "Professional, clear, and appropriately paced for an introductory undergraduate lesson."}`,
    ]
      .filter((line) => line !== undefined)
      .join("\n");
    start = end;
    return section;
  });
  return `# ${episode.title}\n\n${sections.join("\n\n")}`;
}

function clock(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function writeJson(path, value) {
  return writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function run(args, label) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: resolve("."),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    child.stdout.on("data", (chunk) =>
      process.stdout.write(`[${label}] ${chunk}`),
    );
    child.stderr.on("data", (chunk) =>
      process.stderr.write(`[${label}] ${chunk}`),
    );
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${label} planning exited with code ${code}`));
    });
  });
}
