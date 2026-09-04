#if canImport(Tauri)
import CoreGraphics
import Foundation
import ImageIO
import Tauri

private struct DecodeArgs: Decodable {
  let sourcePath: String
  let maxPixelSize: Int
  let maxInputPixels: Int64
  let expiresAfterSeconds: Int
  let fileNamePrefix: String
}

private struct ReleaseArgs: Decodable {
  let id: String
}

private enum NativeImageError: String, LocalizedError {
  case inputInvalid = "native-image-input-invalid"
  case inputTooLarge = "native-image-input-too-large"
  case writeFailed = "native-image-write-failed"

  var errorDescription: String? { rawValue }
}

final class NativeImagePlugin: Plugin {
  private let workQueue = DispatchQueue(label: "top.idol-master.imsweb.native-image")

  @objc public func decode(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(DecodeArgs.self)
    workQueue.async {
      do {
        let result = try self.decodeImage(args)
        DispatchQueue.main.async { invoke.resolve(result) }
      } catch {
        let message = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        DispatchQueue.main.async { invoke.reject(message) }
      }
    }
  }

  @objc public func release(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(ReleaseArgs.self)
    workQueue.async {
      guard UUID(uuidString: args.id) != nil else {
        DispatchQueue.main.async { invoke.reject(NativeImageError.inputInvalid.rawValue) }
        return
      }
      for fileName in ["\(args.id).webp", "\(args.id).rgba", "\(args.id).webp.tmp"] {
        try? FileManager.default.removeItem(
          at: self.cacheDirectory().appendingPathComponent(fileName)
        )
      }
      DispatchQueue.main.async { invoke.resolve() }
    }
  }

  @objc public func cleanupExpired(_ invoke: Invoke) {
    workQueue.async {
      let cutoff = Date().addingTimeInterval(-60 * 60)
      let directory = self.cacheDirectory()
      let keys: Set<URLResourceKey> = [.contentModificationDateKey, .isRegularFileKey]
      let files = (try? FileManager.default.contentsOfDirectory(
        at: directory,
        includingPropertiesForKeys: Array(keys),
        options: [.skipsHiddenFiles]
      )) ?? []
      var removed = 0
      for file in files {
        let name = file.lastPathComponent.lowercased()
        guard name.hasSuffix(".webp")
          || name.hasSuffix(".rgba")
          || name.hasSuffix(".webp.tmp")
        else { continue }
        let values = try? file.resourceValues(forKeys: keys)
        guard values?.isRegularFile == true,
          let modified = values?.contentModificationDate,
          modified < cutoff
        else { continue }
        if (try? FileManager.default.removeItem(at: file)) != nil {
          removed += 1
        }
      }
      DispatchQueue.main.async { invoke.resolve(["removed": removed]) }
    }
  }

  private func decodeImage(_ args: DecodeArgs) throws -> [String: Any] {
    let sourceURL = try fileURL(args.sourcePath)

    guard let source = CGImageSourceCreateWithURL(sourceURL as CFURL, nil),
      CGImageSourceGetCount(source) > 0
    else { throw NativeImageError.inputInvalid }

    let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as NSDictionary?
    let sourceWidth = (properties?[kCGImagePropertyPixelWidth] as? NSNumber)?.int64Value ?? 0
    let sourceHeight = (properties?[kCGImagePropertyPixelHeight] as? NSNumber)?.int64Value ?? 0
    guard sourceWidth > 0, sourceHeight > 0 else { throw NativeImageError.inputInvalid }
    guard sourceWidth <= args.maxInputPixels / sourceHeight else {
      throw NativeImageError.inputTooLarge
    }

    let thumbnailOptions: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: args.maxPixelSize,
      kCGImageSourceShouldCacheImmediately: true
    ]
    guard let image = CGImageSourceCreateThumbnailAtIndex(
      source,
      0,
      thumbnailOptions as CFDictionary
    ) else { throw NativeImageError.inputInvalid }

    let id = UUID().uuidString.lowercased()
    let directory = cacheDirectory()
    let rgbaURL = directory.appendingPathComponent("\(id).rgba")
    let outputURL = directory.appendingPathComponent("\(id).webp")
    let rgba = try rgbaData(image)
    do {
      try rgba.write(to: rgbaURL, options: .atomic)
    } catch {
      try? FileManager.default.removeItem(at: rgbaURL)
      throw NativeImageError.writeFailed
    }

    return [
      "id": id,
      "rgbaFilePath": rgbaURL.path,
      "outputFilePath": outputURL.path,
      "fileName": "\(args.fileNamePrefix)-\(id).webp",
      "width": image.width,
      "height": image.height,
      "expiresAt": ISO8601DateFormatter().string(
        from: Date().addingTimeInterval(TimeInterval(args.expiresAfterSeconds))
      )
    ]
  }

  private func rgbaData(_ image: CGImage) throws -> Data {
    let (pixels, pixelOverflow) = image.width.multipliedReportingOverflow(by: image.height)
    let (byteCount, byteOverflow) = pixels.multipliedReportingOverflow(by: 4)
    guard !pixelOverflow, !byteOverflow, byteCount > 0 else {
      throw NativeImageError.inputInvalid
    }

    var data = Data(count: byteCount)
    let rendered = data.withUnsafeMutableBytes { bytes -> Bool in
      guard let baseAddress = bytes.baseAddress else { return false }
      let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)
        ?? CGColorSpaceCreateDeviceRGB()
      let bitmapInfo = CGBitmapInfo.byteOrder32Big.rawValue
        | CGImageAlphaInfo.premultipliedLast.rawValue
      guard let context = CGContext(
        data: baseAddress,
        width: image.width,
        height: image.height,
        bitsPerComponent: 8,
        bytesPerRow: image.width * 4,
        space: colorSpace,
        bitmapInfo: bitmapInfo
      ) else { return false }
      context.interpolationQuality = .high
      context.draw(
        image,
        in: CGRect(x: 0, y: 0, width: image.width, height: image.height)
      )
      return true
    }
    guard rendered else { throw NativeImageError.inputInvalid }
    return data
  }

  private func fileURL(_ value: String) throws -> URL {
    if value.hasPrefix("file://"), let url = URL(string: value), url.isFileURL {
      return url
    }
    guard !value.isEmpty else { throw NativeImageError.inputInvalid }
    return URL(fileURLWithPath: value)
  }

  private func cacheDirectory() -> URL {
    let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
    let directory = base.appendingPathComponent("native-image", isDirectory: true)
    try? FileManager.default.createDirectory(
      at: directory,
      withIntermediateDirectories: true
    )
    return directory
  }
}

@_cdecl("init_plugin_native_image")
func initPlugin() -> Plugin {
  return NativeImagePlugin()
}
#endif
