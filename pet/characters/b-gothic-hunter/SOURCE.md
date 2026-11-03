# 暮色猎手 — Gothicvania Cemetery Pack（来源与许可）

- **角色 id**：`b-gothic-hunter`
- **显示名**：暮色猎手
- **作者**：ansimuz（Luis Zuno，OpenGameArt 用户）
- **许可**：**CC0 1.0 Universal（公共领域奉献）** — 可自由复制、修改、再分发，含商业用途，无需署名（本项目仍记录署名以示尊重）。
- **素材页**：https://opengameart.org/content/gothicvania-cemetery-pack
- **原始下载**：https://opengameart.org/sites/default/files/gothicvania-cemetery-files_1.zip （约 3.6 MB，内含逐帧 PNG）
- **下载日期**：2026-11-03

## 素材说明

ansimuz 的 *Gothicvania Cemetery* 哥特风平台跳跃素材包。主角是一位金色长发、紫黑大衣、
手持大剑的猎手（hero），包内按动作提供逐帧 PNG：
`PNG/Sprites/hero/hero-<action>/hero-<action>-<n>.png`，每帧统一 100×59 px 透明背景。
动作包含 idle（4 帧）、run（6 帧）、jump（4 帧）、attack（5 帧）、hurt（1 帧）、crouch（1 帧）。

> 说明：本角色最初尝试使用 ansimuz *Sunny Land* 包的小狐狸，但该角色是 33×32 的大头 Q 版，
> 腿部在源帧底边即被裁断，作为桌面宠物看起来像「只有头部」，因此整体替换为本素材包的全身猎手。

## 提取说明

- 直接从 zip 内复制官方逐帧 PNG（**未裁切、未改色、未重绘**，仅 `optimize=True` 重新编码）：

  | 状态 | 帧文件 | 源文件 | 帧数 |
  | --- | --- | --- | --- |
  | idle | idle_0–3.png | `PNG/Sprites/hero/hero-idle/hero-idle-1..4.png` | 4 |
  | working | working_0–4.png | `PNG/Sprites/hero/hero-attack/hero-attack-1..5.png` | 5 |
  | success | success_0–3.png | `PNG/Sprites/hero/hero-jump/hero-jump-1..4.png` | 4 |
  | error | error_0.png | `PNG/Sprites/hero/hero-hurt/hero-hurt.png` | 1 |

- 所有帧统一 100×59、透明背景、底边对齐（脚部贴帧底），各状态 fps 见 `skin.json`。
- 该角色手持大剑，剑身在画布左侧展开，因此人物躯干并非严格处于画布正中；这是原图集
  的构图设计（整帧画布居中渲染），四个状态的画布尺寸一致，不会上下/左右跳动。

## 合规说明

- 该素材为 OpenGameArt 页面明确标注的 **CC0** 条目，允许随插件再分发；ansimuz 长期以 CC0 发布素材。
- 不是从商业游戏/主机游戏中拆包的素材，也未使用 Pokémon/任天堂官方素材。
- 若未来替换，请保持 CC0 或更宽松许可，并同步更新本文件与 `skin.json` 的 author/license/source。
