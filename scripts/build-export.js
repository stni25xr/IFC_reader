import { build } from "esbuild";
import path from "path";

import { createRequire } from "module";
import fs from "fs/promises";

const require = createRequire(import.meta.url);

const threeExampleExtensionFix = {
  name: "three-examples-extension-fix",
  setup(buildApi) {
    buildApi.onResolve({ filter: /^three\/examples\/jsm\/.*$/ }, (args) => {
      if (args.path.endsWith(".js")) return null;
      return { path: `${args.path}.js`, namespace: "three-examples" };
    });
    buildApi.onLoad({ filter: /.*/, namespace: "three-examples" }, async (args) => {
      const resolved = require.resolve(args.path);
      return { contents: await fs.readFile(resolved, "utf8"), loader: "js" };
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
