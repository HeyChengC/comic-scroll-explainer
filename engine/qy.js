/* qy.js — 竖屏漫画长页引擎：1080×1920 的 SVG，每一帧都是 t 的纯函数。
 *
 *   Q.film({ dur, theme, draw(t) → {cam, shake, world, screen, ui, look} })  →  window.seek(t) / END / FPS / READY
 *
 * 为什么是"每帧重写一整串 SVG"而不是改属性：
 *   画面 = draw(t) 返回的字符串，没有任何 DOM 节点跨帧存活 → 乱序 seek 天然一致；
 *   构件就是返回字符串的函数，能嵌套、能拼、能在 Node 里单测；1080×1920 的一帧几百到几千个节点，
 *   拼串 + innerHTML 不到 10 ms，远小于截图本身（~150 ms）。
 *   跨帧不变、解码慢的东西放进常驻层：<defs>（网点图案、图片素材）和纸纹 canvas，只在启动时建一次。
 *
 * 层（从下到上）：底色 → world（漫画长页，跟镜头走）→ screen（屏幕坐标，纸纹之下）→ 纸纹（multiply）→ ui（字幕，纸纹之上）
 */
(function (G) {
'use strict';
const W = 1080, H = 1920;

/* ---------- 时间与数学 ---------- */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const seg = (t, a, b) => b <= a ? (t >= a ? 1 : 0) : clamp((t - a) / (b - a));
const smooth = x => x * x * (3 - 2 * x);
const ss = (t, a, b) => smooth(seg(t, a, b));
const E = {
  lin: x => x, in2: x => x * x, out2: x => 1 - (1 - x) * (1 - x),
  in3: x => x * x * x, out3: x => 1 - Math.pow(1 - x, 3),
  io2: x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2,
  io3: x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
  out5: x => 1 - Math.pow(1 - x, 5),
  sine: x => -(Math.cos(Math.PI * x) - 1) / 2,   // sine.inOut：dog 甩镜逐帧拟合最贴（误差 0.0006–0.0015）
  outExpo: x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x),
  outBack: (x, s = 1.7) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2),
  outElastic: x => x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - .75) * 2.0944) + 1,
  elastic: (x, p = .4) => x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x - p / 4) * 2 * Math.PI / p) + 1,   // GSAP elastic.out(1, p)
};
const ease = (e, x) => (typeof e === 'function' ? e : E[e] || E.io3)(clamp(x));
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const rng = seed => { let a = (seed * 9301 + 49297) >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const noise1 = x => { const i = Math.floor(x), f = x - i; return lerp(hash(i), hash(i + 1), smooth(f)) * 2 - 1; };
/* 一拍二：把元素的时间量化到每 n 帧一跳（手作感）；镜头不量化 */
const q = (t, n = 2, fps = 30) => Math.floor(t * fps / n) * n / fps;

/* 关键帧：[{t, go, e, ...数值}]。到 t 时到位；go = 从上一帧的值走过来用几秒（默认 0.5，0 = 硬切）。两帧之间保持。
 * 镜头、姿势、任何一组数值都用它：不是样条——参考片的镜头是"停、滑、停"，每段自带缓动。 */
function keys(list, t, defE = 'io3') {
  if (!list || !list.length) return {};
  let cur = Object.assign({}, list[0]);
  for (let i = 1; i < list.length; i++) {
    const k = list[i], go = k.go == null ? .5 : k.go, a = k.t - go;
    if (t <= a) break;
    const p = go <= 0 ? 1 : ease(k.e || defE, (t - a) / go), nxt = {};
    for (const f in k) if (f !== 't' && f !== 'go' && f !== 'e') nxt[f] = typeof k[f] === 'number' && typeof cur[f] === 'number' ? lerp(cur[f], k[f], p) : (p >= 1 ? k[f] : (cur[f] == null ? k[f] : cur[f]));
    cur = Object.assign({}, cur, nxt);
    if (t < k.t) break;
  }
  return cur;
}
/* 眨眼：按种子每 2.6–4.6 s 眨一次，闭眼 0.12 s；返回 0..1（1 = 全闭） */
function blink(t, seed = 1) {
  const per = 2.6 + hash(seed) * 2, i = Math.floor(t / per), at = i * per + hash(i + seed * 7) * (per - .3), d = t - at;
  return d >= 0 && d < .14 ? Math.sin(d / .14 * Math.PI) : 0;
}

/* ---------- SVG 拼串 ---------- */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n2 = v => typeof v === 'number' ? (Math.round(v * 100) / 100) : v;
const attrs = o => { let s = ''; for (const k in o) { const v = o[k]; if (v == null || v === false) continue; s += ` ${k}="${typeof v === 'number' ? n2(v) : esc(v)}"`; } return s; };
const el = (tag, o = {}, inner) => inner == null ? `<${tag}${attrs(o)}/>` : `<${tag}${attrs(o)}>${inner}</${tag}>`;
/* 变换：{x,y} 平移，r 旋转（度），s 缩放（数或 [sx,sy]），sk 斜切 x（度），px,py 旋转/缩放中心（相对 x,y 之前的坐标） */
function tf(o) {
  if (!o) return null; let s = '';
  if (o.x || o.y) s += `translate(${n2(o.x || 0)} ${n2(o.y || 0)}) `;
  const px = o.px || 0, py = o.py || 0, piv = px || py;
  if (piv) s += `translate(${n2(px)} ${n2(py)}) `;
  if (o.r) s += `rotate(${n2(o.r)}) `;
  if (o.s != null && o.s !== 1) s += Array.isArray(o.s) ? `scale(${n2(o.s[0])} ${n2(o.s[1])}) ` : `scale(${n2(o.s)}) `;
  if (o.sk) s += `skewX(${n2(o.sk)}) `;
  if (piv) s += `translate(${n2(-px)} ${n2(-py)})`;
  return s.trim() || null;
}
/* g(o, inner)：o 里 a = 透明度，clip = clipPath id，其余是变换和普通属性 */
function g(o, inner) {
  if (o && o.a != null && o.a <= 0.002) return '';
  const { x, y, r, s, sk, px, py, a, clip, ...rest } = o || {};
  return el('g', Object.assign({ transform: tf({ x, y, r, s, sk, px, py }), opacity: a != null && a < 1 ? a : null, 'clip-path': clip ? `url(#${clip})` : null }, rest), inner || '');
}
const path = (d, o = {}) => el('path', Object.assign({ d }, o));
const rect = (x, y, w, h, o = {}) => el('rect', Object.assign({ x, y, width: Math.max(0, w), height: Math.max(0, h) }, o));
const circle = (cx, cy, r, o = {}) => el('circle', Object.assign({ cx, cy, r: Math.max(0, r) }, o));
const ellipse = (cx, cy, rx, ry, o = {}) => el('ellipse', Object.assign({ cx, cy, rx: Math.max(0, rx), ry: Math.max(0, ry) }, o));
const pts = a => a.map(p => `${n2(p[0])},${n2(p[1])}`).join(' ');
/* 线框风格的描边属性 */
const ink = (w, color) => ({ stroke: color || G.Q.T.ink, 'stroke-width': w, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });

/* ---------- 字 ---------- */
const FONTS = { sans: '"QY Sans"', round: '"QY Round","QY Sans"', hand: '"QY Hand","QY Sans"', serif: '"QY Serif","QY Sans"' };
const _mc = document.createElement('canvas').getContext('2d'), _mm = new Map();
/* 量字宽（px）：字体必须已加载（READY 之后）。同一 (字体, 字号, 字重, 字串) 只量一次 */
function measure(str, size = 50, weight = 500, font = 'sans') {
  const k = `${font}|${size}|${weight}|${str}`; if (_mm.has(k)) return _mm.get(k);
  _mc.font = `${weight} ${size}px ${FONTS[font] || font}`; const w = _mc.measureText(str).width; _mm.set(k, w); return w;
}
/* text(str, x, y, o)：o.size/weight/font/fill/stroke/sw/anchor('middle'|'start'|'end')/base/ls(字距)/extra(其余属性) */
function text(str, x, y, o = {}) {
  return el('text', Object.assign({
    x, y, 'font-family': FONTS[o.font || 'sans'] || o.font, 'font-size': o.size || 50, 'font-weight': o.weight || 500,
    fill: o.fill == null ? G.Q.T.ink : o.fill, stroke: o.stroke || null, 'stroke-width': o.stroke ? o.sw || 4 : null,
    'stroke-linejoin': o.stroke ? 'round' : null, 'text-anchor': o.anchor || 'middle', 'dominant-baseline': o.base || 'central',
    'letter-spacing': o.ls || null, 'font-style': o.italic ? 'italic' : null,
  }, o.extra || {}), o.html || esc(str));
}

/* ---------- 每帧唯一 id（clipPath / mask）：每帧从 0 数，绘制顺序确定 → id 确定 ---------- */
let _uid = 0;
const uid = (p = 'c') => `${p}${_uid++}`;
/* clip(shapeSvg) → [defsSvg, id] */
function clip(shape) { const id = uid('cp'); return [el('clipPath', { id }, shape), id]; }
/* ---------- 镜头 ----------
 * 世界坐标：漫画长页，宽 1080，往下无限长。镜头 {x, y} = 世界里对准屏幕中心的点；zoom > 1 推近；rot 度。
 * cam(list, t)：list 是关键帧（同 keys），比如 [{t:0, x:540, y:960, zoom:1}, {t:4, go:.6, y:2400}]
 * shake：[{t, amp, dur, f}]，爆字、砸下来的时候抖一下（衰减的噪声，px）。 */
function cam(list, t) { const c = keys(list, t, 'io2');   // 甩镜默认 power1.inOut（tokens camera.whip.ease）
  return { x: c.x == null ? W / 2 : c.x, y: c.y == null ? H / 2 : c.y, zoom: c.zoom || 1, rot: c.rot || 0 }; }
function shakeAt(list, t) {
  let dx = 0, dy = 0, dr = 0;
  (list || []).forEach((s, i) => {
    if (s.kind === 'seq') {   // 量出来的逐帧偏移表：xs/ys 是镜头在世界里的偏移（px，正 = 镜头往右/下 = 画面往左/上），一帧一个，放完就停
      const fr = Math.round((t - s.t) * 30), xs = s.xs || [], ys = s.ys || [];
      if (fr >= 0 && fr < Math.max(xs.length, ys.length)) { dx -= xs[fr] || 0; dy -= ys[fr] || 0; } return; }
    const d = t - s.t, dur = s.dur || tok('camera.shake.impact.frames', 9) / 30; if (d < 0 || d > dur) return;
    if (s.kind === 'buzz') { const a = s.amp == null ? tok('camera.shake.buzz.amp_px', 4) : s.amp, fr = Math.round(d * 30); dx += (fr % 2 ? -1 : 1) * a * (1 - d / dur); return; }   // 冒出、惊讶：左右来回
    const k = Math.exp(-4.2 * d / dur) * (1 - d / dur), f = s.f || 26, a = s.amp == null ? tok('camera.shake.impact.amp_px', 22) : s.amp;
    dx += noise1(d * f + i * 13.1) * a * k; dy += noise1(d * f + i * 7.7 + 50) * a * k; dr += noise1(d * f + i * 3.3 + 90) * (s.rot || 0) * k;
  });
  return { dx, dy, dr };
}
/* 让矩形 [x,y,w,h] 装进屏幕：返回 {x,y,zoom}；o.pad 留边，o.dy 让主体偏上/偏下（屏幕 px） */
function focus(r, o = {}) {
  const pad = o.pad == null ? 0 : o.pad, z = o.zoom || Math.min(W / (r[2] + pad * 2), H / (r[3] + pad * 2));
  return { x: r[0] + r[2] / 2, y: r[1] + r[3] / 2 - (o.dy || 0) / z, zoom: z };
}
function camTransform(c, sh) {
  return `translate(${n2(W / 2 + sh.dx)} ${n2(H / 2 + sh.dy)}) rotate(${n2(c.rot + sh.dr)}) scale(${n2(c.zoom)}) translate(${n2(-c.x)} ${n2(-c.y)})`;
}

/* ---------- 主题（色值取自参考帧：sea = 参考片甲，dog = 参考片乙）----------
 * tokens.json 出来以后：Q.useTokens(TOKENS) 深合并进来，构件只认 Q.T 上的名字。 */
const THEMES = {
  sea: {
    name: 'sea', gutter: '#e7dfc4', panel: '#f0ead8', panel2: '#d8d2b4', panelMid: '#e4dec0', floor: '#c0baa8', floorDark: '#9c968a',
    ink: '#181812', accent: null, red: '#cc3624', redDark: '#963526', redLight: '#e2654f', blue: '#2a66a8', blueDark: '#1e487e', blueLight: '#a2bad2', blueTint: '#c9d8e4',
    grey: '#9c968a', greyDark: '#847e72', greyLight: '#c0baa8', greyDeep: '#5a5448', white: '#f7f2e6',
    skin: '#f0c69c', skinShade: '#d9a983', hair: '#181612', hoodie: '#9c968a', pants: '#847e72', shoe: '#f4eddd',
    fur: '#d29048', furDark: '#ae845a', furLight: '#dec6a2', furInk: '#3a2414',
    sub: { bg: '#38342e', a: 1, fg: '#fcf8f2', size: 54, weight: 700, h: 88, r: 20, padX: 41, y: 1250, cx: 519 },
    stroke: { panel: 10, body: 4, fine: 2, fg: 6, title: 10 },
    paper: .45, halftone: false, rim: false, titleShadow: null, titleItalicAI: true,
    labelR: -4, labelShadow: 0,
  },
  dog: {
    name: 'dog', gutter: '#e5dcc9', panel: '#f4f0e4', panel2: '#e4decc', panelMid: '#e4decc', floor: '#e4decc', floorCool: '#dee4de', floorDark: '#b9b0a2',
    ink: '#1e1818', red: '#cb381f', redDark: '#8e2414', redLight: '#e8705a', blue: '#3c78ba', blueDark: '#24548a', blueDeep: '#183666', blueLight: '#b4cce4', blueTint: '#c3d5e4',
    grey: '#a8a49c', greyDark: '#7a766f', greyLight: '#cfcac0', white: '#f7f2e6',
    skin: '#f6e4d2', skinShade: '#ead8ba', hair: '#1d1815', hoodie: '#3c78ba', pants: '#3c78ba', shoe: '#efe9e0',
    fur: '#d29048', furDark: '#ae845a', furLight: '#dec6a2', furInk: '#3a2414',
    sub: { bg: '#38342e', a: 1, fg: '#fcf8f2', size: 54, weight: 700, h: 88, r: 20, padX: 41, y: 1250, cx: 519 },
    stroke: { panel: 10, body: 4, fine: 2, fg: 6, title: 10 },
    paper: .2, halftone: true, rim: true, titleShadow: [8, 8, '#1e1818'], titleItalicAI: false,
    labelR: 0, labelShadow: 7, labelBg: '#fdfbf6',   // dog：panel 比量到的纸色 #f0eade 提 4 级、纸纹 0.3→0.2（multiply 压暗后才对上参考 #f2eee2）；标签正放带投影
  },
};
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function merge(a, b) { const o = Object.assign({}, a); for (const k in b) o[k] = isObj(b[k]) && isObj(a[k]) ? merge(a[k], b[k]) : b[k]; return o; }
/* tokens：两种写法都认。
 *   ① 引擎自己的：{ theme: {sea: {...覆盖色值}, dog: {...}}, ... }
 *   ② skill 自带的 tokens.json（有 palette / panel / subtitle / lines / halftone / motion / camera）：fromStudy 翻译成主题。
 * 原始 tokens 挂在 Q.TOK，构件用 Q.tok('motion.sticker.in.duration_s', 默认值) 取。 */
function useTokens(tok) {
  if (!tok) return;
  const th = tok.palette ? fromStudy(tok) : tok.theme;
  if (th) for (const k in th) THEMES[k] = merge(THEMES[k] || THEMES.sea, th[k]);
  /* 这条片自己的色板：tokens.film = { accent, accent_dark, accent_light, blue, blue_dark, blue_light }。
   * accent 是第二强调色（比喻物的颜色），爆字、圈、下划线、箭头默认用它；没配时它们照旧用 red。 */
  const F = tok.film || {};
  if (F.accent || F.blue) for (const k in THEMES) THEMES[k] = merge(THEMES[k], Object.fromEntries(Object.entries({ accent: F.accent, accentDark: F.accent_dark, accentLight: F.accent_light,
    blue: F.blue, blueDark: F.blue_dark, blueLight: F.blue_light }).filter(([, v]) => v)));
  G.Q.TOK = merge(G.Q.TOK || {}, tok);
}
function tok(p, d) { let o = G.Q.TOK; for (const k of p.split('.')) { if (o == null || typeof o !== 'object') return d; o = o[k]; } return o == null ? d : o; }
function fromStudy(j) {
  const out = {}, P = j.palette || {}, pick = (...v) => v.find(x => x != null && x !== '');
  const GR = j.grain || {}, L = j.lines || {}, S = j.subtitle || {}, bar = S.bar || {}, pf = (j.panel || {}).fill || {}, gf = (j.panel || {}).gutter_fill || {};
  const common = {
    stroke: { panel: pick((j.panel || {}).border && j.panel.border.width, L.panel_border, 10), body: pick(L.outline, 4), fine: pick(L.detail, 2), fg: pick(L.foreground_outline, 6), title: 10 },
    sub: { bg: pick(bar.color, '#38342e'), a: pick(bar.opacity, 1), fg: pick(S.color, '#fcf8f2'), size: pick(S.size, 54), weight: 700, h: pick(bar.h, 88), r: pick(bar.radius, 20), padX: pick(bar.pad_x, 41), y: pick(S.center && S.center.y, 1250), cx: pick(S.center && S.center.x, 519) },
  };
  if (P.sea) { const p = P.sea; out.sea = merge(common, { gutter: pick(gf.sea, p.paper), panel: pick(pf.sea_render, p.paper), paper: pick(GR.paper_strength && GR.paper_strength.sea, .45), panel2: p.panel_alt, panelMid: pick(pf.sea, p.panel), floor: p.far_grey, floorDark: p.mid_grey,
    ink: pick(p.ink, L.color), blue: p.ai_blue, blueDark: p.ai_blue_dark, blueLight: p.ai_blue_light, red: p.hero, redDark: p.hero_dark,
    grey: p.mid_grey, greyDark: p.grey, greyLight: p.far_grey, greyDeep: p.dark_grey, skin: p.skin, hoodie: p.mid_grey, pants: p.grey,
    halftone: !!(j.halftone && j.halftone.sea), titleShadow: null, titleItalicAI: true }); }
  if (P.dog) { const p = P.dog; out.dog = merge(common, { gutter: pick(gf.dog, p.paper), panel: pick(pf.dog_render, p.paper), paper: pick(GR.paper_strength && GR.paper_strength.dog, .2), labelR: 0, labelShadow: 7, labelBg: '#fdfbf6', panel2: p.panel_grey, panelMid: pick(pf.dog, p.panel_grey), floor: p.panel_grey, floorCool: p.cool_grey,
    ink: p.ink, blue: p.ai_blue, blueDark: p.ai_blue_dark, blueDeep: p.ai_blue_deep, blueLight: p.light_blue, fur: p.hero, furDark: p.hero_dark, furLight: p.hero_light,
    skin: p.skin, skinShade: p.skin_alt, hoodie: p.ai_blue, pants: p.ai_blue, halftone: true,
    titleShadow: (j.title && j.title.dog && j.title.dog.shadow) ? [j.title.dog.shadow.dx, j.title.dog.shadow.dy, j.title.dog.shadow.color] : [8, 8, p.ink], titleItalicAI: false }); }
  return out;
}

/* ---------- 网点（halftone）----------
 * defs 里预建 11 档网点图案（45° 网格，格距 cell）：ht_<色>_<0..10>，档位 = 覆盖率。
 * SVG 图案只能改透明度不能改点的大小，所以"渐变网点"用同心环 / 条带分档拼：12 档以内肉眼看不出台阶。 */
function halftoneDefs(cell = 5.7, colors) {
  let s = '';   // 档位 = 覆盖率 × 10（点的面积 / 格子面积）；参考片的暗面覆盖率 0.2–0.27 ≈ 2–3 档（tokens halftone.dog）
  for (const [name, col] of Object.entries(colors)) for (let lv = 0; lv <= 10; lv++) {
    const r = lv === 0 ? 0 : cell * Math.sqrt(lv / 10 * .85 / Math.PI);
    s += el('pattern', { id: `ht_${name}_${lv}`, width: cell, height: cell, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
      r > 0 ? circle(cell / 2, cell / 2, Math.min(r, cell * .62), { fill: col }) : '');
  }
  return s;
}
/* halftone(o)：o.kind = 'radial'（中间亮四周暗）| 'linear'（a→b 方向变暗）| 'flat'
 *   radial：cx, cy, r0（全亮半径）, r1（到这里达到 max 档）, sy（竖向拉伸，竖长格子用）
 *   linear：x0,y0 → x1,y1（从 0 档到 max 档）
 *   clip：已有的 clipPath id（不给就不裁）；color：'ink' | 'blue'；max：最深档（默认 8）；steps：分几档 */
function halftone(o) {
  const col = o.color || 'ink', max = o.max == null ? 4 : o.max, lo = o.min || 0, steps = o.steps || 10;
  let s = '';
  if (o.kind === 'flat') s = rect(-5000, -5000, 20000, 40000, { fill: `url(#ht_${col}_${max})` });
  else if (o.kind === 'linear') {
    const dx = o.x1 - o.x0, dy = o.y1 - o.y0, L = Math.hypot(dx, dy), ang = Math.atan2(dy, dx) * 180 / Math.PI;
    for (let i = 0; i < steps; i++) {
      const lv = Math.round(lerp(lo, max, (i + 1) / steps)), a = L * i / steps, b = i === steps - 1 ? L + 4000 : L * (i + 1) / steps;
      if (lv > 0) s += rect(a, -4000, b - a + .5, 8000, { fill: `url(#ht_${col}_${lv})` });
    }
    s = g({ x: o.x0, y: o.y0, r: ang }, s);
  } else {
    const cx = o.cx, cy = o.cy, r0 = o.r0 || 0, r1 = o.r1, sy = o.sy || 1, ring = (ra, rb) =>
      `M${n2(cx - rb)},${n2(cy)}a${n2(rb)},${n2(rb * sy)} 0 1,0 ${n2(rb * 2)},0a${n2(rb)},${n2(rb * sy)} 0 1,0 ${n2(-rb * 2)},0` +
      (ra > 0 ? `M${n2(cx - ra)},${n2(cy)}a${n2(ra)},${n2(ra * sy)} 0 1,0 ${n2(ra * 2)},0a${n2(ra)},${n2(ra * sy)} 0 1,0 ${n2(-ra * 2)},0` : '');
    for (let i = 0; i < steps; i++) {
      const lv = Math.round(lerp(lo, max, (i + 1) / steps)), ra = lerp(r0, r1, i / steps), rb = lerp(r0, r1, (i + 1) / steps);
      if (lv > 0) s += path(ring(ra, rb), { fill: `url(#ht_${col}_${lv})`, 'fill-rule': 'evenodd' });
    }
    s += path(`M-5000,-5000H15000V40000H-5000Z` + ring(0, r1).replace(/a/g, 'a'), { fill: `url(#ht_${col}_${max})`, 'fill-rule': 'evenodd' });
  }
  return o.clip ? g({ clip: o.clip }, s) : s;
}
/* 轮廓内侧的网点阴影（狗片的衣服、皮毛）：shape = 一段 SVG 形状（不带 fill/stroke），w = 阴影宽 */
function rimShade(shape, w = 26, o = {}) {
  if (!G.Q.T.rim && !o.force) return '';
  const [d, id] = clip(shape), col = o.color || 'ink', lvl = o.level || 3;
  const strip = (sw, lv) => shape.replace(/^<(\w+)/, `<$1 fill="none" stroke="url(#ht_${col}_${lv})" stroke-width="${sw}"`);
  return d + g({ clip: id }, strip(w * 2, lvl) + strip(w * .8, Math.min(10, lvl + 2)));
}

/* ---------- 纸纹：启动时按种子逐像素算一张（ImageData，不用 canvas 画线——GPU 抗锯齿在两次启动之间会差几个色阶，
 * 并行渲的几段拼起来就会在接缝处闪），multiply 叠在 world 之上、字幕之下 ---------- */
function paperCanvas(seed, tone) {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), r = rng(seed);
  const [tr, tg, tb] = tone.split(',').map(Number), dark = new Float32Array(W * H);
  for (let i = 0; i < 46; i++) {          // 大块的深浅：很淡
    const px = r() * W, py = r() * H, rad = 80 + r() * 220, a0 = .012 + r() * .02, x0 = Math.max(0, px - rad | 0), x1 = Math.min(W, px + rad | 0), y0 = Math.max(0, py - rad | 0), y1 = Math.min(H, py + rad | 0);
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const d = Math.hypot(xx - px, yy - py) / rad; if (d < 1) dark[yy * W + xx] += a0 * (1 - d); }
  }
  for (let i = 0; i < 520; i++) {         // 纤维：短弧，逐点画（每 0.5 px 一个点）
    const px = r() * W, py = r() * H, len = 6 + r() * 26, a = r() * Math.PI, bend = (r() - .5) * 10, al = .05 + r() * .12, wd = .6 + r() * 1.1;
    for (let s = 0; s <= len; s += .5) { const k = s / len, qx = px + Math.cos(a) * s + Math.sin(k * Math.PI) * bend * Math.sin(a), qy = py + Math.sin(a) * s - Math.sin(k * Math.PI) * bend * Math.cos(a);
      const ix = qx | 0, iy = qy | 0; if (ix >= 0 && ix < W && iy >= 0 && iy < H) { dark[iy * W + ix] = Math.max(dark[iy * W + ix], al); if (wd > 1.1 && ix + 1 < W) dark[iy * W + ix + 1] = Math.max(dark[iy * W + ix + 1], al * .6); } }
  }
  for (let i = 0; i < 2600; i++) { const ix = r() * W | 0, iy = r() * H | 0, al = .04 + r() * .1; dark[iy * W + ix] = Math.max(dark[iy * W + ix], al); if (r() < .4 && ix + 1 < W) dark[iy * W + ix + 1] = Math.max(dark[iy * W + ix + 1], al); }
  const im = x.createImageData(W, H), d = im.data;
  for (let i = 0; i < W * H; i++) { const a = Math.min(.6, dark[i]); d[i * 4] = Math.round(255 + (tr - 255) * a); d[i * 4 + 1] = Math.round(255 + (tg - 255) * a); d[i * 4 + 2] = Math.round(255 + (tb - 255) * a); d[i * 4 + 3] = 255; }
  x.putImageData(im, 0, 0);
  return c;
}
/* ---------- 影片 ----------
 * spec: { dur, fps=30, theme='sea' | (t)=>名字, assets: {id: 'assets/x.png'}, draw(t) }
 * draw(t) 返回 { cam:{x,y,zoom,rot}, shake:[...], world:'svg', screen:'svg', ui:'svg', look:{flash, fade, paper, bg} }
 *   world  跟镜头走（漫画长页）；screen 屏幕坐标、在纸纹之下；ui 屏幕坐标、在纸纹之上（字幕放这里）。
 *   look.flash 0..1 闪白；look.fade 0..1 压黑；look.paper 覆盖本帧纸纹强度；look.bg 覆盖底色。 */
function film(spec) {
  /* 工程目录里有 tokens.json 就先读进来（量过的数：色值、字号、时长），再搭页面；没有就用内置主题 */
  const go = () => build(spec);
  if (spec.tokens === false) return go();
  fetch(typeof spec.tokens === 'string' ? spec.tokens : 'tokens.json', { cache: 'no-store' })
    .then(r => r.ok ? r.json() : null).then(j => { if (j) useTokens(j); }).catch(() => null).then(go);
}
function build(spec) {
  const fps = spec.fps || 30, assets = spec.assets || {};
  document.body.insertAdjacentHTML('beforeend',
    `<div id="stage" style="position:absolute;left:0;top:0;width:${W}px;height:${H}px;overflow:hidden;isolation:isolate;transform-origin:0 0">` +
    `<svg id="main" xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="position:absolute;left:0;top:0">` +
    `<defs id="sdefs"></defs><g id="frame"></g></svg>` +
    `<svg id="ui" xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="position:absolute;left:0;top:0;z-index:3"><g id="uiframe"></g></svg></div>`);
  const stage = document.getElementById('stage'), frameG = document.getElementById('frame'), uiG = document.getElementById('uiframe');
  /* 常驻 defs：网点 + 图片素材（<use href="#a_id"> 引用，解码一次） */
  const T0 = THEMES[typeof spec.theme === 'string' ? spec.theme : 'sea'];
  let defs = halftoneDefs(spec.cell || tok('halftone.dog.pitch_px', 5.7), { ink: T0.ink, blue: T0.blueDark, white: '#ffffff', red: T0.redDark });
  const imgs = [];
  for (const [id, a] of Object.entries(assets)) {
    const src = typeof a === 'string' ? a : a.src; imgs.push({ id, src });
    defs += `<image id="a_${id}" href="${esc(src)}" x="0" y="0" width="${a.w || 100}" height="${a.h || 100}" preserveAspectRatio="none"/>`;
  }
  document.getElementById('sdefs').innerHTML = defs;
  /* 常驻的"预热层"：每张素材都 <use> 一次、几乎透明、画在最底下。<use> 的影子树第一次建出来要等解码，
   * 只在帧层里引用时，开工后第一帧可能还没画上（--det 抓到过）；常驻一份就不会。 */
  if (imgs.length) document.getElementById('frame').insertAdjacentHTML('beforebegin', `<g id="warm" opacity="0.004">${imgs.map(({ id }) => `<use href="#a_${id}" transform="scale(0.02)"/>`).join('')}</g>`);
  /* 纸纹：每个主题一张，固定种子 */
  const papers = {};
  const themeNames = typeof spec.theme === 'string' ? [spec.theme] : (spec.themes || Object.keys(THEMES));
  themeNames.forEach((nm, i) => {
    const c = paperCanvas(20261105 + i * 17, nm === 'dog' ? '60,55,50' : '96,78,50');
    c.style.cssText = 'position:absolute;left:0;top:0;mix-blend-mode:multiply;pointer-events:none;z-index:2;display:none';
    stage.insertBefore(c, document.getElementById('ui')); papers[nm] = c;
  });
  let shownPaper = null, collecting = false; const SFX = [];
  G.Q.sfx = (t, name, p) => { if (collecting) SFX.push([+(+t).toFixed(3), name, p || {}]); };

  function seek(t) {
    t = clamp(+t || 0, 0, spec.dur); _uid = 0;
    const nm = typeof spec.theme === 'function' ? spec.theme(t) : (spec.theme || 'sea');
    G.Q.T = THEMES[nm] || THEMES.sea; G.Q.t = t; G.Q.frame = Math.round(t * fps);
    const r = spec.draw(t) || {}, L = r.look || {};
    stage.style.background = L.bg || G.Q.T.gutter;
    const pc = papers[nm];
    if (shownPaper !== pc) { if (shownPaper) shownPaper.style.display = 'none'; if (pc) pc.style.display = 'block'; shownPaper = pc; }
    if (pc) pc.style.opacity = L.paper == null ? G.Q.T.paper : L.paper;
    const c = r.cam || { x: W / 2, y: H / 2, zoom: 1, rot: 0 }, sh = shakeAt(r.shake, t);
    frameG.innerHTML = `<g transform="${camTransform(c, sh)}">${r.world || ''}</g>${r.screen || ''}`;
    let ui = r.ui || '';
    if (L.flash > 0) ui += rect(0, 0, W, H, { fill: '#fffaf0', opacity: clamp(L.flash) });
    if (L.fade > 0) ui += rect(0, 0, W, H, { fill: '#000', opacity: clamp(L.fade) });
    if (G.SAFE_GUIDE && G.QK && G.QK.safeGuide) ui += G.QK.safeGuide();
    uiG.innerHTML = ui;
  }
  /* 音效事件表：每帧过一遍 draw，只收集 Q.sfx(...)，不出图 */
  function events() {
    SFX.length = 0; collecting = true;
    for (let i = 0; i <= spec.dur * fps; i++) { const t = i / fps; _uid = 0; G.Q.t = t; G.Q.T = THEMES[typeof spec.theme === 'function' ? spec.theme(t) : (spec.theme || 'sea')]; try { spec.draw(t); } catch (e) { } }
    collecting = false; const seen = new Set(), out = [];
    SFX.forEach(e => { const k = e[1] + '|' + (e[2].key || e[0]); if (!seen.has(k)) { seen.add(k); out.push(e); } });
    return out.sort((a, b) => a[0] - b[0]);
  }
  /* 预览：窗口缩放；?play 实时播放，?t=12.5 停在某一秒 */
  const P = new URLSearchParams(location.search), preview = P.has('play') || P.has('fit'); if (P.has('safe')) G.SAFE_GUIDE = true;
  function fit() { const k = Math.min(innerWidth / W, innerHeight / H); stage.style.transform = preview ? `scale(${k})` : ''; }
  addEventListener('resize', fit); fit();
  G.seek = seek; G.END = spec.dur; G.FPS = fps; G.events = events; G.META = spec.meta || {};
  /* READY：字体（各字重）+ 图片（HTML 解码 + SVG 里那份 load）都到位 */
  const fontLoads = ['500 50px "QY Sans"', '700 50px "QY Sans"', '900 50px "QY Sans"', '400 50px "QY Round"', '400 50px "QY Hand"', '400 50px "QY Serif"', 'italic 400 50px "QY Serif"']
    .map(f => document.fonts.load(f, '运A1啪').catch(() => null));
  const imgLoads = imgs.map(({ id, src }) => {
    const im = new Image(); im.src = src;
    const svgIm = document.getElementById('a_' + id);
    const svgDone = new Promise(res => { svgIm.addEventListener('load', res, { once: true }); setTimeout(res, 4000); });
    return Promise.all([im.decode().catch(e => console.error('素材解不开', src, e)), svgDone]);
  });
  Promise.all([document.fonts.ready, ...fontLoads, ...imgLoads]).then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))).then(() => {
    /* 预热：全片均匀跳 8 个时刻画一遍（量字缓存、图案、素材的影子树都建好），再等两帧，才算 READY */
    for (let i = 0; i < 8; i++) seek(spec.dur * (i + .5) / 8);
    return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  }).then(() => {
    G.READY = true; seek(+(P.get('t') || 0));
    if (P.has('play')) { const t0 = performance.now() - (+(P.get('t') || 0)) * 1000; const loop = () => { seek(((performance.now() - t0) / 1000) % spec.dur); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
  });
}
/* 放一张素材：Q.img('rock', x, y, w, h, o) —— 先在 spec.assets 里登记（带透明底的 PNG，w/h 写原图尺寸） */
function img(id, x, y, w, h, o = {}) {
  const a = (G.Q.ASSETS || {})[id] || {}, iw = a.w || 100, ih = a.h || 100;
  return g(Object.assign({ x, y, s: [w / iw, h / ih] }, o), `<use href="#a_${id}"/>`);
}

G.Q = {
  W, H, clamp, lerp, seg, smooth, ss, E, ease, hash, rng, noise1, q, keys, blink,
  esc, n2, attrs, el, tf, g, path, rect, circle, ellipse, pts, ink, FONTS, measure, text, uid, clip,
  SAFE: { right: [940, 820, 140, 740], bottom: [0, 1560, 1080, 360], top: [0, 0, 1080, 160] },
  cam, shakeAt, focus, THEMES, merge, useTokens, tok, halftone, rimShade, img, T: THEMES.sea, t: 0, frame: 0,
  film(spec) { G.Q.ASSETS = spec.assets || {}; return film(spec); },
};
})(window);
