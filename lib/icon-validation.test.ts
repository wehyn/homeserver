import assert from "node:assert/strict";
import test from "node:test";
import { getValidatedIconContentType } from "./icon-validation.ts";

const png = Buffer.from("89504e470d0a1a0a", "hex");
const jpeg = Buffer.from("ffd8ffd9", "hex");
const gif = Buffer.from("GIF89a", "ascii");
const webp = Buffer.from("524946462400000057454250", "hex");
const ico = Buffer.from("00000100010000000000", "hex");
const svg = Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>");

test("accepts supported raster signatures with matching content types", () => {
  assert.equal(getValidatedIconContentType(png, "image/png"), "image/png");
  assert.equal(getValidatedIconContentType(jpeg, "image/jpeg; charset=binary"), "image/jpeg");
  assert.equal(getValidatedIconContentType(gif, "image/gif"), "image/gif");
  assert.equal(getValidatedIconContentType(webp, "image/webp"), "image/webp");
  assert.equal(getValidatedIconContentType(ico, "image/x-icon"), "image/x-icon");
});

test("rejects SVG markup even when it is declared as an image", () => {
  assert.equal(getValidatedIconContentType(svg, "image/svg+xml"), null);
  assert.equal(getValidatedIconContentType(svg, "application/octet-stream"), null);
});

test("rejects content type and magic byte mismatches", () => {
  assert.equal(getValidatedIconContentType(jpeg, "image/png"), null);
  assert.equal(getValidatedIconContentType(png, "image/svg+xml"), null);
  assert.equal(getValidatedIconContentType(Buffer.from("not an image"), "image/png"), null);
});

test("infers a supported raster type only from a recognized signature", () => {
  assert.equal(getValidatedIconContentType(png, ""), "image/png");
  assert.equal(getValidatedIconContentType(ico, "application/octet-stream"), "image/x-icon");
  assert.equal(getValidatedIconContentType(svg, ""), null);
});
