# -*- coding: utf-8 -*-
"""主角（用户本人的卡通形象）姿势库：按姿势表生图 → 品红底抠图 → 总表。
  python -X utf8 gen_me.py <姿势表.json> <输出目录> [--master 定稿正面.png] [--par 3] [--only 名字,名字]
姿势表：{"point_r": "pointing to his right with his right arm straight, looking at the viewer", ...}
参考图：定稿正面（画风和比例以它为准）+ 用户照片（长相以它为准，paper-sticker-explainer/me_src/ref_face.jpeg、front_master.png）。
每张都是同一句底稿（BASE）+ 这个姿势的一句话；姿势要换衣服（换装）就在那一句里写清楚。
生图工具：环境变量 QY_IMG 指向的 img.py（命令行 `img.py out.png "提示词" -i 参考.png --size WxH --model gpt-image-2`；见 references/production.md 第 4 节）。
长相参考照片目录：--refs <目录>（里面放 ref_face.jpeg、front_master.png），或环境变量 QY_ME_SRC。
"""
import argparse, json, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import os
ME_SRC = Path(os.environ.get('QY_ME_SRC', 'me_src'))
IMG = os.environ.get('QY_IMG', 'img.py')
BASE = ("Draw the same character as the FIRST reference image (a cartoon of the young man in the second and third reference photos), "
        "in exactly the same drawing style as the first image: warm-black ink outline about 4 px with slight line-weight variation and tapered ends, "
        "flat fills with exactly one flat darker shadow shape per color, no gradients, no texture, very simple face (small dark oval eyes, short straight brows, "
        "tiny nose line, small mouth line), head about one sixth of total height, slim body, simple hands. Keep his identity: thick messy black hair sticking up "
        "on top with a few loose strands, slightly round face, small mole on his right cheek. Default outfit: olive green crew-neck t-shirt, black trousers, "
        "white sneakers. Full body unless stated. Solid flat pure magenta background (#FF00FF) everywhere, no floor, no ground shadow, no text, no frame, "
        "no props unless stated. Pose: ")

def run(name, pose, out, master):
    raw = out / 'raw' / f'{name}.png'
    if raw.exists(): return name, 'exists'
    cmd = [sys.executable, '-X', 'utf8', IMG, str(raw), BASE + pose, '-i', str(master), '-i', str(ME_SRC / 'ref_face.jpeg'),
           '-i', str(ME_SRC / 'front_master.png'), '--size', '1024x1536', '--model', 'gpt-image-2']
    for k in range(3):
        r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
        if raw.exists(): return name, 'ok'
        time.sleep(10 * (k + 1))
    return name, 'FAIL ' + (r.stdout + r.stderr)[-200:]

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('poses'); ap.add_argument('out')
    ap.add_argument('--master', required=True); ap.add_argument('--par', type=int, default=3); ap.add_argument('--only', default=''); ap.add_argument('--refs', default=None)
    a = ap.parse_args()
    if a.refs: ME_SRC = Path(a.refs)
    out = Path(a.out); (out / 'raw').mkdir(parents=True, exist_ok=True)
    poses = json.load(open(a.poses, encoding='utf-8'))
    if a.only: poses = {k: v for k, v in poses.items() if k in a.only.split(',')}
    with ThreadPoolExecutor(a.par) as ex:
        for name, st in ex.map(lambda kv: run(kv[0], kv[1], out, Path(a.master)), poses.items()): print(name, st, flush=True)
    here = Path(__file__).resolve().parent
    subprocess.run([sys.executable, '-X', 'utf8', str(here / 'cutout.py'), str(out / 'raw'), str(out / 'cut')])
