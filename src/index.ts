export type OutputFormat = "png" | "jpeg" | "webp" | "avif";
export type SizeMode = "original" | "max" | "exact";
export const maximumImageDimension = 12000;
export type ImageGeometry = {
  width: number;
  height: number;
  zoom: number;
  focusX: number;
  focusY: number;
};
export type RenderSettings = {
  cropRatio: number | null;
  sizeMode: SizeMode;
  maxEdge: number;
  exactWidth: number;
  exactHeight: number;
  format: OutputFormat;
  quality: number;
  backgroundMode: "transparent" | "color";
  background: string;
};
export type ImageErrorCode =
  | "invalid_geometry"
  | "invalid_settings"
  | "browser_required"
  | "image_unreadable"
  | "canvas_unavailable"
  | "unsupported_format"
  | "encoding_failed";
export class ImageError extends Error {
  constructor(public readonly code: ImageErrorCode) {
    super(code);
    this.name = "ImageError";
  }
}
export const formatMeta = Object.freeze({
  png: { mime: "image/png", extension: "png", hasQuality: false },
  jpeg: { mime: "image/jpeg", extension: "jpg", hasQuality: true },
  webp: { mime: "image/webp", extension: "webp", hasQuality: true },
  avif: { mime: "image/avif", extension: "avif", hasQuality: true },
});

export function cropRect(item: ImageGeometry, ratio: number | null) {
  if (
    !item ||
    ![item.width, item.height, item.zoom, item.focusX, item.focusY].every(Number.isFinite) ||
    item.width <= 0 ||
    item.height <= 0 ||
    item.zoom < 1 ||
    item.zoom > 100 ||
    item.focusX < 0 ||
    item.focusX > 1 ||
    item.focusY < 0 ||
    item.focusY > 1 ||
    (ratio !== null && (!Number.isFinite(ratio) || ratio <= 0))
  )
    throw new ImageError("invalid_geometry");
  const sourceRatio = item.width / item.height,
    targetRatio = ratio ?? sourceRatio;
  let width = item.width,
    height = item.height;
  if (sourceRatio > targetRatio) width = height * targetRatio;
  else height = width / targetRatio;
  width /= item.zoom;
  height /= item.zoom;
  return {
    x: (item.width - width) * item.focusX,
    y: (item.height - height) * item.focusY,
    width,
    height,
  };
}

export function outputDimensions(
  item: ImageGeometry,
  settings: Pick<
    RenderSettings,
    "cropRatio" | "sizeMode" | "maxEdge" | "exactWidth" | "exactHeight"
  >,
) {
  if (!settings || !["original", "max", "exact"].includes(settings.sizeMode))
    throw new ImageError("invalid_settings");
  const crop = cropRect(item, settings.cropRatio);
  let width = crop.width,
    height = crop.height;
  if (settings.sizeMode === "exact") {
    width = settings.exactWidth;
    height = settings.exactHeight;
  } else if (settings.sizeMode === "max") {
    const ratio = crop.width / crop.height;
    width = ratio >= 1 ? settings.maxEdge : settings.maxEdge * ratio;
    height = ratio >= 1 ? settings.maxEdge / ratio : settings.maxEdge;
  }
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw new ImageError("invalid_settings");
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}

export async function loadImage(src: string): Promise<HTMLImageElement> {
  if (typeof Image === "undefined") throw new ImageError("browser_required");
  if (typeof src !== "string" || !src || src.length > 1048576)
    throw new ImageError("image_unreadable");
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  try {
    await image.decode();
  } catch {
    throw new ImageError("image_unreadable");
  }
  if (!image.naturalWidth || !image.naturalHeight) throw new ImageError("image_unreadable");
  return image;
}

export type AvifEncoder = (data: ImageData, quality: number) => Promise<ArrayBuffer>;
export async function renderImage(
  item: ImageGeometry & { url: string },
  settings: RenderSettings,
  encodeAvif?: AvifEncoder,
) {
  const dimensions = outputDimensions(item, settings),
    crop = cropRect(item, settings.cropRatio);
  if (typeof document === "undefined") throw new ImageError("browser_required");
  if (
    !Object.hasOwn(formatMeta, settings.format) ||
    !Number.isFinite(settings.quality) ||
    settings.quality < 0 ||
    settings.quality > 100 ||
    !["transparent", "color"].includes(settings.backgroundMode) ||
    typeof settings.background !== "string" ||
    settings.background.length > 128 ||
    dimensions.width > maximumImageDimension ||
    dimensions.height > maximumImageDimension
  )
    throw new ImageError("invalid_settings");
  const image = await loadImage(item.url);
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext("2d", { willReadFrequently: settings.format === "avif" });
  if (!context) throw new ImageError("canvas_unavailable");
  if (settings.format === "jpeg" || settings.backgroundMode === "color") {
    context.fillStyle = settings.background;
    context.fillRect(0, 0, canvas.width, canvas.height);
  } else context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  let blob: Blob;
  if (settings.format === "avif") {
    if (!encodeAvif) throw new ImageError("unsupported_format");
    const bytes = await encodeAvif(
      context.getImageData(0, 0, canvas.width, canvas.height),
      settings.quality,
    );
    blob = new Blob([bytes], { type: "image/avif" });
  } else {
    const meta = formatMeta[settings.format];
    blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (output) => {
          if (!output) reject(new ImageError("encoding_failed"));
          else if (output.type !== meta.mime) reject(new ImageError("unsupported_format"));
          else resolve(output);
        },
        meta.mime,
        meta.hasQuality ? settings.quality / 100 : undefined,
      ),
    );
  }
  return { blob, width: canvas.width, height: canvas.height };
}

export function safeName(value: string): string {
  if (typeof value !== "string" || value.length > 4096) throw new ImageError("invalid_settings");
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
}

export function makeOutputName(
  filename: string,
  index: number,
  pattern: string,
  format: OutputFormat,
): string {
  if (
    !Object.hasOwn(formatMeta, format) ||
    !Number.isSafeInteger(index) ||
    index < 0 ||
    typeof pattern !== "string" ||
    pattern.length > 4096
  )
    throw new ImageError("invalid_settings");
  const original = safeName(filename.replace(/\.[^.]+$/, "")) || "image";
  const number = String(index + 1).padStart(2, "0");
  const resolved =
    safeName(pattern.replaceAll("{name}", original).replaceAll("{n}", number)) || original;
  return `${resolved}.${formatMeta[format].extension}`;
}
