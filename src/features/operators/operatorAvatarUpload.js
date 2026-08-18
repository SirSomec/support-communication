import { OPERATOR_AVATAR_MAX_BYTES, OPERATOR_AVATAR_UPLOAD_TYPES, operatorAvatarBytesFromDataUrl } from "./avatarModel.js";

const MAX_DIMENSION = 512;
const TARGET_DIMENSIONS = [512, 448, 384, 320, 256, 192];
const QUALITY_LEVELS = [0.9, 0.82, 0.74, 0.66, 0.58];

export async function compressOperatorAvatar(file, { maxBytes = OPERATOR_AVATAR_MAX_BYTES } = {}) {
  if (!(file instanceof Blob)) {
    throw new Error("Выберите файл изображения.");
  }

  if (!OPERATOR_AVATAR_UPLOAD_TYPES.includes(file.type)) {
    throw new Error("Поддерживаются изображения JPEG, PNG и WebP.");
  }

  const decoded = await decodeImage(file);
  try {
    const largestSourceSide = Math.max(decoded.width, decoded.height);
    const maximumDimension = Math.min(MAX_DIMENSION, Math.max(1, largestSourceSide));

    for (const preferredDimension of TARGET_DIMENSIONS) {
      const dimension = Math.min(maximumDimension, preferredDimension);
      for (const quality of QUALITY_LEVELS) {
        const blob = await renderAvatarBlob(decoded.image, decoded.width, decoded.height, dimension, quality);
        if (!blob || blob.size > maxBytes) continue;
        const dataUrl = await blobToDataUrl(blob);
        const storedBytes = operatorAvatarBytesFromDataUrl(dataUrl);
        if (storedBytes <= maxBytes) {
          return {
            dataUrl,
            height: dimension,
            mimeType: blob.type,
            name: file.name,
            originalBytes: file.size,
            storedBytes,
            width: dimension
          };
        }
      }
    }
  } finally {
    decoded.close();
  }

  throw new Error("Не удалось сжать изображение до 2 МБ. Выберите другое изображение.");
}

async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return {
      close: () => bitmap.close(),
      height: bitmap.height,
      image: bitmap,
      width: bitmap.width
    };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Не удалось прочитать изображение."));
      element.src = objectUrl;
    });
    return {
      close: () => URL.revokeObjectURL(objectUrl),
      height: image.naturalHeight,
      image,
      width: image.naturalWidth
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function renderAvatarBlob(image, sourceWidth, sourceHeight, dimension, quality) {
  const canvas = document.createElement("canvas");
  canvas.height = dimension;
  canvas.width = dimension;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    throw new Error("Браузер не поддерживает обработку изображений.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, dimension, dimension);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  const cropSize = Math.min(sourceWidth, sourceHeight);
  const sourceX = (sourceWidth - cropSize) / 2;
  const sourceY = (sourceHeight - cropSize) / 2;
  context.drawImage(image, sourceX, sourceY, cropSize, cropSize, 0, 0, dimension, dimension);

  const webp = await canvasToBlob(canvas, "image/webp", quality);
  return webp ?? canvasToBlob(canvas, "image/jpeg", quality);
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось подготовить изображение."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}
