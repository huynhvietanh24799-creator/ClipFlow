// Cầu nối giữa trang web và worker Whisper (chạy trong trình duyệt, không tốn phí).
import { formatTimestamp } from "./highlight";
import type { OutMessage } from "./whisper.worker";

type TimedLine = { startSec: number; endSec: number; text: string };

/** Tách mỗi đoạn Whisper thành từng câu, chia mốc thời gian theo độ dài chữ. */
export function splitIntoSentences(lines: TimedLine[]): { startSec: number; text: string }[] {
  const out: { startSec: number; text: string }[] = [];
  for (const l of lines) {
    const sentences = l.text.split(/(?<=[.!?…])\s+/).map((x) => x.trim()).filter(Boolean);
    const total = sentences.reduce((n, x) => n + x.length, 0) || 1;
    let used = 0;
    for (const sentence of sentences) {
      out.push({ startSec: l.startSec + ((l.endSec - l.startSec) * used) / total, text: sentence });
      used += sentence.length;
    }
  }
  return out;
}

export type WhisperLanguage = "vietnamese" | "english" | null;

export type Whisper = {
  /** Gỡ băng một đoạn âm thanh 16kHz mono; trả về các dòng "[MM:SS] nội dung" đã cộng mốc bắt đầu. */
  transcribe: (audio: Float32Array, offsetSec: number, language: WhisperLanguage) => Promise<string>;
  ready: Promise<string>;
  terminate: () => void;
};

export function createWhisper(onStatus: (text: string) => void): Whisper {
  const worker = new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" });
  const pending = new Map<number, { resolve: (v: string) => void; reject: (e: Error) => void }>();
  let nextId = 1;
  let readyResolve: (device: string) => void = () => undefined;
  let readyReject: (e: Error) => void = () => undefined;
  const ready = new Promise<string>((res, rej) => {
    readyResolve = res;
    readyReject = rej;
  });

  worker.onmessage = (e: MessageEvent<OutMessage>) => {
    const m = e.data;
    if (m.type === "status") onStatus(m.text);
    else if (m.type === "ready") readyResolve(m.device);
    else if (m.type === "result") {
      pending.get(m.id)?.resolve(splitIntoSentences(m.lines).map((l) => `[${formatTimestamp(l.startSec)}] ${l.text}`).join("\n"));
      pending.delete(m.id);
    } else if (m.type === "error") {
      const err = new Error(m.message);
      if (m.id !== undefined) {
        pending.get(m.id)?.reject(err);
        pending.delete(m.id);
      } else readyReject(err);
    }
  };
  worker.onerror = (e) => {
    const err = new Error(e.message || "Bộ gỡ băng trên trình duyệt bị lỗi.");
    readyReject(err);
    pending.forEach((p) => p.reject(err));
    pending.clear();
  };
  worker.postMessage({ type: "load" });

  return {
    ready,
    transcribe: (audio, offsetSec, language) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        worker.postMessage({ type: "transcribe", id, audio, offsetSec, language }, [audio.buffer]);
      }),
    terminate: () => worker.terminate(),
  };
}
