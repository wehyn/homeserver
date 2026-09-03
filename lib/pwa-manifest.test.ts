import assert from "node:assert/strict";
import test from "node:test";
import manifest from "../app/manifest.ts";

const manifestData = manifest();

test("declares the supported language and responsive orientation", () => {
  assert.equal(manifestData.lang, "en");
  assert.equal(manifestData.orientation, "any");
});

test("keeps the existing standalone install contract", () => {
  assert.equal(manifestData.name, "Nimbus");
  assert.equal(manifestData.short_name, "Nimbus");
  assert.equal(manifestData.id, "/");
  assert.equal(manifestData.start_url, "/");
  assert.equal(manifestData.scope, "/");
  assert.equal(manifestData.display, "standalone");
  assert.deepEqual(manifestData.icons?.filter((icon) => icon.purpose === "any"), [
    {
      src: "/icon-192x192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icon-512x512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
  ]);
});

test("provides a dedicated 512px maskable icon", () => {
  assert.deepEqual(manifestData.icons?.find((icon) => icon.purpose === "maskable"), {
    src: "/icon-maskable-512x512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "maskable",
  });
});
