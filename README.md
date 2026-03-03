# Ivy Language for VS Code

[![CI](https://github.com/ElNiak/vscode-ivy/actions/workflows/ci.yml/badge.svg)](https://github.com/ElNiak/vscode-ivy/actions/workflows/ci.yml)

Language support for [Ivy](https://github.com/ElNiak/Panther-IVy) formal specification files (`.ivy`) — syntax highlighting, LSP integration, and snippets.

## Installation

### From the Marketplace (Recommended)

Search for **"Ivy Language"** in the VS Code Extensions panel, or run:

```
ext install panther-ivy.ivy-language
```

### From VSIX

1. Download the latest `.vsix` from [Releases](https://github.com/ElNiak/vscode-ivy/releases)
2. In VS Code: Extensions sidebar > `...` menu > "Install from VSIX..."
3. Or: `code --install-extension ivy-language-<version>.vsix`

## Features

### Syntax Highlighting

Full TextMate grammar covering all 80+ Ivy keywords:

- Declaration keywords (`action`, `object`, `module`, `type`, `struct`, `isolate`, ...)
- Specification keywords (`property`, `invariant`, `require`, `ensure`, `assert`, `assume`, ...)
- Quantifiers and temporal operators (`forall`, `exists`, `globally`, `eventually`)
- Control flow (`if`, `else`, `while`, `for`, `match`)
- Native code blocks (`<<<...>>>`)
- Labels (`[name]`), uppercase variables, type annotations
- `#lang ivy1.7` directive (highlighted as directive, not comment)

### Language Server (LSP)

When the Ivy LSP server is installed, you get:

- Document outline (Cmd/Ctrl+Shift+O)
- Workspace symbol search (Cmd/Ctrl+T)
- Go-to-definition (F12)
- Find references (Shift+F12)
- Hover information
- Diagnostics (parse errors)

### Snippets

Code templates for common Ivy patterns:
`module`, `object`, `action`, `type`, `struct`, `variant`, `isolate`, `property`, `invariant`, `include`, `instance`, `forall`, `exists`, `if`, and more.

### Commands

#### Core Actions

| Command | Shortcut | Description |
|---------|----------|-------------|
| `Ivy: Verify` | `Cmd+Shift+F5` (`Ctrl+Shift+F5`) | Run `ivy_check` on the current file or isolate under cursor. |
| `Ivy: Compile` | `Cmd+Shift+F6` (`Ctrl+Shift+F6`) | Compile the current Ivy file with `ivyc`. |
| `Ivy: Show Model Info` | `Cmd+Shift+F7` (`Ctrl+Shift+F7`) | Display model structure via `ivy_show`. |
| `Ivy: Set Active Test` | `Cmd+Shift+F8` (`Ctrl+Shift+F8`) | Set the active test scope for scoped analysis. |
| `Ivy: Cancel Running Operation` | — | Cancel an in-progress verify/compile/show. |
| `Ivy: Recompile All Tests` | — | Run background compilation for all test entry points. |
| `Ivy: List Available Tests` | — | List Ivy test files in the workspace. |

#### Navigation & Requirements

| Command | Description |
|---------|-------------|
| `Ivy: Navigate to Included File` | Jump to an included `.ivy` file from the current file. |
| `Ivy: Show Action Requirements` | Display requirement annotations for actions. |
| `Ivy: Show Property Details` | Show property invariants and their status. |
| `Ivy: Show RFC Details` | Show RFC bracket tag coverage details. |
| `Ivy: Open Model Visualization` | Open the Cytoscape-based dependency/state-machine graph. |
| `Ivy: Refresh Requirements` | Refresh the Requirements tree view. |

#### Server Management

| Command | Description |
|---------|-------------|
| `Ivy: Install Language Server` | Install the Ivy LSP server into a managed venv. |
| `Ivy: Install Full Support (z3)` | Install ivy-lsp with Z3 for full formal verification. |
| `Ivy: Reset Language Server Installation` | Remove and re-install the managed LSP server. |
| `Ivy: Check for LSP Updates` | Check for and install LSP server updates. |
| `Ivy: Show Server Output` | Open the LSP server output channel. |
| `Ivy: Toggle Debug Logging` | Toggle verbose debug logging for the server. |

#### Monitoring

| Command | Description |
|---------|-------------|
| `Ivy: Open Dashboard` | Open the monitoring webview dashboard. |
| `Ivy: Refresh Monitor` | Refresh the monitoring tree view. |
| `Ivy: Re-index Workspace` | Trigger a full workspace re-index. |
| `Ivy: Clear Cache` | Clear staging cache and re-index. |
| `Ivy: Edit Include Paths` | Edit workspace include paths for indexing. |
| `Ivy: Edit Exclude Paths` | Edit workspace exclude paths for indexing. |
| `Ivy: Show Activity Log` | Open the structured activity log channel. |

All commands are also available via right-click context menu on `.ivy` files (editor and explorer).

### Monitoring Panel

The Activity Bar sidebar shows a live monitoring tree view with:

- **Server**: Mode (Full/Light), version, uptime, available tools
- **Indexing**: Status, file/symbol/include counts, stale file detection
- **Analysis Pipeline**: Tier 1/2/3 analysis progress and status
- **Features**: Enabled server-side capabilities
- **Deep Index**: Parse worker status and deep indexing progress
- **Test Features**: Active test scope, compilation, and test-related state
- **Operations**: Currently running operations with elapsed time
- **Recent**: Last 5 completed operations with pass/fail status
- **Diagnostics**: Error/warning/hint counts across `.ivy` files
- **Configuration**: Current include/exclude path settings

Use the **Dashboard** (command palette: `Ivy: Open Dashboard`) for a richer webview with statistics grid and operation history table.

### Requirements Panel

The **Requirements** tree view (below the Monitor in the Activity Bar sidebar) shows:

- Action requirement annotations from Ivy formal models
- Property invariants and their verification status
- RFC bracket tag coverage details
- Gutter indicators colored by requirement density (green = high, yellow = low; configurable via `ivy.requirements.coverageThreshold`)

Related commands: `Ivy: Refresh Requirements`, `Ivy: Show Action Requirements`, `Ivy: Show Property Details`, `Ivy: Show RFC Details`.

### Model Visualization

Open a Cytoscape-based graph view via `Ivy: Open Model Visualization` (also accessible from the Requirements panel title bar). The webview provides:

- **Dependency graph** — module/file dependency relationships
- **State machine** — protocol state machine extracted from Ivy models
- **Summary table** — tabular overview of model structure
- **Module layers** — hierarchical module grouping by file

### Code Lenses

When enabled (`ivy.codeLens.enabled`), the LSP server provides inline code lenses above action and monitor blocks showing:

- Requirement counts per action
- State variable reads
- Property dependencies
- RFC coverage summaries (toggle with `ivy.codeLens.rfcCoverage`)

### Test Scope

Test scope management (`ivy.testScope.enabled`) tracks which Ivy test file is "active":

- A **status bar indicator** shows the currently active test
- **Auto-detection** (`ivy.testScope.autoDetect`): opening a test file sets it as the active scope
- The scope is **sticky** — switching to non-test files preserves the active test
- Use `Ivy: Set Active Test` (`Cmd+Shift+F8`) to set the scope manually

### Activity Log

A structured log channel (`Ivy: Show Activity Log`) streams categorized server events:

- **MIL** — milestones (server start, indexing complete, etc.)
- **DIA** — diagnostics (error counts, parse failures)
- **PER** — performance (timing, memory usage)
- **ACT** — activity (individual file operations)

Control which categories appear with `ivy.activity.categories` and the detail level with `ivy.activity.granularity` (`"phase"` or `"file"`).

### Language Configuration

- Line comments with `#`
- Auto-closing brackets and native quotes (`<<<`/`>>>`)
- Smart indentation after `= {`
- Word selection includes qualified names (`frame.ack.range`)
- Code folding on `{`/`}`

## Prerequisites

### Syntax Highlighting Only

No prerequisites. The TextMate grammar works standalone.

### Full LSP Support

Requires Python 3.10+ and the `ivy_lsp` package:

```bash
pip install "ivy-lsp @ git+https://github.com/ElNiak/ivy-lsp.git"
```

## Configuration

### General

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `ivy.pythonPath` | string | `""` | Python interpreter path. Empty = auto-detect. |

### LSP Server

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `ivy.lsp.enabled` | boolean | `true` | Enable/disable the LSP server. |
| `ivy.lsp.args` | string[] | `[]` | Extra arguments for the LSP server. |
| `ivy.lsp.trace.server` | string | `"off"` | Trace level: `off`, `messages`, `verbose`. |
| `ivy.lsp.managedInstall` | boolean | `true` | Auto-install ivy-lsp into a managed virtualenv. |
| `ivy.lsp.managedInstallPath` | string | `""` | Custom path for managed install (default: `~/.ivy-lsp/`). |
| `ivy.lsp.logLevel` | string | `"INFO"` | Server log level: `DEBUG`, `INFO`, `WARNING`, `ERROR`. |
| `ivy.lsp.maxRestartCount` | integer | `5` | Max server restarts in window. `-1` = unlimited. |
| `ivy.lsp.restartWindow` | integer | `180` | Restart count window in seconds. |
| `ivy.lsp.includePaths` | string[] | `[]` | Directories to include for workspace indexing. Empty = scan all. |
| `ivy.lsp.excludePaths` | string[] | `["submodules", "test"]` | Directories to exclude from workspace indexing. |
| `ivy.lsp.stopTimeout` | number | `30` | Timeout (seconds) for stopping the server. Increase for large workspaces. |

### Analysis & Compilation

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `ivy.lsp.parseWorkers` | integer | `0` | Parallel workers for deep indexing. `0` = auto (half CPU cores). |
| `ivy.lsp.bulkAnalysis` | boolean | `true` | Run background T1+T2 semantic analysis after indexing. |
| `ivy.lsp.bulkAnalysisT2` | boolean | `true` | Include Tier 2 (AST enrichment) in bulk analysis. |
| `ivy.lsp.bulkCompile` | boolean | `true` | Run background T3 compilation for test entry points. Memory-intensive. |
| `ivy.lsp.compileWorkers` | integer | `0` | Max concurrent Ivy compilations. `0` = auto (CPU cores / 4). |
| `ivy.lsp.compileTimeout` | number | `300` | Timeout (seconds) for each background compilation. |
| `ivy.lsp.compileCacheTTL` | number | `600` | TTL (seconds) for cached compilation results. `0` = no cache. |
| `ivy.lsp.panelRequestTimeout` | number | `30` | Timeout (seconds) for model panel requests. |

### Tools

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `ivy.tools.verifyTimeout` | number | `120` | Verify command timeout in seconds. |
| `ivy.tools.compileTimeout` | number | `300` | User-initiated compile timeout in seconds. |
| `ivy.tools.showModelTimeout` | number | `30` | Show Model command timeout in seconds. |
| `ivy.tools.autoSaveBeforeAction` | boolean | `true` | Auto-save file before verify/compile. |

### Code Lenses

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `ivy.codeLens.enabled` | boolean | `true` | Show inline code lenses for requirement counts and property dependencies. |
| `ivy.codeLens.rfcCoverage` | boolean | `true` | Show RFC coverage summary code lenses on annotated files. |

### Test Scope

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `ivy.testScope.enabled` | boolean | `true` | Enable test scope management (status bar indicator, auto-detection). |
| `ivy.testScope.autoDetect` | boolean | `true` | Auto-set active test when opening a test file. Sticky on non-test files. |

### Requirements

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `ivy.requirements.coverageThreshold` | integer | `2` | Min requirements per action for green (high) gutter indicator. |

### Activity Log

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `ivy.activity.enabled` | boolean | `true` | Enable the structured activity log channel. |
| `ivy.activity.categories` | string[] | `["MIL","DIA","PER"]` | Log categories: `MIL` (milestones), `DIA` (diagnostics), `PER` (performance), `ACT` (activity). |
| `ivy.activity.granularity` | string | `"phase"` | `"phase"` = major events only, `"file"` = per-file details. |

### Python Auto-Detection

The extension searches for Python in this order:
1. `ivy.pythonPath` setting (if non-empty)
2. Workspace `.venv/bin/python` (or `.venv/Scripts/python.exe` on Windows)
3. Parent directories `.venv` (up to 5 levels — handles submodule/monorepo layouts)
4. Managed venv `~/.ivy-lsp/venv/bin/python`
5. System `python3`
6. System `python`

### Workspace Indexing

The LSP server indexes `.ivy` files using a two-layer directory filtering system:

**Hardcoded exclusions** (always skipped): `build`, `dist`, `.git`, `.hg`, `.svn`, `node_modules`, `__pycache__`, `.tox`, `.mypy_cache`, `.pytest_cache`, `.venv`, `venv`, and directories matching `pytest-*`.

**User-configurable `excludePaths`** — additional directories to skip (default: `submodules`, `test`). Paths are relative to the workspace root and support prefix matching (`foo` excludes `foo/bar/baz`).

**User-configurable `includePaths`** — whitelist mode: when non-empty, only those subdirectories are scanned. Empty means scan everything (minus exclusions).

**Why two layers?** The hardcoded layer prevents scanning VCS metadata, caches, and build artifacts that never contain `.ivy` files. The user layer allows project-specific scoping without modifying code.

Changing `includePaths` or `excludePaths` triggers an automatic LSP restart and full re-index.

Example `.vscode/settings.json`:

```json
{
  "ivy.lsp.includePaths": ["protocol-testing/quic"],
  "ivy.lsp.excludePaths": ["submodules", "test", "apt"]
}
```

## Troubleshooting

### "No Python interpreter found"

Set `ivy.pythonPath` in your VS Code settings to point to a Python 3.10+ interpreter.

### "ivy_lsp package is not installed"

Install the LSP server:
```bash
pip install "ivy-lsp @ git+https://github.com/ElNiak/ivy-lsp.git"
```

### LSP server crashes

Check the "Ivy Language Server" output channel (View > Output > select "Ivy Language Server").
The extension auto-restarts the server up to `ivy.lsp.maxRestartCount` times (default: 5) within `ivy.lsp.restartWindow` seconds (default: 180).

### Syntax highlighting works but no LSP features

The extension degrades gracefully. You still get syntax highlighting, snippets, and language configuration without the LSP server.

## Development

### Setup

```bash
git clone https://github.com/ElNiak/vscode-ivy.git
cd vscode-ivy
npm install
npm run compile
```

### Running in Dev Mode

There are three ways to test the extension during development:

#### Option 1: F5 in VS Code (Recommended)

Open the `vscode-ivy/` folder in VS Code and press **F5**. This launches the Extension Development Host with the extension loaded. The `.vscode/launch.json` provides four configurations:

- **Launch Extension** — opens an empty window with the extension
- **Launch with panther_ivy** — prompts for the `panther_ivy` directory path
- **Launch Extension (custom workspace)** — prompts for any folder containing `.ivy` files
- **Extension Tests** — runs the integration test suite inside VS Code

#### Option 2: CLI Launch

Use the `code` CLI directly:

```bash
# Compile and launch Extension Development Host
npm run compile
code --extensionDevelopmentPath="$(pwd)" --disable-extensions

# Open a specific workspace with the extension loaded
code --extensionDevelopmentPath="$(pwd)" --disable-extensions /path/to/ivy/workspace
```

#### Option 3: Convenience Script (Recommended for PANTHER devs)

A helper script wraps all common dev operations:

```bash
./scripts/dev-launch.sh                    # Compile + launch Extension Dev Host
./scripts/dev-launch.sh /path/to/workspace # Launch with a specific folder
./scripts/dev-launch.sh --package          # Build .vsix and install into VS Code
./scripts/dev-launch.sh --test             # Run all tests (unit + integration)
./scripts/dev-launch.sh --install          # Install ivy-lsp with z3 (full)
./scripts/dev-launch.sh --install-light    # Install ivy-lsp without z3
./scripts/dev-launch.sh --verify           # Check ivy-lsp + z3 installation
./scripts/dev-launch.sh --setup            # Full dev setup (npm + pip + compile)
./scripts/dev-launch.sh --help             # Show usage
```

**Testing with the PANTHER Ivy models:**

The most common scenario is launching the extension against the `panther_ivy` directory, which contains the QUIC/BGP/CoAP formal models:

```bash
# From the vscode-ivy directory, point to your local panther_ivy checkout:
./scripts/dev-launch.sh <PANTHER_ROOT>/panther/plugins/services/testers/panther_ivy
```

This compiles the extension, then opens a VS Code Extension Development Host window with `panther_ivy/` as the workspace. The LSP server will index `.ivy` files under `protocol-testing/` (QUIC, BGP, CoAP, etc.). You can then:

1. Open any `.ivy` file (e.g. `protocol-testing/quic/quic_stack/quic_connection.ivy`)
2. Check the **Ivy LSP** sidebar for server status and indexing progress
3. Run **Ivy: Verify** (`Cmd+Shift+F5`) to test the monitoring panel
4. Open the **Ivy: Open Dashboard** from the command palette

> **Tip:** Configure `ivy.lsp.includePaths` in the workspace settings to limit indexing to a specific protocol (e.g. `["protocol-testing/quic"]`) for faster startup.

#### Option 4: Package as .vsix

Build a `.vsix` file and install it into your regular VS Code instance. This is useful for testing the extension as end users would see it:

```bash
npx vsce package --no-dependencies -o ivy-language-dev.vsix
code --install-extension ivy-language-dev.vsix --force
# Restart VS Code to activate
```

### Running Tests

```bash
# Unit tests (fast, no VS Code dependency)
npm run test:unit

# Integration tests (launches VS Code via @vscode/test-electron)
npm test

# All tests via the convenience script
./scripts/dev-launch.sh --test
```

### Manual Testing Checklist

After launching in dev mode, verify:

1. Ivy LSP icon appears in the Activity Bar sidebar
2. Tree view shows: Server, Indexing, Analysis Pipeline, Features, Deep Index, Test Features, Operations, Recent, Diagnostics, Configuration
3. Server section displays mode, version, uptime, and available tools
4. Opening a `.ivy` file triggers indexing (status changes to "Complete")
5. `Ivy: Verify` (Cmd/Ctrl+Shift+F5) appears in Operations, then moves to Recent
6. `Ivy: Open Dashboard` opens a webview tab with statistics
7. `Ivy: Re-index Workspace` refreshes the tree view
8. `Ivy: Clear Cache` triggers a re-index
9. Killing the server process shows "Not connected" in the tree view
10. Restarting recovers automatically

## Contributing

See [CONTRIBUTING.md](https://github.com/ElNiak/vscode-ivy/blob/main/CONTRIBUTING.md).

## License

MIT
