// Bundles the DVE view for static hosting: one main ESM file plus three
// self-contained module workers. Run `npm install && npm run build` here, then
// commit dist/ — the frontend itself stays build-step-free.
import { build } from "esbuild";

const shared = {
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  sourcemap: false,
  logLevel: "warning",
};

await build({ ...shared, entryPoints: ["src/main.js"], outfile: "dist/dve-view.js" });
await build({ ...shared, entryPoints: ["src/world.worker.js"], outfile: "dist/world.worker.js" });
await build({ ...shared, entryPoints: ["src/generator.worker.js"], outfile: "dist/generator.worker.js" });
await build({ ...shared, entryPoints: ["src/mesher.worker.js"], outfile: "dist/mesher.worker.js" });

console.log("dve view bundled → dist/");
