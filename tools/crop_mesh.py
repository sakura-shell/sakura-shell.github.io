"""3Dモデル（Object Capture の OBJ）から、下に敷いた紙・机（背景）の部分を取り除く。

python3 tools/crop_mesh.py <obj のフォルダ> <出力フォルダ> [--part-length-mm 21] [--hue-range 35] [--min-sat 0.35]

動画や写真から作ると、貝の下の紙や机も一緒に3Dになる。それを色で見分けて取り除く。
- 背景の色は、モデルでいちばん面積の多い色相として自動で求める（明るさの違いは無視）
  （無地で、貝と色味の違う紙の上で撮ると、きれいに分かれる。緑・青の紙が向いている）
- 背景の面を平面とみなし、その平面が水平（貝が上）になるよう向きを直す
- 紙より下に垂れ下がった面（紙のめくれ）、縁ににじんだ背景色を削る
- 小さな破片は捨て、大きいかたまり（貝）だけを残す
- スキャンで抜けた小さな穴をふさぐ
- 輪郭のギザギザと面の凸凹をならし、テクスチャを貝の部分だけに切り詰める（細かく見せる）
- --part-length-mm：殻の片方の長さが、その mm になるよう大きさを直す
  （2枚の殻が開いた形で蝶番がつながっていても、位置で2つに分けて測る。1個の貝なら --parts 1）
出力は同じ形式の OBJ（単位はメートル）。続けて tools/obj2glb.py で .glb にする。
必要なもの：Python 3 と Pillow
"""
import argparse
import colorsys
import math
import shutil
from pathlib import Path

from PIL import Image


def load(folder):
    objs = sorted(Path(folder).glob("*.obj"))
    if not objs:
        raise SystemExit(f"{folder} に .obj がありません")
    lines = objs[0].read_text(encoding="utf-8", errors="ignore").splitlines()
    v, vt, vn, faces, mtllib = [], [], [], [], None
    for line in lines:
        p = line.split()
        if not p:
            continue
        if p[0] == "v":
            v.append([float(x) for x in p[1:4]])
        elif p[0] == "vt":
            vt.append((float(p[1]), float(p[2])))
        elif p[0] == "vn":
            vn.append([float(x) for x in p[1:4]])
        elif p[0] == "f":
            idx = [tuple(int(x) if x else 0 for x in (q.split("/") + ["", ""])[:3]) for q in p[1:]]
            for i in range(1, len(idx) - 1):
                faces.append((idx[0], idx[i], idx[i + 1]))
        elif p[0] == "mtllib":
            mtllib = " ".join(p[1:])
    return objs[0], v, vt, vn, faces, mtllib


def texture_path(folder, mtllib):
    if mtllib and (Path(folder) / mtllib).exists():
        for line in (Path(folder) / mtllib).read_text(errors="ignore").splitlines():
            p = line.split()
            if p and p[0] == "map_Kd":
                return Path(folder) / " ".join(p[1:])
    found = sorted(Path(folder).glob("*tex0*.png")) or sorted(Path(folder).glob("*.png"))
    return found[0] if found else None


def hue_sat(rgb):
    h, light, sat = colorsys.rgb_to_hls(*(c / 255 for c in rgb))
    return h * 360, sat, light


def sub(a, b):
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]


def cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def norm(a):
    ln = math.sqrt(dot(a, a)) or 1.0
    return [a[0] / ln, a[1] / ln, a[2] / ln]


def plane_normal(points, weights):
    """重み付きの点の集まりに当てはまる平面の法線（共分散のいちばん小さい固有ベクトル）"""
    W = sum(weights) or 1.0
    c = [sum(p[i] * w for p, w in zip(points, weights)) / W for i in range(3)]
    C = [[0.0] * 3 for _ in range(3)]
    for p, w in zip(points, weights):
        d = sub(p, c)
        for i in range(3):
            for j in range(3):
                C[i][j] += w * d[i] * d[j]
    # いちばん大きい固有値を求め、(λmax・I − C) のべき乗法で最小の固有ベクトルを得る
    x = [1.0, 0.7, 0.3]
    for _ in range(60):
        x = norm([dot(C[i], x) for i in range(3)])
    lmax = dot(x, [dot(C[i], x) for i in range(3)])
    M = [[(lmax if i == j else 0.0) - C[i][j] for j in range(3)] for i in range(3)]
    y = [0.3, 1.0, 0.5]
    for _ in range(200):
        y = norm([dot(M[i], y) for i in range(3)])
    return y, c


def rotation_to_y(n):
    """ベクトル n を +Y に向ける回転行列"""
    up = [0.0, 1.0, 0.0]
    axis = cross(n, up)
    s = math.sqrt(dot(axis, axis))
    c = dot(n, up)
    if s < 1e-9:
        return [[1, 0, 0], [0, 1, 0], [0, 0, 1]] if c > 0 else [[1, 0, 0], [0, -1, 0], [0, 0, -1]]
    k = [a / s for a in axis]
    K = [[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]]
    K2 = [[sum(K[i][m] * K[m][j] for m in range(3)) for j in range(3)] for i in range(3)]
    return [[(1 if i == j else 0) + s * K[i][j] + (1 - c) * K2[i][j] for j in range(3)] for i in range(3)]


def apply(R, p):
    return [dot(R[0], p), dot(R[1], p), dot(R[2], p)]


def longest_extent(points):
    best = 0.0
    for i in range(24):
        th = math.pi * i / 24
        for j in range(12):
            ph = math.pi * (j + 0.5) / 12
            d = [math.sin(ph) * math.cos(th), math.cos(ph), math.sin(ph) * math.sin(th)]
            pr = [dot(p, d) for p in points]
            best = max(best, max(pr) - min(pr))
    return best


def split_parts(points, k):
    """2枚の殻が蝶番でつながっているとき、水平面上の位置で k 個に分ける（k-means）"""
    pts = sorted(points, key=lambda p: (p[0], p[2]))
    step = max(1, len(pts) // 4000)
    pts = pts[::step]
    # 初期値：いちばん離れた点どうし
    cents = [pts[0]]
    while len(cents) < k:
        cents.append(max(pts, key=lambda p: min((p[0] - c[0]) ** 2 + (p[2] - c[2]) ** 2 for c in cents)))
    for _ in range(20):
        groups = [[] for _ in cents]
        for p in pts:
            i = min(range(len(cents)), key=lambda j: (p[0] - cents[j][0]) ** 2 + (p[2] - cents[j][2]) ** 2)
            groups[i].append(p)
        cents = [[sum(q[i] for q in g) / len(g) for i in range(3)] if g else c for g, c in zip(groups, cents)]
    return [g for g in groups if g]


def fill_holes(V, F, kept_faces, max_ratio):
    """スキャンで抜けた小さな穴を、まわりの色でふさぐ（いちばん長い外周より十分短い輪だけ）"""
    count = {}
    for f in kept_faces:
        vs = [t[0] for t in F[f]]
        for i in range(3):
            e = tuple(sorted((vs[i], vs[(i + 1) % 3])))
            count[e] = count.get(e, 0) + 1
    corner = {}
    nxt = {}
    for f in kept_faces:
        tri = F[f]
        for i in range(3):
            corner.setdefault(tri[i][0], tri[i])
            a_, b_ = tri[i][0], tri[(i + 1) % 3][0]
            if count[tuple(sorted((a_, b_)))] == 1:
                nxt.setdefault(a_, []).append(b_)
    loops, seen = [], set()
    for start in list(nxt):
        while nxt.get(start):
            loop, cur = [start], nxt[start].pop()
            while cur != start and cur in nxt and nxt[cur] and len(loop) < 100000:
                loop.append(cur)
                cur = nxt[cur].pop()
            if cur == start and len(loop) >= 3:
                loops.append(loop)
    if len(loops) < 2:
        return 0
    longest = max(len(l) for l in loops)
    filled = 0
    for loop in loops:
        if len(loop) == longest or len(loop) > longest * max_ratio:
            continue
        cen = [sum(V[v - 1][i] for v in loop) / len(loop) for i in range(3)]
        V.append(cen)
        c_idx = len(V)
        base = corner[loop[0]]
        for i in range(len(loop)):
            a_, b_ = loop[i], loop[(i + 1) % len(loop)]
            # 穴のまわりと同じ色（1点の色）で塗る。テクスチャの継ぎ目をまたがないように
            F.append(((b_, base[1], corner[b_][2]), (a_, base[1], corner[a_][2]), (c_idx, base[1], base[2])))
            kept_faces.append(len(F) - 1)
        filled += 1
    return filled


def smooth_mesh(V, F, faces, iters, edge_iters):
    """形をなめらかにする（Taubin 法：縮まずに凸凹だけを減らす）。
    縁（切り取った輪郭）は、縁に沿った隣どうしだけでならし、ギザギザをなくす"""
    nb, cnt = {}, {}
    for f in faces:
        vs = [t[0] for t in F[f]]
        for i in range(3):
            a_, b_ = vs[i], vs[(i + 1) % 3]
            nb.setdefault(a_, set()).add(b_)
            nb.setdefault(b_, set()).add(a_)
            e = (min(a_, b_), max(a_, b_))
            cnt[e] = cnt.get(e, 0) + 1
    bnb = {}
    for (a_, b_), c in cnt.items():
        if c == 1:
            bnb.setdefault(a_, set()).add(b_)
            bnb.setdefault(b_, set()).add(a_)

    def step(verts, nbrs, lam):
        moved = {}
        for v in verts:
            ns = nbrs[v]
            avg = [sum(V[n - 1][i] for n in ns) / len(ns) for i in range(3)]
            p = V[v - 1]
            moved[v] = [p[i] + lam * (avg[i] - p[i]) for i in range(3)]
        for v, p in moved.items():
            V[v - 1] = p

    inner = [v for v in nb if v not in bnb]
    for _ in range(iters):
        step(inner, nb, 0.5)
        step(inner, nb, -0.53)
    edge = [v for v, ns in bnb.items() if len(ns) == 2]
    for _ in range(edge_iters):
        step(edge, bnb, 0.6)
        step(edge, bnb, -0.62)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder")
    ap.add_argument("out")
    ap.add_argument("--hue-range", type=float, default=35, help="背景の色相から、この角度（度）以内を背景とみなす")
    ap.add_argument("--min-sat", type=float, default=0.35, help="この彩度より淡い色は、背景の色相でも貝として残す（白い貝・テカリ）")
    ap.add_argument("--part-length-mm", type=float)
    ap.add_argument("--rim", type=int, default=6, help="縁のにじみを削る回数")
    ap.add_argument("--rim-sat", type=float, default=0.22, help="縁で、この彩度以上の背景の色相の面を削る")
    ap.add_argument("--dark", type=float, default=0.45, help="この明るさより暗い背景色の面は、淡くても背景とみなす")
    ap.add_argument("--below", type=float, default=0.12, help="紙の面よりこの割合（貝の大きさに対し）以上下にある面を捨てる")
    ap.add_argument("--fill-holes", type=float, default=0.35, help="外周の長さに対し、この割合より短い穴の輪をふさぐ（0 でふさがない）")
    ap.add_argument("--smooth", type=int, default=8, help="面の凸凹をならす回数（0 でしない）")
    ap.add_argument("--smooth-edge", type=int, default=25, help="輪郭のギザギザをならす回数（0 でしない）")
    ap.add_argument("--parts", type=int, default=2, help="--part-length-mm で測るとき、つながったかたまりを何個に分けるか（二枚貝が開いた形なら 2、1個の貝なら 1）")
    ap.add_argument("--min-part", type=float, default=0.15, help="いちばん大きいかたまりに対し、この割合より小さい破片は捨てる")
    a = ap.parse_args()

    obj_path, V, VT, VN, F, mtllib = load(a.folder)
    tex = texture_path(a.folder, mtllib)
    if not tex:
        raise SystemExit("色の画像（テクスチャ）が見つかりません")
    img = Image.open(tex).convert("RGB")
    img.thumbnail((1024, 1024))
    W, H = img.size
    px = img.load()

    def sample(uv):
        u, v = uv
        x = min(W - 1, max(0, int(u * (W - 1))))
        y = min(H - 1, max(0, int((1 - v) * (H - 1))))
        return px[x, y]

    # 面ごとの色味・面積・中心
    info = []
    for tri in F:
        ps = [V[t[0] - 1] for t in tri]
        area = 0.5 * math.sqrt(dot(c := cross(sub(ps[1], ps[0]), sub(ps[2], ps[0])), c))
        uvs = [VT[t[1] - 1] for t in tri if t[1]]
        if uvs:
            cu = (sum(u for u, _ in uvs) / len(uvs), sum(v for _, v in uvs) / len(uvs))
            cols = [sample(uv) for uv in uvs + [cu]]
            rgb = [sum(c[i] for c in cols) / len(cols) for i in range(3)]
        else:
            rgb = [128, 128, 128]
        cen = [sum(p[i] for p in ps) / 3 for i in range(3)]
        info.append((hue_sat(rgb), area, cen, c))  # c：面の向き×面積（カメラ側を向く）

    # 背景の色味：面積で重み付けした中央値（背景がいちばん広い前提）
    def wmedian(vals):
        vals = sorted(vals)
        tot = sum(w for _, w in vals) / 2
        acc = 0.0
        for x, w in vals:
            acc += w
            if acc >= tot:
                return x
        return vals[-1][0]

    # 明るさの違い（影・光）に左右されないよう、色相と彩度で見分ける
    bg_hue = wmedian([(hs[0], ar) for hs, ar, *_ in info])
    bg_sat = wmedian([(hs[1], ar) for hs, ar, *_ in info])

    def is_bg(hs):
        dh = abs((hs[0] - bg_hue + 180) % 360 - 180)
        if dh > a.hue_range:
            return False
        # 影になった紙（暗い背景色）は彩度が低く見えるので、暗いときは淡くても背景とみなす
        return hs[1] >= a.min_sat or (hs[2] < a.dark and hs[1] >= 0.10)

    keep = [not is_bg(hs) for hs, *_ in info]

    # 背景の面から平面を求める（あとで水平に置き直す。貝が上）
    bgi = [i for i, k in enumerate(keep) if not k]
    n = None
    if len(bgi) > 50:
        n, c0 = plane_normal([info[i][2] for i in bgi], [info[i][1] for i in bgi])
        # 上向き：撮影したカメラは紙の上側にあるので、紙の面はカメラ側（上）を向いている
        up = [sum(info[i][3][k] for i in bgi) for k in range(3)]
        if dot(up, n) < 0:
            n = [-x for x in n]

    # 隣り合う面（辺を共有）で、穴埋めと小さなノイズの除去
    edge_faces = {}
    for fi, tri in enumerate(F):
        vs = [t[0] for t in tri]
        for i in range(3):
            e = tuple(sorted((vs[i], vs[(i + 1) % 3])))
            edge_faces.setdefault(e, []).append(fi)
    nbr = [[] for _ in F]
    for fs in edge_faces.values():
        for f1 in fs:
            for f2 in fs:
                if f1 != f2:
                    nbr[f1].append(f2)
    for _ in range(3):  # 周りが貝なら貝に（テカリで背景色に見えた所を戻す）
        keep = [k or (len(nb) >= 2 and sum(keep[n] for n in nb) >= 2) for k, nb in zip(keep, nbr)]
    for _ in range(1):  # 周りが背景なら背景に（細い筋を消す）
        keep = [k and sum(keep[n] for n in nb) >= 1 for k, nb in zip(keep, nbr)]
    # 縁に残った、背景の色がにじんだ面を削る（縁だけなので、貝の内側のテカリは残る）
    def tinted(hs):
        dh = abs((hs[0] - bg_hue + 180) % 360 - 180)
        return dh <= a.hue_range and hs[1] >= a.rim_sat
    for _ in range(a.rim):  # 縁から少しずつ削る
        edge = [k and (len(nb) < 3 or any(not keep[n] for n in nb)) for k, nb in zip(keep, nbr)]
        nxt = [k and not (e and tinted(info[i][0])) for i, (k, e) in enumerate(zip(keep, edge))]
        if nxt == keep:
            break
        keep = nxt

    # 紙より下にあるもの（紙のめくれ・影）は貝ではない
    if n is not None:
        ref = math.sqrt(sum(info[i][1] for i, k in enumerate(keep) if k) or 1e-12)
        tol = a.below * ref
        keep = [k and dot(sub(info[i][2], c0), n) > -tol for i, k in enumerate(keep)]
    R = rotation_to_y(n) if n is not None else [[1, 0, 0], [0, 1, 0], [0, 0, 1]]

    # かたまりに分け、大きいものだけ残す
    comp = [-1] * len(F)
    comps = []
    for s in range(len(F)):
        if not keep[s] or comp[s] >= 0:
            continue
        stack, members = [s], []
        comp[s] = len(comps)
        while stack:
            f = stack.pop()
            members.append(f)
            for n in nbr[f]:
                if keep[n] and comp[n] < 0:
                    comp[n] = len(comps)
                    stack.append(n)
        comps.append(members)
    if not comps:
        raise SystemExit("貝の部分が見つかりませんでした（--min-sat を大きく、--hue-range を小さくしてみてください）")
    areas = [sum(info[f][1] for f in m) for m in comps]
    order = sorted(range(len(comps)), key=lambda i: -areas[i])
    big = areas[order[0]]
    kept_comps = [i for i in order if areas[i] >= big * a.min_part]
    kept_faces = sorted(f for i in kept_comps for f in comps[i])


    if a.fill_holes:
        filled = fill_holes(V, F, kept_faces, a.fill_holes)
        if filled:
            print(f"穴をふさいだ：{filled} か所")
    if a.smooth or a.smooth_edge:
        smooth_mesh(V, F, kept_faces, a.smooth, a.smooth_edge)
    used_v = sorted({t[0] for f in kept_faces for t in F[f]})
    newV = {vi: apply(R, V[vi - 1]) for vi in used_v}

    # 法線を形から計算し直す（なめらかにした形に合わせる）。向きは元の法線（カメラ側）にそろえる
    acc = {vi: [0.0, 0.0, 0.0] for vi in used_v}
    old = {}
    for f in kept_faces:
        tri = F[f]
        ps = [V[t[0] - 1] for t in tri]
        c = cross(sub(ps[1], ps[0]), sub(ps[2], ps[0]))
        for t in tri:
            av = acc[t[0]]
            av[0] += c[0]; av[1] += c[1]; av[2] += c[2]
            if t[2] and t[0] not in old:
                old[t[0]] = VN[t[2] - 1]
    newN = {}
    for vi in used_v:
        n_ = norm(acc[vi])
        if vi in old and dot(n_, old[vi]) < 0:
            n_ = [-x for x in n_]
        newN[vi] = apply(R, n_)

    scale = 1.0
    if a.part_length_mm:
        main_pts = [newV[t[0]] for f in comps[order[0]] for t in F[f] if t[0] in newV]
        groups = split_parts(main_pts, a.parts) if a.parts > 1 else [main_pts]
        ext = max(longest_extent(g) for g in groups)
        scale = (a.part_length_mm / 1000.0) / ext if ext else 1.0

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    # テクスチャは、貝の部分だけを切り出す（紙の部分に使っていた画素を貝に回し、細かく見せる）
    used_t = sorted({t[1] for f in kept_faces for t in F[f] if t[1]})
    us = [VT[ti - 1][0] for ti in used_t]
    vs_ = [VT[ti - 1][1] for ti in used_t]
    full = Image.open(tex).convert("RGB")
    TW, TH = full.size
    pad = 8 / max(TW, TH)
    u0, u1 = max(0.0, min(us) - pad), min(1.0, max(us) + pad)
    v0, v1 = max(0.0, min(vs_) - pad), min(1.0, max(vs_) + pad)
    box = (int(u0 * TW), int((1 - v1) * TH), int(math.ceil(u1 * TW)), int(math.ceil((1 - v0) * TH)))
    u0, u1 = box[0] / TW, box[2] / TW
    v1, v0 = 1 - box[1] / TH, 1 - box[3] / TH
    tex_name = tex.stem + ".png"
    full.crop(box).save(out / tex_name)
    (out / (mtllib or "model.mtl")).write_text(f"newmtl g0\nmap_Kd {tex_name}\n")
    print(f"テクスチャ：{TW}×{TH} から貝の部分 {box[2] - box[0]}×{box[3] - box[1]} を切り出し")

    vid = {vi: i + 1 for i, vi in enumerate(used_v)}
    tid = {ti: i + 1 for i, ti in enumerate(used_t)}
    with (out / obj_path.name).open("w") as fo:
        fo.write(f"mtllib {mtllib or 'model.mtl'}\n")
        for vi in used_v:
            x, y, z = (c * scale for c in newV[vi])
            fo.write(f"v {x:.6f} {y:.6f} {z:.6f}\n")
        for ti in used_t:
            u, v = VT[ti - 1]
            fo.write(f"vt {(u - u0) / (u1 - u0):.6f} {(v - v0) / (v1 - v0):.6f}\n")
        for vi in used_v:
            fo.write("vn {:.5f} {:.5f} {:.5f}\n".format(*newN[vi]))
        fo.write("usemtl g0\n")
        for f in kept_faces:
            fo.write("f " + " ".join(f"{vid[t[0]]}/{tid.get(t[1], '')}/{vid[t[0]]}" for t in F[f]) + "\n")

    pts = [newV[vi] for vi in used_v]
    size = [round((max(p[i] for p in pts) - min(p[i] for p in pts)) * scale * 1000, 1) for i in range(3)]
    print(f"背景の色相 {bg_hue:.0f}°・彩度 {bg_sat:.2f}／面 {len(F)} → {len(kept_faces)}（かたまり {len(kept_comps)} 個を残す）")
    print(f"大きさ {size[0]} × {size[1]} × {size[2]} {'mm' if a.part_length_mm else '（元の単位×1000）'} → {out}")


if __name__ == "__main__":
    main()
