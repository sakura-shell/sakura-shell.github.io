"""撮影した貝の写真（名前付き）を、図鑑の写真とAI判定の学習用に取り込むスクリプト。

python3 tools/import_reference_photos.py <写真のフォルダ> [オプション]

写真の名前の例：「1.すずめ貝.jpg」「1.すずめ貝2.jpg」「32.ほら貝 (2).jpg」「34.小貝7.jpg」
- 先頭の番号は使わず、**貝の名前**でサイトの番号に対応させる（写真のフォルダは番号の振り方がサイトと違うため）
  名前と番号の対応は tools/photo_names.json（名前のない写真は "files" にファイル名で指定）。
  読めない名前の写真は読み飛ばして一覧に出す
- 写真の中の貝のまわりを自動で正方形に切り出す（白い無地の背景で撮った写真向け）

作るもの：
- site/assets/img/shells/NN-pK.jpg（長辺1200px）と NN-pK-s.jpg（480px）… 図鑑の写真
- training/photos/NN/ref-K/… AI判定の学習用（training/ は公開しない）
- site/data/shells.json の photos を登録（今の参考写真＝一覧表の切り出しは最後に残す）。
  番号の対応は transcribed（名前で対応させた）、利用許諾は --rights-holder を付けるまで unconfirmed
- site/sw.js の版を上げる

オプション:
  --source "2026年10月 撮影"            出典として記録する文字
  --rights-confirmed --rights-holder "志賀町"   利用許諾を確認済みにする（一般公開で表示される）
  --mapping-confirmed --by "確認した人"          名前と番号の対応を確認済みにする
  --max-per-species 6                    1種類あたりの図鑑の写真の上限（学習用は全部使う）
  --drop-sheet                           一覧表から切り出した参考写真を図鑑の写真から外す
  --dry-run                              書き込まずに、対応の一覧だけ表示する
"""
import argparse
import json
import re
import shutil
import unicodedata
from collections import deque
from datetime import date, datetime
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "site/data/shells.json"
NAMES = ROOT / "tools/photo_names.json"
OUT = ROOT / "site/assets/img/shells"
TRAIN = ROOT / "training/photos"
SW = ROOT / "site/sw.js"
EXTS = {".jpg", ".jpeg", ".png", ".webp"}
NAME_RE = re.compile(r"^(?:\d+)\s*[.．]\s*(.+?)\s*(?:\(\d+\))?\s*(\d*)\s*(?:\(\d+\))?$")


def parse_name(stem):
    """「1.すずめ貝2」→（すずめ貝, 2）。読めないときは None"""
    stem = unicodedata.normalize("NFC", stem)
    m = NAME_RE.match(stem)
    if not m:
        return None
    name = re.sub(r"\d+$", "", m.group(1)).strip()
    return name, m.group(2)


def otsu(values, bins=64):
    mx = max(values) or 1
    hist = [0] * bins
    for v in values:
        hist[min(bins - 1, int(v / mx * bins))] += 1
    total = len(values)
    s_all = sum(i * h for i, h in enumerate(hist))
    w_b = s_b = 0
    best = best_t = 0
    for t in range(bins):
        w_b += hist[t]
        if not w_b:
            continue
        w_f = total - w_b
        if not w_f:
            break
        s_b += t * hist[t]
        m_b, m_f = s_b / w_b, (s_all - s_b) / w_f
        between = w_b * w_f * (m_b - m_f) ** 2
        if between > best:
            best, best_t = between, t
    return (best_t + 1) / bins * mx


def solve(A, b):
    """小さな連立方程式（ガウスの消去法）"""
    n = len(b)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for i in range(n):
        piv = max(range(i, n), key=lambda r: abs(M[r][i]))
        M[i], M[piv] = M[piv], M[i]
        if abs(M[i][i]) < 1e-12:
            continue
        for r in range(n):
            if r != i:
                f = M[r][i] / M[i][i]
                for c in range(i, n + 1):
                    M[r][c] -= f * M[i][c]
    return [M[i][n] / M[i][i] if abs(M[i][i]) > 1e-12 else 0.0 for i in range(n)]


def fit_background(px, w, h, step=6, rounds=3):
    """背景の色を、位置の2次式で近似する（貝の部分は外れ値として除きながら当てはめる）"""
    pts = [(x, y) for y in range(0, h, step) for x in range(0, w, step)]
    feats = lambda x, y: (1.0, x / w, y / h, (x / w) ** 2, (y / h) ** 2, x * y / (w * h))
    keep = pts
    coef = None
    for _ in range(rounds):
        coef = []
        for ch in range(3):
            A = [[0.0] * 6 for _ in range(6)]
            b = [0.0] * 6
            for x, y in keep:
                f = feats(x, y)
                v = px[x, y][ch]
                for i in range(6):
                    b[i] += f[i] * v
                    for j in range(6):
                        A[i][j] += f[i] * f[j]
            coef.append(solve(A, b))
        res = []
        for x, y in pts:
            f = feats(x, y)
            e = sum((px[x, y][ch] - sum(c * fi for c, fi in zip(coef[ch], f))) ** 2 for ch in range(3)) ** 0.5
            res.append((e, x, y))
        res.sort()
        keep = [(x, y) for _, x, y in res[: int(len(res) * 0.75)]]  # 差の大きい25%（貝・影）を除いて当てはめ直す
    return lambda x, y: [sum(c * fi for c, fi in zip(coef[ch], feats(x, y))) for ch in range(3)]


def find_subject(img):
    """背景（外周の色）と違う、いちばん大きいかたまりの範囲（元画像の座標）"""
    small = img.copy()
    small.thumbnail((360, 360))
    small = small.filter(ImageFilter.GaussianBlur(1.2))  # 細かなざらつきで貝が途切れないように
    w, h = small.size
    px = small.load()
    # 背景は、照明のむらで少しずつ明るさが変わる。なめらかな面（2次式）で近似し、そこからの差で貝を探す
    bg_at = fit_background(px, w, h)
    d = [0.0] * (w * h)
    for y in range(h):
        for x in range(w):
            c, b = px[x, y], bg_at(x, y)
            d[y * w + x] = ((c[0] - b[0]) ** 2 + (c[1] - b[1]) ** 2 + (c[2] - b[2]) ** 2) ** 0.5
    sd = sorted(d)
    noise = sd[len(sd) // 2]  # 画像の大半は背景なので、中央値＝背景のざらつき
    thr = max(7, noise * 4)
    bg = [int(v) for v in bg_at(w / 2, 2)]
    m_img = Image.new("L", (w, h))
    m_img.putdata([255 if v > thr else 0 for v in d])
    m_img = m_img.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(3))  # 近い破片をつなぐ
    mask = [v > 0 for v in m_img.getdata()]
    seen = [False] * (w * h)
    comps = []
    for start in range(w * h):
        if not mask[start] or seen[start]:
            continue
        q = deque([start])
        seen[start] = True
        n, x0, y0, x1, y1 = 0, w, h, 0, 0
        while q:
            p = q.popleft()
            x, y = p % w, p // w
            n += 1
            x0, y0, x1, y1 = min(x0, x), min(y0, y), max(x1, x), max(y1, y)
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < w and 0 <= ny < h:
                    k = ny * w + nx
                    if mask[k] and not seen[k]:
                        seen[k] = True
                        q.append(k)
        touches = x0 <= 1 or y0 <= 1 or x1 >= w - 2 or y1 >= h - 2
        comps.append((n, x0, y0, x1, y1, touches))
    # 外周にかかるかたまり（背景の明るさのむら・影）は、ほかに候補があれば使わない
    inner = [c for c in comps if not c[5]] or comps
    if not inner:
        return None, bg
    big = max(c[0] for c in inner)
    if big < w * h * 0.002:
        return None, bg
    # 貝が光や模様で途切れて見えることがあるので、大きめのかたまりはまとめて囲む
    # （ただし、いちばん大きいかたまりの近くにあるものだけ。離れたごみ・ほこりは入れない）
    main = max(inner, key=lambda c: c[0])
    mw, mh = main[3] - main[1], main[4] - main[2]
    near = lambda c: (c[3] >= main[1] - mw * 0.4 and c[1] <= main[3] + mw * 0.4
                      and c[4] >= main[2] - mh * 0.4 and c[2] <= main[4] + mh * 0.4)
    parts = [c for c in inner if c is main or (c[0] >= big * 0.04 and near(c))]
    x0, y0 = min(c[1] for c in parts), min(c[2] for c in parts)
    x1, y1 = max(c[3] for c in parts), max(c[4] for c in parts)
    sx, sy = img.width / w, img.height / h
    return (x0 * sx, y0 * sy, (x1 + 1) * sx, (y1 + 1) * sy), bg


def square_crop(img, box, bg, margin=0.22):
    """貝を中心に、余白を付けた正方形に切り出す（はみ出す所は背景の色で埋める）"""
    if box is None:
        side = min(img.size)
        cx, cy = img.width / 2, img.height / 2
    else:
        x0, y0, x1, y1 = box
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        side = max(x1 - x0, y1 - y0) * (1 + margin * 2)
    side = int(max(side, 64))
    canvas = Image.new("RGB", (side, side), tuple(int(c) for c in bg))
    left, top = int(cx - side / 2), int(cy - side / 2)
    region = img.crop((max(0, left), max(0, top), min(img.width, left + side), min(img.height, top + side)))
    canvas.paste(region, (max(0, -left), max(0, -top)))
    return canvas


def status(value, by=None, source=None):
    today = date.today().isoformat()
    return {"status": value, "source": source, "reviewedBy": by if value == "confirmed" else None,
            "reviewedAt": today if value == "confirmed" else None}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder")
    ap.add_argument("--source", default="提供された撮影写真")
    ap.add_argument("--rights-confirmed", action="store_true")
    ap.add_argument("--rights-holder")
    ap.add_argument("--mapping-confirmed", action="store_true")
    ap.add_argument("--by")
    ap.add_argument("--max-per-species", type=int, default=6)
    ap.add_argument("--drop-sheet", action="store_true", help="一覧表から切り出した参考写真を、図鑑の写真から外す（学習用には残る）")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    if (a.rights_confirmed or a.mapping_confirmed) and not a.by:
        raise SystemExit("確認済みにするときは --by（確認した人）も付けてください")
    if a.rights_confirmed and not a.rights_holder:
        raise SystemExit("--rights-confirmed には --rights-holder（権利者）も付けてください")

    table = json.loads(NAMES.read_text(encoding="utf-8"))
    names, by_file = table["names"], table.get("files", {})
    folder = Path(a.folder)
    files = sorted((p for p in folder.iterdir() if p.suffix.lower() in EXTS and not p.name.startswith(".")),
                   key=lambda p: unicodedata.normalize("NFC", p.name))
    by_no, skipped = {}, []
    for f in files:
        parsed = parse_name(f.stem)
        no = names.get(parsed[0]) if parsed else None
        no = no or by_file.get(unicodedata.normalize("NFC", f.stem))  # 名前のない写真は、ファイル名で指定
        if not no:
            skipped.append(f.name)
            continue
        by_no.setdefault(no, []).append(f)

    data = json.loads(DATA.read_text(encoding="utf-8"))
    sp_by_no = {s["no"]: s for s in data["species"]}
    print(f"{len(files)}枚 → {sum(len(v) for v in by_no.values())}枚を {len(by_no)}種類に対応")
    for no in sorted(by_no):
        print(f"  {no:>2} {sp_by_no[no]['name']['text']:<8} {len(by_no[no])}枚：" + "、".join(unicodedata.normalize('NFC', p.stem) for p in by_no[no]))
    missing = [n for n in range(1, 37) if n not in by_no]
    if missing:
        print("写真がない番号：" + "、".join(f"{n} {sp_by_no[n]['name']['text']}" for n in missing))
    if skipped:
        print("名前を読めず読み飛ばした写真：" + "、".join(unicodedata.normalize("NFC", s) for s in skipped))
    if a.dry_run:
        return

    OUT.mkdir(parents=True, exist_ok=True)
    rights = status("confirmed" if a.rights_confirmed else "unconfirmed", a.by, a.rights_holder)
    mapping = status("confirmed" if a.mapping_confirmed else "transcribed", a.by, "写真のファイル名の貝の名前で対応（tools/photo_names.json）")
    for no, paths in sorted(by_no.items()):
        sp = sp_by_no[no]
        # 前回この方法で取り込んだ写真・学習用は入れ替える
        sp["photos"] = [p for p in sp["photos"] if p.get("view") != "photo"]
        for old in OUT.glob(f"{no:02d}-p*.jpg"):
            old.unlink()
        tdir = TRAIN / f"{no:02d}"
        if tdir.exists():
            for old in tdir.glob("ref-*"):
                shutil.rmtree(old)
        new_photos = []
        for k, path in enumerate(paths, 1):
            img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
            box, bg = find_subject(img)
            crop = square_crop(img, box, bg)
            # 学習用（すべて）。1枚ずつ別のまとまりにする（同じ個体の写真なので、評価は甘めになる）
            g = tdir / f"ref-{k}"
            g.mkdir(parents=True, exist_ok=True)
            t = crop.copy()
            t.thumbnail((640, 640), Image.LANCZOS)
            t.save(g / f"{no:02d}-{k}.jpg", quality=90)
            if k > a.max_per_species:
                continue
            big = crop.copy()
            big.thumbnail((1200, 1200), Image.LANCZOS)
            big.save(OUT / f"{no:02d}-p{k}.jpg", quality=86, optimize=True, progressive=True)
            s = crop.copy()
            s.thumbnail((480, 480), Image.LANCZOS)
            s.save(OUT / f"{no:02d}-p{k}-s.jpg", quality=82, optimize=True)
            new_photos.append({
                "view": "photo", "label": f"写真{k}",
                "src": f"assets/img/shells/{no:02d}-p{k}.jpg", "thumb": f"assets/img/shells/{no:02d}-p{k}-s.jpg",
                "source": a.source, "sourceFile": unicodedata.normalize("NFC", path.name),
                "mapping": dict(mapping), "rights": dict(rights), "quality": "high",
            })
        rest = [p for p in sp["photos"] if not (a.drop_sheet and p.get("view") == "sheet")]
        sp["photos"] = new_photos + rest
    data["updated"] = date.today().isoformat()
    DATA.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    sw = SW.read_text(encoding="utf-8")
    sw = re.sub(r"const VERSION = '[^']*';", f"const VERSION = '{datetime.now().strftime('%Y.%m.%d-%H%M')}';", sw)
    SW.write_text(sw, encoding="utf-8")
    print("登録しました。続けて、AI判定を学習し直してください：python3 tools/make_training_manifest.py → tools/train.html")


if __name__ == "__main__":
    main()
