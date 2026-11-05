# Cập nhật website hvu-blue-bank — hiện ảnh và đáp án đúng

## Cách cập nhật
1. Vào repo hvu-blue-bank (GitHub) > Add file > Upload files, kéo 5 file trong gói này vào thư mục gốc
   (index.html, style.css, app.js, export-utils.js, gpa.js). Commit.
2. Chờ GitHub Pages triển khai, mở website, nhấn Ctrl+Shift+R.
3. Bấm "Làm mới" trên web (không cần token mới: token Contents: Read của repo hvu-question-data đọc được cả ảnh).

Chỉ app.js, export-utils.js, style.css có thay đổi; index.html và gpa.js giữ nguyên.

## Web làm được gì
- Ảnh câu hỏi: đọc từ thư mục images/ trong repo hvu-question-data (do tiện ích V4.5 đẩy lên), hiện ngay trong danh sách.
  Ảnh chưa có trên GitHub hiện dòng "Ảnh chưa có trên GitHub..." thay cho ảnh hỏng.
  Ảnh được lưu cache trên trình duyệt nên lần sau mở nhanh và xem được khi mất mạng.
- Đáp án đúng: câu nào đã được xác nhận (từng đạt 100%) thì lựa chọn đúng nền xanh, kèm "✓ Đáp án đúng".
- Xuất Word: nhúng ảnh thật và đánh dấu "✓ ĐÚNG". Xuất Excel: có thêm cột ĐÁP ÁN ĐÚNG (1/2/3/4) khi môn có câu đã biết đáp án.

## Điều kiện để thấy ảnh và đáp án
- Trong tiện ích: bấm "Đồng bộ ngay" (V4.5) để đẩy data/hvu-bank.json (có đáp án đúng) và images/ lên GitHub.
- Câu chưa có ảnh trong máy: mở câu đó trên LMS một lần để tiện ích bắt ảnh, rồi đồng bộ lại.
- Câu chưa từng đạt 100% thì chưa biết đáp án đúng nên web không đánh dấu.
