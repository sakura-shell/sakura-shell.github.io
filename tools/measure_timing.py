"""AI判定まわりの待ち時間を測る（初回／再訪／オフライン）。

python3 tools/measure_timing.py [--runs 3] [--idle 5] [--out docs/timing_<ラベル>.json --label 変更前]

- このスクリプトが、遅い回線をまねる中継サーバー（http://127.0.0.1:8737/）を立てて、site/ を配る
  （公開先の GitHub Pages と同じく10分のキャッシュ指定。通信の遅さは Service Worker 経由の読み込みにも効く）
- Google Chrome（画面を出さないモード）を、毎回まっさらな状態で起動して測る
- スマホに近づけるため、通信を 4G 相当（下り 9Mbps・往復 150ms）、計算を 4分の1 の速さに落とす
- オフライン＝中継サーバーが接続を受け付けない状態
- 測る時間（ミリ秒）
    home     … 開いてからホームの操作ボタンが出るまで
    identify … ホームで idle 秒すごしたあと「写真で調べる」を押してから、「カメラで撮る」「写真を選ぶ」が出るまで
    result   … 写真を選んでから、AIの判定（候補）が出るまで
- 初回＝はじめて開いたとき、再訪＝同じブラウザでもう一度開いたとき、オフライン＝再訪の状態で通信を切ったとき
"""
import argparse
import base64
import json
import statistics
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from capture_pages import CDP, CHROME, ROOT

PORT = 8737
SITE = f"http://127.0.0.1:{PORT}/site/"
LATENCY = 0.15          # 秒（往復）
RATE = 9_000_000 / 8    # バイト／秒（全体で共有）


class Net:
    offline = False
    lock = threading.Lock()
    next_free = 0.0  # 回線が空く時刻

    @classmethod
    def take(cls, n):
        """n バイト送るのに必要な時間だけ待つ（同時の読み込みで帯域を分け合う）"""
        with cls.lock:
            now = time.monotonic()
            start = max(now, cls.next_free)
            cls.next_free = start + n / RATE
            wait = cls.next_free - now
        time.sleep(wait)


class SlowHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".webmanifest": "application/manifest+json", ".js": "text/javascript"}

    def handle_one_request(self):
        if Net.offline:
            self.close_connection = True
            try:
                self.rfile.readline(65537)
            except Exception:
                pass
            return
        time.sleep(LATENCY)
        super().handle_one_request()

    def end_headers(self):
        self.send_header("Cache-Control", "max-age=600")  # GitHub Pages と同じ
        super().end_headers()

    def copyfile(self, source, outputfile):
        while True:
            buf = source.read(16384)
            if not buf:
                break
            Net.take(len(buf))
            outputfile.write(buf)

    def log_message(self, *args):
        pass


def start_server():
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), partial(SlowHandler, directory=str(ROOT)))
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv

PHOTO_B64 = base64.b64encode((ROOT / "tools/fixtures/identify/sakura_green_in.jpg").read_bytes()).decode()  # 通信を切っても使えるように埋め込む

WATCH_HOME = """
  // ホームにいる間に、画面が 50ms 以上止まった処理（長い処理）を記録する
  window.__lt = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(e.duration); }).observe({ type: 'longtask', buffered: true }); } catch {}
  for (let i = 0; i < 600; i++) {
    if (document.querySelector('main.home .actions')) return performance.now();
    await new Promise(r => setTimeout(r, 20));
  }
  return -1;
"""

GO_IDENTIFY = """
  window.__ltHome = (window.__lt || []).slice();
  const t0 = performance.now();
  location.hash = '#/identify';
  for (let i = 0; i < 3000; i++) {
    const b = [...document.querySelectorAll('button')];
    if (b.some(x => x.textContent.includes('カメラで撮る')) && b.some(x => x.textContent.includes('写真を選ぶ'))) return performance.now() - t0;
    await new Promise(r => setTimeout(r, 20));
  }
  return -1;
"""

PICK_AND_WAIT = f"""
  const bin = atob('{PHOTO_B64}'); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const blob = new Blob([arr], {{ type: 'image/jpeg' }});
  const file = new File([blob], 'shell.jpg', {{ type: 'image/jpeg' }});
  const orig = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () {{
    if (this.type === 'file') {{ const dt = new DataTransfer(); dt.items.add(file); this.files = dt.files;
      this.dispatchEvent(new Event('change', {{ bubbles: true }})); HTMLInputElement.prototype.click = orig; }}
    else orig.call(this);
  }};
  const t0 = performance.now();
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('写真を選ぶ'));
  if (!btn) return {{ ms: -1, ok: false, note: document.body.innerText.slice(0, 200) }};
  btn.click();
  for (let i = 0; i < 6000; i++) {{
    if (document.querySelector('.ai-card')) return {{ ms: performance.now() - t0, ok: true }};
    if (document.querySelector('.ai-error') || document.body.innerText.includes('AIの判定ができませんでした')) return {{ ms: performance.now() - t0, ok: false }};
    await new Promise(r => setTimeout(r, 20));
  }}
  return {{ ms: -1, ok: false }};
"""


def launch(port):
    profile = tempfile.mkdtemp(prefix="timing-")
    chrome = subprocess.Popen([CHROME, "--headless=new", f"--remote-debugging-port={port}", f"--user-data-dir={profile}",
                               "--no-first-run", "--no-default-browser-check", "--disable-extensions",
                               "--window-size=390,844", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        try:
            targets = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=1))
            ws = next(t["webSocketDebuggerUrl"] for t in targets if t.get("type") == "page")
            return chrome, CDP(ws)
        except Exception:
            time.sleep(0.2)
    chrome.kill()
    raise SystemExit("Chrome を起動できませんでした")


def one_visit(cdp, idle, n):
    # 毎回ちがうアドレスで開いて、ページを読み込み直す（# だけの移動では読み込み直さない）
    cdp.send("Page.navigate", {"url": SITE + f"?visit={n}#/"})
    cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
    home = cdp.js(WATCH_HOME, timeout=60)
    time.sleep(idle)
    ident = cdp.js(GO_IDENTIFY, timeout=120)
    lt = cdp.js("const a = window.__ltHome || []; return { max: Math.round(Math.max(0, ...a)), n: a.length };")
    res = cdp.js(PICK_AND_WAIT, timeout=300)
    out = {"home": round(home), "identify": round(ident), "result": round(res["ms"]), "aiOk": res["ok"],
           "homeLongTaskMax": lt["max"], "homeLongTasks": lt["n"]}
    if res.get("note"):
        out["note"] = res["note"]
    print("  ", json.dumps(out, ensure_ascii=False), flush=True)
    return out


def run_once(idle, port):
    chrome, cdp = launch(port)
    try:
        cdp.send("Page.enable")
        cdp.send("Runtime.enable")
        cdp.send("Network.enable")
        # 合言葉の画面を通す（同じ場所の別ファイルを開いて、通過済みの印だけ入れる）
        gate = json.loads((ROOT / "site/data/config.json").read_text(encoding="utf-8")).get("previewGate")
        cdp.send("Page.navigate", {"url": SITE + "robots.txt"})
        time.sleep(0.8)
        if gate:
            cdp.js(f"localStorage.setItem('m36shells:gate', {json.dumps(gate['hash'])}); return true;")
        Net.offline = False
        out = {"first": one_visit(cdp, idle, 1)}
        # 再訪：Service Worker の保存が終わるのを待ってから開き直す
        cdp.js("await navigator.serviceWorker?.ready; for (let i = 0; i < 300; i++) { const c = new MessageChannel();"
               " const r = await new Promise(res => { c.port1.onmessage = e => res(e.data); navigator.serviceWorker.controller"
               " ? navigator.serviceWorker.controller.postMessage({ type: 'status' }, [c.port2]) : res({}); setTimeout(() => res({}), 2000); });"
               " if (r.ready && (r.ai == null || r.ai)) return true; await new Promise(z => setTimeout(z, 500)); } return false;", timeout=200)
        # 図鑑の写真の保存（初回に裏で始まる）が終わるのを待つ（実際の再訪は、しばらく時間がたってから）
        cdp.js("for (let i = 0; i < 120; i++) { const c = await caches.open((await caches.keys()).find(k => /:20/.test(k)));"
               " if ((await c.keys()).length >= 230) return true; await new Promise(z => setTimeout(z, 500)); } return false;", timeout=90)
        out["revisit"] = one_visit(cdp, idle, 2)
        Net.offline = True
        out["offline"] = one_visit(cdp, idle, 3)
        Net.offline = False
        return out
    finally:
        chrome.kill()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--idle", type=float, default=5)
    ap.add_argument("--label", default="")
    ap.add_argument("--out")
    a = ap.parse_args()
    start_server()
    runs = []
    for i in range(a.runs):
        r = run_once(a.idle, 9400 + i)
        runs.append(r)
        print(f"{i + 1}回目", json.dumps(r, ensure_ascii=False))
    summary = {}
    for scene in ("first", "revisit", "offline"):
        summary[scene] = {k: round(statistics.median(r[scene][k] for r in runs)) for k in ("home", "identify", "result", "homeLongTaskMax")}
        summary[scene]["aiOk"] = sum(r[scene]["aiOk"] for r in runs)
    print("中央値（ミリ秒）", json.dumps(summary, ensure_ascii=False))
    if a.out:
        Path(a.out).write_text(json.dumps({"label": a.label, "date": time.strftime("%Y-%m-%d %H:%M"), "idleSec": a.idle,
                                           "conditions": "Chrome headless・下り9Mbps/往復150ms・CPU 1/4",
                                           "runs": runs, "median": summary}, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
