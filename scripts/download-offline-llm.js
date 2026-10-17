import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { rename } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { Transform } from "node:stream";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";

const RUNTIME_URL = "https://github.com/ggml-org/llama.cpp/releases/download/b11662/llama-b11662-bin-win-cpu-x64.zip";
const RUNTIME_SHA256 = "be4e5ef073c2240fffc0cc38f7f7a76fac08254c6d7cfd56a4b60f011b404b42";
const MODEL_URL = "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/91cad51170dc346986eccefdc2dd33a9da36ead9/qwen2.5-1.5b-instruct-q4_k_m.gguf";
const MODEL_FILENAME = "qwen2.5-1.5b-instruct-q4_k_m.gguf";
const MODEL_SIZE = 1117320736;
const MODEL_SHA256 = "6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e";
const LLAMA_LICENSE_URL = "https://raw.githubusercontent.com/ggml-org/llama.cpp/b11662/LICENSE";
const LLAMA_LICENSE_SIZE = 1078;
const LLAMA_LICENSE_SHA256 = "94f29bbed6a22c35b992c5c6ebf0e7c92f13b836b90f36f461c9cf2f0f1d010d";
const MODEL_LICENSE_URL = "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/raw/91cad51170dc346986eccefdc2dd33a9da36ead9/LICENSE";
const MODEL_LICENSE_SIZE = 11343;
const MODEL_LICENSE_SHA256 = "832dd9e00a68dd83b3c3fb9f5588dad7dcf337a0db50f7d9483f310cd292e92e";
const BUILD_DIR = path.resolve("build");
const RESOURCE_DIR = path.join(BUILD_DIR, "offline-llm");
const RUNTIME_DIR = path.join(RESOURCE_DIR, "llama-runtime");
const ARCHIVE_PATH = path.join(BUILD_DIR, "llama-b11662-bin-win-cpu-x64.zip");
const MODEL_PATH = path.join(RESOURCE_DIR, MODEL_FILENAME);
const LLAMA_LICENSE_PATH = path.join(RESOURCE_DIR, "LICENSE-llama.cpp.txt");
const MODEL_LICENSE_PATH = path.join(RESOURCE_DIR, "LICENSE-Qwen.txt");

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", chunk => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", () => resolve(hash.digest("hex")));
  });
}

async function downloadVerified(url, destination, expectedSize, expectedHash) {
  if (existsSync(destination)) {
    const existing = statSync(destination);
    if (existing.size === expectedSize && await sha256File(destination) === expectedHash) return;
    rmSync(destination, { force: true });
  }

  const temporaryPath = `${destination}.download`;
  rmSync(temporaryPath, { force: true });
  mkdirSync(path.dirname(destination), { recursive: true });
  console.log(`Downloading ${path.basename(destination)} (${(expectedSize / 1024 ** 2).toFixed(0)} MB)...`);

  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status} for ${url}`);

  let downloaded = 0;
  let lastProgress = -1;
  const hash = createHash("sha256");
  const counter = new Transform({
    transform(chunk, encoding, callback) {
      downloaded += chunk.length;
      hash.update(chunk);
      const progress = Math.floor(downloaded / expectedSize * 100);
      if (progress >= lastProgress + 10) {
        lastProgress = progress;
        console.log(`${path.basename(destination)}: ${Math.min(progress, 100)}%`);
      }
      callback(null, chunk);
    },
  });

  await pipeline(Readable.fromWeb(response.body), counter, createWriteStream(temporaryPath));
  const digest = hash.digest("hex");
  if (downloaded !== expectedSize || digest !== expectedHash) {
    rmSync(temporaryPath, { force: true });
    throw new Error(`Integrity check failed for ${path.basename(destination)} (size ${downloaded}, SHA-256 ${digest}).`);
  }
  await rename(temporaryPath, destination);
}

function extractRuntime() {
  rmSync(RUNTIME_DIR, { recursive: true, force: true });
  mkdirSync(RUNTIME_DIR, { recursive: true });

  const command = process.platform === "win32" ? "powershell.exe" : "unzip";
  const args = process.platform === "win32"
    ? ["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath '${ARCHIVE_PATH.replaceAll("'", "''")}' -DestinationPath '${RUNTIME_DIR.replaceAll("'", "''")}' -Force`]
    : ["-q", "-o", ARCHIVE_PATH, "-d", RUNTIME_DIR];
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error || result.status !== 0) throw result.error || new Error(`${command} failed to extract the llama.cpp runtime.`);
}

await downloadVerified(RUNTIME_URL, ARCHIVE_PATH, 19529801, RUNTIME_SHA256);
await downloadVerified(MODEL_URL, MODEL_PATH, MODEL_SIZE, MODEL_SHA256);
await downloadVerified(LLAMA_LICENSE_URL, LLAMA_LICENSE_PATH, LLAMA_LICENSE_SIZE, LLAMA_LICENSE_SHA256);
await downloadVerified(MODEL_LICENSE_URL, MODEL_LICENSE_PATH, MODEL_LICENSE_SIZE, MODEL_LICENSE_SHA256);
extractRuntime();
rmSync(ARCHIVE_PATH, { force: true });

if (!existsSync(path.join(RUNTIME_DIR, "llama-server.exe"))) {
  throw new Error("The downloaded runtime does not contain llama-server.exe.");
}

console.log("Verified offline model and runtime staged for embedding in the Windows installer.");