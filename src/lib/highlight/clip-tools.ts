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
const RATIO_FILTER: Record<Exclude<AspectRatio, "original">, string> = {
  "16:9": "crop='min(iw,ih*16/9)':'min(ih,iw*9/16)',scale=1280:720,setsar=1",
  "9:16": "crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',scale=720:1280,setsar=1",
};

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
): Promise<Blob> {
  const ffmpeg = await getFfmpeg();
  const out = `clip-${Math.round(startSec)}.mp4`;
  const base = ["-ss", String(startSec), "-i", inputPath, "-t", (endSec - startSec).toFixed(2)];
  const codec =
    ratio === "original"
      ? ["-c", "copy", "-avoid_negative_ts", "make_zero"]
      : [
          "-vf", RATIO_FILTER[ratio],
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
