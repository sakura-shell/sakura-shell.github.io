"""スマホで確かめるためのサーバー（同じWi-Fiにつないだスマホから開ける。読み取り専用）。

python3 tools/serve_lan.py [ポート番号（既定 8737）]
→ スマホのブラウザで、表示された http://192.168.x.x:8737/ を開く

- site/ フォルダの中だけを見せる（tools/・training/・materials/ などは見えない）
- 書き込み（学習結果の保存など）は受け付けない
- 同じWi-Fi（同じネットワーク）の端末からだけ開ける。インターネットには公開されない
- http のため、オフライン用の保存（Service Worker）とカメラの直接起動は使えない
  （「カメラで撮る」は、スマホの撮影画面を開く方法に自動で切り替わる）
- 終わったら Ctrl+C で止める
"""
import socket
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "site"


class ReadOnlyHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".webmanifest": "application/manifest+json",
        ".js": "text/javascript",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def list_directory(self, path):  # フォルダの中身の一覧は見せない
        self.send_error(404, "not found")
        return None

    def do_POST(self):
        self.send_error(405, "read only")

    do_PUT = do_DELETE = do_PATCH = do_POST

    def log_message(self, fmt, *args):
        sys.stderr.write(f"{self.client_address[0]} {fmt % args}\n")


def lan_addresses():
    addrs = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("192.0.2.1", 9))  # 実際には送らない。外向きに使う自分のアドレスを調べるだけ
        addrs.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    return sorted(a for a in addrs if not a.startswith("127."))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8737
    handler = partial(ReadOnlyHandler, directory=str(SITE))
    addrs = lan_addresses()
    print("スマホ（同じWi-Fi）のブラウザで開くURL：")
    for a in addrs or ["（このMacのIPアドレスが分かりません）"]:
        print(f"  http://{a}:{port}/")
    print(f"このMacでは http://localhost:{port}/ 。止めるときは Ctrl+C")
    ThreadingHTTPServer(("0.0.0.0", port), handler).serve_forever()
