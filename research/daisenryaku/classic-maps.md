# 經典地圖

**GitHub 上找不到任何經典地圖的地形資料。** 以下整理已知的收錄作品與可取得的途徑，供日後自行重繪（以原創地形重新設計，而非逐格複製商業地圖）。

## 已知經典地圖

| 地圖 | 已知收錄作品 | 備註 | 來源 |
|---|---|---|---|
| バナナ・リパブリック（Banana Republic，香蕉共和國） | 『大戦略II』（1987）首次收錄；『大戦略SSB2』（2026）復刻，列於地圖一覽第 5 號 | SSB2 攻略站有地圖圖片，但該頁拒絕自動擷取（HTTP 403） | [アルテマ：大戦略SSB2 マップ一覧](https://altema.jp/daisenryakussb2/mapichiran)、[4Gamer：SSB2 發售消息](https://www.4gamer.net/games/946/G094686/20250919043/) |
| アイランドキャンペーン（Island Campaign） | 初代『現代大戦略』（1985），之後多部作品重製收錄 | 系列代表性地圖 | [AKIBA PC Hotline!：現代大戦略](https://akiba-pc.watch.impress.co.jp/docs/column/retrosoft/1218046.html) |
| 大海戦 | **未查到** | 可能名稱不同或屬其他作品，請提供更多線索（作品名、年份） | — |

## 地圖資料的可能取得途徑

| 途徑 | 內容 | 限制 |
|---|---|---|
| 書籍《大戦略シリーズ MAP FILE》（BNN，ゲームハンドブックシリーズスペシャル） | 系列全地圖集 | 商業書籍，需自行購買 | 
| 『大戦略II』キャンペーン版（PC-98） | 2 個 8 地圖戰役＋20 張單張地圖；另有作戰別地圖資料集 15 張 | 商業軟體 |
| 『大戦略パーフェクト』系列 `.dm3` 地圖檔 | 官方地圖編輯器格式；網路上有個人自製地圖（例：[2022 烏克蘭侵攻](https://selftravel.jp/wp/info/other/games/senryaku/ukraine3/)） | 需遊戲本體；格式未公開 |
| [MSX Super Daisenryaku 使用者地圖](https://www.msxtranslations.com/userlevels/superdaisenryaku.php) | 9 個 `.dsk` 磁碟映像，共約 146 張地圖（含 Microcabin 官方地圖集 30 張） | 未授權再散布；需 MSX 模擬器與地圖編輯器讀取 |
| FC 版《大戦略》 | 收錄 30 張地圖 | ROM 不可散布；地圖格式未公開 |
| 大戦略SSB2 | 50 張全新地圖（含バナナ・リパブリック） | 商業作品 |

## MSX《Super Daisenryaku》使用者地圖清單

| 磁碟 | 製作 | 地圖數 |
|---|---|---|
| Super Daisenryaku Map Collection | Microcabin | 30 |
| SuperDaisenryaku_jplevels1 | 不明 | 6 |
| SuperDaisenryaku_jplevels2 | 不明 | 13 |
| SuperDaisenryaku_django1 | Django | 25 |
| SuperDaisenryaku_django2 | Django | 6 |
| MoM converted campaigns | Master of Monsters 轉換 | 8 |
| MoM converted maps | Master of Monsters 轉換 | 20 |
| MoM map collection converted campaigns | Master of Monsters 轉換 | 8 |
| MoM map collection converted maps | Master of Monsters 轉換 | 30 |

另有 Map Collection 2（50 張）與 Takeru 版（50 張）列為遺失。

**檔案格式（頁面說明的轉換程序，僅部分）**：地圖存為 `MAPDATXX.DAT`（戰役為 `CAMDATXX.DAT`，名稱清單 `CAMNAME.DIR`），地圖名稱清單為 `MAPNAME.DIR`（奇數行為名稱，偶數行首位元組 `00`＝地圖、`01`＝存檔）。轉換 MoM 地圖時把位移 `0xC00` 起的資料搬到 `0x1000`，使檔案變為 8192 位元組。地形與部隊的位元組編碼未說明。
