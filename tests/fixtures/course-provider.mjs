#!/usr/bin/env node
if (process.env.RIT_FIXTURE_FAIL === "true") {
  process.stderr.write("Fixture execution was forbidden\n");
  process.exit(9);
}

let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;
const envelope = JSON.parse(input);
const request = envelope.request;

if (request.capability !== "speech.synthesize") {
  process.stderr.write(`Unsupported fixture capability ${request.capability}\n`);
  process.exit(2);
}

const duration = 1.2;
const wav = makeWav(duration);
const vtt = `WEBVTT

00:00:00.000 --> 00:00:01.200
${request.input.text}
`;
process.stdout.write(
  JSON.stringify({
    schemaVersion: 1,
    output: {},
    artifacts: [
      {
        filename: "speech.wav",
        mimeType: "audio/wav",
        base64: wav.toString("base64"),
      },
      {
        filename: "speech.vtt",
        mimeType: "text/vtt",
        base64: Buffer.from(vtt).toString("base64"),
      },
    ],
    modelRevision: "fixture-speech-v1",
    finishReason: "stop",
  }),
);

function makeWav(seconds) {
  const sampleRate = 16_000;
  const samples = Math.floor(sampleRate * seconds);
  const data = Buffer.alloc(samples * 2);
  for (let index = 0; index < samples; index += 1) {
    const sample = Math.sin((index / sampleRate) * Math.PI * 2 * 220) * 0.1;
    data.writeInt16LE(Math.round(sample * 32767), index * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
