const esbuild = require("esbuild");

const production = process.argv.includes("--production");

esbuild.build({
  entryPoints: ["src/webview/modelWebview.ts"],
  bundle: true,
  outfile: "out/webview/model.js",
  format: "iife",
  platform: "browser",
  target: "ES2022",
  sourcemap: !production,
  minify: production,
  // No externals — cytoscape is bundled into the output.
}).catch(() => process.exit(1));
