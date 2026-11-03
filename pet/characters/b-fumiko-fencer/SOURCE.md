# 绯红剑士 — Fumiko Complete Charset（来源与许可）

- **角色 id**：`b-fumiko-fencer`
- **显示名**：绯红剑士
- **作者**：skoam（OpenGameArt 用户）
- **许可**：**CC0 1.0 Universal（公共领域奉献）** — 可自由复制、修改、再分发，含商业用途，无需署名（本项目仍记录署名以示尊重）。
- **素材页**：https://opengameart.org/content/fumiko-complete-charset
- **原始下载**：https://opengameart.org/sites/default/files/Fumiko.png （864×256，RGBA）
- **下载日期**：2026-11-03

## 素材说明

作者 skoam 公开的完整像素角色图集（作者自述：这些素材以 CC0 发布，可用于商业与非商业用途），
角色为红发黑衣女剑士，包含站立、行走、挥剑等动作帧。

## 提取说明

- 图集按 **24×32 px 的帧网格**切分（行高 32 px、列宽 24 px；8 行，内容占用前 17 列，
  右侧其余列为空白）。帧网格尺寸是按图集内容间距实测确定的（相邻帧内容间距 2–6 px、
  列周期 24 px），图集本身未附带帧尺寸元数据。
- 本皮肤只使用图集中的以下单元（行, 列 从 0 开始计）：

  | 状态 | 帧文件 | 图集单元 (row, col) | 内容 |
  | --- | --- | --- | --- |
  | idle | idle_0–2.png | (2,0) (2,1) (2,2) | 正面站立、轻微换重心 |
  | working | working_0–3.png | (6,0) (6,1) (6,2) (6,3) | 举剑 → 挥砍 → 收势 |
  | success | success_0.png | (2,13) | 跃起/踢腿 |
  | error | error_0.png | (7,8) | 蹲身闪避（含挥砍残影） |

- 每帧按网格原样裁切为 24×32 透明 PNG，**未改色、未缩放、未重绘**；仅做无损裁切与
  `optimize=True` 重新编码（像素内容不变）。
- 各状态 fps 见 `skin.json`。

## 合规说明

- 该素材为 OpenGameArt 页面明确标注的 **CC0** 条目，允许随插件再分发。
- 不是从商业游戏/主机游戏中拆包的素材，也未使用 Pokémon/任天堂官方素材。
- 若未来需要替换，请保持 CC0 或更宽松许可，并同步更新本文件与 `skin.json` 的 author/license/source。
