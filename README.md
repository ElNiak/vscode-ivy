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
3. Or: `code --install-extension ivy-language-0.1.0.vsix`

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

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `ivy.pythonPath` | string | `""` | Python interpreter path. Empty = auto-detect. |
| `ivy.lsp.enabled` | boolean | `true` | Enable/disable the LSP server. |
| `ivy.lsp.args` | string[] | `[]` | Extra arguments for the LSP server. |
| `ivy.lsp.trace.server` | string | `"off"` | Trace level: `off`, `messages`, `verbose`. |

### Python Auto-Detection

The extension searches for Python in this order:
1. `ivy.pythonPath` setting
2. Workspace `.venv/bin/python`
3. System `python3`
4. System `python`

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
The extension auto-restarts the server up to 3 times within 5 minutes.

### Syntax highlighting works but no LSP features

The extension degrades gracefully. You still get syntax highlighting, snippets, and language configuration without the LSP server.

## Contributing

See [CONTRIBUTING.md](https://github.com/ElNiak/vscode-ivy/blob/main/CONTRIBUTING.md) or clone the repo and press F5 to launch the Extension Development Host.

```bash
git clone https://github.com/ElNiak/vscode-ivy.git
cd vscode-ivy
npm install
npm run compile
# Press F5 in VS Code to launch
```

## License

MIT
