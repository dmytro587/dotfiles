import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const publicDirectory = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

function embeddedJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function escapedTitle(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\u2028/g, "&#8232;")
    .replace(/\u2029/g, "&#8233;");
}

async function imageDataByUrl(assets) {
  const images = {};
  for (const [url, asset] of assets) {
    if (!asset.cachePath) {
      continue;
    }
    const bytes = await readFile(asset.cachePath);
    images[url] = `data:${asset.mimeType};base64,${bytes.toString("base64")}`;
  }
  return images;
}

export async function generateReport({ result, assets }) {
  const [styles, renderer, images] = await Promise.all([
    readFile(join(publicDirectory, "catalog.css"), "utf8"),
    readFile(join(publicDirectory, "catalog.js"), "utf8"),
    imageDataByUrl(assets),
  ]);
  const escapedResult = embeddedJson(result);
  const escapedImages = embeddedJson(images);
  const escapedRenderer = renderer.replace(/<\/script/gi, "<\\/script");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escapedTitle(result.title)}</title>
  <style>${styles}</style>
</head>
<body>
  <main class="shell">
    <section id="catalog-root"></section>
  </main>
  <script id="research-result" type="application/json">${escapedResult}</script>
  <script>${escapedRenderer}</script>
  <script>
    (() => {
      const result = JSON.parse(document.querySelector("#research-result").textContent);
      const images = ${escapedImages};
      globalThis.GoodsResearchCatalog.renderCatalog(
        document.querySelector("#catalog-root"),
        result,
        (candidate) => candidate.imageUrl ? images[candidate.imageUrl] ?? null : null,
      );
    })();
  </script>
</body>
</html>`;
}
