# Hướng dẫn sử dụng Internships.io

Internships.io là cổng kết nối sinh viên, doanh nghiệp và trường đại học. Website hỗ trợ tìm cơ hội thực tập, tạo hồ sơ, ứng tuyển và trao đổi với nhà tuyển dụng.

## Mở website

Nếu dự án chưa chạy, mở terminal tại thư mục dự án và chạy:

```bash
npm install
npm run dev
```

Sau đó mở địa chỉ được hiển thị trong terminal, thường là `http://127.0.0.1:5173`.

## Dành cho sinh viên

### Tìm việc thực tập

1. Mở trang **Việc làm**.
2. Nhập chức danh hoặc từ khóa vào ô tìm kiếm.
3. Nhập địa điểm nếu muốn giới hạn khu vực.
4. Chọn **Tìm kiếm**.
5. Dùng các bộ lọc nhanh như Tuyển gấp, Remote/Hybrid, phụ cấp hoặc thực tập tốt nghiệp.
6. Bấm biểu tượng đánh dấu trên tin tuyển dụng để lưu việc làm.
7. Bấm vào tên công việc để xem chi tiết.

### Ứng tuyển

1. Mở một tin tuyển dụng.
2. Chọn **Ứng tuyển ngay**.
3. Nhập email liên hệ và lời giới thiệu.
4. Chọn **Lưu đơn ứng tuyển**.

Đơn ứng tuyển có thể xem lại trong menu tài khoản, mục **Đơn ứng tuyển**.

### Hồ sơ cá nhân và CV

1. Bấm avatar ở góc phải.
2. Chọn **Xem hồ sơ cá nhân** để xem trang hồ sơ.
3. Chọn **Chỉnh sửa hồ sơ / CV** để cập nhật thông tin.
4. Chỉnh sửa thông tin cá nhân, mục tiêu, học vấn, dự án, kỹ năng và hoạt động.
5. Chọn **Lưu & Cập nhật hồ sơ** để lưu.
6. Chọn **Tải PDF** hoặc **Tải xuống** để mở màn hình in/lưu CV.

Thông tin CV được lưu trên trình duyệt hiện tại.

### Việc đã lưu và cài đặt

Bấm avatar để sử dụng các mục:

- **Việc làm đã lưu**: xem hoặc bỏ lưu công việc.
- **Cài đặt thông báo**: bật/tắt thông báo việc làm, tin nhắn và cộng đồng.
- **Đăng xuất**: xác nhận đăng xuất khỏi phiên hiện tại.

### Tin nhắn tuyển dụng

Mở mục **Tin nhắn**, chọn một cuộc trò chuyện, nhập nội dung và bấm **Gửi tin nhắn** hoặc nhấn Enter. Tin nhắn trong bản demo được lưu trên trình duyệt để xem lại sau khi tải lại trang.

## Dành cho doanh nghiệp

### Trung tâm tuyển dụng

Mở menu tài khoản và chọn **Quản lý tuyển dụng**. Tại đây có thể xem tổng quan tin đăng, lịch phỏng vấn và các chiến dịch tuyển dụng.

### Đăng tin thực tập

1. Chọn **Đăng tin tuyển dụng**.
2. Điền thông tin vị trí, chuyên ngành, phụ cấp, quyền lợi và mô tả công việc.
3. Chọn **Lưu nháp** để lưu lại nội dung.
4. Chọn **Tiếp tục sang Bước 2** để đi đến các phần tiếp theo.
5. Chọn **Đăng tin tuyển dụng ngay** khi hoàn tất.

### Quản lý ứng viên

Mở mục **Quản lý ứng viên** để xem pipeline, hồ sơ mới, ứng viên shortlisted, phỏng vấn kỹ thuật và offer. Có thể mở CV, chuyển vòng, lên lịch phỏng vấn hoặc đánh giá ứng viên.

## Cộng đồng và trường đại học

- **Cộng đồng**: xem bài viết, chia sẻ kinh nghiệm, lưu bài, ẩn bài hoặc báo cáo nội dung.
- **Hồ sơ trường**: xem thông tin trường, sự kiện hướng nghiệp và các doanh nghiệp đối tác.
- **Theo dõi**: chọn nút theo dõi để nhận cập nhật của công ty hoặc trường.

## Menu và thao tác chung

- Bấm avatar để mở menu tài khoản.
- Bấm biểu tượng chuông để xem thông báo.
- Bấm biểu tượng ba chấm để xem các tùy chọn của bài viết hoặc cuộc trò chuyện.
- Bấm ra ngoài menu hoặc nhấn `Esc` để đóng.
- Trên điện thoại, dùng thanh điều hướng ở cuối màn hình để chuyển giữa Việc làm, Cộng đồng, Tin nhắn và Hồ sơ.

## Lưu ý

Phiên bản hiện tại là frontend demo dùng dữ liệu mẫu. Các thao tác lưu hồ sơ, việc làm, đơn ứng tuyển và tin nhắn chỉ lưu trên trình duyệt. Đăng nhập thật, gửi dữ liệu lên máy chủ, chat realtime, upload CV, OAuth, AI Matching và gửi email cần được kết nối với backend.

Footer website sử dụng thông tin liên hệ của Internships.io. Các số liệu, tên công ty và thời gian hiển thị trên giao diện là dữ liệu mẫu phục vụ bản thiết kế.
