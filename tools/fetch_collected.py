"""スタッフがスマホから送付した学習用の写真を、Google ドライブ（送付先のウェブアプリ）から受け取る。

python3 tools/fetch_collected.py

- 送付先の URL と合鍵は tools/collect_config.json に書く（公開しない。.gitignore 済み）
    { "endpoint": "https://script.google.com/macros/s/…/exec", "key": "合鍵" }
- まだ受け取っていない写真だけを training/photos/NN/<個体>/ に保存する（other は 36種類以外）
- 受け取ったあと、training/manifest.json を作り直す
続けて http://localhost:8736/tools/train.html で学習し直す（「図鑑の写真」のチェックは外す）
"""
import base64
import json
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONF = ROOT / "tools/collect_config.json"
DEST = ROOT / "training/photos"


def call(endpoint, params):
    url = endpoint + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=120) as r:  # Apps Script は別のアドレスへ転送して答える（自動でたどる）
        return json.loads(r.read().decode("utf-8"))


def main():
    if not CONF.exists():
        raise SystemExit(f"{CONF.relative_to(ROOT)} がありません。送付先の URL と合鍵を書いてください（このファイルの説明を参照）")
    conf = json.loads(CONF.read_text(encoding="utf-8"))
    res = call(conf["endpoint"], {"key": conf["key"], "action": "list"})
    if not res.get("ok"):
        raise SystemExit(f"一覧を受け取れませんでした：{res.get('error')}")
    added = skipped = 0
    for f in res["files"]:
        parts = f["path"].split("/")
        if len(parts) != 3 or not parts[2].lower().endswith(".jpg"):
            continue
        label, group, name = parts
        if not (label == "other" or (label.isdigit() and 1 <= int(label) <= 36)):
            continue
        out = DEST / (label if label == "other" else f"{int(label):02d}") / group / name
        if out.exists():
            skipped += 1
            continue
        data = call(conf["endpoint"], {"key": conf["key"], "action": "file", "id": f["id"]})
        if not data.get("ok"):
            print(f"受け取れなかった写真：{f['path']}（{data.get('error')}）")
            continue
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(base64.b64decode(data["data"]))
        added += 1
        print(f"受け取り：{f['path']}")
    print(f"受け取った写真：{added}枚（すでにあった {skipped}枚は飛ばした）")
    if added:
        subprocess.run([sys.executable, str(ROOT / "tools/make_training_manifest.py")], check=True)


if __name__ == "__main__":
    main()
