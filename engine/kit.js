/* kit.js — 漫画构件。每个构件都是 (t, …) → SVG 字符串的纯函数，颜色从 Q.T（当前主题）取。
 * 时间参数统一：t0 = 进场开始，in = 进场方式，dur = 进场时长，t1 = 退场开始（不给 = 不退）。
 * 所有坐标都是世界坐标（放进 world）或屏幕坐标（放进 screen / ui），构件自己不关心在哪一层。 */
(function (G) {
'use strict';
const Q = G.Q, { clamp, lerp, seg, E, ease, rng, hash, noise1, el, g, path, rect, circle, ellipse, pts, text, measure, clip, esc, n2 } = Q;
const T = () => Q.T;
/* 进出包络：返回 {k: 进场进度 0..1, out: 退场进度 0..1, on: 是否可见} */
function life(t, o, din = .35, dout = .25) {
  const t0 = o.t0 == null ? -1e9 : o.t0, k = seg(t, t0, t0 + (o.dur == null ? din : o.dur));
  const out = o.t1 == null ? 0 : seg(t, o.t1, o.t1 + (o.dout == null ? dout : o.dout));
  return { k, out, on: t >= t0 && out < 1, lt: t - t0 };
}

/* ---------- 格子 ----------
 * panel(t, [x,y,w,h], content, o)
 *   content：SVG 字符串，或 (lt) => SVG（lt = 进场后的本地时间），坐标是世界坐标，自动裁在格子里
 *   o.in：'none' | 'drop'（从上掉下，落地小弹）| 'up' | 'down' | 'left' | 'right'（滑入）| 'pop'（从中心放大）
 *         | 'slam'（大且斜 → 拍平，像报纸拍到桌上）| 'wipe'（从上往下展开）| 'fade'
 *   o.t0, o.dur, o.ease, o.dist（滑入距离）, o.fill（格底色，默认 T.panel）, o.bw（框线宽）, o.under（格底之上、内容之下）, o.t1/o.out（退场，默认反着来）
 *   o.content_t0：框先在（空格），到这个时刻内容一下硬切进来（dog 四格按台词一格一格进） */
function panel(t, r, content, o = {}) {
  const [x, y, w, h] = r, L = life(t, o, o.in === 'slam' ? .32 : o.in === 'drop' ? .45 : o.in === 'fly' ? .5 : .4);
  if (!L.on) return '';
  const how = o.in || 'none', outHow = o.out || how;
  let p = how === 'none' ? 1 : L.k, gx = 0, gy = 0, s = 1, rot = 0, a = 1, wipe = 1;
  const dir = (hw, k) => {
    const d = o.dist || (hw === 'up' || hw === 'down' ? h * .55 + 240 : w + 60), e = 1 - k;
    if (hw === 'up') gy += d * e; else if (hw === 'down') gy -= d * e; else if (hw === 'left') gx += d * e; else if (hw === 'right') gx -= d * e;
  };
  const apply = (hw, k, enter) => {
    if (hw === 'drop') { const e = enter ? E.outBack(k, 1.1) : E.in2(k); gy += -(h + 300) * (1 - e); }
    else if (['up', 'down', 'left', 'right'].includes(hw)) dir(hw, enter ? ease(o.ease || 'out3', k) : 1 - E.in3(1 - k));
    else if (hw === 'pop') { const e = enter ? E.outBack(k, 1.4) : k; s *= Math.max(.001, e); a *= clamp(k * 3); }
    else if (hw === 'slam') { const e = enter ? E.out3(k) : k; s *= lerp(1.45, 1, e); rot += lerp(o.rot0 == null ? -9 : o.rot0, 0, e); a *= clamp(k * 4); }
    else if (hw === 'fly') { const e = enter ? E.out3(k) : 1 - E.in3(1 - k); gx += (o.dx == null ? 320 : o.dx) * (1 - e); gy += (o.dy == null ? -280 : o.dy) * (1 - e); rot += lerp(o.rot0 == null ? 10 : o.rot0, o.rot1 == null ? 3 : o.rot1, e); a *= clamp(k * 5); }
    else if (hw === 'wipe') wipe *= ease('io3', k);
    else if (hw === 'fade') a *= k;
  };
  apply(how, p, true);
  if (L.out > 0) apply(outHow, 1 - L.out, false);
  const bw = o.bw == null ? T().stroke.panel : o.bw, [cd, cid] = clip(rect(x, y, w, h * wipe));
  const inner = o.content_t0 != null && t < o.content_t0 ? '' : typeof content === 'function' ? content(L.lt) : (content || '');
  const body = cd + rect(x, y, w, h * wipe, { fill: o.fill || T().panel }) + g({ clip: cid }, (o.under || '') + inner)
    + (o.border === false ? '' : rect(x, y, w, h * wipe, { fill: 'none', stroke: o.bc || T().ink, 'stroke-width': bw, 'stroke-linejoin': 'miter' }));
  return g({ x: gx, y: gy, s, r: rot, px: x + w / 2, py: y + h / 2, a }, body);
}
/* 竖着排一列格子：stack(y0, [h1, h2, …], {x, w, gap}) → [[x,y,w,h], …]；h 也可以是 [w, h] 或 {x,w,h} */
function stack(y0, hs, o = {}) {
  const X = o.x == null ? Q.tok('page.margin_x', 25) : o.x, Wd = o.w == null ? Q.tok('page.panel_outer_w', 1030) : o.w, gap = o.gap == null ? Q.tok('page.gutter.value', 20) : o.gap; let y = y0;
  return hs.map(h => { const it = typeof h === 'number' ? { h } : Array.isArray(h) ? { w: h[0], h: h[1] } : h; const r = [it.x == null ? X : it.x, y, it.w || Wd, it.h]; y += it.h + gap; return r; });
}
/* 一行切成几格：row([x,y,w,h], [比例…], gap) */
function row(r, parts, gap = 20) {
  const tot = parts.reduce((a, b) => a + b, 0), free = r[2] - gap * (parts.length - 1); let x = r[0];
  return parts.map(p => { const w = free * p / tot, o = [x, r[1], w, r[3]]; x += w + gap; return o; });
}
/* ---------- 集中线 ----------
 * speedlines(t, [x,y,w,h], o)：从格子外缘射向中心 (cx,cy) 的楔形黑线，停在 r（中间留白的半径）。
 *   o.n 根数（~90）, o.r 留白半径, o.wMin/wMax 外端宽, o.seed, o.flick（每几帧重抽一次，0 = 不闪；参考片约 3 帧一跳）,
 *   o.t0/dur（进场：线从外往里长）, o.color, o.a, o.ry（竖向压扁：中间留白成扁椭圆，0.66 = dog 片名格；默认 1 = 圆） */
function speedlines(t, r, o = {}) {
  const L = life(t, o, .25); if (!L.on) return '';
  if (o.ry != null && o.ry !== 1) {   // 在拉高 1/ry 的坐标里画圆形留白，再压回来：线宽、根数和圆形版一致
    const [x, y, w, h] = r, cy = o.cy == null ? y + h / 2 : o.cy, ry = o.ry, [cd, cid] = clip(rect(x, y, w, h));
    const inner = speedlines(t, [x, cy - (cy - y) / ry, w, h / ry], Object.assign({}, o, { ry: 1, cy }));
    return cd + g({ clip: cid }, g({ py: cy, s: [1, ry] }, inner));
  }
  const [x, y, w, h] = r, cx = o.cx == null ? x + w / 2 : o.cx, cy = o.cy == null ? y + h / 2 : o.cy;
  const R = Math.hypot(Math.max(cx - x, x + w - cx), Math.max(cy - y, y + h - cy)) + 40, n = o.n || 56;
  const flick = o.flick == null ? 3 : o.flick, f = flick ? Math.floor(Q.frame / flick) : 0, rn = rng((o.seed || 7) * 1000 + f);
  const rin = (o.r == null ? Math.hypot(w, h) / 2 * Q.tok('motion.burst_lines.center_clear_frac', .4) : o.r), grow = ease('out3', L.k), col = o.color || T().ink;
  let d = '';
  for (let i = 0; i < n; i++) {
    const ang = (i + rn() * .8) / n * Math.PI * 2, ri = lerp(R, rin * (.8 + rn() * .55), grow), wd = (o.wMin || 2) + Math.pow(rn(), 2.0) * ((o.wMax || 9) - (o.wMin || 2));
    if (rn() < (o.skip || .12)) continue;
    const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy * wd / 2, ny = ux * wd / 2;
    d += `M${n2(cx + ux * ri)},${n2(cy + uy * ri)}L${n2(cx + ux * R + nx)},${n2(cy + uy * R + ny)}L${n2(cx + ux * R - nx)},${n2(cy + uy * R - ny)}Z`;
  }
  const [cd, cid] = clip(rect(x, y, w, h));
  return cd + g({ clip: cid, a: (o.a == null ? 1 : o.a) * (1 - L.out) }, path(d, { fill: col }));
}
/* 下落速度线：竖直细线在格子里往下刷（东西从上面掉下来时）。o.n, o.speed(px/s), o.len, o.seed, o.w */
function fallLines(t, r, o = {}) {
  const L = life(t, o, .15, .2); if (!L.on) return '';
  const [x, y, w, h] = r, rn = rng(o.seed || 3), n = o.n || 14, sp = o.speed || 2600, col = o.color || T().ink;
  let d = '';
  for (let i = 0; i < n; i++) {
    const lx = x + w * (o.x0 == null ? rn() : lerp(o.x0, o.x1, rn())), len = (o.len || 380) * (.5 + rn()), off = rn() * (h + len);
    const yy = y - len + ((off + L.lt * sp * (.7 + rn() * .6)) % (h + len)), ww = (o.w || 3) * (.5 + rn());
    d += `M${n2(lx)},${n2(yy)}v${n2(len)}`;
    if (ww > 3.5) d += `M${n2(lx + 6)},${n2(yy + len * .2)}v${n2(len * .5)}`;
  }
  const [cd, cid] = clip(rect(x, y, w, h));
  return cd + g({ clip: cid, a: clamp(L.k * 2) * (1 - L.out) * (o.a == null ? 1 : o.a) }, path(d, { stroke: col, 'stroke-width': o.w || 3, 'stroke-linecap': 'round', fill: 'none' }));
}

/* ---------- 描边字（漫画字）----------
 * ctext(str, x, y, o)：多层描边从外到内画：o.layers = [[颜色, 宽], …]（默认 外黑 → 中白 → 内黑细线），最后填 o.fill。
 *   o.shadow = [dx, dy, 颜色]：整组错位的投影（片名用）。o.size, o.weight, o.font('sans'|'round'), o.sk 斜切（度，"AI" 那样） */
function ctext(str, x, y, o = {}) {
  const th = T(), size = o.size || 80, layers = o.layers || [[th.ink, size * .26], [th.white, size * .16], [th.ink, size * .05]];
  const base = { size, weight: o.weight || 900, font: o.font || 'sans', anchor: o.anchor || 'middle', ls: o.ls };
  let s = '';
  const all = (dx, dy, col) => layers.map(([c, w]) => text(str, x + dx, y + dy, Object.assign({}, base, { fill: col || c, stroke: col || c, sw: w }))).join('');
  if (o.shadow) s += all(o.shadow[0], o.shadow[1], o.shadow[2] || th.ink);
  s += layers.map(([c, w]) => text(str, x, y, Object.assign({}, base, { fill: c, stroke: c, sw: w }))).join('');
  s += text(str, x, y, Object.assign({}, base, { fill: o.fill || th.ink }, o.fillW ? { stroke: o.fill || th.ink, sw: o.fillW } : {}));   // fillW：字本身加粗（细字体当粗体用）
  if (o.hl) s += text(str, x - size * .03, y - size * .04, Object.assign({}, base, { fill: 'none', stroke: o.hl, sw: size * .025, extra: { opacity: .8, 'stroke-dasharray': `${size * .12} ${size * .5}` } }));
  return o.sk ? g({ sk: o.sk, px: x, py: y }, s) : s;
}
/* 片名：lines = [{y, size, segs: [{s:'人类存在的意义'}, {s:'AI', fill: T.blue, sk:-12, size:1.25}]}]
 *   每段从中心按顺序弹出（o.t0 起、o.stagger 间隔），之后每 o.jit 帧轻微抖动（漫画字的"活"）。o.cx 行的中心 x，ln.cx 单行覆盖。
 *   段的 gap（px，负 = 和下一段叠）、dy、hl（高光虚线色）照旧 */
function title(t, lines, o = {}) {
  const th = T(), cx = o.cx == null ? Q.W / 2 : o.cx, t0 = o.t0 == null ? -1 : o.t0, st = o.stagger == null ? .08 : o.stagger;
  const jit = o.jit == null ? 3 : o.jit, f = jit ? Math.floor(Q.frame / jit) : 0;
  let s = '', idx = 0;
  lines.forEach((ln, li) => {
    const size = ln.size || 92, segs = ln.segs.map(sg => Object.assign({}, sg, { size: size * (sg.size || 1) }));
    const ws = segs.map(sg => measure(sg.s, sg.size, sg.font === 'round' || (!sg.font && o.font === 'round') ? 400 : 900, sg.font || o.font || 'sans') + (sg.gap || 0));
    let x = (ln.cx == null ? cx : ln.cx) - ws.reduce((a, b) => a + b, 0) / 2;   // ln.cx：这一行自己的中心（两行各自居中）
    segs.forEach((sg, si) => {
      const k = E.outBack(seg(t, t0 + idx * st, t0 + idx * st + .3), 2), sx = x + ws[si] / 2, y = ln.y + (sg.dy || 0);
      const jx = jit ? (hash(f * 3.1 + idx) - .5) * (o.jamp || 3) : 0, jy = jit ? (hash(f * 5.7 + idx + 9) - .5) * (o.jamp || 3) : 0;
      if (k > 0.001) s += g({ x: jx, y: jy, s: k, px: sx, py: y, r: (sg.r || 0) }, ctext(sg.s, sx, y, {
        size: sg.size, font: sg.font || o.font || 'sans', weight: (sg.font || o.font) === 'round' ? 400 : 900, fill: sg.fill || o.fill || th.ink, sk: sg.sk,
        fillW: (sg.font || o.font) === 'round' ? sg.size * .055 : 0,
        layers: sg.layers || o.layers || [[th.ink, sg.size * .3], [th.white, sg.size * .23]],
        shadow: sg.shadow === false ? null : (sg.shadow || o.shadow || [sg.size * .03, sg.size * .05, th.ink]), hl: sg.hl,
      }));
      x += ws[si]; idx++;
    });
  });
  return s;
}

/* ---------- 爆字（拟声词）----------
 * burst(t, x, y, str, o)：o.shape 'star'（白底锯齿星，参考片的"砰！"）| 'none'（只有双描边字，"啪！""噗"）
 *   | 'sticker'（米白字 + 黑粗描边 + 右下黑投影，dog 的"吱呀""啪！""咔！"；5 帧 0.6 → 1 back.out(2.6)，不抖不退；o.fill 字色、o.anchor）
 *   o.size 字号, o.R 星外半径, o.spikes, o.fill 字色（star 默认红，none 默认黑）, o.r 整体转角, o.t0/t1, o.wob 抖动幅度 */
function burst(t, x, y, str, o = {}) {
  if (o.shape === 'sticker') return sticker(t, x, y, str, o);
  /* tokens motion.sticker：0.8 → 1.04 → 1，8 帧 back.out(1.7)；停住时每 3 帧抖 ≤5 px；sea 活 0.7–1.0 s 后 4 帧淡出，dog 不退（跟镜头走） */
  const th = T();
  if (o.t1 === undefined && th.name !== 'dog' && o.t0 != null) o = Object.assign({}, o, { t1: o.t0 + .85, dout: 4 / 30 });
  const L = life(t, o, Q.tok('motion.sticker.in.duration_s', .27), 4 / 30); if (!L.on) return '';
  const size = o.size || 92, shape = o.shape || 'star', k = lerp(Q.tok('motion.sticker.in.scale_from', .8), 1, E.outBack(L.k, 2.6));
  if (L.k > 0 && L.k < .05) Q.sfx(o.t0, o.sfx || 'pop', { key: 'burst' + o.t0 + str });
  const f = Math.floor(Q.frame / Q.tok('motion.sticker.hold_jitter_every_frames', 3)), wob = o.wob == null ? Q.tok('motion.sticker.hold_jitter_px', 5) * .5 : o.wob;
  const jx = (Q.hash(f + x) - .5) * wob * 2, jy = (Q.hash(f + y + 3) - .5) * wob * 2;
  let s = '';
  if (shape === 'star') {
    const rn = rng(o.seed || Math.round(x + y)), R = o.R || size * 1.18, n = o.spikes || 13; const p = [];
    for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * Math.PI * 2 + (o.r0 || 0), rr = i % 2 ? R * (.52 + rn() * .1) : R * (.86 + rn() * .3); p.push([x + Math.cos(a) * rr * 1.08, y + Math.sin(a) * rr * .9]); }
    s += el('polygon', { points: pts(p), fill: o.bg || '#ffffff', stroke: th.ink, 'stroke-width': Q.tok('motion.sticker.stroke', 5.5), 'stroke-linejoin': 'miter' });
    s += ctext(str, x, y, { size, fill: o.fill || th.accent || th.red, layers: [[th.ink, size * .16], [th.white, size * .08]], weight: 900 });
  } else {
    s += ctext(str, x, y, { size, fill: o.fill || th.ink, layers: [[th.ink, size * .3], [th.white, size * .2]], weight: 900 });
  }
  return g({ x: jx, y: jy, s: k, r: o.r == null ? -8 : o.r, px: x, py: y, a: 1 - L.out }, s);
}
/* 拟声贴纸字（burst 的 shape:'sticker'） */
function sticker(t, x, y, str, o = {}) {
  const t0 = o.t0 == null ? -1 : o.t0, k = seg(t, t0, t0 + (o.dur || 5 / 30)); if (k <= 0) return '';
  if (k < .2) Q.sfx(t0, o.sfx || 'pop', { key: 'stk' + t0 + str });
  const th = T(), size = o.size || 60, sh = size * .07;
  const one = (dx, dy, fill, sw) => text(str, x + dx, y + dy, { size, weight: 900, fill, stroke: th.ink, sw, anchor: o.anchor || 'middle', ls: o.ls });
  const s = one(sh, sh, th.ink, size * .26) + one(0, 0, th.ink, size * .26) + one(0, 0, o.fill || '#f3ead4', size * .045);
  return g({ s: lerp(.6, 1, E.outBack(k, 2.6)), r: o.r || 0, px: x, py: y }, s);
}
/* ---------- 标注 ---------- */
/* 标签框：白底黑框小方块（"海鞘""药物""阿基米德的排水原理"）。o.size, o.shadow（右下的黑块偏移，0 = 没有）, o.r 转角, o.t0（弹出）
 *   默认按主题：sea 转 −4°、无投影、弹出；dog 正放、投影 7、米白底 #fdfbf6、不弹（T.labelR / labelShadow / labelBg）。o.w/o.h 定死框的大小，o.pop 强制弹或不弹 */
function label(t, x, y, str, o = {}) {
  /* tokens motion.label_tag：白底 4 px 黑框、直角、转 −6…−3°；0.6 → 1.08 → 1，5 帧 back.out(2)；放在格子左上角内侧 15–40 px */
  const L = life(t, o, 5 / 30); if (!L.on) return '';
  const th = T(), size = o.size || 46, w = o.w || measure(str, size, o.weight || 700, o.font || 'sans') + size * (o.padX == null ? .9 : o.padX), h = o.h || size * (o.padY == null ? 1.6 : o.padY);
  const sh = o.shadow == null ? (th.labelShadow || 0) : o.shadow, bw = o.bw || Q.tok('motion.label_tag.stroke', 4), ax = o.anchor === 'middle' ? x - w / 2 : x;
  let s = sh ? rect(ax + sh, y + sh, w, h, { fill: th.ink }) : '';
  s += rect(ax, y, w, h, { fill: o.bg || th.labelBg || '#ffffff', stroke: th.ink, 'stroke-width': bw, 'stroke-linejoin': 'miter' });
  s += text(str, ax + w / 2, y + h / 2 + size * .02, { size, weight: o.weight || 700, font: o.font || 'sans', fill: o.fill || th.ink });
  const pop = o.pop == null ? th.name !== 'dog' : o.pop;   // dog 的标签跟页一起进来，不弹
  return g({ s: pop ? lerp(.6, 1, E.outBack(L.k, 3.2)) : 1, r: o.r == null ? (th.labelR == null ? -4 : th.labelR) : o.r, px: ax + w / 2, py: y + h / 2, a: 1 - L.out }, s);
}
/* 圈重点：一圈描边从 o.a0 画到满，画完向外迸几根短刺。o.color（默认 T.accent = 这条片的第二强调色；没配色板时是红）, o.w, o.ticks（根数，0 = 不要）, o.ry（椭圆） */
function ring(t, cx, cy, r, o = {}) {
  /* tokens motion.circle_mark：从 1 点钟起顺时针，5–6 帧画完（power2.out），停 2–3 帧，3–4 帧淡出；不闭合；红圈带 8–10 根刺。
   * 要它一直留着：给 o.t1（退场时刻）；不给就按参考片的节奏一闪而过。 */
  const draw = o.dur || 6 / 30, hold = 3 / 30;
  if (o.t1 === undefined && o.t0 != null) o = Object.assign({}, o, { t1: o.t0 + draw + hold, dout: 4 / 30 });
  const L = life(t, o, draw, 4 / 30); if (!L.on) return '';
  const th = T(), col = o.color || th.accent || th.red, k = ease('out3', L.k) * (o.closed ? 1 : .94), ry = o.ry || r, a0 = (o.a0 == null ? -60 : o.a0) * Math.PI / 180;
  if (L.k > 0 && L.k < .2) Q.sfx(o.t0, 'swish', { key: 'ring' + o.t0 });
  const sx = cx + Math.cos(a0) * r, sy = cy + Math.sin(a0) * ry, ex = cx + Math.cos(a0 + Math.PI) * r, ey = cy + Math.sin(a0 + Math.PI) * ry;
  const d = `M${n2(sx)},${n2(sy)}A${n2(r)},${n2(ry)} 0 1,1 ${n2(ex)},${n2(ey)}A${n2(r)},${n2(ry)} 0 1,1 ${n2(sx)},${n2(sy)}`, w = o.w || 7;
  let s = k > 0.001 ? path(d, { fill: 'none', stroke: col, 'stroke-width': w, 'stroke-linecap': 'round', pathLength: 1, 'stroke-dasharray': `${n2(k)} 2` }) : '';
  const nt = o.ticks == null ? (col === (th.accent || th.red) ? 9 : 0) : o.ticks, tk = E.out3(seg(L.lt, draw * .8, draw * .8 + .1));
  if (nt && tk > 0) { const rn = rng(o.seed || 5); let td = '';
    for (let i = 0; i < nt; i++) { const a = (i + rn() * .5) / nt * Math.PI * 2, r1 = r * (1.04 + rn() * .05), len = (o.tick || 34) * (.6 + rn() * .6) * tk, cs = Math.cos(a), sn = Math.sin(a) * ry / r;
      td += `M${n2(cx + cs * r1)},${n2(cy + sn * r1)}l${n2(cs * len)},${n2(sn * len)}`; }
    s += path(td, { stroke: col, 'stroke-width': w * .5, 'stroke-linecap': 'round', fill: 'none' }); }
  return g({ a: 1 - L.out }, s);
}
/* 手画下划线：默认 T.accent（没配色板时红色）、微微起伏，从左往右画出来 */
function underline(t, x0, x1, y, o = {}) {
  const L = life(t, o, .3, .2); if (!L.on) return '';
  const rn = rng(o.seed || 11), n = Math.max(4, Math.round((x1 - x0) / 40)); let d = `M${n2(x0)},${n2(y)}`;
  for (let i = 1; i <= n; i++) d += `L${n2(lerp(x0, x1, i / n))},${n2(y + (o.wave == null ? 3 : o.wave) * Math.sin(i * 1.7) + (rn() - .5) * 2)}`;
  return g({ a: 1 - L.out }, path(d, { fill: 'none', stroke: o.color || T().accent || T().red, 'stroke-width': o.w || 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1, 'stroke-dasharray': `${n2(ease('io2', L.k))} 2` }));
}
/* 弧线箭头：从 a 画到 b，bend 是弯曲（正 = 往右弯），画到最后 15% 时箭头出来 */
function arrow(t, a, b, o = {}) {
  const L = life(t, o, .35, .2); if (!L.on) return '';
  const k = ease('io2', L.k), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, bend = o.bend == null ? .25 : o.bend;
  const c = [mx - dy / len * len * bend, my + dx / len * len * bend], col = o.color || T().accent || T().red, w = o.w || 7;
  let s = path(`M${n2(a[0])},${n2(a[1])}Q${n2(c[0])},${n2(c[1])} ${n2(b[0])},${n2(b[1])}`, { fill: 'none', stroke: col, 'stroke-width': w, 'stroke-linecap': 'round', pathLength: 1, 'stroke-dasharray': `${n2(k)} 2` });
  if (k > .85) { const hk = seg(k, .85, 1), ang = Math.atan2(b[1] - c[1], b[0] - c[0]), hs = (o.head || 30) * hk;
    s += path(`M${n2(b[0] - Math.cos(ang - .5) * hs)},${n2(b[1] - Math.sin(ang - .5) * hs)}L${n2(b[0])},${n2(b[1])}L${n2(b[0] - Math.cos(ang + .5) * hs)},${n2(b[1] - Math.sin(ang + .5) * hs)}`,
      { fill: 'none', stroke: col, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }); }
  return g({ a: 1 - L.out }, s);
}

/* ---------- 对话气泡 ----------
 * bubble(t, [x,y,w,h], o)：o.tail = [x,y]（尾巴尖）, o.lines = ['帮我想想：', '周末带{孩子}去哪儿玩？']（{…} 用强调色）,
 *   o.shape 'round'|'ellipse', o.border（框色，默认黑；AI 的气泡用蓝）, o.bw, o.size, o.font('hand'|'sans'), o.cps（打字速度 字/秒，0 = 整句出现）, o.caret
 *   o.t0：气泡弹出；打字从 o.t0 + 0.2 开始。o.spread（椭圆尾巴根张角）、o.centerStroke（描边骑在边上，dog 气泡）、o.dx/o.dy（字偏移）、o.weight */
function bubble(t, r, o = {}) {
  /* tokens motion.bubble：从尾巴尖 0.3 → 1.06 → 1，5 帧 back.out(1.7)。o.typing = true 用 motion.typing 的预设：
   * 蓝粗框（可见 ≈10 px）+ 外面一圈 2 px 黑线、圆角 30、米白底、手写圆体；第一行 4 帧整行出现，之后 19 字/秒，光标 3 px、亮 5 帧灭 5 帧 */
  if (o.typing) { const ty = Q.tok('motion.typing', {}), bx = ty.box || {};
    o = Object.assign({ border: T().blue, bw: (bx.stroke || 18) / 2 + 1, outline: bx.outer_line || 2, rr: bx.radius || 30, fill: bx.fill || '#f7f2e6', font: 'round', cps: ty.chars_per_s || 19, firstLine: true, size: 54 }, o); }
  const L = life(t, o, 5 / 30, .18); if (!L.on) return '';
  const th = T(), [x, y, w, h] = r, bc = o.border || th.ink, bw = o.bw || 4, fill = o.fill || '#ffffff', rr = o.rr == null ? Math.min(w, h) * .2 : o.rr;
  const tail = o.tail || [x + w * .3, y + h + 60], tcx = clamp(tail[0], x + rr + 20, x + w - rr - 20), below = tail[1] > y + h / 2;
  const tb = o.tailW || 34, edge = below ? y + h - 2 : y + 2;
  const tailPts = [[tcx - tb, edge], tail, [tcx + tb * .2, edge]];
  let s;
  if (o.shape === 'ellipse') {   // 椭圆 + 尾巴是一条闭合路径：尾巴根上不会露一截描边（dog 对临）。o.spread = 尾巴根在椭圆上张开的半角（弧度）
    const ecx = x + w / 2, ecy = y + h / 2, rx = w / 2, ry = h / 2, ang = Math.atan2(tail[1] - ecy, tail[0] - ecx), sp = o.spread || .3;
    const P = a => [ecx + rx * Math.cos(a), ecy + ry * Math.sin(a)], [ax, ay] = P(ang - sp), [bx, by] = P(ang + sp);
    const d = `M${n2(ax)},${n2(ay)}L${n2(tail[0])},${n2(tail[1])}L${n2(bx)},${n2(by)}A${n2(rx)},${n2(ry)} 0 1,1 ${n2(ax)},${n2(ay)}Z`, lj = { 'stroke-linejoin': 'round' };
    s = (o.outline ? path(d, Object.assign({ fill: 'none', stroke: th.ink, 'stroke-width': bw * 2 + o.outline * 2 }, lj)) : '') +
      (o.centerStroke ? path(d, Object.assign({ fill, stroke: bc, 'stroke-width': bw }, lj)) : path(d, Object.assign({ fill, stroke: bc, 'stroke-width': bw * 2 }, lj)) + path(d, { fill }));
  } else {
    const bodyShape = (extra) => rect(x, y, w, h, Object.assign({ rx: rr }, extra));
    const ol = o.outline ? el('polygon', { points: pts(tailPts), fill: 'none', stroke: th.ink, 'stroke-width': bw * 2 + o.outline * 2, 'stroke-linejoin': 'round' }) + bodyShape({ fill: 'none', stroke: th.ink, 'stroke-width': bw * 2 + o.outline * 2 }) : '';
    s = ol + el('polygon', { points: pts(tailPts), fill, stroke: bc, 'stroke-width': bw * 2, 'stroke-linejoin': 'round' }) + bodyShape({ fill, stroke: bc, 'stroke-width': bw * 2 })
      + el('polygon', { points: pts(tailPts), fill }) + bodyShape({ fill });
  }
  const lines = o.lines || [], size = o.size || 52, font = o.font || 'hand', lh = size * (o.lh || 1.35), cps = o.cps == null ? 14 : o.cps;
  const plain = lines.map(l => l.replace(/[{}]/g, '')), total = plain.reduce((a, l) => a + Array.from(l).length, 0);
  const first = o.firstLine ? Array.from(plain[0] || '').length : 0, t0x = o.firstLine ? 4 / 30 : .2;
  const shown = !cps ? total : Math.floor(clamp((L.lt < t0x ? 0 : first) + Math.max(0, L.lt - t0x - (o.firstLine ? .15 : 0)) * cps, 0, total));
  let left = shown, ty = y + h / 2 - (lines.length - 1) * lh / 2 + (o.dy || 0), tx = (o.align === 'middle' ? x + w / 2 : x + (o.padX || size * .9)) + (o.dx || 0), last = null;
  lines.forEach((ln, i) => {
    const parts = ln.split(/(\{[^}]*\})/).filter(Boolean); let html = '', vis = '';
    parts.forEach(pt => { const acc = pt[0] === '{', str = acc ? pt.slice(1, -1) : pt, cs = Array.from(str), take = cs.slice(0, Math.max(0, left)); left -= take.length; vis += take.join('');
      if (take.length) html += acc ? `<tspan fill="${o.accent || th.blue}">${esc(take.join(''))}</tspan>` : esc(take.join('')); });
    const ly = ty + i * lh;
    if (vis.length || (i === 0 && !last)) last = { y: ly, w: vis.length ? measure(vis, size, o.weight || 400, font) : 0 };
    s += text('', tx, ly, { size, font, weight: o.weight || 400, anchor: o.align || 'start', fill: o.color || th.ink, html });
  });
  if (o.caret !== false && cps && last && (shown < total || Math.floor(Q.frame / 5) % 2 === 0))
    s += rect(tx + last.w + 4, last.y - size * .55, 3, size * 1.1, { fill: th.ink });
  return g({ s: lerp(.3, 1, E.outBack(L.k, 2.2)), px: tail[0], py: tail[1], a: 1 - L.out }, s);
}
/* ---------- 动作曲线（返回位移，构件自己乘到 y 上）----------
 * dropY(t, t0, H)：tokens motion.drop：先往上提 30 px（0.07 s）→ power2.in 落 0.53 s → 冲过 38 px → 0.07 s 弹回。返回"离落点还差多少"（负 = 在上面）
 * popY(t, t0, H)：tokens motion.pop_up：0.07 s 冲上来、冲过 30 px、elastic.out(1,0.4) 0.3 s 停稳。返回相对终点的位移（正 = 在下面） */
function dropY(t, t0, Hh) {
  const m = Q.tok('motion.drop', {}), an = m.anticipation_s || .07, fs = m.fall_s || .53, ov = m.overshoot_px || 38, st = m.settle_s || .07, up = -(m.anticipation_px || -30);
  const d = t - t0; if (d <= 0) return -Hh;
  if (d < an) return -Hh - up * E.out2(d / an);
  if (d < an + fs) return lerp(-Hh - up, ov, E.in3((d - an) / fs));
  return lerp(ov, 0, E.out2(clamp((d - an - fs) / st)));
}
function popY(t, t0, Hh, o) {
  if (typeof o === 'string') o = Q.tok('motion.pop_up.' + o, null) || {};
  if (o && (o.peek_px != null || o.settle === 'snap' || o.snap)) return peekY(t, t0, Hh, o);
  const m = Object.assign({}, Q.tok('motion.pop_up', {}), o || {}), rs = m.rise_s || .07, ov = m.overshoot_px == null ? 30 : m.overshoot_px, st = m.settle_s || .3, d = t - t0;
  if (d <= 0) return Hh;
  if (d < rs) return lerp(Hh, -ov, E.out2(d / rs));
  return -ov * (1 - E.elastic(clamp((d - rs) / st), .4));
}

/* peekY：先探头（peek_px，peek_s 秒 out2）→ 停 wait_s → rise_s 秒 out2 冲上来、冲过 overshoot_px → 一帧弹回（不弹簧）。
 * dog 柴犬从格底冒出来：popY(t, .9, 1110, 'dog_peek')（tokens motion.pop_up.dog_peek）。返回相对终点的位移（正 = 在下面） */
function peekY(t, t0, Hh, m) {
  const pk = m.peek_px || 0, ps = m.peek_s == null ? .2 : m.peek_s, wt = m.wait_s == null ? .08 : m.wait_s, rs = m.rise_s == null ? .19 : m.rise_s, ov = m.overshoot_px == null ? 100 : m.overshoot_px, d = t - t0;
  if (d < 0) return Hh; if (d < ps + wt) return lerp(Hh, Hh - pk, E.out2(seg(d, 0, ps)));
  const end = ps + wt + rs + 1 / 60; if (d < end) return lerp(Hh - pk, -ov, E.out2(seg(d, ps + wt, ps + wt + rs))); return 0;
}
/* ---------- 字幕 ----------
 * subtitle(t, cues, o)：cues = [{a, b, s}]（a..b 秒显示 s），一次一行，深色圆角底条 + 白字，放进 ui 层。
 *   出现/切换是硬切（参考片字幕不淡入）；o.fadeIn 给一个秒数可以改成淡入。太长自动缩字号，不折行。 */
function subtitle(t, cues, o = {}) {
  const c = cues.find(q => t >= q.a && t < q.b); if (!c || !c.s) return '';
  const sb = Object.assign({}, T().sub, o), maxW = o.maxW || Q.W - 140;
  let size = sb.size, w = measure(c.s, size, sb.weight, 'sans');
  if (w + sb.padX * 2 > maxW) { size = size * (maxW - sb.padX * 2) / w; w = measure(c.s, size, sb.weight, 'sans'); }
  const bw = w + sb.padX * 2, x = (o.cx || sb.cx || Q.W / 2) - bw / 2, y = sb.y - sb.h / 2, a = o.fadeIn ? clamp((t - c.a) / o.fadeIn) : 1;
  return g({ a }, rect(x, y, bw, sb.h, { rx: sb.r, fill: sb.bg, opacity: sb.a < 1 ? sb.a : null }) + text(c.s, x + bw / 2, sb.y + size * .03, { size, weight: sb.weight, fill: sb.fg, font: 'sans' }));
}

/* ---------- 小件 ---------- */
/* 胶带：两格之间贴的一截半透明米色胶带 */
const tape = (x, y, w = 150, h = 34, o = {}) => g({ r: o.r || 0, px: x + w / 2, py: y + h / 2 }, rect(x, y, w, h, { fill: o.fill || '#e9dcb6', opacity: o.a == null ? .85 : o.a }));
/* 问号气泡（小狗头上那个）：o.t0 弹出 */
function qmark(t, x, y, o = {}) {
  const L = life(t, o, .2); if (!L.on) return '';
  const th = T(), s = o.s || 1, str = o.str || '?';
  const body = el('polygon', { points: pts([[x - 14 * s, y + 30 * s], [x - 2 * s, y + 78 * s], [x + 8 * s, y + 28 * s]]), fill: th.white, stroke: th.ink, 'stroke-width': 4 * s, 'stroke-linejoin': 'round' })
    + ellipse(x, y, 52 * s, 46 * s, { fill: th.white, stroke: th.ink, 'stroke-width': 4 * s }) + el('polygon', { points: pts([[x - 12 * s, y + 30 * s], [x - 2 * s, y + 70 * s], [x + 6 * s, y + 28 * s]]), fill: th.white })
    + text(str, x, y + 2 * s, { size: 62 * s, weight: 900, fill: th.ink });
  return g({ s: E.outBack(L.k, 2.2), px: x - 2 * s, py: y + 70 * s, a: 1 - L.out, r: o.r || 0 }, body);
}
/* 汗滴 */
const sweat = (x, y, s = 1, o = {}) => path(`M${n2(x)},${n2(y)}c${n2(-10 * s)},${n2(16 * s)} ${n2(-16 * s)},${n2(26 * s)} ${n2(-16 * s)},${n2(34 * s)}a${n2(16 * s)},${n2(16 * s)} 0 0,0 ${n2(32 * s)},0c0,${n2(-8 * s)} ${n2(-6 * s)},${n2(-18 * s)} ${n2(-16 * s)},${n2(-34 * s)}z`, { fill: o.fill || T().blueLight, stroke: T().ink, 'stroke-width': 3 * s });
/* 震动弧线：手机在震、东西在响。side：1 = 右边，-1 = 左边；n 根，每根往外一圈 */
function vibe(t, x, y, o = {}) {
  const L = life(t, o, .1); if (!L.on) return ''; const side = o.side || 1, n = o.n || 2, flick = Math.floor(Q.frame / 4) % 2;
  let d = ''; for (let i = 0; i < n; i++) { const r = (o.r || 26) + i * (o.gap || 18) + flick * 3; d += `M${n2(x + side * r * .5)},${n2(y - r)}Q${n2(x + side * r * 1.15)},${n2(y)} ${n2(x + side * r * .5)},${n2(y + r)}`; }
  return g({ a: 1 - L.out }, path(d, { fill: 'none', stroke: o.color || T().ink, 'stroke-width': o.w || 4, 'stroke-linecap': 'round' }));
}
/* 惊叹短线：东西出现时周围迸几根（"!" 的感觉）。n 根，从 r0 往外长到 r1 */
function popmarks(t, x, y, o = {}) {
  const L = life(t, o, .18, .2); if (!L.on) return '';
  const n = o.n || 6, rn = rng(o.seed || 9), r0 = o.r0 || 60, r1 = o.r1 || 100, k = E.out3(L.k); let d = '';
  for (let i = 0; i < n; i++) { const a = (o.a0 || -150) * Math.PI / 180 + i / n * (o.span || 120) * Math.PI / 180 + rn() * .2, ra = r0, rb = lerp(r0, r1, k) * (.85 + rn() * .3);
    d += `M${n2(x + Math.cos(a) * ra)},${n2(y + Math.sin(a) * ra)}L${n2(x + Math.cos(a) * rb)},${n2(y + Math.sin(a) * rb)}`; }
  return g({ a: 1 - L.out }, path(d, { stroke: o.color || T().ink, 'stroke-width': o.w || 5, 'stroke-linecap': 'round', fill: 'none' }));
}
/* 放射短线：围着一样东西一圈两头尖的细梭（光团、火把、灯、狗盆）。从 r0 到 r1，角度 a0..a1（度，0 = 右，顺时针），n 根，长短随机。
 * 和 speedlines 不同：speedlines 是从格边往里的楔形，这个是从东西往外的短梭 */
function rays(cx, cy, r0, r1, o = {}) {
  const rn = rng(o.seed || 3), n = o.n || 14, a0 = o.a0 == null ? 0 : o.a0, a1 = o.a1 == null ? 360 : o.a1, wd = o.w || 7; let d = '';
  for (let i = 0; i < n; i++) {
    const a = (a0 + (a1 - a0) * (i + .5 + (rn() - .5) * .5) / n) * Math.PI / 180, ra = r0 * (.95 + rn() * .15), rb = lerp(r0, r1, .55 + rn() * .45), w = wd * (.6 + rn() * .6);
    const ux = Math.cos(a), uy = Math.sin(a), mx = cx + ux * (ra + rb) / 2, my = cy + uy * (ra + rb) / 2;
    d += `M${n2(cx + ux * ra)},${n2(cy + uy * ra)}L${n2(mx - uy * w / 2)},${n2(my + ux * w / 2)}L${n2(cx + ux * rb)},${n2(cy + uy * rb)}L${n2(mx + uy * w / 2)},${n2(my - ux * w / 2)}Z`;
  }
  return path(d, { fill: o.color || T().ink });
}
/* 竖着的"！"牌：米白梭形 + 黑描边 + 黑点，右下黑投影（dog 手机两边那几个）。o.t0 弹出（4 帧 back.out(2.4)），o.s 大小，o.r 转角 */
function bang(t, x, y, o = {}) {
  if (o.t0 != null && t < o.t0) return ''; const th = T(), s = o.s || 1, k = o.t0 == null ? 1 : E.outBack(seg(t, o.t0, o.t0 + 4 / 30), 2.4), cream = o.fill || '#f3ead4';
  const body = (dx, dy, fill) => path(`M${n2(x - 21 * s + dx)},${n2(y - 50 * s + dy)}Q${n2(x + dx)},${n2(y - 66 * s + dy)} ${n2(x + 21 * s + dx)},${n2(y - 50 * s + dy)}L${n2(x + 9 * s + dx)},${n2(y + 22 * s + dy)}Q${n2(x + dx)},${n2(y + 30 * s + dy)} ${n2(x - 9 * s + dx)},${n2(y + 22 * s + dy)}Z`,
    { fill, stroke: th.ink, 'stroke-width': 6 * s, 'stroke-linejoin': 'round' });
  const inner = body(7 * s, 6 * s, th.ink) + body(0, 0, cream) + path(`M${n2(x - 8 * s)},${n2(y - 44 * s)}L${n2(x + 8 * s)},${n2(y - 44 * s)}L${n2(x + 4 * s)},${n2(y + 10 * s)}L${n2(x - 4 * s)},${n2(y + 10 * s)}Z`, { fill: th.ink }) +
    circle(x, y + 42 * s, 15 * s, { fill: cream, stroke: th.ink, 'stroke-width': 6 * s }) + circle(x, y + 42 * s, 6 * s, { fill: th.ink });
  return g({ r: o.r || 0, px: x, py: y, s: k }, inner);
}
/* 甩镜竖向速度线（sea 路线）：甩镜那 dur 秒里，屏幕层叠 8–20 根竖线，峰值在甩镜中点，每帧重抽。
 * whipLines(t, starts, o)：starts = 每次甩镜开始的时刻（数组）；画在 draw() 返回的 screen 层（镜头之外、纸纹之下）。
 * o.dur（默认 tokens camera.whip.duration_s.<主题>，sea 0.45）, o.n=[8,20], o.w=[1,8], o.len=[150,900], o.colors（默认 tokens speed_lines.colors）, o.seed */
function whipLines(t, starts, o = {}) {
  const th = T(), dur = o.dur || Q.tok('camera.whip.duration_s.' + (th.name || 'sea'), .45), w = (starts || []).find(a => t >= a && t < a + dur); if (w == null) return '';
  const SL = Q.tok('camera.whip.speed_lines', {}) || {}, N = o.n || SL.count || [8, 20], WD = o.w || SL.width_px || [1, 8], LN = o.len || SL.length_px || [150, 900];
  const cols = o.colors || SL.colors || [th.ink, th.greyDeep || th.ink, th.greyDark || th.ink];
  const k = (t - w) / dur, peak = Math.sin(k * Math.PI), rn = rng(Q.frame * 7 + (o.seed || 3)), n = Math.round(N[0] + (N[1] - N[0]) * peak); let s = '';
  for (let i = 0; i < n; i++) {
    const x = rn() * Q.W, len = LN[0] + rn() * (LN[1] - LN[0]), y = rn() * (Q.H + len) - len, wd = WD[0] + rn() * (WD[1] - WD[0]);
    s += rect(x, y, wd, len, { fill: cols[i % cols.length], opacity: .55 + .45 * peak });
  }
  return s;
}
/* 安全区（抖音 9:16）：右侧按钮列、底部标题区、顶部标签栏。要读的东西（字、关键物件）不进这几块。
 * Q.SAFE 是屏幕坐标矩形 [x,y,w,h]；safeGuide() 画成半透明红框，?safe 预览或 render.py --safe 截图时叠上去自查。 */
function safeGuide() {
  return Object.values(Q.SAFE).map(r => rect(r[0], r[1], r[2], r[3], { fill: '#ff0000', opacity: .18, stroke: '#ff0000', 'stroke-width': 3 })).join('');
}
/* 一个"!"或"?"漂在角落（手机两边那种） */
const mark = (x, y, str = '!', o = {}) => g({ r: o.r || 0, px: x, py: y }, text(str, x, y, { size: o.size || 56, weight: 900, fill: o.fill || T().ink, font: 'sans' }));

G.QK = { life, panel, stack, row, dropY, popY, peekY, rays, bang, sticker, speedlines, fallLines, ctext, title, burst, label, ring, underline, arrow, bubble, subtitle, tape, qmark, sweat, vibe, popmarks, mark, whipLines, safeGuide };
})(window);
