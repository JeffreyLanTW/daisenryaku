# 大戰略 Web

六角格現代戰爭策略遊戲，純 HTML/CSS/JavaScript，無需建置。

## 執行

直接用瀏覽器開啟 `index.html` 即可；或啟動本機伺服器：

```bash
python3 -m http.server 8765
```

然後開啟 http://localhost:8765

## 特色

- **劇情模式**（兩套劇情，各 4 種結局，戰果與選擇會導向不同章節）
  - 「聯邦戰記」：扮演亞斯特聯邦，7 個任務
  - 「鐵血征途」：扮演瓦爾德帝國，6 個任務，從同一場戰爭的另一面揭開開戰真相

- 隨機點對稱地圖（平原、森林、丘陵、山岳、海洋、道路、橋樑）
- 12 種兵種：步兵、反戰車兵、偵察車、戰車、自走砲、多管火箭、防空車、防空飛彈、攻擊直升機、戰鬥機、攻擊機、驅逐艦
- 據點收入與生產（首都、工廠、機場、港口、城市）、佔領、補給修復、飛機燃料
- 地形防禦、控制區（ZOC）、反擊、間接火力、戰鬥預測
- 電腦 AI、玩家對戰（同機輪流）、電腦對電腦觀戰
- 存檔／讀檔（localStorage）、小地圖、縮放平移、觸控支援

## 檔案

| 檔案 | 內容 |
|---|---|
| `js/data.js` | 地形與兵種數值 |
| `js/map.js` | 隨機地圖產生 |
| `js/game.js` | 遊戲規則：移動、戰鬥、佔領、回合 |
| `js/ai.js` | 電腦 AI |
| `js/campaign.js` | 劇情系統與聯邦篇：任務地圖、對話、勝敗判定、分支 |
| `js/campaign_emp.js` | 帝國篇劇情 |
| `js/saves.js` | 存檔系統 |
| `tools/balance.js` | 劇情地圖檢查與 AI 自動對戰平衡測試 |
| `js/render.js` | Canvas 繪圖與動畫 |
| `js/ui.js` | 操作、面板、對話框 |

## 線上遊玩

https://war.jeffreylan.com （GitHub Pages）

## 平衡測試

```bash
node tools/balance.js --check          # 只檢查任務地圖
node tools/balance.js --runs 40        # 帝國篇每個任務 × 各路線模擬 40 場
node tools/balance.js m1 m4 --runs 20  # 指定任務
```

AI 同時扮演雙方，統計玩家方勝率與平均回合數。真人通常比 AI 強，AI 勝率 40–70% 約等於「有挑戰但打得過」。
