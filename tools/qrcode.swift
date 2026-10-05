// QRコードの画像を作る（macOS 標準の CoreImage を使う）
// ビルド: swiftc -O tools/qrcode.swift -o tools/bin/qrcode
// 使い方: tools/bin/qrcode "<URL>" <出力.png> [1マスの画素数（既定 12）]
import CoreImage
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count >= 3 else { print("使い方: qrcode <文字> <出力.png> [倍率]"); exit(2) }
let scale = args.count > 3 ? (Double(args[3]) ?? 12) : 12
let filter = CIFilter(name: "CIQRCodeGenerator")!
filter.setValue(args[1].data(using: .utf8), forKey: "inputMessage")
filter.setValue("M", forKey: "inputCorrectionLevel")
let img = filter.outputImage!.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
let ctx = CIContext()
let cg = ctx.createCGImage(img, from: img.extent)!
let url = URL(fileURLWithPath: args[2])
let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, cg, nil)
CGImageDestinationFinalize(dest)
print("書き出し: \(args[2])")
