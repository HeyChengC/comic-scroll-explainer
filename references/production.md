# 从文案到交片

工程目录：`work/<日期>-<片名>/`，里面 `film/`（index.html + film.js + tokens.json + assets/）、`voice/`、`research/`、`看这里/`。
引擎在 skill 的 `engine/`，`render.py` 的小服务器把它挂到 `/engine/` 下，不往工程里拷。

## 1 文案和事实

- 骨架照卡 §4，句法照卡 §6。写完先数：字数 ÷ 7.9 ≈ 秒数，目标 150–270 秒（参考 160 / 275 秒）。
- 每一条事实（人名、年份、数字、研究、规定、引语）都要查到出处，记进 `research/facts.md`：原文怎么说、文案里怎么用、来源链接。查不实的说法不用，或者用"据说"并在 facts 里写明（例："从今天起绘画死了"是后人安上去的话）。
- 每条事实同时想好它的**原件**长什么样（论文首页、新闻标题、规定原文、书名页），没有原件的事实少用。
- 自报家门默认不加（taste.md 第 4 条）；用户要加时，身份和名字问用户，不自己编。

## 2 蓝图（给用户看的第一站）

| 步 | 这一题的决定 | 凭什么（← 卡几节） |
|---|---|---|
| 角度 | 一个有点冒犯人类自尊、又和每个观众有关的 AI 时代问题 | §4 角度 |
| 钩子 | A / B / C，三个机制不同（命题句、怪动物的反常识、一个数） | §4 钩子 |
| 比喻动物 | 是什么、它的哪个行为和论点同构、它的颜色（第二强调色） | §4 视觉世界 |
| AI 的样子 | 蓝色 + 按论点定的形象 | §4 视觉世界 |
| 主角的衣服 | 人站在哪一边 → 什么颜色 | §4 视觉世界 |
| 转手的东西 | 哪一件东西在角色之间传，代表论点 | 原理 2 |
| 每段的装置 | 每一档论点一件装置 | §7 |
| 刻意不同 | 和参考片不一样的 ≥ 3 处（一条都写不出 = 在搬内容） | transmission |

然后是**逐句导演表**。用 video-director 的通用列（时间、文案、观众此刻要懂什么、屏上是什么、怎么变、凭什么接上一格、读懂和停留），再加本风格的四列：

| 装置 / 物件 | 事件落点 | 版式动作 | 声音 |
|---|---|---|---|
| 这一格先落的东西；这一拍新放进来的东西 | 哪一行字幕的行首（默认）；"铺 / 落"两行时落在落的那一行 | 甩 / 弹 / 推 / 拉远 / 拉高 / 同框 / 满版 / 停 | 无 / 冲击低频 |

最后写**动作表**：每个事件从哪进、走什么路、多久、缓动、过冲、碰到什么、怎么离场、到位后的小动作。参数从 `tokens.json` 的 `motion` 里取，不凭感觉写。

## 3 配音和字幕

```
python <doubao-tts>/tts.py voice_text.txt voice.mp3 --speed 55 --style "语速偏快，口语化，像跟朋友聊天讲一个有意思的发现，偶尔带点自嘲"
python scripts/align_subs.py voice.mp3 voice_text.txt voice/v1 --prompt "专名1，专名2"
```

- `voice_text.txt` 里数字、英文写成读法（二零二三年、A I），`align_subs.py` 的 DISPLAY 表把它们换回字幕上的写法（2023年、AI）。新的专名加进 `--prompt`。
- 量一遍：`chars.json` 算整体字/秒（目标 7.7–8.0）、句间停顿（p50 0.14–0.17s，最长 < 0.55s）。慢了加 speed，停顿长了减标点。
- 字幕：一行 ≤ 14 字、按意群断、不加句末标点、比这一行第一个字早 0.2s、首尾相接没有空档。画面上的事件时刻用 `first_char_t`（真实发音），不用估算。

## 4 素材

**角色、动物、手、有质感的道具**（dog 对临跑通，14 张一次全出，画风没有重生）：
- 工具：环境变量 `QY_IMG` 指向一个 `img.py`（接口 `python img.py out.png "提示词" -i 风格参考.png --size 1024x1536 --model gpt-image-2`）。批量出图用 `python -X utf8 scripts/gen_assets.py jobs.json assets --ref 风格参考.png`（jobs.json 写 prefix + 每张的主体，每张提示词自动存同名 .txt，出完自动抠图，SSL 断了重试 3 次）。只用 `gpt-image-2`。两路并行。
- **每张都带一张风格参考图**（`-i`）。新片的风格参考就是这条片已经定稿的素材（主角定稿正面、第一张出得好的道具），不用参考片的截帧。
- 提示词 = 风格前缀 + 这一张的主体 + 后缀：
  - 前缀（起作用的几句）："Flat 2D editorial comic illustration in exactly the same drawing style as the reference image: bold warm-black ink outlines (#181812) with slight line-weight variation and **tapered stroke ends**, flat colors, **every shadow is one flat darker shade of the same color**"，再**写死色值**（这一条片 tokens 里的纸色、灰、AI 蓝、比喻色、肤色）。用网点的片加一句"plus a fine 45-degree halftone dot screen ONLY inside shadow areas and on grey surfaces"。
  - 主体：只写这一张要的东西 + 姿势 + 朝向（"facing LEFT"大写有用）。**比例和姿势要写具体**：头和身子的比例、项圈 / 手在哪、手臂朝哪伸、镜头高低（"seen from a very low camera"）、物件的宽高比。dog 对临里没过 2% 位置判据的 4 处，全是这一类没写清楚。
  - 后缀：主体单独、居中、四周留边，纯品红底 #FF00FF，不要字。
- **网点**：角色、动物让生图直接画（格距、点径和参考差 2–5%）；引擎铺网点只给引擎自己画的东西（地板、墙、聚光外圈）。平涂素材再让引擎猜阴影铺网点，漏掉暗面（只抓到 6.8%），不用。
- 半成品素材可以拼：手机外壳用生图，屏上的字、灰线、袖子用 SVG 补。
- 量位置用全尺寸帧逐像素量（`scripts/measure/`），不要用 0.2s 的小拼图估坐标（误差 30–200 px）。

**主角姿势库**（用户本人的卡通形象，已跑通）：
```
python -X utf8 scripts/gen_me.py 姿势表.json assets/me --master assets/me/raw/me_master.png --refs <用户照片目录> --par 3
```
- 先出一张定稿正面（`me_master`），用户认了再出姿势；之后每个姿势都带三张参考图：定稿正面（画风、比例）+ `ref_face.jpeg` + `front_master.png`（长相）。
- **参考图要传品红底的原图，不要传抠好的透明 PNG**：透明底传进去，生图会把背景画成黑的（2026-11-05 `phone` 那张）。
- 一个姿势一句话，写清楚朝向、手在哪、表情；要道具就写进去，道具别是品红或白色。
- 生成偶尔断网（SSL 报错），`gen_me.py` 会重试 3 次；已有的不重生，删掉原图再跑就重生那一张。
- 抠图：`scripts/cutout.py <raw> <cut>`（四边取样估底色 → 洪水填充 → 封闭的品红空隙另外挑出来 → 2 px 羽化 → 去溢色）。看 `cut/_sheet.jpg` 查品红残边。

谁做什么：

| 生图 | 代码（引擎构件） |
|---|---|
| 主角（用户卡通）的每个姿势、换装 | 格子、格线、页面 |
| 比喻动物的每个姿势 | 片名大字、字幕、名字标签、爆字 |
| AI 的形象（机器人、机械手） | 集中线、速度线、冲击线、圈、箭头、虚线 |
| 具名真人 | 气泡和逐字打出 |
| 场景底图（海底、教室、街道） | 文件版面（报纸、论文首页、帖子、诏书、黑板字、计算器屏） |
| 有质感的道具（垃圾桶、天平、礁石） | 复制成一大片的东西（狗头星球、人群剪影） |
| — | 网点、简单几何道具（药瓶、箱子、计数牌） |

## 5 渲染

```
python engine/render.py film --sheet 16          # 全片 16 帧拼一张，先看这个
python engine/render.py film --stills 2.5 8.5    # 样式帧
python engine/render.py film --motion 8.2 10.6   # 一段 12 帧，看转场和动作
python engine/render.py film --compare ref.mp4 3.0 12.5   # 和参考片同一时刻上下并排（只在对临时用）
python engine/render.py film --clip 0 30 head    # 渲一段
python engine/render.py film --det               # 确定性自检
python engine/render.py film                      # 全片（默认软件渲染，约 134 ms/帧）
python engine/render.py film --mux renders/raw.mp4 voice/final.wav 0 final   # 合上声音
python engine/render.py film --size 720           # 720p 预览 → renders/raw_720.mp4
python engine/render.py film --safe --sheet 12    # 叠安全区红框自查
```

先出 720p 预览自己看（`--size 720`，可配 `--clip`），改到满意再出 1080p 成片。渲染单路；内存紧时不要 `--jobs`。

## 6 声音

- 人声在最前，整体 RMS 约 −17 dBFS，峰值 ≤ −1 dBFS。
- 配乐：用 paper-sticker-explainer 的配乐库（`~/.claude/skills/paper-sticker-explainer/bgm/`，Mixkit 免费授权），全程一首，压在人声下 17–22 dB；三分钟以上的片用 `chill_nightsky`（4:17）或接一次循环。
- 音效：只给物理冲击（落地、砸下、推倒、盖章），一下短的低频，比人声低约 20 dB。甩镜、弹入、标签、画圈、打字、冒出都不配。
- 音效密度（定稿，覆盖旧写法）：**冲击低频**全片平均每分钟 ≤ 3 下；**钩子段**（前 20 秒）可以到 3 下 / 20 秒，这是全片唯一能密的地方。爆字和低频不是一一对应：爆字按卡 §12 的密度画（sea 5–8 个/分），只有其中**最重的那几下**（砸下、推倒、拍平、踢散）配低频，其余爆字不配声。超了就先删轻的那几下低频，爆字留着。

## 7 样片前自查（这就是这个风格的回归，每条片都跑；用户每指出一个问题加一行）

| # | 查什么 | 怎么查 | 过关线 |
|---|---|---|---|
| 1 | 甩镜间隔 | `python scripts/measure/scroll.py renders/raw.mp4 my --out review/measure` 再 `python scripts/measure/moves.py my --out review/measure`；或直接数 film.js 里 `cam` 的关键帧 | p50 3.5–5.5s；没有 > 10s 不甩的一段（除非是一个过程正在画） |
| 2 | 甩镜手感 | `--motion <甩镜前 .1> <甩镜后 .1> 16` 看逐帧位移；film.js 里 `cam` 的 `e`、`go` 对 tokens | power1.inOut（sea）/ sine（dog），不过冲；时长在 tokens 的区间里；sea 每次甩镜都有 `K.whipLines` |
| 3 | 每句的动词有没有发生 | 导演表逐句标"演 / 停"，数 | 演的句子 ≥ 50%；停的句子都是提问、过渡、"铺"的那行 |
| 4 | 新格先落什么 | `--motion` 看每次甩镜后 0.5s | 先是物件 / 装置 / 原件，人后到。例外（卡 §9）：用"同一个角色带过去"接的那一格，角色开场就在，算过 |
| 5 | 原件 | 列出全片每条事实，对上它的原件 | 每条事实都有；字是真排版、读得出 |
| 6 | 音效 | `--events` 出 audio/events.json，数冲击低频 | 全片平均每分钟 ≤ 3 下、钩子段（前 20 s）≤ 3 下；都在最重的冲击上（见第 6 节）；人声比配乐高 17–22 dB（`ffmpeg -af volumedetect` 分别量） |
| 7 | 字幕 | `--stills` 截 3 帧量字幕条；字幕时间对 `align_subs.py` 的输出 | 中心 (519, 1250)；54 px；早 0.14–0.27s；首尾相接；没有一行 > 14 字 |
| 8 | 颜色 | `python scripts/measure/flatpal.py renders/raw.mp4 my 60 --out review/measure`；film.js 里搜写死的色值 | 饱和色只有 AI 蓝 + 一个比喻色（tokens `film.accent`，爆字、圈、线默认就是它）；AI 以外没有蓝（主角站 AI 那边时除外）；比喻物本身和 AI 蓝撞色时，比喻物画成它第二有辨识度的颜色，见卡 §4 |
| 9 | 爆字 | 数 | 只在冲击上；密度在 §12 的区间里 |
| 10 | 主角像不像本人 | 姿势库总表 vs 用户照片并排 | 用户认得出是自己（第一次由用户判，之后照用户认可的那一版） |
| 11 | 素材画风统一 | 全片素材拼一张总表 | 线宽、阴影、头身比一致；没有一张写实或 3D |
| 12 | 安全区 | `--safe --sheet 12` 叠红框看（矩形在 tokens `safe_zone` / `Q.SAFE`） | 右侧 x 940–1080 × y 820–1560、底部 y > 1560、顶部 y < 160 里没有要读的东西（字、关键物件、小屏） |
| 13 | 机器检查 | `ffprobe` 看时长、分辨率、fps；`ffmpeg -af ebur128` 看响度；`ffmpeg -vf blackdetect,freezedetect=n=0.003:d=1.2 -f null -` 查黑帧、冻帧 | 时长 = 配音长度 ±0.1 s；1080×1920 30 fps；整体约 −17 dBFS RMS、峰值 ≤ −1；没有黑帧；没有 > 1.2 s 的冻帧（除非是刻意停的那一格） |
