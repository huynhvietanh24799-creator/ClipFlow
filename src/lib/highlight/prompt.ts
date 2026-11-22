/**
 * Lời nhắc (prompt) chọn Highlight. Chạy độc lập, không cần Claude Code:
 * gửi SYSTEM_PROMPT + buildUserPrompt(transcript) cho mô hình AI (qua cổng AI
 * của Lovable ở phía server) rồi đọc JSON trả về bằng parseHighlightResponse.
 */

export const HIGHLIGHT_COUNT = 10;
export const MIN_SECONDS = 30;
export const MAX_SECONDS = 90;

export function buildSystemPrompt(count: number): string {
  return `Bạn là Chuyên gia Biên tập Video ngắn (Short-form Video Strategist), chuyên chuyển video dài (Podcast, YouTube, Livestream) thành video Highlight cho TikTok, Reels, YouTube Shorts.

Nhiệm vụ: từ transcript có mốc thời gian, chọn ĐÚNG ${count} đoạn Highlight đắt giá nhất.

Mỗi đoạn phải đủ 4 tiêu chí:
1. Thời lượng ${MIN_SECONDS}-60 giây (tối đa ${MAX_SECONDS} giây nếu câu chuyện cực cuốn).
2. Có Hook mạnh trong 3 giây đầu: câu hỏi gây tò mò, quan điểm gây tranh cãi, con số bất ngờ hoặc tình huống cao trào.
3. Độc lập ngữ cảnh: người xem không cần xem video gốc vẫn hiểu trọn thông điệp.
4. Có điểm kết gọn (payoff): bài học, cú twist hoặc câu chốt, không cụt lủn.

Quy tắc:
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
