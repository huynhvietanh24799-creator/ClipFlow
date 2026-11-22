// Cầu nối tải video: chạy trên máy cá nhân, dùng yt-dlp. KHÔNG đưa lên Lovable.
// Chỉ nhận yêu cầu có đúng khóa và đến từ trang web được phép.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.BRIDGE_PORT ?? 8787);
const KEY = process.env.BRIDGE_KEY ?? "";
const ALLOWED = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const YTDLP = path.join(here, "bin", "yt-dlp");
const TMP = path.join(here, "tmp");
const MAX_BYTES = 1_500_000_000;
const MAX_HEIGHT = 720;
fs.mkdirSync(TMP, { recursive: true });

if (KEY.length < 16) {
  console.error("Thiếu BRIDGE_KEY (ít nhất 16 ký tự). Chạy bằng start.sh.");
  process.exit(1);
}

let busy = false;

function cors(req, res) {
  const origin = req.headers.origin ?? "";
  if (ALLOWED.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "X-Bridge-Key");
    res.setHeader("Access-Control-Expose-Headers", "Content-Length, X-Video-Title");
  }
  return ALLOWED.includes(origin);
}

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function send(res, code, text) {
  res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

const server = http.createServer((req, res) => {
  const originOk = cors(req, res);
  if (req.method === "OPTIONS") return send(res, originOk ? 204 : 403, "");
  if (!originOk) return send(res, 403, "Trang web này không được phép.");
  if (!safeEqual(String(req.headers["x-bridge-key"] ?? ""), KEY)) return send(res, 401, "Sai khóa cầu nối.");

  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/health") return send(res, 200, "ok");
  if (url.pathname !== "/fetch") return send(res, 404, "Không có đường dẫn này.");

  const target = url.searchParams.get("url") ?? "";
  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return send(res, 400, "Link không hợp lệ.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return send(res, 400, "Chỉ nhận link http/https.");
  if (busy) return send(res, 429, "Cầu nối đang tải video khác, thử lại sau ít phút.");

  busy = true;
  const id = crypto.randomBytes(6).toString("hex");
  const outTemplate = path.join(TMP, `${id}.%(ext)s`);
  const args = [
    "--no-playlist", "--no-warnings", "--newline",
    // Ưu tiên H.264 + AAC, tối đa 720p: bộ cắt trên trình duyệt không đọc ổn định AV1.
    "-f", "bv*+ba/b",
    "-S", `res:${MAX_HEIGHT},vcodec:h264,acodec:aac`,
    "--merge-output-format", "mp4",
    "--max-filesize", String(MAX_BYTES),
    "--print", "after_move:filepath",
    "-o", outTemplate,
    "--", target,
  ];
  console.log(`[${id}] tải: ${parsed.hostname}`);
  const child = spawn(YTDLP, args, { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => (stdout += d));
  child.stderr.on("data", (d) => (stderr += d));
  req.on("close", () => child.kill("SIGTERM"));

  const cleanup = () => {
    busy = false;
    for (const f of fs.readdirSync(TMP)) if (f.startsWith(id)) fs.rmSync(path.join(TMP, f), { force: true });
  };

  child.on("close", (code) => {
    const file = stdout.trim().split("\n").pop();
    if (code !== 0 || !file || !fs.existsSync(file)) {
      console.error(`[${id}] lỗi: ${stderr.trim().split("\n").pop()}`);
      cleanup();
      const hint = /sign in|bot|403|429/i.test(stderr)
        ? "Nền tảng đang chặn tải video này (cần đăng nhập hoặc nghi là bot)."
        : "Không tải được video từ link này.";
      return send(res, 502, hint);
    }
    const size = fs.statSync(file).size;
    res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": size });
    const stream = fs.createReadStream(file);
    stream.pipe(res);
    res.on("close", () => {
      stream.destroy();
      cleanup();
      console.log(`[${id}] xong ${Math.round(size / 1e6)}MB`);
    });
  });
});

server.listen(PORT, "127.0.0.1", () => console.log(`Cầu nối chạy ở http://127.0.0.1:${PORT}`));
