# game_test_gta
PIXEL CITY — game thế giới mở top-down 3D kiểu GTA Chinatown Wars
▶ Chơi ngay: http://127.0.0.1:8123/ — nếu trang không truy cập được, khởi động lại server bằng lệnh: `cd game_test_gta && python3 -m http.server 8123` (hoặc mở trực tiếp file index.html — game chạy offline, không cần mạng vì Three.js đã tải về local).

File đã tạo
index.html — giao diện: HUD máu, sao truy nã, bảng chọn vũ khí (4 slot), đạn, minimap, crosshair, màn hình bắt đầu / WASTED
js/game.js — toàn bộ logic game (~1500 dòng, thuần Three.js)
lib/three.min.js — engine Three.js r128 (bản local)
tests/smoke.test.cjs — smoke test headless (Node, không cần GPU): `node tests/smoke.test.cjs`
Các tính năng theo đúng yêu cầu



Điều khiển
WASD / mũi tên di chuyển · SHIFT chạy · Chuột ngắm (tự chỉnh tâm) · Click trái tấn công/bắn
1·2·3·4 đổi vũ khí (tay / dao / súng / AK-47) · R nạp đạn (SÚNG 100 viên, AK-47 500 viên) · E lên xe / TRỘM XE
Hỗ trợ cảm ứng (joystick ảo + chạm để tấn công)
Cơ chế bổ sung (chất GTA)
Hệ truy nã 1–5 sao: đánh dân/cảnh sát, trộm xe, cho xe nổ làm tăng sao → cảnh sát bộ hành + ĐỘI XE CẢNH SÁT truy đuổi, bắn trả; trốn sau ~12s để giảm sao, hết sao mọi lực lượng rút lui
Xe AI đâm người đi đường KHÔNG còn cộng sao oan (chỉ khi chính bạn lái xe đâm). Máu người chơi hồi dần, màn hình đỏ khi trúng đạn, "WASTED" khi chết rồi hồi sinh
Âm thanh thủ tục (WebAudio): súng, AK-47, đạn dội kim loại, TIẾNG NỔ BIG BOOM, CÒI HÚ CẢNH SÁT, đấm, chém, va chạm — không cần file ngoài
Kiểm chứng
Cú pháp JS hợp lệ (node --check)
Smoke test headless 54/54 PASS (node tests/smoke.test.cjs): map 11×11 multi-city + 4 cụm thành phố cao tầng (73 tháp ≥25m, cao nhất ~56m) + sông/cầu, spawn an toàn, 72 NPC + 26 xe đủ tài xế, AK-47 500 viên, aim-assist headshot/chest, xe phanh dừng không hại player, giật xe có tài xế, BẮN 3 VIÊN AK → XE NỔ + NỔ DÂY CHUYỀN, vòng đời TRUY ĐUỔI cảnh sát đầy đủ, BIỂU TƯỢNG vũ khí trên tay + HUD icon, và FIX CHE KHUẤT: tòa nhà chắn tầm nhìn mờ trong suốt (fade 0.16) khi đứng sau lưng nó → hiện lại đặc (0.99) khi đi xa. Lưu ý: container không có GPU nên không chụp được ảnh render thật — mở link để xem trực tiếp.
