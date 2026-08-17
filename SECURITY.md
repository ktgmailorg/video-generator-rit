# Security Policy

## Supported versions

The latest release on the `main` branch is supported.

## Reporting a vulnerability

Please report vulnerabilities privately via GitHub Security Advisories
("Report a vulnerability" on the repository's Security tab). Do not open a
public issue for security reports.

You can expect an acknowledgment within a week. Please include reproduction
steps and the commit or release you tested.

## Scope notes

- The studio companion binds to loopback (`127.0.0.1`) only; reports that it
  is reachable from other hosts in a default configuration are in scope.
- Provider credentials are never stored by the repository; leaks via logs,
  caches, or provenance records are in scope.
- Vulnerabilities in third-party model servers (llama.cpp, ComfyUI, Ollama)
  should be reported upstream.
