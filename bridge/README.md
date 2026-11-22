# Cầu nối tải video (chạy trên máy cá nhân)

Web ClipFlow (Lovable) không tải được video từ YouTube, TikTok, Facebook... Cầu nối này
chạy trên máy bạn bằng yt-dlp, rồi web lấy video từ đó để cắt.

## Chạy

```bash
bash bridge/start.sh
```

Lần đầu script tạo file `bridge/bridge.env` (khóa ngẫu nhiên, không đưa lên GitHub) và in ra khóa.
Đợi dòng `https://....trycloudflare.com`, rồi dán địa chỉ đó và khóa vào mục
"Link YouTube, TikTok, Facebook..." trên trang /highlight. Địa chỉ đổi mỗi lần chạy.

## Cần có

- `bridge/bin/yt-dlp`: tải bản `yt-dlp_macos` từ https://github.com/yt-dlp/yt-dlp/releases/latest
  rồi `chmod +x`. Cập nhật thường xuyên vì nền tảng hay đổi.
- `ffmpeg` và `cloudflared` (đã có sẵn trên máy này), `node` 20 trở lên.

## An toàn

- Chỉ nhận yêu cầu có đúng khóa và từ trang web trong `ALLOWED_ORIGINS`.
- Chỉ mở cổng 127.0.0.1; ra ngoài chỉ qua Cloudflare Tunnel khi bạn chạy start.sh.
- Mỗi lần tải 1 video, tối đa 720p và 1,5GB; file tạm xóa sau khi gửi xong.
- Chỉ dùng cho video của bạn hoặc video bạn có quyền sử dụng; tuân thủ điều khoản nền tảng.
