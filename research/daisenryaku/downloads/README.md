# 下載資料清單

蒐集過程中下載（git clone）的第三方專案。**只收錄授權允許再散布的內容**；其餘只記錄來源與版本，方便日後重新取得。

| 專案 | 版本（commit） | 日期 | 授權 | 本專案收錄 |
|---|---|---|---|---|
| [kumakumapon/MiniStr](https://github.com/kumakumapon/MiniStr) | `dd46b66467b98027e912e5b4c29aba62232cd960` | 2026-10-25 | MIT | ✅ 相關設計文件（[`MiniStr/`](MiniStr/)，附 LICENSE） |
| [taotao54321/fc-daisenryaku](https://github.com/taotao54321/fc-daisenryaku) | `93185f17d563705f5437b4b8307c8adf08d8bdf9` | 2025-09-25 | 未標示 | ❌ 原文與圖片不收錄；數值事實已整理為 [`../fc-daisenryaku/`](../fc-daisenryaku/) |
| [hguyswow/Advanced_Daisenryaku_ko](https://github.com/hguyswow/Advanced_Daisenryaku_ko) | `591016bdd98956d00987132e3b7df25b131f12e5` | 2026-10-20 | 補丁未標示；遊戲著作權屬 SystemSoft | ❌ ROM 補丁不收錄；規模資訊見 [`../sources.md`](../sources.md) |
| [plastichyena/nowherelefttohide](https://github.com/plastichyena/nowherelefttohide) | `d0b08ccaf5969c00f8d021a2e0c2ff3d880121f3` | 2026-10-05 | PolyForm Noncommercial 1.0.0 | ❌ 117 MB 且與大戰略關聯有限，只附連結 |

重新取得：`git clone https://github.com/<專案> && git -C <目錄> checkout <commit>`

## MiniStr 收錄文件

Copyright (c) 2026 kumakumapon，MIT License（見 [`MiniStr/LICENSE`](MiniStr/LICENSE)）。內容未經修改。

| 文件 | 與本專案的關聯 |
|---|---|
| [`production-and-merge.md`](MiniStr/production-and-merge.md) | 部隊合流規則——本專案 v64「合流」的參考之一（另一參考為 MD スーパー大戦略 的合流制） |
| [`reviews/2026-09-27-zoc-design.md`](MiniStr/reviews/2026-09-27-zoc-design.md) | 大戰略式控制區（ZOC）設計 |
| [`frontline-logistics.md`](MiniStr/frontline-logistics.md)、[`finite-supplies.md`](MiniStr/finite-supplies.md) | 補給車前線補給、有限補給 |
| [`river-crossing.md`](MiniStr/river-crossing.md)、[`airlift.md`](MiniStr/airlift.md) | 渡河、空運 |
| [`campaign-operations.md`](MiniStr/campaign-operations.md)、[`coordinated-operations.md`](MiniStr/coordinated-operations.md)、[`reviews/2026-10-15-campaign-cpu.md`](MiniStr/reviews/2026-10-15-campaign-cpu.md) | 多戰場戰役、經驗繼承、協同作戰與戰役 AI |
