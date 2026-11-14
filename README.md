# 大戰略 Web

六角格現代戰爭策略遊戲，純 HTML/CSS/JavaScript，無需建置。

## 執行

直接用瀏覽器開啟 `docs/index.html` 即可；或啟動本機伺服器：

```bash
python3 -m http.server 8765 --directory docs
```

然後開啟 http://localhost:8765

## 特色

- **16 個國家**：美、俄、中共、台灣、日、韓、北韓、菲、越、印、巴基斯坦、英、法、德、澳、以色列，採用 1990 年代初期的真實裝備與各自的作戰偏好；經 AI 循環賽平衡（多數國家勝率約 40–60%）
- **進化科技樹**：符合史實的後繼型號（如 F-16A → F-16B → F-16C、M48H → M60A3 → M1A2T），有的兵種可以進化、有的不行
- **經驗與王牌**：新兵 → 老兵 → 精銳 → 王牌，攻擊力與迴避率提升；進化需要對應階級。解放軍沒有經驗、王牌與進化，改以低價與數量取勝
- **工兵建設基地**：工兵可把己方城市建設為工廠、機場或港口（臨海）；新遊戲與遊戲中 ⚙️ 戰場設定可開關
- **觀戰模式**：⚙️ 戰場設定隨時切換雙方玩家／電腦與 AI 風格，兩方皆電腦即可觀戰
- **搭載兵種**：運輸卡車、運輸直升機、運輸機、登陸艦、軍用列車、航空母艦（艦載機補給與起飛）
- **地圖**：小到終極大（54×33）五種尺寸，大地圖自動鋪設鐵路，也可自行延伸
- **劇情模式「昇龍 2031・六個時刻」**：依真實經緯度繪製、逐章放大的六張地圖（花蓮 22×14 → 台灣海峽全域 64×64），六章六個時刻：按兵不動 → 走出山區 → 日夜不休 → 跳或不跳（影響之後兵力）→ 制空（美日聯合擊沉敵航艦戰鬥群）→ 見好就收（終章抉擇）；對話人物有肖像，各章額外目標影響後續戰局與結局；部隊可跨章節繼承
- **經典規則**：合流（同型受損部隊合併兵力，源自 MD『スーパー大戦略』）、劇情夜間回合（夜間攻擊力下降，源自『ADVANCED WORLD WAR』晝夜制）、要員護衛（源自『鋼鉄の戦風』司令部部隊）
- 跨回合移動命令、寫實風部隊圖示（依真實型號造型：M1／豹 2／T-72／梅卡瓦砲塔、F-15／側衛／F-16／幻象平面形、神盾艦與現代級等；各國迷彩、軍服、鋼盔與國籍標誌）、五首管弦配樂（由 Google Lyria 3.5 產生，`docs/audio/`）與即時合成的音效（可開關）；3D 戰場（Three.js，可切回 2D）；各國各兵種專屬圖示（`icons_nat_*.js`）
- 存檔欄（可命名、自動存檔、匯出匯入）、手機橫向介面

舊版虛構劇情（聯邦篇、帝國篇）保存在 `fictional-v1` 分支；「第三次世界大戰」「福爾摩沙之盾」「乾為天」三部劇情與測試地圖已移除，可從 git 歷史取回。

## 檔案

| 檔案 | 內容 |
|---|---|
| `docs/js/data.js` | 地形與兵種數值 |
| `docs/js/map.js` | 隨機地圖產生 |
| `docs/js/game.js` | 遊戲規則：移動、戰鬥、佔領、回合 |
| `docs/js/ai.js` | 電腦 AI |
| `docs/js/campaign.js` | 劇情系統：任務地圖、勝敗判定、分支、繼承、配置回合 |
| `research/daisenryaku/` | 大戰略系列參考資料（FC／世嘉主機版數值、經典地圖、來源索引） |
| `docs/js/audio.js` | 背景音樂（載入 `docs/audio/track1–5.dat`）與音效（Web Audio 合成） |
| `docs/js/render3d.js` | 3D 戰場（Three.js，ES module；`docs/vendor/three.min.js` 為 r187 打包檔） |
| `docs/js/models3d.js` | 3D 部隊模型（程式產生的低多邊形模型，依兵種與國家組裝、合併為單一幾何並快取） |
| `docs/js/fx3d.js` | 3D 戰鬥特效（依兵種與目標選武器、彈道、粒子爆炸、碎片、擊毀殘骸演出） |
| `docs/js/icons_nat_*.js` | 各國專屬單位造型（防空與火砲、裝甲與步兵、航空器、艦艇），由 `icons.js` 的 `NAT_ICONS` 掛入 |
| `tools/iconsheet.js` | 產生「國家 × 兵種」圖示對照表（Playwright） |
| `docs/js/saves.js` | 存檔系統 |
| `js/campaign_sky.js` | 劇情「昇龍 2031」（由 `tools/skygen.js` 產生，勿手改） |
| `js/portraits.js`、`js/geo.js` | 對話人物頭像、世界地圖定位圖 |
| `tools/balance.js` | 劇情地圖檢查與 AI 自動對戰平衡測試 |
| `tools/mapgen.js`、`tools/maps.js` | 大地圖產生器：以經緯度海岸線、山脈、道路與據點畫出地圖字串（供 `tools/skygen.js` 使用） |
| `docs/js/icons.js` | 部隊圖示：型號造型對照、各國迷彩與國籍標誌 |
| `docs/js/render.js` | Canvas 繪圖與動畫 |
| `docs/js/ui.js` | 操作、面板、對話框 |

## 線上遊玩

https://war.jeffreylan.com （GitHub Pages）

## 平衡測試

```bash
node tools/balance.js --check          # 只檢查任務地圖
node tools/balance.js --runs 40        # 帝國篇每個任務 × 各路線模擬 40 場
node tools/balance.js t1 c5 --runs 20  # 指定任務
node tools/balance.js --nations --games 8  # 16 國循環賽
node tools/balance.js --duel L --vs A,B,C --games 40 --sizes s,m,l --turns 80 --jobs 4 --losses  # AI 風格對決（每張地圖換邊、固定亂數可重現、平行執行、列出敗局）
node tools/balance.js --chain fs --runs 60  # 整部戰役連續模擬（部隊延續、失敗重試）
node tools/balance.js f4 --carry 7,150     # 帶入 7 支經驗 150 的部隊測試單一任務
node tools/mapgen.js island --view          # 預覽大地圖與據點座標（island / strait / chain）
node tools/mapsync.js                       # 修改 tools/maps.js 後同步回任務地圖
node tools/balance.js --sweep fs --runs 40   # 帶入兵力掃描：每關用 0/4/8/12 支繼承部隊測試，標出 45–75% 以外的格子
```

AI 同時扮演雙方，統計玩家方勝率與平均回合數。真人通常比 AI 強，AI 勝率 40–70% 約等於「有挑戰但打得過」。
