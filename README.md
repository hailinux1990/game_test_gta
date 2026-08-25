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
Thế giới 3D pixel	🆕 Thành phố MỞ RỘNG 9×9 block kiểu GTA 1 (gấp 3,2 lần diện tích cũ): đường nhựa, vạch kẻ, vỉa hè, tòa nhà mặt tiền cửa sổ pixel, cây cối. Render độ phân giải thấp + upscale pixelated
🆕 Bản đồ lớn qua SÔNG + CẦU	Dòng sông cắt ngang thành phố chia 2 miền bắc – nam; MỌI đại lộ đều có cầu bê tông lan can + vạch kẻ để xe cộ và người đi lại. Minimap vẽ sông màu xanh + sọc cầu
🆕 4 khu vực phong cách GTA 1	Cảng/khu công nghiệp (tây bắc), khu dân cư gạch đỏ (đông bắc), phố cổ (tây nam), trung tâm kính xanh (đông nam) — mỗi khu một bảng màu riêng; nhà mặt tiền trung tâm cao gấp 1,6 lần tạo skyline
Xe cộ di chuyển	20 xe (dân + xe cảnh sát có đèn nháy) tự lái theo tuyến đường trên bản đồ mở rộng, đi đúng làn, rẽ ở ngã tư, qua cầu. Nhân vật chính lên/xuống và lái xe (phím E)
🚗💥 Bắn xe nổ tung	Bắn trúng xe: TIA LỬA KÍN KÉT + tiếng kim loại + khói động cơ bốc lên từ xe hỏng, HUD hiện "còn X phát". Đủ số phát → NỔ TUNG: cầu lửa cam + lõi vàng, mảnh văng, cột khói bốc lên, vết cháy đen trên mặt đường, xác xe CHÁY ĐEN nghiêng nằm lại hiện trường
🚨 Xe cảnh sát TRUY ĐUỔI	Khi có sao truy nã: MỌI ô tô cảnh sát chuyển sang chế độ TRUY ĐUỔI — rượt thẳng người chơi tốc độ 13 (nhanh hơn xe thường), đèn nháy + CÒI HÚ, né chướng ngại vật khi lao qua các block. Hết sao → tự động rút lui về tuần tra bình thường
👮 Áp sát + cảnh sát nhảy xuống bắn	Xe cảnh sát áp sát đến ~11m thì PHANH NÓT DỪNG LẠI, mở cửa và một cảnh sát NHẢY XUỐNG XE (luân phiên 2 bên cửa), lập tức đuổi theo + BẮN người chơi trong tầm 16m (có kiểm tra tầm nhìn). Chạy thoát xa (>16m) thì xe tiếp tục truy đuổi và có thể triển khai cảnh sát lần nữa
🆕 Sát thương vụ nổ & NỔ DÂY CHUYỀN	Vụ nổ sát thương mọi NPC trong bán kính 6m (giảm theo khoảng cách) và cả người chơi nếu đứng gần; đang lái xe nổ thì bị văng ra ngoài kịp thời. Xe khác đỗ/đi trong bán kính 5.5m bắt lửa theo sau 0.35–1s → HIỆU ỨNG NỔ DÂY CHUYỀN
🆕 Fix đạn xuyên không (bản gốc)	Bản cũ đạn free-aim bị đẩy lên +0.12 nên bay VƯỢT QUA ĐẦU xe — xe gần như không thể trúng. Giờ đạn bay đúng về điểm mặt đất dưới tâm ngắm → đặt chuột lên xe là TRÚNG. Hitbox xe gồm đủ thân + cabin + capo + cốp
Trộm xe ô tô có người lái	Mỗi xe AI đều có tài xế ngồi trong cabin. Nhấn E gần xe đang có người → GIẬT XE: tài xế bị đẩy ra bỏ chạy (tài xế cảnh sát quay lại truy đuổi!), sao truy nã tăng (+1.2 dân / +2.2 cảnh sát). Xe đã stolen vào lại thoải mái
Chạm xe không chết + xe tự dừng	Người chơi KHÔNG BAO GIỜ bị xe cán chết. Xe AI tự phanh gấp và DỪNG LẠI khi người chơi đứng trước (~4.5m), hết đường thì chạy tiếp. Xe chỉ cán được NPC
Người chuyển động	~48 người dân + ~12 cảnh sát tuần tra khắp bản đồ mở rộng (BFS tìm đường trên lưới đường + cầu, không xuyên nhà, không rơi xuống sông)
Đánh NPC dân + cảnh sát, chảy máu	Hệ máu hạt + vệt máu loang trên nền, NPC chết ngã xuống rồi biến mất
Vũ khí: tay / dao / súng / AK-47	1 đấm tay (12 dmg), 2 dao (34 dmg), 3 súng lục (26 dmg, headshot 60), 4 AK-47 (30 dmg, headshot 75, ~10 viên/s, 500 viên + R nạp đầy)
AK-47 500 viên	Súng trường báng gỗ + băng đạn cong, 500 viên khởi đầu, tầm bắn 340 đơn vị, nổ xe chỉ sau 3 phát
Chỉnh tâm khi bắn NPC	Aim-assist ±7° (tối đa 120m, không bám xuyên tường) vào dân/cảnh sát → gần như luôn trúng, ngắm chính giữa ăn HEADSHOT. Tầm đạn: súng lục 220, AK-47 340

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
Smoke test headless 39/39 PASS (node tests/smoke.test.cjs): map 9×9 + sông/cầu/isInsideWater, spawn an toàn giữa giao lộ, 60 NPC + 20 xe đủ tài xế, AK-47 500 viên, aim-assist headshot/chest, xe phanh dừng 3.05m không hại player, giật xe có tài xế, BẮN 3 VIÊN AK → XE NỔ + xác cháy đen + NỔ DÂY CHUYỀN, và vòng đời TRUY ĐUỔI: có sao → xe cảnh sát chuyển pursuit → lao từ 30m áp sát DỪNG ở 7.6m → đúng 1 cảnh sát nhảy xuống đứng cạnh xe trong tầm bắn <16m → hết sao xe rút lui về traffic + cảnh sát hạ súng. Lưu ý: container không có GPU nên không chụp được ảnh render thật — mở link để xem trực tiếp.
