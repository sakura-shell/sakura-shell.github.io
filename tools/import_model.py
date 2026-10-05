"""Scaniverse などのアプリで作った3Dモデルを、サイトに取り込むスクリプト。

python3 tools/import_model.py <番号> <ファイル> [--length-mm 42] [オプション]

例: python3 tools/import_model.py 12 materials/3d/12_scaniverse.glb --length-mm 38

読めるファイル:
  .glb  … いちばんおすすめ（色の画像も1つのファイルに入っている）
  .obj  … 同じフォルダに .mtl と色の画像（.jpg / .png）があること
  .zip  … OBJ 一式を ZIP にしたもの（中を展開して読む）
  （STL・PLY・LAS は色の情報がない／点の集まりなので使えません。FBX は GLB で書き出し直してください）

やること:
- いちばん長い辺を --length-mm（標本の実測の長さ）に合わせる（AR の実物大表示に使う）
- モデルの中心を原点に、いちばん下を高さ0にそろえる
- 色の画像が大きすぎるときは、長辺 --max-texture（既定 2048px）に縮める（通信量を抑えるため）
- site/models/12.glb に保存し、site/data/shells.json に登録、site/sw.js の版を上げる

登録した3Dモデルは、確認用プレビューでは「照合待ち」として表示されます。
実物と見比べて問題なければ --confirmed --by "確認した人"（長さも実測済みなら --size-confirmed）を付けて登録し直します。

オプション:
  --max-texture 2048        色の画像の長辺の上限（px）
  --source "Scaniverse で作成"
  --confirmed --by "確認した人"  3Dモデルを確認済みで登録
  --size-confirmed          --length-mm を標本の実測として確認済みにする
必要なもの：Python 3 と Pillow
"""
import argparse
import io
import json
import shutil
import struct
import tempfile
import zipfile
from pathlib import Path

import importlib.util

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
JSON_CHUNK, BIN_CHUNK = 0x4E4F534A, 0x004E4942


def load_module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / f"tools/{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ---------- GLB の読み書き ----------
def read_glb(path):
    b = Path(path).read_bytes()
    magic, version, length = struct.unpack_from("<III", b, 0)
    if magic != 0x46546C67 or version != 2:
        raise SystemExit("GLB（glTF 2.0 のバイナリ）ではないようです")
    off, gltf, binary = 12, None, b""
    while off < length:
        clen, ctype = struct.unpack_from("<II", b, off)
        chunk = b[off + 8: off + 8 + clen]
        if ctype == JSON_CHUNK:
            gltf = json.loads(chunk)
        elif ctype == BIN_CHUNK:
            binary = chunk
        off += 8 + clen
    return gltf, binary


def pad4(b, fill=b"\x00"):
    return b + fill * ((4 - len(b) % 4) % 4)


def write_glb(path, gltf, binary):
    js = pad4(json.dumps(gltf, separators=(",", ":"), ensure_ascii=False).encode("utf-8"), b" ")
    binary = pad4(binary)
    total = 12 + 8 + len(js) + (8 + len(binary) if binary else 0)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), JSON_CHUNK))
        f.write(js)
        if binary:
            f.write(struct.pack("<II", len(binary), BIN_CHUNK))
            f.write(binary)
    return total


# ---------- 4x4 行列（ノードの位置・回転・大きさ） ----------
def mat_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def node_matrix(node):
    if "matrix" in node:
        m = node["matrix"]  # glTF は列優先
        return [[m[c * 4 + r] for c in range(4)] for r in range(4)]
    tx, ty, tz = node.get("translation", [0, 0, 0])
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    sx, sy, sz = node.get("scale", [1, 1, 1])
    r = [
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ]
    return [
        [r[0][0] * sx, r[0][1] * sy, r[0][2] * sz, tx],
        [r[1][0] * sx, r[1][1] * sy, r[1][2] * sz, ty],
        [r[2][0] * sx, r[2][1] * sy, r[2][2] * sz, tz],
        [0, 0, 0, 1],
    ]


def bounds(gltf):
    """シーン全体の大きさ（各メッシュの POSITION の最小・最大を、ノードの変形を通して集める）"""
    ident = [[1 if i == j else 0 for j in range(4)] for i in range(4)]
    lo, hi = [float("inf")] * 3, [float("-inf")] * 3
    tris = 0

    def visit(idx, parent):
        nonlocal tris
        node = gltf["nodes"][idx]
        m = mat_mul(parent, node_matrix(node))
        if "mesh" in node:
            for prim in gltf["meshes"][node["mesh"]]["primitives"]:
                acc = gltf["accessors"][prim["attributes"]["POSITION"]]
                mn, mx = acc.get("min"), acc.get("max")
                if mn is None or mx is None:
                    continue
                if "indices" in prim:
                    tris += gltf["accessors"][prim["indices"]]["count"] // 3
                else:
                    tris += acc["count"] // 3
                for cx in (mn[0], mx[0]):
                    for cy in (mn[1], mx[1]):
                        for cz in (mn[2], mx[2]):
                            p = [sum(m[r][c] * v for c, v in enumerate((cx, cy, cz, 1))) for r in range(3)]
                            for i in range(3):
                                lo[i] = min(lo[i], p[i])
                                hi[i] = max(hi[i], p[i])
        for ch in node.get("children", []):
            visit(ch, m)

    scene = gltf["scenes"][gltf.get("scene", 0)]
    for n in scene["nodes"]:
        visit(n, ident)
    return lo, hi, tris


def shrink_textures(gltf, binary, max_texture):
    """bufferView に入っている色の画像を縮め、バイナリを組み直す"""
    if not gltf.get("bufferViews"):
        return binary, 0
    if any(v.get("buffer", 0) != 0 for v in gltf["bufferViews"]) or len(gltf.get("buffers", [])) > 1:
        print("注意：外部ファイルを参照する GLB なので、画像の縮小はしません")
        return binary, 0
    replace = {}
    changed = 0
    for img in gltf.get("images", []):
        if "bufferView" not in img:
            continue
        v = gltf["bufferViews"][img["bufferView"]]
        raw = binary[v.get("byteOffset", 0): v.get("byteOffset", 0) + v["byteLength"]]
        try:
            im = Image.open(io.BytesIO(raw))
        except Exception:
            continue
        if max(im.size) <= max_texture and len(raw) <= 1_500_000:
            continue
        im.thumbnail((max_texture, max_texture), Image.LANCZOS)
        buf = io.BytesIO()
        if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
            im.save(buf, "PNG", optimize=True)
            img["mimeType"] = "image/png"
        else:
            im.convert("RGB").save(buf, "JPEG", quality=85, optimize=True)
            img["mimeType"] = "image/jpeg"
        replace[img["bufferView"]] = buf.getvalue()
        changed += 1
    if not replace:
        return binary, 0
    out, off = [], 0
    for i, v in enumerate(gltf["bufferViews"]):
        data = replace.get(i, binary[v.get("byteOffset", 0): v.get("byteOffset", 0) + v["byteLength"]])
        data = pad4(data)
        v["byteOffset"] = off
        v["byteLength"] = len(replace[i]) if i in replace else v["byteLength"]
        out.append(data)
        off += len(data)
    new = b"".join(out)
    gltf["buffers"][0]["byteLength"] = len(new)
    return new, changed


def import_glb(src, out, length_mm, max_texture):
    gltf, binary = read_glb(src)
    used = set(gltf.get("extensionsUsed", []))
    if "KHR_draco_mesh_compression" in used:
        print("注意：Draco 圧縮のモデルです。表示のときに圧縮を戻す部品をインターネットから読み込むため、電波が弱いと開けないことがあります（Scaniverse では圧縮なしで書き出すのがおすすめ）")
    lo, hi, tris = bounds(gltf)
    size = [hi[i] - lo[i] for i in range(3)]
    longest = max(size) or 1.0
    k = (length_mm / 1000.0) / longest if length_mm else 1.0
    cx, cz = (lo[0] + hi[0]) / 2, (lo[2] + hi[2]) / 2
    scene = gltf["scenes"][gltf.get("scene", 0)]
    gltf["nodes"].append({
        "name": "masuhogaura-fit",
        "children": list(scene["nodes"]),
        "scale": [k, k, k],
        "translation": [-cx * k, -lo[1] * k, -cz * k],
    })
    scene["nodes"] = [len(gltf["nodes"]) - 1]
    binary, changed = shrink_textures(gltf, binary, max_texture)
    total = write_glb(out, gltf, binary)
    mm = [round(s * k * 1000, 1) for s in size]
    print(f"{out}: 三角形 {tris}・{round(total / 1024 / 1024, 2)}MB・大きさ {mm[0]}×{mm[1]}×{mm[2]} mm"
          f"{'（実寸に合わせた）' if length_mm else '（元の大きさのまま）'}・縮めた画像 {changed}枚")
    return {"triangles": tris, "bytes": total, "sizeMm": mm}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("no", type=int)
    ap.add_argument("file")
    ap.add_argument("--length-mm", type=float)
    ap.add_argument("--max-texture", type=int, default=2048)
    ap.add_argument("--source", default="Scaniverse で作成")
    ap.add_argument("--confirmed", action="store_true")
    ap.add_argument("--size-confirmed", action="store_true")
    ap.add_argument("--by")
    a = ap.parse_args()
    if not 1 <= a.no <= 36:
        raise SystemExit("番号は 1〜36")
    if (a.confirmed or a.size_confirmed) and not a.by:
        raise SystemExit("確認済みにするときは --by（確認した人）も付けてください")
    src = Path(a.file)
    if not src.exists():
        raise SystemExit(f"{src} がありません")
    suffix = src.suffix.lower()
    if suffix in {".stl", ".ply", ".las", ".laz"}:
        raise SystemExit("STL・PLY・LAS は色の情報がない（または点の集まりの）形式なので使えません。GLB で書き出してください")
    if suffix == ".fbx":
        raise SystemExit("FBX は読めません。Scaniverse で GLB を選んで書き出してください")
    if suffix == ".usdz":
        raise SystemExit("USDZ は iPhone 用の形式で、Web では表示できません。GLB で書き出してください（iPhone の AR は GLB から自動で作られます）")

    out = ROOT / f"site/models/{a.no:02d}.glb"
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = None
    try:
        if suffix == ".zip":
            tmp = Path(tempfile.mkdtemp())
            with zipfile.ZipFile(src) as z:
                z.extractall(tmp)
            glbs = list(tmp.rglob("*.glb"))
            objs = list(tmp.rglob("*.obj"))
            if glbs:
                info = import_glb(glbs[0], out, a.length_mm, a.max_texture)
            elif objs:
                info = load_module("obj2glb").convert(objs[0].parent, out, a.length_mm, a.max_texture)
            else:
                raise SystemExit("ZIP の中に .glb も .obj もありません")
        elif suffix == ".glb":
            info = import_glb(src, out, a.length_mm, a.max_texture)
        elif suffix == ".obj" or src.is_dir():
            info = load_module("obj2glb").convert(src.parent if suffix == ".obj" else src, out, a.length_mm, a.max_texture)
        else:
            raise SystemExit("読めない形式です（.glb・.obj・.zip）")
    finally:
        if tmp:
            shutil.rmtree(tmp, ignore_errors=True)

    if info["bytes"] > 8 * 1024 * 1024:
        print("注意：8MB を超えています。--max-texture 1024 で画像を小さくするか、Scaniverse の書き出しで細かさを下げてください")
    load_module("make_model").register_model(a.no, info, a.source, a.length_mm, a.confirmed, a.size_confirmed, a.by)
    print(f"登録しました：{a.no}番 → {out.relative_to(ROOT)}（確認用プレビューの詳細画面「3Dで見る」で確かめられます）")


if __name__ == "__main__":
    main()
