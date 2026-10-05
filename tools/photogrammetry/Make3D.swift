// 写真から3Dモデルを作る（Apple の Object Capture。macOS 12以降・Apple シリコンの Mac で無料で動く）
//
// ビルド:  swiftc -O tools/photogrammetry/Make3D.swift -o tools/bin/make3d
// 使い方:  tools/bin/make3d <写真のフォルダ> <出力フォルダ> [--detail reduced|medium|full] [--unordered] [--high]
//
// 出力フォルダには、次の2つを書き出す:
//   model.usdz  … iPhone の AR クイックルック用（確認用）
//   obj/        … OBJ 形式（tools/obj2glb.py で Web 用の .glb に変換する）
// 写真は、貝のまわりをぐるっと一周（高さを変えて2〜3周）、隣の写真と7割ほど重なるように撮ったもの。
// 目安は 40〜120 枚。裏側も撮る場合は、貝を裏返して同じように撮り、同じフォルダに入れる。

import Foundation
import RealityKit

@main
struct Make3D {
    static func main() async {
        var args = Array(CommandLine.arguments.dropFirst())
        guard args.count >= 2 else {
            print("使い方: make3d <写真のフォルダ> <出力フォルダ> [--detail reduced|medium|full] [--unordered] [--high]")
            exit(2)
        }
        let input = URL(fileURLWithPath: args.removeFirst(), isDirectory: true)
        let output = URL(fileURLWithPath: args.removeFirst(), isDirectory: true)
        var detail: PhotogrammetrySession.Request.Detail = .reduced
        var config = PhotogrammetrySession.Configuration()
        config.sampleOrdering = .sequential
        config.featureSensitivity = .normal
        config.isObjectMaskingEnabled = true
        while !args.isEmpty {
            let a = args.removeFirst()
            switch a {
            case "--detail":
                let v = args.isEmpty ? "" : args.removeFirst()
                switch v {
                case "preview": detail = .preview
                case "reduced": detail = .reduced
                case "medium": detail = .medium
                case "full": detail = .full
                default: print("--detail は preview / reduced / medium / full"); exit(2)
                }
            case "--unordered": config.sampleOrdering = .unordered
            case "--high": config.featureSensitivity = .high
            default: print("不明な指定: \(a)"); exit(2)
            }
        }
        guard PhotogrammetrySession.isSupported else {
            print("この Mac では Object Capture を使えません（Apple シリコンの Mac などが必要です）")
            exit(1)
        }
        let fm = FileManager.default
        try? fm.createDirectory(at: output, withIntermediateDirectories: true)
        let objDir = output.appendingPathComponent("obj", isDirectory: true)
        try? fm.createDirectory(at: objDir, withIntermediateDirectories: true)
        let usdz = output.appendingPathComponent("model.usdz")

        let session: PhotogrammetrySession
        do {
            session = try PhotogrammetrySession(input: input, configuration: config)
        } catch {
            print("写真のフォルダを読み込めませんでした: \(error)")
            exit(1)
        }
        do {
            try session.process(requests: [
                .modelFile(url: usdz, detail: detail),
                .modelFile(url: objDir, detail: detail),
            ])
        } catch {
            print("処理を始められませんでした: \(error)")
            exit(1)
        }
        var failed = false
        var skipped = 0
        do {
            for try await out in session.outputs {
                switch out {
                case .requestProgress(_, let fraction):
                    print(String(format: "進み具合 %3.0f%%", fraction * 100))
                case .requestComplete(_, let result):
                    if case .modelFile(let url) = result { print("書き出し: \(url.path)") }
                case .requestError(_, let error):
                    print("失敗: \(error)")
                    failed = true
                case .skippedSample(let id):
                    skipped += 1
                    print("使えなかった写真 \(id)")
                case .invalidSample(let id, let reason):
                    print("使えない写真 \(id): \(reason)")
                case .automaticDownsampling:
                    print("メモリ節約のため、写真を縮小して処理します")
                case .processingComplete:
                    print(failed ? "終了（失敗あり）" : "完了（使えなかった写真 \(skipped) 枚）")
                    exit(failed ? 1 : 0)  // 結果の流れは終わらないので、ここで終える
                default:
                    break
                }
            }
        } catch {
            print("処理中に止まりました: \(error)")
            exit(1)
        }
        exit(failed ? 1 : 0)
    }
}
