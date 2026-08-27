# game_test_gta
PIXEL CITY — game thế giới mở top-down 3D kiểu GTA Chinatown Wars

▶ Chơi ngay: http://127.0.0.1:8123/ — nếu trang không truy cập được, khởi động lại server bằng lệnh: `cd game_test_gta && python3 -m http.server 8123` (hoặc mở trực tiếp file index.html — game chạy offline, không cần mạng vì Three.js đã tải về local).

## File đã tạo
- **index.html** — giao diện: HUD máu, sao truy nã, khung vũ khí đang cầm, bảng chọn vũ khí (4 slot), đạn, minimap, crosshair, màn hình bắt đầu / WASTED
- **js/game.js** — toàn bộ logic game (~2000 dòng, thuần Three.js)
- **lib/three.min.js** — engine Three.js r128 (bản local)
- **tests/smoke.test.cjs** — smoke test headless (Node, không cần GPU): `node tests/smoke.test.cjs`

## Các tính năng theo đúng yêu cầu

| Yêu cầu | Đã làm |
|---|---|
| Thế giới 3D pixel | SIÊU BẢN ĐỒ 11×11 block (~484×484 đơn vị): đường nhựa, vạch kẻ, vỉa hè, mặt tiền cửa sổ pixel, cây cối. Render độ phân giải thấp + upscale pixelated |
| 🏙️ NHIỀU THÀNH PHỐ kiểu Đông Anh | 4 THÀNH PHỐ/TRUNG TÂM riêng biệt rải khắp map: trung tâm bắc sông, khu đô thị mới đông bắc, phố cổ tây nam, thành phố nam sông. Mỗi thành phố là CỤM CHÙM NHÀ CAO TẦNG như huyện Đông Anh — càng vào lõi càng cao (tối đa ~56m), tháp kính có nhà mái + ăng-ten |
| 🆕 FIX bị tòa nhà che khuất | Nhà cao tầng chắn giữa camera và nhân vật TỰ MỜ thành kính trong suốt (opacity ~0.15) rồi hiện lại đặc khi hết chắn — áp cho CẢ nhân vật chính LẪN người dân trong bán kính 45m → luôn thấy nhân vật và đường đi |
| 🆕 Bản đồ qua SÔNG + CẦU | Sông cắt ngang chia 2 miền bắc – nam; MỌI đại lộ đều có cầu bê tông lan can. Minimap vẽ sông xanh + sọc cầu |
| 🏎️ TỐI ƯU lái xe MƯỢT như xe thật | Fixed-timestep 60Hz tách khỏi tốc độ khung hình + NỘI SUY render giữa 2 trạng thái vật lý → xe trượt êm từng khung hình kể cả khi FPS tụt hay lag spike (không còn "dịch chuyển tức thời"). Vật lý xe thật: tăng tốc/gảm theo cấp số nhân (easing), GIỚI HẠN góc đánh lái, chủ động chậm lại trước khúc cua, phanh dừng mượt không giật cục |
| ⚡ Tối ưu render | ~400 vật liệu nhà chỉ bật chế độ trong suốt ĐÚNG LÚC fade chống che, còn lại vẽ opaque hoàn toàn → bỏ chi phí sắp xếp transparency mỗi khung hình |
| 🚗💥 Bắn xe nổ tung | Tia lửa kín kết + tiếng kim loại + khói động cơ; đủ số phát → NỔ TUNG: cầu lửa cam, mảnh văng, khói bốc, vết cháy đen, xác xe CHÁY ĐEN nằm lại hiện trường |
| 🚨 Xe cảnh sát TRUY ĐUỔI | Có sao truy nã: MỌI ô tô cảnh sát chuyển chế độ TRUY ĐUỔI — áp sát 13 u/s nhanh hơn xe thường, đèn nháy + CÒI HÚ, né chướng ngại vật. Hết sao → rút lui về tuần tra |
| 👮 Áp sát + cảnh sát nhảy xuống bắn | Xe áp sát đến ~11m PHANH MƯỢT DỪNG LẠI, một cảnh sát NHẢY XUỐNG (luân phiên 2 bên cửa), đuổi theo + BẮN trong tầm 16m (kiểm tra tầm nhìn). Chạy thoát >16m → xe tiếp tục truy đuổi, triển khai lần nữa |
| 🆕 Nổ dây chuyền & sát thương vụ nổ | Vụ nổ sát thương mọi NPC trong 6m (giảm theo khoảng cách) và cả người chơi nếu đứng gần; đang lái xe nổ thì bị văng ra kịp thời. Xe khác trong 5.5m bắt lửa sau 0.35–1s → NỔ DÂY CHUYỀN |
| 🆕 Fix đạn xuyên không | Bản cũ đạn free-aim bị đẩy lên +0.12 bay VƯỢT QUA đầu xe. Giờ đạn bay đúng điểm ngắm → đặt chuột lên xe là TRÚNG. Hitbox gồm thân + cabin + capo + cốp |
| Trộm xe ô tô có người lái | Mỗi xe AI đều có tài xế trong cabin. Nhấn E gần xe có người → GIẬT XE: tài xế bị đẩy ra bỏ chạy (tài xế cảnh sát quay lại truy đuổi!), sao tăng (+1.2 dân / +2.2 cảnh sát) |
| Chạm xe không chết + xe tự dừng | Người chơi KHÔNG BAO GIỜ bị xe cán chết. Xe AI phanh mượt và DỪNG khi người chơi đứng trước (~4.5m), hết đường thì chạy tiếp. Xe chỉ cán được NPC |
| Người chuyển động | ~58 người dân + ~14 cảnh sát tuần tra khắp các thành phố (BFS tìm đường trên lưới đường + cầu, không xuyên nhà, không rơi xuống sông) |
| Vũ khí đầy đủ | Tay đấm ✊ / dao 🔪 / súng lục 🔫 100 viên / AK-47 🔫 500 viên — đạn dự trữ riêng, R nạp đạn |
| 🎯 Chỉnh tâm khi bắn NPC | Aim-assist ±7° (tối đa 120m, không bám xuyên tường) → gần như luôn trúng, ngắm chính giữa ăn HEADSHOT. Tầm đạn: súng lục 220, AK-47 340 |
| 🆕 Nhân vật cầm vũ khí thật trên tay | Mỗi vũ khí là mô hình 3D gắn vào BÀN TAY PHẢI, di chuyển theo cánh tay: ✊ nắm đấm da màu, 🔪 dao lưỡi bạc chuôi gỗ, 🔫 súng lục báng nghiêng, 🔫 AK-47 nòng sắt + báng gỗ + băng đạn cong. Fix bug bản cũ: mesh bị gắn sai nằm dưới chân |
| 🆕 Icon HUD vũ khí đang cầm | Khung góc trái dưới: icon lớn (✊/🔪/🔫) + tên vũ khí, đổi tức thì theo phím 1·2·3·4 |

## Điều khiển
WASD / mũi tên di chuyển · SHIFT chạy · Chuột ngắm (tự chỉnh tâm) · Click trái tấn công/bắn
1·2·3·4 đổi vũ khí (tay / dao / súng / AK-47) · R nạp đạn (SÚNG 100 viên, AK-47 500 viên) · E lên xe / TRỘM XE
Hỗ trợ cảm ứng (joystick ảo + chạm để tấn công)

## Cơ chế bổ sung (chất GTA)
- Hệ truy nã 1–5 sao: đánh dân/cảnh sát, trộm xe, cho xe nổ làm tăng sao → cảnh sát bộ hành + ĐỘI XE CẢNH SÁT truy đuổi, bắn trả; trốn sau ~12s giảm sao, hết sao mọi lực lượng rút lui
- Xe AI đâm người đi đường KHÔNG cộng sao oan (chỉ khi chính bạn lái). Máu hồi dần, màn hình đỏ khi trúng đạn, "WASTED" khi chết rồi hồi sinh
- Âm thanh thủ tục (WebAudio): súng, AK-47, đạn dội kim loại, TIẾNG NỔ BIG BOOM, CÒI HÚ CẢNH SÁT, đấm, chém, va chạm — không cần file ngoài

## Kiểm chứng
- Cú pháp JS hợp lệ (`node --check`)
- Smoke test headless **56/56 PASS** (`node tests/smoke.test.cjs`): map 11×11 multi-city + 4 cụm thành phố cao tầng (73 tháp ≥25m, cao nhất ~56m) + sông/cầu; spawn an toàn; 72 NPC + 26 xe đủ tài xế; AK-47 500 viên; aim-assist headshot/chest; xe phanh dừng không hại player; giật xe có tài xế; BẮN AK → XE NỔ + NỔ DÂY CHUYỀN; vòng đời TRUY ĐUỔI cảnh sát đầy đủ; BIỂU TƯỢNG vũ khí trên tay + HUD icon; FIX CHE KHUẤT (fade 0.16 ↔ đặc 0.99); và **ĐỘ MƯỢT**: xe AI trượt tối đa ~0.16 đơn vị/khung hình ở 60Hz fixed-timestep — không giật khựng.

*Lưu ý: container không có GPU nên không chụp được ảnh render thật — mở link để xem trực tiếp.*
