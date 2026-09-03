import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const repositoryRoot = resolve(process.argv[2] || new URL("..", import.meta.url).pathname);
const templatePath = join(repositoryRoot, "public", "sw.template.js");
const outputPath = join(repositoryRoot, "public", "sw.js");
const revisionInputs = [
  ["template", templatePath],
  ["manifest", join(repositoryRoot, "app", "manifest.ts")],
  ["layout", join(repositoryRoot, "app", "layout.tsx")],
  ["offline", join(repositoryRoot, "public", "offline.html")],
  ["icon-192", join(repositoryRoot, "public", "icon-192x192.png")],
  ["icon-512", join(repositoryRoot, "public", "icon-512x512.png")],
  ["icon-maskable", join(repositoryRoot, "public", "icon-maskable-512x512.png")],
];

const hash = createHash("sha256");
for (const [name, path] of revisionInputs) {
  hash.update(name);
  hash.update("\0");
  hash.update(await readFile(path));
  hash.update("\0");
}

const revision = hash.digest("hex");
const template = await readFile(templatePath, "utf8");
if (!template.includes("__NIMBUS_CACHE_REVISION__")) {
  throw new Error(`Service-worker template is missing the revision placeholder: ${templatePath}`);
}

const generated = template.replaceAll("__NIMBUS_CACHE_REVISION__", revision);
await writeFile(outputPath, generated);
process.stdout.write(`Generated ${outputPath} with revision ${revision}\n`);
