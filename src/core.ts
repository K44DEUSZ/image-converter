import { formatRules } from "./format-rules.js";

export type OutputFormat = "png" | "jpeg" | "webp" | "avif";
export type SizeMode = "original" | "max" | "exact";
export const maximumImageDimension = 12000;
export const maximumImagePixels = maximumImageDimension ** 2;
export const maximumSourceBytes = 64 * 1024 * 1024;
export const maximumSourceUrlLength = 1_048_576;
export const maximumNameLength = 4096;
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
  | "encoding_failed"
  | "canvas_security"
  | "image_too_large"
  | "aborted";
export class ImageError extends Error {
  constructor(public readonly code: ImageErrorCode) {
    super(code);
    this.name = "ImageError";
  }
}
export const formatMeta: Readonly<
  Record<OutputFormat, { mime: string; extension: string; hasQuality: boolean }>
> = Object.freeze({
  png: { ...formatRules.png },
  jpeg: { ...formatRules.jpeg },
  webp: { ...formatRules.webp },
  avif: { ...formatRules.avif },
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
  if (![width, height].every((value) => Number.isFinite(value) && value > 0))
    throw new ImageError("invalid_geometry");
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

export function safeName(value: string): string {
  if (typeof value !== "string" || value.length > maximumNameLength)
    throw new ImageError("invalid_settings");
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
    !Object.hasOwn(formatRules, format) ||
    !Number.isSafeInteger(index) ||
    index < 0 ||
    typeof filename !== "string" ||
    typeof pattern !== "string" ||
    pattern.length > maximumNameLength
  )
    throw new ImageError("invalid_settings");
  const original = safeName(filename.replace(/\.[^.]+$/, "")) || "image";
  const number = String(index + 1).padStart(2, "0");
  const resolved =
    safeName(pattern.replaceAll("{name}", original).replaceAll("{n}", number)) || original;
  return `${resolved}.${formatRules[format].extension}`;
}
