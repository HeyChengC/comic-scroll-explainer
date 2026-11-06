# 竖屏漫画引擎（qy）

1080×1920、30 fps 的 SVG 引擎。画面是 `seek(t)` 的纯函数：只渲一段、只截几帧、乱序截都一样（`--det` 逐字节验过）。
世界是一张往下无限长的漫画页，镜头在页上"停、甩、停"；格子、集中线、爆字、标签、圈、气泡、字幕、角色都是返回 SVG 字符串的函数。

```
engine/
  qy.js       核心：时间与缓动、关键帧、SVG 拼串、量字、镜头与震屏、主题、tokens、网点、纸纹、Q.film
  kit.js      构件（QK）：格子、排版、集中线、下落线、描边字、片名、爆字、标签、圈、下划线、箭头、气泡、字幕、动作曲线、小件
  chars.js    角色（QC）：红脑子、机器人（头 / 全身）、男孩（正面 / 侧面 + 掀头盖）、柴犬；POSES 姿势表、walk 走路
  index.html  页面模板（new_film.py 拷进工程）
  render.py   逐帧截图 → ffmpeg；静帧、拼图、动作条、片段、全片、确定性自检、合音轨、和参考片并排
  new_film.py 建空工程
  fonts/      本地字体（全部 OFL，见 fonts/README.md）
  gallery/    16 s 构件演示：0–10.5 s sea 主题，10.5–16 s dog 主题（只在工作区，skill 里不带）
```

用 skill 里的引擎：`python <skill>/engine/new_film.py <工程> --theme dog --dur 130 --tokens <skill>/tokens.json`，之后 `python <skill>/engine/render.py <工程> …`。

## 命令

```bash
python new_film.py <工程> --theme sea --dur 160 --tokens ../tokens.json
python render.py <工程> --serve                      # 预览 http://127.0.0.1:8765/?play；?fit&t=12 停在 12 秒
python render.py <工程> --sheet 18                   # 全片均匀 18 帧 → review/sheet.jpg（先看这个）
python render.py <工程> --sheet 3.5 9 21.5           # 指定时刻
python render.py <工程> --motion 8.9 9.5 12          # 一段里 12 帧 → 看转场 / 动作
python render.py <工程> --stills 2.5 8.5             # 原尺寸 PNG
python render.py <工程> --clip 0 12 head             # 一段 → renders/head.mp4
python render.py <工程>                              # 全片 → renders/raw.mp4（--jobs 2 两路并行，上限 2）
python render.py <工程> --size 720                   # 720p 预览 → renders/raw_720.mp4（也能配 --clip / --sheet / --stills）
python render.py <工程> --safe --sheet 18            # 叠抖音安全区红框截图自查（预览页加 ?safe 一样）
python render.py <工程> --det                        # 确定性自检
python render.py <工程> --mux renders/raw.mp4 voice.wav 0.0 final   # 合一条外部音轨（偏移秒，正 = 声音晚进）
python render.py <工程> --compare 参考.mp4 0.5:0.45 17.5:4.4 --name sea   # 上参考、下我们 → review/compare_sea.jpg
python render.py <工程> --events                     # 构件里 Q.sfx() 登记的音效事件 → audio/events.json
```

速度：软件光栅化约 134 ms/帧（16 s gallery 480 帧 38 s）。默认关 GPU，因为 GPU 光栅化在两次启动之间会差 1 个色阶，
`--det` 和 `--jobs` 拼接都要求逐字节一致。只预览时 `QY_GPU=1` 快约 25%。

## film.js 的样子

```js
(function () {
const { cam, keys, rect } = Q, K = QK, C = QC, T = () => Q.T;
const [P1, P2] = K.stack(25, [863, 987]);                 // 第 1 页两格；页边 25、格宽 1030、格间 20 来自 tokens
const CAM  = [{ t: 0, x: 540, y: 960 }, { t: 3.6, go: .45, y: 2880 }];   // 到 3.6 s 时甩到第 2 页，0.45 s 甩完
const SUBS = [{ a: .2, b: 1.6, s: '人类存在的意义' }];
Q.film({
  dur: 6, theme: 'sea', assets: { rock: { src: 'assets/rock.png', w: 800, h: 520 } },
  draw(t) {
    let w = K.panel(t, P1, K.speedlines(t, P1) + K.title(t, [{ y: 330, size: 112, segs: [{ s: '人类存在的意义' }] }], { font: 'round' }));
    w += K.panel(t, P2, (lt) => Q.img('rock', 240, 1500, 600, 390) + C.brain(560, 1330 + K.dropY(t, 0, 660), { r: 130, eyes: t > 1 }), { fill: T().panel2 });
    w += K.burst(t, 830, 1500, '啪！', { t0: .67 });
    return { cam: cam(CAM, t), shake: [{ t: .67 }], world: w, ui: K.subtitle(t, SUBS) };
  },
});
})();
```

`draw(t)` 返回：`world`（世界坐标，跟镜头）、`screen`（屏幕坐标，纸纹下）、`ui`（屏幕坐标，纸纹上，字幕放这里）、`cam`、`shake`、`look`（`flash` 闪白、`fade` 压黑、`paper` 本帧纸纹强度、`bg` 底色）。
长片按页切函数，只画镜头附近的页（`if (t > a && t < b)`），一帧的节点数就不会涨。

## 时间、镜头、缓动

- `keys(list, t)`：关键帧 `{t, go, e, …数值}`，"到 t 时到位，go 秒走过来"，两帧之间保持。姿势、任何数值都能用。
- `cam(list, t)`：同上，默认 `power1.inOut`（`E.io2`），这是 tokens `camera.whip.ease`。sea 甩 0.45 s、dog 0.7 s，停住的时间占 55–67%。dog 甩镜用 `e: 'sine'`（`E.sine` = sine.inOut，dog 对临逐帧拟合最贴）。
- `shake`：`{t}` = 冲击（22 px、9 帧、指数衰减，tokens `camera.shake.impact`）；`{t, kind:'buzz'}` = 冒出时左右来回 4 px。`{t, kind:'seq', xs:[…], ys:[…]}` = 量出来的逐帧镜头偏移表（一帧一个，世界 px，正 = 镜头往右 / 下），放完就停；dog 开场 6 帧落定小晃就是这个。冲击震屏每分钟最多一次。
- `K.dropY(t, t0, 高)`：先提 30 px → power2.in 落 0.53 s → 冲过 38 px → 弹回（tokens `motion.drop`）。`K.popY(t, t0, 高, o)`：默认 0.07 s 冲上来、elastic 0.3 s 停稳；`o` 可覆盖 `{rise_s, overshoot_px, settle_s}`，或给预设名 `'dog_peek'`（tokens `motion.pop_up.dog_peek`：先探头 50 px、停 0.08 s、0.19 s 冲上来冲过 100 px、一帧弹回，不弹簧；也能直接给 `{peek_px, peek_s, wait_s, rise_s, overshoot_px}`）。
- 一律一拍一（tokens `canvas.cadence = 1`），不要用 `Q.q()` 量化。

## 构件（全部 `(t, …, o)` → SVG；`o.t0` 进场、`o.t1` 退场、`o.dur` 进场时长）

| 构件 | 签名 | 要点 |
|---|---|---|
| 格子 | `K.panel(t, [x,y,w,h], content, o)` | `content` 字符串或 `(lt)=>svg`，自动裁在格里。`o.content_t0`：框先在、到这个时刻内容硬切进来（dog 四格按台词一格一格进）。`o.in`：none / drop / up / down / left / right / pop / slam / fly（报纸从右上飞进、停在斜 3°）/ wipe / fade。`o.fill` 格底，`o.bw` 框宽（默认 10） |
| 排版 | `K.stack(y0, [h…])`、`K.row(rect, [比例…])` | 页边、格宽、格间读 tokens `page` |
| 集中线 | `K.speedlines(t, rect, {cx,cy,n,r,flick,color,ry})` | 楔形黑线，中间留白 = 对角线一半 × 0.4；默认每 3 帧重抽一次；`ry: .66` = 留白压成扁椭圆（dog 片名格，tokens `motion.burst_lines.ry_title`） |
| 放射短线 | `K.rays(cx, cy, r0, r1, {n, a0, a1, w, color, seed})` | 围着东西一圈两头尖的短梭（光团、火把、灯、狗盆）；a0..a1 度，0 = 右、顺时针 |
| 下落线 | `K.fallLines(t, rect, {n,speed,len})` | 东西掉下来时的竖线 |
| 甩镜速度线 | `K.whipLines(t, starts, {dur, n, w, len, colors, seed})` | sea 路线每次甩镜都要。`starts` = 甩镜开始时刻数组（和 `cam` 的关键帧对上：到位时刻 − go）；放在 `screen` 层：`return { …, screen: K.whipLines(t, WHIPS) }`。默认读 tokens `camera.whip.speed_lines`：8→20 根（甩镜中点最多）、宽 1–8、长 150–900、墨 / 深灰 / 灰三色、每帧重抽 |
| 描边字 | `K.ctext(str, x, y, {size,layers,fill,shadow,sk,fillW})` | layers 从外到内 `[[色, 宽]…]` |
| 片名 | `K.title(t, lines, {t0,stagger,font,shadow,cx})` | `lines=[{y,size,cx,segs:[{s, fill, sk, size, font, dy, gap, hl}]}]`；行级 `cx` = 这行自己居中；段的 `gap` 负 = 和下一段叠字（dog「狗」压「吗」用 −70）；`font:'round'` = 圆头粗字（sea），默认黑体（dog）；每 3 帧轻抖 |
| 爆字 | `K.burst(t, x, y, '砰！', {t0, shape:'star'|'none'|'sticker', size, fill, r})` | 星形字默认填 `T.accent`（没配就红）。0.8 → 1.04 → 1，8 帧；sea 0.85 s 后 4 帧淡出，dog 不退。`sticker` = 米白字 + 黑粗描边 + 右下黑投影（dog「吱呀」「啪！」「咔！」），5 帧 0.6 → 1，不抖 |
| ！牌 | `K.bang(t, x, y, {t0, s, r, fill})` | 竖的米白梭形「！」+ 黑点 + 投影（dog 手机两边），4 帧弹出 |
| 标签 | `K.label(t, x, y, '海鞘', {t0, size, shadow, r, w, h, pop, bg})` | 按主题：sea 白底 4 px 黑框、转 −4°、5 帧弹出；dog 米白底、正放、右下投影 7、不弹（`T.labelR / labelShadow / labelBg`）。`w/h` 定死框大小 |
| 圈 | `K.ring(t, cx, cy, r, {t0, t1, color, ry, ticks})` | 1 点钟起顺时针 6 帧、不闭合；不给 t1 就按参考闪一下就走；强调色圈（默认色）自带 9 根刺 |
| 下划线 / 箭头 | `K.underline(t, x0, x1, y)`、`K.arrow(t, [x,y], [x,y], {bend})` | 默认强调色（`T.accent`，没配就红），画出来 |
| 气泡 | `K.bubble(t, rect, {tail, lines, typing, shape, spread, centerStroke, dx, dy})` | `typing:true` = AI 对话框（蓝粗框 + 外黑线、19 字/秒、光标）；`{…}` 包住的字用蓝色。`shape:'ellipse'` = 椭圆和尾巴是一条闭合路径（接口不露描边），`spread` 尾巴根张角（弧度，默认 .3）；`centerStroke` 描边骑在边上（dog 气泡 bw 5）；整句不打字用 `cps:0, caret:false, align:'middle'` |
| 字幕 | `K.subtitle(t, [{a,b,s}])` | 深底条 88 高、圆角 20、白字 54/700、中心 (519, 1250)、左右留白 41（tokens `subtitle.center`、`bar.pad_x`）；硬切；太长缩字号不折行 |
| 小件 | `K.qmark`、`K.tape`、`K.sweat`、`K.vibe`、`K.popmarks`、`K.mark` | 问号气泡、胶带、汗滴、震动弧、迸线、角落的 ! |
| 脑子 | `C.brain(x, y, {r, eyes, look, blink, s})` | 手调路径；`s:[sx,sy]` 落地压扁 |
| 机器人 | `C.robot(x, y, {kind:'head'|'body', eyes, s, pose, chest:'brain'})` | 头：蓝壳黑屏；全身：浅蓝头蓝身灰关节 |
| 男孩 | `C.boy(x, y, {view:'front'|'side', pose, s, lid, eyes, mouth, brows, hair})` | 脚底为原点。`pose` 用 `C.POSES` 的名字或角度对象 `{aL,eL,aR,eR,hL,hR,kL,kR}`，可以 `keys()` 插值；`view:'side'` + `lid:0..1` 掀头盖露脑子 |
| 柴犬 | `C.dog(x, y, {s, look, ears, mouth})` | 脚底为原点 |
| 网点 | `Q.halftone({kind:'radial'|'linear'|'flat', …, max, clip})`、`Q.rimShade(shape, w)` | 45°、格距 5.7 px，档位 = 覆盖率 ×10；参考暗面 2–3 档。rimShade = 轮廓内侧一圈网点（dog 主题自动开） |
| 素材 | `Q.img(id, x, y, w, h)` | 见下 |

角色线宽按屏幕 px 算：角色放大缩小，线还是 4 px（tokens `lines.outline`）。

## 主题与 tokens

- 内置 `sea`（参考片甲：米黄纸、暖灰、红 + 蓝，无网点）和 `dog`（参考片乙：奶白、冷灰、蓝 + 橙、网点）。dog 格底填 `#f4f0e4`、纸纹 0.2（纸纹 multiply 会压暗约 4 级，这样渲出来才对上参考 `#f2eee2`；tokens `panel.fill.dog_render`、`grain.paper_strength`）。构件只认 `Q.T.<名字>`（`ink panel panel2 floor blue red fur skin hoodie sub stroke …`）。
- 工程目录里放 `tokens.json`（`new_film.py --tokens` 会拷），`Q.film` 启动时自动读。认两种格式：skill 自带的 `tokens.json`（`palette/panel/subtitle/lines/halftone/motion/camera`，`fromStudy` 翻译成主题）和引擎自己的 `{theme:{sea:{…}}}`。构件里用 `Q.tok('motion.sticker.in.duration_s', 默认)` 取量过的数。tokens 改了要重新拷进工程。
- **这条片自己的色板**：工程的 `tokens.json` 里加一段 `"film": {"accent": "#d8b44a", "accent_dark": "#a88428", "accent_light": "#ead9a0"}`（可选 `blue / blue_dark / blue_light` 覆盖 AI 蓝）。`accent` = 卡 §4 的第二强调色（比喻物的颜色），爆字、圈、下划线、箭头不传 `color` 时都用它，`T().accent` 在 film.js 里也能直接取。不配 `film` 段 → `accent` 为空，构件照旧用 `red`，和以前一样。
- **安全区**：`Q.SAFE = {right:[940,820,140,740], bottom:[0,1560,1080,360], top:[0,0,1080,160]}`（屏幕坐标 `[x,y,w,h]`，抖音 9:16：右侧按钮列、底部标题区、顶部标签栏）。字、关键物件、小屏这类要读的东西不进这三块；背景、地面、格框可以。`--safe` 截图或预览 `?safe` 会叠红框。字幕条（中心 y 1250）在安全区外，不用挪。
- 一条片中途换主题：`theme: t => t < 10.5 ? 'sea' : 'dog', themes: ['sea','dog']`。

## 什么用 SVG 画，什么用生图

用 SVG：格子、字、所有标注和特效、简单角色（男孩、机器人、脑子、柴犬）、几何道具（桌子、手机、报纸、石头）、网点和地面。
生图更划算的：**一屏好几个不一样的人**（人群、观众席、科举考场那一排排人）、**古典 / 写实人物**（苏格拉底、穴居人、肌肉、胡子、长袍褶）、**复杂实物**（老照片、电路板、古籍手稿、地图）。
生图要求：同一画风（粗黑线 4–6 px、平涂、最多一层阴影色块、主题色板里的颜色），**透明底 PNG**，一张图一个东西，别带格框和字。
放进来：`assets: { crowd: { src: 'assets/crowd.png', w: 原图宽, h: 原图高 } }`，画面里 `Q.img('crowd', x, y, w, h)`。
素材在 `<defs>` 里解码一次，`<use>` 引用；引擎在 READY 前预热（常驻一份几乎透明的 `<use>` + 全片跳 8 个时刻画一遍），第一帧不会漏图。

## 确定性规则

不用 `Math.random()`、`Date`、`performance.now()`（用 `Q.rng(seed)`、`Q.hash`）；不在构件里存跨帧的东西；字体和素材都登记在页面里；每帧 clipPath id 从 0 数。
纸纹是启动时按种子逐像素算的（ImageData），不是 canvas 画线，所以两次启动也一模一样。
