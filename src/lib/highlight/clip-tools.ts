// Chạy ở TRÌNH DUYỆT của khách (ffmpeg.wasm): video không rời khỏi máy khách.
import type { FFmpeg } from "@ffmpeg/ffmpeg";

// ffmpeg-core.wasm nặng ~30MB, vượt giới hạn tệp tĩnh của hosting nên tải từ CDN khi cần.
const CORE_BASE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";

let ffmpegPromise: Promise<FFmpeg> | null = null;
let mounted = false;
const INPUT_DIR = "/in";

export function getFfmpeg(): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import("@ffmpeg/ffmpeg"), import("@ffmpeg/util")]);
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({
        coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
      });
      return ffmpeg;
    })().catch((e) => {
      ffmpegPromise = null;
      throw e;
    });
  }
  return ffmpegPromise;
}

/** Gắn file của khách vào ffmpeg mà không chép cả file vào bộ nhớ. Trả về đường dẫn trong ffmpeg. */
export async function mountInput(file: File): Promise<string> {
  const ffmpeg = await getFfmpeg();
  if (mounted) {
    await ffmpeg.unmount(INPUT_DIR).catch(() => undefined);
    await ffmpeg.deleteDir(INPUT_DIR).catch(() => undefined);
  }
  const ext = (file.name.match(/\.[A-Za-z0-9]{2,5}$/)?.[0] ?? ".mp4").toLowerCase();
  const name = `input${ext}`;
  await ffmpeg.createDir(INPUT_DIR);
  await ffmpeg.mount("WORKERFS" as never, { files: [new File([file], name)] }, INPUT_DIR);
  mounted = true;
  return `${INPUT_DIR}/${name}`;
}

export function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      Number.isFinite(video.duration) ? resolve(video.duration) : reject(new Error("Không đọc được độ dài video."));
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Không đọc được video. Thử file MP4 hoặc MOV."));
    };
    video.src = url;
  });
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function run(ffmpeg: FFmpeg, args: string[]) {
  const code = await ffmpeg.exec(args);
  if (code !== 0) throw new Error("FFmpeg báo lỗi khi xử lý video.");
}

/** Tách âm thanh thô (số thực 16kHz mono) từng đoạn `chunkSec` giây cho bộ gỡ băng chạy trên trình duyệt. */
export async function forEachRawAudioChunk(
  inputPath: string,
  durationSec: number,
  chunkSec: number,
  onChunk: (audio: Float32Array, offsetSec: number, index: number, total: number) => Promise<void>,
) {
  const ffmpeg = await getFfmpeg();
  const total = Math.ceil(durationSec / chunkSec);
  for (let i = 0; i < total; i++) {
    const offset = i * chunkSec;
    const out = `raw-${i}.f32`;
    await run(ffmpeg, ["-ss", String(offset), "-t", String(chunkSec), "-i", inputPath, "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", out]);
    const data = (await ffmpeg.readFile(out)) as Uint8Array;
    await ffmpeg.deleteFile(out);
    const copy = new Uint8Array(data); // bản sao riêng để chuyển sang worker
    await onChunk(new Float32Array(copy.buffer, 0, Math.floor(copy.byteLength / 4)), offset, i, total);
  }
}

/** Tách âm thanh từng đoạn `chunkSec` giây (mono, mp3 nhỏ) và đưa cho `onChunk` lần lượt. */
export async function forEachAudioChunk(
  inputPath: string,
  durationSec: number,
  chunkSec: number,
  onChunk: (audioBase64: string, offsetSec: number, index: number, total: number) => Promise<void>,
) {
  const ffmpeg = await getFfmpeg();
  const total = Math.ceil(durationSec / chunkSec);
  for (let i = 0; i < total; i++) {
    const offset = i * chunkSec;
    const out = `chunk-${i}.mp3`;
    await run(ffmpeg, [
      "-ss", String(offset), "-t", String(chunkSec), "-i", inputPath,
      "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", out,
    ]);
    const data = (await ffmpeg.readFile(out)) as Uint8Array;
    await ffmpeg.deleteFile(out);
    await onChunk(toBase64(data), offset, i, total);
  }
}

export type AspectRatio = "original" | "16:9" | "9:16";

// Cắt giữa khung theo tỉ lệ rồi đưa về cỡ chuẩn (đã là số chẵn).
function ratioFilter(ratio: Exclude<AspectRatio, "original">, faceX: number | null): string {
  if (ratio === "16:9") return "crop='min(iw,ih*16/9)':'min(ih,iw*9/16)',scale=1280:720,setsar=1";
  // Cắt dọc: giữa khung, hoặc bám theo khuôn mặt (faceX từ 0 đến 1) nếu tìm thấy.
  const centre = faceX === null ? "iw/2" : `iw*${Math.min(1, Math.max(0, faceX)).toFixed(4)}`;
  return `crop='min(iw,ih*9/16)':'min(ih,iw*16/9)':'min(max(${centre}-out_w/2,0),iw-out_w)':0,scale=720:1280,setsar=1`;
}

/**
 * Cắt 1 clip. Giữ khung gốc: sao chép luồng (rất nhanh, điểm bắt đầu có thể lệch vài giây).
 * Đổi tỉ lệ 16:9 / 9:16: phải nén lại video nên chậm hơn nhưng cắt đúng mốc.
 */
export async function cutClip(
  inputPath: string,
  startSec: number,
  endSec: number,
  ratio: AspectRatio = "original",
  onProgress?: (fraction: number) => void,
  faceX: number | null = null,
): Promise<Blob> {
  const ffmpeg = await getFfmpeg();
  const out = `clip-${Math.round(startSec)}.mp4`;
  const base = ["-ss", String(startSec), "-i", inputPath, "-t", (endSec - startSec).toFixed(2)];
  const codec =
    ratio === "original"
      ? ["-c", "copy", "-avoid_negative_ts", "make_zero"]
      : [
          "-vf", ratioFilter(ratio, faceX),
          "-c:v", "libx264", "-preset", "ultrafast", "-crf", "26", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
        ];
  const handler = ({ progress }: { progress: number }) => onProgress?.(Math.min(1, Math.max(0, progress)));
  ffmpeg.on("progress", handler);
  try {
    await run(ffmpeg, [...base, ...codec, out]);
  } finally {
    ffmpeg.off("progress", handler);
  }
  const data = (await ffmpeg.readFile(out)) as Uint8Array;
  await ffmpeg.deleteFile(out);
  return new Blob([new Uint8Array(data)], { type: "video/mp4" });
}

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi)(\?|#|$)/i;

/** Tải video từ link trực tiếp ngay trong trình duyệt của khách. Lỗi nếu máy chủ video không cho phép (CORS). */
export async function loadVideoFromUrl(
  url: string,
  maxBytes: number,
  onProgress?: (fraction: number | null) => void,
  options?: { headers?: Record<string, string>; fileName?: string },
): Promise<File> {
  let res: Response;
  try {
    res = await fetch(url, options?.headers ? { headers: options.headers } : undefined);
  } catch {
    throw new Error(
      "Không tải được video từ link này (máy chủ chứa video không cho phép web đọc trực tiếp). Hãy tải file về máy rồi chọn file.",
    );
  }
  if (!res.ok) {
    // Cầu nối trả lời bằng câu tiếng Việt dễ hiểu; link thường thì chỉ báo mã lỗi.
    const detail = options?.headers ? (await res.text().catch(() => "")).slice(0, 200) : "";
    throw new Error(detail || `Link báo lỗi (${res.status}). Kiểm tra lại link.`);
  }
  const type = res.headers.get("content-type") ?? "";
  if (!type.startsWith("video/") && !VIDEO_EXT.test(url) && !options?.fileName) {
    throw new Error("Link này không phải file video trực tiếp (.mp4, .mov, .webm...).");
  }
  const total = Number(res.headers.get("content-length")) || 0;
  if (total > maxBytes) throw new Error("Video lớn hơn 2GB. Hãy chọn video nhỏ hơn.");
  if (!res.body) throw new Error("Trình duyệt không hỗ trợ tải video từ link.");

  const reader = res.body.getReader();
  const parts: BlobPart[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    received += value.length;
    if (received > maxBytes) {
      await reader.cancel();
      throw new Error("Video lớn hơn 2GB. Hãy chọn video nhỏ hơn.");
    }
    onProgress?.(total ? received / total : null);
  }
  const rawName = options?.fileName ?? decodeURIComponent(new URL(url).pathname.split("/").pop() || "video");
  const name = VIDEO_EXT.test(rawName) ? rawName : `${rawName}.mp4`;
  return new File(parts, name, { type: type.startsWith("video/") ? type : "video/mp4" });
}
