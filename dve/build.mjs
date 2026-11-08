// Bundles the DVE view for static hosting: one main ESM file plus three
// self-contained module workers. Run `npm install && npm run build` here, then
// commit dist/ — the frontend itself stays build-step-free.
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const shared = {
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  sourcemap: false,
  logLevel: "warning",
};

// The view inlines the manifest (main.js builds worker URLs from it), so the
// workers have to be bundled and hashed BEFORE the view: bundling the view
// first makes it carry the previous build's worker hashes, and one `npm run
// build` after a worker change would ship a view that loads stale workers.
import { existsSync } from "node:fs";
if (!existsSync("dist/rev.js"))
  writeFileSync("dist/rev.js", 'export const DVE_REV = {"dve-view.js":"0","world.worker.js":"0","generator.worker.js":"0","mesher.worker.js":"0"};\n');

await build({ ...shared, entryPoints: ["src/world.worker.js"], outfile: "dist/world.worker.js" });
await build({ ...shared, entryPoints: ["src/generator.worker.js"], outfile: "dist/generator.worker.js" });
await build({ ...shared, entryPoints: ["src/mesher.worker.js"], outfile: "dist/mesher.worker.js" });

// Content-hash manifest so app.js and the view import/bundle workers with a
// `?h=<hash>` URL: GitHub Pages serves stale cached bundles forever otherwise
// (a browser that kept an old dve-view.js calls methods it never exported).
const hash = f => createHash("sha256").update(readFileSync(`dist/${f}`)).digest("hex").slice(0, 10);
const rev = {
  "dve-view.js": hash("dve-view.js"),
  "world.worker.js": hash("world.worker.js"),
  "generator.worker.js": hash("generator.worker.js"),
  "mesher.worker.js": hash("mesher.worker.js"),
};
writeFileSync("dist/rev.js", `export const DVE_REV = ${JSON.stringify(rev)};\n`);

// Bundle the view last so it inlines the worker hashes written above; its own
// inlined entry is never read (only app.js picks the view's URL), so updating
// that entry afterwards keeps the manifest exact for the loader.
await build({ ...shared, entryPoints: ["src/main.js"], outfile: "dist/dve-view.js" });
rev["dve-view.js"] = hash("dve-view.js");
writeFileSync("dist/rev.js", `export const DVE_REV = ${JSON.stringify(rev)};\n`);

console.log("dve view bundled → dist/", rev);
