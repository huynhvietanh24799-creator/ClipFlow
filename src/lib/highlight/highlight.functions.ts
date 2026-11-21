import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { parseHighlightResponse, validateHighlights, type Highlight } from "./highlight";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";

export type HighlightResult =
  | { ok: true; highlights: Highlight[]; warnings: string[] }
  | { ok: false; error: string };

/**
 * Chạy ở phía server (khóa AI không bao giờ xuống trình duyệt).
 * Khóa lấy từ biến môi trường LOVABLE_API_KEY do Lovable quản lý.
 */
export const generateHighlights = createServerFn({ method: "POST" })
  .inputValidator(z.object({ transcript: z.string().min(50).max(200_000) }))
  .handler(async ({ data }): Promise<HighlightResult> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      return { ok: false, error: "Chưa cấu hình khóa AI (LOVABLE_API_KEY) cho máy chủ." };
    }

    let response: Response;
    try {
      response = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env["HIGHLIGHT_MODEL"] ?? DEFAULT_MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserPrompt(data.transcript) },
          ],
        }),
      });
    } catch {
      return { ok: false, error: "Không kết nối được tới dịch vụ AI. Thử lại sau." };
    }

    if (response.status === 429) return { ok: false, error: "AI đang quá tải, thử lại sau ít phút." };
    if (response.status === 402) return { ok: false, error: "Đã hết hạn mức AI." };
    if (!response.ok) return { ok: false, error: `Dịch vụ AI báo lỗi (${response.status}).` };

    try {
      const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const content = body.choices?.[0]?.message?.content ?? "";
      const highlights = parseHighlightResponse(content);
      return { ok: true, highlights, warnings: validateHighlights(highlights) };
    } catch {
      return { ok: false, error: "AI trả về kết quả sai định dạng. Bấm thử lại." };
    }
  });
