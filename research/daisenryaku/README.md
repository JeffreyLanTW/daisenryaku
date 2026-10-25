# 大戰略參考資料庫

蒐集自 GitHub 及其連結來源的《大戰略》系列資料，供本專案設計地圖、兵種與規則時參考。蒐集日期：2026-10-25。

> 本目錄位於 `docs/` 之外，不會隨 GitHub Pages 發布。第三方內容只整理**遊戲數值事實**與**連結**，
> 不複製原作文字、圖片、ROM 或地圖檔；各來源的授權狀態見下表。

## 結論摘要

- **GitHub 上沒有任何公開的大戰略經典地圖資料**（バナナ・リパブリック、アイランドキャンペーン等皆無），也沒有官方或完整的兵種資料庫。
- GitHub 上唯一可直接取得結構化數值的是 **FC 版《大戦略》攻略頁**（地形 16 種、兵種 14 種、14×14 相性表），已轉成 JSON。
- 經典地圖只能從商業作品、書籍或 MSX 使用者地圖磁碟取得，皆無再散布授權，因此只記錄來源與已知資訊，見 [`classic-maps.md`](classic-maps.md)。

## 檔案

| 檔案 | 內容 |
|---|---|
| [`fc-daisenryaku/terrain.json`](fc-daisenryaku/terrain.json) | FC 版地形：移動消耗（B/C/D 型）、防禦加成 %、特例 |
| [`fc-daisenryaku/units.json`](fc-daisenryaku/units.json) | FC 版 14 兵種：類別、價格、移動力／移動類型、燃料、武裝與彈數 |
| [`fc-daisenryaku/matchup.json`](fc-daisenryaku/matchup.json) | FC 版 14×14 攻擊相性表（◎○△×） |
| [`fc-daisenryaku/rules.md`](fc-daisenryaku/rules.md) | FC 版規則重點（勝利條件、生產、補給、經驗、運輸、AI 行為） |
| [`classic-maps.md`](classic-maps.md) | 經典地圖：已知收錄作品、資料來源與取得途徑 |
| [`sega.md`](sega.md) | 世嘉主機（MD／SS／DC）大戰略：作品年表、MD スーパー大戦略 36 張地圖與 12 種生產類型、規則、戰役結構（9 組來源） |
| [`sources.md`](sources.md) | 其他 GitHub 專案與網站：用途、授權、可參考之處 |

## 來源與授權

| 來源 | 類型 | 授權 | 本目錄如何使用 |
|---|---|---|---|
| [taotao54321/fc-daisenryaku](https://github.com/taotao54321/fc-daisenryaku)（[網頁](https://taotao54321.github.io/fc-daisenryaku/)） | FC 版非官方說明書 | 未標示 | 只整理數值事實成 JSON，附出處 |
| [hguyswow/Advanced_Daisenryaku_ko](https://github.com/hguyswow/Advanced_Daisenryaku_ko) | MD《アドバンスド大戦略》韓文化 IPS 補丁 | 補丁本身未標示；字型 OFL | 只記錄 README 中的規模資訊 |
| [kumakumapon/MiniStr](https://github.com/kumakumapon/MiniStr) | 受大戰略啟發的同人戰略遊戲 | MIT | 只記錄設計參考點與連結 |
| [plastichyena/nowherelefttohide](https://github.com/plastichyena/nowherelefttohide) | 受大戰略啟發的殭屍六角格戰略 | PolyForm Noncommercial | 只附連結 |
| [MSX Translations：Super Daisenryaku 使用者地圖](https://www.msxtranslations.com/userlevels/superdaisenryaku.php) | MSX 地圖磁碟下載 | 未授權再散布（All rights reserved） | 只記錄清單、連結與格式說明 |

## 與本專案對照的用途

- `terrain.json` 的防禦值（森林 50%、山 60%、首都 50%）遠高於本專案 `docs/js/data.js`（森林 20%、山岳 40%、首都 40%），可作為「經典手感」平衡參考。
- FC 版的生產規則（只能在首都周圍一格、首都附近的都市與機場生產）、32 支部隊上限、補給車移動補給、航空部隊燃料 ≤5 墜毀，皆可作為規則選項。
- 相性表可對照本專案的 `atk: [步兵, 裝甲, 空軍, 艦艇]` 四類攻擊力設計。
