"""スマホの「最初の画面」（スクロールしない状態）を撮る。変更前後の見比べ用。

python3 tools/screens.py <ラベル>   例：python3 tools/screens.py before

- 先に python3 tools/serve.py でサイトを開いておく（http://localhost:8736/site/）
- 画面の大きさ：375×667（iPhone SE など）と 390×844（iPhone 13〜15 など）
- 出力：docs/screens/<ラベル>/<幅>x<高さ>_<画面>.png と、並べた一覧 docs/screens/<ラベル>.jpg
- 記録ありの画面は、見本の記録（このツールが作るもの）で表示し、撮り終わったら消す
"""
import json
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from capture_pages import CDP, CHROME, FONT, ROOT, SAMPLE_KEY, SITE, WAIT_RENDER, sample_record

SIZES = [(375, 667), (390, 844)]
if "--pc" in sys.argv:
    SIZES = SIZES + [(1280, 800)]
PAGES = [
    ("intro", "初めて開いたとき（導入）", "#/", "fresh"),
    ("home", "ホーム（記録なし）", "#/", "clear"),
    ("home-rec", "ホーム（記録あり）", "#/", "sample"),
    ("identify", "写真で調べる", "#/identify", "clear"),
    ("box", "収集箱（記録あり）", "#/box", "sample"),
    ("detail", "貝の詳細 5番", "#/shell/5", "sample"),
    ("list", "図鑑", "#/list", "sample"),
]
if "--all" in sys.argv:
    PAGES += [
        ("box-list", "収集箱（番号順リスト）", "#/box?view=list", "sample"),
        ("compare", "見比べる", "#/compare/5/6", "sample"),
        ("guide", "初めての方へ", "#/guide", "sample"),
        ("about", "このサイトについて", "#/about", "sample"),
    ]


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    label = args[0] if args else "now"
    out_dir = ROOT / "docs/screens" / label
    out_dir.mkdir(parents=True, exist_ok=True)
    profile = tempfile.mkdtemp(prefix="screens-")
    port = 9355
    chrome = subprocess.Popen([CHROME, "--headless=new", f"--remote-debugging-port={port}", f"--user-data-dir={profile}",
                               "--hide-scrollbars", "--no-first-run", "--disable-extensions", "--force-color-profile=srgb",
                               "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        ws = None
        for _ in range(50):
            try:
                ws = next(t["webSocketDebuggerUrl"] for t in json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=1)) if t.get("type") == "page")
                break
            except Exception:
                time.sleep(0.2)
        cdp = CDP(ws)
        cdp.send("Page.enable")
        cdp.send("Network.enable")
        cdp.send("Network.setBypassServiceWorker", {"bypass": True})
        cdp.send("Page.navigate", {"url": SITE})
        time.sleep(1.5)
        cdp.js("for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); return true;")
        gate = json.loads((ROOT / "site/data/config.json").read_text(encoding="utf-8")).get("previewGate")
        if gate:
            cdp.js(f"localStorage.setItem('m36shells:gate', {json.dumps(gate['hash'])}); return true;")
        shots = []
        for w, hgt in SIZES:
            cdp.send("Emulation.setDeviceMetricsOverride", {"width": w, "height": hgt, "deviceScaleFactor": 2 if w < 700 else 1, "mobile": w < 700})
            for key, title, hash_, prep in PAGES:
                rec = json.dumps(json.dumps(sample_record()))
                if prep == "fresh":  # 初めて開いた状態（導入が出る）
                    cdp.js(f"localStorage.removeItem('{SAMPLE_KEY}'); localStorage.removeItem('m36shells:intro'); localStorage.removeItem('m36shells:install-hint'); return true;")
                elif prep == "clear":
                    cdp.js(f"localStorage.removeItem('{SAMPLE_KEY}'); localStorage.setItem('m36shells:intro', 'start'); return true;")
                else:
                    cdp.js(f"localStorage.setItem('{SAMPLE_KEY}', {rec}); localStorage.setItem('m36shells:intro', 'start'); return true;")
                cdp.send("Page.navigate", {"url": SITE + f"?shot={time.time()}{hash_}"})
                time.sleep(0.4)
                cdp.js(WAIT_RENDER, timeout=30)
                cdp.js("window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 300)); return true;")
                import base64
                png = base64.b64decode(cdp.send("Page.captureScreenshot", {"format": "png"})["data"])
                path = out_dir / f"{w}x{hgt}_{key}.png"
                path.write_bytes(png)
                shots.append((f"{w}×{hgt} {title}", path))
                print(path.relative_to(ROOT))
        cdp.js(f"localStorage.removeItem('{SAMPLE_KEY}'); return true;")
    finally:
        chrome.kill()
    # 一覧（横に並べる。どの大きさも幅300pxにそろえる）
    font = ImageFont.truetype(FONT, 22)
    cols = len(PAGES)
    TW = 300
    ims = []
    for t, p in shots:
        im = Image.open(p).convert("RGB")
        ims.append((t, im.resize((TW, round(im.height * TW / im.width)))))
    rows = [ims[i * cols:(i + 1) * cols] for i in range(len(SIZES))]
    row_h = [max(im.height for _, im in r) + 50 for r in rows]
    sheet = Image.new("RGB", (cols * (TW + 16) + 16, sum(row_h) + 16), "white")
    d = ImageDraw.Draw(sheet)
    y = 16
    for r, hh in zip(rows, row_h):
        for c, (t, im) in enumerate(r):
            x = 16 + c * (TW + 16)
            d.text((x, y), t, fill="black", font=font)
            sheet.paste(im, (x, y + 34))
            d.rectangle([x, y + 34, x + im.width, y + 34 + im.height], outline="#999")
        y += hh
    sheet.save(ROOT / "docs/screens" / f"{label}.jpg", quality=82)
    print("一覧:", (ROOT / "docs/screens" / f"{label}.jpg").relative_to(ROOT))


if __name__ == "__main__":
    main()
