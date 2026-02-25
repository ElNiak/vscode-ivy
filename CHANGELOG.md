# Changelog

All notable changes to the Ivy Language extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-02-25

### Changed

- CI now runs extension tests under xvfb (16 tests passing on Node 20/22)
- Added Marketplace publish workflow
- Upgraded ivy-lsp dependency to v0.2.1 (z3 as core dep)

## [0.1.0] - 2025-02-25

### Added

- **Syntax Highlighting**: Full TextMate grammar covering 80+ Ivy keywords, including declaration keywords, specification keywords, quantifiers, temporal operators, control flow, native code blocks, labels, and the `#lang` directive.
- **Language Server (LSP)**: Integration with `ivy_lsp` providing document outline, workspace symbol search, go-to-definition, find references, hover information, and diagnostics.
- **Snippets**: Code templates for common Ivy patterns (`module`, `object`, `action`, `type`, `struct`, `variant`, `isolate`, `property`, `invariant`, `include`, `instance`, `forall`, `exists`, `if`, and more).
- **Language Configuration**: Line comments (`#`), auto-closing brackets, native code quote matching (`<<<`/`>>>`), smart indentation, qualified name word selection, and code folding.
- **Python Auto-Detection**: Automatic discovery of Python interpreter from workspace `.venv`, system `python3`, or `python`.
- **Graceful Degradation**: Extension provides syntax highlighting and snippets even when the LSP server is unavailable.

[0.2.0]: https://github.com/ElNiak/vscode-ivy/releases/tag/v0.2.0
[0.1.0]: https://github.com/ElNiak/vscode-ivy/releases/tag/v0.1.0
