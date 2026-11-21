import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Đăng nhập / Đăng ký — ClipFlow" },
      { name: "description", content: "Tạo tài khoản ClipFlow để dùng thử cắt Highlight 1 lần miễn phí." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/highlight` },
        });
        if (error) throw error;
        if (data.session) {
          await navigate({ to: "/highlight" });
        } else {
          setMessage("Đã gửi email xác nhận. Mở email, bấm liên kết, rồi quay lại đăng nhập.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await navigate({ to: "/highlight" });
      }
    } catch (err) {
      setError(err instanceof Error ? translate(err.message) : "Có lỗi xảy ra, thử lại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Về trang chủ
      </Link>
      <Card className="p-6">
        <h1 className="text-2xl font-semibold">{mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Đăng nhập xong, bạn được dùng thử cắt Highlight 1 lần miễn phí.
        </p>
        <form className="mt-5 grid gap-4" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Mật khẩu (ít nhất 8 ký tự)</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {mode === "login" ? "Đăng nhập" : "Đăng ký"}
          </Button>
        </form>
        <button
          type="button"
          className="mt-4 text-sm text-muted-foreground underline"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError(null);
            setMessage(null);
          }}
        >
          {mode === "login" ? "Chưa có tài khoản? Đăng ký" : "Đã có tài khoản? Đăng nhập"}
        </button>
      </Card>
    </main>
  );
}

function translate(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "Email hoặc mật khẩu chưa đúng.";
  if (m.includes("already registered")) return "Email này đã đăng ký. Hãy đăng nhập.";
  if (m.includes("email not confirmed")) return "Bạn chưa xác nhận email. Mở email và bấm liên kết.";
  if (m.includes("password")) return "Mật khẩu chưa hợp lệ (ít nhất 8 ký tự).";
  return "Có lỗi xảy ra, thử lại.";
}
