import Foundation
import Vision
import AppKit

let directory = URL(fileURLWithPath: CommandLine.arguments[1])
let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil).filter { $0.pathExtension == "png" }.sorted { $0.lastPathComponent < $1.lastPathComponent }
for file in files {
    try autoreleasepool {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["zh-Hans", "en-US"]
        request.usesLanguageCorrection = true
        try VNImageRequestHandler(url: file).perform([request])
        let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
        let seconds = (Int(file.deletingPathExtension().lastPathComponent)! - 1) * 3
        print(String(format: "%02d:%02d", seconds / 60, seconds % 60) + " " + lines.joined(separator: " | "))
    }
}
