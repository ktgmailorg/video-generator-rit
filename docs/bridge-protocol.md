# Provider bridge protocol v1

HTTP and CLI bridges receive the same JSON request envelope. HTTP bridges
receive it as the POST body. CLI bridges receive one JSON value on standard
input and must write one JSON value to standard output. Diagnostics belong on
standard error.

```json
{
  "schemaVersion": 1,
  "request": {
    "schemaVersion": 1,
    "capability": "speech.synthesize",
    "model": "/models/en_US-lessac-medium.onnx",
    "input": {
      "text": "A short course narration."
    },
    "parameters": {},
    "dataClassification": "restricted"
  }
}
```

The normalized response is:

```json
{
  "schemaVersion": 1,
  "output": {},
  "artifacts": [
    {
      "filename": "speech.wav",
      "mimeType": "audio/wav",
      "base64": "UklGR..."
    }
  ],
  "usage": {},
  "costUsd": null,
  "requestId": "optional-provider-id",
  "modelRevision": "model@sha256:...",
  "finishReason": "stop",
  "raw": {
    "providerVersion": "optional"
  }
}
```

Rules:

- Declare every supported capability in the provider profile.
- Return artifact bytes as base64. The core validates and moves them into its
  content-addressed store.
- Return a resolved model revision or local digest whenever possible.
- Never print secrets to stdout or stderr.
- Exit nonzero for invalid requests or provider failures.
- Honor process termination. The built-in CLI adapter uses `spawn` without a
  shell and tracks cancellation; child bridges must also terminate their own
  subprocesses.
- Do not start detached work. Long-running hosted adapters should report a
  job ID through the native adapter progress interface.

The machine-readable request, result, and bridge schemas are in
`src/schemas/`.
