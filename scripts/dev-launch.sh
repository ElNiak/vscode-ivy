#!/usr/bin/env bash
# Launch VS Code Extension Development Host with the Ivy extension loaded.
#
# Usage:
#   ./scripts/dev-launch.sh                    # Open empty window
#   ./scripts/dev-launch.sh /path/to/workspace # Open specific folder
#   ./scripts/dev-launch.sh --package          # Build .vsix and install it
#   ./scripts/dev-launch.sh --install          # Install ivy-lsp with z3 (full)
#   ./scripts/dev-launch.sh --install-light    # Install ivy-lsp without z3
#   ./scripts/dev-launch.sh --verify           # Check ivy-lsp + z3 installation
#   ./scripts/dev-launch.sh --setup            # Full dev setup (npm + pip + compile)

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
IVY_LSP_SRC="$(cd "$EXT_DIR/../ivy-lsp" 2>/dev/null && pwd || echo "")"

PYTHON_PATH=""

# ---------- Python venv discovery (mirrors pythonFinder.ts) ----------

find_venv_python() {
    # 1. Explicit override via IVY_PYTHON_PATH env var
    if [ -n "${IVY_PYTHON_PATH:-}" ]; then
        if "$IVY_PYTHON_PATH" --version &>/dev/null; then
            PYTHON_PATH="$IVY_PYTHON_PATH"
            echo "  Python (IVY_PYTHON_PATH): $PYTHON_PATH"
            return 0
        fi
        echo "  WARNING: IVY_PYTHON_PATH=$IVY_PYTHON_PATH is not a valid Python" >&2
    fi

    # 2. Workspace .venv (if workspace arg provided)
    local workspace="${1:-}"
    if [ -n "$workspace" ] && [ -x "$workspace/.venv/bin/python" ]; then
        if "$workspace/.venv/bin/python" --version &>/dev/null; then
            PYTHON_PATH="$workspace/.venv/bin/python"
            echo "  Python (workspace venv): $PYTHON_PATH"
            return 0
        fi
    fi

    # 3. Walk up from EXT_DIR checking .venv/bin/python (up to 5 parents)
    local dir="$EXT_DIR"
    for _ in $(seq 1 5); do
        local parent
        parent="$(dirname "$dir")"
        [ "$parent" = "$dir" ] && break
        dir="$parent"
        if [ -x "$dir/.venv/bin/python" ]; then
            if "$dir/.venv/bin/python" --version &>/dev/null; then
                PYTHON_PATH="$dir/.venv/bin/python"
                echo "  Python (parent venv): $PYTHON_PATH"
                return 0
            fi
        fi
    done

    # 4. Managed venv (~/.ivy-lsp/venv)
    local managed="$HOME/.ivy-lsp/venv/bin/python"
    if [ -x "$managed" ]; then
        if "$managed" --version &>/dev/null; then
            PYTHON_PATH="$managed"
            echo "  Python (managed venv): $PYTHON_PATH"
            return 0
        fi
    fi

    # 5. System python3 / python (with warning)
    for candidate in python3 python; do
        if command -v "$candidate" &>/dev/null && "$candidate" --version &>/dev/null; then
            PYTHON_PATH="$candidate"
            echo "  WARNING: Using system '$candidate' — no venv found." >&2
            echo "  Python (system): $PYTHON_PATH"
            return 0
        fi
    done

    echo "  ERROR: No usable Python interpreter found." >&2
    return 1
}

# ---------- Verification ----------

verify_ivy_lsp() {
    if [ -z "$PYTHON_PATH" ]; then
        echo "  ERROR: PYTHON_PATH not set — run find_venv_python first." >&2
        return 1
    fi

    echo "==> Verifying ivy-lsp installation..."

    # Check importable
    local installed_version
    installed_version="$("$PYTHON_PATH" -c "import ivy_lsp; print(ivy_lsp.__version__)" 2>/dev/null)" || true

    if [ -z "$installed_version" ]; then
        echo "  ERROR: ivy_lsp is NOT importable from $PYTHON_PATH" >&2
        echo "  Run: $0 --install" >&2
        return 1
    fi

    echo "  Installed ivy-lsp version: $installed_version"

    # Compare against source pyproject.toml if available
    if [ -n "$IVY_LSP_SRC" ] && [ -f "$IVY_LSP_SRC/pyproject.toml" ]; then
        local source_version
        source_version="$(grep -m1 '^version' "$IVY_LSP_SRC/pyproject.toml" | sed 's/.*"\(.*\)".*/\1/')"

        if [ -n "$source_version" ]; then
            if [ "$installed_version" = "$source_version" ]; then
                echo "  Version match: installed=$installed_version source=$source_version"
            else
                echo "  WARNING: Version MISMATCH — installed=$installed_version source=$source_version" >&2
                echo "  Run: $0 --install" >&2
                return 1
            fi
        fi
    else
        echo "  (source tree not found at $EXT_DIR/../ivy-lsp — skipping version comparison)"
    fi

    # Also check z3 status (non-fatal)
    verify_z3 || true

    return 0
}

verify_z3() {
    if [ -z "$PYTHON_PATH" ]; then
        echo "  ERROR: PYTHON_PATH not set." >&2
        return 1
    fi

    local z3_version
    z3_version="$("$PYTHON_PATH" -c "import z3; print(z3.get_version_string())" 2>/dev/null)" || true

    if [ -z "$z3_version" ]; then
        echo "  WARNING: z3 is NOT installed (formal verification features unavailable)" >&2
        echo "  Run: $0 --install" >&2
        return 1
    fi

    echo "  Z3 version: $z3_version"
    return 0
}

# ---------- Installation ----------

install_ivy_lsp() {
    if [ -z "$PYTHON_PATH" ]; then
        echo "  ERROR: PYTHON_PATH not set — run find_venv_python first." >&2
        return 1
    fi

    if [ -z "$IVY_LSP_SRC" ] || [ ! -f "$IVY_LSP_SRC/pyproject.toml" ]; then
        echo "  ERROR: ivy-lsp source not found at $EXT_DIR/../ivy-lsp" >&2
        return 1
    fi

    local extras="${1:-full}"  # "full" (default, includes z3) or "light" (no z3)
    local install_spec="$IVY_LSP_SRC"
    if [ "$extras" = "full" ]; then
        install_spec="$IVY_LSP_SRC[full]"
    fi

    echo "==> Installing ivy-lsp ($extras) from $IVY_LSP_SRC"
    echo "  Using: $PYTHON_PATH -m pip install -e $install_spec"
    "$PYTHON_PATH" -m pip install -e "$install_spec"
    echo "  Done."
}

# ---------- Existing helpers ----------

compile() {
    echo "==> Compiling TypeScript..."
    (cd "$EXT_DIR" && npm run compile)
}

launch_dev() {
    local workspace="${1:-}"

    # Pre-launch verification (non-fatal)
    echo "==> Checking Python environment..."
    if find_venv_python "$workspace" 2>/dev/null; then
        verify_ivy_lsp || echo "  (continuing anyway — fix with: $0 --install)"
    else
        echo "  (no Python found — LSP features may not work)"
    fi
    echo ""

    compile
    echo "==> Launching Extension Development Host..."
    if [ -n "$workspace" ]; then
        code --extensionDevelopmentPath="$EXT_DIR" --disable-extensions "$workspace"
    else
        code --extensionDevelopmentPath="$EXT_DIR" --disable-extensions
    fi
}

package_and_install() {
    compile
    echo "==> Packaging .vsix..."
    (cd "$EXT_DIR" && npx vsce package --no-dependencies -o ivy-language-dev.vsix)
    echo "==> Installing .vsix..."
    code --install-extension "$EXT_DIR/ivy-language-dev.vsix" --force
    echo "==> Done. Restart VS Code to activate."
}

run_tests() {
    compile
    echo "==> Running unit tests (mocha)..."
    (cd "$EXT_DIR" && npx mocha out/test/unit/**/*.test.js)
    echo ""
    echo "==> Running integration tests (@vscode/test-electron)..."
    (cd "$EXT_DIR" && npm test)
}

# ---------- main ----------
case "${1:-}" in
    --package|-p)
        package_and_install
        ;;
    --test|-t)
        run_tests
        ;;
    --install|-i)
        echo "==> Finding Python..."
        find_venv_python "${2:-}"
        install_ivy_lsp full
        verify_ivy_lsp
        ;;
    --install-light)
        echo "==> Finding Python..."
        find_venv_python "${2:-}"
        install_ivy_lsp light
        verify_ivy_lsp
        ;;
    --verify|-v)
        echo "==> Finding Python..."
        find_venv_python "${2:-}"
        verify_ivy_lsp
        ;;
    --setup|-s)
        echo "==> Full dev setup..."
        find_venv_python "${2:-}"
        echo "==> Installing npm dependencies..."
        (cd "$EXT_DIR" && npm install)
        install_ivy_lsp full
        compile
        verify_ivy_lsp
        echo "==> Setup complete."
        ;;
    --help|-h)
        cat <<'USAGE'
Ivy extension development launcher.

Usage:
  ./scripts/dev-launch.sh                Open Extension Development Host (empty window)
  ./scripts/dev-launch.sh <folder>       Open with a specific workspace folder
  ./scripts/dev-launch.sh --package      Build .vsix and install into VS Code
  ./scripts/dev-launch.sh --test         Run all tests (unit + integration)
  ./scripts/dev-launch.sh --install      Install ivy-lsp with z3 (full) into discovered venv
  ./scripts/dev-launch.sh --install-light Install ivy-lsp without z3 into discovered venv
  ./scripts/dev-launch.sh --verify       Check ivy-lsp installation, version, and z3 status
  ./scripts/dev-launch.sh --setup        Full setup: npm install + pip install (full) + compile
  ./scripts/dev-launch.sh --help         Show this help

Python discovery (mirrors pythonFinder.ts):
  1. $IVY_PYTHON_PATH env var (explicit override)
  2. Workspace .venv/bin/python (if folder argument provided)
  3. Walk up from extension dir checking .venv/bin/python (up to 5 parents)
  4. ~/.ivy-lsp/venv/bin/python (managed venv)
  5. python3 / python on PATH (fallback, with warning)

Key: never uses "source activate" — always references venv python directly.
USAGE
        ;;
    *)
        launch_dev "${1:-}"
        ;;
esac
