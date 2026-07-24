---
name: Repo import safety
description: Quy tắc bảo toàn cấu hình Replit khi đồng bộ mã nguồn từ repo bên ngoài
---

Khi đưa một repo GitHub vào workspace, không đồng bộ đè các thư mục cấu hình của môi trường như `.local/`, artifact metadata, hoặc workflow configuration; chỉ thay thế mã nguồn và manifest cần thiết.

**Why:** Đồng bộ toàn bộ thư mục repo đã làm mất đăng ký artifact, workflow và các skill cục bộ, khiến app vẫn chạy được nhưng màn hình xem trước không còn liên kết tự động.

**How to apply:** Sao lưu hoặc loại trừ cấu hình môi trường trước khi copy repo; sau khi nhập mã nguồn, kiểm tra artifact/workflow và đăng ký lại qua công cụ quản lý thay vì thao tác trực tiếp.