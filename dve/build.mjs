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

// main.js imports the manifest, so seed a placeholder before the first pass if
// none is committed; the real hashes are written afterwards (rebuild once more
// to inline them into the view bundle).
import { existsSync } from "node:fs";
if (!existsSync("dist/rev.js"))
  writeFileSync("dist/rev.js", 'export const DVE_REV = {"dve-view.js":"0","world.worker.js":"0","generator.worker.js":"0","mesher.worker.js":"0"};\n');

await build({ ...shared, entryPoints: ["src/main.js"], outfile: "dist/dve-view.js" });
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

console.log("dve view bundled → dist/", rev);
