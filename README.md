# game_test_gta
PIXEL CITY — game thế giới mở top-down 3D kiểu GTA Chinatown Wars
▶ Chơi ngay: http://127.0.0.1:8123/ (server đã chạy ở background). Hoặc mở trực tiếp file index.html — game chạy offline, không cần mạng vì Three.js đã tải về local.

File đã tạo
index.html — giao diện: HUD máu, sao truy nã, bảng chọn vũ khí, đạn, minimap, crosshair, màn hình bắt đầu / WASTED
js/game.js — toàn bộ logic game (~1300 dòng, thuần Three.js)
lib/three.min.js — engine Three.js r128 (bản local)
Các tính năng theo đúng yêu cầu

Yêu cầu	Đã làm
Thế giới 3D pixel	Thành phố 5×5 block: đường nhựa, vạch kẻ, vỉa hè, tòa nhà (mặt tiền cửa sổ pixel), cây cối. Render ở độ phân giải thấp + upscale pixelated để có chất "pixel 3D"
Xe cộ di chuyển	15 xe (dân + xe cảnh sát có đèn nháy) tự lái theo tuyến đường, đi đúng làn, rẽ ở ngã tư. Nhân vật chính lên/xuống và lái xe (phím E)
Người chuyển động	~34 người dân đi lại, ~9 cảnh sát tuần tra dọc đường (dùng BFS tìm đường trên lưới đường, không xuyên tòa nhà)
Đánh NPC dân + cảnh sát, chảy máu	Hệ máu hạt + vệt máu loang trên nền, NPC chết ngã xuống rồi biến mất
Vũ khí: tay / dao / súng	1 đấm tay (12 dmg), 2 dao (34 dmg), 3 súng (bắn tia, headshot 60 dmg, 30 viên + R nạp đạn)


Điều khiển
WASD / mũi tên di chuyển · SHIFT chạy · Chuột ngắm · Click trái tấn công/bắn
1·2·3 đổi vũ khí · R nạp đạn · E lên/xuống xe
Hỗ trợ cảm ứng (joystick ảo + chạm để tấn công)
Cơ chế bổ sung (chất GTA)
Hệ truy nã 1–5 sao: đánh dân/cảnh sát làm tăng sao → cảnh sát bắn trả, truy đuổi; trốn sau ~12s để giảm sao
Xe có thể phát nổ khi bắn đủ, cán người đi đường gây máu + truy nã
Máu người chơi hồi dần, màn hình đỏ khi trúng đạn, "WASTED" khi chết rồi hồi sinh
Âm thanh thủ tục (WebAudio): súng, đấm, chém, va chạm, còi cảnh báo — không cần file ngoài
Kiểm chứng
Cú pháp JS hợp lệ (node --check)
Chạy headless (stub WebGL) toàn bộ logic: 0 lỗi, world tạo đúng (minimap vẽ đầy), 5 sao truy nã, đạn giảm 30→27 khi bắn. Lưu ý: container này không có GPU nên tôi không chụp được ảnh render WebGL thật — vui lòng mở link để xem trực tiếp.
