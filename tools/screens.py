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
PAGES = [
    ("home", "ホーム（記録なし）", "#/", "clear"),
    ("home-rec", "ホーム（記録あり）", "#/", "sample"),
    ("identify", "写真で調べる", "#/identify", "clear"),
    ("box", "収集箱（記録あり）", "#/box", "sample"),
    ("detail", "貝の詳細 5番", "#/shell/5", "sample"),
    ("list", "図鑑", "#/list", "sample"),
]


def main():
    label = sys.argv[1] if len(sys.argv) > 1 else "now"
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
            cdp.send("Emulation.setDeviceMetricsOverride", {"width": w, "height": hgt, "deviceScaleFactor": 2, "mobile": True})
            for key, title, hash_, prep in PAGES:
                rec = json.dumps(json.dumps(sample_record()))
                cdp.js(f"localStorage.removeItem('{SAMPLE_KEY}');" if prep == "clear" else f"localStorage.setItem('{SAMPLE_KEY}', {rec});" + " return true;")
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
    # 一覧（横に並べる）
    font = ImageFont.truetype(FONT, 26)
    ims = [(t, Image.open(p).convert("RGB")) for t, p in shots]
    th = 300
    cols = len(PAGES)
    rows = len(SIZES)
    cw = max(im.width for _, im in ims) // 2
    ch = max(im.height for _, im in ims) // 2
    sheet = Image.new("RGB", (cols * (cw + 20) + 20, rows * (ch + 60) + 20), "white")
    d = ImageDraw.Draw(sheet)
    for i, (t, im) in enumerate(ims):
        r, c = divmod(i, cols)
        x, y = 20 + c * (cw + 20), 20 + r * (ch + 60)
        d.text((x, y), t, fill="black", font=font)
        sm = im.resize((im.width // 2, im.height // 2))
        sheet.paste(sm, (x, y + 40))
        d.rectangle([x, y + 40, x + sm.width, y + 40 + sm.height], outline="#999")
    sheet.save(ROOT / "docs/screens" / f"{label}.jpg", quality=82)
    print("一覧:", (ROOT / "docs/screens" / f"{label}.jpg").relative_to(ROOT))


if __name__ == "__main__":
    main()
