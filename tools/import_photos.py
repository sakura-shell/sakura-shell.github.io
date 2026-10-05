"""提供された高画質の貝の写真を、サイトに取り込むスクリプト。

python3 tools/import_photos.py [写真のフォルダ] [オプション]

写真のフォルダ（省略時は materials/photos/）に、次の名前で置く:
    01-front.jpg   1番の表      （front / 表）
    01-back.jpg    1番の裏      （back  / 裏）
    01-side.jpg    1番の横      （side  / 横）
    01-front-2.jpg 2枚目以降は番号を付ける
    「01_表.jpg」「1-裏.HEIC」のような書き方も読める。HEIC は自動で JPEG にする（macOS の sips）

やること:
- 向き（スマホの回転情報）を直し、長辺 1600px の表示用と 480px の一覧用を作る
  → site/assets/img/shells/01-front.jpg と 01-front-s.jpg
- site/data/shells.json の photos を、表→裏→横の順に登録する（今の参考写真は最後に残す）
- オフライン用の版（site/sw.js の VERSION）を更新する

オプション:
  --source "2026年10月 志賀町商工観光課 撮影"   出典として表示・記録する文字
  --rights-confirmed --rights-holder "志賀町"   利用許諾を確認済みにする（一般公開で表示される）
  --mapping-confirmed --by "確認した人"          番号と写真の対応を確認済みにする
  --drop-sheet                                   一覧表から切り出した参考写真を外す
  --dry-run                                      書き込まずに、読み取り結果だけ表示する
"""
import argparse
import json
import re
import subprocess
import tempfile
from datetime import date, datetime
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "site/data/shells.json"
OUT = ROOT / "site/assets/img/shells"
SW = ROOT / "site/sw.js"
VIEWS = {"front": "front", "表": "front", "back": "back", "裏": "back", "side": "side", "横": "side"}
ORDER = {"front": 0, "back": 1, "side": 2}
LABEL = {"front": "表", "back": "裏", "side": "横"}
NAME_RE = re.compile(r"^(\d{1,2})(?:[-_ ]?(front|back|side|表|裏|横))?(?:[-_ ]?(\d+))?$", re.IGNORECASE)


def load_image(path):
    if path.suffix.lower() in {".heic", ".heif"}:
        tmp = Path(tempfile.mkdtemp()) / (path.stem + ".jpg")
        subprocess.run(["sips", "-s", "format", "jpeg", str(path), "--out", str(tmp)], check=True, capture_output=True)
        path = tmp
    img = Image.open(path)
    img = ImageOps.exif_transpose(img)  # スマホの回転情報を反映
    return img.convert("RGB")


def status(value, by=None):
    today = date.today().isoformat()
    return {"status": value, "source": None, "reviewedBy": by if value == "confirmed" else None,
            "reviewedAt": today if value == "confirmed" else None}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder", nargs="?", default=str(ROOT / "materials/photos"))
    ap.add_argument("--source", default="提供写真")
    ap.add_argument("--rights-confirmed", action="store_true")
    ap.add_argument("--rights-holder")
    ap.add_argument("--mapping-confirmed", action="store_true")
    ap.add_argument("--by")
    ap.add_argument("--drop-sheet", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    if a.mapping_confirmed and not a.by:
        raise SystemExit("--mapping-confirmed には --by（確認した人）も付けてください")

    folder = Path(a.folder)
    if not folder.exists():
        folder.mkdir(parents=True)
        print(f"{folder} を作りました。写真を置いてから、もう一度実行してください。")
        return
    found = {}
    skipped = []
    for f in sorted(folder.iterdir()):
        if f.suffix.lower() not in {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp"}:
            continue
        m = NAME_RE.match(f.stem)
        if not m or not 1 <= int(m.group(1)) <= 36:
            skipped.append(f.name)
            continue
        no = int(m.group(1))
        key = m.group(2) or "front"
        view = VIEWS.get(key.lower(), VIEWS.get(key, "front"))
        n = int(m.group(3) or 1)
        found.setdefault(no, []).append((ORDER[view], n, view, f))
    if skipped:
        print("名前が読めないので読み飛ばした写真（例：01-front.jpg の形にしてください）:", ", ".join(skipped))
    if not found:
        print("取り込める写真がありません")
        return

    data = json.loads(DATA.read_text(encoding="utf-8"))
    by_no = {s["no"]: s for s in data["species"]}
    for no in sorted(found):
        items = sorted(found[no])
        photos = []
        for _, n, view, f in items:
            suffix = f"{view}" + (f"-{n}" if n > 1 else "")
            name = f"{no:02d}-{suffix}"
            if not a.dry_run:
                img = load_image(f)
                big = img.copy()
                big.thumbnail((1600, 1600), Image.LANCZOS)
                big.save(OUT / f"{name}.jpg", "JPEG", quality=84, optimize=True, progressive=True)
                small = img.copy()
                small.thumbnail((480, 480), Image.LANCZOS)
                small.save(OUT / f"{name}-s.jpg", "JPEG", quality=80, optimize=True, progressive=True)
                w, h = big.size
            else:
                w = h = None
            rights = status("confirmed" if a.rights_confirmed else "unconfirmed", a.by)
            rights["source"] = a.rights_holder
            mapping = status("confirmed" if a.mapping_confirmed else "transcribed", a.by)
            mapping["source"] = "提供時のファイル名の番号"
            photos.append({
                "view": view, "label": LABEL[view] + (f"{n}" if n > 1 else ""),
                "src": f"assets/img/shells/{name}.jpg", "thumb": f"assets/img/shells/{name}-s.jpg",
                "source": a.source, "sourceFile": f.name, "mapping": mapping, "rights": rights,
                "quality": "ok", "width": w, "height": h,
            })
        sheet = [p for p in by_no[no]["photos"] if p.get("view") == "sheet"]
        by_no[no]["photos"] = photos + ([] if a.drop_sheet else sheet)
        print(f"{no:2d}番 {by_no[no]['name']['text']}: " + "、".join(p["label"] for p in photos))
    missing = [str(n) for n in range(1, 37) if not any(p.get("view") != "sheet" for p in by_no[n]["photos"])]
    if missing:
        print("高画質の写真がまだない番号:", ", ".join(missing))
    if a.dry_run:
        print("（--dry-run のため書き込んでいません）")
        return
    DATA.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    # オフライン用に保存された古い写真を取り直すため、版を上げる
    sw = SW.read_text(encoding="utf-8")
    sw = re.sub(r"const VERSION = '[^']*';", f"const VERSION = '{datetime.now().strftime('%Y.%m.%d-%H%M')}';", sw)
    SW.write_text(sw, encoding="utf-8")
    print("site/data/shells.json と site/sw.js（版）を更新しました")


if __name__ == "__main__":
    main()
