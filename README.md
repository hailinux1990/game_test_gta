# game_test_gta
PIXEL CITY — game thế giới mở top-down 3D kiểu GTA Chinatown Wars
▶ Chơi ngay: http://127.0.0.1:8123/ (server đã chạy ở background). Hoặc mở trực tiếp file index.html — game chạy offline, không cần mạng vì Three.js đã tải về local.

File đã tạo
index.html — giao diện: HUD máu, sao truy nã, bảng chọn vũ khí (4 slot), đạn, minimap, crosshair, màn hình bắt đầu / WASTED
js/game.js — toàn bộ logic game (~1500 dòng, thuần Three.js)
lib/three.min.js — engine Three.js r128 (bản local)
tests/smoke.test.cjs — smoke test headless (Node, không cần GPU): `node tests/smoke.test.cjs`
Các tính năng theo đúng yêu cầu

Yêu cầu	Đã làm
Thế giới 3D pixel	Thành phố 5×5 block: đường nhựa, vạch kẻ, vỉa hè, tòa nhà (mặt tiền cửa sổ pixel), cây cối. Render ở độ phân giải thấp + upscale pixelated để có chất "pixel 3D"
Xe cộ di chuyển	15 xe (dân + xe cảnh sát có đèn nháy) tự lái theo tuyến đường, đi đúng làn, rẽ ở ngã tư. Nhân vật chính lên/xuống và lái xe (phím E)
🆕 Trộm xe ô tô có người lái	Mỗi xe AI đều có tài xế ngồi trong cabin (nhìn thấy từ trên xuống). Nhấn E gần xe đang có người → nhân vật chính GIẬT XE: tài xế bị đẩy ra khỏi cửa, bỏ chạy (tài xế cảnh sát thì quay lại truy đuổi!), sao truy nã tăng (+1.2 dân / +2.2 cảnh sát). Xe đã stolen vào lại thoải mái, không cộng tội
🆕 Chạm xe không chết + xe tự dừng	Người chơi KHÔNG BAO GIỜ bị xe cán chết. Xe AI tự động phanh gấp và DỪNG LẠI khi người chơi đứng trước (~4.5m), hết đường thì lăn bánh tiếp. Xe chỉ cán được NPC đi đường
Người chuyển động	~34 người dân đi lại, ~9 cảnh sát tuần tra dọc đường (dùng BFS tìm đường trên lưới đường, không xuyên tòa nhà)
Đánh NPC dân + cảnh sát, chảy máu	Hệ máu hạt + vệt máu loang trên nền, NPC chết ngã xuống rồi biến mất
Vũ khí: tay / dao / súng / AK-47	1 đấm tay (12 dmg), 2 dao (34 dmg), 3 súng lục (26 dmg, headshot 60), 🆕 4 AK-47 (30 dmg, headshot 75, bắn nhanh ~10 viên/s, 500 viên + R nạp đầy 500)
🆕 AK-47 500 viên	Khẩu AK-47 súng trường (báng gỗ + băng đạn cong) với 500 viên đạn khởi đầu, tốc độ bắn nhanh, tầm bắn 340 đơn vị, nổ xe chỉ sau 3 phát
🆕 Chỉnh tâm khi bắn NPC	Aim-assist: đạn tự "bám" vào người dân/cảnh sát nằm trong nòng ngắm ±7° (tối đa 120m, không bám xuyên tường) → bắn GẦN NHƯ LUÔN TRÚNG; ngắm thật chính giữa thì ăn HEADSHOT. Đạn bắn xa hơn hẳn: súng lục 140→220, AK-47 340

Điều khiển
WASD / mũi tên di chuyển · SHIFT chạy · Chuột ngắm (tự chỉnh tâm) · Click trái tấn công/bắn
1·2·3·4 đổi vũ khí (tay / dao / súng / AK-47) · R nạp đạn (SÚNG 100 viên, AK-47 500 viên) · E lên xe / TRỘM XE
Hỗ trợ cảm ứng (joystick ảo + chạm để tấn công)
Cơ chế bổ sung (chất GTA)
Hệ truy nã 1–5 sao: đánh dân/cảnh sát, trộm xe làm tăng sao → cảnh sát bắn trả, truy đuổi; trốn sau ~12s để giảm sao
Xe có thể phát nổ khi bắn đủ (AK-47 chỉ cần 3 phát), cán người đi đường gây máu + truy nã
Máu người chơi hồi dần, màn hình đỏ khi trúng đạn, "WASTED" khi chết rồi hồi sinh
Âm thanh thủ tục (WebAudio): súng, AK-47, đấm, chém, va chạm, còi cảnh báo — không cần file ngoài
Kiểm chứng
Cú pháp JS hợp lệ (node --check)
Smoke test headless 19/19 PASS (node tests/smoke.test.cjs): spawn thế giới đủ NPC/xe + tài xế trong xe, AK-47 500 viên bắn/nạp, aim-assist trúng đích (headshot hoặc chest), xe phanh dừng ở khoảng cách an toàn 3.05m và player giữ nguyên 100 máu, giật xe có người lái → tài xế bỏ chạy + sao truy nã tăng, xe stolen không spawn thêm tài xế. Lưu ý: container này không có GPU nên tôi không chụp được ảnh render WebGL thật — vui lòng mở link để xem trực tiếp.
