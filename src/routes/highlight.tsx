import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Copy, Loader2, Scissors } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { buildFfmpegCommands, formatTimestamp, type Highlight } from "@/lib/highlight/highlight";
import { supabase } from "@/integrations/supabase/client";
import { generateHighlights } from "@/lib/highlight/highlight.functions";

export const Route = createFileRoute("/highlight")({
  head: () => ({
    meta: [
      { title: "Cắt Highlight — ClipFlow" },
      {
        name: "description",
        content: "Dán transcript có mốc thời gian, nhận 10 đoạn Highlight kèm Hook, caption và lệnh cắt FFmpeg.",
      },
    ],
  }),
  component: HighlightPage,
});

function HighlightPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [trialUsed, setTrialUsed] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [videoPath, setVideoPath] = useState("video-goc.mp4");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) void navigate({ to: "/auth" });
      else setChecking(false);
    });
  }, [navigate]);

  async function signOut() {
    await supabase.auth.signOut();
    await navigate({ to: "/auth" });
  }

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await generateHighlights({ data: { transcript } });
      if (res.ok) {
        setHighlights(res.highlights);
        setWarnings(res.warnings);
      } else {
        setError(res.error);
        if (res.trialUsed) setTrialUsed(true);
      }
    } catch {
      setError("Transcript quá ngắn hoặc có lỗi. Dán ít nhất vài dòng có mốc [MM:SS].");
    } finally {
      setLoading(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Đã sao chép");
    } catch {
      toast.error("Không sao chép được");
    }
  }

  const commands = highlights.length ? buildFfmpegCommands(videoPath || "video-goc.mp4", highlights) : [];

  if (checking) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </main>
    );
  }

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
        Dán transcript có mốc thời gian (mỗi dòng dạng [MM:SS] nội dung). ClipFlow chọn 10 đoạn đáng cắt nhất.
      </p>

      <Textarea
        className="mt-6 min-h-56"
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        placeholder={"[00:05] Hôm nay mình kể một chuyện...\n[00:12] ..."}
      />
      <Button className="mt-4" onClick={run} disabled={loading || trialUsed || transcript.trim().length < 50}>
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {loading ? "Đang phân tích..." : "Chọn 10 đoạn Highlight"}
      </Button>

      <p className="mt-3 text-sm text-muted-foreground">Bạn được dùng thử miễn phí 1 lần.</p>
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

      <div className="mt-8 grid gap-4">
        {highlights.map((h, i) => (
          <Card key={`${h.startSec}-${i}`} className="p-5">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold">
                #{i + 1} · {h.title}
              </h2>
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
          </Card>
        ))}
      </div>

      {commands.length ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Lệnh FFmpeg cắt hàng loạt</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Chạy trên máy có cài FFmpeg (web không cắt được video trực tiếp).
          </p>
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
