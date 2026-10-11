// Renders the SF Symbols the web UI uses into monochrome PNG masks.
// Usage: swift scripts/render-sf-symbols.swift <out-dir> <symbol-name>...
// The PNGs are used with CSS mask-image so they take the current text colour.
// SF Symbols are licensed by Apple for use in apps on Apple platforms.
import AppKit

let args = CommandLine.arguments
guard args.count > 2 else {
    print("usage: render-sf-symbols.swift <out-dir> <names...>")
    exit(1)
}
let outDir = URL(fileURLWithPath: args[1])
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

let canvas: CGFloat = 96          // px, enough for crisp 48pt display on Retina
let pointSize: CGFloat = 70       // symbol point size inside the canvas
var missing: [String] = []

for name in args.dropFirst(2) {
    guard let symbol = NSImage(systemSymbolName: name, accessibilityDescription: nil),
          let image = symbol.withSymbolConfiguration(.init(pointSize: pointSize, weight: .regular)) else {
        missing.append(name)
        continue
    }
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(canvas), pixelsHigh: Int(canvas),
                               bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                               colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    rep.size = NSSize(width: canvas, height: canvas)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    var size = image.size
    // very wide symbols get scaled down to fit, everything else keeps the shared point size
    let fit = min(1, (canvas - 4) / max(size.width, size.height))
    size = NSSize(width: size.width * fit, height: size.height * fit)
    let rect = NSRect(x: (canvas - size.width) / 2, y: (canvas - size.height) / 2, width: size.width, height: size.height)
    image.draw(in: rect)
    NSColor.black.set()
    rect.fill(using: .sourceAtop)
    NSGraphicsContext.restoreGraphicsState()
    try rep.representation(using: .png, properties: [:])!.write(to: outDir.appendingPathComponent("\(name).png"))
}

if !missing.isEmpty {
    print("missing symbols: \(missing.joined(separator: ", "))")
    exit(2)
}
