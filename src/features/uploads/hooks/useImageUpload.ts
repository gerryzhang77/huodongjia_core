/**
 * 统一图片上传 Hook（pending + tempId 乐观更新）
 *
 * 解决的痛点：
 * - 头像 / 相册 / 活动封面 / 回顾图 之前各自处理 loading 与错误回滚，写法分散且会闪烁
 * - 网速差时用户看不到任何反馈
 *
 * 用法：
 *   const { uploadWithPreview } = useImageUpload({ kind: "photo" });
 *
 *   const handleAdd = (file: File) => {
 *     const { tempUrl, finalUrlPromise } = uploadWithPreview(file);
 *     setList(prev => [...prev, tempUrl]);                         // 立即出现预览
 *     finalUrlPromise
 *       .then(real => setList(prev => prev.map(u => u === tempUrl ? real : u)))
 *       .catch(() => setList(prev => prev.filter(u => u !== tempUrl)));
 *   };
 *
 * 设计要点：
 * - tempUrl 用 URL.createObjectURL 即时生成，立即在 UI 显示
 * - finalUrlPromise resolve 时调用方负责把 tempUrl 替换成真实 url
 * - hook 默认在 settle 时 revokeObjectURL；需要保留失败缩略图时由调用方主动释放
 * - 文件类型 / 大小校验前置，上传前自动压缩大图，降低 413/502 概率
 * - kind 决定调用哪个上传 API；新增类型只改 dispatch
 */

import { withTimeout } from "../utils/withTimeout";
import { useCallback } from "react";
import { Toast } from "@/components/ui/Toast";
import { uploadCoverImage } from "@/features/activities/services/activityApi";
import { userApi, uploadMerchantAvatar } from "@/services";

export type ImageUploadKind =
  | "avatar"
  | "photo"
  | "cover"
  | "recap"
  | "merchant-avatar"
  | "enrollment";

export interface UploadHandle {
  /** 立即可用的本地预览 URL（blob:）— 上传成功/失败后会自动 revoke */
  tempUrl: string;
  /** 上传成功 → 返回 server 真实 URL；失败 → reject */
  finalUrlPromise: Promise<string>;
  /** 当调用方需要长期保留本地预览时，主动释放 blob URL。 */
  releasePreview: () => void;
}

interface Options {
  kind: ImageUploadKind;
  /** 原始文件最大字节数，默认 25MB */
  maxBytes?: number;
  /** 压缩后的目标上传体积，默认 2MB */
  uploadMaxBytes?: number;
  /** 图片长边最大像素，默认根据上传类型选择 */
  maxDimension?: number;
  /** 校验失败时是否自动 toast，默认 true */
  showToastOnError?: boolean;
  /** 覆盖 kind 对应的上传实现，例如报名图片返回私有资源 ID。 */
  upload?: (file: File) => Promise<string>;
  /** 默认 true；设为 false 时由调用方通过 releasePreview 释放。 */
  revokePreviewOnSettled?: boolean;
  /** 当前上传场景允许的 MIME；未配置时沿用通用图片判断。 */
  allowedMimeTypes?: readonly string[];
  /** MIME 缺失时允许通过扩展名兜底，例如 iOS 返回的 HEIC 文件。 */
  allowedExtensions?: readonly string[];
  /** 文件格式校验失败提示。 */
  formatErrorMessage?: string;
  /** 原始文件超出 maxBytes 时的提示。 */
  sizeErrorMessage?: string;
}

const DEFAULT_SOURCE_MAX = 25 * 1024 * 1024;
const DEFAULT_UPLOAD_MAX = 2 * 1024 * 1024;
const SERVER_SAFE_UPLOAD_MAX = 4.5 * 1024 * 1024;
const IMAGE_FILE_NAME_PATTERN = /\.(jpe?g|png|webp|gif|heic|heif)$/i;
const DIRECT_UPLOAD_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function getDefaultMaxDimension(kind: ImageUploadKind): number {
  if (kind === "avatar" || kind === "merchant-avatar") return 1200;
  return 1800;
}

function rejectedUploadHandle(message: string): UploadHandle {
  const finalUrlPromise = Promise.reject(new Error(message));
  finalUrlPromise.catch(() => undefined);
  return { tempUrl: "", finalUrlPromise, releasePreview: () => undefined };
}

function getFileExtension(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

function replaceImageExtension(name: string, type: string): string {
  const baseName = name.replace(/\.[^.]+$/, "") || "image";
  return `${baseName}.${getFileExtension(type)}`;
}

function isLikelyImageFile(file: File): boolean {
  return file.type.startsWith("image/") || IMAGE_FILE_NAME_PATTERN.test(file.name);
}

function getFileNameExtension(fileName: string): string {
  return fileName.match(/\.[^.]+$/)?.[0]?.toLowerCase() || "";
}

function isAllowedImageFile(
  file: File,
  allowedMimeTypes?: readonly string[],
  allowedExtensions?: readonly string[],
): boolean {
  if (!allowedMimeTypes?.length && !allowedExtensions?.length) {
    return isLikelyImageFile(file);
  }

  const mimeType = file.type.toLowerCase();
  const extension = getFileNameExtension(file.name);
  if (mimeType && mimeType !== "application/octet-stream") {
    return Boolean(allowedMimeTypes?.includes(mimeType));
  }

  return Boolean(extension && allowedExtensions?.includes(extension));
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("图片处理超时，请重试或换一张图片")), 15_000);
    canvas.toBlob(
      (blob) => {
        clearTimeout(timer);
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("图片压缩失败"));
        }
      },
      type,
      quality,
    );
  });
}

async function loadImageSource(file: File): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}> {
  if ("createImageBitmap" in window) {
    try {
      const bitmap = await withTimeout(createImageBitmap(file), 10_000, "图片读取超时", bitmap => bitmap.close());
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fall back to HTMLImageElement. Some mobile browsers expose
      // createImageBitmap but cannot decode HEIC/HEIF through it.
    }
  }

  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      img.src = "";
      URL.revokeObjectURL(url);
      reject(new Error("图片读取超时，请重试或换一张图片"));
    }, 10_000);
    img.onload = () => {
      clearTimeout(timer);
      resolve({
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        cleanup: () => URL.revokeObjectURL(url),
      });
    };
    img.onerror = () => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      reject(new Error("图片读取失败"));
    };
    img.src = url;
  });
}

async function optimizeImageForUpload(
  file: File,
  options: {
    maxDimension: number;
    uploadMaxBytes: number;
  },
): Promise<File> {
  const fileType = file.type.toLowerCase();
  const shouldTransform =
    file.size > options.uploadMaxBytes || !DIRECT_UPLOAD_TYPES.has(fileType);

  if (!shouldTransform) return file;

  if (file.type === "image/gif") {
    throw new Error("GIF 图片过大，请换一张较小的图片");
  }

  let image: Awaited<ReturnType<typeof loadImageSource>>;
  try {
    image = await loadImageSource(file);
  } catch (error) {
    // 部分浏览器无法解码 HEIC/HEIF，但后端可以直接接收。原图在后端
    // 5MB 限制内时跳过前端压缩，避免把可上传的图片误判为失败。
    if (file.size <= SERVER_SAFE_UPLOAD_MAX) return file;
    throw error;
  }
  try {
    const scale = Math.min(1, options.maxDimension / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("图片压缩失败");

    ctx.drawImage(image.source, 0, 0, width, height);

    const outputType = "image/jpeg";
    const qualities = [0.86, 0.78, 0.68, 0.58, 0.48, 0.38];
    let bestBlob: Blob | null = null;

    for (const quality of qualities) {
      const blob = await canvasToBlob(canvas, outputType, quality);
      bestBlob = blob;
      if (blob.size <= options.uploadMaxBytes) {
        return new File([blob], replaceImageExtension(file.name, outputType), {
          type: outputType,
          lastModified: Date.now(),
        });
      }
    }

    if (bestBlob && bestBlob.size <= SERVER_SAFE_UPLOAD_MAX) {
      return new File([bestBlob], replaceImageExtension(file.name, outputType), {
        type: outputType,
        lastModified: Date.now(),
      });
    }

    throw new Error("图片压缩后仍过大，请换一张较小的图片");
  } finally {
    image.cleanup();
  }
}

function getUploadErrorMessage(error: unknown): string {
  const maybeAxios = error as {
    code?: string;
    response?: { status?: number; data?: { message?: unknown } };
  };
  const serverMessage = maybeAxios.response?.data?.message;
  if (typeof serverMessage === "string" && serverMessage.trim()) {
    return serverMessage.trim();
  }
  if (maybeAxios.response?.status === 413) {
    return "图片过大，请换一张较小的图片";
  }
  if (maybeAxios.response?.status === 502 || maybeAxios.response?.status === 504) {
    return "上传失败，请重试";
  }
  if (error instanceof Error && error.message.startsWith("图片")) {
    return error.message;
  }
  if (!maybeAxios.response || maybeAxios.code === "ERR_NETWORK") {
    return "上传失败，请重试";
  }
  if (error instanceof Error && !/^Request failed with status code/i.test(error.message)) {
    return error.message;
  }
  return "上传失败，请重试";
}

/**
 * 根据 kind 派发到具体上传函数
 */
async function dispatchUpload(kind: ImageUploadKind, file: File): Promise<string> {
  switch (kind) {
    case "avatar": {
      const res = await userApi.uploadAvatar(file);
      const avatarUrl = res.avatarUrl || res.data?.avatarUrl || res.data?.url || res.url;
      if (!res.success || !avatarUrl) throw new Error(res.message || "上传失败");
      return avatarUrl;
    }
    case "merchant-avatar": {
      const res = await uploadMerchantAvatar(file);
      if (!res.success || !res.data?.url) throw new Error(res.message || "上传失败");
      return res.data.url;
    }
    case "photo": {
      const res = await userApi.uploadPhoto(file);
      if (!res.success || !res.url) throw new Error("上传失败");
      return res.url;
    }
    case "cover":
    case "recap":
      // 二者都用活动图片 bucket
      return uploadCoverImage(file);
    case "enrollment":
      throw new Error("报名图片需要提供专用上传函数");
  }
}

export function useImageUpload(opts: Options) {
  const {
    kind,
    maxBytes = DEFAULT_SOURCE_MAX,
    uploadMaxBytes = DEFAULT_UPLOAD_MAX,
    maxDimension = getDefaultMaxDimension(kind),
    showToastOnError = true,
    upload,
    revokePreviewOnSettled = true,
    allowedMimeTypes,
    allowedExtensions,
    formatErrorMessage = "请选择图片文件",
    sizeErrorMessage,
  } = opts;

  const uploadWithPreview = useCallback(
    (file: File, onPhaseChange?: (phase: "uploading") => void): UploadHandle => {
      // 1) 前置校验
      if (!isAllowedImageFile(file, allowedMimeTypes, allowedExtensions)) {
        if (showToastOnError) {
          Toast.show({ icon: "fail", content: formatErrorMessage });
        }
        // 仍返回一个 handle，但 promise reject；tempUrl 用空字符串避免污染列表
        return rejectedUploadHandle("file is not image");
      }
      if (file.size > maxBytes) {
        const message =
          sizeErrorMessage ||
          `图片大小不能超过 ${(maxBytes / 1024 / 1024).toFixed(0)}MB`;
        if (showToastOnError) {
          Toast.show({
            icon: "fail",
            content: message,
          });
        }
        return rejectedUploadHandle("file too large");
      }

      // 2) 立即生成 blob URL 给调用方做预览
      const tempUrl = URL.createObjectURL(file);
      let previewReleased = false;
      const releasePreview = () => {
        if (previewReleased) return;
        previewReleased = true;
        URL.revokeObjectURL(tempUrl);
      };

      // 3) 异步压缩并上传，settle 时统一 revoke
      const finalUrlPromise = withTimeout(
        optimizeImageForUpload(file, { maxDimension, uploadMaxBytes }),
        30_000,
        "图片处理超时，请重试或换一张图片",
      )
        .then((uploadFile) => {
          onPhaseChange?.("uploading");
          return upload ? upload(uploadFile) : dispatchUpload(kind, uploadFile);
        })
        .then((realUrl) => {
          if (revokePreviewOnSettled) releasePreview();
          return realUrl;
        })
        .catch((err) => {
          if (revokePreviewOnSettled) releasePreview();
          if (showToastOnError) {
            Toast.show({
              icon: "fail",
              content: getUploadErrorMessage(err),
            });
          }
          throw err;
        });

      return { tempUrl, finalUrlPromise, releasePreview };
    },
    [
      allowedExtensions,
      allowedMimeTypes,
      formatErrorMessage,
      kind,
      maxBytes,
      maxDimension,
      revokePreviewOnSettled,
      showToastOnError,
      sizeErrorMessage,
      upload,
      uploadMaxBytes,
    ],
  );

  return { uploadWithPreview };
}
