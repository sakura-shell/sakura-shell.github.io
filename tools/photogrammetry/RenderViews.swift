// 3Dモデル（.obj / .usdz / .glb 以外の SceneKit が読める形式）を、いくつかの角度から画像にする（確認用）
//
// ビルド:  swiftc -O -parse-as-library tools/photogrammetry/RenderViews.swift -o tools/bin/renderviews
// 使い方:  tools/bin/renderviews <モデル(.obj/.usdz)> <出力.png> [1枚の大きさ px（既定 360）]
// 横に8方向（45°ずつ）＋上・下からの計10枚を、1枚の画像に並べて書き出す。

import AppKit
import Foundation
import SceneKit

@main
struct RenderViews {
    static func main() {
        let args = Array(CommandLine.arguments.dropFirst())
        guard args.count >= 2 else {
            print("使い方: renderviews <モデル> <出力.png> [1枚の大きさ]")
            exit(2)
        }
        let size = args.count > 2 ? (Int(args[2]) ?? 360) : 360
        let url = URL(fileURLWithPath: args[0])
        guard let scene = try? SCNScene(url: url, options: [.convertToYUp: true]) else {
            print("モデルを読み込めませんでした: \(url.path)")
            exit(1)
        }
        // モデル全体をまとめ、中心と大きさを求める
        let model = SCNNode()
        for child in scene.rootNode.childNodes { model.addChildNode(child) }
        scene.rootNode.addChildNode(model)
        let (minV, maxV) = model.boundingBox
        let center = SCNVector3((minV.x + maxV.x) / 2, (minV.y + maxV.y) / 2, (minV.z + maxV.z) / 2)
        let ext = SCNVector3(maxV.x - minV.x, maxV.y - minV.y, maxV.z - minV.z)
        let radius = CGFloat(sqrt(ext.x * ext.x + ext.y * ext.y + ext.z * ext.z) / 2)
        print(String(format: "大きさ（モデルの単位）: %.4f × %.4f × %.4f", ext.x, ext.y, ext.z))
        model.position = SCNVector3(-center.x, -center.y, -center.z)

        scene.background.contents = NSColor(white: 0.93, alpha: 1)
        let camera = SCNCamera()
        camera.fieldOfView = 30
        camera.zNear = Double(radius) * 0.05
        camera.zFar = Double(radius) * 20
        let cameraNode = SCNNode()
        cameraNode.camera = camera
        scene.rootNode.addChildNode(cameraNode)
        let ambient = SCNNode()
        ambient.light = SCNLight()
        ambient.light!.type = .ambient
        ambient.light!.intensity = 700
        scene.rootNode.addChildNode(ambient)
        let key = SCNNode()
        key.light = SCNLight()
        key.light!.type = .directional
        key.light!.intensity = 500
        cameraNode.addChildNode(key)  // カメラの向きから照らす

        let renderer = SCNRenderer(device: MTLCreateSystemDefaultDevice(), options: nil)
        renderer.scene = scene
        renderer.pointOfView = cameraNode
        let dist = radius / CGFloat(tan(15.0 * Double.pi / 180)) * 1.1

        // （水平の角度, 仰角）
        var views: [(CGFloat, CGFloat, String)] = []
        for i in 0..<8 { views.append((CGFloat(i) * 45, 20, "\(i * 45)°")) }
        views.append((0, 89, "上"))
        views.append((0, -89, "下"))

        let cols = 5
        let rows = (views.count + cols - 1) / cols
        let sheet = NSImage(size: NSSize(width: size * cols, height: size * rows))
        sheet.lockFocus()
        for (i, v) in views.enumerated() {
            let az = v.0 * .pi / 180, el = v.1 * .pi / 180
            cameraNode.position = SCNVector3(dist * cos(el) * sin(az), dist * sin(el), dist * cos(el) * cos(az))
            cameraNode.look(at: SCNVector3(0, 0, 0), up: SCNVector3(0, 1, 0), localFront: SCNVector3(0, 0, -1))
            let img = renderer.snapshot(atTime: 0, with: CGSize(width: size, height: size), antialiasingMode: .multisampling4X)
            let x = (i % cols) * size, y = (rows - 1 - i / cols) * size
            img.draw(in: NSRect(x: x, y: y, width: size, height: size))
            (v.2 as NSString).draw(at: NSPoint(x: x + 8, y: y + size - 24),
                                   withAttributes: [.font: NSFont.systemFont(ofSize: 16), .foregroundColor: NSColor.darkGray])
        }
        sheet.unlockFocus()
        guard let tiff = sheet.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
              let png = rep.representation(using: .png, properties: [:]) else {
            print("画像を作れませんでした")
            exit(1)
        }
        try? png.write(to: URL(fileURLWithPath: args[1]))
        print("書き出し: \(args[1])")
    }
}
