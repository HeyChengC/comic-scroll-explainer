# -*- coding: utf-8 -*-
"""品红底抠图：<raw 目录>/<名字>.png → <cut 目录>/<名字>.png（透明底、裁边）+ <cut 目录>/_sheet.jpg（棋盘底总表，查白边 / 品红残边）。
  python -X utf8 cutout.py <raw 目录> <cut 目录> [名字 ...]
做法：
  1. 从四条边取样估背景色（生图的"纯品红"常常带一点渐变或偏色，不能写死 #FF00FF）。
  2. 和背景色的距离 < 阈值的像素算候选背景；只保留从四边连通过来的那部分（洪水填充），主体里碰巧偏粉的东西（舌头、火焰）不会被抠掉。
  3. 边缘一圈按距离给半透明（2 px 羽化），再去溢色：边缘像素里多出来的品红（R、B 高于 G 的部分）减掉。
  4. 封闭的品红空隙（手臂和身体之间）和边不连通，另外按"很品红、够大"挑出来也算背景。
  5. 裁到不透明的外框，四周留 4 px。
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

RAW, CUT = Path(sys.argv[1]), Path(sys.argv[2]); CUT.mkdir(parents=True, exist_ok=True)

def cut(name, thr=90, soft=40):
    im = np.asarray(Image.open(RAW / f'{name}.png').convert('RGB')).astype(np.float32)
    h, w, _ = im.shape
    border = np.concatenate([im[:6].reshape(-1, 3), im[-6:].reshape(-1, 3), im[:, :6].reshape(-1, 3), im[:, -6:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    d = np.sqrt(((im - bg) ** 2).sum(-1))
    # 品红性：R、B 都比 G 高很多。和距离一起用，避免把浅灰的地方当成背景
    mag = np.minimum(im[..., 0], im[..., 2]) - im[..., 1]
    cand = (d < thr) | ((mag > 120) & (d < thr * 1.8))
    lab, n = ndimage.label(cand)
    edge_labels = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bgmask = np.isin(lab, list(edge_labels))
    # 封闭的品红小块（手臂和身体之间的空隙）：和边不连通，洪水填充够不着。很品红、又够大的连通块也算背景
    strong = (mag > 150) & (d < thr * 1.5)
    lab2, n2 = ndimage.label(strong & ~bgmask)
    if n2:
        sizes = ndimage.sum(np.ones_like(mag), lab2, range(1, n2 + 1))
        keep = [i + 1 for i, sz in enumerate(sizes) if sz >= 40]
        bgmask |= np.isin(lab2, keep)
    # 羽化：离背景 2 px 以内的主体像素按"像不像背景"给 alpha
    dist_in = ndimage.distance_transform_edt(~bgmask)
    alpha = np.where(bgmask, 0.0, 1.0)
    band = (~bgmask) & (dist_in <= 2.5)
    alpha[band] = np.clip((d[band] - thr * .5) / soft, 0, 1)
    # 去溢色：边缘带里的品红减掉（把 R、B 拉到不超过 G + 原来的差距）
    out = im.copy(); e = (dist_in <= 4) & (~bgmask)
    spill = np.clip(np.minimum(out[..., 0], out[..., 2]) - out[..., 1] - 10, 0, None)
    out[..., 0][e] -= spill[e] * .9; out[..., 2][e] -= spill[e] * .9
    rgba = np.dstack([np.clip(out, 0, 255), alpha * 255]).astype(np.uint8)
    ys, xs = np.where(alpha > .05)
    y0, y1, x0, x1 = max(0, ys.min() - 4), min(h, ys.max() + 5), max(0, xs.min() - 4), min(w, xs.max() + 5)
    img = Image.fromarray(rgba[y0:y1, x0:x1], 'RGBA'); img.save(CUT / f'{name}.png')
    left = ((alpha > .5) & (mag > 90)).sum()   # 主体里还剩多少"很品红"的像素：多了说明抠不干净或主体本来就是粉的
    return img.size, int(left), bg.astype(int).tolist()

def sheet(names):
    tiles = []
    for n in names:
        p = CUT / f'{n}.png'
        if not p.exists(): continue
        im = Image.open(p); s = 300 / max(im.size); im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))))
        bg = Image.new('RGB', (320, 320), (90, 90, 90)); chk = Image.new('RGB', (320, 320), (200, 200, 200))
        for yy in range(0, 320, 20):
            for xx in range(0, 320, 20):
                if (xx // 20 + yy // 20) % 2: bg.paste(chk.crop((0, 0, 20, 20)), (xx, yy))
        bg.paste(im, ((320 - im.width) // 2, (320 - im.height) // 2), im); tiles.append(bg)
    if not tiles: return
    cols = 5; rows = (len(tiles) + cols - 1) // cols; S = Image.new('RGB', (320 * cols, 320 * rows), 'white')
    for i, t in enumerate(tiles): S.paste(t, ((i % cols) * 320, (i // cols) * 320))
    S.save(CUT / '_sheet.jpg', quality=85)

if __name__ == '__main__':
    names = sys.argv[3:] or sorted(p.stem for p in RAW.glob('*.png'))
    for n in names:
        try: print(n, *cut(n))
        except Exception as e: print('ERR', n, e)
    sheet(sorted(p.stem for p in CUT.glob('*.png') if not p.stem.startswith('_')))
