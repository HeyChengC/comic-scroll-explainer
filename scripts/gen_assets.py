# -*- coding: utf-8 -*-
"""比喻动物、道具、场景的生图：一张一个东西，品红底，每张提示词存同名 .txt，出完自动抠图。
  python -X utf8 gen_assets.py <jobs.json> <输出目录> [--ref 风格参考.png ...] [--par 2] [--only 名字,名字] [--size 1024x1024]
jobs.json：{"prefix": "风格前缀（写死色值，见 production.md 第 4 节）", "suffix": "可选，默认品红底单主体",
            "jobs": {"bird_stand": "主体 + 姿势 + 朝向 + 比例", ...}}
生图工具：环境变量 QY_IMG 指向的 img.py（`img.py out.png "提示词" -i 参考.png --size WxH --model gpt-image-2`）。
一张图出多件东西（2×2 道具）时，抠完用 cutout.py 的结果自己裁；最好还是一张一件。
"""
import argparse, json, os, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

IMG = os.environ.get('QY_IMG', 'img.py')
SUF = (" Single subject, centered, generous empty margin on all sides. Solid flat pure magenta background (#FF00FF) everywhere, no floor, "
       "no ground shadow, no text, no letters, no frame.")

def run(name, body, out, pre, suf, refs, size):
    raw = out / 'raw' / f'{name}.png'; full = pre + body + suf
    (out / 'raw' / f'{name}.txt').write_text(full + '\n\nrefs: ' + ', '.join(Path(r).name for r in refs), encoding='utf-8')
    if raw.exists(): return name, 'exists'
    cmd = [sys.executable, '-X', 'utf8', IMG, str(raw), full, '--size', size, '--model', 'gpt-image-2']
    for r in refs: cmd += ['-i', str(r)]
    for k in range(3):
        p = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
        if raw.exists(): return name, 'ok'
        print(name, 'retry', (p.stdout + p.stderr)[-200:], flush=True); time.sleep(10 * (k + 1))
    return name, 'FAIL'

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('jobs'); ap.add_argument('out')
    ap.add_argument('--ref', nargs='*', default=[]); ap.add_argument('--par', type=int, default=2)
    ap.add_argument('--only', default=''); ap.add_argument('--size', default='1024x1024')
    a = ap.parse_args()
    J = json.load(open(a.jobs, encoding='utf-8')); jobs = J['jobs']
    if a.only: jobs = {k: v for k, v in jobs.items() if k in a.only.split(',')}
    out = Path(a.out); (out / 'raw').mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(a.par) as ex:
        for name, st in ex.map(lambda kv: run(kv[0], kv[1], out, J.get('prefix', ''), J.get('suffix', SUF), a.ref, a.size), jobs.items()): print(name, st, flush=True)
    subprocess.run([sys.executable, '-X', 'utf8', str(Path(__file__).resolve().parent / 'cutout.py'), str(out / 'raw'), str(out / 'cut')])
