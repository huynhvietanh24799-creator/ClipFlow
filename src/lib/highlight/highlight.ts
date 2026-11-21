import { z } from "zod";
import { HIGHLIGHT_COUNT, MAX_SECONDS, MIN_SECONDS } from "./prompt";

export const highlightSchema = z.object({
  title: z.string().min(1),
  startSec: z.number().nonnegative(),
  endSec: z.number().positive(),
  viralScore: z.number().min(1).max(10),
  viralReason: z.string(),
  hook: z.string().min(1),
  summary: z.string(),
  editTips: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()).min(1),
});

export type Highlight = z.infer<typeof highlightSchema>;

/** "MM:SS" hoặc "H:MM:SS" -> giây. Trả về null nếu sai định dạng. */
export function parseTimestamp(text: string): number | null {
  const m = text.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = m[1] ? Number(m[1]) : 0;
  return h * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Giây -> "MM:SS" (hoặc "H:MM:SS" nếu quá 1 giờ). */
export function formatTimestamp(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`;
}

/** Đọc JSON mô hình AI trả về (chịu được khung ```json). Ném lỗi nếu sai cấu trúc. */
export function parseHighlightResponse(raw: string): Highlight[] {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Phản hồi AI không có JSON.");
  const json = JSON.parse(cleaned.slice(start, end + 1));
  return z.object({ highlights: z.array(highlightSchema) }).parse(json).highlights;
}

/** Trả về danh sách lỗi (rỗng = đạt). Kiểm: đủ 10, độ dài, không chồng mốc, không vượt video. */
export function validateHighlights(list: Highlight[], videoDurationSec?: number): string[] {
  const errors: string[] = [];
  if (list.length !== HIGHLIGHT_COUNT) {
    errors.push(`Cần đúng ${HIGHLIGHT_COUNT} đoạn, đang có ${list.length}.`);
  }
  list.forEach((h, i) => {
    const n = i + 1;
    const len = h.endSec - h.startSec;
    if (len < MIN_SECONDS || len > MAX_SECONDS) {
      errors.push(`Đoạn ${n}: dài ${Math.round(len)}s, cần ${MIN_SECONDS}-${MAX_SECONDS}s.`);
    }
    if (videoDurationSec !== undefined && h.endSec > videoDurationSec) {
      errors.push(`Đoạn ${n}: vượt quá độ dài video.`);
    }
  });
  const sorted = [...list].sort((a, b) => a.startSec - b.startSec);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (cur.startSec < prev.endSec) {
      errors.push(`Hai đoạn chồng mốc: ${formatTimestamp(prev.startSec)} và ${formatTimestamp(cur.startSec)}.`);
    }
  }
  return errors;
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Lệnh FFmpeg cắt hàng loạt 10 đoạn. Chạy trên máy/worker có FFmpeg, không chạy trong trình duyệt. */
export function buildFfmpegCommands(inputPath: string, list: Highlight[], outDir = "out"): string[] {
  return list.map((h, i) => {
    const name = `${outDir}/highlight-${String(i + 1).padStart(2, "0")}.mp4`;
    const dur = (h.endSec - h.startSec).toFixed(2);
    return `ffmpeg -y -ss ${h.startSec} -i ${shellQuote(inputPath)} -t ${dur} -c:v libx264 -c:a aac ${shellQuote(name)}`;
  });
}
