import { createHash } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { createWriteStream } from "node:fs";
import { mkdir, access } from "node:fs/promises";
import { isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export class ImageFetchError extends Error {
  constructor(message) {
    super(message);
    this.name = "ImageFetchError";
  }
}

const MEDIA_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/avif", "avif"],
]);

function ipv4Parts(address) {
  return address.split(".").map((part) => Number.parseInt(part, 10));
}

function isPublicIpv4(address) {
  const [a, b] = ipv4Parts(address);
  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    return false;
  }

  if (a === 0 || a === 10 || a === 127 || a >= 224) {
    return false;
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return false;
  }
  if (a === 169 && b === 254) {
    return false;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return false;
  }
  if (a === 192 && (b === 0 || b === 2 || b === 168)) {
    return false;
  }
  if (a === 198 && (b === 18 || b === 19 || b === 51)) {
    return false;
  }
  if (a === 203 && b === 0) {
    return false;
  }
  return true;
}

function ipv6ToBigInt(address) {
  const normalized = address.toLowerCase().split("%")[0];
  const embeddedIpv4 = normalized.includes(".");
  const source = embeddedIpv4
    ? normalized.replace(/(?:\d{1,3}\.){3}\d{1,3}$/, (ipv4) => {
        const [a, b, c, d] = ipv4Parts(ipv4);
        return `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
      })
    : normalized;
  const [left, right = ""] = source.split("::");
  const leftParts = left ? left.split(":") : [];
  const rightParts = right ? right.split(":") : [];
  const missing = 8 - leftParts.length - rightParts.length;
  const parts = source.includes("::")
    ? [...leftParts, ...Array(missing).fill("0"), ...rightParts]
    : leftParts;

  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) {
    throw new ImageFetchError("The image host resolved to an invalid IPv6 address");
  }

  return parts.reduce((value, part) => (value << 16n) | BigInt(`0x${part}`), 0n);
}

function ipv6Prefix(value, prefix, prefixLength) {
  const shift = 128n - BigInt(prefixLength);
  return (value >> shift) === (prefix >> shift);
}

function isPublicIpv6(address) {
  const value = ipv6ToBigInt(address);
  const mappedIpv4Prefix = 0xffffn << 32n;
  const mappedMask = ((1n << 128n) - 1n) ^ ((1n << 32n) - 1n);
  if ((value & mappedMask) === mappedIpv4Prefix) {
    const ipv4 = Number(value & ((1n << 32n) - 1n));
    return isPublicIpv4(
      [24, 16, 8, 0].map((shift) => (ipv4 >> shift) & 0xff).join("."),
    );
  }

  const nonPublicPrefixes = [
    [0n, 128],
    [1n, 128],
    [0xfc00n << 112n, 7],
    [0xfe80n << 112n, 10],
    [0xff00n << 112n, 8],
    [0x20010db8n << 96n, 32],
  ];
  return !nonPublicPrefixes.some(([prefix, length]) => ipv6Prefix(value, prefix, length));
}

export function isPublicIp(address) {
  const family = isIP(address);
  if (family === 4) {
    return isPublicIpv4(address);
  }
  if (family === 6) {
    return isPublicIpv6(address);
  }
  return false;
}

async function resolvePublicAddresses(hostname, lookup) {
  const normalizedHostname = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  const directFamily = isIP(normalizedHostname);
  const addresses = directFamily
    ? [{ address: normalizedHostname, family: directFamily }]
    : await lookup(normalizedHostname, { all: true, verbatim: true });

  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new ImageFetchError("The image host did not resolve to an address");
  }
  if (addresses.some(({ address }) => !isPublicIp(address))) {
    throw new ImageFetchError("The image host resolves to a non-public address");
  }

  return addresses;
}

function responseHeader(headers, name) {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function normalizedMediaType(headers) {
  const contentType = responseHeader(headers, "content-type");
  return typeof contentType === "string" ? contentType.split(";", 1)[0].trim().toLowerCase() : null;
}

function mediaTypeFromBytes(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (
    bytes.length >= 16 &&
    bytes.subarray(4, 8).toString("ascii") === "ftyp" &&
    ["avif", "avis"].includes(bytes.subarray(8, 12).toString("ascii"))
  ) {
    return "image/avif";
  }
  return null;
}

async function readLimitedBody(body, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of body) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) {
      body.destroy?.();
      throw new ImageFetchError("The image exceeds the 8 MB limit");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function requestImage(url, addresses, signal) {
  const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const request = transport(
      {
        protocol: url.protocol,
        hostname: url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: {
          Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif",
          "User-Agent": "goods-research-local/1.0",
        },
        lookup(_hostname, _options, callback) {
          callback(null, addresses[0].address, addresses[0].family);
        },
      },
      (response) => resolve({
        statusCode: response.statusCode ?? 0,
        headers: response.headers,
        body: response,
      }),
    );
    request.once("error", reject);
    signal?.addEventListener("abort", () => request.destroy(signal.reason), { once: true });
    request.end();
  });
}

async function writeCachedImage(cacheDir, hash, extension, bytes) {
  await mkdir(cacheDir, { recursive: true });
  const cachePath = join(cacheDir, `${hash}.${extension}`);
  try {
    await access(cachePath);
  } catch {
    await pipeline(Readable.from([bytes]), createWriteStream(cachePath, { flags: "wx" }));
  }
  return cachePath;
}


export async function fetchPublicImage(rawUrl, {
  signal,
  maxBytes = 8_388_608,
  maxRedirects = 5,
  cacheDir,
  lookup = dnsLookup,
  request = requestImage,
} = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new ImageFetchError("The image byte limit must be a positive integer");
  }
  if (!Number.isSafeInteger(maxRedirects) || maxRedirects < 0) {
    throw new ImageFetchError("The redirect limit must be a non-negative integer");
  }

  let currentUrl;
  try {
    currentUrl = new URL(rawUrl);
  } catch {
    throw new ImageFetchError("The image URL is invalid");
  }
  if (
    (currentUrl.protocol !== "http:" && currentUrl.protocol !== "https:") ||
    currentUrl.username ||
    currentUrl.password
  ) {
    throw new ImageFetchError("The image URL must be a credential-free HTTP(S) URL");
  }

  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const addresses = await resolvePublicAddresses(currentUrl.hostname, lookup);
    const response = await request(currentUrl, addresses, signal);
    const location = responseHeader(response.headers, "location");

    if (response.statusCode >= 300 && response.statusCode < 400 && location) {
      response.body.resume?.();
      if (redirects === maxRedirects) {
        throw new ImageFetchError("The image exceeded the redirect limit");
      }
      try {
        currentUrl = new URL(location, currentUrl);
      } catch {
        throw new ImageFetchError("The image returned an invalid redirect URL");
      }
      if (currentUrl.protocol !== "http:" && currentUrl.protocol !== "https:") {
        throw new ImageFetchError("The image redirect must use HTTP(S)");
      }
      continue;
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      response.body.resume?.();
      throw new ImageFetchError(`The image host returned HTTP ${response.statusCode}`);
    }

    const declaredLength = Number(responseHeader(response.headers, "content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      response.body.resume?.();
      throw new ImageFetchError("The image exceeds the 8 MB limit");
    }

    const bytes = await readLimitedBody(response.body, maxBytes);
    const actualMediaType = mediaTypeFromBytes(bytes);
    const declaredMediaType = normalizedMediaType(response.headers);
    if (!actualMediaType || !MEDIA_TYPES.has(declaredMediaType) || declaredMediaType !== actualMediaType) {
      throw new ImageFetchError("The image content type does not match a supported image format");
    }

    const contentHash = createHash("sha256").update(bytes).digest("hex");
    const cachePath = cacheDir
      ? await writeCachedImage(cacheDir, contentHash, MEDIA_TYPES.get(actualMediaType), bytes)
      : null;
    return {
      bytes,
      mimeType: actualMediaType,
      contentHash,
      cachePath,
      originalUrl: rawUrl,
    };
  }

  throw new ImageFetchError("The image could not be fetched");
}
