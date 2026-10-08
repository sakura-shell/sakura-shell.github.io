"""貝を撮った動画から、AIの学習用の写真を切り出す。

python3 tools/import_video.py <番号> <動画> [<動画> ...]
python3 tools/import_video.py <動画> [<動画> ...]        ← ファイル名の先頭が番号のとき（例：24_かたし貝.mov、24-1.MOV）

- 動画1本＝貝1個として扱う（同じ貝の写真は、1つのまとまり＝個体として学習・評価に使う）
- 画面の中央を正方形に切り出す（撮るときは、貝を画面の真ん中に大きく）
- ぶれた場面・貝が写っていない場面を除き、似すぎた場面を間引いて、1本から最大24枚を選ぶ
- 保存先：training/photos/<番号2桁>/vid-<動画の名前>/f001.jpg …（36種類以外の貝・石は番号の代わりに other）
- 確認用の一覧画像：training/sheets/<番号2桁>_vid-<動画の名前>.jpg（どの貝が写っているかを目で確かめる）
- 最後に training/manifest.json を作り直す
撮り方の目安：貝を1つだけ、手のひらや砂の上で、ゆっくり回して表・裏・横を写す（10〜20秒）
必要なもの：tools/bin/videoframes（Mac の AVFoundation で場面を書き出す）と Pillow
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageFilter, ImageStat

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "training/photos"
SHEETS = ROOT / "training/sheets"
VIDEOFRAMES = ROOT / "tools/bin/videoframes"
MAX_PER_VIDEO = 24
FPS = 4


def label_dir(label):
    if label == "other":
        return "other"
    n = int(label)
    if not 1 <= n <= 36:
        raise SystemExit(f"番号は 1〜36 か other です：{label}")
    return f"{n:02d}"


def center_square(im, frac=0.8):
    """画面の中央の正方形（短い辺の frac 倍）"""
    w, h = im.size
    s = int(min(w, h) * frac)
    return im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))


def subject_ratio(im):
    """中央の正方形の中で、まわり（背景）と色がちがう部分の割合。貝が写っていない場面を見分ける"""
    g = center_square(im).convert("RGB").resize((96, 96))
    px = list(g.getdata())
    W = 96
    ring = [px[y * W + x] for y in range(W) for x in range(W) if x < 5 or y < 5 or x >= W - 5 or y >= W - 5]
    bg = [sorted(c[i] for c in ring)[len(ring) // 2] for i in range(3)]
    inner = [px[y * W + x] for y in range(16, 80) for x in range(16, 80)]
    far = sum(1 for c in inner if ((c[0] - bg[0]) ** 2 + (c[1] - bg[1]) ** 2 + (c[2] - bg[2]) ** 2) ** 0.5 > 40)
    return far / len(inner)


def sharpness(im):
    g = im.convert("L")
    g.thumbnail((320, 320))
    return ImageStat.Stat(g.filter(ImageFilter.FIND_EDGES)).var[0]


def tiny(im):
    g = im.convert("L").resize((24, 24))
    return list(g.getdata())


def diff(a, b):
    return sum(abs(x - y) for x, y in zip(a, b)) / len(a)


def pick_frames(paths):
    """ぶれた場面を除き、時間の流れにそって、似すぎた場面を間引いて選ぶ"""
    info = []
    for p in paths:
        with Image.open(p) as im:
            if subject_ratio(im) < 0.04:  # 中央に何も写っていない（貝が画面の外）
                continue
            sq = center_square(im)
            info.append((p, sharpness(sq), tiny(sq)))
    if not info:
        return []
    sharp = sorted(s for _, s, _ in info)
    cut = sharp[len(sharp) // 2] * 0.45  # 真ん中の鮮明さの45%より ぼやけた場面は使わない
    good = [x for x in info if x[1] >= cut]
    chosen = []
    for p, s, t in good:
        if chosen and diff(t, chosen[-1][2]) < 6:  # 直前に選んだ場面とほとんど同じなら飛ばす
            continue
        chosen.append((p, s, t))
    if len(chosen) > MAX_PER_VIDEO:  # 多すぎるときは、時間にそって均等に
        step = len(chosen) / MAX_PER_VIDEO
        chosen = [chosen[int(i * step)] for i in range(MAX_PER_VIDEO)]
    return [p for p, _, _ in chosen]


def contact_sheet(paths, out, title):
    T = 220
    cols = 6
    rows = (len(paths) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * T, rows * T + 40), "white")
    from PIL import ImageDraw, ImageFont
    try:
        font = ImageFont.truetype("/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc", 24)
    except Exception:
        font = None
    ImageDraw.Draw(sheet).text((8, 6), title, fill="black", font=font)
    for i, p in enumerate(paths):
        with Image.open(p) as im:
            im = im.convert("RGB")
            im.thumbnail((T - 6, T - 6))
            sheet.paste(im, ((i % cols) * T + 3, 40 + (i // cols) * T + 3))
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out, quality=82)


def import_one(label, video):
    video = Path(video)
    if not video.exists():
        print(f"見つかりません：{video}")
        return 0
    name = re.sub(r"[^0-9A-Za-z_-]", "", video.stem) or "video"
    out_dir = DEST / label_dir(label) / f"vid-{name}"
    if out_dir.exists():
        print(f"取り込み済みなので飛ばします：{out_dir.relative_to(ROOT)}")
        return 0
    with tempfile.TemporaryDirectory() as tmp:
        r = subprocess.run([str(VIDEOFRAMES), str(video), tmp, str(FPS)], capture_output=True, text=True)
        frames = sorted(Path(tmp).glob("frame_*.jpg"))
        if not frames:
            print(f"場面を書き出せませんでした：{video}\n{r.stdout}{r.stderr}")
            return 0
        picked = pick_frames(frames)
        out_dir.mkdir(parents=True)
        saved = []
        for i, p in enumerate(picked, 1):
            with Image.open(p) as im:
                im = center_square(im.convert("RGB"))
                im.thumbnail((1000, 1000))
                dst = out_dir / f"f{i:03d}.jpg"
                im.save(dst, quality=88)
                saved.append(dst)
        sheet = SHEETS / f"{label_dir(label)}_vid-{name}.jpg"
        contact_sheet(saved, sheet, f"{label_dir(label)}  {video.name}  {len(saved)}枚（{len(frames)}場面から）")
        print(f"{video.name} → {out_dir.relative_to(ROOT)}：{len(saved)}枚（{len(frames)}場面から）・一覧 {sheet.relative_to(ROOT)}")
        return len(saved)


def main():
    args = sys.argv[1:]
    if not args:
        raise SystemExit(__doc__)
    if not VIDEOFRAMES.exists():
        raise SystemExit("tools/bin/videoframes がありません")
    fixed = None
    if re.fullmatch(r"\d{1,2}|other", args[0]) and not Path(args[0]).exists():
        fixed, args = args[0], args[1:]
    total = 0
    for v in args:
        label = fixed
        if label is None:
            m = re.match(r"(\d{1,2}|other)(?:[_\-\s]|$)", Path(v).stem)
            if not m:
                print(f"番号が分かりません（ファイル名の先頭に番号を付けるか、最初に番号を指定）：{v}")
                continue
            label = m.group(1)
        total += import_one(label, v)
    print(f"合計 {total}枚を取り込みました")
    if total:
        subprocess.run([sys.executable, str(ROOT / "tools/make_training_manifest.py")], check=True)


if __name__ == "__main__":
    main()
