# -*- coding: utf-8 -*-
"""竖屏漫画引擎的渲染器：逐帧 seek → 截图 → 管道进 ffmpeg。画面是 t 的纯函数，可以只渲一段、只截几帧、乱序截。

  python render.py <工程>                        全片 → <工程>/renders/raw.mp4（无声，1080×1920）
  python render.py <工程> --size 720             720p 预览（720×1280）→ renders/raw_720.mp4；--size 可以和 --clip / --stills / --sheet 一起用
  python render.py <工程> --safe ...             叠上抖音安全区红框（Q.SAFE），配 --stills / --sheet 自查"要读的东西有没有压进去"
  python render.py <工程> --jobs 2               全片，分 2 段并行渲再无损拼（内存紧，别超过 2）
  python render.py <工程> --stills 2.5 8.5 21    只截几帧 → review/s_0002.50.png（原尺寸 1080×1920）
  python render.py <工程> --sheet 18             全片均匀取 18 帧拼一张 → review/sheet.jpg
  python render.py <工程> --sheet 3.5 9 21.5     指定时刻拼一张
  python render.py <工程> --motion 8.2 10.6 [n]  一段里均匀取 n（默认 12）帧拼一张 → review/motion_8.2-10.6.jpg
  python render.py <工程> --clip 0 12 [名字]     只渲一段 → renders/<名字或_clip>.mp4
  python render.py <工程> --det                  确定性自检：同一批时刻乱序再截一遍，逐字节比
  python render.py <工程> --events               音效事件表 → audio/events.json
  python render.py <工程> --serve                本地预览 http://127.0.0.1:8765/?play（?fit&t=12 停在第 12 秒）
  python render.py <工程> --mux <画面.mp4> <音轨> [偏移秒] [名字]
                                                 把一条外部音轨（配音、参考片的原声）合进画面 → renders/<名字或 av>.mp4
                                                 音轨可以是 mp3/wav/m4a，也可以是一条 mp4（取它的音轨）；偏移 > 0 = 声音晚进
  python render.py <工程> --compare <参考.mp4> <参考秒:我们秒> … [--name 名字]
                                                 参考片和我们的同一时刻并排（上参考、下我们），每对一列 → review/compare_<名字>.jpg
                                                 参考也可以是一张 png：写成 ref.png:我们秒

工程目录里只需要 index.html + film.js（+ 可选 tokens.json、assets/）。引擎（qy.js、kit.js、chars.js、fonts/）
留在本文件所在目录，由内置的小服务器挂到 /engine/ 下。
"""
import hashlib, http.server, io, json, random, subprocess, sys, threading
from pathlib import Path

ENGINE = Path(__file__).resolve().parent
VW, VH = 1080, 1920
SCALE = 1.0      # --size 720 → 2/3：页面仍按 1080×1920 布局，截图按比例缩（device_scale_factor）
SAFE = False

class Handler(http.server.SimpleHTTPRequestHandler):
    proj = None
    def translate_path(self, path):
        p = path.split("?", 1)[0].split("#", 1)[0]
        if p.startswith("/engine/"): return str(ENGINE / p[len("/engine/"):])
        return str(self.proj / p.lstrip("/")) if p != "/" else str(self.proj / "index.html")
    def do_GET(self):
        p = self.path.split("?", 1)[0]
        if p.startswith("/favicon"): self.send_response(204); self.end_headers(); return
        if p == "/tokens.json" and not (self.proj / "tokens.json").exists():   # 没有 tokens 不算错
            b = b"null"; self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b); return
        super().do_GET()
    def end_headers(self):
        self.send_header("Cache-Control", "no-store"); super().end_headers()
    def log_message(self, *a): pass

def serve(proj, port=0):
    h = type("H", (Handler,), {"proj": proj})
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}/"

def open_page(p, url):
    # 关掉 LCD 次像素抗锯齿（跳着 seek 字边不抖）；每帧等合成器跑完再截；固定 sRGB。
    # 默认软件光栅化：GPU 光栅化在两次启动之间会差 1 个色阶（斜切的描边字边上），--det 和并行分段拼接都要求逐字节一致；
    # 实测软件 134 ms/帧 vs GPU 101 ms/帧。只看预览、不拼接时可以 QY_GPU=1 换快的。
    import os
    args = ["--disable-lcd-text", "--run-all-compositor-stages-before-draw", "--force-color-profile=srgb"]
    if os.environ.get("QY_GPU") != "1": args += ["--disable-gpu", "--disable-gpu-compositing"]
    b = p.chromium.launch(channel="chrome", args=args)
    pg = b.new_page(viewport={"width": VW, "height": VH}, device_scale_factor=SCALE)
    pg.on("console", lambda m: m.type in ("error", "warning") and print("[page]", m.text))
    pg.on("pageerror", lambda e: print("[pageerror]", e))
    pg.goto(url + ("?safe" if SAFE else ""))
    pg.wait_for_function("window.READY === true", timeout=180000)
    return b, pg

def shot(pg, t, fmt="png"):
    pg.evaluate(f"seek({t})")
    return pg.screenshot(type=fmt, quality=95) if fmt == "jpeg" else pg.screenshot(type="png")

def with_page(proj, fn):
    from playwright.sync_api import sync_playwright
    srv, url = serve(proj)
    try:
        with sync_playwright() as p:
            b, pg = open_page(p, url)
            try: return fn(pg)
            finally: b.close()
    finally: srv.shutdown()

def _font(size):
    from PIL import ImageFont
    for f in ("C:/Windows/Fonts/consola.ttf", "C:/Windows/Fonts/arial.ttf"):
        try: return ImageFont.truetype(f, size)
        except Exception: pass
    return ImageFont.load_default()

def stills(proj, ts):
    (proj / "review").mkdir(exist_ok=True)
    def go(pg):
        for t in ts: (proj / f"review/s_{t:07.2f}.png").write_bytes(shot(pg, t))
    with_page(proj, go); print("stills:", len(ts), proj / "review")

def grid(ims, labels, cols, tw):
    from PIL import Image, ImageDraw
    th = tw * VH // VW; rows = -(-len(ims) // cols)
    out = Image.new("RGB", (cols * tw, rows * th), (20, 20, 20)); d = ImageDraw.Draw(out); font = _font(max(14, tw // 14))
    for i, (im, lb) in enumerate(zip(ims, labels)):
        x, y = (i % cols) * tw, (i // cols) * th; out.paste(im.convert("RGB").resize((tw, th)), (x, y))
        if lb: d.rectangle([x, y, x + tw // 3.2, y + tw // 11], fill=(0, 0, 0)); d.text((x + 4, y + 2), lb, font=font, fill=(255, 230, 0))
    return out

def sheet(proj, args, name="sheet"):
    from PIL import Image
    (proj / "review").mkdir(exist_ok=True)
    def go(pg):
        end = pg.evaluate("END")
        ts = [float(x) for x in args] if len(args) > 1 else [round((i + .5) * end / int(args[0] if args else 18), 2) for i in range(int(args[0] if args else 18))]
        ims = [Image.open(io.BytesIO(shot(pg, t))) for t in ts]
        cols = 6 if len(ts) > 8 else max(1, len(ts) if len(ts) <= 4 else (len(ts) + 1) // 2)
        out = grid(ims, [f"{t:.2f}" for t in ts], cols, 300 if cols >= 6 else 360)
        out.save(proj / f"review/{name}.jpg", quality=90); print("sheet:", proj / f"review/{name}.jpg", len(ts))
    with_page(proj, go)

def frames(proj, out, a=0.0, b=None):
    def go(pg):
        end, fps = pg.evaluate("END"), pg.evaluate("FPS")
        bb = end if b is None else min(b, end)
        ff = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "image2pipe", "-framerate", str(fps), "-c:v", "mjpeg", "-i", "-",
                               "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", "-preset", "medium", "-movflags", "+faststart", str(out)], stdin=subprocess.PIPE)
        n0, n1 = round(a * fps), round(bb * fps)
        for i in range(n0, n1):
            ff.stdin.write(shot(pg, i / fps, "jpeg"))
            if (i - n0) % 150 == 0: print(f"  {i - n0}/{n1 - n0}", flush=True)
        ff.stdin.close(); ff.wait(); print("done", out, f"{bb - a:.2f}s")
    with_page(proj, go)

def frames_parallel(proj, out, jobs):
    end, fps = with_page(proj, lambda pg: (pg.evaluate("END"), pg.evaluate("FPS")))
    total = round(end * fps); cuts = [round(total * i / jobs) for i in range(jobs + 1)]
    parts, procs = [], []
    for i in range(jobs):
        name = f"_part{i:02d}"; parts.append(proj / f"renders/{name}.mp4")
        procs.append(subprocess.Popen([sys.executable, str(Path(__file__).resolve()), str(proj), "--clip", repr(cuts[i] / fps), repr(cuts[i + 1] / fps), name],
                                      stdout=subprocess.DEVNULL if i else None))
    if any(p.wait() for p in procs): sys.exit("有一段渲染失败了，先单独跑 --clip 看报错")
    lst = proj / "renders/_parts.txt"; lst.write_text("".join(f"file '{p.as_posix()}'\n" for p in parts), encoding="utf-8")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", "-movflags", "+faststart", str(out)], check=True)
    for p in parts + [lst]: p.unlink()
    print("done", out, f"{end:.2f}s", f"({jobs} 路并行)")

def events(proj):
    (proj / "audio").mkdir(exist_ok=True)
    def go(pg):
        ev = pg.evaluate("events()"); m = pg.evaluate("({end: END, fps: FPS, meta: META})")
        json.dump({"end": m["end"], "fps": m["fps"], "meta": m["meta"], "events": ev}, open(proj / "audio/events.json", "w", encoding="utf-8"), ensure_ascii=False)
        print("events:", len(ev))
    with_page(proj, go)

def det(proj, n=12):
    def go(pg):
        end = pg.evaluate("END"); r = random.Random(7); ts = [round(r.uniform(0, end), 3) for _ in range(n)]
        h1 = {t: hashlib.md5(shot(pg, t)).hexdigest() for t in ts}
        order = ts[:]; r.shuffle(order)
        bad = [t for t in order if hashlib.md5(shot(pg, t)).hexdigest() != h1[t]]
        print("deterministic" if not bad else f"NOT deterministic at {bad} —— 有东西在跨帧存状态或用了 Math.random()")
    with_page(proj, go)

def mux(proj, video, audio, off=0.0, name="av"):
    out = proj / f"renders/{name}.mp4"
    ain = ["-itsoffset", str(off), "-i", str(audio)] if off > 0 else ["-ss", str(-off), "-i", str(audio)] if off < 0 else ["-i", str(audio)]
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(video), *ain, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                    "-shortest", "-movflags", "+faststart", str(out)], check=True)
    print("done", out)

def compare(proj, ref, pairs, name="cmp"):
    from PIL import Image
    (proj / "review").mkdir(exist_ok=True)
    refs, ours = [], [float(p.rsplit(":", 1)[1]) for p in pairs]
    for p in pairs:
        a = p.rsplit(":", 1)[0]
        if a.lower().endswith(".png") or a.lower().endswith(".jpg"): refs.append(Image.open(proj / a if not Path(a).is_absolute() else a).convert("RGB")); continue
        b = subprocess.run(["ffmpeg", "-v", "error", "-ss", a, "-i", str(ref), "-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "-"], capture_output=True).stdout
        refs.append(Image.open(io.BytesIO(b)).convert("RGB"))
    def go(pg): return [Image.open(io.BytesIO(shot(pg, t))) for t in ours]
    ims = with_page(proj, go); n = len(pairs); tw = 360
    top = grid(refs, [f"ref {p.rsplit(':', 1)[0][-10:]}" for p in pairs], n, tw); bot = grid(ims, [f"our {t:.2f}" for t in ours], n, tw)
    out = Image.new("RGB", (top.width, top.height + bot.height + 8), (200, 40, 40)); out.paste(top, (0, 0)); out.paste(bot, (0, top.height + 8))
    dst = proj / f"review/compare_{name}.jpg"; out.save(dst, quality=88); print("compare:", dst)

if __name__ == "__main__":
    a = sys.argv[1:]
    if not a: sys.exit(__doc__)
    proj = Path(a[0]).resolve()
    if not (proj / "film.js").exists(): sys.exit(f"{proj} 里没有 film.js")
    (proj / "renders").mkdir(exist_ok=True)
    if "--size" in a:
        i = a.index("--size"); h = int(a[i + 1]); a = a[:i] + a[i + 2:]
        if h not in (720, 1080): sys.exit("--size 只支持 720 或 1080")
        SCALE = h / 1080
    if "--safe" in a: SAFE = True; a.remove("--safe")
    if "--serve" in a:
        srv, url = serve(proj, 8765); print("预览:", url + "?play", "（Ctrl+C 结束）")
        try: threading.Event().wait()
        except KeyboardInterrupt: pass
    elif "--stills" in a: stills(proj, [float(x) for x in a[a.index("--stills") + 1:]])
    elif "--sheet" in a: sheet(proj, a[a.index("--sheet") + 1:])
    elif "--motion" in a:
        i = a.index("--motion"); t0, t1 = float(a[i + 1]), float(a[i + 2]); n = int(a[i + 3]) if len(a) > i + 3 else 12
        sheet(proj, [repr(round(t0 + (t1 - t0) * k / (n - 1), 3)) for k in range(n)], f"motion_{t0:g}-{t1:g}")
    elif "--clip" in a:
        i = a.index("--clip"); name = a[i + 3] if len(a) > i + 3 else "_clip"
        frames(proj, proj / f"renders/{name}.mp4", float(a[i + 1]), float(a[i + 2]))
    elif "--events" in a: events(proj)
    elif "--det" in a: det(proj)
    elif "--mux" in a:
        i = a.index("--mux"); rest = a[i + 1:]
        mux(proj, Path(rest[0]).resolve(), Path(rest[1]).resolve(), float(rest[2]) if len(rest) > 2 else 0.0, rest[3] if len(rest) > 3 else "av")
    elif "--compare" in a:
        i = a.index("--compare"); rest = a[i + 1:]; nm = "cmp"
        if "--name" in rest: j = rest.index("--name"); nm = rest[j + 1]; rest = rest[:j] + rest[j + 2:]
        compare(proj, Path(rest[0]).resolve(), rest[1:], nm)
    elif "--jobs" in a and int(a[a.index("--jobs") + 1]) > 1: frames_parallel(proj, proj / "renders/raw.mp4", min(2, int(a[a.index("--jobs") + 1])))
    else: frames(proj, proj / ("renders/raw.mp4" if SCALE == 1 else f"renders/raw_{round(VH * SCALE * 9 / 16)}.mp4"))
