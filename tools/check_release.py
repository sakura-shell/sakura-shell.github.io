"""一般公開の前に、確認が終わっていない項目を一覧にするスクリプト。

python3 tools/check_release.py          … 状況を表示する
python3 tools/check_release.py --strict … 一般公開できない項目があれば終了コード1（公開の自動化で使う）

一般公開（config.json の mode: "public"）の条件:
  - 36枠すべての番号・名前・箱の位置が confirmed（原本と照合済み、reviewedBy・reviewedAt あり）
  - チラシのロゴ・イラストの利用許諾が confirmed（未確認なら画面に出ない）
  - 運営・問い合わせ先が confirmed
画面に出す情報は data.js が confirmed だけに絞るため、未確認の任意項目（ふりがな・形など）は
公開の妨げにはならないが、表示されない。
"""
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "site/data"


def reviewed(item):
    return bool(item and item.get("status") == "confirmed" and item.get("reviewedBy") and item.get("reviewedAt"))


def main():
    strict = "--strict" in sys.argv
    data = json.loads((DATA / "shells.json").read_text(encoding="utf-8"))
    cfg = json.loads((DATA / "config.json").read_text(encoding="utf-8"))
    blockers = []
    print(f"版: {cfg.get('appVersion')}  モード: {cfg.get('mode')}  箱の自動読み取り: {cfg.get('features', {}).get('boxScan')}")

    # 必須：番号・名前・箱の位置
    for field in ("name", "box"):
        ng = [s["no"] for s in data["species"] if not reviewed(s[field])]
        label = {"name": "名前", "box": "箱の位置"}[field]
        print(f"{label}: 照合済み {36 - len(ng)} / 36")
        if ng:
            blockers.append(f"{label}が未照合の番号: {ng}")

    # 任意項目の状況（未確認は表示されないだけ）
    for field, label in (("ruby", "ふりがな"), ("sheetName", "一覧表の［ ］内の表記"), ("shape", "形"), ("rarity", "星")):
        c = Counter((s[field] or {}).get("status", "なし") for s in data["species"])
        print(f"{label}: {dict(c)}")
    feats = Counter(f["status"] for s in data["species"] for f in s["features"])
    print(f"見分けるポイント: {dict(feats) or 'なし'}")

    # 写真
    ok_photos = [s["no"] for s in data["species"] if any(reviewed(p.get("mapping")) and (p.get("rights") or {}).get("status") == "confirmed" for p in s["photos"])]
    print(f"一般公開で表示できる写真がある番号: {len(ok_photos)} / 36（それ以外は「写真準備中」）")

    # 素材・運営情報
    if cfg.get("brandAssets", {}).get("status") != "confirmed":
        print("チラシのロゴ・イラスト: 利用許諾が未確認（一般公開では表示しない）")
    for key, label in (("operator", "運営"), ("contact", "問い合わせ先")):
        if cfg.get(key, {}).get("status") != "confirmed":
            blockers.append(f"{label}が未確認（config.json の {key}）")
    if cfg.get("mode") != "public":
        blockers.append('config.json の mode が "public" ではない（確認用プレビュー）')
    if cfg.get("features", {}).get("boxScan") == "public":
        print("注意: 箱の自動読み取りを一般公開にしています。実物試験の記録（README）を確認してください。")

    # 高画質の写真・3Dモデル
    hires = [s["no"] for s in data["species"] if any(p.get("view") != "sheet" for p in s["photos"])]
    print(f"高画質の写真（取り込み済み）: {len(hires)} / 36")
    models = {s["no"]: (s.get("model") or {}).get("status") for s in data["species"] if s.get("model")}
    if models:
        print(f"3Dモデル: {len(models)}件（確認済み {sum(1 for v in models.values() if v == 'confirmed')}件。未確認のものは一般公開では出ない）")

    # AI判定
    ident = cfg.get("features", {}).get("identify", "off")
    clf = ROOT / "site/models/classifier.json"
    ev = json.loads(clf.read_text(encoding="utf-8")).get("evaluation") if clf.exists() else None
    if ev:
        val = ev.get("val")
        box = ev.get("box")
        print("AI判定の成績: " + "、".join(filter(None, [
            f"評価用の写真{val['n']}枚で1位が正解 {val['top1']}%" if val else "評価用の写真なし",
            f"見本の箱{box['n']}枚で1位が正解 {box['top1']}%・5位以内 {box['top5']}%" if box else None,
        ])))
    print(f"AI判定の公開設定: {ident}")
    if ident == "public":
        if not ev or not ev.get("val") or ev["val"]["n"] < 72:
            blockers.append("AI判定を public にするには、学習に使っていない実物の写真（目安：各種類2枚以上・計72枚以上）での評価が必要")
        print("注意: AI判定を一般公開にしています。運営が決めた正解率の基準を満たしているか確認してください。")

    print()
    if blockers:
        print("一般公開の前に必要なこと:")
        for b in blockers:
            print(f"  - {b}")
    else:
        print("一般公開の条件を満たしています。")
    if strict and blockers:
        sys.exit(1)


if __name__ == "__main__":
    main()
