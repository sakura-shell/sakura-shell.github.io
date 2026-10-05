"""スマホの「学習用の写真を集める」画面で書き出した ZIP を、学習用の写真に取り込む。

python3 tools/import_collected.py <書き出したZIP> [<ZIP> ...]

- ZIP の中の photos/NN/<個体>/001.jpg を training/photos/NN/<個体>/ に写す（other は 36種類以外）
- 同じ名前の写真がすでにあれば上書きしない
- 取り込んだあと、training/manifest.json を作り直す
続けて http://localhost:8736/tools/train.html で学習し直す（「図鑑の写真」のチェックは外す）
"""
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "training/photos"


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    added = skipped = 0
    for z in sys.argv[1:]:
        with zipfile.ZipFile(z) as zf:
            for name in zf.namelist():
                parts = Path(name).parts
                if len(parts) != 4 or parts[0] != "photos" or not name.lower().endswith((".jpg", ".jpeg")):
                    continue
                label, group, file = parts[1], parts[2], parts[3]
                if not (label == "other" or (label.isdigit() and 1 <= int(label) <= 36)):
                    continue
                out = DEST / (label if label == "other" else f"{int(label):02d}") / group / file
                if out.exists():
                    skipped += 1
                    continue
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(zf.read(name))
                added += 1
    print(f"取り込み：{added}枚（すでにあった {skipped}枚は飛ばした）")
    subprocess.run([sys.executable, str(ROOT / "tools/make_training_manifest.py")], check=True)


if __name__ == "__main__":
    main()
