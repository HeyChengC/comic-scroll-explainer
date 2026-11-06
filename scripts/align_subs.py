# -*- coding: utf-8 -*-
"""把定稿文案对齐到配音的逐字时间，切成字幕行。
  python -X utf8 align_subs.py <配音.mp3> <文案.txt> <输出前缀> [--lead 0.2] [--max 14]
产出：<前缀>.words.json（whisper 逐字）、<前缀>.chars.json（文案每个字的起止）、<前缀>.subs.json（字幕行 {a, b, text, first_char_t}）
做法：whisper 认出来的字和文案的字做序列对齐（difflib），认错的字（园丁鸟 → 圆丁鸟）按前后对上的字插值。
字幕按标点切，一行不超过 --max 字，按意群（逗号、顿号、冒号）优先断；行与行首尾相接，不留空档；行首比第一个字早 --lead 秒（卡 §11：早 0.14–0.27s）。
"""
import argparse, difflib, json, re
from faster_whisper import WhisperModel

ap = argparse.ArgumentParser()
ap.add_argument('audio'); ap.add_argument('text'); ap.add_argument('out')
ap.add_argument('--lead', type=float, default=0.2); ap.add_argument('--max', type=int, default=14)
ap.add_argument('--prompt', default='')
a = ap.parse_args()

PUNCT = '，。：、！？“”"「」；,.!?：（）() \n'
text = open(a.text, encoding='utf-8').read().strip()
m = WhisperModel('large-v3', device='cuda', compute_type='float16')
segs, _ = m.transcribe(a.audio, language='zh', word_timestamps=True, initial_prompt=a.prompt or None)
wch = []  # (char, t0, t1)
for s in segs:
    for w in s.words:
        cs = [c for c in w.word.strip() if c not in PUNCT]
        if not cs: continue
        d = (w.end - w.start) / len(cs)
        for i, c in enumerate(cs): wch.append((c, w.start + i * d, w.start + (i + 1) * d))
json.dump([dict(c=c, t=round(t0, 3), end=round(t1, 3)) for c, t0, t1 in wch], open(a.out + '.words.json', 'w', encoding='utf-8'), ensure_ascii=False)

# 文案里要读出来的字（数字、英文按读法已在配音文本里，这里用配音文本本身）
tch = [c for c in text if c not in PUNCT]
sm = difflib.SequenceMatcher(None, tch, [c for c, _, _ in wch], autojunk=False)
tt = [None] * len(tch)
for blk in sm.get_matching_blocks():
    for k in range(blk.size): tt[blk.a + k] = (wch[blk.b + k][1], wch[blk.b + k][2])
# 插值没对上的字
known = [i for i, v in enumerate(tt) if v]
for i in range(len(tt)):
    if tt[i]: continue
    lo = max([k for k in known if k < i], default=None); hi = min([k for k in known if k > i], default=None)
    if lo is None: tt[i] = (tt[hi][0], tt[hi][0])
    elif hi is None: tt[i] = (tt[lo][1], tt[lo][1])
    else:
        f = (i - lo) / (hi - lo); t = tt[lo][1] + f * (tt[hi][0] - tt[lo][1]); tt[i] = (t, t)
# 校准：whisper 的字起点普遍比真实开口早（2026-11-05 豆包配音量到中位早 0.18s）。
# 只在前面有真停顿（≥0.12s）的字上量：停顿里找能量最低点，往后第一次高出 15 dB 的时刻就是真实开口。取中位数整体平移。
import numpy as np, librosa
y, sr = librosa.load(a.audio, sr=16000, mono=True); hop = 80
db = 20 * np.log10(librosa.feature.rms(y=y, frame_length=320, hop_length=hop)[0] + 1e-9); ft = np.arange(len(db)) * hop / sr
offs = []
for i in range(1, len(tt)):
    if tt[i][0] - tt[i - 1][1] < 0.12: continue
    i0 = np.searchsorted(ft, tt[i - 1][1] - 0.05); i1 = np.searchsorted(ft, tt[i][0] + 0.4); seg = db[i0:i1]
    if len(seg) < 4: continue
    q = int(np.argmin(seg)); up = np.where(seg[q:] > seg[q] + 15)[0]
    if len(up): offs.append(ft[i0 + q + up[0]] - tt[i][0])
shift = float(np.clip(np.median(offs), -0.3, 0.3)) if len(offs) >= 8 else 0.0
tt = [(v[0] + shift, v[1] + shift) for v in tt]
print(f'校准：在 {len(offs)} 个停顿后量开口，整体平移 {shift:+.3f}s')
json.dump([dict(c=c, t=round(v[0], 3), end=round(v[1], 3)) for c, v in zip(tch, tt)], open(a.out + '.chars.json', 'w', encoding='utf-8'), ensure_ascii=False)
print('matched', len(known), '/', len(tch))

# 切行：先按句号问号感叹号分句，再按逗号顿号冒号分意群；意群超长从中间附近、虚词前面断；短意群只在同一句里并
SOFT = '是在把被都还要去和与跟就也一'  # 断在这些字前面好读；断在的、了前面不好读
def nchar(x): return len([c for c in x if c not in PUNCT])
def hard_split(p):
    out = []
    while nchar(p) > a.max:
        n = nchar(p); best, bs = None, 1e9
        for cut in range(4, len(p) - 3):
            left = nchar(p[:cut])
            if left > a.max or n - left > a.max + 4: continue
            score = abs(left - n / 2) - (3 if p[cut] in SOFT else 0) - (2 if p[cut - 1] in '的了' else 0) + (6 if p[cut] in '的了着过' else 0)
            if score < bs: best, bs = cut, score
        best = best or a.max
        out.append(p[:best].strip()); p = p[best:].strip()
    return out + [p]
merged = []
for sent in re.split(r'(?<=[。！？])', text.replace('\n', '')):
    sent = sent.strip()
    if not sent: continue
    q = sent.endswith('？')
    parts = [p.strip().replace('“', '').replace('”', '').replace('"', '') for p in re.split(r'[，、：；,]', sent.strip('。！？')) if p.strip()]
    lines = []
    for p in parts: lines += hard_split(p)
    for j, ln in enumerate(lines):
        if lines and j > 0 and nchar(ln) <= 3 and nchar(merged[-1]) + nchar(ln) <= a.max: merged[-1] += ' ' + ln
        elif j == 0 and nchar(ln) <= 2 and len(lines) > 1: lines[1] = ln + ' ' + lines[1]  # 句首短词并进本句下一行
        else: merged.append(ln)
    if q: merged[-1] += '？'
DISPLAY = [('二零二三年', '2023年'), ('一八三九年', '1839年'), ('一八七四年', '1874年'), ('一九七零年', '1970年'), ('A I', 'AI'), ('从 1970', '从 1970')]
def disp(x):
    for a_, b_ in DISPLAY: x = x.replace(a_, b_)
    x = re.sub(r'\s+', ' ', x).strip()
    return re.sub(r'(?<=[一-鿿]) (?=\d)', '', x)
k = 0; subs = []
for ln in merged:
    n = nchar(ln)
    t0 = tt[k][0]; t1 = tt[k + n - 1][1]; k += n
    subs.append(dict(text=disp(ln), first_char_t=round(t0, 3), last_char_t=round(t1, 3)))
for i, s in enumerate(subs):
    s['a'] = round(max(0.0, s['first_char_t'] - a.lead), 3)
for i, s in enumerate(subs):
    s['b'] = subs[i + 1]['a'] if i + 1 < len(subs) else round(s['last_char_t'] + 0.4, 3)
json.dump(subs, open(a.out + '.subs.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(subs), 'lines; chars/line p50', sorted(len(s['text']) for s in subs)[len(subs) // 2], 'max', max(len(s['text']) for s in subs))
for s in subs[:12]: print(f"{s['a']:7.2f}-{s['b']:7.2f}  {s['text']}")
