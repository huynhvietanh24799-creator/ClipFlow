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
  type Highlight,
} from "@/lib/highlight/highlight";
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
  { value: "original", label: "Giữ khung gốc (cắt nhanh)" },
  { value: "16:9", label: "16:9 ngang (YouTube)", css: "16 / 9" },
  { value: "9:16", label: "9:16 dọc (TikTok, Reels)", css: "9 / 16" },
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
  const [ratio, setRatio] = useState<AspectRatio>("original");
  const [srcUrl, setSrcUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
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
    if (isPlatformLink(url)) {
      setError(
        "Link của YouTube, TikTok, Facebook... là trang xem video, web không tải video về được. " +
          "Hãy tải file video về máy (từ kênh của bạn hoặc nơi được phép) rồi bấm Chọn file ở trên. " +
          "Link file video trực tiếp (.mp4, .mov, .webm) thì dùng được.",
      );
      return;
    }
    setBusy(true);
    try {
      const tools = await import("@/lib/highlight/clip-tools");
      setStatus("Đang tải video từ link...");
      const f = await tools.loadVideoFromUrl(url, MAX_FILE_BYTES, (p) =>
        setStatus(p === null ? "Đang tải video từ link..." : `Đang tải video từ link: ${Math.round(p * 100)}%`),
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
    setStatus("AI đang chọn đoạn Highlight...");
    const { minSec, maxSec } = DURATION_PRESETS[presetIdx]!;
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
        const blob = await tools.cutClip(inputPath.current, h.startSec, h.endSec, ratio, (f) =>
          setStatus(`${label} (${Math.round(f * 100)}%)...`),
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
        không tải lên máy chủ. Chỉ âm thanh được gửi đi để gỡ băng.
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
          <p className="mt-1 text-xs text-muted-foreground">
            Link YouTube, TikTok, Facebook... là trang xem video nên chưa tải trực tiếp được.
          </p>
        </div>
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
          {ratio !== "original" ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Đổi tỉ lệ phải nén lại video nên cắt chậm hơn (khoảng vài phút cho mỗi video). Khung hình được cắt giữa.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={analyzeVideo} disabled={!file || busy || trialUsed}>
            {busy && status ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Phân tích video
          </Button>
          <span className="text-sm text-muted-foreground">Bạn được dùng thử miễn phí 1 lần.</span>
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
          disabled={busy || trialUsed || transcript.trim().length < 50}
        >
          Chọn Highlight từ transcript
        </Button>
      </details>

      {error ? <p className="mt-4 text-destructive">{error}</p> : null}
      {trialUsed ? (
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
          <span className="text-xs text-muted-foreground">
            Cắt nhanh bằng sao chép luồng, điểm bắt đầu có thể lệch vài giây.
          </span>
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
                  style={ratio === "original" ? undefined : { aspectRatio: RATIOS.find((r) => r.value === ratio)?.css }}
                />
                <p className="text-xs text-muted-foreground">
                  Xem trước đoạn trong video gốc{ratio === "original" ? "" : ` (khung ${ratio} như khi cắt)`}.
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
