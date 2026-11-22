// Chọn Highlight bằng thuật toán chấm điểm: miễn phí, chạy ngay trên trình duyệt, không cần AI.
// Ý tưởng theo AI-Youtube-Shorts-Generator (MIT): hook, giá trị, cảm xúc, trọn ý; loại đoạn trùng.
import { formatTimestamp, parseTimestamp, type DurationRange, type Highlight } from "./highlight";

export type Segment = { start: number; end: number; text: string };

const DEFAULT_TAIL_SEC = 4;

/** Đọc transcript dạng "[MM:SS] nội dung" thành các đoạn có mốc bắt đầu/kết thúc. */
export function parseSegments(transcript: string, totalSec?: number): Segment[] {
  const rows: { start: number; text: string }[] = [];
  for (const line of transcript.split("\n")) {
    const m = line.trim().match(/^\[((?:\d+:)?\d{1,2}:\d{2})\]\s*(.+)$/);
    if (!m) continue;
    const start = parseTimestamp(m[1]!);
    if (start === null) continue;
    rows.push({ start, text: m[2]!.trim() });
  }
  rows.sort((a, b) => a.start - b.start);
  return rows.map((r, i) => {
    const next = rows[i + 1]?.start;
    const cap = totalSec ?? Infinity;
    const end = Math.min(cap, next ?? r.start + DEFAULT_TAIL_SEC);
    return { start: r.start, end: Math.max(end, r.start + 1), text: r.text };
  });
}

const HOOK_WORDS = [
  "bí quyết", "bí mật", "sai lầm", "thật ra", "sự thật", "đừng", "không ai", "tại sao", "vì sao",
  "làm sao", "cách để", "mẹo", "nguy hiểm", "đáng sợ", "cực kỳ", "kinh khủng", "bất ngờ", "không thể tin",
  "triệu", "tỷ", "tuyệt đối", "quan trọng nhất", "duy nhất", "lần đầu", "cuối cùng", "thay đổi",
];
const VALUE_WORDS = [
  "bài học", "kinh nghiệm", "quy tắc", "nguyên tắc", "bước", "công thức", "chìa khóa", "lời khuyên",
  "kết quả", "hiệu quả", "thành công", "thất bại", "kiếm tiền", "tiết kiệm", "học được", "nhớ rằng",
];
const EMOTION_WORDS = [
  "ha ha", "hahaha", "trời ơi", "thật sự", "sốc", "tức", "khóc", "cười", "yêu", "ghét", "sợ", "tuyệt vời",
  "không ngờ", "bất ngờ", "xúc động", "tự hào",
];
const FILLER_STARTS = [
  "xin chào", "chào các bạn", "chào mọi người", "hôm nay mình", "hôm nay chúng ta", "trước khi bắt đầu",
  "đầu tiên là", "như các bạn biết", "à", "ừ", "ờ", "thì", "mà",
];
const ENDING_WORDS = ["vậy nên", "tóm lại", "cuối cùng", "nhớ nhé", "đó là", "bài học", "kết luận", "thế thôi"];

function countMatches(text: string, words: string[]): number {
  const t = text.toLowerCase();
  return words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
}

function endsSentence(text: string): boolean {
  return /[.!?…]["”')\]]?$/.test(text.trim());
}

type Window = { from: number; to: number; start: number; end: number; score: number; reasons: string[] };

function scoreWindow(segs: Segment[], from: number, to: number): { score: number; reasons: string[] } {
  const all = segs.slice(from, to + 1).map((s) => s.text).join(" ");
  const reasons: string[] = [];
  let score = 0;

  const first = segs[from]!.text.toLowerCase();
  if (FILLER_STARTS.some((f) => first.startsWith(f))) score -= 3;

  // Hook tính đủ điểm ở câu đầu, nửa điểm ở câu thứ hai (để đoạn bắt đầu đúng chỗ hook).
  const hookParts = [
    { text: segs[from]!.text, weight: 1 },
    { text: segs[from + 1]?.text ?? "", weight: 0.5 },
  ];
  let sawQuestion = false;
  let sawNumber = false;
  let sawHook = false;
  for (const { text, weight } of hookParts) {
    if (/\?/.test(text)) {
      score += 3 * weight;
      sawQuestion = true;
    }
    if (/\d/.test(text)) {
      score += 2 * weight;
      sawNumber = true;
    }
    const hook = countMatches(text, HOOK_WORDS);
    if (hook) {
      score += 2 * Math.min(hook, 2) * weight;
      sawHook = true;
    }
  }
  if (sawQuestion) reasons.push("mở đầu bằng câu hỏi gây tò mò");
  if (sawNumber) reasons.push("có con số ngay đầu đoạn");
  if (sawHook) reasons.push("câu mở đầu có từ khóa gây chú ý");
  const value = countMatches(all, VALUE_WORDS);
  if (value) {
    score += Math.min(value, 4);
    reasons.push("chứa bài học hoặc lời khuyên");
  }
  const emotion = countMatches(all, EMOTION_WORDS) + (all.match(/!/g)?.length ?? 0);
  if (emotion) {
    score += Math.min(emotion, 4);
    reasons.push("có cảm xúc rõ rệt");
  }
  const nums = all.match(/\d+/g)?.length ?? 0;
  if (nums >= 2) score += 1;

  const last = segs[to]!.text.toLowerCase();
  if (endsSentence(last)) score += 1.5;
  if (ENDING_WORDS.some((w) => last.includes(w))) {
    score += 2;
    reasons.push("kết bằng câu chốt");
  }

  // Phạt khoảng lặng dài giữa các câu và đoạn nói quá thưa.
  let silent = 0;
  for (let i = from + 1; i <= to; i++) silent += Math.max(0, segs[i]!.start - segs[i - 1]!.end);
  const dur = segs[to]!.end - segs[from]!.start;
  if (dur > 0 && silent / dur > 0.2) score -= 2;
  const words = all.split(/\s+/).length;
  if (dur > 0 && words / dur < 1.2) score -= 1.5;

  return { score, reasons };
}

function shorten(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Chọn tối đa `count` đoạn điểm cao nhất, không chồng nhau, độ dài trong `range`.
 * Mỗi đoạn bắt đầu ở đầu một câu và kết thúc ở cuối một câu.
 */
export function rankHighlights(segs: Segment[], count: number, range: DurationRange): Highlight[] {
  const windows: Window[] = [];
  for (let i = 0; i < segs.length; i++) {
    const prevEnds = i === 0 || endsSentence(segs[i - 1]!.text) || segs[i]!.start - segs[i - 1]!.end > 1.5;
    if (!prevEnds) continue;
    const start = segs[i]!.start;
    let best: number | null = null;
    for (let j = i; j < segs.length; j++) {
      const dur = segs[j]!.end - start;
      if (dur > range.maxSec) break;
      if (dur >= range.minSec && endsSentence(segs[j]!.text)) {
        best = j; // lấy điểm kết gần nhất đủ độ dài
        break;
      }
      if (dur >= range.minSec && best === null) best = j;
    }
    if (best === null) continue;
    const { score, reasons } = scoreWindow(segs, i, best);
    windows.push({ from: i, to: best, start, end: segs[best]!.end, score, reasons });
  }

  windows.sort((a, b) => b.score - a.score);
  const chosen: Window[] = [];
  for (const w of windows) {
    if (chosen.length >= count) break;
    if (chosen.some((c) => w.start < c.end && w.end > c.start)) continue;
    chosen.push(w);
  }
  chosen.sort((a, b) => a.start - b.start);
  if (chosen.length === 0) return [];

  const top = Math.max(...chosen.map((c) => c.score));
  const low = Math.min(...chosen.map((c) => c.score));
  return chosen.map((w) => {
    const hook = segs[w.from]!.text;
    const second = segs[w.from + 1]?.text ?? "";
    const norm = top === low ? 7 : 5 + ((w.score - low) / (top - low)) * 4;
    const reasons = w.reasons.length ? w.reasons : ["đoạn trọn ý, điểm cắt sạch"];
    return {
      title: shorten(hook, 60),
      startSec: Math.round(w.start),
      endSec: Math.round(w.end),
      viralScore: Math.max(1, Math.min(10, Math.round(norm))),
      viralReason: `Chấm điểm tự động: ${reasons.join("; ")}.`,
      hook: shorten(hook, 160),
      summary: shorten(`${hook} ${second}`, 200),
      editTips: `Chữ lớn nổi bật câu mở đầu (${formatTimestamp(w.start)}); thêm phụ đề chạy theo lời; cắt bỏ khoảng lặng.`,
      caption: shorten(hook, 120),
      hashtags: ["#highlight", "#shorts", "#xuhuong"],
    };
  });
}
