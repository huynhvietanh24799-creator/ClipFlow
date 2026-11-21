import { describe, expect, it } from "vitest";
import {
  buildFfmpegCommands,
  formatTimestamp,
  parseHighlightResponse,
  parseTimestamp,
  validateHighlights,
  type Highlight,
} from "./highlight";

const make = (i: number): Highlight => ({
  title: `Đoạn ${i}`,
  startSec: i * 100,
  endSec: i * 100 + 45,
  viralScore: 8,
  viralReason: "hay",
  hook: "Câu hook",
  summary: "Tóm tắt",
  editTips: "Zoom",
  caption: "Caption",
  hashtags: ["#a", "#b", "#c"],
});
const ten = Array.from({ length: 10 }, (_, i) => make(i));

describe("highlight", () => {
  it("đổi mốc thời gian hai chiều", () => {
    expect(parseTimestamp("01:30")).toBe(90);
    expect(parseTimestamp("1:01:05")).toBe(3665);
    expect(parseTimestamp("abc")).toBeNull();
    expect(formatTimestamp(90)).toBe("01:30");
  });

  it("đọc JSON có khung ```json", () => {
    const raw = "```json\n" + JSON.stringify({ highlights: ten }) + "\n```";
    expect(parseHighlightResponse(raw)).toHaveLength(10);
  });

  it("báo lỗi khi phản hồi không phải JSON", () => {
    expect(() => parseHighlightResponse("xin chào")).toThrow();
  });

  it("danh sách hợp lệ thì không có lỗi", () => {
    expect(validateHighlights(ten, 2000)).toEqual([]);
  });

  it("bắt lỗi thiếu đoạn, quá ngắn, chồng mốc", () => {
    const bad = ten.slice(0, 9);
    bad[0] = { ...bad[0]!, endSec: bad[0]!.startSec + 10 };
    bad[1] = { ...bad[1]!, startSec: 230, endSec: 280 };
    const errors = validateHighlights(bad);
    expect(errors.some((e) => e.includes("đúng 10"))).toBe(true);
    expect(errors.some((e) => e.includes("Đoạn 1"))).toBe(true);
    expect(errors.some((e) => e.includes("chồng"))).toBe(true);
  });

  it("tạo đủ 10 lệnh FFmpeg", () => {
    const cmds = buildFfmpegCommands("video gốc.mp4", ten);
    expect(cmds).toHaveLength(10);
    expect(cmds[0]).toContain("-ss 0 -i 'video gốc.mp4' -t 45.00");
  });
});
