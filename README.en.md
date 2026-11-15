# image-converter

[Wersja polska](README.md)

Crop and resize images, then save them as PNG, JPEG or WebP. You choose the aspect ratio, focal point and output dimensions; the browser performs the conversion. AVIF requires a separate encoder supplied by the caller.

## Usage

Download the package for your chosen version from [Releases](https://github.com/K44DEUSZ/image-converter/releases), then install it in your project:

```sh
npm install ./k44deusz-image-converter-1.1.0.tgz
```

```ts
import { cropRect, outputDimensions } from "@k44deusz/image-converter";

const image = { width: 400, height: 200, zoom: 1, focusX: 0.5, focusY: 0.5 };
cropRect(image, 1); // { x: 100, y: 0, width: 200, height: 200 }
```

## Details

`cropRect` and `outputDimensions` work without a browser. Focal coordinates range from 0 to 1 and zoom starts at 1. Output can keep the crop dimensions, fit a maximum edge or use an exact width and height.

`renderImage` uses `Image` and Canvas. Each output dimension is limited to 12000 px (`maximumImageDimension`); available memory and browser limits may constrain large images earlier. JPEG gets a filled background; PNG and WebP can preserve transparency. Use `makeOutputName` with `{name}` and `{n}` for output filenames.

The library does not include an AVIF encoder. Supply a function accepting `ImageData` and quality and returning an `ArrayBuffer` if you need one. My website uses the separate `@jsquash/avif` package; that dependency has its own license.

## API and environment boundaries (1.1.0)

Existing package-root imports remain supported. New subpaths separate pure operations from browser functions:

```ts
import { cropRect, outputDimensions, makeOutputName } from "@k44deusz/image-converter/core";
import { loadImage, renderImage } from "@k44deusz/image-converter/browser";

const controller = new AbortController();
const image = await loadImage(file, { signal: controller.signal }); // file: File or Blob
const geometry = {
  width: image.naturalWidth,
  height: image.naturalHeight,
  zoom: 1,
  focusX: 0.5,
  focusY: 0.5,
  url: file,
};
const result = await renderImage(
  geometry,
  {
    cropRatio: null,
    sizeMode: "max",
    maxEdge: 1920,
    exactWidth: 1200,
    exactHeight: 630,
    format: "webp",
    quality: 82,
    backgroundMode: "transparent",
    background: "#ffffff",
  },
  undefined,
  { signal: controller.signal, maxPixels: 40_000_000 },
);
// result: { blob: Blob, width: number, height: number }
```

The example assumes a user-supplied `file` and does not upload it. `/core` does not import the browser module or reference DOM types. The root and `/browser` declarations use DOM types, which must be enabled in the consumer's TypeScript configuration. Importing the root itself does not invoke Canvas.

| Function                                             | Inputs and result                                                                                                                                                                                                                                                      |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cropRect(geometry, ratio)`                          | Positive finite dimensions, zoom 1–100, focusX/Y 0–1, positive ratio or null → source rectangle {x,y,width,height}.                                                                                                                                                    |
| `outputDimensions(geometry, settings)`               | original/max/exact mode → positive rounded dimensions. max may upscale; exact may change the aspect ratio. This helper does not allocate Canvas.                                                                                                                       |
| `safeName(text)`                                     | Up to 4096 characters → sanitized ASCII name, possibly empty.                                                                                                                                                                                                          |
| `makeOutputName(filename, index, pattern, format)`   | Safe integer index starting at 0; png/jpeg/webp/avif; {name}/{n} tokens → one filename with an extension. It does not ensure batch uniqueness: the consumer must resolve collisions before creating a ZIP. The 4096-character limit also applies to the expanded stem. |
| `loadImage(source, options?)`                        | String URL or Blob/File → decoded HTMLImageElement with nonzero dimensions.                                                                                                                                                                                            |
| `renderImage(item, settings, encodeAvif?, options?)` | item is geometry plus url: string or Blob/File. Returns Promise<{blob,width,height}>. Existing three-argument calls remain supported.                                                                                                                                  |

`ImageLoadOptions` accepts `signal`, `crossOrigin` (anonymous/use-credentials/null), and optional `maxPixels`. The default output limit remains 12000 px per edge (144 million pixels). Source pixels are not limited by default so a large source can still be downscaled. Explicit `maxPixels` limits the decoded source and the output before Canvas allocation; it must be a positive integer up to 144 million. It cannot prevent the decoder's own allocations: consumers of untrusted files should also limit input bytes, batch size, and concurrency. Blob/File inputs have a 64 MiB limit; string URLs retain their 1 MiB limit. Replace long data URLs with Blob or a caller-owned object URL.

The caller owns string URLs and must revoke its own object URLs and downloaded results. The Blob/File adapter creates its own object URL and revokes it after decoding, including failure/cancellation. Remote URLs require server CORS permission and `crossOrigin: "anonymous"` for readable Canvas output. The library does not bypass CORS or enable credentialed requests by default. `signal` invalidates the result and releases owned resources; native encoding and external AVIF encoders may finish in the background. Process large batches sequentially.

Quality is a finite number from 0 to 100; PNG ignores it. Background is a CSS color and JPEG always fills it. Unsupported native output is rejected rather than silently returning PNG under another extension. AVIF requires an encoder `(ImageData, quality) => Promise<ArrayBuffer>` returning a nonempty ArrayBuffer. The external encoder is responsible for its encoded bytes.

Canvas export produces a raster image. It does not preserve animation, SVG text/layers, or source metadata. Decoding orientation and color handling depend on the browser. Lossless metadata copying and identical bytes across browsers are not promised.

Library errors are `ImageError` with code invalid_geometry, invalid_settings, browser_required, image_unreadable, canvas_unavailable, unsupported_format, encoding_failed, canvas_security, image_too_large, or aborted. Invalid JavaScript inputs and encoder failures are normalized to this contract. `formatMeta` remains consumer metadata; editing its nested fields cannot change the library's private encoding rules or filename extensions.

## Development

Use Node.js 24 for development. The source is TypeScript; releases contain ESM JavaScript and type declarations.

```sh
npm ci
npm run check
npm test
npx playwright install chromium firefox webkit
npm run test:browser
npm run check:package
```

A push to `main` runs checks and tests. Releases are published separately through GitHub Actions, using the version saved in `package.json`. Automation does not change that version or overwrite an existing release. A published release updates the dependency used by the website after its checks pass.

The browser suite checks Chromium, Firefox, and WebKit by default. Set the BROWSERS environment variable to a subset, such as chromium, to select fewer engines. Tests use local fixtures and never call the public tools site.

## License

MIT. Copyright 2026 Bartosz Golat.
