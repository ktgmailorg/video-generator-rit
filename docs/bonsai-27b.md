# Main pilot local planner: 1-bit Bonsai 27B

The main RIT pilot configuration uses PrismML's binary 1-bit Bonsai 27B as
the primary `planner` provider. This is the `Q1_0` model in
`prism-ml/Bonsai-27B-gguf`, not the larger 1.58-bit Ternary-Bonsai variant.
Planning runs through a local llama.cpp OpenAI-compatible server, so course
sources and prompts do not leave the machine.

The repository does not download model weights or runtimes automatically.
Install the official PrismML demo separately:

```bash
git clone https://github.com/PrismML-Eng/Bonsai-demo.git
cd Bonsai-demo
BONSAI_FAMILY=bonsai BONSAI_MODEL=27B ./setup.sh
BONSAI_FAMILY=bonsai BONSAI_MODEL=27B \
  ./scripts/start_llama_server.sh
```

For a long sequential batch, disable llama.cpp's cross-request prompt cache.
Recent server builds otherwise default to an 8 GiB cache, which can force a
24 GiB workstation into swap even though only one request is active:

```bash
/path/to/llama-server \
  -m /path/to/Bonsai-27B-Q1_0.gguf \
  --alias Bonsai-27B-Q1_0.gguf \
  --host 127.0.0.1 --port 8080 \
  -ngl 99 -c 4096 -np 1 -ctk q4_0 -ctv q4_0 \
  --reasoning-budget 64 -t 6 -tb 6 \
  --cache-ram 0 --no-cache-prompt --no-cache-idle-slots
```

This preserves the model and request output; it only prevents old prompt
states from accumulating in memory. Keep one generation stream active.

The expected text model file is `Bonsai-27B-Q1_0.gguf`. In another terminal,
record its exact digest before running the course planner:

```bash
export BONSAI_27B_SHA256="$(
  shasum -a 256 /path/to/Bonsai-27B-Q1_0.gguf | awk '{print $1}'
)"
cp examples/video.config.local.json video.config.json
npm run rit-video -- doctor
```

If the local server advertises a path or custom alias instead of
`Bonsai-27B-Q1_0.gguf`, set the profile's `model` to the exact ID shown by
`rit-video providers probe bonsai-27b-planner`. The health check deliberately
rejects an unlisted model rather than assuming the server will use the
requested weights.

The local profile requires this digest. It becomes part of the adapter
manifest, cache lookup, run lock, and recorded model revision. Changing the
model bytes therefore changes the request identity instead of silently
reusing output from a different model.

Generate a source-grounded plan with:

```bash
npm run rit-video -- plan \
  --topic "How a RISC-V ADD instruction moves through a five-stage CPU" \
  --sources courses/computer-architecture/sources.json
```

Generate the reviewed eight-course computing and engineering batch with the
same local model:

```bash
npm run courses:generate-bonsai
```

The batch is planned sequentially because a single Bonsai 27B stream has higher
aggregate throughput on the reference M4 Pro. Narration, deterministic visual
generation, section encoding, validation, and export remain bounded-parallel.
The resulting courses join the unified learning catalog rather than a
discipline-specific page.

On the 12-core, 24 GB M4 Pro reference machine, one bounded fast CSCI-141
planning pass took 62.481 seconds for 1,397 completion tokens, or about 22.36
output tokens per second.
This is a planning-only measurement; it excludes narration, visuals, rendering,
and human review. See [Speed Benchmarks](speed-benchmarks.md) for the measured
fresh-production and verified-replay results and their exact configuration.

The generated EpisodeSpec still requires script/evidence approval. The
deterministic renderer does not trust a local model's factual output merely
because it ran locally: every factual claim must reference an ingested source,
and frozen replay uses the accepted, hashed provider response.

For smaller machines, change the model and digest to the official Bonsai 8B,
4B, or 1.7B Q1_0 release. Those are compatible alternatives, but the main
pilot target remains Bonsai 27B.

## Antidoom + DSpark candidate

[`Danny-Dasilva/Bonsai-27B-antidoom-1bit-DSpark`](https://huggingface.co/Danny-Dasilva/Bonsai-27B-antidoom-1bit-DSpark)
is supported as the optional
`bonsai-antidoom-27b` catalog-planner preset. It is not the default on the
reference Mac. The model card reports a 4.67 GB antidoom Q1_0 target and a
separate 1.79 GB Q4_1 speculative drafter. Its published RTX 5090 result is
153.7 tokens/second natively and 192.4 tokens/second with DSpark on a
high-acceptance code prompt. The same card reports 166.0 and 208.3
tokens/second for base Bonsai, says antidoom is 5–8% slower natively, and warns
that DSpark can be slower on lower-acceptance prose.

The advertised DSpark path uses the PrismML llama.cpp fork's CUDA hybrid
kernels. It therefore does not provide the same acceleration path on Apple
Metal. For local course-planning prose on the M4 Pro, keep base Bonsai 27B or
Qwythos 9B as the speed-oriented choices. Use the antidoom preset when
repetition resistance is the goal or when a compatible CUDA workstation can
run and benchmark the target/drafter pair.

To bind an operator-installed antidoom target exactly:

```bash
export BONSAI_ANTIDOOM_27B_SHA256="$(
  shasum -a 256 /path/to/Bonsai-27B-antidoom-1bit-Q1_0.gguf | awk '{print $1}'
)"
node scripts/generate-rit-cs-catalog.mjs \
  --model bonsai-antidoom-27b --fast --only CSCI-250
```

Model weights and the PrismML runtime remain separate installations. The run
record retains the exact model digest and does not treat a model-card speed
claim as a benchmark of the current workstation.
