"""HTML ファイルを PDF にする（Google Chrome を画面を出さずに使う）。説明書などの印刷用。

python3 tools/html_to_pdf.py <入力.html> <出力.pdf>
"""
import base64
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("cap", ROOT / "tools/capture_pages.py")
cap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cap)


def main():
    src, out = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
    profile = tempfile.mkdtemp(prefix="pdf-")
    port = 9334
    chrome = subprocess.Popen([cap.CHROME, "--headless=new", f"--remote-debugging-port={port}", f"--user-data-dir={profile}",
                               "--no-first-run", "--no-default-browser-check", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        ws = None
        for _ in range(50):
            try:
                ws = next(t["webSocketDebuggerUrl"] for t in json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=1)) if t.get("type") == "page")
                break
            except Exception:
                time.sleep(0.2)
        cdp = cap.CDP(ws)
        cdp.send("Page.enable")
        cdp.send("Page.navigate", {"url": src.as_uri()})
        time.sleep(1.5)
        cdp.js("await document.fonts.ready; return true;")
        pdf = cdp.send("Page.printToPDF", {"preferCSSPageSize": True, "printBackground": True, "displayHeaderFooter": False}, timeout=60)
        out.write_bytes(base64.b64decode(pdf["data"]))
        print(f"書き出し：{out}")
    finally:
        chrome.terminate()
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    main()
