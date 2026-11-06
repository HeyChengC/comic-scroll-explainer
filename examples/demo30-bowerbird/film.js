/* film_demo30：《做视频的意义》0–30.6 s。sea 主题（大格、甩 0.45 s、竖向速度线、无网点）。导演表见 blueprint.md。 */
(function () {
'use strict';
const { W, H, g, path, rect, circle, ellipse, text, cam, keys, seg, E, ease, lerp, clamp, rng, n2 } = Q;
const K = QK, T = () => Q.T;
const ST = Q.T.accent || '#d8b44a', STD = Q.T.accentDark || '#a88428', BL = '#2a66a8', BLD = '#1e487e', BLL = '#a2bad2';

/* 素材：生图（assets/raw 有提示词），抠成透明 PNG */
const A = {
  berries: { src: 'assets/cut/berries.png', w: 329, h: 313 }, bird_cap: { src: 'assets/cut/bird_cap.png', w: 820, h: 699 },
  bird_nudge: { src: 'assets/cut/bird_nudge.png', w: 967, h: 429 }, bird_stand: { src: 'assets/cut/bird_stand.png', w: 791, h: 699 },
  bird_thief: { src: 'assets/cut/bird_thief.png', w: 783, h: 646 }, bird_walk: { src: 'assets/cut/bird_walk.png', w: 933, h: 629 },
  bird_wet: { src: 'assets/cut/bird_wet.png', w: 699, h: 710 }, bower: { src: 'assets/cut/bower.png', w: 782, h: 530 },
  cap: { src: 'assets/cut/cap.png', w: 292, h: 229 }, female: { src: 'assets/cut/female.png', w: 778, h: 728 },
  flower: { src: 'assets/cut/flower.png', w: 301, h: 361 }, straw: { src: 'assets/cut/straw.png', w: 398, h: 309 },
  me_desk: { src: 'assets/me/sit_desk.png', w: 913, h: 1357 }, me_point: { src: 'assets/me/point_r.png', w: 737, h: 1484 },
};
/* 底边中心放图：put(id, cx, 底y, 高, {flip, r, a}) */
function put(id, cx, by, h, o = {}) {
  const a = A[id], w = h * a.w / a.h, x = cx - w / 2, y = by - h;
  const inner = Q.img(id, 0, 0, w, h);
  return g({ x, y, a: o.a, r: o.r || 0, px: w / 2, py: h }, o.flip ? g({ s: [-1, 1], px: w / 2, py: 0 }, inner) : inner);
}
/* 甩镜：到 t 时到位，0.45 s（tokens camera.whip.duration_s.sea） */
const WH = Q.tok('camera.whip.duration_s.sea', .45);
const WHIPS = [2.065, 6.425, 16.185, 19.605, 25.025];   // 甩镜开始 = 这一行字幕出来那一刻
/* 竖向速度线：引擎 K.whipLines（tokens camera.whip.speed_lines） */
/* 地面：一条手画感的地平线 + 下面一档深色土 + 几颗碎石 */
function ground(r, y, seed = 1) {
  const [x, , w, h] = r, rn = rng(seed); let d = `M${x},${y}`;
  for (let i = 1; i <= 24; i++) d += `L${n2(x + w * i / 24)},${n2(y + (rn() - .5) * 6)}`;
  let s = rect(x, y, w, r[1] + h - y, { fill: T().panel2 }) + path(d, { fill: 'none', stroke: T().ink, 'stroke-width': 4, 'stroke-linecap': 'round' });
  for (let i = 0; i < 14; i++) { const px = x + 30 + rn() * (w - 60), py = y + 30 + rn() * Math.max(10, r[1] + h - y - 60), rr = 4 + rn() * 9;
    s += ellipse(px, py, rr * 1.4, rr, { fill: T().floor, stroke: T().ink, 'stroke-width': 2 }); }
  for (let i = 0; i < 6; i++) { const px = x + 40 + rn() * (w - 80);   // 草丛
    s += path(`M${n2(px - 16)},${y}l6,-26M${n2(px)},${y}l0,-36M${n2(px + 14)},${y}l-4,-24`, { stroke: T().ink, 'stroke-width': 3, 'stroke-linecap': 'round', fill: 'none' }); }
  return s;
}
/* 虚线描出来的形状（画出来的过程 = 一段段长出来） */
function dashed(t, d, t0, dur, o = {}) {
  const k = ease('out2', seg(t, t0, t0 + dur)); if (k <= 0) return '';
  const on = o.dash || 22, off = o.gap || 16, n = Math.max(1, Math.floor(k * 1000 / (on + off)));
  const da = Array(n).fill(`${on} ${off}`).join(' ') + ' 0 2000';
  return g({ a: o.a }, path(d, { fill: 'none', stroke: o.color || T().ink, 'stroke-width': o.w || 6, pathLength: 1000, 'stroke-dasharray': da, 'stroke-linecap': 'round' }));
}
/* 爱心 */
const heart = (x, y, s, fill) => path(`M${x},${y + 30 * s}C${x - 60 * s},${y - 10 * s} ${x - 30 * s},${y - 50 * s} ${x},${y - 22 * s}C${x + 30 * s},${y - 50 * s} ${x + 60 * s},${y - 10 * s} ${x},${y + 30 * s}Z`, { fill, stroke: T().ink, 'stroke-width': 4, 'stroke-linejoin': 'round' });
/* 抛物线：从 a 飞到 b，顶点高 hgt */
function arc(t, t0, dur, a, b, hgt) { const k = seg(t, t0, t0 + dur), e = ease('io2', k); return [lerp(a[0], b[0], e), lerp(a[1], b[1], e) - Math.sin(k * Math.PI) * hgt, k]; }

/* ===== 第 1 页：片名格 + 钩子格（0–2.5） ===== */
const P1a = [25, 25, 1030, 560], P1b = [25, 605, 1030, 1290];
function page1(t) {
  let w = K.panel(t, P1a, K.speedlines(t, P1a, { ry: .66 }) + K.title(t, [
    { y: 205, size: 110, segs: [{ s: '做视频的意义，' }] },
    { y: 410, size: 88, segs: [{ s: '或许就是证明你' }, { s: '费了劲', fill: ST, size: 1.2 }] }], { font: 'round' }));
  const bx = 520, gy = 1560, birdIn = t < 1.9;
  w += K.panel(t, P1b, (lt) => ground(P1b, gy, 3) + K.fallLines(t, [640, 605, 220, 900], { t0: .05, t1: .55, n: 8 })
    + (birdIn ? put('bird_stand', bx, gy, 430, { flip: true }) : put('bird_cap', bx + 40, gy, 430, { flip: true })));
  if (t < 1.9) w += put('cap', 790, gy + 20 + K.dropY(t, 0, 760), 120);   // 蓝瓶盖从片名格掉下来，压过格线
  w += K.burst(t, 880, 1330, '嗒!', { t0: .6, size: 84, r: 8 });
  w += K.popmarks(t, bx + 60, 1150, { t0: .7, t1: 1.3, n: 5, a0: -150 });
  w += K.ring(t, 795, 1500, 110, { t0: 1.5, t1: 1.9, color: BL, ticks: 0 });   // "证明"：蓝圈套住瓶盖
  return w;
}
/* ===== 第 2 页：澳大利亚、园丁鸟、雌鸟、"先盖房子"（2.07–6.4） ===== */
const P2 = [25, 1945, 1030, 1870];
const AUS = 'M-250,-40C-230,-110 -150,-120 -110,-150C-80,-190 -30,-170 -10,-200C10,-230 60,-200 70,-160C90,-190 120,-230 150,-190C190,-130 250,-80 260,0C270,70 220,140 150,170C90,190 50,160 0,150C-60,140 -100,170 -170,150C-240,130 -280,60 -250,-40ZM110,230C130,220 160,230 150,260C130,280 100,260 110,230Z';
function page2(t) {
  const gy = 3330;
  return K.panel(t, P2, (lt) => {
    let s = ground(P2, gy, 5);
    const mk = E.outBack(seg(t, 2.25, 2.55), 1.6);
    if (mk > 0) s += g({ x: 540, y: 2270, s: mk * .95 }, path(AUS, { fill: T().panel2, stroke: T().ink, 'stroke-width': 5, 'stroke-linejoin': 'round' })
      + circle(170, -60, 14, { fill: ST, stroke: T().ink, 'stroke-width': 4 }));
    s += K.label(t, 610, 2120, '澳大利亚', { t0: 2.3, size: 44 });
    if (t >= 2.6) s += put('bird_stand', 330, gy + K.popY(t, 2.6, 300), 470, { flip: true });   // "有一种鸟"：从地里冒出来
    s += K.label(t, 90, 2750, '园丁鸟', { t0: 3.35, size: 48 });
    if (t >= 4.1) s += put('female', lerp(1260, 800, ease('out3', seg(t, 4.1, 4.5))), gy, 400, { flip: true });   // 雌鸟走进来（朝左看雄鸟）
    const hk = E.outBack(seg(t, 4.5, 4.75), 2); if (hk > 0) s += g({ x: 0, y: 0, s: hk, px: 600, py: 2900 }, heart(600, 2900, 1.3, ST));
    if (t >= 5.1) s += K.bubble(t, [90, 2470, 470, 300], { t0: 5.1, tail: [300, 2900], shape: 'ellipse', lines: [], caret: false, cps: 0 });
    s += dashed(t, 'M190,2700C190,2580 230,2540 270,2540C300,2560 300,2640 300,2700M360,2700C360,2640 360,2560 390,2540C430,2540 470,2580 470,2700M150,2705L510,2705', 5.2, .8, { color: STD, w: 7 });
    return s;
  });
}
/* ===== 第 3 页：上排三个小格（找蓝东西）+ 下面大格（搭走廊、叼回来、摆、挪）（6.4–16.2） ===== */
const P3i = K.row([25, 3865, 1030, 520], [1, 1, 1]), P3b = [25, 4405, 1030, 1330];
const YARD = { flower: [340, 5560, 150], berries: [470, 5555, 120], straw: [580, 5565, 110] };
const FLY = { flower: 13.13, berries: 13.5, straw: 13.85 };
function page3(t) {
  const gy = 5240; let w = '';
  w += K.panel(t, P3b, (lt) => {
    let s = ground(P3b, gy, 9);
    const rk = ease('out2', seg(t, 6.6, 7.7)), [cd, cid] = Q.clip(rect(0, 5300 - 470 * rk - 20, W, 470 * rk + 40));
    if (rk > 0) s += cd + g({ clip: cid }, put('bower', 610, 5300, 440));   // 走廊从下往上长出来
    s += K.fallLines(t, [380, 4405, 460, 900], { t0: 6.6, t1: 7.6, n: 9, color: STD, w: 4, speed: 2200 });
    // 鸟：叼草来回 → 8.15 跳出画面去找 → 12.93 叼着瓶盖从右边回来 → 14.23 低头摆 → 15.1 挪
    if (t < 8.15) s += put('bird_walk', 200 + Math.abs(Math.sin(lt * 9)) * 0 , 5300 - Math.abs(Math.sin(lt * 7)) * 22, 300);
    else if (t < 8.8) { const k = seg(t, 8.15, 8.8); s += put('bird_walk', lerp(200, 1250, ease('in2', k)), 5300 - Math.sin(k * Math.PI * 2) * 60 - k * 300, 300); }
    else if (t >= 12.93 && t < 14.23) { const k = ease('out2', seg(t, 12.93, 13.45)); s += put('bird_cap', lerp(1250, 850, k), lerp(5250, 5560, k) - Math.abs(Math.sin(k * Math.PI * 2)) * 50, 300); }
    else if (t >= 14.23) { const j = (t > 15.3 ? 22 : 0) + (t > 15.75 ? 18 : 0); s += put('bird_nudge', 880 - j, 5575, 200); }
    for (const [id, [x, y, h]] of Object.entries(YARD)) if (t >= FLY[id] + .4) s += put(id, x, y, h);
    return s;
  });
  w += K.vibe(t, 650, 5520, { t0: 15.3, t1: 16.1, side: -1 });
  // 三个小格：花丛、浆果枝、垃圾袋；每个例子一拍弹出（字幕行首）
  const bush = (cx, cy) => [[-90, 20, 80], [0, -20, 95], [90, 20, 80], [-40, 60, 70], [50, 60, 70]].map(([dx, dy, r]) => circle(cx + dx, cy + dy, r, { fill: '#9c968a', stroke: T().ink, 'stroke-width': 4 })).join('');
  const inset = (i, t0, body) => K.panel(t, P3i[i], body, { in: 'pop', t0, fill: T().panelMid });
  const cx = r => r[0] + r[2] / 2;
  w += inset(0, 9.3, () => bush(cx(P3i[0]), 4200) + (t < FLY.flower ? put('flower', cx(P3i[0]) + 20, 4190, 190) : ''));
  w += inset(1, 10.08, () => path(`M${P3i[1][0]},3990Q${cx(P3i[1])},4030 ${P3i[1][0] + P3i[1][2]},3970`, { stroke: T().greyDeep, 'stroke-width': 14, fill: 'none', 'stroke-linecap': 'round' })
    + (t < FLY.berries ? put('berries', cx(P3i[1]), 4230, 200) : ''));
  w += inset(2, 10.9, () => { const x = cx(P3i[2]);
    return (t < FLY.straw ? put('straw', x + 40, 4170, 120, { r: -20 }) : '') + (t < 12.93 ? put('cap', x - 60, 4180, 70) : '')
      + path(`M${x - 120},4330L${x - 100},4190L${x - 60},4210L${x - 20},4180L${x + 30},4205L${x + 80},4185L${x + 120},4220L${x + 130},4330Z`, { fill: T().greyDark, stroke: T().ink, 'stroke-width': 4, 'stroke-linejoin': 'round' })
      + path(`M${x - 70},4250l30,40M${x + 40},4240l-20,50`, { stroke: T().ink, 'stroke-width': 2, fill: 'none' }); });
  // 一件一件飞回门口（跨过格线）
  const from = { flower: [cx(P3i[0]) + 20, 4190, 190], berries: [cx(P3i[1]), 4230, 200], straw: [cx(P3i[2]) + 40, 4170, 120] };
  for (const id of Object.keys(FLY)) { const t0 = FLY[id]; if (t < t0 || t >= t0 + .4) continue;
    const [x, y, k] = arc(t, t0, .4, from[id], YARD[id], 260); w += put(id, x, y, lerp(from[id][2], YARD[id][2], k), { r: k * 360 * .15 }); }
  return w;
}
/* ===== 第 4 页：不能住、不能挡雨、给雌鸟看（16.2–19.6） ===== */
const P4 = [25, 5785, 1030, 1870];
function page4(t) {
  const gy = 6900;
  return K.panel(t, P4, (lt) => {
    let s = ground(P4, gy, 11);
    s += dashed(t, 'M260,6560C300,6300 440,6230 620,6230C800,6230 940,6300 980,6560', 16.6, .5, { color: T().greyDark, w: 7 });   // 想象中的屋顶：只是一条虚线
    s += put('bower', 620, gy + 40, 460);
    const wet = t >= 17.45;
    s += wet ? put('bird_wet', 640, gy + 10, 250) : put('bird_stand', 640, gy + 10, 240, { flip: t > 16.9 });
    s += K.fallLines(t, P4, { t0: 17.35, t1: 18.5, n: 26, color: T().greyDark, w: 3, speed: 3000, len: 300 });   // 雨直接穿过"屋顶"
    if (t >= 18.79) s += put('female', lerp(-150, 190, ease('out3', seg(t, 18.79, 19.15))), gy + 30, 330);
    return s;
  });
}
function page4top(t) {   // 压在格子上面的标注
  return K.qmark(t, 800, 6170, { t0: 16.75, t1: 17.4, s: 1.1 }) + K.arrow(t, [330, 6560], [520, 6660], { t0: 19.15, dur: .3, color: T().ink, bend: -.3, w: 6 })
    + K.popmarks(t, 620, 6560, { t0: 19.3, n: 7, r0: 230, r1: 290, a0: -160, span: 140 });
}
/* ===== 第 5 页：上格偷瓶盖拆房子（19.6–22.9）；下格纸板假房子（22.9–25.0） ===== */
const P5a = [25, 7705, 1030, 1050], P5b = [25, 8775, 1030, 880];
function page5(t) {
  let w = K.panel(t, P5a, (lt) => {
    const gy = 8300; let s = ground(P5a, gy, 13);
    // 隔壁的亭子：21.83 被踢散成两半
    const bk = seg(t, 21.83, 22.3), bw = 300 * A.bower.w / A.bower.h, bx = 800 - bw / 2;
    if (bk <= 0) s += put('bower', 800, gy + 30, 300);
    else for (const sd of [-1, 1]) { const [cd, cid] = Q.clip(rect(sd < 0 ? bx - 50 : 800, 7900, bw / 2 + 50, 500));
      s += cd + g({ x: sd * 120 * E.out2(bk), y: -40 * Math.sin(bk * Math.PI) + 30 * bk, r: sd * 25 * E.out2(bk), px: 800, py: gy }, g({ clip: cid }, put('bower', 800, gy + 30, 300))); }
    if (t < 20.95) s += put('cap', 690, gy + 45, 60);
    s += put('cap', 880, gy + 50, 60);
    // 小偷：蹑手蹑脚进来 → 叼走瓶盖 → 踢 → 跑
    if (t < 20.95) { const k = seg(t, 19.9, 20.9); s += put('bird_stand', lerp(-150, 560, k), gy + 20 - Math.abs(Math.sin(k * Math.PI * 5)) * 18, 230, { flip: true }); }
    else if (t < 22.2) s += put('bird_thief', 560 + (t > 21.75 ? 20 : 0), gy + 20, 230);
    else s += put('bird_thief', lerp(560, -250, ease('in2', seg(t, 22.2, 22.75))), gy + 20, 230, { flip: true });
    return s;
  });
  w += K.burst(t, 860, 7960, '嘭!', { t0: 21.83, size: 90, r: 10 });
  w += K.panel(t, P5b, (lt) => {
    const gy = 9440; let s = ground(P5b, gy, 17);
    s += put('female', 230, gy + 20, 320);
    // 纸板画的假亭子 + 一根小棍撑着；24.15 啪地倒下
    const fk = E.in2(seg(t, 24.15, 24.45)), up = E.outBack(seg(t, 22.95, 23.25), 1.6);
    const board = rect(-180, -330, 360, 330, { fill: '#c9a878', stroke: T().ink, 'stroke-width': 5 }) + g({ a: .9 }, put('bower', 0, -40, 230))
      + path('M-150,-300l30,0M140,-60l20,0', { stroke: T().ink, 'stroke-width': 2 });
    if (up > 0) s += path(`M${700 + 120},${gy}L${700 + 40},${gy - 200 * (1 - fk)}`, { stroke: T().greyDeep, 'stroke-width': 9, 'stroke-linecap': 'round' })
      + g({ x: 700, y: gy, s: [1, Math.max(.06, up * (1 - fk * .94))] }, board);
    s += put('bird_stand', 950, gy + 15, 220, { r: t > 24.3 ? -6 : 0 });
    if (t > 24.4) s += K.sweat(905, gy - 205, 1.1);
    return s;
  }, { in: 'pop', t0: 22.885 });
  w += K.burst(t, 760, 9300, '啪!', { t0: 24.42, size: 80, r: -8 });
  return w;
}
/* ===== 第 6 页：上格日历 + 一堆瓶盖 + 雌鸟一眼；下格"人做视频"（25.0–30.6） ===== */
const P6a = [25, 9695, 1030, 1150], P6b = [25, 10865, 1030, 820];
function page6(t) {
  let w = K.panel(t, P6a, (lt) => {
    const gy = 10520; let s = ground(P6a, gy, 19);
    // 撕页日历：天数一页页翻
    const day = t < 25.25 ? 1 : Math.min(47, 1 + Math.floor((t - 25.25) / .75 * 46));
    s += rect(110, 9800, 300, 330, { fill: '#f7f2e6', stroke: T().ink, 'stroke-width': 5 }) + rect(110, 9800, 300, 70, { fill: T().greyDark, stroke: T().ink, 'stroke-width': 5 })
      + circle(170, 9800, 10, { fill: T().ink }) + circle(350, 9800, 10, { fill: T().ink })
      + text(String(day), 260, 10010, { size: 150, weight: 900, font: 'sans' }) + text('天', 360, 10095, { size: 40, weight: 700 });
    if (t > 25.25 && t < 26.05) { const f = ((t - 25.25) / .75 * 46) % 1; s += g({ x: 260, y: 9870, r: -f * 70, py: 0 }, rect(-150, 0, 300, 120 * (1 - f), { fill: '#f7f2e6', stroke: T().ink, 'stroke-width': 3 })); }
    // 找回来的蓝东西：一件一件堆起来
    const nCaps = Math.floor(clamp((t - 26.15) / .7) * 24);
    for (let i = 0; i < nCaps; i++) { const c = i % 6, r = Math.floor(i / 6); s += put('cap', 560 + c * 72 + (r % 2) * 30, 10120 - r * 52, 56); }
    s += put('bower', 760, gy + 40, 250);
    s += put('female', 300, gy + 30, 330);
    return s;
  });
  w += K.ring(t, 360, 10230, 60, { t0: 27.05, t1: 27.9, color: T().ink, ticks: 8 });
  w += K.popmarks(t, 380, 10230, { t0: 27.1, t1: 27.9, n: 6, r0: 80, r1: 130, a0: -60, span: 120 });
  w += K.panel(t, P6b, (lt) => {
    let s = '';
    s += dashed(t, 'M250,11620C230,11330 260,11150 330,11110M330,11110C350,11300 340,11500 340,11620M840,11620C830,11400 830,11250 860,11110M860,11110C930,11160 950,11380 930,11620', 29.09, 1.0, { color: STD, w: 8 });
    s += put('me_desk', 560, 11640, 560);
    // 竖屏小视频：屏里是一座小亭子
    s += rect(890, 11140, 130, 230, { rx: 14, fill: '#f7f2e6', stroke: T().ink, 'stroke-width': 5 }) + g({ a: t > 29.6 ? 1 : 0 }, put('bower', 955, 11330, 90));
    return s;
  }, { content_t0: 28.185 });
  // 一根草茎从鸟的亭子跨过格线飞到桌上
  if (t >= 28.4 && t < 29.6) { const [x, y, k] = arc(t, 28.4, .6, [760, 10380], [820, 11330], 200); w += put('straw', x, y, 80, { r: k * 200 }); }
  return w;
}

const CAM = [{ t: 0, x: 540, y: 960, zoom: 1 },
  { t: 2.065 + WH, go: WH, y: 2880 }, { t: 6.425 + WH, go: WH, y: 4800 }, { t: 12.85, go: 1.6, zoom: 1.035 }, { t: 13.45, go: .5, y: 4900, zoom: 1.04 },
  { t: 16.185 + WH, go: WH, y: 6720, zoom: 1 }, { t: 19.605 + WH, go: WH, y: 8230 }, { t: 22.885 + WH, go: WH, y: 8700 },
  { t: 25.025 + WH, go: WH, y: 10270 }, { t: 28.185 + .5, go: .5, y: 10690, zoom: .93 }];
const SUBS = [{"a": 0.0, "b": 0.825, "s": "做视频的意义"}, {"a": 0.825, "b": 2.065, "s": "或许就是证明你费了劲"}, {"a": 2.065, "b": 3.145, "s": "澳大利亚有一种鸟"}, {"a": 3.145, "b": 3.905, "s": "叫园丁鸟"}, {"a": 3.905, "b": 4.905, "s": "雄鸟谈恋爱之前"}, {"a": 4.905, "b": 6.425, "s": "要先盖一座小房子"}, {"a": 6.425, "b": 7.945, "s": "它用草茎搭出一条小走廊"}, {"a": 7.945, "b": 9.305, "s": "再去附近找蓝色的东西"}, {"a": 9.305, "b": 10.085, "s": "蓝色的花"}, {"a": 10.085, "b": 10.905, "s": "蓝色的浆果"}, {"a": 10.905, "b": 12.925, "s": "甚至是人扔掉的蓝瓶盖和吸管"}, {"a": 12.925, "b": 14.025, "s": "一件一件叼回来"}, {"a": 14.025, "b": 14.905, "s": "在门口摆好"}, {"a": 14.905, "b": 16.185, "s": "摆歪了还要回去挪"}, {"a": 16.185, "b": 17.145, "s": "这房子不能住"}, {"a": 17.145, "b": 17.945, "s": "也不能挡雨"}, {"a": 17.945, "b": 18.585, "s": "唯一的用处"}, {"a": 18.585, "b": 19.605, "s": "就是给雌鸟看"}, {"a": 19.605, "b": 20.485, "s": "有的雄鸟还会"}, {"a": 20.485, "b": 21.625, "s": "去隔壁偷别人的蓝瓶盖"}, {"a": 21.625, "b": 22.885, "s": "顺手把人家的房子拆了"}, {"a": 22.885, "b": 23.945, "s": "因为在鸟的世界里"}, {"a": 23.945, "b": 25.025, "s": "力气是装不出来的"}, {"a": 25.025, "b": 25.945, "s": "你花了多少天"}, {"a": 25.945, "b": 26.845, "s": "找了多少东西"}, {"a": 26.845, "b": 27.985, "s": "雌鸟一眼就看得出来"}, {"a": 27.985, "b": 28.885, "s": "人做视频"}, {"a": 28.885, "b": 30.505, "s": "其实也是在盖这样一座小房子"}];
Q.film({
  dur: 30.6, fps: 30, theme: 'sea', assets: A,
  draw(t) {
    let w = '';
    if (t < 2.6) w += page1(t);
    if (t > 1.9 && t < 7.0) w += page2(t);
    if (t > 6.2 && t < 16.8) w += page3(t);
    if (t > 15.9 && t < 20.2) w += page4(t) + page4top(t);
    if (t > 19.4 && t < 25.6) w += page5(t);
    if (t > 24.8) w += page6(t);
    return { cam: cam(CAM, t), shake: [{ t: .6 }, { t: 21.83, kind: 'buzz' }, { t: 24.42, kind: 'buzz' }], world: w, screen: K.whipLines(t, WHIPS), ui: K.subtitle(t, SUBS) };
  },
});
})();
