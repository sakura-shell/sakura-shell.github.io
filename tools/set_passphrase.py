"""確認用プレビューの「合言葉」を設定・変更・解除する。

python3 tools/set_passphrase.py "新しい合言葉"   … 設定・変更（前の合言葉は使えなくなる）
python3 tools/set_passphrase.py --off            … 合言葉の画面を出さない

- site/data/config.json の previewGate に、合言葉そのものではなく、ハッシュ（元に戻せない値）だけを書く
- 全角・半角、大文字・小文字は区別しない
- 一般公開（config.json の mode が "public"）のときは、設定があっても合言葉の画面は出ない
- 合言葉を変えると、すでに入れた端末でも、もう一度聞かれる
- 変えたあとは、公開先にもアップロード（git push）すること
"""
import argparse
import hashlib
import json
import secrets
import unicodedata
from pathlib import Path

CONFIG = Path(__file__).resolve().parent.parent / "site/data/config.json"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("passphrase", nargs="?")
    ap.add_argument("--off", action="store_true")
    a = ap.parse_args()
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    if a.off:
        cfg.pop("previewGate", None)
        print("合言葉の画面を出さない設定にしました")
    else:
        if not a.passphrase:
            raise SystemExit('合言葉を指定してください：python3 tools/set_passphrase.py "合言葉"')
        value = unicodedata.normalize("NFKC", a.passphrase).strip().lower()
        if len(value) < 4:
            raise SystemExit("合言葉は4文字以上にしてください")
        salt = secrets.token_hex(8)
        cfg["previewGate"] = {
            "salt": salt,
            "hash": hashlib.sha256((salt + value).encode("utf-8")).hexdigest(),
            "note": "確認用プレビューの合言葉（tools/set_passphrase.py で設定。合言葉そのものは書かない）",
        }
        print("合言葉を設定しました（config.json には元に戻せない値だけを保存）")
    CONFIG.write_text(json.dumps(cfg, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
