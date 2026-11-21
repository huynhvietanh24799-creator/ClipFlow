import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseHighlightResponse, validateHighlights, type Highlight } from "./highlight";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";

export type HighlightResult =
  | { ok: true; highlights: Highlight[]; warnings: string[] }
  | { ok: false; error: string; trialUsed?: boolean };

/**
 * Chạy ở phía server (khóa AI không bao giờ xuống trình duyệt).
 * Phải đăng nhập. Mỗi tài khoản dùng thử 1 lần: dấu "trial_used" lưu trong
 * app_metadata của người dùng (chỉ máy chủ sửa được, người dùng không tự sửa).
 */
export const generateHighlights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ transcript: z.string().min(50).max(200_000) }))
  .handler(async ({ data, context }): Promise<HighlightResult> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      return { ok: false, error: "Chưa cấu hình khóa AI (LOVABLE_API_KEY) cho máy chủ." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: found, error: readError } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    if (readError || !found.user) {
      return { ok: false, error: "Không đọc được tài khoản. Thử đăng nhập lại." };
    }
    const meta = found.user.app_metadata ?? {};
    if (meta["trial_used"] === true) {
      return { ok: false, trialUsed: true, error: "Bạn đã dùng thử 1 lần. Hãy chọn gói để tiếp tục." };
    }

    // Đánh dấu trước khi gọi AI để không bấm nhiều lần cùng lúc; lỗi thì trả lại lượt.
    const setTrial = (used: boolean) =>
      supabaseAdmin.auth.admin.updateUserById(context.userId, {
        app_metadata: { ...meta, trial_used: used },
      });
    const { error: markError } = await setTrial(true);
    if (markError) return { ok: false, error: "Không ghi được lượt dùng thử. Thử lại sau." };

    const fail = async (error: string): Promise<HighlightResult> => {
      await setTrial(false);
      return { ok: false, error };
    };

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
      return fail("Không kết nối được tới dịch vụ AI. Lượt dùng thử vẫn còn, thử lại sau.");
    }

    if (response.status === 429) return fail("AI đang quá tải, lượt dùng thử vẫn còn. Thử lại sau ít phút.");
    if (response.status === 402) return fail("Đã hết hạn mức AI.");
    if (!response.ok) return fail(`Dịch vụ AI báo lỗi (${response.status}). Lượt dùng thử vẫn còn.`);

    try {
      const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const content = body.choices?.[0]?.message?.content ?? "";
      const highlights = parseHighlightResponse(content);
      return { ok: true, highlights, warnings: validateHighlights(highlights) };
    } catch {
      return fail("AI trả về kết quả sai định dạng. Lượt dùng thử vẫn còn, bấm thử lại.");
    }
  });
