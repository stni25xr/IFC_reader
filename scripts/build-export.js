import { build } from "esbuild";
import path from "path";

const threeExampleExtensionFix = {
  name: "three-examples-extension-fix",
  setup(buildApi) {
    buildApi.onResolve({ filter: /^three\/examples\/jsm\/.*$/ }, (args) => {
      if (args.path.endsWith(".js")) return null;
      return { path: `${args.path}.js`, external: false };
    });
  }
};

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
  plugins: [threeExampleExtensionFix],
  logLevel: "info"
});
