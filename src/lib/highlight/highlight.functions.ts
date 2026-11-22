import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { inRange, offsetTranscript, parseHighlightResponse, pickTop, validateHighlights, type Highlight } from "./highlight";
import { TRANSCRIBE_PROMPT, buildSystemPrompt, buildUserPrompt } from "./prompt";

export type HighlightResult =
  | { ok: true; highlights: Highlight[]; warnings: string[] }
  | { ok: false; error: string; trialUsed?: boolean };

export type TranscribeResult = { ok: true; text: string } | { ok: false; error: string; trialUsed?: boolean };

const TRIAL_USED_MESSAGE = "Bạn đã dùng thử 1 lần. Hãy chọn gói để tiếp tục.";

/**
 * Gỡ băng 1 đoạn âm thanh ngắn (do trình duyệt tách ra từ video của khách).
 * Chỉ cho người đã đăng nhập và chưa dùng hết lượt thử. Chưa tính lượt: lượt tính khi chọn Highlight.
 */
export const transcribeChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      audioBase64: z.string().min(100).max(6_000_000),
      offsetSec: z.number().nonnegative().max(86_400),
    }),
  )
  .handler(async ({ data, context }): Promise<TranscribeResult> => {
    const { gatewayChat, readTrial } = await import("./highlight.server");
    const trial = await readTrial(context.userId);
    if (!trial.ok) return { ok: false, error: "Không đọc được tài khoản. Thử đăng nhập lại." };
    if (trial.used) return { ok: false, trialUsed: true, error: TRIAL_USED_MESSAGE };

    const res = await gatewayChat([
      {
        role: "user",
        content: [
          { type: "text", text: TRANSCRIBE_PROMPT },
          { type: "input_audio", input_audio: { data: data.audioBase64, format: "mp3" } },
        ],
      },
    ]);
    if (!res.ok) return res;
    return { ok: true, text: offsetTranscript(res.content, data.offsetSec) };
  });

/**
 * Chọn `count` đoạn Highlight (1-10) từ transcript. Phải đăng nhập.
 * Mỗi tài khoản dùng thử 1 lần: dấu "trial_used" ghi trước khi gọi AI, lỗi thì trả lại lượt.
 */
export const generateHighlights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      transcript: z.string().min(50).max(400_000),
      count: z.number().int().min(1).max(10),
      durationSec: z.number().positive().optional(),
      minSec: z.number().int().min(10).max(170).default(30),
      maxSec: z.number().int().min(20).max(180).default(90),
    }),
  )
  .handler(async ({ data, context }): Promise<HighlightResult> => {
    const { gatewayChat, readTrial, writeTrial } = await import("./highlight.server");

    const trial = await readTrial(context.userId);
    if (!trial.ok) return { ok: false, error: "Không đọc được tài khoản. Thử đăng nhập lại." };
    if (trial.used) return { ok: false, trialUsed: true, error: TRIAL_USED_MESSAGE };

    const { error: markError } = await writeTrial(context.userId, trial.meta, true);
    if (markError) return { ok: false, error: "Không ghi được lượt dùng thử. Thử lại sau." };

    const fail = async (error: string): Promise<HighlightResult> => {
      await writeTrial(context.userId, trial.meta, false);
      return { ok: false, error: `${error} Lượt dùng thử vẫn còn.` };
    };

    // Hỏi dư 2 đoạn để có chỗ loại đoạn không đạt, rồi giữ lại đúng số khách chọn.
    const ask = Math.min(10, data.count + 2);
    const res = await gatewayChat([
      { role: "system", content: buildSystemPrompt(ask, data.minSec, data.maxSec) },
      { role: "user", content: buildUserPrompt(data.transcript, ask) },
    ]);
    if (!res.ok) return fail(res.error);

    try {
      const all = parseHighlightResponse(res.content).filter(
        (h) => h.endSec > h.startSec && (data.durationSec === undefined || h.endSec <= data.durationSec + 1),
      );
      if (all.length === 0) return fail("AI không chọn được đoạn nào.");
      const range = { minSec: data.minSec, maxSec: data.maxSec };
      // Ưu tiên đoạn đúng độ dài khách chọn; thiếu thì lấy thêm đoạn khác.
      const fits = all.filter((h) => inRange(h, range));
      const highlights = pickTop(fits.length >= data.count ? fits : all, data.count);
      return { ok: true, highlights, warnings: validateHighlights(highlights, data.durationSec, highlights.length, range) };
    } catch {
      return fail("AI trả về kết quả sai định dạng.");
    }
  });
