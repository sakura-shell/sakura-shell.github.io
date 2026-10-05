"""サイトの全ページを、スマホの画面幅で1ページずつ撮って、1つのPDFにまとめる（内容の確認用）。

python3 tools/capture_pages.py [出力.pdf] [--width 390] [--only home,list,...]

- 先に python3 tools/serve.py でサイトを開いておく（http://localhost:8736/site/）
- Google Chrome（画面を出さないモード）で開き、ページの縦全体を1枚の画像にする
- 撮るページ：ホーム／貝を探す／貝の詳細（1〜36）／この貝はなんだろう（撮影前・AI判定の結果）／
  この貝かな？／見比べる／収集箱（記録なし・記録あり・手で記録する・撮って読み取る）／このサイトについて
- 記録ありの画面は、見本の記録（このツールが作るもの）で表示する。利用者の記録は使わない
- 出力：docs/全ページ確認_<日付>.pdf（既定）。画像は docs/pages/ にも残す
必要なもの：Google Chrome、Python 3 と Pillow（追加のインストールは不要）
"""
import argparse
import base64
import json
import os
import random
import shutil
import socket
import struct
import subprocess
import tempfile
import time
import urllib.request
from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SITE = "http://localhost:8736/site/"
FONT = "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc"
FONT_R = "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc"


class CDP:
    """Chrome DevTools Protocol の最小限の WebSocket クライアント"""

    def __init__(self, ws_url):
        host_port, path = ws_url[len("ws://"):].split("/", 1)
        host, port = host_port.split(":")
        self.sock = socket.create_connection((host, int(port)))
        key = base64.b64encode(os.urandom(16)).decode()
        req = (f"GET /{path} HTTP/1.1\r\nHost: {host_port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
               f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n")
        self.sock.sendall(req.encode())
        resp = b""
        while b"\r\n\r\n" not in resp:
            resp += self.sock.recv(4096)
        if b" 101 " not in resp.split(b"\r\n")[0]:
            raise RuntimeError("WebSocket に接続できません")
        self.buf = resp.split(b"\r\n\r\n", 1)[1]
        self.next_id = 0

    def _recv_exact(self, n):
        while len(self.buf) < n:
            chunk = self.sock.recv(1 << 20)
            if not chunk:
                raise RuntimeError("接続が切れました")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def _recv_message(self):
        data = b""
        while True:
            b1, b2 = self._recv_exact(2)
            fin, op = b1 & 0x80, b1 & 0x0F
            ln = b2 & 0x7F
            if ln == 126:
                ln = struct.unpack(">H", self._recv_exact(2))[0]
            elif ln == 127:
                ln = struct.unpack(">Q", self._recv_exact(8))[0]
            payload = self._recv_exact(ln)
            if op == 8:
                raise RuntimeError("接続が閉じられました")
            if op in (0, 1, 2):
                data += payload
                if fin:
                    return data.decode()

    def send(self, method, params=None, timeout=60):
        self.next_id += 1
        mid = self.next_id
        msg = json.dumps({"id": mid, "method": method, "params": params or {}}).encode()
        header = bytearray([0x81])
        n = len(msg)
        if n < 126:
            header.append(0x80 | n)
        elif n < 65536:
            header.append(0x80 | 126)
            header += struct.pack(">H", n)
        else:
            header.append(0x80 | 127)
            header += struct.pack(">Q", n)
        mask = os.urandom(4)
        header += mask
        self.sock.sendall(bytes(header) + bytes(b ^ mask[i % 4] for i, b in enumerate(msg)))
        self.sock.settimeout(timeout)
        while True:
            reply = json.loads(self._recv_message())
            if reply.get("id") == mid:
                if "error" in reply:
                    raise RuntimeError(f"{method}: {reply['error']}")
                return reply.get("result", {})

    def js(self, expr, timeout=60):
        r = self.send("Runtime.evaluate", {"expression": f"(async () => {{ {expr} }})()", "awaitPromise": True,
                                           "returnByValue": True}, timeout=timeout)
        if r.get("exceptionDetails"):
            raise RuntimeError(f"JS エラー: {r['exceptionDetails'].get('exception', {}).get('description')}")
        return r.get("result", {}).get("value")


SAMPLE_KEY = "m36shells:/site/:box"


def sample_record():
    """見本の記録（貝あり12・要確認2・空き3）"""
    rnd = random.Random(36)
    nos = list(range(1, 37))
    rnd.shuffle(nos)
    t = "2026-10-05T10:00:00.000Z"
    cells = {}
    for n in nos[:12]:
        cells[str(n)] = {"s": "filled", "t": t}
    for n in nos[12:14]:
        cells[str(n)] = {"s": "check", "t": t}
    for n in nos[14:17]:
        cells[str(n)] = {"s": "empty", "t": t}
    return {"v": 2, "savedAt": t, "source": "manual", "cells": cells}


WAIT_RENDER = """
  await document.fonts.ready;
  for (let i = 0; i < 60; i++) { if (document.querySelector('#app main, main')) break; await new Promise(r => setTimeout(r, 100)); }
  await new Promise(r => setTimeout(r, 700));
  const imgs = [...document.images];
  await Promise.all(imgs.map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; setTimeout(r, 4000); })));
  await new Promise(r => setTimeout(r, 300));
  return true;
"""

PICK_PHOTO = """
  const blob = await (await fetch('/tools/fixtures/identify/sakura_green_in.jpg')).blob();
  const file = new File([blob], 'sakura.jpg', { type: 'image/jpeg' });
  const orig = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () {
    if (this.type === 'file') { const dt = new DataTransfer(); dt.items.add(file); this.files = dt.files;
      this.dispatchEvent(new Event('change', { bubbles: true })); HTMLInputElement.prototype.click = orig; }
    else orig.call(this);
  };
  [...document.querySelectorAll('button')].find(b => b.textContent.includes('写真を選ぶ')).click();
  for (let i = 0; i < 150; i++) { if (document.querySelector('.ai-card, .shell-grid')) break; await new Promise(r => setTimeout(r, 100)); }
  await new Promise(r => setTimeout(r, 800));
  return true;
"""


SCAN_SAMPLE = """
  const blob = await (await fetch('/references/box_sample.jpeg')).blob();
  const file = new File([blob], 'box.jpg', { type: 'image/jpeg' });
  const orig = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () {
    if (this.type === 'file') { const dt = new DataTransfer(); dt.items.add(file); this.files = dt.files;
      this.dispatchEvent(new Event('change', { bubbles: true })); HTMLInputElement.prototype.click = orig; }
    else orig.call(this);
  };
  [...document.querySelectorAll('button')].find(b => b.textContent.includes('写真を選ぶ')).click();
  for (let i = 0; i < 100; i++) { if (document.querySelector('input[type=checkbox]')) break; await new Promise(r => setTimeout(r, 100)); }
  document.querySelector('input[type=checkbox]').click();
  await new Promise(r => setTimeout(r, 300));
  [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '読み取る').click();
  for (let i = 0; i < 100; i++) { if (document.body.innerText.includes('まだ保存していません')) break; await new Promise(r => setTimeout(r, 100)); }
  await new Promise(r => setTimeout(r, 800));
  return true;
"""


def pages(only):
    """（キー, 見出し, ハッシュ, 準備の手順）"""
    data = json.loads((ROOT / "site/data/shells.json").read_text(encoding="utf-8"))
    out = [
        ("home", "ホーム（記録なし）", "#/", "clear"),
        ("home-rec", "ホーム（記録あり：見本）", "#/", "sample"),
        ("list", "貝を探す（一覧）", "#/list", "sample"),
    ]
    for sp in data["species"]:
        out.append((f"shell-{sp['no']:02d}", f"貝の詳細 {sp['no']}番 {sp['name']['text']}", f"#/shell/{sp['no']}", "sample"))
    out += [
        ("identify", "この貝はなんだろう（撮影前）", "#/identify", "clear"),
        ("identify-result", "この貝はなんだろう（AI判定の結果）", "#/identify", "photo"),
        ("check", "この貝かな？（見比べチェック）", "#/compare/photo/5", "photo-then"),
        ("compare", "見比べる（2つの貝）", "#/compare/5/6", "sample"),
        ("box", "収集箱の記録（記録なし）", "#/box", "clear"),
        ("box-rec", "収集箱の記録（記録あり：見本）", "#/box", "sample"),
        ("box-edit", "収集箱を手で記録する", "#/box", "sample-edit"),
        ("scan", "収集箱を撮って読み取る（試験版・読み取り結果）", "#/scan", "scan"),
        ("about", "このサイトについて", "#/about", "sample"),
    ]
    if only:
        keys = set(only.split(","))
        out = [p for p in out if p[0] in keys or p[0].split("-")[0] in keys]
    return out


def capture(cdp, width, scale, hash_, prep):
    rec = json.dumps(json.dumps(sample_record()))
    if prep in ("clear", "photo", "photo-then", "scan"):
        cdp.js(f"localStorage.removeItem('{SAMPLE_KEY}'); sessionStorage.clear(); return true;")
    else:
        cdp.js(f"localStorage.setItem('{SAMPLE_KEY}', {rec}); sessionStorage.clear(); return true;")
    first = "#/identify" if prep in ("photo", "photo-then") else hash_
    cdp.send("Emulation.setDeviceMetricsOverride", {"width": width, "height": 844, "deviceScaleFactor": scale, "mobile": True})
    cdp.send("Page.navigate", {"url": SITE + "?dev=0&_=" + str(time.time()) + first})
    time.sleep(1.2)
    cdp.js(WAIT_RENDER)
    if prep in ("photo", "photo-then"):
        cdp.js(PICK_PHOTO, timeout=90)
        if prep == "photo-then":
            cdp.js(f"location.hash = '{hash_}'; return true;")
            cdp.js(WAIT_RENDER)
    if prep == "scan":
        cdp.js(SCAN_SAMPLE, timeout=90)
    if prep == "sample-edit":
        cdp.js("[...document.querySelectorAll('button')].find(b => /手で記録|記録を手で直す/.test(b.textContent))?.click(); return true;")
        cdp.js(WAIT_RENDER)
    cdp.js("window.scrollTo(0, 0); return true;")
    # ページの縦全体が入る高さにして撮る（下のタブは、いちばん下に表示される）
    height = cdp.js("return Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));")
    height = max(844, min(int(height), 16000))
    cdp.send("Emulation.setDeviceMetricsOverride", {"width": width, "height": height, "deviceScaleFactor": scale, "mobile": True})
    time.sleep(0.6)
    cdp.js(WAIT_RENDER)
    shot = cdp.send("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": False}, timeout=120)
    return Image.open(__import__("io").BytesIO(base64.b64decode(shot["data"]))).convert("RGB")


def labeled(img, title, idx, total, scale):
    pad = 56 * scale
    font = ImageFont.truetype(FONT, 20 * scale)
    small = ImageFont.truetype(FONT_R, 13 * scale)
    out = Image.new("RGB", (img.width, img.height + pad), "white")
    d = ImageDraw.Draw(out)
    d.rectangle([0, 0, img.width, pad], fill=(38, 44, 116))
    d.text((14 * scale, 8 * scale), title, fill="white", font=font)
    d.text((14 * scale, 34 * scale), f"{idx} / {total}", fill=(225, 243, 249), font=small)
    out.paste(img, (0, pad))
    return out


def cover(width, scale, items, version):
    W = width * scale
    font_b = ImageFont.truetype(FONT, 24 * scale)
    font = ImageFont.truetype(FONT_R, 14 * scale)
    line = 22 * scale
    H = (150 + 22 * len(items) + 60) * scale
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 8 * scale], fill=(69, 191, 227))
    d.text((20 * scale, 28 * scale), "三十六歌仙貝 デジタルガイド", fill=(38, 44, 116), font=font_b)
    d.text((20 * scale, 66 * scale), f"全ページ確認用（スマホ幅 {width}px）　{date.today().isoformat()}　版 {version}", fill=(69, 75, 126), font=font)
    d.text((20 * scale, 92 * scale), "確認用プレビューの表示。記録ありの画面は見本の記録で表示", fill=(69, 75, 126), font=font)
    y = 130 * scale
    for i, title in enumerate(items, 1):
        d.text((24 * scale, y), f"{i + 1:>2}.  {title}", fill=(29, 35, 88), font=font)
        y += line
    return img


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out", nargs="?", default=str(ROOT / f"docs/全ページ確認_{date.today().isoformat()}.pdf"))
    ap.add_argument("--width", type=int, default=390)
    ap.add_argument("--scale", type=int, default=2)
    ap.add_argument("--only")
    a = ap.parse_args()
    try:
        urllib.request.urlopen(SITE, timeout=3)
    except Exception:
        raise SystemExit("先に python3 tools/serve.py でサイトを開いてください（http://localhost:8736/site/）")

    profile = tempfile.mkdtemp(prefix="capture-")
    port = 9333
    chrome = subprocess.Popen([CHROME, "--headless=new", f"--remote-debugging-port={port}", f"--user-data-dir={profile}",
                               "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "--disable-extensions",
                               "--force-color-profile=srgb", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        ws = None
        for _ in range(50):
            try:
                targets = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=1))
                ws = next(t["webSocketDebuggerUrl"] for t in targets if t.get("type") == "page")
                break
            except Exception:
                time.sleep(0.2)
        if not ws:
            raise SystemExit("Chrome を起動できませんでした")
        cdp = CDP(ws)
        cdp.send("Page.enable")
        cdp.send("Runtime.enable")
        cdp.send("Page.navigate", {"url": SITE})
        time.sleep(2)
        # オフライン用の保存（Service Worker）は使わない（いつも最新のファイルで撮る）
        cdp.js("for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); return true;")
        # 合言葉の画面を通す（確認用プレビューの合言葉が設定されているとき）
        gate = json.loads((ROOT / "site/data/config.json").read_text(encoding="utf-8")).get("previewGate")
        if gate:
            cdp.js(f"localStorage.setItem('m36shells:gate', {json.dumps(gate['hash'])}); return true;")
        cdp.send("Network.enable")
        cdp.send("Network.setBypassServiceWorker", {"bypass": True})

        plist = pages(a.only)
        pages_dir = ROOT / "docs/pages"
        shutil.rmtree(pages_dir, ignore_errors=True)
        pages_dir.mkdir(parents=True)
        shots = []
        for i, (key, title, hash_, prep) in enumerate(plist, 1):
            img = capture(cdp, a.width, a.scale, hash_, prep)
            img = labeled(img, title, i + 1, len(plist) + 1, a.scale)
            img.save(pages_dir / f"{i:02d}_{key}.jpg", quality=85)
            shots.append(img)
            print(f"{i:>2}/{len(plist)} {title}（{img.height // a.scale}px）")
        cdp.js(f"localStorage.removeItem('{SAMPLE_KEY}'); return true;")
        version = json.loads((ROOT / "site/data/config.json").read_text(encoding="utf-8")).get("appVersion", "")
        first = cover(a.width, a.scale, [p[1] for p in plist], version)
        out = Path(a.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        first.save(out, "PDF", resolution=72 * a.scale, save_all=True, append_images=shots, quality=85)
        print(f"書き出し：{out}（{len(shots) + 1}ページ、{round(out.stat().st_size / 1024 / 1024, 1)}MB）")
    finally:
        chrome.terminate()
        try:
            chrome.wait(timeout=5)
        except Exception:
            chrome.kill()
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    main()
