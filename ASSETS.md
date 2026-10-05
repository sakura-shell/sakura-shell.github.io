# 素材台帳（出典と利用条件）

素材を追加・差し替えたら、この表と `site/data/shells.json`（写真の `rights`）、`site/data/config.json`（`brandAssets`）を合わせて更新してください。

| 素材 | ファイル | 使っている場所 | 出典 | 撮影者／権利者 | 許諾の範囲（Web掲載・加工・アイコン） | 確認日 | クレジット |
| --- | --- | --- | --- | --- | --- | --- | --- |
| チラシ（原本） | `references/IMG_3525.jpeg` | 切り出し元のみ（公開しない） | MASUHOGAURA 36 shells Collection チラシ | **要確認** | **要確認** | ― | ― |
| ホームのロゴ画像 | `site/assets/img/brand/hero.jpg` | ホーム | チラシ上部を切り出し（右下のQRコードは左右対称の模様を反転して覆った） | **要確認** | **要確認**（加工を含む） | ― | ― |
| ヘッダーのロゴ文字 | `site/assets/img/brand/logo-36shells.png` | 各画面の上部・アプリのアイコン | チラシのロゴ「36 shells」の文字を抜き出し | **要確認** | **要確認**（加工・アイコン利用） | ― | ― |
| アプリのアイコン | `site/assets/img/brand/icon-192.png`・`icon-512.png` | ホーム画面に追加したときのアイコン | ロゴ文字を淡いグラデーションの地に配置 | **要確認** | **要確認**（アイコン利用） | ― | ― |
| 36種類一覧（原本） | `references/IMG_0429.jpeg` | 切り出し元・データの転記元（公開しない） | 36種類一覧の資料 | **要確認** | **要確認** | ― | ― |
| 貝の参考写真 36点 | `site/assets/img/shells/01-sheet.jpg`〜`36-sheet.jpg` | 表示には使わない（AI判定の学習のみ。2026-10-05〜） | 36種類一覧から切り出し | **要確認** | **要確認** | ― | ― |
| 貝の撮影写真 125点 | `site/assets/img/shells/NN-pK.jpg`（・`-s.jpg`）、`training/photos/NN/ref-K/` | 一覧・詳細・比較、AI判定の学習 | 志賀町の撮影写真（外付けHD「貝写真/編集後」）。貝のまわりを自動で切り出し | 撮影：運営担当者／権利者：志賀町 | 確認済み（町の写真。2026-10-05 運営より） | 2026-10-05 | 画面には表示しない |
| 完成見本の箱の写真 | `references/box_sample.jpeg` | 読み取りの検証のみ（公開しない） | 提供写真 | **要確認** | 開発用 | ― | ― |
| 貝の集合写真 | `references/IMG_4027.jpeg` | 使っていない | 提供写真 | ― | ― | ― | ― |
| 検証用の合成画像 | `tools/fixtures/` | 読み取りの検証のみ（公開しない） | チラシの箱写真を加工 | ― | 開発用 | ― | ― |
| Zen Maru Gothic | Google Fonts から読み込み | 文字 | Google Fonts | ― | SIL Open Font License 1.1（無料） | 2026-09-29 | 不要 |
| model-viewer 4.1.0 | `site/vendor/model-viewer/`（同梱） | 3D・AR（モデルがある貝だけ） | Google | ― | Apache License 2.0（無料。同梱の一部に BSD-3-Clause） | 2026-10-01 | 不要 |
| TensorFlow.js 4.22.0 | `site/vendor/tfjs/`（同梱） | AI判定 | Google | ― | Apache License 2.0（無料） | 2026-10-01 | 不要 |
| MobileNet v1（0.50・224） | `site/vendor/mobilenet_v1_0.50_224/`（同梱） | AI判定（写真の特徴） | Google（tfjs-models） | ― | Apache License 2.0（無料） | 2026-10-01 | 不要 |
| 背景の貝の模様 | `site/assets/img/brand/pattern.svg` | 背景 | このサイト用に作成（チラシの線画に合わせた簡単な線画） | ― | ― | 2026-10-01 | ― |
| アイコン・イラスト | `site/assets/js/icons.js` | 画面のアイコン | このサイト用に作成 | ― | ― | ― | ― |

`references/` と `tools/fixtures/` は `.gitignore` で公開リポジトリから除外しています。`site/` の中のファイルは、一般公開モードで表示しない素材でも公開先に置かれます。許諾が得られない素材は、一般公開の前に `site/` から削除してください。

`tools/model-test.html`・`tools/pg-capture.html` は、3D作成と表示を確かめるために model-viewer の公開サンプル（宇宙飛行士のモデル）を使う開発用ページです。そこから作った `tools/fixtures/pg-test.glb` を含め、サイト本体では使いません。

写真を撮ってもらう人には、用途（このサイトでの公開）と共有の範囲を伝えてください。
