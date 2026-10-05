"""参照画像からサイト用の画像を切り出すスクリプト。

使い方: python3 tools/extract_assets.py
必要なもの: Python 3 と Pillow（pip3 install pillow）

- 貝の写真: references/IMG_0429.jpeg（36種類一覧）の各カードの写真部分
- ヒーロー画像: references/IMG_3525.jpeg（チラシ）の上部
- ヘッダーのロゴ: チラシのロゴの「36 shells」の文字（透明背景）

一覧表・チラシは低解像度のため、原本データや撮影写真が用意できたら
site/assets/img/ 以下の同名ファイルを差し替えてください（CONTENT_TODO.md 参照）。
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / "references"
OUT_SHELLS = ROOT / "site/assets/img/shells"
OUT_BRAND = ROOT / "site/assets/img/brand"

# 一覧表のカード配置（IMG_0429.jpeg 709x1106 で計測）
# 番号バッジの上端 y と、右端カードの右端 x、カード幅
ROW_TOPS = [144, 384, 625, 865]
RIGHT_EDGE = 708
CARD_PITCH = 79.4
CARD_WIDTH = 78
# 写真の左上に縦書きの注記があるカード
NOTE_CARDS = {3, 8, 19}


def card_box(no):
    col = (no - 1) // 4  # 右から何列目か（0始まり）
    row = (no - 1) % 4
    right = RIGHT_EDGE - CARD_PITCH * col
    return int(right - CARD_WIDTH), ROW_TOPS[row], int(right)


def is_white(p, th=236):
    return p[0] > th and p[1] > th and p[2] > th


def components(mask, w, h):
    """4近傍でつながった画素のかたまり（面積の大きい順）"""
    seen = bytearray(w * h)
    comps = []
    for p in range(w * h):
        if not mask[p] or seen[p]:
            continue
        stack = [p]
        seen[p] = 1
        pts = []
        while stack:
            q = stack.pop()
            pts.append(q)
            x, y = q % w, q // w
            for n in (q - 1 if x > 0 else -1, q + 1 if x < w - 1 else -1, q - w if y > 0 else -1, q + w if y < h - 1 else -1):
                if n >= 0 and mask[n] and not seen[n]:
                    seen[n] = 1
                    stack.append(n)
        comps.append(pts)
    comps.sort(key=len, reverse=True)
    return comps


def extract_shells():
    """各カードの写真部分を切り出す。

    写真の下にある「レア度」「名前」の文字や、左上の縦書きの注記、右上の番号バッジは
    小さな文字のかたまり・決まった位置として取り除き、貝の写真のかたまりだけを残す。
    """
    im = Image.open(REF / "IMG_0429.jpeg").convert("RGB")
    OUT_SHELLS.mkdir(parents=True, exist_ok=True)
    for no in range(1, 37):
        left, top, right = card_box(no)
        # 画像の左端（x=0〜2）は黒い線なので使わない。下端は「レア度」の文字の手前まで
        box = (max(3, left + 3), top + 2, right - 2, top + 66)
        crop = im.crop(box).copy()
        w, h = crop.size
        px = crop.load()
        # 番号バッジ（右上の紺色の四角）を白にする
        for y in range(0, 19):
            for x in range(w - 20, w):
                px[x, y] = (255, 255, 255)
        # 写真の左に縦書きの注記があるカードは、注記の列を白にする
        strip = 14 if no in NOTE_CARDS else 0
        for y in range(h):
            for x in range(max(0, strip)):
                px[x, y] = (255, 255, 255)
        mask = bytearray(w * h)
        for y in range(h):
            for x in range(w):
                if not is_white(px[x, y], 232):
                    mask[y * w + x] = 1
        comps = components(mask, w, h)
        big = comps[0]
        # 小さなかたまり（文字の切れ端）と、下端の文字の行にだけあるかたまりは除く
        keep = [c for c in comps if len(c) >= max(30, len(big) * 0.05) and min(p // w for p in c) < h - 8]
        keep_set = set(p for c in keep for p in c)
        xs = [p % w for p in keep_set]
        ys = [p // w for p in keep_set]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        # 残したかたまり以外（文字など）は白で塗る
        for y in range(h):
            for x in range(w):
                if (y * w + x) not in keep_set and not is_white(px[x, y], 232):
                    px[x, y] = (255, 255, 255)
        shell = crop.crop((max(0, x0 - 2), max(0, y0 - 2), min(w, x1 + 3), min(h, y1 + 3)))
        # 正方形の白地に中央配置し、3倍に拡大（元画像が小さいため）
        side = max(shell.width, shell.height) + 8
        canvas = Image.new("RGB", (side, side), "white")
        canvas.paste(shell, ((side - shell.width) // 2, (side - shell.height) // 2))
        canvas = canvas.resize((side * 3, side * 3), Image.LANCZOS)
        canvas.save(OUT_SHELLS / f"{no:02d}-sheet.jpg", quality=86)
    print("shells: 36 files")


def extract_brand():
    flyer = Image.open(REF / "IMG_3525.jpeg").convert("RGB")
    OUT_BRAND.mkdir(parents=True, exist_ok=True)
    # ホームの画像：ロゴの楕円が下まで入るように切り出す。
    # 右下の「公式インスタ」のQRは、左右対称の位置の模様を反転して覆う
    w = flyer.width
    x0, x1, y0, y1 = 640, 716, 436, 486
    patch = flyer.crop((w - x1, y0, w - x0, y1)).transpose(Image.FLIP_LEFT_RIGHT)
    g = flyer.copy()
    g.paste(patch, (x0, y0))
    hero = g.crop((30, 22, 715, 486))
    hero.save(OUT_BRAND / "hero.jpg", quality=88)

    # ヘッダーのロゴ：「36 shells」の文字だけを透明な背景で抜き出す（枠で切れないように）
    c = flyer.crop((150, 235, 600, 368))
    c = c.resize((c.width * 3, c.height * 3), Image.LANCZOS)
    px = c.load()
    out = Image.new("RGBA", c.size, (0, 0, 0, 0))
    po = out.load()
    for y in range(12, c.height):  # 上端の数行は「MASUHOGAURA」の文字の端なので使わない
        for x in range(c.width):
            r, g_, b = px[x, y]
            if b < r + 10:  # 青みのない画素（背景・模様）は除く
                continue
            lum = 0.3 * r + 0.59 * g_ + 0.11 * b
            a = max(0.0, min(1.0, (215 - lum) / (215 - 60)))
            if a > 0.04:
                po[x, y] = (38, 44, 116, int(a * 255))
    bb = out.getbbox()
    out = out.crop((max(0, bb[0] - 12), max(0, bb[1] - 12), min(out.width, bb[2] + 12), min(out.height, bb[3] + 12)))
    out = out.resize((round(out.width * 132 / out.height), 132), Image.LANCZOS)
    out.save(OUT_BRAND / "logo-36shells.png", optimize=True)

    # アプリのアイコン：ロゴの楕円と同じ淡い黄色→ピンクの地に「36 shells」
    for size in (192, 512):
        icon = Image.new("RGBA", (size, size))
        ip = icon.load()
        top, bottom = (251, 236, 200), (245, 200, 214)
        for y in range(size):
            t = y / (size - 1)
            col = tuple(round(top[i] * (1 - t) + bottom[i] * t) for i in range(3)) + (255,)
            for x in range(size):
                ip[x, y] = col
        ink = out.copy()
        iw = int(size * 0.8)
        ink = ink.resize((iw, round(ink.height * iw / ink.width)), Image.LANCZOS)
        icon.alpha_composite(ink, ((size - ink.width) // 2, (size - ink.height) // 2))
        icon.convert("RGB").save(OUT_BRAND / f"icon-{size}.png", optimize=True)
    print("brand: hero.jpg, logo-36shells.png, icon-192.png, icon-512.png")


if __name__ == "__main__":
    extract_shells()
    extract_brand()
