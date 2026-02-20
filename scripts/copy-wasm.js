import fs from "fs";
import path from "path";

const root = process.cwd();
const srcPath = path.join(root, "node_modules", "web-ifc", "web-ifc.wasm");
const destDir = path.join(root, "public", "wasm");
const destPath = path.join(destDir, "web-ifc.wasm");

try {
  if (!fs.existsSync(srcPath)) {
    console.warn("web-ifc.wasm not found yet. Run npm install first.");
    process.exit(0);
  }
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(srcPath, destPath);
  console.log("Copied web-ifc.wasm to public/wasm/");
} catch (err) {
  console.warn("Failed to copy web-ifc.wasm:", err.message);
}
