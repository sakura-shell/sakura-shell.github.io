"""開発用のローカルサーバー（キャッシュ無効）。

python3 tools/serve.py [ポート番号]
→ http://localhost:8736/site/              サイト
   http://localhost:8736/tools/train.html  AI判定の学習・評価
   http://localhost:8736/tools/box-test.html 箱の読み取りの検証

このパソコンの中（127.0.0.1）だけで動きます。学習ツールの「保存」は、
決められたファイル（site/models/classifier.json と docs/ai-evaluation.json）にだけ書き込みます。
"""
import json
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# 保存を受け付ける場所（それ以外には書き込まない）
SAVE_TARGETS = {
    "/__save/classifier": ROOT / "site/models/classifier.json",
    "/__save/evaluation": ROOT / "docs/ai-evaluation.json",
}
MAX_BYTES = 20 * 1024 * 1024


class DevHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".webmanifest": "application/manifest+json",
        ".js": "text/javascript",
        ".glb": "model/gltf-binary",
        ".usdz": "model/vnd.usdz+zip",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        # 3Dモデル作成の検証用：合成した撮影画像（tools/fixtures/pg-test/000.png など）
        m = re.fullmatch(r"/__save/pg-test/(\d{3})\.png", self.path)
        if m:
            length = int(self.headers.get("Content-Length") or 0)
            if not 0 < length <= MAX_BYTES:
                self.send_error(400, "bad request")
                return
            out = ROOT / "tools/fixtures/pg-test" / f"{m.group(1)}.png"
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(self.rfile.read(length))
            self.send_response(200)
            self.end_headers()
            return
        target = SAVE_TARGETS.get(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        if not target or length <= 0 or length > MAX_BYTES:
            self.send_error(400, "bad request")
            return
        body = self.rfile.read(length)
        try:
            json.loads(body)  # JSON として正しいものだけ保存する
        except ValueError:
            self.send_error(400, "not json")
            return
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(body)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"saved": str(target.relative_to(ROOT))}).encode())


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8736
    handler = partial(DevHandler, directory=str(ROOT))
    print(f"http://localhost:{port}/site/")
    ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
