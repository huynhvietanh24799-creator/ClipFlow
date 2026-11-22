// Chạy Whisper ngay trong trình duyệt (miễn phí). Tải mô hình từ Hugging Face lần đầu, sau đó lưu trong bộ nhớ trình duyệt.
import { env, pipeline } from "@huggingface/transformers";

env.allowLocalModels = false;
// Tệp wasm của onnxruntime tải từ CDN (cùng phiên bản với gói cài đặt).
const ORT_VERSION = "1.31.0-dev.20260914-8d85527a0";
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
}

type InMessage =
  | { type: "load" }
  | { type: "transcribe"; id: number; audio: Float32Array; offsetSec: number; language: string | null };

export type OutMessage =
  | { type: "status"; text: string }
  | { type: "ready"; device: string }
  | { type: "result"; id: number; lines: { startSec: number; endSec: number; text: string }[] }
  | { type: "error"; id?: number; message: string };

const MODEL = "onnx-community/whisper-base";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let asr: any = null;
let device = "wasm";

function post(m: OutMessage) {
  (self as unknown as Worker).postMessage(m);
}

async function load() {
  if (asr) return;
  const hasGpu = typeof navigator !== "undefined" && "gpu" in navigator;
  const progress = (p: { status?: string; progress?: number; file?: string }) => {
    if (p.status === "progress" && typeof p.progress === "number") {
      post({ type: "status", text: `Đang tải mô hình gỡ băng: ${Math.round(p.progress)}%` });
    }
  };
  if (hasGpu) {
    try {
      asr = await pipeline("automatic-speech-recognition", MODEL, {
        device: "webgpu",
        dtype: { encoder_model: "fp32", decoder_model_merged: "q4" },
        progress_callback: progress,
      });
      device = "webgpu";
      return;
    } catch {
      asr = null; // máy không dùng được WebGPU: chuyển sang CPU
    }
  }
  asr = await pipeline("automatic-speech-recognition", MODEL, {
    device: "wasm",
    dtype: "q8",
    progress_callback: progress,
  });
  device = "wasm";
}

self.onmessage = async (e: MessageEvent<InMessage>) => {
  const msg = e.data;
  try {
    if (msg.type === "load") {
      await load();
      post({ type: "ready", device });
      return;
    }
    await load();
    const options: Record<string, unknown> = {
      task: "transcribe",
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
    };
    if (msg.language) options["language"] = msg.language;
    const out = await asr(msg.audio, options);
    const chunks: { timestamp: [number, number | null]; text: string }[] = out.chunks ?? [];
    const lines = chunks
      .map((c) => {
        const start = (c.timestamp?.[0] ?? 0) + msg.offsetSec;
        const end = (c.timestamp?.[1] ?? c.timestamp?.[0] ?? 0) + msg.offsetSec;
        return { startSec: start, endSec: Math.max(end, start + 1), text: String(c.text ?? "").trim() };
      })
      .filter((l) => l.text.length > 0);
    post({ type: "result", id: msg.id, lines });
  } catch (err) {
    post({ type: "error", ...("id" in msg ? { id: msg.id } : {}), message: err instanceof Error ? err.message : String(err) });
  }
};
