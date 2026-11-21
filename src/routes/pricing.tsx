import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Scissors } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Bảng giá ClipFlow — Gói phút video" },
      {
        name: "description",
        content: "So sánh các gói Free, Pro và Agency của ClipFlow theo số phút video và quyền lợi xuất clip.",
      },
      { property: "og:title", content: "Bảng giá ClipFlow — Gói phút video" },
      {
        property: "og:description",
        content: "Chọn hạn mức phút video và quyền lợi phù hợp với công việc của bạn.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PricingPage,
});

const plans = [
  {
    name: "Free",
    minutes: "30",
    detail: "Để thử quy trình",
    features: ["30 phút video mỗi tháng", "Xuất tối đa 3 clip", "Có watermark"],
    featured: false,
  },
  {
    name: "Pro",
    minutes: "300",
    detail: "Cho nhà sáng tạo đều đặn",
    features: ["300 phút video mỗi tháng", "Xuất đủ 10 clip", "Không watermark", "Crop khung dọc 9:16"],
    featured: true,
  },
  {
    name: "Agency",
    minutes: "1.500",
    detail: "Cho đội ngũ và nhiều kênh",
    features: ["1.500 phút video mỗi tháng", "Ưu tiên xử lý", "Tải hàng loạt tệp .zip"],
    featured: false,
  },
];

function PricingPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link to="/" className="inline-flex items-center gap-2.5 font-display text-xl font-bold text-foreground">
          <span className="flex size-9 items-center justify-center rounded-sm bg-foreground text-background">
            <Scissors aria-hidden="true" className="size-[18px]" />
          </span>
          ClipFlow
        </Link>
        <Button asChild variant="ghost" size="sm">
          <Link to="/"><ArrowLeft aria-hidden="true" /> Trang chủ</Link>
        </Button>
      </header>

      <section className="mx-auto max-w-7xl px-5 pb-16 pt-14 sm:px-8 sm:pb-24 sm:pt-20">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Bảng giá</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">Chọn hạn mức phút phù hợp.</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
            Tài khoản mới có 30 phút dùng thử. Mỗi gói mở ra một hạn mức và cách xuất clip khác nhau.
          </p>
        </div>

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={`flex flex-col border p-6 sm:p-8 ${plan.featured ? "border-foreground bg-foreground text-background" : "border-border bg-card text-card-foreground"}`}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-2xl font-semibold">{plan.name}</h2>
                {plan.featured ? (
                  <span className="rounded-sm bg-primary px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-primary-foreground">Phổ biến</span>
                ) : null}
              </div>
              <p className={`mt-2 text-sm ${plan.featured ? "text-background/70" : "text-muted-foreground"}`}>{plan.detail}</p>
              <p className="mt-9 font-display text-5xl font-semibold">{plan.minutes}<span className="ml-2 text-sm font-medium">phút / tháng</span></p>
              <ul className="mt-8 flex-1 space-y-4 border-t border-current/15 pt-6">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm leading-5">
                    <Check aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${plan.featured ? "text-primary" : "text-signal"}`} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <p className="mt-8 max-w-2xl text-sm leading-6 text-muted-foreground">
          Giá tiền chưa được công bố; bảng này chỉ hiển thị hạn mức và quyền lợi. Gói Free có watermark, còn việc tải clip thật sẽ khả dụng khi kết nối dịch vụ xử lý video.
        </p>
      </section>
    </main>
  );
}