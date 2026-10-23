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
- **搭載兵種**：運輸卡車、運輸直升機、運輸機、登陸艦、軍用列車、航空母艦（艦載機補給與起飛）
- **地圖**：小到終極大（54×33）五種尺寸，大地圖自動鋪設鐵路，也可自行延伸
- **劇情模式「第三次世界大戰」**：第一章台海戰爭爆發（金門、澎湖、台中），之後延燒到巴士海峽、朝鮮半島、富爾達缺口與台海決戰；4 種結局；每場開戰前有部隊配置回合，勝利後可選擇最多 6 支部隊繼承到下一場
- **劇情模式「福爾摩沙之盾」**：全程扮演國軍，1999 東沙 → 2003 馬祖 → 2008 台海空戰 → 2012 蘇澳 → 2016 淡水河 → 2020 全島防衛 → 2023 台海制海 → 2027 第一島鏈（後三章為 54×33 超大地圖）；部隊跨章節延續（最多 10 支，每關有部署名額，未部署的留待下一場）並持續進化；美軍、日本自衛隊、菲律賓援軍可自己指揮或交給電腦；共軍沒有經驗與進化，改以隨章節增加的兵力壓境
- 跨回合移動命令、寫實風部隊圖示（依真實型號造型：M1／豹 2／T-72／梅卡瓦砲塔、F-15／側衛／F-16／幻象平面形、神盾艦與現代級等；各國迷彩、軍服、鋼盔與國籍標誌）、即時合成的背景音樂與音效（可開關）
- 存檔欄（可命名、自動存檔、匯出匯入）、手機橫向介面

舊版虛構劇情（聯邦篇、帝國篇）保存在 `fictional-v1` 分支。

## 檔案

| 檔案 | 內容 |
|---|---|
| `docs/js/data.js` | 地形與兵種數值 |
| `docs/js/map.js` | 隨機地圖產生 |
| `docs/js/game.js` | 遊戲規則：移動、戰鬥、佔領、回合 |
| `docs/js/ai.js` | 電腦 AI |
| `docs/js/campaign.js` | 劇情系統：任務地圖、勝敗判定、分支、繼承、配置回合 |
| `docs/js/campaign_tw.js` | 劇情「第三次世界大戰」 |
| `docs/js/campaign_fs.js` | 劇情「福爾摩沙之盾」 |
| `docs/js/audio.js` | 背景音樂與音效（Web Audio 合成） |
| `docs/js/saves.js` | 存檔系統 |
| `tools/balance.js` | 劇情地圖檢查與 AI 自動對戰平衡測試 |
| `tools/mapgen.js`、`tools/maps.js`、`tools/mapsync.js` | 大地圖產生器：以經緯度海岸線、山脈、道路與據點畫出地圖字串，`mapsync` 寫回 `docs/js/campaign_fs.js` 標記 `// mapgen:<名稱>` 的地圖 |
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
node tools/balance.js --chain fs --runs 60  # 整部戰役連續模擬（部隊延續、失敗重試）
node tools/balance.js f4 --carry 7,150     # 帶入 7 支經驗 150 的部隊測試單一任務
node tools/mapgen.js island --view          # 預覽大地圖與據點座標（island / strait / chain）
node tools/mapsync.js                       # 修改 tools/maps.js 後同步回任務地圖
node tools/balance.js --sweep fs --runs 40   # 帶入兵力掃描：每關用 0/4/8/12 支繼承部隊測試，標出 45–75% 以外的格子
```

AI 同時扮演雙方，統計玩家方勝率與平均回合數。真人通常比 AI 強，AI 勝率 40–70% 約等於「有挑戰但打得過」。
