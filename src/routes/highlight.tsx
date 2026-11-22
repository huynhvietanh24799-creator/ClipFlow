import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Copy, Download, Loader2, Scissors, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  buildFfmpegCommands,
  formatTimestamp,
  isHttpUrl,
  isPlatformLink,
  parseTimestamp,
  validateHighlights,
  type Highlight,
} from "@/lib/highlight/highlight";
import { parseSegments, rankHighlights } from "@/lib/highlight/local-ranker";
import type { WhisperLanguage } from "@/lib/highlight/whisper-client";
import type { AspectRatio } from "@/lib/highlight/clip-tools";
import { generateHighlights, transcribeChunk } from "@/lib/highlight/highlight.functions";

export const Route = createFileRoute("/highlight")({
  head: () => ({
    meta: [
      { title: "Cắt Highlight — ClipFlow" },
      {
        name: "description",
        content: "Gửi video dài, ClipFlow tự chọn và cắt 1 đến 10 video Highlight kèm Hook, caption.",
      },
    ],
  }),
  component: HighlightPage,
});

const CHUNK_SEC = 300; // tách âm thanh từng 5 phút
const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_DURATION_SEC = 2 * 60 * 60;

type Clip = { url: string; name: string };

const RATIOS: { value: AspectRatio; label: string; css?: string }[] = [
  { value: "16:9", label: "16:9 ngang (YouTube)", css: "16 / 9" },
  { value: "9:16", label: "9:16 dọc (TikTok, Reels)", css: "9 / 16" },
];

const MODES = [
  { value: "free", label: "Miễn phí, chạy trên máy bạn" },
  { value: "ai", label: "AI nâng cao (dùng thử 1 lần)" },
] as const;

const LANGUAGES: { value: string; label: string; code: WhisperLanguage }[] = [
  { value: "vi", label: "Tiếng Việt", code: "vietnamese" },
  { value: "en", label: "Tiếng Anh", code: "english" },
  { value: "auto", label: "Tự nhận diện", code: null },
];

const DURATION_PRESETS = [
  { label: "15–30 giây", minSec: 15, maxSec: 30 },
  { label: "30–60 giây", minSec: 30, maxSec: 60 },
  { label: "60–90 giây", minSec: 60, maxSec: 90 },
  { label: "90–120 giây", minSec: 90, maxSec: 120 },
];

/** Ô nhập mốc MM:SS; chỉ áp dụng khi rời ô và giá trị hợp lệ. */
function TimeInput({ value, onCommit, disabled }: { value: number; onCommit: (sec: number) => void; disabled?: boolean }) {
  const [text, setText] = useState(formatTimestamp(value));
  useEffect(() => setText(formatTimestamp(value)), [value]);
  return (
    <Input
      className="h-8 w-24 text-center"
      value={text}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const sec = parseTimestamp(text);
        if (sec === null) setText(formatTimestamp(value));
        else onCommit(sec);
      }}
    />
  );
}

function HighlightPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [trialUsed, setTrialUsed] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [count, setCount] = useState(5);
  const [presetIdx, setPresetIdx] = useState(1);
  const [ratio, setRatio] = useState<AspectRatio>("16:9");
  const [mode, setMode] = useState<"free" | "ai">("free");
  const [language, setLanguage] = useState("vi");
  const [followFace, setFollowFace] = useState(true);
  const [srcUrl, setSrcUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [bridgeUrl, setBridgeUrl] = useState("");
  const [bridgeKey, setBridgeKey] = useState("");
  const [owned, setOwned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [duration, setDuration] = useState<number | undefined>();
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [clips, setClips] = useState<Record<number, Clip>>({});
  const [videoPath, setVideoPath] = useState("video-goc.mp4");
  const inputPath = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) void navigate({ to: "/auth" });
      else setChecking(false);
    });
  }, [navigate]);

  useEffect(() => {
    try {
      setBridgeUrl(localStorage.getItem("clipflow.bridgeUrl") ?? "");
      setBridgeKey(localStorage.getItem("clipflow.bridgeKey") ?? "");
    } catch {
      // Trình duyệt chặn lưu trữ: bỏ qua, khách nhập lại mỗi lần.
    }
  }, []);

  useEffect(() => {
    if (!file) {
      setSrcUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setSrcUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    // Giải phóng bộ nhớ các clip cũ khi rời trang.
    return () => Object.values(clips).forEach((c) => URL.revokeObjectURL(c.url));
  }, [clips]);

  function changeRatio(r: AspectRatio) {
    setRatio(r);
    // Đổi tỉ lệ thì clip đã cắt không còn đúng: bỏ để cắt lại.
    setClips((prev) => {
      Object.values(prev).forEach((c) => URL.revokeObjectURL(c.url));
      return {};
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
    await navigate({ to: "/auth" });
  }

  function reset() {
    setHighlights([]);
    setWarnings([]);
    setSelected(new Set());
    setClips({});
    setError(null);
    inputPath.current = null;
  }

  function onPickFile(f: File | null) {
    reset();
    setDuration(undefined);
    if (f && f.size > MAX_FILE_BYTES) {
      setFile(null);
      setError("Video lớn hơn 2GB. Hãy chọn video nhỏ hơn hoặc cắt bớt trước.");
      return;
    }
    setFile(f);
  }

  async function loadFromUrl() {
    const url = videoUrl.trim();
    setError(null);
    if (!isHttpUrl(url)) {
      setError("Link chưa đúng. Link phải bắt đầu bằng http:// hoặc https://.");
      return;
    }
    const platform = isPlatformLink(url);
    const bridge = bridgeUrl.trim().replace(/\/+$/, "");
    if (platform && (!bridge || !bridgeKey.trim())) {
      setError(
        "Link YouTube, TikTok, Facebook... cần cầu nối tải video chạy trên máy của bạn. " +
          "Mở mục \"Link YouTube, TikTok, Facebook\" bên dưới để cài đặt, hoặc tải file video về máy rồi bấm Chọn file.",
      );
      return;
    }
    if (platform && !owned) {
      setError("Hãy tick ô xác nhận bạn là chủ video hoặc có quyền sử dụng video này.");
      return;
    }
    setBusy(true);
    try {
      const tools = await import("@/lib/highlight/clip-tools");
      setStatus("Đang tải video từ link...");
      if (platform) {
        try {
          localStorage.setItem("clipflow.bridgeUrl", bridge);
          localStorage.setItem("clipflow.bridgeKey", bridgeKey.trim());
        } catch {
          // Không lưu được thì thôi.
        }
        setStatus("Cầu nối đang tải video về máy (có thể mất vài phút)...");
      }
      const f = await tools.loadVideoFromUrl(
        platform ? `${bridge}/fetch?url=${encodeURIComponent(url)}` : url,
        MAX_FILE_BYTES,
        (p) => setStatus(p === null ? "Đang tải video từ link..." : `Đang tải video từ link: ${Math.round(p * 100)}%`),
        platform ? { headers: { "X-Bridge-Key": bridgeKey.trim() }, fileName: "video-tu-link.mp4" } : undefined,
      );
      onPickFile(f);
      toast.success("Đã tải video. Bấm Phân tích video.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được video từ link.");
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  async function pickHighlights(text: string, durationSec: number | undefined) {
    const { minSec, maxSec } = DURATION_PRESETS[presetIdx]!;
    if (mode === "free") {
      setStatus("Đang chấm điểm và chọn đoạn Highlight...");
      const list = rankHighlights(parseSegments(text, durationSec), count, { minSec, maxSec });
      if (list.length === 0) {
        setError("Không tìm được đoạn nào đủ độ dài. Thử chọn độ dài khác hoặc video có nhiều lời nói hơn.");
        return false;
      }
      setHighlights(list);
      setWarnings(validateHighlights(list, durationSec, list.length, { minSec, maxSec }));
      setSelected(new Set(list.map((_, i) => i)));
      return true;
    }
    setStatus("AI đang chọn đoạn Highlight...");
    const res = await generateHighlights({ data: { transcript: text, count, durationSec, minSec, maxSec } });
    if (!res.ok) {
      setError(res.error);
      if (res.trialUsed) setTrialUsed(true);
      return false;
    }
    setHighlights(res.highlights);
    setWarnings(res.warnings);
    setSelected(new Set(res.highlights.map((_, i) => i)));
    return true;
  }

  async function analyzeVideo() {
    if (!file) return;
    setBusy(true);
    reset();
    try {
      setStatus("Đang đọc video...");
      const tools = await import("@/lib/highlight/clip-tools");
      const dur = await tools.getVideoDuration(file);
      if (dur > MAX_DURATION_SEC) throw new Error("Video dài hơn 2 giờ. Hãy chọn video ngắn hơn.");
      setDuration(dur);

      setStatus("Đang tải bộ cắt video (lần đầu mất ít phút)...");
      const path = await tools.mountInput(file);
      inputPath.current = path;

      const parts: string[] = [];
      if (mode === "free") {
        const { createWhisper } = await import("@/lib/highlight/whisper-client");
        const whisper = createWhisper((text) => setStatus(text));
        try {
          setStatus("Đang tải mô hình gỡ băng (lần đầu khoảng 1 phút, các lần sau nhanh hơn)...");
          await whisper.ready;
          const code = LANGUAGES.find((l) => l.value === language)?.code ?? null;
          await tools.forEachRawAudioChunk(path, dur, CHUNK_SEC, async (audio, offset, i, total) => {
            setStatus(`Đang gỡ băng lời nói trên máy bạn: đoạn ${i + 1}/${total}...`);
            const text = await whisper.transcribe(audio, offset, code);
            if (text) parts.push(text);
          });
        } finally {
          whisper.terminate();
        }
      } else {
        let failed: string | null = null;
        await tools.forEachAudioChunk(path, dur, CHUNK_SEC, async (b64, offset, i, total) => {
          if (failed) return;
          setStatus(`Đang gỡ băng lời nói: đoạn ${i + 1}/${total}...`);
          const r = await transcribeChunk({ data: { audioBase64: b64, offsetSec: offset } });
          if (!r.ok) {
            failed = r.error;
            if (r.trialUsed) setTrialUsed(true);
            return;
          }
          if (r.text) parts.push(r.text);
        });
        if (failed) throw new Error(failed);
      }

      const full = parts.join("\n");
      if (full.length < 50) throw new Error("Không nghe thấy đủ lời nói trong video để chọn Highlight.");
      await pickHighlights(full, dur);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra, thử lại.");
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  async function analyzeTranscript() {
    setBusy(true);
    reset();
    try {
      await pickHighlights(transcript, undefined);
    } catch {
      setError("Có lỗi xảy ra. Dán ít nhất vài dòng có mốc [MM:SS] rồi thử lại.");
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  async function cutSelected() {
    if (!file || !inputPath.current) return;
    setBusy(true);
    setError(null);
    try {
      const tools = await import("@/lib/highlight/clip-tools");
      const order = [...selected].sort((a, b) => a - b);
      const next = { ...clips };
      for (const [n, i] of order.entries()) {
        const h = highlights[i]!;
        const label = `Đang cắt video ${n + 1}/${order.length}`;
        setStatus(`${label}...`);
        if (next[i]) continue;
        let faceX: number | null = null;
        if (ratio === "9:16" && followFace) {
          try {
            setStatus(`${label}: đang tìm khuôn mặt...`);
            const { findFaceCenterX } = await import("@/lib/highlight/face-crop");
            faceX = await findFaceCenterX(file, h.startSec, h.endSec);
          } catch {
            faceX = null; // không nhận diện được thì cắt giữa khung
          }
        }
        const blob = await tools.cutClip(
          inputPath.current,
          h.startSec,
          h.endSec,
          ratio,
          (f) => setStatus(`${label} (${Math.round(f * 100)}%)...`),
          faceX,
        );
        next[i] = { url: URL.createObjectURL(blob), name: `highlight-${String(i + 1).padStart(2, "0")}.mp4` };
        setClips({ ...next });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cắt video bị lỗi, thử lại.");
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  function downloadAll() {
    Object.entries(clips)
      .filter(([i]) => selected.has(Number(i)))
      .forEach(([, c], n) => {
        setTimeout(() => {
          const a = document.createElement("a");
          a.href = c.url;
          a.download = c.name;
          a.click();
        }, n * 400);
      });
  }

  function updateTime(i: number, field: "startSec" | "endSec", sec: number) {
    const h = highlights[i]!;
    const next = { ...h, [field]: sec };
    if (next.endSec - next.startSec < 5) {
      toast.error("Đoạn cắt phải dài ít nhất 5 giây.");
      return;
    }
    if (duration !== undefined && next.endSec > duration) {
      toast.error("Mốc kết thúc vượt quá độ dài video.");
      return;
    }
    if (next.startSec === h.startSec && next.endSec === h.endSec) return;
    setHighlights((prev) => prev.map((x, k) => (k === i ? next : x)));
    // Mốc đổi thì clip đã cắt không còn đúng: bỏ để cắt lại.
    setClips((prev) => {
      const old = prev[i];
      if (!old) return prev;
      URL.revokeObjectURL(old.url);
      const rest = { ...prev };
      delete rest[i];
      return rest;
    });
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Đã sao chép");
    } catch {
      toast.error("Không sao chép được");
    }
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  if (checking) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </main>
    );
  }

  const commands = !file && highlights.length ? buildFfmpegCommands(videoPath || "video-goc.mp4", highlights) : [];
  const readyClips = Object.keys(clips).filter((i) => selected.has(Number(i))).length;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Về trang chủ
        </Link>
        <Button variant="ghost" size="sm" onClick={signOut}>
          Đăng xuất
        </Button>
      </div>
      <h1 className="flex items-center gap-2 text-3xl font-semibold">
        <Scissors className="h-7 w-7" /> Cắt Highlight
      </h1>
      <p className="mt-2 text-muted-foreground">
        Chọn video dài, ClipFlow tự nghe, chọn đoạn hay nhất và cắt thành video ngắn. Video được cắt ngay trên máy bạn,
        không tải lên máy chủ. Chế độ miễn phí xử lý trọn vẹn trên máy bạn; chế độ AI nâng cao chỉ gửi âm thanh đi để gỡ băng.
      </p>

      <Card className="mt-6 grid gap-4 p-5">
        <div>
          <label className="mb-2 block text-sm font-medium" htmlFor="video">
            Video dài (MP4, MOV; tối đa 2GB và 2 giờ)
          </label>
          <Input
            id="video"
            type="file"
            accept="video/*"
            disabled={busy}
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          />
          {file ? <p className="mt-1 text-xs text-muted-foreground">{file.name}</p> : null}
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium" htmlFor="video-url">
            Hoặc dán link file video trực tiếp (.mp4, .mov, .webm)
          </label>
          <div className="flex gap-2">
            <Input
              id="video-url"
              type="url"
              placeholder="https://.../video.mp4"
              value={videoUrl}
              disabled={busy}
              onChange={(e) => setVideoUrl(e.target.value)}
            />
            <Button type="button" variant="outline" disabled={busy || !videoUrl.trim()} onClick={loadFromUrl}>
              Tải từ link
            </Button>
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Link YouTube, TikTok, Facebook... (cần cầu nối chạy trên máy của bạn)
            </summary>
            <div className="mt-2 grid gap-2 rounded-md border p-3 text-xs text-muted-foreground">
              <p>
                Web không tải được video từ các trang này. Cầu nối là một chương trình nhỏ chạy trên máy bạn: mở Terminal,
                chạy <code>bash bridge/start.sh</code> trong thư mục dự án, rồi dán địa chỉ https://...trycloudflare.com và
                khóa mà chương trình in ra vào đây.
              </p>
              <Input placeholder="Địa chỉ cầu nối (https://...trycloudflare.com)" value={bridgeUrl} onChange={(e) => setBridgeUrl(e.target.value)} />
              <Input type="password" placeholder="Khóa cầu nối" value={bridgeKey} onChange={(e) => setBridgeKey(e.target.value)} />
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-0.5" checked={owned} onChange={(e) => setOwned(e.target.checked)} />
                <span>Tôi là chủ video này hoặc có quyền sử dụng, và tuân thủ điều khoản của nền tảng.</span>
              </label>
            </div>
          </details>
        </div>
        <div>
          <span className="mb-2 block text-sm font-medium">Cách chọn đoạn Highlight</span>
          <div className="flex flex-wrap gap-2">
            {MODES.map((m) => (
              <Button
                key={m.value}
                type="button"
                size="sm"
                variant={m.value === mode ? "default" : "outline"}
                disabled={busy}
                onClick={() => setMode(m.value)}
              >
                {m.label}
              </Button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {mode === "free"
              ? "Gỡ băng bằng Whisper và chấm điểm ngay trên máy bạn: không tốn phí, không giới hạn lượt, video và âm thanh không gửi đi đâu. Máy mạnh (có WebGPU) chạy nhanh hơn, độ chính xác tiếng Việt thấp hơn AI nâng cao."
              : "AI chọn đoạn chính xác hơn nhưng chỉ dùng thử 1 lần mỗi tài khoản. Âm thanh được gửi tới máy chủ AI để gỡ băng."}
          </p>
        </div>
        {mode === "free" ? (
          <div>
            <span className="mb-2 block text-sm font-medium">Ngôn ngữ trong video</span>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((l) => (
                <Button
                  key={l.value}
                  type="button"
                  size="sm"
                  variant={l.value === language ? "default" : "outline"}
                  disabled={busy}
                  onClick={() => setLanguage(l.value)}
                >
                  {l.label}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        <div>
          <label className="mb-2 block text-sm font-medium" htmlFor="count">
            Số video Highlight muốn cắt (1–10)
          </label>
          <Input
            id="count"
            type="number"
            min={1}
            max={10}
            className="w-28"
            value={count}
            disabled={busy}
            onChange={(e) => setCount(Math.min(10, Math.max(1, Math.round(Number(e.target.value)) || 1)))}
          />
        </div>
        <div>
          <span className="mb-2 block text-sm font-medium">Độ dài mỗi video</span>
          <div className="flex flex-wrap gap-2">
            {DURATION_PRESETS.map((p, i) => (
              <Button
                key={p.label}
                type="button"
                size="sm"
                variant={i === presetIdx ? "default" : "outline"}
                disabled={busy}
                onClick={() => setPresetIdx(i)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-2 block text-sm font-medium">Tỉ lệ khung hình video cắt ra</span>
          <div className="flex flex-wrap gap-2">
            {RATIOS.map((r) => (
              <Button
                key={r.value}
                type="button"
                size="sm"
                variant={r.value === ratio ? "default" : "outline"}
                disabled={busy}
                onClick={() => changeRatio(r.value)}
              >
                {r.label}
              </Button>
            ))}
          </div>
          {ratio === "9:16" ? (
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={followFace} disabled={busy} onChange={(e) => setFollowFace(e.target.checked)} />
              Cắt dọc bám theo khuôn mặt người nói (không thấy mặt thì cắt giữa khung)
            </label>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            Video được nén lại theo tỉ lệ đã chọn nên cắt mất khoảng vài phút cho mỗi video.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={analyzeVideo} disabled={!file || busy || (mode === "ai" && trialUsed)}>
            {busy && status ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Phân tích video
          </Button>
          {mode === "ai" ? <span className="text-sm text-muted-foreground">Bạn được dùng thử miễn phí 1 lần.</span> : null}
        </div>
        {status ? <p className="text-sm">{status}</p> : null}
      </Card>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-muted-foreground">Hoặc dán transcript có sẵn</summary>
        <Textarea
          className="mt-3 min-h-40"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder={"[00:05] Hôm nay mình kể một chuyện...\n[00:12] ..."}
        />
        <Button
          className="mt-3"
          variant="outline"
          onClick={analyzeTranscript}
          disabled={busy || (mode === "ai" && trialUsed) || transcript.trim().length < 50}
        >
          Chọn Highlight từ transcript
        </Button>
      </details>

      {error ? <p className="mt-4 text-destructive">{error}</p> : null}
      {mode === "ai" && trialUsed ? (
        <Button asChild className="mt-3">
          <Link to="/pricing">Xem bảng giá</Link>
        </Button>
      ) : null}
      {warnings.length ? (
        <ul className="mt-4 list-disc pl-5 text-sm text-amber-600">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      {highlights.length && file ? (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button onClick={cutSelected} disabled={busy || selected.size === 0}>
            <Scissors className="mr-2 h-4 w-4" /> Cắt {selected.size} video đã chọn
          </Button>
          {readyClips > 0 ? (
            <Button variant="outline" onClick={downloadAll}>
              <Download className="mr-2 h-4 w-4" /> Tải {readyClips} video
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4">
        {highlights.map((h, i) => (
          <Card key={`${h.startSec}-${i}`} className="p-5">
            <div className="flex items-start justify-between gap-4">
              <label className="flex items-start gap-3">
                {file ? (
                  <input
                    type="checkbox"
                    className="mt-1.5 h-4 w-4"
                    checked={selected.has(i)}
                    onChange={() => toggle(i)}
                    disabled={busy}
                  />
                ) : null}
                <h2 className="text-lg font-semibold">
                  #{i + 1} · {h.title}
                </h2>
              </label>
              <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium">
                {h.viralScore}/10
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatTimestamp(h.startSec)} → {formatTimestamp(h.endSec)} ({Math.round(h.endSec - h.startSec)} giây) ·{" "}
              {h.viralReason}
            </p>
            <p className="mt-3 italic">“{h.hook}”</p>
            <p className="mt-2 text-sm">{h.summary}</p>
            <p className="mt-2 text-sm text-muted-foreground">Gợi ý dựng: {h.editTips}</p>
            <p className="mt-2 text-sm">
              {h.caption} {h.hashtags.join(" ")}
            </p>
            {file && srcUrl ? (
              <div className="mt-3 grid gap-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>Cắt từ</span>
                  <TimeInput value={h.startSec} disabled={busy} onCommit={(sec) => updateTime(i, "startSec", sec)} />
                  <span>đến</span>
                  <TimeInput value={h.endSec} disabled={busy} onCommit={(sec) => updateTime(i, "endSec", sec)} />
                  <span className="text-muted-foreground">(MM:SS, sửa được)</span>
                </div>
                <video
                  key={`${i}-${h.startSec}-${h.endSec}`}
                  src={`${srcUrl}#t=${h.startSec},${h.endSec}`}
                  controls
                  preload="metadata"
                  className="max-h-72 rounded-md bg-black object-cover"
                  style={{ aspectRatio: RATIOS.find((r) => r.value === ratio)?.css }}
                />
                <p className="text-xs text-muted-foreground">
                  Xem trước đoạn trong video gốc (khung {ratio} như khi cắt).
                </p>
              </div>
            ) : null}
            {clips[i] ? (
              <div className="mt-3">
                <p className="mb-1 text-sm font-medium">Video đã cắt</p>
                <video src={clips[i].url} controls className="max-h-72 rounded-md" />
                <Button asChild variant="outline" size="sm" className="mt-2">
                  <a href={clips[i].url} download={clips[i].name}>
                    <Download className="mr-2 h-4 w-4" /> Tải {clips[i].name}
                  </a>
                </Button>
              </div>
            ) : null}
          </Card>
        ))}
      </div>

      {commands.length ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Lệnh FFmpeg cắt hàng loạt</h2>
          <p className="mt-1 text-sm text-muted-foreground">Chạy trên máy có cài FFmpeg.</p>
          <Input className="mt-3" value={videoPath} onChange={(e) => setVideoPath(e.target.value)} />
          <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-4 text-xs">{commands.join("\n")}</pre>
          <Button variant="outline" className="mt-3" onClick={() => copy(commands.join("\n"))}>
            <Copy className="mr-2 h-4 w-4" /> Sao chép lệnh
          </Button>
        </section>
      ) : null}
    </main>
  );
}
