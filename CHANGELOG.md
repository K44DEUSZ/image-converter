# Changelog

## Unreleased 1.1.0

- Add dependency-free `/core` and DOM-based `/browser` entry points while preserving every root export and existing call signature.
- Accept Blob/File sources, optional cancellation, CORS options and pixel budgets. Keep the existing default output dimension limit.
- Isolate encoding rules from public metadata, normalize invalid inputs and encoder failures, and release temporary resources.
- Preserve cross-realm ArrayBuffer encoder results. Add packed TypeScript consumers, deterministic boundary tests and real browser checks in Chromium, Firefox and WebKit.
- Update the development dependency chain and document ownership, memory limits, metadata, animation and framework-independent usage.

## 1.0.0

Initial public release.
