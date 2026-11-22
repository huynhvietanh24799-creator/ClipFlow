import { describe, expect, it } from "vitest";
import { parseSegments, rankHighlights } from "./local-ranker";
import { validateHighlights } from "./highlight";

// 8 phút nói, mỗi 10 giây một câu; chèn 2 đoạn hấp dẫn.
function build(): string {
  const lines: string[] = [];
  for (let i = 0; i < 48; i++) {
    const t = i * 10;
    const mm = String(Math.floor(t / 60)).padStart(2, "0");
    const ss = String(t % 60).padStart(2, "0");
    let text = "Đây là một câu nói bình thường về công việc hằng ngày.";
    if (i === 0) text = "Xin chào các bạn, hôm nay mình chia sẻ vài chuyện.";
    if (i === 10) text = "Tại sao 90% người làm video ngắn đều mắc sai lầm này?";
    if (i === 13) text = "Bài học quan trọng nhất là đừng bỏ cuộc, nhớ nhé!";
    if (i === 30) text = "Bí mật để kiếm 100 triệu mỗi tháng là gì?";
    if (i === 33) text = "Tóm lại, kết quả đến từ kiên trì và bài học mỗi ngày.";
    lines.push(`[${mm}:${ss}] ${text}`);
  }
  return lines.join("\n");
}

describe("local-ranker", () => {
  const range = { minSec: 30, maxSec: 60 };
  const segs = parseSegments(build(), 480);

  it("đọc transcript thành đoạn có mốc", () => {
    expect(segs).toHaveLength(48);
    expect(segs[1]!.start).toBe(10);
    expect(segs[1]!.end).toBe(20);
  });

  it("chọn đúng số đoạn, không chồng, đủ độ dài", () => {
    const list = rankHighlights(segs, 2, range);
    expect(list).toHaveLength(2);
    expect(validateHighlights(list, 480, 2, range)).toEqual([]);
  });

  it("ưu tiên đoạn có câu hỏi và con số ở đầu", () => {
    const list = rankHighlights(segs, 2, range);
    const starts = list.map((h) => h.startSec);
    expect(starts).toContain(100);
    expect(starts).toContain(300);
  });

  it("trả về ít hơn nếu không đủ đoạn", () => {
    expect(rankHighlights(segs, 20, { minSec: 60, maxSec: 90 }).length).toBeLessThan(20);
    expect(rankHighlights([], 3, range)).toEqual([]);
  });
});

import { splitIntoSentences } from "./whisper-client";
describe("splitIntoSentences", () => {
  it("chia câu và mốc thời gian theo độ dài chữ", () => {
    const out = splitIntoSentences([{ startSec: 10, endSec: 30, text: "Câu một ở đây. Câu hai dài hơn nhiều nhé!" }]);
    expect(out).toHaveLength(2);
    expect(out[0]!.startSec).toBe(10);
    expect(out[1]!.startSec).toBeGreaterThan(10);
    expect(out[1]!.startSec).toBeLessThan(30);
  });
});
