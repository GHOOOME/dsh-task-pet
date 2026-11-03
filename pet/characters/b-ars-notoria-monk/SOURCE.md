# 白袍行者 — Hero spritesheets (Ars Notoria)（来源与许可）

- **角色 id**：`b-ars-notoria-monk`
- **显示名**：白袍行者
- **作者**：Balmer（OpenGameArt 用户）
- **许可**：**CC0 1.0 Universal（公共领域奉献）** — 可自由复制、修改、再分发，含商业用途，无需署名（本项目仍记录署名以示尊重）。
- **素材页**：https://opengameart.org/content/hero-spritesheets-ars-notoria
- **原始下载**：https://opengameart.org/sites/default/files/assets_3.zip （内含 `assets/player/player-spritemap-v9.png` 与 `assets/armor/robe05-spritemap.png`）
- **下载日期**：2026-11-03

## 素材说明

作者为游戏 *Ars Notoria*（DB32 调色板）制作的角色装备图集：8 套护甲、8 套长袍、8 种武器、头盔/帽子等，
全部图层共用同一张 **46×50 px 角色帧网格**（8 列 × 4 行），按「角色底层 + 装备叠加层」的方式合成角色。

## 提取说明

- **图层合成**：`player-spritemap-v9.png`（裸体角色底层）叠加 `robe05-spritemap.png`（白色长袍），
  使用 alpha 合成（`Image.alpha_composite`）。两层由同一作者、同一素材包、同 CC0 许可，且图集说明
  明确要求「armor spritesheets must be put on top of the player spritesheet」，属预期用法。
- **帧网格**：46×50 px，8 列 × 4 行；本皮肤取用以下单元（行, 列 从 0 开始计）：

  | 状态 | 帧文件 | 图集单元 (row, col) | 内容 |
  | --- | --- | --- | --- |
  | idle | idle_0–1.png | (0,0) (1,0) | 正面站姿 / 长袍被风带起 |
  | working | working_0–3.png | (0,2)–(0,5) | 正面出拳（站立、手臂挥动） |
  | success | success_0–1.png | (0,6) (0,7) | 跃起踢腿（庆祝） |
  | error | error_0–1.png | (2,0) (2,1) | 向后跌倒 / 倒地 |

  > 注：最初 working 用的是 (3,0)–(3,7) 的奔跑循环，但该图集为侧向冲刺帧、前倾幅度大，
  > 单人静态截图看起来像「斜躺/倒地」，因此改用 (0,2)–(0,5) 的正面出拳作为 working。
  > 其余未使用的图集行（空行/备用动作）不包含在本皮肤内。

- 每帧按网格原样裁切为 46×50 透明 PNG，**未改色、未重绘**；仅裁切 + `optimize=True` 重新编码。
- 各状态 fps 见 `skin.json`。

## 合规说明

- 该素材为 OpenGameArt 页面明确标注的 **CC0** 条目，允许随插件再分发。
- 不是从商业游戏/主机游戏中拆包的素材，也未使用 Pokémon/任天堂官方素材。
- 本角色由同包内的「角色底层 + 装备层」合成而来，若未来替换任一图层，须保持 CC0 或更宽松许可，
  并同步更新本文件与 `skin.json` 的 author/license/source。
