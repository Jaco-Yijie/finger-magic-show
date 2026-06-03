import { createWriteStream, cpSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import https from "node:https";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = join(root, "public", "mediapipe");
const wasmDestination = join(publicRoot, "wasm");
const modelDestination = join(publicRoot, "hand_landmarker.task");
const modelUrl =
  process.env.HAND_LANDMARKER_MODEL_URL ??
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function hasFile(path) {
  return existsSync(path) && statSync(path).size > 0;
}

function download(url, destination) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        response.resume();
        download(response.headers.location, destination).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`下载模型失败：HTTP ${response.statusCode}`));
        return;
      }

      const file = createWriteStream(destination);
      response.pipe(file);
      file.on("finish", () => {
        file.close(resolve);
      });
      file.on("error", reject);
    });

    request.on("error", reject);
  });
}

ensureDir(publicRoot);

const packageRoot = dirname(require.resolve("@mediapipe/tasks-vision"));
const wasmSource = join(packageRoot, "wasm");
cpSync(wasmSource, wasmDestination, { recursive: true });
console.log(`已复制 MediaPipe wasm 到 ${wasmDestination}`);

if (hasFile(modelDestination)) {
  console.log(`已存在模型文件 ${modelDestination}`);
} else {
  console.log(`下载 Hand Landmarker 模型：${modelUrl}`);
  await download(modelUrl, modelDestination);
  console.log(`已保存模型文件 ${modelDestination}`);
}
