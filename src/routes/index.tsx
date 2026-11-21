import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDown, ArrowRight, Check, Clapperboard, Scissors } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ClipFlow — Tạo clip nổi bật từ video dài" },
      {
        name: "description",
        content: "Tải video dài lên, chọn những khoảnh khắc đáng xem và chuẩn bị clip dọc cho TikTok, Reels, Shorts.",
      },
      { property: "og:title", content: "ClipFlow — Tạo clip nổi bật từ video dài" },
      {
        property: "og:description",
        content: "Ba bước đơn giản để tìm và chuẩn bị những đoạn video đáng chia sẻ.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

const examples = [
  { image: "/images/clip-podcast.png", label: "Podcast", time: "00:42 — 01:18" },
  { image: "/images/clip-cooking.png", label: "Ẩm thực", time: "03:10 — 03:46" },
  { image: "/images/clip-fitness.png", label: "Thể thao", time: "08:22 — 08:58" },
];

function Wordmark() {
  return (
    <Link to="/" className="inline-flex items-center gap-2.5 font-display text-xl font-bold text-foreground">
      <span className="flex size-9 items-center justify-center rounded-sm bg-foreground text-background">
        <Scissors aria-hidden="true" className="size-[18px]" />
      </span>
      ClipFlow
    </Link>
  );
}

function HomePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 sm:px-8">
        <Wordmark />
        <nav aria-label="Điều hướng chính" className="flex items-center gap-3 sm:gap-8">
          <a className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline" href="#steps">
            Cách hoạt động
          </a>
          <Link className="text-sm font-semibold text-foreground transition-colors hover:text-muted-foreground" to="/pricing">
            Bảng giá
          </Link>
          <Button asChild size="sm">
            <Link to="/auth">Bắt đầu <ArrowRight aria-hidden="true" /></Link>
          </Button>
        </nav>
      </header>

      <section className="landing-hero flex items-center" aria-labelledby="landing-title">
        <div className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 sm:py-24">
          <div className="max-w-3xl">
            <p className="mb-6 inline-flex items-center gap-2 rounded-sm border border-background/30 bg-foreground/25 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-background">
              <Clapperboard aria-hidden="true" className="size-4 text-primary" />
              Dành cho video TikTok · Reels · Shorts
            </p>
            <h1 id="landing-title" className="max-w-3xl text-5xl font-semibold leading-[1.02] text-background sm:text-6xl lg:text-7xl">
              Cắt video dài thành những khoảnh khắc đáng xem.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-background/85 sm:text-lg">
              Gửi một video, chờ ClipFlow tìm điểm nổi bật, rồi xem lại các clip dọc trong một nơi thật gọn gàng.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link to="/pricing">Khám phá các gói <ArrowRight aria-hidden="true" /></Link>
              </Button>
              <a className="inline-flex min-h-10 items-center gap-2 px-3 text-sm font-semibold text-background transition-colors hover:text-primary" href="#steps">
                Xem 3 bước <ArrowDown aria-hidden="true" className="size-4" />
              </a>
            </div>
            <div className="mt-12 flex flex-wrap gap-x-7 gap-y-3 text-sm font-medium text-background/85">
              <span className="inline-flex items-center gap-2"><Check aria-hidden="true" className="size-4 text-primary" /> Khung dọc 9:16</span>
              <span className="inline-flex items-center gap-2"><Check aria-hidden="true" className="size-4 text-primary" /> Caption gợi ý</span>
              <span className="inline-flex items-center gap-2"><Check aria-hidden="true" className="size-4 text-primary" /> Credit theo phút video</span>
            </div>
          </div>
        </div>
        <span className="absolute bottom-7 right-8 hidden font-display text-sm font-semibold tracking-[0.12em] text-background/70 lg:block">
          01 / 03
        </span>
      </section>

      <section id="steps" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Ít thao tác, rõ kết quả</p>
            <h2 className="mt-4 max-w-md text-3xl font-semibold leading-tight sm:text-4xl">Từ video dài đến clip ngắn, chỉ qua ba bước.</h2>
          </div>
          <div className="grid gap-0 sm:grid-cols-3">
            {[
              { number: "01", title: "Gửi video", detail: "Tải tệp MP4 hoặc dán liên kết YouTube." },
              { number: "02", title: "Chờ xử lý", detail: "Theo dõi tiến độ ngay trong bảng điều khiển." },
              { number: "03", title: "Xem & tải", detail: "Chọn clip, sao chép caption và tải kết quả." },
            ].map((step) => (
              <article key={step.number} className="border-t border-border py-5 sm:mr-5">
                <span className="font-display text-sm font-semibold text-signal">{step.number}</span>
                <h3 className="mt-6 text-xl font-semibold">{step.title}</h3>
                <p className="mt-3 max-w-[24ch] text-sm leading-6 text-muted-foreground">{step.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-secondary/60">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[0.7fr_1.3fr] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Khung hình dọc</p>
            <h2 className="mt-4 max-w-md text-3xl font-semibold leading-tight">Mỗi khoảnh khắc có chỗ để tỏa sáng.</h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
              Xem trước clip 9:16, điểm nổi bật, mốc thời gian và caption ngay cạnh nhau.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:gap-5">
            {examples.map((example, index) => (
              <article key={example.label} className={index === 1 ? "mt-8" : ""}>
                <div className="video-frame rounded-sm">
                  <img src={example.image} alt={`Khung hình mẫu chủ đề ${example.label}`} loading="lazy" />
                  <div className="video-frame__shade">
                    <span className="block text-xs font-semibold">{example.label}</span>
                    <span className="mt-1 block text-[10px] text-background/80">{example.time}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-16 sm:px-8 sm:py-20 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Bắt đầu từ điều đơn giản</p>
          <h2 className="mt-4 max-w-xl text-3xl font-semibold leading-tight">Tìm gói phù hợp với thời lượng video của bạn.</h2>
        </div>
        <Button asChild variant="outline" size="lg">
          <Link to="/pricing">Xem bảng giá <ArrowRight aria-hidden="true" /></Link>
        </Button>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-7 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Wordmark />
          <span>ClipFlow · Tạo clip ngắn từ video dài</span>
        </div>
      </footer>
    </main>
  );
}
