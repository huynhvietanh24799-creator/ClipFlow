// Tìm vị trí khuôn mặt trong đoạn video để cắt dọc 9:16 bám theo người nói (miễn phí, chạy trên trình duyệt).
const MP_VERSION = "1.2.3";
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let detectorPromise: Promise<any> | null = null;

function getDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
      return FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.5,
      });
    })().catch((e) => {
      detectorPromise = null;
      throw e;
    });
  }
  return detectorPromise;
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Không tua được video.")), 8000);
    video.onseeked = () => {
      clearTimeout(timer);
      resolve();
    };
    video.currentTime = t;
  });
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Lấy mẫu vài khung hình trong [startSec, endSec], tìm khuôn mặt lớn nhất mỗi khung.
 * Trả về vị trí ngang trung vị của khuôn mặt (0 = mép trái, 1 = mép phải), hoặc null nếu không thấy mặt.
 */
export async function findFaceCenterX(file: File, startSec: number, endSec: number, samples = 6): Promise<number | null> {
  const detector = await getDetector();
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Không đọc được video để tìm khuôn mặt."));
    });
    const centers: number[] = [];
    for (let i = 0; i < samples; i++) {
      const t = startSec + ((endSec - startSec) * (i + 0.5)) / samples;
      await seek(video, t);
      const result = detector.detect(video);
      const faces: { boundingBox?: { originX: number; width: number; height: number } }[] = result.detections ?? [];
      const best = faces
        .filter((f) => f.boundingBox)
        .sort((a, b) => b.boundingBox!.width * b.boundingBox!.height - a.boundingBox!.width * a.boundingBox!.height)[0];
      if (best?.boundingBox && video.videoWidth > 0) {
        centers.push((best.boundingBox.originX + best.boundingBox.width / 2) / video.videoWidth);
      }
    }
    return centers.length >= Math.ceil(samples / 3) ? median(centers) : null;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
