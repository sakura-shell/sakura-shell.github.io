// 動画から静止画を等間隔で切り出す（3Dモデル作成用）。macOS 標準の AVFoundation を使う
//
// ビルド:  swiftc -O -parse-as-library tools/photogrammetry/VideoFrames.swift -o tools/bin/videoframes
// 使い方:  tools/bin/videoframes <動画> <出力フォルダ> [1秒あたりの枚数（既定 4）] [開始秒] [終了秒]
// スマホの回転情報（縦向きなど）を反映して、JPEG で書き出す。

import AVFoundation
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

@main
struct VideoFrames {
    static func main() async {
        let args = Array(CommandLine.arguments.dropFirst())
        guard args.count >= 2 else {
            print("使い方: videoframes <動画> <出力フォルダ> [1秒あたりの枚数] [開始秒] [終了秒]")
            exit(2)
        }
        let video = URL(fileURLWithPath: args[0])
        let out = URL(fileURLWithPath: args[1], isDirectory: true)
        let perSecond = args.count > 2 ? (Double(args[2]) ?? 4) : 4
        try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)

        let asset = AVURLAsset(url: video)
        let duration: Double
        do {
            duration = try await asset.load(.duration).seconds
        } catch {
            print("動画を読み込めませんでした: \(error)")
            exit(1)
        }
        let gen = AVAssetImageGenerator(asset: asset)
        gen.appliesPreferredTrackTransform = true  // 縦向きの動画を正しい向きに
        gen.requestedTimeToleranceBefore = .zero
        gen.requestedTimeToleranceAfter = .zero
        let start = args.count > 3 ? max(0, Double(args[3]) ?? 0) : 0
        let end = args.count > 4 ? min(duration, Double(args[4]) ?? duration) : duration
        let count = max(0, Int((end - start) * perSecond))
        var written = 0
        for i in 0..<count {
            let t = CMTime(seconds: start + Double(i) / perSecond, preferredTimescale: 600)
            do {
                let (image, _) = try await gen.image(at: t)
                let url = out.appendingPathComponent(String(format: "frame_%04d.jpg", i))
                guard let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else { continue }
                CGImageDestinationAddImage(dest, image, [kCGImageDestinationLossyCompressionQuality: 0.92] as CFDictionary)
                if CGImageDestinationFinalize(dest) { written += 1 }
            } catch {
                print("切り出せなかった時刻 \(String(format: "%.2f", t.seconds))秒")
            }
        }
        print("書き出し：\(written)枚（\(String(format: "%.1f", start))〜\(String(format: "%.1f", end))秒、1秒あたり\(perSecond)枚）→ \(out.path)")
    }
}
