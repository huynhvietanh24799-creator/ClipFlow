# Kế hoạch xây dựng ClipFlow

## Mục tiêu
Tạo web app SaaS tiếng Việt giúp nhà sáng tạo nội dung và nhóm nhỏ gửi video dài để tạo quy trình chọn highlight, xem kết quả và tải clip. Giai đoạn đầu dùng dữ liệu mẫu để kiểm thử trọn luồng; chưa xử lý video thật bằng AI/FFmpeg.

## Trang và nội dung
- **Trang chủ `/`:** giới thiệu ngắn, ba bước sử dụng, nút bắt đầu và bảng giá Free / Pro / Agency.
- **Đăng nhập, đăng ký:** email và mật khẩu; trạng thái đăng ký thành công hướng dẫn xác nhận email nếu hệ thống yêu cầu.
- **Bảng điều khiển `/dashboard`:** số phút còn lại, gói hiện tại, nút nâng cấp, vùng kéo-thả MP4 hoặc nhập liên kết YouTube, lịch sử dự án và trạng thái xử lý.
- **Chi tiết dự án `/projects/$projectId`:** tối đa 10 thẻ clip tỷ lệ dọc, hook, điểm viral, mốc thời gian, caption có nút sao chép, nút tải và tải ZIP khi gói hỗ trợ.
- **Trạng thái rỗng, đang tải, lỗi, hết credit và thiết bị di động:** có thông báo dễ hiểu, chỉ rõ bước tiếp theo.

## Luồng sử dụng
1. Người dùng tạo tài khoản hoặc đăng nhập; tài khoản mới nhận 30 phút dùng thử.
2. Người dùng tải MP4 hoặc dán URL YouTube; hệ thống kiểm tra credit trước khi tạo dự án.
3. Nếu đủ credit, tạo dự án và trừ số phút tương ứng một lần; nếu không đủ, chặn tạo mới và đưa đến bảng giá.
4. Chạy mock pipeline khoảng 5 giây, cập nhật tiến độ và lưu 10 bản ghi clip mẫu cùng dự án.
5. Hiển thị danh sách clip mẫu; hỗ trợ sao chép caption và thao tác tải phù hợp với gói. Giao diện sẽ nói rõ video mẫu chưa phải tệp đã được AI/FFmpeg render.
6. Khi kết nối dịch vụ xử lý thật sau này, thay mock bằng điểm nhận webhook/API; giữ nguyên các trạng thái chờ, xử lý, hoàn tất và lỗi.

## Dữ liệu Lovable Cloud dự kiến
- **`profiles`:** liên kết một-một với tài khoản; lưu gói, số phút còn lại và thời điểm chu kỳ tháng. Chỉ chủ tài khoản đọc/cập nhật được hồ sơ của mình; cấp credit lần đầu an toàn và không lặp.
- **`projects`:** chủ sở hữu, tên, loại nguồn, URL/tên tệp, thời lượng tính credit, trạng thái, tiến độ, lỗi và thời điểm tạo.
- **`clips`:** dự án, thứ tự, hook, điểm viral, thời gian bắt đầu/kết thúc, caption và URL tệp đầu ra (để trống trong mock).
- Mọi bảng công khai sẽ có quyền truy cập rõ ràng và chính sách chỉ cho phép chủ sở hữu xem dữ liệu của mình. Trừ credit cần được bảo vệ khỏi gửi lặp hoặc chạy đồng thời.

## Quyền lợi gói
- **Free:** 30 phút/tháng; xuất tối đa 3 clip; có watermark.
- **Pro:** 300 phút/tháng; tối đa 10 clip; không watermark; crop 9:16.
- **Agency:** 1.500 phút/tháng; ưu tiên xử lý; tải hàng loạt ZIP.
- Tài khoản mới được tặng 30 phút dùng thử. Giá tiền chưa được cung cấp nên bảng giá chỉ hiển thị hạn mức và quyền lợi, không tự đặt giá.

## Phạm vi bản đầu
- Có giao diện tiếng Việt hoàn chỉnh và lưu dữ liệu/tình trạng dự án trong Lovable Cloud.
- Mock 5 giây sinh bản ghi clip mẫu; không tuyên bố đã phân tích AI, không tạo tệp MP4 thật và không tự giả định kết nối YouTube/FFmpeg.
- Chưa thu tiền, chưa xây cổng thanh toán và chưa kết nối dịch vụ xử lý video bên ngoài. Cấu trúc dự án giữ chỗ cho webhook/API và URL tệp đầu ra.

## Kiểm tra khi hoàn thành
- Kiểm tra hiển thị trên máy tính và điện thoại, các trang chính, trạng thái xác thực và điều hướng.
- Kiểm tra credit ban đầu 30 phút, chặn khi không đủ, trừ đúng một lần, pipeline kết thúc sau khoảng 5 giây và lưu 10 clip mẫu.
- Kiểm tra quyền truy cập dữ liệu theo chủ tài khoản, quyền lợi Free/Pro/Agency, sao chép caption và trạng thái tải mẫu.
