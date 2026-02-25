# Changelog

All notable changes to the Ivy Language extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.3] - 2026-02-25

### Fixed

- Fixed `NameError: name 'importer' is not defined` crash when parsing `.ivy` files with `include`/`using` directives, enabling full workspace indexing for projects like QUIC that rely on includes.

### Changed

- Bumped ivy-lsp dependency to v0.3.3.

## [0.3.2] - 2026-02-25

### Fixed

- Registered `initialized` handler with pygls `@feature` decorator so workspace indexing, go-to-definition, references, hover, and completion actually work.
- Auto-upgrade managed ivy-lsp venv when the installed version does not match the extension version.

### Changed

- Bumped ivy-lsp dependency to v0.3.2.

## [0.3.1] - 2026-02-25

### Fixed

- Fixed pygls API calls: `publish_diagnostics` → `text_document_publish_diagnostics`, `show_message_log` → `window_log_message`.
- Updated CI to install z3 via `pip install -e ".[dev,full]"`.

### Changed

- Bumped ivy-lsp dependency to v0.3.1.

## [0.3.0] - 2026-02-25

### Added

- **Zero-config LSP install**: Extension automatically installs `ivy-lsp` into a managed virtualenv (`~/.ivy-lsp/venv/`) when no existing installation is found.
- `Ivy: Install Language Server` and `Ivy: Reset Language Server Installation` commands.
- Status-bar indicator showing LSP state (searching / installing / running).

### Changed

- LSP client now starts from the managed venv Python when available.

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

[0.3.2]: https://github.com/ElNiak/vscode-ivy/releases/tag/v0.3.2
[0.3.1]: https://github.com/ElNiak/vscode-ivy/releases/tag/v0.3.1
[0.3.0]: https://github.com/ElNiak/vscode-ivy/releases/tag/v0.3.0
[0.2.0]: https://github.com/ElNiak/vscode-ivy/releases/tag/v0.2.0
[0.1.0]: https://github.com/ElNiak/vscode-ivy/releases/tag/v0.1.0
