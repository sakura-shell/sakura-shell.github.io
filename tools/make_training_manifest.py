"""AI判定の学習用写真の一覧（training/manifest.json）を作るスクリプト。

python3 tools/make_training_manifest.py

写真の置き方（プロジェクト直下の training/photos/）:

    training/photos/01/            ← 1番（すだれ貝）の写真
        kai-a/IMG_0001.jpg         ← 同じ個体（同じ貝）の写真はフォルダにまとめる（推奨）
        kai-a/IMG_0002.jpg
        kai-b/IMG_0010.jpg
    training/photos/02/ …
    training/photos/other/         ← 36種類以外の貝の写真（「36種類以外かも」を出すため）

- フォルダ名は 01〜36 の2桁の番号と other
- 同じ個体をフォルダにまとめると、評価のときに「学習に使っていない貝」で正解率を測れる
  （まとめない場合は、写真1枚ずつを別の個体として扱う）
- JPEG / PNG / WebP に対応。iPhone の HEIC はこのスクリプトが JPEG に変換する（macOS の sips を使用）
- training/ は利用者の写真を含むため、公開リポジトリに入れない（.gitignore 済み）
"""
import hashlib
import json
import subprocess
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PHOTOS = ROOT / "training/photos"
CONVERTED = ROOT / "training/converted"
OUT = ROOT / "training/manifest.json"
EXTS = {".jpg", ".jpeg", ".png", ".webp"}
VAL_RATIO = 0.25  # 評価に回す個体の割合


def label_of(name):
    if name == "other":
        return "other"
    if name.isdigit() and 1 <= int(name) <= 36:
        return str(int(name))
    return None


def convert_heic(path):
    CONVERTED.mkdir(parents=True, exist_ok=True)
    out = CONVERTED / (hashlib.md5(str(path).encode()).hexdigest()[:10] + ".jpg")
    if not out.exists():
        subprocess.run(["sips", "-s", "format", "jpeg", "-Z", "1600", str(path), "--out", str(out)], check=True, capture_output=True)
    return out


def main():
    if not PHOTOS.exists():
        PHOTOS.mkdir(parents=True)
        print(f"{PHOTOS.relative_to(ROOT)} を作りました。写真を置いてから、もう一度実行してください。")
        return
    items = []
    for label_dir in sorted(PHOTOS.iterdir()):
        if not label_dir.is_dir():
            continue
        label = label_of(label_dir.name)
        if label is None:
            print(f"読み飛ばし（フォルダ名は 01〜36 か other）: {label_dir.name}")
            continue
        files = sorted(p for p in label_dir.rglob("*") if p.is_file() and p.suffix.lower() in EXTS | {".heic", ".heif"})
        groups = {}
        for f in files:
            rel = f.relative_to(label_dir)
            group = rel.parts[0] if len(rel.parts) > 1 else f.stem
            if f.suffix.lower() in {".heic", ".heif"}:
                f = convert_heic(f)
            groups.setdefault(group, []).append(f)
        names = sorted(groups, key=lambda g: hashlib.md5(f"{label}/{g}".encode()).hexdigest())
        n_val = int(len(names) * VAL_RATIO) if len(names) >= 3 else (1 if len(names) == 2 else 0)
        val = set(names[:n_val])
        for g in names:
            for f in groups[g]:
                items.append({
                    "label": label,
                    "group": f"{label}/{g}",
                    "src": "../" + str(f.relative_to(ROOT)),
                    "split": "val" if g in val else "train",
                })
    OUT.write_text(json.dumps({"generated": datetime.now().isoformat(timespec="seconds"), "items": items}, ensure_ascii=False, indent=1), encoding="utf-8")
    counts = {}
    for it in items:
        c = counts.setdefault(it["label"], {"train": 0, "val": 0})
        c[it["split"]] += 1
    print(f"{OUT.relative_to(ROOT)}: {len(items)}枚")
    for label in sorted(counts, key=lambda x: (x == "other", int(x) if x.isdigit() else 0)):
        print(f"  {label:>5}: 学習 {counts[label]['train']}・評価 {counts[label]['val']}")
    missing = [str(n) for n in range(1, 37) if str(n) not in counts]
    if missing:
        print(f"写真がない番号: {', '.join(missing)}")


if __name__ == "__main__":
    main()
