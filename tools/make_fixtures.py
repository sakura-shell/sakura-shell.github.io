"""箱の読み取りテスト用の画像を作るスクリプト（開発用）。

python3 tools/make_fixtures.py

- tools/fixtures/flyer_box.jpg        チラシ掲載の箱写真（36マスすべて貝あり）
- tools/fixtures/flyer_box_empty.jpg  上の写真の一部のマスを箱の底の色で塗りつぶした合成画像
  （空のマスの見え方を再現する簡易テスト。実物の空の箱の写真でも必ず確認すること）
"""
import colorsys
import json
import random
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tools/fixtures"

# 合成で「空」にする番号
EMPTY_NOS = [2, 7, 12, 13, 18, 20, 25, 29, 31, 36]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    flyer = Image.open(ROOT / "references/IMG_3525.jpeg").convert("RGB")
    crop = flyer.crop((30, 822, 290, 1008))
    big = crop.resize((crop.width * 3, crop.height * 3), Image.LANCZOS)
    big.save(OUT / "flyer_box.jpg", quality=90)

    # 箱の外枠（3倍画像上で目視計測）
    bx0, by0, bx1, by1 = 42, 56, 664, 520
    wall_x, wall_y = 11, 12
    cols, rows = 9, 4
    cw = (bx1 - bx0 - wall_x * 2) / cols
    ch = (by1 - by0 - wall_y * 2) / rows
    img = big.copy()
    px = img.load()
    rnd = random.Random(1)
    # 箱の底の色: 箱の範囲内の水色の画素の中央値
    blues = []
    for y in range(by0, by1, 3):
        for x in range(bx0, bx1, 3):
            r, g, b = px[x, y]
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if 0.5 < h < 0.6 and s > 0.3:
                blues.append((r, g, b))
    floor = tuple(sorted(c[i] for c in blues)[len(blues) // 2] for i in range(3))
    for no in EMPTY_NOS:
        col = 9 - (no - 1) // 4
        row = (no - 1) % 4 + 1
        x0 = int(bx0 + wall_x + (col - 1) * cw + 5)
        x1 = int(bx0 + wall_x + col * cw - 5)
        y0 = int(by0 + wall_y + (row - 1) * ch + 6)
        y1 = int(by0 + wall_y + row * ch - 8)
        base = floor
        for y in range(y0, y1):
            for x in range(x0, x1):
                n = rnd.randint(-6, 6)
                px[x, y] = tuple(max(0, min(255, c + n)) for c in base)
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    img.save(OUT / "flyer_box_empty.jpg", quality=90)
    (OUT / "flyer_box_empty.json").write_text(json.dumps({"empty": EMPTY_NOS}), encoding="utf-8")
    print("fixtures written")


if __name__ == "__main__":
    main()
