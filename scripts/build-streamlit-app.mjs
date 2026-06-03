import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = join(root, "dist");
const outputRoot = join(root, "streamlit_static");
const indexPath = join(distRoot, "index.html");

const html = readFileSync(indexPath, "utf8");
const scriptMatch = html.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/);
const styleMatch = html.match(/<link rel="stylesheet" crossorigin href="([^"]+)">/);

if (!scriptMatch || !styleMatch) {
  throw new Error("无法从 dist/index.html 中找到 Vite 产物引用");
}

const scriptPath = join(distRoot, scriptMatch[1].replace(/^\//, ""));
const stylePath = join(distRoot, styleMatch[1].replace(/^\//, ""));
const script = readFileSync(scriptPath, "utf8");
const style = readFileSync(stylePath, "utf8").replaceAll("</style>", "<\\/style>");
const scriptBase64 = Buffer.from(script, "utf8").toString("base64");

const embedded = html
  .replace(styleMatch[0], `<style>${style}</style>`)
  .replace(
    scriptMatch[0],
    `<!-- FINGER_MAGIC_ASSETS -->\n    <script type="module">
      const moduleBinary = atob("${scriptBase64}");
      const moduleBytes = new Uint8Array(moduleBinary.length);
      for (let index = 0; index < moduleBinary.length; index += 1) {
        moduleBytes[index] = moduleBinary.charCodeAt(index);
      }
      const moduleUrl = URL.createObjectURL(new Blob([moduleBytes], { type: "text/javascript;charset=utf-8" }));
      await import(moduleUrl);
    </script>`,
  );

mkdirSync(outputRoot, { recursive: true });
writeFileSync(join(outputRoot, "app.html"), embedded);
console.log(`已生成 ${join(outputRoot, "app.html")}`);
