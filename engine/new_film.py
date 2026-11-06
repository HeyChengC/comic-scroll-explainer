# -*- coding: utf-8 -*-
"""建一个竖屏漫画的空工程：index.html + 一份只有一个空格子和字幕的 film.js（脚手架，不是模板）。

  python new_film.py <工程目录> [--theme sea|dog] [--dur 60] [--tokens <skill>/tokens.json]

之后：python render.py <工程目录> --serve 预览；--sheet 看拼图；--clip 渲一段。
"""
import argparse, shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
FILM = """/* {name}：{theme} 主题，{dur} 秒。先写导演表（每格让观众懂什么、凭什么接上一格），再往这里填格子。 */
(function () {{
'use strict';
const {{ W, H, g, path, rect, circle, text, cam, keys, seg, E, ss, lerp }} = Q;
const K = QK, C = QC, T = () => Q.T;

/* 页：每页 1920 高，格子用 K.stack 竖着排；镜头在页之间滑 */
const P1 = K.stack(26, [1868]);
const CAM = [{{ t: 0, x: 540, y: 960, zoom: 1 }}];
const SUBS = [{{ a: 0.2, b: 2.0, s: '第一句字幕' }}];

Q.film({{
  dur: {dur}, fps: 30, theme: '{theme}',
  assets: {{}},   // {{ rock: {{ src: 'assets/rock.png', w: 800, h: 520 }} }}（生图的件：透明底 PNG，w/h 写原图尺寸）
  draw(t) {{
    let w = '';
    w += K.panel(t, P1[0], (lt) => '', {{ in: 'none' }});
    return {{ cam: cam(CAM, t), shake: [], world: w, ui: K.subtitle(t, SUBS) }};
  }},
}});
}})();
"""

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("dir"); ap.add_argument("--theme", default="sea"); ap.add_argument("--dur", type=float, default=60); ap.add_argument("--tokens")
    a = ap.parse_args(); d = Path(a.dir); d.mkdir(parents=True, exist_ok=True); (d / "assets").mkdir(exist_ok=True)
    if (d / "film.js").exists(): raise SystemExit(f"{d / 'film.js'} 已经有了，不覆盖")
    shutil.copy(HERE / "index.html", d / "index.html")
    (d / "film.js").write_text(FILM.format(name=d.name, theme=a.theme, dur=a.dur), encoding="utf-8")
    if a.tokens: shutil.copy(a.tokens, d / "tokens.json")
    print("建好了:", d.resolve(), "→ python render.py", d, "--serve")
