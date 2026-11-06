/* chars.js — 角色：红脑子、机器人、男孩（正面 / 侧面，侧面的头盖能掀开）、柴犬。
 * 画风约定（参考帧量出来的）：一种线色（T.ink）、身体线宽 T.stroke.body（≈4.5 px @1080）、平涂、最多一层阴影色块；
 * 狗片主题（T.rim = true）额外在衣服/皮毛轮廓内侧叠一圈网点。
 * 关节都是 rotate()：肩 → 肘 → 手是嵌套的 <g>，所以姿势就是几个角度（度）。原点：男孩/狗/全身机器人在脚底中心，头和脑子在中心。 */
(function (G) {
'use strict';
const Q = G.Q, { clamp, lerp, rng, hash, el, g, path, rect, circle, ellipse, pts, n2, clip } = Q;
const T = () => Q.T;
/* 线宽按屏幕 px 定（tokens lines.outline = 4）：角色整体放大缩小时线不跟着变粗变细。LK = 当前累计缩放，每个角色进门时乘上自己的 s */
let LK = 1;
const lw = w => n2(w / LK);
const withScale = (k, fn) => { const keep = LK; LK = keep * Math.abs(k || 1); try { return fn(); } finally { LK = keep; } };
const S = (w) => ({ stroke: T().ink, 'stroke-width': lw(w == null ? T().stroke.body : w), 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
const F = (fill, w) => Object.assign({ fill }, S(w));

/* 胶囊形的一节肢体：从 (0,0) 往 +y 长 L，宽 w0 → w1，两端圆头 */
function capsule(L, w0, w1) {
  const a = w0 / 2, b = w1 / 2;
  return `M${n2(-a)},0A${n2(a)},${n2(a)} 0 0,1 ${n2(a)},0L${n2(b)},${n2(L)}A${n2(b)},${n2(b)} 0 0,1 ${n2(-b)},${n2(L)}Z`;
}
const limbEl = (L, w0, w1, fill, w) => path(capsule(L, w0, w1), F(fill, w));

/* ---------- 红脑子 ----------
 * brain(x, y, o)：o.r 半宽（默认 70）, o.sq 竖向压扁（1 = 原样）, o.eyes 有没有脸（眼睛 + 腮红 + 小嘴）, o.look -1..1, o.blink 0..1,
 *   o.r0 转角, o.s 缩放（数或 [sx,sy]，落地压扁用）, o.color
 * 形状是手调的一条路径（单位坐标 r = 100）：前后几瓣 + 右下一截小脑，内部深红沟回线 + 左上几笔白高光，参考《海鞘》0:01–0:03。 */
const BRAIN_OUT = 'M-92,18C-104,-6 -98,-34 -80,-44C-78,-66 -52,-78 -30,-70C-18,-88 14,-88 26,-72C46,-82 76,-72 80,-50C100,-44 106,-14 96,2C106,22 96,44 76,46C70,62 46,66 32,56C30,72 10,80 -6,72C-22,74 -30,62 -28,54C-50,62 -78,52 -84,38C-98,36 -100,26 -92,18Z';
const BRAIN_LOBE = 'M-70,22C-40,4 0,10 30,30C44,38 60,40 72,34M0,-80C-6,-52 6,-30 -4,-6M-46,-66C-40,-46 -54,-30 -44,-12M40,-74C36,-54 52,-40 46,-20M-20,58C-4,50 16,52 30,56M-82,-10C-70,-16 -62,-6 -52,-12M50,-4C62,-10 70,0 84,-6M-30,30C-20,40 -6,36 4,44M-60,40C-50,34 -40,42 -32,36M14,-40C24,-44 30,-34 22,-26';
const BRAIN_HL = 'M-72,-30C-66,-48 -54,-56 -40,-60M-10,-70C0,-76 10,-76 18,-72M54,-62c8,-2 14,0 18,4M-56,10c8,-6 16,-6 22,-2';
function brain(x, y, o = {}) {
  const th = T(), k = (o.r || 70) / 100, sq = o.sq || 1, col = o.color || th.red;
  const ow = clamp(2 + 2.6 * k * LK, 2.6, 6) / k / LK, lw2 = ow * .78;          // 线宽按屏幕 px 定，不跟着缩放变细
  let s = path(BRAIN_OUT, { fill: col }) + path(BRAIN_LOBE, { fill: 'none', stroke: th.redDark, 'stroke-width': lw2, 'stroke-linecap': 'round' }) +
    path(BRAIN_HL, { fill: 'none', stroke: '#ffffff', 'stroke-width': lw2 * .9, 'stroke-linecap': 'round', opacity: .6 }) +
    path(BRAIN_OUT, { fill: 'none', stroke: th.ink, 'stroke-width': ow, 'stroke-linejoin': 'round' });
  if (o.eyes) {
    const lk = (o.look || 0) * 4, bk = 1 - (o.blink || 0) * .9;
    s += ellipse(36, 4, 11, 7, { fill: '#ef8a86', opacity: .75 }) + ellipse(84, 2, 9, 6, { fill: '#ef8a86', opacity: .75 });
    [[46, -18], [72, -20]].forEach(([ex, ey]) => {
      if (bk < .25) s += path(`M${ex - 8},${ey}q8,5 16,0`, { fill: 'none', stroke: th.ink, 'stroke-width': ow * .8, 'stroke-linecap': 'round' });
      else s += ellipse(ex + lk, ey, 9, 10.5 * bk, { fill: th.ink }) + circle(ex + lk - 3, ey - 4 * bk, 3.4, { fill: '#ffffff' });
    });
    s += path('M54,-4q6,6 12,0', { fill: 'none', stroke: th.ink, 'stroke-width': ow * .7, 'stroke-linecap': 'round' });
  }
  const sc = o.s == null ? 1 : o.s, scx = (Array.isArray(sc) ? sc[0] : sc) * k, scy = (Array.isArray(sc) ? sc[1] : sc) * k * sq;
  return g({ x, y, r: o.r0 || 0, s: [scx, scy] }, s);
}

/* ---------- 机器人 ----------
 * robot(x, y, o)：o.kind 'head'（一颗蓝头 + 黑屏脸，参考《海鞘》开头）| 'body'（全身，浅蓝头、蓝身子、灰关节）
 *   o.eyes 'dot' | 'happy'（弯弧笑眼）| 'blink'；o.smile；o.s 缩放；o.blink 0..1；o.chest 'brain' | null；
 *   o.pose {aL,eL,aR,eR}（全身时的手臂，度）；o.tilt 头歪 */
function robotFace(w, h, o) {
  const th = T(), bl = 1 - (o.blink || 0) * .9; let s = rect(-w / 2, -h / 2, w, h, { rx: Math.min(w, h) * .2, fill: '#151313' });
  const ex = w * .2, ey = -h * .04, er = Math.min(w, h) * .085;
  if (o.eyes === 'happy') s += path(`M${n2(-ex - er * 1.3)},${n2(ey + er * .5)}Q${n2(-ex)},${n2(ey - er * 1.6)} ${n2(-ex + er * 1.3)},${n2(ey + er * .5)}M${n2(ex - er * 1.3)},${n2(ey + er * .5)}Q${n2(ex)},${n2(ey - er * 1.6)} ${n2(ex + er * 1.3)},${n2(ey + er * .5)}`, { fill: 'none', stroke: '#ffffff', 'stroke-width': er * .55, 'stroke-linecap': 'round' });
  else s += ellipse(-ex, ey, er * .75, er * bl, { fill: '#ffffff' }) + ellipse(ex, ey, er * .75, er * bl, { fill: '#ffffff' });
  if (o.smile !== false) s += path(`M${n2(-er * .9)},${n2(h * .22)}Q0,${n2(h * .3)} ${n2(er * .9)},${n2(h * .22)}`, { fill: 'none', stroke: '#ffffff', 'stroke-width': er * .3, 'stroke-linecap': 'round' });
  return s;
}
function robot(x, y, o = {}) { return withScale(o.s || 1, () => robot_(x, y, o)); }
function robot_(x, y, o) {
  const th = T(), sw = th.stroke.body;
  if ((o.kind || 'head') === 'head') {
    const w = 260, h = 210;
    let s = rect(-w / 2 - 26, -42, 34, 84, F(th.blue, sw)) + rect(w / 2 - 8, -42, 34, 84, F(th.blue, sw));
    s += rect(-w / 2, -h / 2, w, h, Object.assign({ rx: 56 }, F(th.blue, sw)));
    s += path(`M${-w / 2 + 26},${-h / 2 + 64}Q${-w / 2 + 26},${-h / 2 + 24} ${-w / 2 + 66},${-h / 2 + 20}`, { fill: 'none', stroke: th.blueLight, 'stroke-width': lw(9), 'stroke-linecap': 'round', opacity: .8 });
    s += g({ y: 4 }, robotFace(w - 84, h - 92, o));
    return g({ x, y, s: o.s || 1, r: o.tilt || 0 }, s);
  }
  const P = Object.assign({ aL: 10, eL: 0, aR: 10, eR: 0 }, o.pose || {});
  const arm = (side, a, e) => g({ x: side * 120, y: -420, r: a * side }, limbEl(118, 36, 32, th.blue, sw) + g({ y: 112, r: -e * side }, limbEl(100, 32, 30, th.blue, sw) + circle(0, 104, 22, F(th.greyLight, sw)))) + circle(side * 120, -420, 22, F(th.greyLight, sw));
  let s = '';
  [-1, 1].forEach(sd => { s += rect(sd * 44 - 18, -200, 36, 170, F(th.blue, sw)) + circle(sd * 44, -118, 21, F(th.greyLight, sw)) + rect(sd * 50 - 42, -38, 84, 38, Object.assign({ rx: 16 }, F(th.blueDark, sw))); });
  s += arm(-1, P.aL, P.eL) + arm(1, P.aR, P.eR);
  s += rect(-112, -455, 224, 260, Object.assign({ rx: 12 }, F(th.blue, sw)));
  [[-92, -436], [92, -436], [-92, -214], [92, -214]].forEach(([a, b]) => { s += circle(a, b, 5, { fill: th.ink }); });
  if (o.chest === 'brain') s += rect(-62, -420, 124, 150, Object.assign({ rx: 10 }, F(th.blueLight, sw * .8))) + brain(0, -345, { r: 58 });
  s += rect(-26, -486, 52, 34, F(th.greyLight, sw)) + path('M-26,-475h52M-26,-464h52', { stroke: th.ink, 'stroke-width': lw(2) });
  s += g({ x: 0, y: -590, r: o.tilt || 0, py: 100 },
    path('M0,-100v-46', { stroke: th.ink, 'stroke-width': lw(5) }) + circle(0, -154, 16, F(th.blue, sw)) +
    rect(-124, -40, 22, 70, Object.assign({ rx: 8 }, F(th.blue, sw))) + rect(102, -40, 22, 70, Object.assign({ rx: 8 }, F(th.blue, sw))) +
    rect(-108, -100, 216, 196, Object.assign({ rx: 44 }, F(th.blueLight, sw), { stroke: th.blue, 'stroke-width': lw(9) })) +
    rect(-108, -100, 216, 196, { rx: 44, fill: 'none', stroke: th.ink, 'stroke-width': lw(2.5) }) + robotFace(164, 140, Object.assign({ eyes: 'happy' }, o)));
  return g({ x, y, s: o.s || 1 }, s);
}
/* ---------- 男孩 ----------
 * 姿势角度（度）：aL/aR = 上臂从下垂往外张（正 = 往外），eL/eR = 肘往里弯（正 = 前臂往身体中线/往上折），
 *   hL/hR = 大腿往外/往前，kL/kR = 膝盖弯。POSES 里是常用的几种，可以混：Q.keys 在两种姿势之间插值。 */
const POSES = {
  idle:   { aL: 8, eL: 6, aR: 8, eR: 6, hL: 2, hR: 2, kL: 0, kR: 0 },
  wave:   { aL: 8, eL: 6, aR: 150, eR: -30, hL: 2, hR: 2 },
  point:  { aL: 8, eL: 6, aR: 92, eR: 0, hL: 2, hR: 2 },
  think:  { aL: 20, eL: 120, aR: 18, eR: 150, hL: 2, hR: 2 },
  cheer:  { aL: 155, eL: 0, aR: 155, eR: 0, hL: 6, hR: 6 },
  shrug:  { aL: 55, eL: -80, aR: 55, eR: -80, hL: 2, hR: 2 },
  hold:   { aL: 22, eL: 108, aR: 22, eR: 108, hL: 2, hR: 2 },
  hips:   { aL: 38, eL: 105, aR: 38, eR: 105, hL: 4, hR: 4 },
  present:{ aL: 8, eL: 6, aR: 62, eR: 38, hL: 2, hR: 2 },
};
/* 走路：时间 → 姿势（每秒 sp 步） */
function walk(t, sp = 1.6, amp = 1) { const p = Math.sin(t * sp * Math.PI) * amp; return { aL: 8 - p * 18, eL: 10, aR: 8 + p * 18, eR: 10, hL: p * 20, hR: -p * 20, kL: Math.max(0, -p) * 25, kR: Math.max(0, p) * 25 }; }

/* boy(x, y, o)：x,y 脚底中心
 *   o.view 'front' | 'side'（侧面朝右；o.flip = true 朝左）；o.s 缩放；o.pose 姿势对象或 POSES 的名字；o.armsFront 手臂画在头前面
 *   o.eyes 'open'|'closed'|'happy'；o.blink 0..1（不给 = 按 o.seed 自动眨）；o.mouth 'smile'|'open'|'o'|'flat'|'frown'；o.brows 'up'|'down'|'flat'
 *   o.tilt 头歪（度）；o.lean 上身前倾（度）；o.bob 呼吸起伏（px）；o.hair 'mop'（狗片）| 'spike'（海鞘片）
 *   o.hoodie/o.pants/o.skin 换色；o.lid 0..1 头盖掀开（只在 side 有）；o.brainScale 头里那颗脑子的大小（0 = 空的） */
function boy(x, y, o = {}) { return withScale(o.s || 1, () => boy_(x, y, o)); }
function boy_(x, y, o) {
  const th = T(), sw = th.stroke.body, P = Object.assign({}, POSES.idle, typeof o.pose === 'string' ? POSES[o.pose] : (o.pose || {}));
  const C = { hoodie: o.hoodie || th.hoodie, pants: o.pants || th.pants, skin: o.skin || th.skin, hair: o.hairColor || th.hair, shoe: th.shoe };
  const bl = o.blink != null ? o.blink : Q.blink(Q.t, o.seed || 1), hair = o.hair || (th.name === 'dog' ? 'mop' : 'spike');
  const inner = (o.view || 'front') === 'side' ? boySide(P, C, o, bl, sw, th) : boyFront(P, C, o, bl, sw, th, hair);
  return g({ x, y, s: o.flip ? [-(o.s || 1), o.s || 1] : (o.s || 1) }, g({ y: -(o.bob || 0) }, inner));
}
function face(o, bl, th, cx, cy, view) {
  let s = ''; const eye = o.eyes || 'open', bk = 1 - bl * .92, ey = cy + 18;
  const xs = view === 'side' ? [cx + 60] : [cx - 30, cx + 30];
  xs.forEach(ex => {
    if (eye === 'closed' || bk < .2) s += path(`M${ex - 11},${ey}q11,7 22,0`, { fill: 'none', ...S(3.5) });
    else if (eye === 'happy') s += path(`M${ex - 12},${ey + 4}q12,-14 24,0`, { fill: 'none', ...S(4) });
    else s += ellipse(ex, ey, 10, 13 * bk, { fill: th.ink }) + circle(ex - 3, ey - 4 * bk, 3.4 * bk, { fill: '#ffffff' });
    const bd = o.brows === 'up' ? -8 : o.brows === 'down' ? 6 : 0, bx = view === 'side' ? 6 : 0;
    s += path(`M${ex - 13 + bx},${ey - 25 + (o.brows === 'down' ? (ex < cx ? -3 : 3) : 0)}q13,${-6 + bd * .5} 26,${bd * .2}`, { fill: 'none', ...S(3.5) });
  });
  const mx = view === 'side' ? cx + 84 : cx, my = view === 'side' ? cy + 58 : cy + 62, m = o.mouth || 'smile';
  if (m === 'smile') s += path(`M${mx - 17},${my - 3}q17,14 34,0`, { fill: 'none', ...S(3.5) });
  else if (m === 'open') s += path(`M${mx - 18},${my - 6}h36q-2,22 -18,22q-16,0 -18,-22z`, F('#5a2320', 3.5)) + path(`M${mx - 9},${my + 9}q9,-6 18,0`, { fill: '#d86b5c' });
  else if (m === 'o') s += ellipse(mx, my + 2, 8, 10, F('#5a2320', 3.5));
  else if (m === 'flat') s += path(`M${mx - 13},${my}h26`, { fill: 'none', ...S(3.5) });
  else if (m === 'frown') s += path(`M${mx - 15},${my + 6}q15,-12 30,0`, { fill: 'none', ...S(3.5) });
  return s;
}
function boyFront(P, C, o, bl, sw, th, hair) {
  /* 比例照《AI 的狗》3:25：头宽 ≈ 身高 0.22，腿短而粗，卫衣方。原点在脚底，全高 ≈ 935 */
  const rim = (shape, w) => th.rim ? Q.rimShade(shape, w, { color: 'ink', level: 6 }) : '';
  const leg = (sd, a, k) => g({ x: sd * 44, y: -385, r: -a * sd }, path(capsule(175, 72, 66), F(C.pants, sw)) + rim(path(capsule(175, 72, 66)), 12) +
    g({ y: 170, r: k * sd }, path(capsule(182, 66, 62), F(C.pants, sw)) + rim(path(capsule(182, 66, 62)), 12) + ellipse(sd * 6, 190, 52, 27, F(C.shoe, sw))));
  const fa = (sd, e) => path(capsule(132, 48, 44), F(C.hoodie, sw)) + rect(-24, 118, 48, 16, Object.assign({ rx: 6 }, F(C.hoodie, sw * .8))) + circle(0, 148, 24, F(C.skin, sw));
  const arm = (sd, a, e) => g({ x: sd * 106, y: -690, r: -a * sd }, path(capsule(158, 56, 50), F(C.hoodie, sw)) + rim(path(capsule(158, 56, 50)), 14) + g({ y: 150, r: e * sd }, fa(sd, e) + rim(path(capsule(132, 48, 44)), 12)));
  const torso = 'M-90,-705C-124,-703 -132,-672 -132,-646L-142,-388Q-142,-364 -118,-364H118Q142,-364 142,-388L132,-646C132,-672 124,-703 90,-705Z';
  let s = leg(-1, P.hL, P.kL || 0) + leg(1, P.hR, P.kR || 0);
  s += path('M-80,-712Q-100,-760 -54,-768H54Q100,-760 80,-712Z', F(C.hoodie, sw));
  const arms = arm(-1, P.aL, P.eL) + arm(1, P.aR, P.eR);
  const body = g({ r: o.lean || 0, py: -380 }, path(torso, F(C.hoodie, sw)) + rim(`<path d="${torso}"/>`, 26) + path('M-138,-410H138', { stroke: th.ink, 'stroke-width': lw(3) }) +
    path('M-70,-520H70L88,-428H-88Z', { fill: 'none', ...S(3) }) + path('M-28,-698v58M28,-698v58', { stroke: th.ink, 'stroke-width': lw(3), 'stroke-linecap': 'round' }) + circle(-28, -636, 4, { fill: th.ink }) + circle(28, -636, 4, { fill: th.ink }) +
    rect(-24, -750, 48, 52, F(C.skin, sw)) + path('M-70,-708Q0,-652 70,-708', F(C.hoodie, sw)));
  const head = g({ y: -802, r: o.tilt || 0, py: 70 }, g({ s: 1.12 }, withScale(1.12, () => frontHead(C, o, bl, sw, th, hair))));
  s += o.armsFront ? body + head + arms : body + arms + head;   // 手臂默认压在身子上（参考片的袖子有自己的黑边）
  return s;
}
function frontHead(C, o, bl, sw, th, hair) {
  let s = '';
  if (hair === 'mop') s += ellipse(0, -28, 100, 82, F(C.hair, sw));
  else s += path('M-96,-10C-104,-80 -60,-118 0,-118C60,-118 104,-80 96,-10Z', F(C.hair, sw));
  s += ellipse(-90, 14, 16, 22, F(C.skin, sw)) + ellipse(90, 14, 16, 22, F(C.skin, sw));
  s += ellipse(0, 6, 92, 84, F(C.skin, sw));
  if (hair === 'mop') s += path('M-98,8C-108,-56 -66,-104 0,-104C66,-104 108,-56 98,8L88,-16L74,4L62,-22L44,-2L28,-28L8,-6L-10,-28L-28,-4L-44,-26L-62,-2L-76,-20Z', F(C.hair, sw)) +
    path('M-50,-78q30,-14 62,-10', { fill: 'none', stroke: '#ffffff', 'stroke-width': lw(6), 'stroke-linecap': 'round', opacity: .55 });
  else s += path('M-96,6C-104,-70 -60,-110 0,-110C60,-110 104,-70 96,6L84,-30L70,-2L58,-36L38,-10L24,-42L4,-14L-14,-44L-30,-12L-48,-40L-64,-6L-80,-34Z', F(C.hair, sw));
  s += face(o, bl, th, 0, 4, 'front');
  if (o.blush) s += ellipse(-52, 44, 16, 9, { fill: '#e8846e', opacity: .45 }) + ellipse(52, 44, 16, 9, { fill: '#e8846e', opacity: .45 });
  return s;
}
/* 侧面（朝右）：《海鞘》里那个长脖子、刺头、头盖能掀开的男孩 */
function boySide(P, C, o, bl, sw, th) {
  const sp = Math.sin((P.hL || 0) * Math.PI / 180);
  const legS = (dx, a, k, fill) => g({ x: dx, y: -420, r: -a }, path(capsule(205, 62, 56), F(fill, sw)) + g({ y: 198, r: k }, path(capsule(210, 56, 52), F(fill, sw)) + path('M-24,196Q-28,232 4,234H60Q74,232 70,214Q60,198 26,196Z', F(C.shoe, sw))));
  const torso = 'M-30,-770C-70,-770 -96,-744 -100,-700L-112,-430Q-112,-404 -86,-404H70Q96,-404 94,-432L84,-700C80,-748 52,-770 20,-770Z';
  let s = legS(-10, -(P.hR || 0), P.kR || 0, C.pants) + legS(10, P.hL || 0, P.kL || 0, C.pants);
  s += g({ r: o.lean || 0, py: -420 },
    ellipse(-62, -760, 52, 40, F(C.hoodie, sw)) +
    path(torso, F(C.hoodie, sw)) + path('M-20,-700Q-34,-560 -26,-440', { fill: 'none', stroke: Q.T.greyLight, 'stroke-width': lw(3), opacity: .9 }) +
    path('M-108,-448H90', { stroke: th.ink, 'stroke-width': lw(3) }) +
    g({ x: 0, y: -720, r: -(P.aR == null ? 6 : P.aR) * .6 }, path(capsule(170, 50, 46), F(C.hoodie, sw)) + g({ y: 162, r: -(P.eR || 0) }, path(capsule(140, 44, 40), F(C.hoodie, sw)) + circle(0, 152, 22, F(C.skin, sw)))) +
    path('M-26,-905L-32,-768H48L56,-905Z', F(C.skin, sw)) +
    g({ x: 0, y: -1010, r: o.tilt || 0, py: 100 }, sideHead(C, o, bl, sw, th)));
  return s;
}
function sideHead(C, o, bl, sw, th) {
  /* 头局部坐标：(0,0) ≈ 头的中心，朝右。结构照《海鞘》0:17：方后脑、斜切口（铰链在后上）、切口下面的刺刘海和鬓角不动，
   * 掀开的是上面那块"头盖"——外黑（头发）、内灰（颅骨内面）、中间一条白线；切口上露出一大团脑子。 */
  const lid = clamp(o.lid || 0), H0 = [-84, -42], CUT = 'M-84,-42C-30,-50 40,-46 96,-30', bs = o.brainScale == null ? 1 : o.brainScale;
  const prof = 'M-84,-42L-82,40Q-60,96 30,116Q66,114 88,94C96,88 98,82 94,78C100,72 104,64 98,60C104,56 106,50 102,46C112,40 122,36 120,26C112,10 102,0 100,-20L96,-30C40,-46 -30,-50 -84,-42Z';
  let s = path(prof, F(C.skin, sw));
  s += path('M-84,-42C-60,-46 -36,-48 -14,-47L-18,0C-20,28 -30,52 -40,72L-48,86Q-66,74 -78,56L-82,40Z', F(C.hair, sw));   // 后脑勺（切口以下那圈头发）
  s += path('M-8,8C-26,8 -28,42 -10,46', { fill: 'none', ...S(3.5) }) + path('M-12,18q6,6 0,14', { fill: 'none', ...S(2.5) });   // 耳朵
  s += path('M4,-46H30V30L18,32L4,30Z', F(C.hair, sw));                                                    // 鬓角
  s += path('M34,-40L44,-4L56,-30L66,6L76,-26L86,2L96,-30C70,-40 50,-42 34,-40Z', F(C.hair, sw));   // 刺刘海（不跟着头盖走）
  s += face(o, bl, th, 4, 6, 'side');
  if (lid > 0) {                                                                                            // 切口上：脑子 + 颅骨的一圈灰边
    const [cd, cid] = clip(`<path d="M-300,-38L-84,-42C-30,-50 40,-46 96,-30L300,-26V-400H-300Z"/>`);   // 只裁掉切口以下
    s += cd + (bs > 0 ? g({ clip: cid }, brain(14, -70, { r: 96 * bs, sq: .95 })) : '');
    s += path(CUT, { fill: 'none', stroke: th.ink, 'stroke-width': lw(sw * 2.6), 'stroke-linecap': 'round' }) + path(CUT, { fill: 'none', stroke: th.greyLight, 'stroke-width': lw(sw * 1.2), 'stroke-linecap': 'round' });
  }
  const dome = 'M-84,-42C-30,-50 40,-46 96,-30C104,-80 70,-118 10,-120C-50,-120 -92,-90 -84,-42Z';
  const inner = 'M-72,-46C-30,-52 36,-48 84,-36C88,-76 60,-104 10,-106C-42,-106 -76,-82 -72,-46Z';
  const ang = -lid * 104;
  s += g({ r: ang, px: H0[0], py: H0[1] }, path(dome, F(C.hair, sw)) +
    (lid > .05 ? path(inner, { fill: th.greyDark }) + path('M-70,-50C-74,-84 -40,-104 10,-104', { fill: 'none', stroke: '#ffffff', 'stroke-width': lw(4), 'stroke-linecap': 'round', opacity: .9 }) : ''));
  if (lid > .05) s += circle(H0[0], H0[1], 9, F(th.greyLight, 3));
  return s;
}

/* ---------- 柴犬（狗片）----------
 * dog(x, y, o)：脚底中心；o.s, o.look -1..1, o.blink, o.ears 0..1（竖起来的程度）, o.mouth 'smile'|'open', o.tilt */
function dog(x, y, o = {}) { return withScale(o.s || 1, () => dog_(x, y, o)); }
function dog_(x, y, o) {
  const th = T(), sw = th.stroke.body, fi = th.furInk, FF = (c) => ({ fill: c, stroke: fi, 'stroke-width': lw(sw), 'stroke-linejoin': 'round' });
  const bl = o.blink != null ? o.blink : Q.blink(Q.t, o.seed || 5), bk = 1 - bl * .9, lk = (o.look || 0) * 8, ear = o.ears == null ? 1 : o.ears;
  const body = 'M-150,0L-90,-330Q-60,-400 0,-404Q60,-400 90,-330L150,0Z';
  let s = path(body, FF(th.fur)) + Q.rimShade(`<path d="${body}"/>`, 26, { level: 4 }) + path('M-62,0L-46,-300Q0,-330 46,-300L62,0Z', { fill: th.furLight });
  s += path('M-96,-372Q0,-330 96,-372L100,-336Q0,-292 -100,-336Z', FF(th.blue)) + circle(0, -312, 15, FF(th.blueLight));
  const head = 'M-150,-110C-160,-40 -120,10 -60,24Q0,36 60,24C120,10 160,-40 150,-110C142,-170 90,-196 0,-196C-90,-196 -142,-170 -150,-110Z';
  const earL = `M-138,-140L${n2(-120 + (1 - ear) * -30)},${n2(-300 + (1 - ear) * 90)}L-40,-188Z`, earR = `M138,-140L${n2(120 + (1 - ear) * 30)},${n2(-300 + (1 - ear) * 90)}L40,-188Z`;
  let h = path(earL, FF(th.fur)) + path(earR, FF(th.fur)) + path(`M-118,-162L${n2(-112 + (1 - ear) * -24)},${n2(-260 + (1 - ear) * 76)}L-66,-184Z`, { fill: th.furLight }) + path(`M118,-162L${n2(112 + (1 - ear) * 24)},${n2(-260 + (1 - ear) * 76)}L66,-184Z`, { fill: th.furLight });
  h += path(head, FF(th.fur)) + Q.rimShade(`<path d="${head}"/>`, 20, { level: 3 });
  h += path('M-104,-30C-110,10 -60,34 0,36C60,34 110,10 104,-30C90,-70 40,-74 0,-62C-40,-74 -90,-70 -104,-30Z', { fill: th.furLight });
  [-1, 1].forEach(sd => {
    const ex = sd * 58, ey = -96;
    h += ellipse(ex + lk, ey, 19, 21 * bk, { fill: '#3a1d12', stroke: fi, 'stroke-width': lw(3) });
    if (bk > .3) h += circle(ex + lk - 6, ey - 7, 6, { fill: '#ffffff' }) + circle(ex + lk + 6, ey + 7, 2.5, { fill: '#ffffff' });
    h += ellipse(sd * 46, -140, 14, 8, { fill: th.furLight });
  });
  h += path('M-24,-36Q0,-50 24,-36Q24,-16 0,-12Q-24,-16 -24,-36Z', { fill: '#1c1716' }) + path('M-12,-34q6,-4 12,-2', { stroke: '#ffffff', 'stroke-width': lw(3), fill: 'none', 'stroke-linecap': 'round', opacity: .7 });
  h += (o.mouth === 'open' ? path('M-28,0Q0,-6 28,0Q22,34 0,36Q-22,34 -28,0Z', FF('#7a2a22')) + path('M-14,22q14,-10 28,0', { fill: '#d86b5c' }) : '') +
    path('M0,-12V2M0,2Q-16,16 -32,4M0,2Q16,16 32,4', { fill: 'none', stroke: fi, 'stroke-width': lw(4), 'stroke-linecap': 'round' });
  s += g({ y: -380, r: o.tilt || 0, py: 20 }, h);
  return g({ x, y, s: o.s || 1 }, s);
}

G.QC = { brain, robot, boy, dog, POSES, walk, capsule };
})(window);
