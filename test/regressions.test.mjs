import assert from "node:assert/strict";
import test from "node:test";
import { cropRect, formatMeta, makeOutputName, outputDimensions } from "../dist/core.js";
import { loadImage, renderImage } from "../dist/browser.js";

const geometry = { width: 400, height: 200, zoom: 1, focusX: 0.5, focusY: 0.5 };
const settings = {
  cropRatio: null,
  sizeMode: "original",
  maxEdge: 100,
  exactWidth: 1,
  exactHeight: 1,
  format: "png",
  quality: 80,
  backgroundMode: "transparent",
  background: "#ffffff",
};

test("metadata edits cannot alter output filenames or the private format allowlist", () => {
  const original = { ...formatMeta.png };
  try {
    formatMeta.png.extension = "exe";
    formatMeta.png.mime = "application/octet-stream";
    assert.equal(makeOutputName("photo.png", 0, "{name}", "png"), "photo.png");
    assert.throws(() => makeOutputName("photo.png", 0, "{name}", "toString"), {
      code: "invalid_settings",
    });
  } finally {
    Object.assign(formatMeta.png, original);
  }
});

test("untyped callers receive controlled errors instead of native property failures", async () => {
  for (const filename of [null, undefined, 42, {}, Symbol("file")])
    assert.throws(() => makeOutputName(filename, 0, "{name}", "png"), { code: "invalid_settings" });
  for (const invalid of [null, undefined, 42, {}, new Uint8Array(1)])
    await assert.rejects(loadImage(invalid), { code: "image_unreadable" });
  await assert.rejects(loadImage("blob:fixture", { signal: {} }), { code: "invalid_settings" });
  await assert.rejects(renderImage(null, settings), { code: "invalid_geometry" });
  await assert.rejects(renderImage({ ...geometry, url: "blob:fixture" }, null), {
    code: "invalid_settings",
  });
});

test("abort and pixel validation happen before decoding or allocating a canvas", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(loadImage("blob:fixture", { signal: controller.signal }), {
    code: "aborted",
  });
  await assert.rejects(
    renderImage({ ...geometry, url: "blob:fixture" }, settings, undefined, { maxPixels: 100 }),
    { code: "image_too_large" },
  );
  for (const maxPixels of [0, -1, NaN, Infinity, 1.5, 144_000_001])
    await assert.rejects(loadImage("blob:fixture", { maxPixels }), { code: "invalid_settings" });
});

test("geometry rejects finite-number overflow and filename expansion validates its result", () => {
  assert.throws(
    () => cropRect({ ...geometry, width: Number.MAX_VALUE, height: Number.MIN_VALUE }, null),
    { code: "invalid_geometry" },
  );
  assert.throws(() => makeOutputName("a".repeat(2000) + ".png", 0, "{name}{name}{name}", "png"), {
    code: "invalid_settings",
  });
  assert.deepEqual(
    outputDimensions(geometry, {
      ...settings,
      sizeMode: "exact",
      exactWidth: 12000,
      exactHeight: 12000,
    }),
    { width: 12000, height: 12000 },
  );
});
