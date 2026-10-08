"""AI判定の精度を上げる方法を比べる（tools/experiments.js を画面を出さない Chrome で動かす）。

python3 tools/run_experiments.py <実験の設定.json> [--out docs/experiments/<名前>.json]

設定ファイルは、試す条件の配列：
  [{"prep": "crop", "feat": "last", "aug": 12, "head": "linear", "color": 0, "seed": 1}, ...]
- 先に python3 tools/serve.py でサイトを開いておく（http://localhost:8736/）
- 評価は、学習に使っていない別の個体（完成見本の箱36・チラシの箱36・training/test）だけで行う
"""
import argparse
import json
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

from capture_pages import CDP, CHROME, ROOT

URL = "http://localhost:8736/tools/experiments.html"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("config")
    ap.add_argument("--out")
    a = ap.parse_args()
    configs = json.loads(Path(a.config).read_text(encoding="utf-8"))
    port = 9512
    chrome = subprocess.Popen([CHROME, "--headless=new", f"--remote-debugging-port={port}", f"--user-data-dir={tempfile.mkdtemp()}",
                               "--no-first-run", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    results = []
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
        cdp.send("Page.navigate", {"url": URL})
        time.sleep(1)
        cdp.js("await window.ready; return true;", timeout=600)
        for cfg in configs:
            r = cdp.js(f"return await window.runExperiment({json.dumps(cfg)});", timeout=3600)
            results.append(r)
            fmt = lambda k: f"{r[k]['top1']}/{r[k]['top3']}/{r[k]['top5']}" if k in r else "（学習に使用）"
            print(f"{json.dumps(cfg, ensure_ascii=False):<95} 見本の箱 {fmt('box')}  チラシ {fmt('flyer')}  合計 {fmt('both')}  test {r['test']['top1']} ({r['sec']}秒)", flush=True)
    finally:
        chrome.kill()
    if a.out:
        Path(a.out).parent.mkdir(parents=True, exist_ok=True)
        Path(a.out).write_text(json.dumps({"date": time.strftime("%Y-%m-%d %H:%M"), "results": results}, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
