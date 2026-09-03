const rasterContentTypes = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/x-icon",
]);

const contentTypeAliases: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "image/vnd.microsoft.icon": "image/x-icon",
};

type RasterKind = "gif" | "jpeg" | "png" | "webp" | "ico";

export function getValidatedIconContentType(body: Uint8Array, contentType: string) {
  const declaredType = normalizeContentType(contentType);
  const detectedKind = detectRasterKind(body);
  if (!detectedKind) return null;

  const detectedType = rasterTypeForKind(detectedKind);
  if (declaredType === "invalid" || (declaredType && declaredType !== detectedType)) return null;
  return detectedType;
}

export const validateRasterIcon = getValidatedIconContentType;

function normalizeContentType(contentType: string) {
  const normalized = contentType.split(";", 1)[0].trim().toLowerCase();
  if (!normalized || normalized === "application/octet-stream") return "";
  const canonical = contentTypeAliases[normalized] || normalized;
  return rasterContentTypes.has(canonical) ? canonical : "invalid";
}

function detectRasterKind(body: Uint8Array): RasterKind | null {
  if (hasPrefix(body, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (hasPrefix(body, [0xff, 0xd8, 0xff])) return "jpeg";
  if (hasAsciiPrefix(body, "GIF87a") || hasAsciiPrefix(body, "GIF89a")) return "gif";
  if (hasAsciiPrefix(body, "RIFF") && hasAsciiPrefix(body.subarray(8), "WEBP")) return "webp";
  if (body.length >= 6 && body[0] === 0x00 && body[1] === 0x00 && body[2] === 0x01 && body[3] === 0x00) return "ico";
  return null;
}

function rasterTypeForKind(kind: RasterKind) {
  switch (kind) {
    case "gif": return "image/gif";
    case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    case "webp": return "image/webp";
    case "ico": return "image/x-icon";
  }
}

function hasPrefix(body: Uint8Array, prefix: number[]) {
  return body.length >= prefix.length && prefix.every((byte, index) => body[index] === byte);
}

function hasAsciiPrefix(body: Uint8Array, prefix: string) {
  return hasPrefix(body, Array.from(prefix, (character) => character.charCodeAt(0)));
}
