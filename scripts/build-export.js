import { build } from "esbuild";
import path from "path";

const entry = path.join(process.cwd(), "src", "export-runtime.js");
const outfile = path.join(process.cwd(), "public", "export-bundle.js");

await build({
  entryPoints: [entry],
  bundle: true,
  minify: true,
  format: "iife",
  globalName: "IFC_EXPORT_APP",
  target: "es2020",
  outfile,
  logLevel: "info"
});
