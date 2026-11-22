// Chỉ chạy ở máy chủ: gọi cổng AI và quản lý lượt dùng thử.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";

export type ChatResult = { ok: true; content: string } | { ok: false; error: string };

export async function gatewayChat(messages: unknown[]): Promise<ChatResult> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return { ok: false, error: "Chưa cấu hình khóa AI (LOVABLE_API_KEY) cho máy chủ." };
  let response: Response;
  try {
    response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env["HIGHLIGHT_MODEL"] ?? DEFAULT_MODEL, messages }),
    });
  } catch {
    return { ok: false, error: "Không kết nối được tới dịch vụ AI. Thử lại sau." };
  }
  if (response.status === 429) return { ok: false, error: "AI đang quá tải. Thử lại sau ít phút." };
  if (response.status === 402) return { ok: false, error: "Đã hết hạn mức AI." };
  if (!response.ok) return { ok: false, error: `Dịch vụ AI báo lỗi (${response.status}).` };
  try {
    const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    return { ok: true, content: body.choices?.[0]?.message?.content ?? "" };
  } catch {
    return { ok: false, error: "AI trả về kết quả sai định dạng." };
  }
}

/** Dấu dùng thử lưu trong app_metadata: chỉ máy chủ sửa được. */
export async function readTrial(userId: string) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data.user) return { ok: false as const };
  const meta = data.user.app_metadata ?? {};
  return { ok: true as const, meta, used: meta["trial_used"] === true };
}

export async function writeTrial(userId: string, meta: Record<string, unknown>, used: boolean) {
  return supabaseAdmin.auth.admin.updateUserById(userId, { app_metadata: { ...meta, trial_used: used } });
}
