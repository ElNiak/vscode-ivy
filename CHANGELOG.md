# Changelog

All notable changes to the Ivy Language extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.5] - 2026-02-25

### Added

- **Code Lens settings**: `ivy.codeLens.enabled` and `ivy.codeLens.rfcCoverage` to toggle inline requirement annotations and RFC coverage summaries.
- **RFC bracket tag snippets**: `rfctag` and `rfctags` snippets for writing coverage annotations.
- Updated Marketplace description and keywords for RFC traceability features.

### Changed

- Bumped ivy-lsp dependency to v0.5.5 (analysis pipeline wired into document lifecycle, security hardening, type design improvements, 7 new tests).

## [0.5.4] - 2026-02-25

### Added

- `scripts/bump_version.py` for automated version bumping with commit and tag.

### Changed

- LSP server installed from GitHub (`ivy-lsp @ git+https://github.com/ElNiak/ivy-lsp.git`) instead of PyPI.
- Version comparison uses `major.minor` to avoid unnecessary upgrades on patch bumps.

## [0.5.3] - 2026-02-25

### Fixed

- Regenerated `package-lock.json` to resolve npm CI 403 Forbidden error on `yocto-queue@0.1.0` tarball URL.
- Added npm caching (`cache: 'npm'`) to `ci.yml` and `publish.yml` GitHub Actions workflows for faster, more resilient installs.

## [0.5.2] - 2026-02-25

### Changed

- Updated README with full configuration table (15 settings), Commands section, Workspace Indexing documentation, and configurable restart parameters.
- Updated CHANGELOG with retroactive v0.5.1 entry.
- Bumped ivy-lsp dependency to v0.5.2.

## [0.5.1] - 2026-02-25

### Added

- **Workspace filtering settings**: `ivy.lsp.includePaths` (whitelist) and `ivy.lsp.excludePaths` (blacklist) control which directories the LSP indexes. Changing either setting triggers automatic server restart.
- **Flat staging directory**: IncludeResolver creates a flat symlink staging dir mirroring `ivyc`'s `include/1.7/` layout for deterministic include resolution.

### Changed

- Bumped ivy-lsp dependency to v0.5.1.

## [0.5.0] - 2026-02-25

### Added

- **Context menus**: Right-click "Ivy" submenu in editor and explorer for `.ivy` files with Verify, Compile, and Show Model actions.
- **Command Palette**: `Ivy: Verify`, `Ivy: Compile`, `Ivy: Show Model`, `Ivy: Cancel Running Operation`.
- **Keyboard shortcuts**: `Cmd+Shift+F5` (Verify), `Cmd+Shift+F6` (Compile), `Cmd+Shift+F7` (Show Model).
- **Smart isolate detection**: Automatically verifies the isolate under cursor position.
- **Progress reporting**: Spinning progress bar for long-running operations with cancellation support.
- **Output Channel**: Formatted results in the "Ivy" output channel.
- **New settings**: `ivy.tools.verifyTimeout`, `ivy.tools.compileTimeout`, `ivy.tools.autoSaveBeforeAction`.
- **Configurable restart limits**: `ivy.lsp.maxRestartCount` and `ivy.lsp.restartWindow` settings to control LSP server crash recovery. Set `maxRestartCount` to `-1` for unlimited restarts.
- LSP custom requests: `ivy/verify`, `ivy/compile`, `ivy/showModel`, `ivy/capabilities`.

### Changed

- Bumped ivy-lsp dependency to v0.5.0.

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

[0.5.5]: https://github.com/ElNiak/vscode-ivy/releases/tag/v0.5.5
[0.5.4]: https://github.com/ElNiak/vscode-ivy/releases/tag/v0.5.4
[0.5.3]: https://github.com/ElNiak/vscode-ivy/releases/tag/v0.5.3
[0.5.2]: https://github.com/ElNiak/vscode-ivy/releases/tag/v0.5.2
[0.5.1]: https://github.com/ElNiak/vscode-ivy/releases/tag/v0.5.1
[0.5.0]: https://github.com/ElNiak/vscode-ivy/releases/tag/v0.5.0
[0.3.3]: https://github.com/ElNiak/vscode-ivy/releases/tag/v0.3.3
[0.3.2]: https://github.com/ElNiak/vscode-ivy/releases/tag/v0.3.2
[0.3.1]: https://github.com/ElNiak/vscode-ivy/releases/tag/v0.3.1
[0.3.0]: https://github.com/ElNiak/vscode-ivy/releases/tag/v0.3.0
[0.2.0]: https://github.com/ElNiak/vscode-ivy/releases/tag/v0.2.0
[0.1.0]: https://github.com/ElNiak/vscode-ivy/releases/tag/v0.1.0
