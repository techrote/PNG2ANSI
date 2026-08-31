import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path, encoding = "utf8") => readFile(resolve(root, path), encoding);
const [template, css, coreRaw, workerRaw, appRaw, font, quickstart] = await Promise.all([
  read("src/index.html"), read("src/styles.css"), read("src/core.js"),
  read("src/worker.js"), read("src/app.js"), read("assets/DejaVuSansMono.ttf", null), read("QUICKSTART.md")
]);
const escapeHtml = text => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const inlineMarkdown = text => escapeHtml(text).replace(/`([^`]+)`/g, "<code>$1</code>");
const quickstartHtml = quickstart.trim().split(/\r?\n\s*\r?\n/).map(block => {
  const text = block.replace(/\r?\n/g, " ").trim();
  if (text.startsWith("# ")) return `<h2>${inlineMarkdown(text.slice(2))}</h2>`;
  return `<p>${inlineMarkdown(text)}</p>`;
}).join("\n");
const font64 = font.toString("base64");
const core = coreRaw.replaceAll("__FONT_BASE64__", font64);
const worker = workerRaw.replace("/*__CORE__*/", core);
const app = appRaw.replace("/*__WORKER_SOURCE__*/\"\"", JSON.stringify(worker));
const sourceHash = createHash("sha256").update(template).update(css).update(core).update(worker).update(app).digest("hex");
const html = template
  .replace("/*__SOURCE_HASH__*/", sourceHash)
  .replace("/*__CSS__*/", css)
  .replace("/*__FONT__*/", font64)
  .replace("/*__QUICKSTART__*/", quickstartHtml)
  .replace("/*__CORE__*/", core.replaceAll("</script", "<\\/script"))
  .replace("/*__APP__*/", app.replaceAll("</script", "<\\/script"));
const output = resolve(root, "PNG2ANSI-web.html");
if (process.argv.includes("--check")) {
  let existing = "";
  try { existing = await readFile(output, "utf8"); } catch {}
  if (existing !== html) {
    console.error("PNG2ANSI-web.html is stale; run npm run build");
    process.exit(1);
  }
  console.log(`artifact current (${sourceHash.slice(0, 12)})`);
} else {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, html);
  console.log(`built PNG2ANSI-web.html (${sourceHash.slice(0, 12)})`);
}
