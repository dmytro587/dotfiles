import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { Readable } from "node:stream";
import { fetchPublicImage, ImageFetchError, isPublicIp } from "../lib/safe-image.mjs";
import { temporaryDirectory } from "./helpers.mjs";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

function response({ statusCode = 200, headers = { "content-type": "image/png" }, body = png } = {}) {
  return { statusCode, headers, body: Readable.from([body]) };
}

test("identifies private, loopback, and public addresses", () => {
  assert.equal(isPublicIp("127.0.0.1"), false);
  assert.equal(isPublicIp("10.1.2.3"), false);
  assert.equal(isPublicIp("192.168.1.5"), false);
  assert.equal(isPublicIp("::1"), false);
  assert.equal(isPublicIp("fc00::1"), false);
  assert.equal(isPublicIp("93.184.216.34"), true);
});

test("rejects non-public hosts before requesting their content", async () => {
  await assert.rejects(
    fetchPublicImage("http://127.0.0.1/private.png"),
    ImageFetchError,
  );
  await assert.rejects(
    fetchPublicImage("http://[::1]/private.png"),
    ImageFetchError,
  );
});

test("rejects redirects to private hosts, oversized bodies, SVG, and fake image types", async () => {
  await assert.rejects(
    fetchPublicImage("https://public.example/start", {
      lookup: publicLookup,
      request: async () => response({ statusCode: 302, headers: { location: "http://127.0.0.1/private.png" } }),
    }),
    ImageFetchError,
  );
  await assert.rejects(
    fetchPublicImage("https://public.example/large", {
      lookup: publicLookup,
      maxBytes: 3,
      request: async () => response({ headers: { "content-type": "image/png", "content-length": "9" } }),
    }),
    ImageFetchError,
  );
  await assert.rejects(
    fetchPublicImage("https://public.example/svg", {
      lookup: publicLookup,
      request: async () => response({ headers: { "content-type": "image/svg+xml" }, body: "<svg/>" }),
    }),
    ImageFetchError,
  );
  await assert.rejects(
    fetchPublicImage("https://public.example/fake", {
      lookup: publicLookup,
      request: async () => response({ headers: { "content-type": "image/png" }, body: jpeg }),
    }),
    ImageFetchError,
  );
});

test("caches a supported exact image from a public host", async () => {
  const cacheDir = await temporaryDirectory();
  const image = await fetchPublicImage("https://public.example/image.png", {
    cacheDir,
    lookup: publicLookup,
    request: async () => response(),
  });
  assert.equal(image.mimeType, "image/png");
  assert.match(image.contentHash, /^[a-f0-9]{64}$/);
  await access(image.cachePath);
});
