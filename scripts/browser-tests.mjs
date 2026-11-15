import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { chromium, firefox, webkit } from "playwright";

const allowed = new Set(["index.js", "core.js", "browser.js", "format-rules.js"]);
const server = createServer(async (request, response) => {
  const name = request.url.slice(1);
  if (!name) return response.end("<!doctype html><title>Image converter tests</title>");
  if (!allowed.has(name)) {
    response.statusCode = 404;
    return response.end();
  }
  response.setHeader("Content-Type", "text/javascript");
  response.end(await readFile(new URL(`../dist/${name}`, import.meta.url)));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  for (const name of (process.env.BROWSERS ?? "chromium,firefox,webkit").split(",")) {
    const launcher = { chromium, firefox, webkit }[name];
    assert.ok(launcher, `Unknown browser ${name}`);
    const browser = await launcher.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(origin);
      const result = await page.evaluate(async () => {
        const { renderImage, loadImage } = await import("/browser.js");
        const { formatMeta } = await import("/core.js");
        const results = [];
        const check = (condition, label) => {
          if (!condition) throw new Error(label);
          results.push(label);
        };
        const rejects = async (operation, code) => {
          try {
            await operation;
          } catch (error) {
            check(error.code === code, `rejects ${code}`);
            return;
          }
          throw new Error(`Expected ${code}`);
        };
        const source = document.createElement("canvas");
        source.width = 4;
        source.height = 2;
        const context = source.getContext("2d");
        context.fillStyle = "red";
        context.fillRect(0, 0, 2, 2);
        context.fillStyle = "blue";
        context.fillRect(2, 0, 2, 2);
        const blob = await new Promise((resolve) => source.toBlob(resolve));
        const geometry = { width: 4, height: 2, zoom: 1, focusX: 1, focusY: 0.5, url: blob };
        const settings = {
          cropRatio: 1,
          sizeMode: "original",
          maxEdge: 20,
          exactWidth: 20,
          exactHeight: 20,
          format: "png",
          quality: 80,
          backgroundMode: "transparent",
          background: "#ffffff",
        };
        for (const format of ["png", "jpeg", "webp"]) {
          const output = await renderImage(geometry, { ...settings, format });
          const bitmap = await createImageBitmap(output.blob);
          check(bitmap.width === 2 && bitmap.height === 2, `${format} decoded dimensions`);
          check(output.blob.type === `image/${format}`, `${format} MIME`);
          context.clearRect(0, 0, 4, 2);
          context.drawImage(bitmap, 0, 0);
          bitmap.close();
          const pixel = context.getImageData(1, 1, 1, 1).data;
          check(pixel[2] > 220 && pixel[0] < 30, `${format} focal crop contains blue pixels`);
        }
        const originalMeta = { ...formatMeta.png };
        formatMeta.png.mime = "application/octet-stream";
        formatMeta.png.extension = "exe";
        check(
          (await renderImage(geometry, settings)).blob.type === "image/png",
          "metadata mutation cannot change encoder",
        );
        Object.assign(formatMeta.png, originalMeta);
        const frame = document.createElement("iframe");
        document.body.append(frame);
        const foreignBuffer = new frame.contentWindow.ArrayBuffer(4);
        const foreignAvif = await renderImage(
          geometry,
          { ...settings, format: "avif" },
          async () => foreignBuffer,
        );
        check(
          foreignAvif.blob.size === 4,
          "same-origin iframe AVIF encoder ArrayBuffer remains supported",
        );
        frame.remove();
        await rejects(
          renderImage(geometry, { ...settings, format: "avif" }, async () => new Uint8Array(4)),
          "encoding_failed",
        );
        const nativeToBlob = HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
          return nativeToBlob.call(
            this,
            callback,
            type === "image/webp" ? "image/png" : type,
            quality,
          );
        };
        await rejects(renderImage(geometry, { ...settings, format: "webp" }), "unsupported_format");
        HTMLCanvasElement.prototype.toBlob = nativeToBlob;
        await rejects(
          renderImage(geometry, settings, undefined, { maxPixels: 3 }),
          "image_too_large",
        );
        await rejects(loadImage(blob, { maxPixels: 3 }), "image_too_large");
        const controller = new AbortController();
        const cancelled = renderImage(geometry, settings, undefined, { signal: controller.signal });
        controller.abort();
        await rejects(cancelled, "aborted");
        await rejects(
          renderImage(geometry, { ...settings, format: "avif" }, async () => {
            throw new Error("encoder fixture failure");
          }),
          "encoding_failed",
        );
        const transparent = document.createElement("canvas");
        transparent.width = 1;
        transparent.height = 1;
        const transparentBlob = await new Promise((resolve) => transparent.toBlob(resolve));
        const jpeg = await renderImage(
          { ...geometry, width: 1, height: 1, url: transparentBlob },
          { ...settings, cropRatio: null, format: "jpeg" },
        );
        const jpegBitmap = await createImageBitmap(jpeg.blob);
        context.drawImage(jpegBitmap, 0, 0);
        jpegBitmap.close();
        const white = context.getImageData(0, 0, 1, 1).data;
        check(
          white[0] > 245 && white[1] > 245 && white[2] > 245 && white[3] === 255,
          "JPEG flattens transparency on selected white background",
        );
        let created = 0,
          revoked = 0;
        const createUrl = URL.createObjectURL.bind(URL),
          revokeUrl = URL.revokeObjectURL.bind(URL);
        URL.createObjectURL = (value) => {
          created += 1;
          return createUrl(value);
        };
        URL.revokeObjectURL = (value) => {
          revoked += 1;
          return revokeUrl(value);
        };
        const decoded = await loadImage(blob);
        check(
          decoded.naturalWidth === 4 && created === 1 && revoked === 1,
          "Blob adapter owns and releases exactly its URL",
        );
        URL.createObjectURL = createUrl;
        URL.revokeObjectURL = revokeUrl;
        return results;
      });
      console.log(`${name}: ${result.length} browser assertions passed`);
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}
