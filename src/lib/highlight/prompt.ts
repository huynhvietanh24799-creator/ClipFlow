/**
 * Lời nhắc (prompt) chọn Highlight. Chạy độc lập, không cần Claude Code:
 * gửi SYSTEM_PROMPT + buildUserPrompt(transcript) cho mô hình AI (qua cổng AI
 * của Lovable ở phía server) rồi đọc JSON trả về bằng parseHighlightResponse.
 */

export const HIGHLIGHT_COUNT = 10;
export const MIN_SECONDS = 30;
export const MAX_SECONDS = 90;

export function buildSystemPrompt(count: number, minSec: number = MIN_SECONDS, maxSec: number = MAX_SECONDS): string {
  return `Bạn là Chuyên gia Biên tập Video ngắn (Short-form Video Strategist), chuyên chuyển video dài (Podcast, YouTube, Livestream) thành video Highlight cho TikTok, Reels, YouTube Shorts.

Nhiệm vụ: từ transcript có mốc thời gian, chọn ĐÚNG ${count} đoạn Highlight đắt giá nhất.

Định nghĩa Highlight: phân đoạn ngắn, đắt giá nhất, đứng độc lập và thu hút người xem ngay. Một đoạn chỉ được chọn khi đáp ứng ít nhất 2 trong 4 yếu tố (càng nhiều càng tốt):
1. Hook mạnh: 3-5 giây đầu là câu hỏi gây tò mò, phát ngôn gây tranh cãi, con số bất ngờ, hoặc tình huống kịch tính / đánh trúng nỗi đau người nghe.
2. Giá trị cao: chứa bí quyết, bài học đắt giá, góc nhìn mới lạ hoặc câu trả lời dứt điểm cho một vấn đề cụ thể.
3. Cảm xúc mạnh: sắc thái thay đổi rõ (hài hước, bất ngờ, bức xúc, truyền cảm hứng, tranh luận gay gắt).
4. Trọn vẹn ý: có mở đầu, diễn biến và kết luận (bài học, cú twist hoặc câu chốt); người xem không cần xem video gốc vẫn hiểu.

Quy tắc kỹ thuật:
- Thời lượng từ ${minSec} đến ${maxSec} giây (endSec - startSec phải nằm trong khoảng này).
- Điểm cắt sạch: bắt đầu ở đầu một câu/ý hoàn chỉnh, kết thúc khi ý đã trọn vẹn, không cắt cụt giữa chừng.
- Bỏ đoạn chào hỏi, giới thiệu rườm rà, khoảng lặng dài, từ đệm không mang nghĩa.
- Mốc thời gian phải lấy từ transcript, cắt đúng ranh giới câu.
- hook phải trích NGUYÊN VĂN từ transcript, không bịa.
- Các đoạn không được chồng mốc thời gian hoặc trùng ý.
- Viết tiếng Việt. Chỉ trả về JSON, không giải thích thêm.

Định dạng JSON:
{"highlights":[{"title":"tiêu đề giật tít","startSec":0,"endSec":0,"viralScore":1-10,"viralReason":"lý do ngắn","hook":"câu mở đầu nguyên văn","summary":"1-2 câu","editTips":"gợi ý dựng: B-roll, chữ nhấn, nhịp cắt","caption":"1-2 dòng","hashtags":["#a","#b","#c"]}]}`;
}

export function buildUserPrompt(transcript: string, count: number): string {
  return `Transcript (mỗi dòng có dạng [MM:SS] nội dung):\n\n${transcript}\n\nChọn đúng ${count} đoạn Highlight. startSec/endSec tính bằng giây.`;
}

export const TRANSCRIBE_PROMPT =
  "Gỡ băng (chép lại lời nói) đoạn âm thanh này bằng đúng ngôn ngữ người nói. " +
  "Mỗi câu một dòng, dạng [MM:SS] nội dung, mốc tính từ đầu đoạn âm thanh. " +
  "Chỉ trả về transcript, không giải thích. Nếu không có lời nói, trả về dòng trống.";
