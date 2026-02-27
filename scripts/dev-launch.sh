#!/usr/bin/env bash
# Launch VS Code Extension Development Host with the Ivy extension loaded.
#
# Usage:
#   ./scripts/dev-launch.sh                    # Open empty window
#   ./scripts/dev-launch.sh /path/to/workspace # Open specific folder
#   ./scripts/dev-launch.sh --package          # Build .vsix and install it

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ---------- helpers ----------
compile() {
    echo "==> Compiling TypeScript..."
    (cd "$EXT_DIR" && npm run compile)
}

launch_dev() {
    local workspace="${1:-}"
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
    --help|-h)
        cat <<'USAGE'
Ivy extension development launcher.

Usage:
  ./scripts/dev-launch.sh                Open Extension Development Host (empty window)
  ./scripts/dev-launch.sh <folder>       Open with a specific workspace folder
  ./scripts/dev-launch.sh --package      Build .vsix and install into VS Code
  ./scripts/dev-launch.sh --test         Run all tests (unit + integration)
  ./scripts/dev-launch.sh --help         Show this help
USAGE
        ;;
    *)
        launch_dev "${1:-}"
        ;;
esac
