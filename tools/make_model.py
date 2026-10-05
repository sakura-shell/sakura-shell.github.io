"""貝の写真・動画から3Dモデルを作り、サイトに登録するスクリプト（Mac 専用）。

python3 tools/make_model.py <番号> <写真のフォルダ または 動画> [--length-mm 42] [オプション]

例: python3 tools/make_model.py 12 materials/3d/12 --length-mm 38
例: python3 tools/make_model.py 5 materials/3d/05-video/IMG_8366.MOV --back materials/3d/05-video/IMG_8367.MOV \
        --crop --length-mm 21

やること:
1. 動画なら、1秒4枚の静止画に切り出す（tools/bin/videoframes）
2. tools/bin/make3d（Apple の Object Capture）で3Dモデルを作る（なければ自動でビルド）
3. --crop：下に敷いた紙・机を色で見分けて取り除き、水平に置き直す（tools/crop_mesh.py）
4. tools/obj2glb.py で Web 用の site/models/12.glb に変換。--length-mm で実寸に合わせる
5. site/data/shells.json の model（と specimenSize）を登録し、site/sw.js の版を上げる

--back：貝を裏返して撮った写真・動画から「裏」のモデルも作り、site/models/12-back.glb に登録する。
  貝を置いたまま撮ると、下の面は写らない（片面だけのモデルになる）。表と裏を別に作り、画面の「表／裏」で切り替える。

登録した3Dモデルは、確認用プレビューでは「照合待ち」として表示される。
実物と見比べて問題がなければ --confirmed --by "確認した人" で登録し直すか、JSON の status を confirmed にする。
実物大AR は、model と specimenSize（標本の実測）がどちらも confirmed のときだけ出る。

オプション:
  --detail reduced|medium|full   細かさ（既定 reduced。--crop のときは full）
  --unordered                    写真が順番どおりに撮られていないとき
  --crop                         下の紙・机を取り除く（無地の色紙の上で撮ったとき）。
                                 このとき --length-mm は殻の片方の長さ（1個の貝・巻貝なら --parts 1 も付ける）
  --back <写真のフォルダ または 動画>   裏返して撮ったもの
  --style sakura                 色・質感をさくら貝らしく加工する（イラスト寄り。画面に加工の注記が出る）
  --source "2026年10月 志賀町撮影"
  --confirmed --by "確認した人"   3Dモデルを確認済みで登録する
  --size-confirmed               --length-mm の値を、標本の実測として確認済みにする
"""
import argparse
import json
import re
import shutil
import subprocess
from datetime import date, datetime
from pathlib import Path

import importlib.util

ROOT = Path(__file__).resolve().parent.parent
BIN = ROOT / "tools/bin/make3d"
SRC = ROOT / "tools/photogrammetry/Make3D.swift"
FRAMES_BIN = ROOT / "tools/bin/videoframes"
FRAMES_SRC = ROOT / "tools/photogrammetry/VideoFrames.swift"
DATA = ROOT / "site/data/shells.json"
SW = ROOT / "site/sw.js"
PHOTO_EXT = {".jpg", ".jpeg", ".png", ".heic", ".heif"}
VIDEO_EXT = {".mov", ".mp4", ".m4v"}


def load_obj2glb():
    spec = importlib.util.spec_from_file_location("obj2glb", ROOT / "tools/obj2glb.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def build(bin_path, src):
    if not bin_path.exists():
        print(f"{bin_path.name} をビルドします…")
        bin_path.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["swiftc", "-O", "-parse-as-library", str(src), "-o", str(bin_path)], check=True)


def make_one(src, work, a):
    """写真のフォルダか動画から、OBJ のフォルダを作る。戻り値: (OBJ のフォルダ, 素材の説明)"""
    src = Path(src)
    if src.is_file() and src.suffix.lower() in VIDEO_EXT:
        build(FRAMES_BIN, FRAMES_SRC)
        frames = work / "frames"
        shutil.rmtree(frames, ignore_errors=True)
        subprocess.run([str(FRAMES_BIN), str(src), str(frames), "4"], check=True)
        photos, label = frames, f"動画 {src.name}"
    elif src.is_dir():
        photos, label = src, None
    else:
        raise SystemExit(f"{src} は写真のフォルダでも動画でもありません")
    n = len([p for p in photos.iterdir() if p.suffix.lower() in PHOTO_EXT])
    label = label or f"写真 {n} 枚"
    if n < 20:
        print(f"注意：写真が {n} 枚です。40枚以上あるときれいに作れます")

    build(BIN, SRC)
    out = work / "capture"
    cmd = [str(BIN), str(photos), str(out), "--detail", a.detail] + (["--unordered"] if a.unordered else [])
    print(f"3Dモデルを作っています（{label}。数分〜数十分かかります）…")
    if subprocess.run(cmd).returncode != 0:
        raise SystemExit("3Dモデルを作れませんでした。写真の枚数・重なり・明るさを見直してください")
    obj = out / "obj"
    if a.crop:
        cropped = work / "crop"
        shutil.rmtree(cropped, ignore_errors=True)
        cmd = ["python3", str(ROOT / "tools/crop_mesh.py"), str(obj), str(cropped)]
        if a.length_mm:
            cmd += ["--part-length-mm", str(a.length_mm), "--parts", str(a.parts)]
        subprocess.run(cmd, check=True)
        obj = cropped
    return obj, label


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("no", type=int)
    ap.add_argument("photos")
    ap.add_argument("--back")
    ap.add_argument("--crop", action="store_true")
    ap.add_argument("--style", choices=["sakura"], help="色・質感を加工する（イラスト寄り）")
    ap.add_argument("--length-mm", type=float)
    ap.add_argument("--parts", type=int, default=2)
    ap.add_argument("--detail", choices=["preview", "reduced", "medium", "full"])
    ap.add_argument("--unordered", action="store_true")
    ap.add_argument("--source", default="提供写真から Object Capture で作成")
    ap.add_argument("--confirmed", action="store_true")
    ap.add_argument("--size-confirmed", action="store_true")
    ap.add_argument("--by")
    a = ap.parse_args()
    if not 1 <= a.no <= 36:
        raise SystemExit("番号は 1〜36")
    # --crop のときは、紙の部分を捨てる分、貝に細かさが残るよう full で作る（輪郭がなめらかになる）
    a.detail = a.detail or ("full" if a.crop else "reduced")
    if (a.confirmed or a.size_confirmed) and not a.by:
        raise SystemExit("確認済みにするときは --by（確認した人）も付けてください")

    work = ROOT / f"materials/3d-work/{a.no:02d}"
    conv = load_obj2glb()
    # --crop のときは crop_mesh.py で実寸に合わせ済み（obj2glb では大きさを変えない）
    glb_len = None if a.crop else a.length_mm
    one_sided = a.crop or bool(a.back)

    obj, label = make_one(a.photos, work / "front", a)
    out = ROOT / f"site/models/{a.no:02d}.glb"
    tex_max = 4096 if a.crop else 2048  # 貝の部分が画像の一部なので、大きめに残す
    info = conv.convert(obj, out, glb_len, max_texture=tex_max, double_sided=one_sided, style=a.style)
    back_src = None
    if a.back:
        bobj, blabel = make_one(a.back, work / "back", a)
        bout = ROOT / f"site/models/{a.no:02d}-back.glb"
        conv.convert(bobj, bout, glb_len, max_texture=tex_max, double_sided=True, style=a.style)
        back_src = f"models/{a.no:02d}-back.glb"
        label = f"表：{label}、裏：{blabel}"

    register_model(a.no, info, f"{a.source}（{label}）", a.length_mm, a.confirmed, a.size_confirmed, a.by,
                   back_src=back_src, style=a.style)
    print(f"登録しました：{a.no}番 → {out.relative_to(ROOT)}" + (f"・{back_src}" if back_src else ""))


def register_model(no, info, source, length_mm=None, confirmed=False, size_confirmed=False, by=None, ios_src=None,
                   back_src=None, style=None):
    """site/data/shells.json に3Dモデルを登録し、site/sw.js の版を上げる"""
    data = json.loads(DATA.read_text(encoding="utf-8"))
    sp = next(s for s in data["species"] if s["no"] == no)
    today = date.today().isoformat()
    sp["model"] = {
        "src": f"models/{no:02d}.glb", "unit": "m", "source": source,
        "license": None, "createdAt": today, "triangles": info.get("triangles"), "bytes": info.get("bytes"),
        "status": "confirmed" if confirmed else "transcribed",
        "reviewedBy": by if confirmed else None, "reviewedAt": today if confirmed else None,
    }
    if ios_src:
        sp["model"]["iosSrc"] = ios_src
    if back_src:
        sp["model"]["backSrc"] = back_src  # 裏返して撮った「裏」のモデル（表と切り替えて見せる）
    if style:
        sp["model"]["style"] = style  # 色・質感を加工した（画面に「加工しています」と出す）
    if length_mm:
        sp["specimenSize"] = {
            "lengthMm": length_mm, "source": "標本を実測",
            "status": "confirmed" if size_confirmed else "transcribed",
            "reviewedBy": by if size_confirmed else None, "reviewedAt": today if size_confirmed else None,
        }
    DATA.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    sw = SW.read_text(encoding="utf-8")
    sw = re.sub(r"const VERSION = '[^']*';", f"const VERSION = '{datetime.now().strftime('%Y.%m.%d-%H%M')}';", sw)
    SW.write_text(sw, encoding="utf-8")


if __name__ == "__main__":
    main()
