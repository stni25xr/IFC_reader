import fs from "fs/promises";
import path from "path";
import AdmZip from "adm-zip";
import { execFile } from "child_process";

const run = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, opts, (err, stdout, stderr) => {
      if (err) {
        err.stderr = stderr;
        return reject(err);
      }
      resolve({ stdout, stderr });
    });
  });

const zipPath = process.argv[2];
if (!zipPath) {
  console.error("Usage: npm run publish:pages -- /path/to/ifc-offline-viewer.zip");
  process.exit(1);
}

const projectRoot = process.cwd();
const docsDir = path.join(projectRoot, "docs");

const clearDir = async (dir) => {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
};

const copyIfExists = async (src, dest) => {
  try {
    await fs.copyFile(src, dest);
  } catch {
    // ignore
  }
};

const main = async () => {
  await clearDir(docsDir);

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(docsDir, true);

  const viewerPath = path.join(docsDir, "viewer.html");
  const indexPath = path.join(docsDir, "index.html");
  await copyIfExists(viewerPath, indexPath);

  await fs.writeFile(path.join(docsDir, ".nojekyll"), "");

  await run("git", ["add", "docs"]);
  await run("git", ["commit", "-m", "Publish viewer export to GitHub Pages"]);
  await run("git", ["push"]);

  console.log("Published to GitHub Pages. Ensure Pages is set to /docs.");
};

main().catch((err) => {
  console.error(err.stderr || err.message || err);
  process.exit(1);
});
