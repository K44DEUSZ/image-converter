# image-converter

[Wersja polska](README.md)

Crop and resize images, then save them as PNG, JPEG or WebP. You choose the aspect ratio, focal point and output dimensions; the browser performs the conversion. AVIF requires a separate encoder supplied by the caller.

## Usage

Download the package for your chosen version from [Releases](https://github.com/K44DEUSZ/image-converter/releases), then install it in your project:

```sh
npm install ./k44deusz-image-converter-1.0.0.tgz
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

## Development

Use Node.js 24 for development. The source is TypeScript; releases contain ESM JavaScript and type declarations.

```sh
npm ci
npm run check
npm test
```

A push to `main` runs checks and tests. Releases are published separately through GitHub Actions, using the version saved in `package.json`. Automation does not change that version or overwrite an existing release. A published release updates the dependency used by the website after its checks pass.

## License

MIT. Copyright 2026 Bartosz Golat.
