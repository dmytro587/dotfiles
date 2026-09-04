import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await sourceFiles(path));
    } else if ([".js", ".mjs", ".ts"].includes(extname(entry.name))) {
      files.push(path);
    }
  }
  return files;
}

function check(path) {
  const args = extname(path) === ".ts"
    ? ["--experimental-strip-types", "--check", path]
    : ["--check", path];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Syntax check failed for ${path}`));
      }
    });
  });
}

for (const path of await sourceFiles(root)) {
  await check(path);
}
