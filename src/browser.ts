import {
  cropRect,
  ImageError,
  maximumImageDimension,
  maximumImagePixels,
  maximumSourceBytes,
  maximumSourceUrlLength,
  outputDimensions,
  type ImageGeometry,
  type RenderSettings,
} from "./core.js";
import { formatRules } from "./format-rules.js";

export type ImageLoadOptions = {
  signal?: AbortSignal;
  crossOrigin?: "anonymous" | "use-credentials" | null;
  /** Decoded input and output pixel budget; at most 144,000,000 pixels. */
  maxPixels?: number;
};

export type AvifEncoder = (data: ImageData, quality: number) => Promise<ArrayBuffer>;

const bufferByteLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength")?.get;

function isNonemptyArrayBuffer(value: unknown): value is ArrayBuffer {
  try {
    return bufferByteLength !== undefined && bufferByteLength.call(value) > 0;
  } catch {
    return false;
  }
}

function pixelBudget(options: ImageLoadOptions): number {
  const budget = options.maxPixels ?? maximumImagePixels;
  if (
    !Number.isSafeInteger(budget) ||
    budget < 1 ||
    budget > maximumImageDimension ** 2 ||
    ![undefined, null, "anonymous", "use-credentials"].includes(options.crossOrigin) ||
    (options.signal !== undefined &&
      (!options.signal ||
        typeof options.signal.aborted !== "boolean" ||
        typeof options.signal.addEventListener !== "function" ||
        typeof options.signal.removeEventListener !== "function"))
  )
    throw new ImageError("invalid_settings");
  return budget;
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ImageError("aborted");
}

function abortable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new ImageError("aborted"));
    if (signal.aborted) {
      operation.catch(() => undefined);
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

/** Blob/File object URLs created here are revoked after decode; caller URLs remain caller-owned. */
export async function loadImage(
  source: string | Blob,
  options: ImageLoadOptions = {},
): Promise<HTMLImageElement> {
  if (!options || typeof options !== "object") throw new ImageError("invalid_settings");
  const budget = pixelBudget(options);
  checkAbort(options.signal);
  const isBlob = typeof Blob !== "undefined" && source instanceof Blob;
  if (
    (!isBlob &&
      (typeof source !== "string" || !source || source.length > maximumSourceUrlLength)) ||
    (isBlob && (!source.size || source.size > maximumSourceBytes))
  )
    throw new ImageError(isBlob ? "image_too_large" : "image_unreadable");
  if (typeof Image === "undefined") throw new ImageError("browser_required");
  const image = new Image();
  const ownedUrl = isBlob ? URL.createObjectURL(source) : null;
  image.decoding = "async";
  if (options.crossOrigin !== undefined) image.crossOrigin = options.crossOrigin;
  image.src = ownedUrl ?? (source as string);
  try {
    await abortable(image.decode(), options.signal);
    checkAbort(options.signal);
    if (!image.naturalWidth || !image.naturalHeight) throw new ImageError("image_unreadable");
    if (options.maxPixels !== undefined && image.naturalWidth * image.naturalHeight > budget)
      throw new ImageError("image_too_large");
    return image;
  } catch (error) {
    if (options.signal?.aborted) {
      image.src = "";
      throw new ImageError("aborted");
    }
    if (error instanceof ImageError) throw error;
    throw new ImageError("image_unreadable");
  } finally {
    if (ownedUrl) URL.revokeObjectURL(ownedUrl);
  }
}

/** Aborting discards results; native Canvas and third-party encoder work may finish in the background. */
export async function renderImage(
  item: ImageGeometry & { url: string | Blob },
  settings: RenderSettings,
  encodeAvif?: AvifEncoder,
  options: ImageLoadOptions = {},
) {
  if (!options || typeof options !== "object") throw new ImageError("invalid_settings");
  const budget = pixelBudget(options);
  checkAbort(options.signal);
  const geometry = { ...item };
  const snapshot = { ...settings };
  const dimensions = outputDimensions(geometry, snapshot);
  const crop = cropRect(geometry, snapshot.cropRatio);
  if (
    !Object.hasOwn(formatRules, snapshot.format) ||
    !Number.isFinite(snapshot.quality) ||
    snapshot.quality < 0 ||
    snapshot.quality > 100 ||
    !["transparent", "color"].includes(snapshot.backgroundMode) ||
    typeof snapshot.background !== "string" ||
    snapshot.background.length > 128 ||
    dimensions.width > maximumImageDimension ||
    dimensions.height > maximumImageDimension
  )
    throw new ImageError("invalid_settings");
  if (dimensions.width * dimensions.height > budget) throw new ImageError("image_too_large");
  if (snapshot.format === "avif" && typeof encodeAvif !== "function")
    throw new ImageError("unsupported_format");
  if (typeof document === "undefined") throw new ImageError("browser_required");
  if (
    (snapshot.format === "jpeg" || snapshot.backgroundMode === "color") &&
    typeof CSS !== "undefined" &&
    !CSS.supports("color", snapshot.background)
  )
    throw new ImageError("invalid_settings");
  const image = await loadImage(geometry.url, options);
  checkAbort(options.signal);
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  try {
    const context = canvas.getContext("2d", { willReadFrequently: snapshot.format === "avif" });
    if (!context) throw new ImageError("canvas_unavailable");
    if (snapshot.format === "jpeg" || snapshot.backgroundMode === "color") {
      context.fillStyle = snapshot.background;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
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
    if (snapshot.format === "avif") {
      const encoder = encodeAvif;
      if (!encoder) throw new ImageError("unsupported_format");
      const bytes = await abortable(
        encoder(context.getImageData(0, 0, canvas.width, canvas.height), snapshot.quality),
        options.signal,
      );
      if (!isNonemptyArrayBuffer(bytes)) throw new ImageError("encoding_failed");
      blob = new Blob([bytes], { type: "image/avif" });
    } else {
      const meta = formatRules[snapshot.format];
      blob = await abortable(
        new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (output) => {
              if (!output) reject(new ImageError("encoding_failed"));
              else if (output.type !== meta.mime) reject(new ImageError("unsupported_format"));
              else resolve(output);
            },
            meta.mime,
            meta.hasQuality ? snapshot.quality / 100 : undefined,
          ),
        ),
        options.signal,
      );
    }
    checkAbort(options.signal);
    return { blob, width: dimensions.width, height: dimensions.height };
  } catch (error) {
    if (options.signal?.aborted) throw new ImageError("aborted");
    if (error instanceof ImageError) throw error;
    if (error instanceof DOMException && error.name === "SecurityError")
      throw new ImageError("canvas_security");
    throw new ImageError("encoding_failed");
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
