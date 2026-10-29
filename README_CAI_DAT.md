# KHAIDEV BLUE BANK v4.1 — BẢN WEBSITE SÁNG + GPA + TỰ LƯU

## Tóm tắt thay đổi phiên bản 4.1

- Chuyển toàn bộ **website** sang giao diện **sáng, xanh dương**. Tiện ích Chrome giữ nguyên bản màu blue phiên bản 4.0 (không thay đổi logic thu thập hoặc dữ liệu).
- **Sửa lỗi không giữ cấu hình website**: tên repository được tự lưu khi nhập, thông tin kết nối được khôi phục khi tải lại. Token ở chế độ mặc định lưu trong **sessionStorage** (không mất khi F5 / tải lại cùng tab), sẽ mất khi kết thúc phiên trình duyệt. Nếu chọn “Ghi nhớ token lâu dài trên trình duyệt này”, token được ghi vào localStorage của website và được tự khôi phục giữa các phiên trình duyệt; **chỉ bật trên thiết bị cá nhân**.
- **Lưu bản offline ngân hàng câu hỏi** sau khi tải từ GitHub hoặc khi mở JSON trên website. Website ưu tiên **IndexedDB**, dùng localStorage dự phòng khi IndexedDB không khả dụng. Sau khi F5, bản đã lưu vẫn hiển thị, kể cả khi offline. GitHub vẫn là nguồn chính cho câu hỏi được đồng bộ từ tiện ích; website không gửi bài lên GitHub.
- Thêm **Tính điểm GPA** trong thanh mục lục, nhập tên môn, tín chỉ, điểm thành phần và điểm thi; thêm 1 hay 5 môn, xóa môn, làm trống (có xác nhận), tự lưu mỗi thay đổi vào localStorage; có xuất bảng GPA CSV mở được bằng Excel. Mobile hiển thị các thẻ nhập điểm riêng.

## Cập nhật website trên GitHub Pages (giữ dữ liệu cũ)

1. Giải nén gói `KHAIDEV_BLUE_WEB_V4_1.zip`.
2. Vào repository GitHub **public** đang lưu mã website (`hvu-blue-bank` hoặc tên bạn đã đặt).
3. Thay / tải mới **5 tệp tại thư mục gốc**: `index.html`, `style.css`, `app.js`, `export-utils.js`, `gpa.js`. Không cần tạo lại repo hay tạo token mới.
4. Giữ **repo dữ liệu private** `hvu-question-data` và tiện ích Chrome hiện tại không thay đổi. Đặc biệt, **không đẩy** Personal Access Token hoặc dữ liệu JSON cá nhân lên repository public.
5. Chờ GitHub Pages triển khai bản commit mới, sau đó mở website và dùng Ctrl+Shift+R để cập nhật tệp nếu trình duyệt còn dùng bản cũ.

### Cấu hình kết nối GitHub

- Mở phần cài đặt hình bánh răng, điền `username/hvu-question-data` và PAT được cấp **Contents: Read** (repo dữ liệu).
- Bấm **Tải dữ liệu**. Sau lần kết nối thành công, dữ liệu sẽ tự có lại ở lần tải trang tiếp theo và tự kiểm tra GitHub khi có token dùng được.
- Nút **Quên token** xóa token lưu phiên và token lưu lâu dài; dữ liệu câu hỏi đã cache và GPA **không bị xóa**.
- Token **không bao giờ nằm trong mã nguồn website GitHub Pages**. Ghi nhớ lâu dài bằng localStorage trên web có rủi ro nếu website bị cài script độc hại hoặc thiết bị bị chia sẻ; hãy dùng PAT **Read-only** để giảm thiểu.

### Cách tính GPA đúng theo ảnh mẫu

- Mặc định hệ số **điểm thành phần = 0,5**, **thi kết thúc học phần = 0,5**, có thể chỉnh; khi đổi một hệ số, hệ số còn lại tự bù để tổng là 1.
- Điểm môn (hệ 10) = điểm thành phần × hệ số thành phần + điểm thi × hệ số thi.
- GPA môn (hệ 4) = điểm môn (hệ 10) × **0,4**.
- GPA học kỳ (hệ 10) = tổng của (điểm môn × tín chỉ môn) / tổng tín chỉ của những môn đủ điểm.
- GPA học kỳ (hệ 4) = GPA học kỳ (hệ 10) × 0,4.
- Chấp nhận dấu phẩy như `9,4`, hoặc dấu chấm như `9.4`; môn chưa có đủ hai loại điểm hoặc số tín chỉ hợp lệ **không cộng vào kết quả học kỳ**. Chỉ áp dụng cho điểm từ 0 tới 10.

**Ví dụ kiểm tra:** `INT343 (3 TC, 9,4 / 9,2); LAW207 (2 TC, 8,2 / 8,2); MAT356 (3 TC, 9 / 6,8)` cho kết quả **8 TC; 9,3 / 8,2 / 7,9; GPA môn 3,72 / 3,28 / 3,16; GPA học kỳ 3,4 và 8,5**.

> LƯU Ý: 0,4 là **quy đổi tuyến tính đúng theo ảnh bạn đưa**, không phải cách quy đổi theo các mức chữ A/B/C/D/F của mọi trường đại học. Hãy kiểm tra quy định hiện hành của trường nếu sử dụng cho xét học vụ hay tốt nghiệp.

### Giới hạn lưu trữ

- Dữ liệu GPA và cấu hình **tự lưu trên thiết bị / trình duyệt này**, không tự đưa bảng điểm lên GitHub và không tự đồng bộ giữa điện thoại với máy tính. Hãy bấm **Xuất bảng điểm CSV** để sao lưu khi cần chuyển máy.
- Ngân hàng câu hỏi từ tiện ích tiếp tục đồng bộ lên repo private theo cấu hình tiện ích; khi mở website, dữ liệu sẽ được tải/cập nhật và cache offline.
- Chế độ ẩn danh, trình duyệt xóa dữ liệu website, hoặc chặn bộ nhớ web có thể khiến bản đã lưu bị mất. Việc lưu đám mây yêu cầu hệ thống lưu riêng và quyền GitHub ghi, **không mặc định bật**.
