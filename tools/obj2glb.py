"""OBJ（Object Capture の出力）を、Web で表示できる glTF バイナリ（.glb）に変換する。

python3 tools/obj2glb.py <obj のフォルダ> <出力.glb> [--length-mm 42] [--max-texture 2048] [--double-sided] [--style sakura]

- --length-mm を付けると、モデルのいちばん長い辺がその長さ（mm）になるよう大きさを直す
  （AR の実物大表示に使う。標本を実測した長さを入れる）
- テクスチャ（色の画像）は JPEG にして、長辺を --max-texture 以下に縮める（通信量を抑えるため）
- モデルの中心を原点に、いちばん下を高さ0にそろえる
- --style sakura：写真の色を、さくら貝らしい桜色のグラデーションに塗り直し、つや・真珠の光沢を付ける
  （実物の色そのものではない。加工したことは shells.json の model.style に記録する）
必要なもの：Python 3 と Pillow
"""
import argparse
import io
import json
import math
import struct
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps

# 見た目の加工（--style）。写真の色を、その貝らしい色に置き換える（イラスト寄りの表現）
# 明るさ（成長線・影の情報）は残し、色だけをグラデーションで塗り直す。背景の色のにじみも消える
STYLES = {
    "sakura": {
        "label": "さくら貝の色に加工",
        "dark": "#d27894",    # 影・溝・蝶番のまわり
        "mid": "#f2aec0",     # 本体の桜色
        "light": "#fde6ec",   # 光の当たる所（白くしすぎず、淡い桜色）
        # 貝の部分の明るさ（写真ではおよそ 150〜235）を、この範囲でグラデーションに対応させる
        "points": (140, 200, 242),
        "material": {"roughness": 0.3, "clearcoat": 0.7, "iridescence": 0.45},
    },
}


def stylize(img, style):
    """テクスチャの色を、明るさ（成長線・影）を保ったまま style の色で塗り直す"""
    st = STYLES[style]
    gray = ImageOps.grayscale(img)
    # 細かなざらつき（写真のノイズ）を消してから、成長線などの輪郭をくっきりさせる
    gray = gray.filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.UnsharpMask(radius=2, percent=90, threshold=2))
    lo, mid, hi = st["points"]
    return ImageOps.colorize(gray, black=st["dark"], mid=st["mid"], white=st["light"],
                             blackpoint=lo, midpoint=mid, whitepoint=hi)


def parse_obj(obj_path):
    positions, uvs, normals = [], [], []
    faces = []  # [(v, vt, vn) x 3]
    mtllib = None
    for line in obj_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        tag = parts[0]
        if tag == "v":
            positions.append(tuple(float(x) for x in parts[1:4]))
        elif tag == "vt":
            uvs.append((float(parts[1]), float(parts[2])))
        elif tag == "vn":
            normals.append(tuple(float(x) for x in parts[1:4]))
        elif tag == "f":
            idx = []
            for p in parts[1:]:
                a = (p.split("/") + ["", ""])[:3]
                idx.append(tuple(int(x) if x else 0 for x in a))
            for i in range(1, len(idx) - 1):  # 多角形は三角形に分ける
                faces.append((idx[0], idx[i], idx[i + 1]))
        elif tag == "mtllib":
            mtllib = " ".join(parts[1:])
    return positions, uvs, normals, faces, mtllib


def find_texture(folder, mtllib):
    if mtllib and (folder / mtllib).exists():
        for line in (folder / mtllib).read_text(encoding="utf-8", errors="ignore").splitlines():
            parts = line.split()
            if parts and parts[0] == "map_Kd":
                tex = folder / " ".join(parts[1:])
                if tex.exists():
                    return tex
    for pat in ("*diffuse*.png", "*diffuse*.jpg", "*.png", "*.jpg"):
        found = sorted(folder.glob(pat))
        if found:
            return found[0]
    return None


def pad4(b, fill=b"\x00"):
    return b + fill * ((4 - len(b) % 4) % 4)


def convert(folder, out, length_mm=None, max_texture=2048, double_sided=False, style=None):
    folder = Path(folder)
    objs = sorted(folder.glob("*.obj"))
    if not objs:
        raise SystemExit(f"{folder} に .obj がありません")
    positions, uvs, normals, faces, mtllib = parse_obj(objs[0])
    if not faces:
        raise SystemExit("面がありません")

    # 同じ (位置, UV, 法線) の組をまとめて頂点を作る
    vmap, pos_out, uv_out, nrm_out, indices = {}, [], [], [], []
    for tri in faces:
        for key in tri:
            if key not in vmap:
                vmap[key] = len(pos_out)
                v, vt, vn = key
                pos_out.append(positions[v - 1])
                uv_out.append(uvs[vt - 1] if vt else (0.0, 0.0))
                nrm_out.append(normals[vn - 1] if vn else (0.0, 1.0, 0.0))
            indices.append(vmap[key])

    # 大きさ・位置をそろえる
    xs, ys, zs = zip(*pos_out)
    mn = (min(xs), min(ys), min(zs))
    mx = (max(xs), max(ys), max(zs))
    longest = max(mx[i] - mn[i] for i in range(3)) or 1.0
    scale = (length_mm / 1000.0) / longest if length_mm else 1.0
    cx, cz = (mn[0] + mx[0]) / 2, (mn[2] + mx[2]) / 2
    pos_out = [((x - cx) * scale, (y - mn[1]) * scale, (z - cz) * scale) for x, y, z in pos_out]
    xs, ys, zs = zip(*pos_out)
    pmin, pmax = [min(xs), min(ys), min(zs)], [max(xs), max(ys), max(zs)]
    fixed_normals = []
    for n in nrm_out:
        ln = math.sqrt(sum(c * c for c in n)) or 1.0
        fixed_normals.append(tuple(c / ln for c in n))

    pos_b = b"".join(struct.pack("<3f", *p) for p in pos_out)
    nrm_b = b"".join(struct.pack("<3f", *n) for n in fixed_normals)
    uv_b = b"".join(struct.pack("<2f", u, 1.0 - v) for u, v in uv_out)  # glTF は上下が逆
    idx_b = b"".join(struct.pack("<I", i) for i in indices)

    tex_path = find_texture(folder, mtllib)
    img_b = b""
    if tex_path:
        img = Image.open(tex_path).convert("RGB")
        img.thumbnail((max_texture, max_texture), Image.LANCZOS)
        if style:
            img = stylize(img, style)
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=85)
        img_b = buf.getvalue()

    chunks, views = [], []
    offset = 0
    for data, target in ((pos_b, 34962), (nrm_b, 34962), (uv_b, 34962), (idx_b, 34963), (img_b, None)):
        if not data:
            continue
        data = pad4(data)
        view = {"buffer": 0, "byteOffset": offset, "byteLength": len(data)}
        if target:
            view["target"] = target
        views.append(view)
        chunks.append(data)
        offset += len(data)
    binary = b"".join(chunks)
    n_vert = len(pos_out)
    gltf = {
        "asset": {"version": "2.0", "generator": "masuhogaura-36shells obj2glb"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2}, "indices": 3, "material": 0}]}],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": n_vert, "type": "VEC3", "min": pmin, "max": pmax},
            {"bufferView": 1, "componentType": 5126, "count": n_vert, "type": "VEC3"},
            {"bufferView": 2, "componentType": 5126, "count": n_vert, "type": "VEC2"},
            {"bufferView": 3, "componentType": 5125, "count": len(indices), "type": "SCALAR"},
        ],
        "bufferViews": views,
        "buffers": [{"byteLength": len(binary)}],
        "materials": [{"pbrMetallicRoughness": {"metallicFactor": 0.0, "roughnessFactor": 0.7}, "doubleSided": bool(double_sided)}],
    }
    if style and STYLES[style].get("material"):
        m = STYLES[style]["material"]
        mat = gltf["materials"][0]
        mat["pbrMetallicRoughness"]["roughnessFactor"] = m["roughness"]
        ext = {}
        if m.get("clearcoat"):  # 表面のつや
            ext["KHR_materials_clearcoat"] = {"clearcoatFactor": m["clearcoat"], "clearcoatRoughnessFactor": 0.15}
        if m.get("iridescence"):  # 真珠層の虹色の光沢
            ext["KHR_materials_iridescence"] = {"iridescenceFactor": m["iridescence"], "iridescenceIor": 1.3,
                                                "iridescenceThicknessMinimum": 200, "iridescenceThicknessMaximum": 500}
        if ext:
            mat["extensions"] = ext
            gltf["extensionsUsed"] = sorted(ext)
    if img_b:
        gltf["images"] = [{"bufferView": 4, "mimeType": "image/jpeg"}]
        gltf["textures"] = [{"source": 0}]
        gltf["materials"][0]["pbrMetallicRoughness"]["baseColorTexture"] = {"index": 0}
    js = pad4(json.dumps(gltf, separators=(",", ":")).encode(), b" ")
    total = 12 + 8 + len(js) + 8 + len(binary)
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A))
        f.write(js)
        f.write(struct.pack("<II", len(binary), 0x004E4942))
        f.write(binary)
    size = [round((pmax[i] - pmin[i]) * 1000, 1) for i in range(3)]
    print(f"{out}: 頂点 {n_vert}・三角形 {len(indices) // 3}・{round(total / 1024 / 1024, 2)}MB・大きさ {size[0]}×{size[1]}×{size[2]} mm{'（実寸に合わせた）' if length_mm else '（元の単位のまま）'}")
    return {"vertices": n_vert, "triangles": len(indices) // 3, "bytes": total, "sizeMm": size}


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder")
    ap.add_argument("out")
    ap.add_argument("--length-mm", type=float)
    ap.add_argument("--max-texture", type=int, default=2048)
    ap.add_argument("--double-sided", action="store_true", help="面の裏側も描く（片面だけのモデル用）")
    ap.add_argument("--style", choices=sorted(STYLES), help="色・質感を加工する（例: sakura）")
    a = ap.parse_args()
    convert(a.folder, a.out, a.length_mm, a.max_texture, a.double_sided, a.style)
