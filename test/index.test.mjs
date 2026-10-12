import assert from "node:assert/strict";
import test from "node:test";
import {
  cropRect,
  outputDimensions,
  makeOutputName,
  renderImage,
  ImageError,
} from "../dist/index.js";
const image = { width: 400, height: 200, zoom: 1, focusX: 0.5, focusY: 0.5 };
test("crop focal points and output dimensions preserve the selected geometry", () => {
  assert.deepEqual(cropRect(image, 1), { x: 100, y: 0, width: 200, height: 200 });
  assert.deepEqual(cropRect({ ...image, zoom: 2, focusX: 1, focusY: 0 }, 1), {
    x: 300,
    y: 0,
    width: 100,
    height: 100,
  });
  assert.deepEqual(
    outputDimensions(image, {
      cropRatio: null,
      sizeMode: "max",
      maxEdge: 100,
      exactWidth: 1,
      exactHeight: 1,
    }),
    { width: 100, height: 50 },
  );
  assert.deepEqual(
    outputDimensions(image, {
      cropRatio: 1,
      sizeMode: "original",
      maxEdge: 100,
      exactWidth: 1,
      exactHeight: 1,
    }),
    { width: 200, height: 200 },
  );
  assert.deepEqual(
    outputDimensions(image, {
      cropRatio: null,
      sizeMode: "exact",
      maxEdge: 100,
      exactWidth: 64,
      exactHeight: 32,
    }),
    { width: 64, height: 32 },
  );
});
test("validates geometry and creates safe deterministic output filenames", () => {
  for (const invalid of [
    { ...image, width: 0 },
    { ...image, zoom: 0 },
    { ...image, focusX: 2 },
    { ...image, height: NaN },
  ])
    assert.throws(() => cropRect(invalid, 1), ImageError);
  assert.throws(() => cropRect(image, 0), ImageError);
  assert.equal(makeOutputName("my photo.png", 2, "{name}-{n}", "jpeg"), "my-photo-03.jpg");
  assert.equal(makeOutputName("photo.png", 0, "../../{name}", "webp"), "photo.webp");
  assert.throws(() => makeOutputName("photo.png", -1, "{name}", "png"), ImageError);
});
test("rendering requires a browser while geometry can run on Node", async () => {
  await assert.rejects(
    renderImage(
      { ...image, url: "blob:fixture" },
      {
        cropRatio: null,
        sizeMode: "original",
        maxEdge: 100,
        exactWidth: 1,
        exactHeight: 1,
        format: "png",
        quality: 80,
        backgroundMode: "transparent",
        background: "#000000",
      },
    ),
    { code: "browser_required" },
  );
});
