import test from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateReport } from "../lib/report.mjs";
import { completeResult, temporaryDirectory } from "./helpers.mjs";

test("embeds validated data and cached images without runtime image requests or print controls", async () => {
  const directory = await temporaryDirectory();
  const imagePath = join(directory, "image.png");
  const imageUrl = "https://shop.example.test/image.png";
  await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

  const result = completeResult({ title: "Safe </script> catalog " });
  result.candidates[0].imageUrl = imageUrl;
  result.candidates[0].imageAlt = "Exact charger photo";
  const report = await generateReport({
    result,
    assets: new Map([[imageUrl, { cachePath: imagePath, mimeType: "image/png" }]]),
  });

  assert.match(report, /data:image\/png;base64,/);
  assert.match(report, /catalog-search/);
  assert.match(report, /https:\/\/shop\.example\.test\/compact-65w/);
  assert.equal(report.includes("window.print"), false);
  assert.equal(report.includes(">Print<"), false);
  assert.equal(report.includes("</script> catalog"), false);
  assert.equal(report.includes("\u2028"), false);
  assert.equal(report.includes("\u2029"), false);
  assert.match(report, /\\u2028/);
  assert.match(report, /\\u2029/);
});
