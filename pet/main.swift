import AppKit
import Foundation

// MARK: - Bridge JSON model

struct BridgeTool: Decodable {
    let name: String
    let elapsedMs: Double
}

struct BridgeTodos: Decodable {
    let done: Int
    let total: Int
    let current: String
}

struct BridgeSessionState: Decodable {
    let id: String
    let title: String
    let phase: String
    let elapsedMs: Double
    let tool: BridgeTool?
    let todos: BridgeTodos?
    let lastEventAt: Double
}

struct BridgeReason: Decodable {
    let kind: String?
}

struct BridgeEvent: Decodable {
    let seq: Int
    let kind: String
    let at: Double
    let title: String
    let sessionId: String
    let elapsedMs: Double
    let tool: String?
    let ok: Bool?
    let reason: BridgeReason?
}

struct BridgeMeta: Decodable {
    let version: Int
    let pid: Int
    let port: Int
    let startedAt: Double
}

struct BridgeState: Decodable {
    let version: Int
    let now: Double
    let seq: Int
    let mode: String
    let activeCount: Int
    let sessionCount: Int
    let sessions: [BridgeSessionState]
    let lastEvent: BridgeEvent?
    let bridge: BridgeMeta
}

// MARK: - Small helpers

func formatDuration(ms: Double) -> String {
    let total = max(0, Int((ms / 1000).rounded()))
    if total < 60 { return "\(total)秒" }
    if total < 3600 { return "\(total / 60)分\(total % 60)秒" }
    return "\(total / 3600)时\((total % 3600) / 60)分"
}

/** Best-effort local interaction log for troubleshooting (never leaves the machine). */
func petLog(_ message: String) {
    let directory = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".dsh/dsh-task-pet")
    try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let url = directory.appendingPathComponent("pet.log")
    let line = "\(ISO8601DateFormatter().string(from: Date())) \(message)\n"
    if let data = line.data(using: .utf8) {
        if let handle = try? FileHandle(forWritingTo: url) {
            defer { try? handle.close() }
            if let size = try? handle.seekToEnd() {
                if size > 256 * 1024 { try? handle.truncate(atOffset: 0) }
                try? handle.write(contentsOf: data)
            }
        } else {
            try? data.write(to: url)
        }
    }
}

func clip(_ text: String, _ limit: Int) -> String {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.count <= limit { return trimmed }
    return String(trimmed.prefix(max(0, limit - 1))) + "…"
}

// MARK: - Bridge client

final class BridgeClient {
    private let port: Int
    private let token: String?
    private var timer: Timer?
    private var inFlight = false
    var onState: ((BridgeState) -> Void)?
    var onFailure: (() -> Void)?

    init(port: Int, token: String?) {
        self.port = port
        self.token = token
    }

    func start() { schedule(after: 0) }
    func stop() { timer?.invalidate(); timer = nil }

    private func schedule(after seconds: TimeInterval) {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { [weak self] _ in
            self?.poll()
        }
    }

    private func poll() {
        guard let url = makeURL() else { onFailure?(); schedule(after: 1.0); return }
        if inFlight { return }
        inFlight = true
        var request = URLRequest(url: url)
        request.timeoutInterval = 1.5
        request.cachePolicy = .reloadIgnoringLocalCacheData
        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            guard let self else { return }
            var state: BridgeState?
            if let data, error == nil, let http = response as? HTTPURLResponse, http.statusCode == 200 {
                state = try? JSONDecoder().decode(BridgeState.self, from: data)
            }
            DispatchQueue.main.async {
                self.inFlight = false
                if let state { self.onState?(state) } else { self.onFailure?() }
                self.schedule(after: 0.35)
            }
        }.resume()
    }

    private func makeURL() -> URL? {
        var components = URLComponents()
        components.scheme = "http"
        components.host = "127.0.0.1"
        components.port = port
        components.path = "/state"
        if let token { components.queryItems = [URLQueryItem(name: "token", value: token)] }
        return components.url
    }
}

// MARK: - Discovery

struct BridgeDiscovery {
    let port: Int
    let token: String?
}

func readBridgeDiscovery() -> BridgeDiscovery? {
    let url = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".dsh/dsh-task-pet/bridge.json")
    guard let data = try? Data(contentsOf: url),
          let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let port = object["port"] as? Int else { return nil }
    return BridgeDiscovery(port: port, token: object["token"] as? String)
}

// MARK: - Skin

struct SkinStateMaterial: Decodable {
    let sprite: String?
    let frames: [String]?
    let fps: Double?
    let sound: String?
}

struct SkinManifest: Decodable {
    let name: String?
    let states: [String: SkinStateMaterial]?
}

/// One loaded skin: per-companion-state image frames (and optional per-state sound).
final class Skin {
    let directory: URL
    let displayName: String
    private(set) var stateFrames: [String: [NSImage]] = [:]
    private(set) var stateSounds: [String: URL] = [:]
    private(set) var stateFps: [String: Double] = [:]
    private(set) var maxWidth: CGFloat = 64
    private(set) var maxHeight: CGFloat = 64
    static let companionStates = [
        "idle", "thinking", "working", "streaming", "success", "error", "aborted", "sleep", "disconnected",
    ]

    init(directory: URL) {
        self.directory = directory
        let manifestURL = directory.appendingPathComponent("skin.json")
        let manifest = (try? Data(contentsOf: manifestURL))
            .flatMap { try? JSONDecoder().decode(SkinManifest.self, from: $0) }
        displayName = manifest?.name ?? directory.lastPathComponent
        var imageCache: [String: NSImage] = [:]
        func image(_ name: String) -> NSImage? {
            if let cached = imageCache[name] { return cached }
            let url = directory.appendingPathComponent(name)
            guard let loaded = NSImage(contentsOf: url) else { return nil }
            imageCache[name] = loaded
            return loaded
        }
        for state in Skin.companionStates {
            let material = manifest?.states?[state] ?? manifest?.states?["idle"] ?? manifest?.states?["default"]
            var frames: [NSImage] = []
            if let material {
                if let frameNames = material.frames, !frameNames.isEmpty {
                    frames = frameNames.compactMap { image($0) }
                } else if let spriteName = material.sprite, !spriteName.isEmpty, let loaded = image(spriteName) {
                    frames = [loaded]
                }
                if let soundName = material.sound {
                    let soundURL = directory.appendingPathComponent(soundName)
                    if FileManager.default.fileExists(atPath: soundURL.path) { stateSounds[state] = soundURL }
                }
                if let fps = material.fps, fps > 0 { stateFps[state] = fps }
            }
            if frames.isEmpty, let fallback = manifest?.states?["idle"]?.sprite, let loaded = image(fallback) {
                frames = [loaded]
            }
            if frames.isEmpty, let loaded = image("sprite.png") {
                frames = [loaded]
            }
            if frames.isEmpty, let loaded = image("greninja.png") {
                frames = [loaded]
            }
            if !frames.isEmpty {
                stateFrames[state] = frames
                for frame in frames {
                    maxWidth = max(maxWidth, frame.size.width)
                    maxHeight = max(maxHeight, frame.size.height)
                }
            }
        }
    }

    func frames(for state: String) -> [NSImage] {
        stateFrames[state] ?? stateFrames["idle"] ?? []
    }

    func fps(for state: String) -> Double {
        stateFps[state] ?? 8
    }

}

// MARK: - Pet view

final class PetView: NSView {
    var mode: String = "disconnected" {
        didSet {
            if mode != oldValue {
                modeStartedAt = CACurrentMediaTime()
                if mode == "success" { spawnConfetti() }
            }
        }
    }
    var bubbleMode: String = "idle"
    var title: String = ""
    var detail: String = ""
    var bubbleVisible: Bool = false
    var pixelScale: Int = 2 { didSet { needsLayout = true; needsDisplay = true } }
    var skin: Skin? { didSet { needsLayout = true; needsDisplay = true } }
    var onClick: (() -> Void)?
    var onRightClick: ((NSEvent) -> Void)?
    var onDragEnd: (() -> Void)?
    var onScaleChange: ((Int) -> Void)?

    private var dragStartPoint: NSPoint = .zero
    private var dragStartOrigin: NSPoint = .zero
    private var isDraggingPet = false
    private var dragInProgress = false
    private var tick: Double = 0
    private var displayTimer: Timer?
    private var modeStartedAt: CFTimeInterval = CACurrentMediaTime()
    private var confetti: [Confetti] = []
    private var clickThroughTimer: Timer?
    private var magnifyMonitor: Any?
    private var magnifyAccumulator: CGFloat = 0

    struct Confetti {
        var x: Double
        var y: Double
        var vx: Double
        var vy: Double
        var life: Double
        var color: NSColor
        var size: Double
    }

    override var isFlipped: Bool { false }
    override var acceptsFirstResponder: Bool { false }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    // MARK: layout

    private var bubbleWidth: CGFloat { 248 }
    private var bubbleHeight: CGFloat { 58 }

    private var spriteAreaWidth: CGFloat {
        guard let skin else { return 150 }
        return skin.maxWidth * CGFloat(pixelScale)
    }
    private var spriteAreaHeight: CGFloat {
        guard let skin else { return 130 }
        return skin.maxHeight * CGFloat(pixelScale)
    }

    /// Required window size for the current skin + zoom.
    func requiredSize() -> NSSize {
        NSSize(width: max(bubbleWidth + 20, spriteAreaWidth + 24),
               height: bubbleHeight + 10 + spriteAreaHeight + 12)
    }

    func currentFrames() -> [NSImage] {
        guard let skin else { return [] }
        return skin.frames(for: mode)
    }

    private func currentFps() -> Double {
        skin?.fps(for: mode) ?? 8
    }

    // MARK: lifecycle

    func startAnimating() {
        // Best effort for pinch / trackpad magnification. macOS normally sends
        // gesture events to the active app, so a non-activating overlay often
        // never sees them; the local monitor catches them if they do arrive.
        let magnify = NSMagnificationGestureRecognizer(target: self, action: #selector(handleMagnifyGesture(_:)))
        addGestureRecognizer(magnify)
        magnifyMonitor = NSEvent.addLocalMonitorForEvents(matching: .magnify) { [weak self] event in
            guard let self else { return event }
            let mouse = NSEvent.mouseLocation
            guard let window = self.window, window.frame.insetBy(dx: -40, dy: -40).contains(mouse) else { return event }
            self.applyMagnify(delta: event.magnification)
            return nil
        }
        displayTimer?.invalidate()
        displayTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { [weak self] _ in
            self?.tick += 1.0 / 30.0
            self?.advanceEffects(dt: 1.0 / 30.0)
            self?.needsDisplay = true
        }
        startClickThroughTracking()
    }

    private func advanceEffects(dt: Double) {
        if mode == "success" {
            for index in confetti.indices {
                confetti[index].x += confetti[index].vx * dt
                confetti[index].y += confetti[index].vy * dt
                confetti[index].vy -= 260 * dt
                confetti[index].life -= dt
            }
            confetti.removeAll { $0.life <= 0 || $0.y < -40 }
        } else if !confetti.isEmpty {
            confetti.removeAll()
        }
    }

    private func spawnConfetti() {
        let palette: [NSColor] = [
            NSColor(calibratedRed: 0.30, green: 0.85, blue: 0.95, alpha: 1),
            NSColor(calibratedRed: 0.99, green: 0.85, blue: 0.30, alpha: 1),
            NSColor(calibratedRed: 0.98, green: 0.45, blue: 0.55, alpha: 1),
            NSColor(calibratedRed: 0.55, green: 0.95, blue: 0.55, alpha: 1),
            NSColor.white,
        ]
        for index in 0..<42 {
            confetti.append(Confetti(
                x: Double.random(in: 40...220),
                y: Double.random(in: 120...240),
                vx: Double.random(in: -70...70),
                vy: Double.random(in: 40...180),
                life: Double.random(in: 1.2...2.2),
                color: palette[index % palette.count],
                size: Double.random(in: 2...4)
            ))
        }
    }

    // MARK: drawing

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        guard let context = NSGraphicsContext.current else { return }
        context.imageInterpolation = .none
        let frames = currentFrames()
        var originX = (bounds.width - spriteAreaWidth) / 2
        let originY: CGFloat = 10
        var baselineY = originY
        var alpha: CGFloat = 1
        switch mode {
        case "idle": baselineY += CGFloat(sin(tick * 1.6) * 2)
        case "thinking":
            baselineY += CGFloat(sin(tick * 2.2) * 1.5)
            originX += CGFloat(sin(tick * 0.9) * 1.5)
        case "working": baselineY += CGFloat(sin(tick * 7.0) * 2.5)
        case "streaming": baselineY += CGFloat(sin(tick * 3.0) * 1.5)
        case "success": baselineY += CGFloat(-abs(sin(tick * 5.0)) * 20)
        case "error", "aborted": originX += CGFloat(sin(tick * 32.0) * 3)
        case "sleep":
            baselineY += CGFloat(sin(tick * 0.8) * 1.2)
            alpha = 0.72
        case "disconnected": alpha = 0.55
        default: break
        }
        if !frames.isEmpty {
            let image = frames[Int(tick * currentFps()) % frames.count]
            let width = image.size.width * CGFloat(pixelScale)
            let height = image.size.height * CGFloat(pixelScale)
            let drawX = originX + (spriteAreaWidth - width) / 2
            image.draw(in: NSRect(x: drawX, y: baselineY, width: width, height: height),
                       from: NSRect(origin: .zero, size: image.size),
                       operation: .sourceOver,
                       fraction: alpha,
                       respectFlipped: false,
                       hints: nil)
        } else {
            NSColor(calibratedRed: 0.30, green: 0.55, blue: 0.95, alpha: alpha).setFill()
            NSBezierPath(roundedRect: NSRect(x: originX, y: baselineY, width: spriteAreaWidth, height: spriteAreaHeight),
                         xRadius: 24, yRadius: 24).fill()
        }
        drawEffects(mode: mode)
        if bubbleVisible { drawBubble() }
    }

    private func drawEffects(mode: String) {
        let centerX = bounds.width / 2
        switch mode {
        case "working":
            drawShuriken(centerX: centerX + spriteAreaWidth * 0.32,
                         centerY: 10 + spriteAreaHeight * 0.62, angle: tick * 7.0)
        case "thinking":
            drawThoughtDots(centerX: centerX, centerY: 10 + spriteAreaHeight + 4)
        case "success":
            for piece in confetti {
                piece.color.setFill()
                NSBezierPath(rect: NSRect(x: piece.x, y: piece.y, width: piece.size, height: piece.size)).fill()
            }
        case "sleep":
            drawSleepZ(originX: centerX + spriteAreaWidth * 0.42, originY: 10 + spriteAreaHeight * 0.92)
        case "error", "aborted":
            drawErrorMark(centerX: centerX - spriteAreaWidth * 0.24, centerY: 10 + spriteAreaHeight * 0.85)
        default:
            break
        }
    }

    private func drawShuriken(centerX: CGFloat, centerY: CGFloat, angle: Double) {
        guard let context = NSGraphicsContext.current else { return }
        context.saveGraphicsState()
        let transform = NSAffineTransform()
        transform.translateX(by: centerX, yBy: centerY)
        transform.rotate(byDegrees: CGFloat(angle * 180 / Double.pi))
        transform.concat()
        NSColor(calibratedRed: 0.55, green: 0.92, blue: 1.0, alpha: 0.92).setFill()
        let path = NSBezierPath()
        path.move(to: NSPoint(x: 0, y: 13))
        path.line(to: NSPoint(x: 3.2, y: 3.2))
        path.line(to: NSPoint(x: 13, y: 0))
        path.line(to: NSPoint(x: 3.2, y: -3.2))
        path.line(to: NSPoint(x: 0, y: -13))
        path.line(to: NSPoint(x: -3.2, y: -3.2))
        path.line(to: NSPoint(x: -13, y: 0))
        path.line(to: NSPoint(x: -3.2, y: 3.2))
        path.close()
        path.fill()
        NSColor(calibratedRed: 0.10, green: 0.20, blue: 0.35, alpha: 1).setFill()
        NSBezierPath(ovalIn: NSRect(x: -2.5, y: -2.5, width: 5, height: 5)).fill()
        context.restoreGraphicsState()
    }

    private func drawThoughtDots(centerX: CGFloat, centerY: CGFloat) {
        NSColor(calibratedWhite: 1, alpha: 0.55).setFill()
        for index in 0..<3 {
            let phase = tick * 3.0 + Double(index) * 0.6
            let dy = CGFloat(sin(phase) * 3)
            let x = centerX - 14 + CGFloat(index) * 14
            NSBezierPath(ovalIn: NSRect(x: x, y: centerY + dy, width: 6, height: 6)).fill()
        }
    }

    private func drawSleepZ(originX: CGFloat, originY: CGFloat) {
        let font = NSFont.monospacedSystemFont(ofSize: 15, weight: .semibold)
        for index in 0..<3 {
            let phase = (tick * 0.7 + Double(index) * 0.8).truncatingRemainder(dividingBy: 2.4)
            let alphaValue = max(0, 1 - phase / 2.4)
            let attrs: [NSAttributedString.Key: Any] = [
                .font: font,
                .foregroundColor: NSColor(calibratedWhite: 1, alpha: 0.62 * alphaValue),
            ]
            ("Z" as NSString).draw(at: NSPoint(x: originX - CGFloat(index) * 8 + CGFloat(phase) * 6,
                                               y: originY - CGFloat(index) * 10 + CGFloat(phase) * 22),
                                   withAttributes: attrs)
        }
    }

    private func drawErrorMark(centerX: CGFloat, centerY: CGFloat) {
        NSColor(calibratedRed: 1.0, green: 0.35, blue: 0.35, alpha: 0.95).setStroke()
        let path = NSBezierPath()
        path.lineWidth = 3
        path.move(to: NSPoint(x: centerX - 6, y: centerY - 6))
        path.line(to: NSPoint(x: centerX + 6, y: centerY + 6))
        path.move(to: NSPoint(x: centerX + 6, y: centerY - 6))
        path.line(to: NSPoint(x: centerX - 6, y: centerY + 6))
        path.stroke()
    }

    private func drawBubble() {
        let lineOne = clip(title, 21)
        let lineTwo = clip(detail, 26)
        let second = !lineTwo.isEmpty
        let height: CGFloat = second ? 58 : 38
        let bubbleY = bounds.height - height - 6
        let bubbleX = (bounds.width - bubbleWidth) / 2
        let (fill, stroke) = bubbleColors(mode: bubbleMode)
        let path = NSBezierPath(roundedRect: NSRect(x: bubbleX, y: bubbleY, width: bubbleWidth, height: height),
                                xRadius: 12, yRadius: 12)
        fill.setFill()
        path.fill()
        stroke.setStroke()
        path.lineWidth = 1
        path.stroke()
        let tail = NSBezierPath()
        let tailX = bounds.width / 2
        tail.move(to: NSPoint(x: tailX - 7, y: bubbleY + 1))
        tail.line(to: NSPoint(x: tailX, y: bubbleY - 9))
        tail.line(to: NSPoint(x: tailX + 7, y: bubbleY + 1))
        tail.close()
        fill.setFill()
        tail.fill()
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineBreakMode = .byTruncatingTail
        let titleAttrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 11.5, weight: .semibold),
            .foregroundColor: NSColor(calibratedWhite: 0.98, alpha: 1),
            .paragraphStyle: paragraph,
        ]
        let detailAttrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 10.5, weight: .regular),
            .foregroundColor: NSColor(calibratedRed: 0.66, green: 0.82, blue: 0.96, alpha: 1),
            .paragraphStyle: paragraph,
        ]
        let titleY = second ? bubbleY + 30 : bubbleY + 12
        (lineOne as NSString).draw(in: NSRect(x: bubbleX + 12, y: titleY, width: bubbleWidth - 24, height: 16),
                                   withAttributes: titleAttrs)
        if second {
            (lineTwo as NSString).draw(in: NSRect(x: bubbleX + 12, y: bubbleY + 10, width: bubbleWidth - 24, height: 15),
                                       withAttributes: detailAttrs)
        }
    }

    private func bubbleColors(mode: String) -> (NSColor, NSColor) {
        switch mode {
        case "success":
            return (NSColor(calibratedRed: 0.07, green: 0.20, blue: 0.16, alpha: 0.95),
                    NSColor(calibratedRed: 0.25, green: 0.85, blue: 0.60, alpha: 0.85))
        case "error":
            return (NSColor(calibratedRed: 0.24, green: 0.07, blue: 0.10, alpha: 0.95),
                    NSColor(calibratedRed: 0.95, green: 0.35, blue: 0.40, alpha: 0.85))
        case "aborted":
            return (NSColor(calibratedRed: 0.18, green: 0.15, blue: 0.08, alpha: 0.95),
                    NSColor(calibratedRed: 0.95, green: 0.72, blue: 0.30, alpha: 0.85))
        case "thinking", "streaming":
            return (NSColor(calibratedRed: 0.05, green: 0.10, blue: 0.20, alpha: 0.94),
                    NSColor(calibratedRed: 0.25, green: 0.60, blue: 0.95, alpha: 0.75))
        case "working":
            return (NSColor(calibratedRed: 0.04, green: 0.11, blue: 0.19, alpha: 0.95),
                    NSColor(calibratedRed: 0.30, green: 0.80, blue: 0.95, alpha: 0.85))
        case "sleep":
            return (NSColor(calibratedRed: 0.08, green: 0.09, blue: 0.14, alpha: 0.92),
                    NSColor(calibratedWhite: 2, alpha: 0.15))
        default:
            return (NSColor(calibratedRed: 0.06, green: 0.09, blue: 0.15, alpha: 0.92),
                    NSColor(calibratedRed: 0.35, green: 0.45, blue: 0.60, alpha: 0.55))
        }
    }

    // MARK: hit testing / click through

    private func baseSpriteRect(for image: NSImage) -> NSRect {
        let width = image.size.width * CGFloat(pixelScale)
        let height = image.size.height * CGFloat(pixelScale)
        return NSRect(x: (bounds.width - width) / 2, y: 10, width: width, height: height)
    }

    private func isOpaquePoint(_ point: NSPoint) -> Bool {
        let frames = currentFrames()
        if !frames.isEmpty {
            let image = frames[0]
            let rect = baseSpriteRect(for: image).insetBy(dx: -10, dy: -10)
            if rect.contains(point) { return true }
        }
        if bubbleVisible {
            let height: CGFloat = detail.isEmpty ? 38 : 58
            let bubble = NSRect(x: (bounds.width - bubbleWidth) / 2, y: bounds.height - height - 6,
                                width: bubbleWidth, height: height)
            if bubble.contains(point) { return true }
        }
        return false
    }

    private func startClickThroughTracking() {
        clickThroughTimer?.invalidate()
        clickThroughTimer = Timer.scheduledTimer(withTimeInterval: 0.035, repeats: true) { [weak self] _ in
            guard let self, let window = self.window, !self.dragInProgress else { return }
            let mouse = NSEvent.mouseLocation
            // NSEvent.mouseLocation is in *screen* coordinates; convert through
            // the window before asking where the point lies inside this view.
            let windowPoint = window.convertPoint(fromScreen: mouse)
            let nearby = window.frame.insetBy(dx: -12, dy: -12).contains(mouse)
            let interactive = nearby && self.isOpaquePoint(self.convert(windowPoint, from: nil))
            let shouldIgnore = !interactive
            if window.ignoresMouseEvents != shouldIgnore {
                window.ignoresMouseEvents = shouldIgnore
                petLog("hover interactive=\(interactive) at \(windowPoint)")
            }
        }
    }

    // MARK: mouse

    override func mouseDown(with event: NSEvent) {
        dragStartPoint = NSEvent.mouseLocation
        dragStartOrigin = window?.frame.origin ?? .zero
        isDraggingPet = false
        dragInProgress = true
        petLog("mouseDown at \(dragStartPoint) window=\(dragStartOrigin)")
    }

    override func mouseDragged(with event: NSEvent) {
        guard let window else { return }
        let now = NSEvent.mouseLocation
        let dx = now.x - dragStartPoint.x
        let dy = now.y - dragStartPoint.y
        if abs(dx) > 2 || abs(dy) > 2 { isDraggingPet = true }
        window.setFrameOrigin(NSPoint(x: dragStartOrigin.x + dx, y: dragStartOrigin.y + dy))
    }

    override func mouseUp(with event: NSEvent) {
        dragInProgress = false
        petLog(isDraggingPet ? "dragEnd \(window?.frame.origin ?? .zero)" : "click")
        if isDraggingPet { onDragEnd?() } else { onClick?() }
    }

    override func rightMouseDown(with event: NSEvent) {
        onRightClick?(event)
    }

    override func scrollWheel(with event: NSEvent) {
        let delta = event.scrollingDeltaY
        petLog("scroll delta=\(delta) precise=\(event.hasPreciseScrollingDeltas)")
        guard abs(delta) > 0.5 else { return }
        let next = min(6, max(1, pixelScale + (delta > 0 ? 1 : -1)))
        guard next != pixelScale else { return }
        pixelScale = next
        petLog("scale \(next)")
        onScaleChange?(next)
    }

    override func magnify(with event: NSEvent) {
        petLog("magnify event \(event.magnification)")
        applyMagnify(delta: event.magnification)
    }

    @objc private func handleMagnifyGesture(_ recognizer: NSMagnificationGestureRecognizer) {
        petLog("magnify gesture \(recognizer.magnification) state=\(recognizer.state.rawValue)")
        if recognizer.state == .began { magnifyAccumulator = 0 }
        applyMagnify(delta: recognizer.magnification)
    }

    /// Accumulate small trackpad deltas, then step the integer pixel scale.
    private func applyMagnify(delta: CGFloat) {
        magnifyAccumulator += delta
        petLog("magnify accumulate=\(magnifyAccumulator)")
        guard abs(magnifyAccumulator) >= 0.12 else { return }
        let next = min(6, max(1, pixelScale + (magnifyAccumulator > 0 ? 1 : -1)))
        magnifyAccumulator = 0
        guard next != pixelScale else { return }
        pixelScale = next
        petLog("scale \(next)")
        onScaleChange?(next)
    }
}

// MARK: - Window that never steals focus

/// A non-activating floating panel: clicks and drags reach the pet without
/// moving keyboard focus away from DeepSeek Harness.
final class PetWindow: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

// MARK: - App delegate

final class PetApp: NSObject, NSApplicationDelegate {
    private var window: PetWindow!
    private var view: PetView!
    private var client: BridgeClient?
    private var muteItem: NSMenuItem!
    private var sound: NSSound?
    private var muted = ProcessInfo.processInfo.environment["DSH_TASK_PET_MUTED"].flatMap(Bool.init) ?? UserDefaults.standard.bool(forKey: "petMuted")
    private var lastSeq = -1
    private var lastMode = "disconnected"
    private var lastBubbleVisible = false
    /// How long a finished/failed/aborted bubble stays after the turn ends.
    /// Idle and sleep never show a bubble, so the pet collapses back to the
    /// sprite instead of keeping a "待命中" balloon on screen all session.
    /// Override with DSH_GRENINJA_PET_COMPLETION_MS.
    private let completionBubbleMilliseconds: Int = {
        let raw = ProcessInfo.processInfo.environment["DSH_GRENINJA_PET_COMPLETION_MS"] ?? ""
        return max(0, Int(raw) ?? 6000)
    }()
    private var connectedOnce = false
    private var disconnectedSince: Date?
    private var startedAt = Date()
    private var argumentPort: Int?
    private var argumentToken: String?
    private var skinPath: String?
    private var soundPath: String?
    private var snapshotPath: String?
    private var snapshotMode: String?
    private var snapshotScale: Int?

    func applicationDidFinishLaunching(_ notification: Notification) {
        parseArguments()
        NSApp.setActivationPolicy(.accessory)
        let storedScale = UserDefaults.standard.object(forKey: "petPixelScale") as? Int
        view = PetView(frame: .zero)
        view.pixelScale = min(6, max(1, snapshotScale ?? storedScale ?? 2))
        loadSkin()
        if let soundPath { sound = NSSound(contentsOfFile: soundPath, byReference: true) }
        buildWindow()
        if let snapshotPath {
            renderSnapshot(to: snapshotPath)
            return
        }
        connect()
        view.startAnimating()
    }

    private func parseArguments() {
        var arguments = CommandLine.arguments.dropFirst()
        while let flag = arguments.popFirst() {
            let value = arguments.popFirst()
            switch flag {
            case "--port": argumentPort = value.flatMap(Int.init)
            case "--token": argumentToken = value
            case "--skin": skinPath = value
            case "--sound": soundPath = value
            case "--snapshot": snapshotPath = value
            case "--mode": snapshotMode = value
            case "--scale": snapshotScale = value.flatMap(Int.init)
            default: break
            }
        }
    }

    /// Resolve the skin directory: explicit argument, then the user skin
    /// directory, then the bundled default skin.
    private func loadSkin() {
        let fileManager = FileManager.default
        let home = fileManager.homeDirectoryForCurrentUser
        var candidates: [URL] = []
        if let skinPath { candidates.append(URL(fileURLWithPath: skinPath)) }
        candidates.append(home.appendingPathComponent(".dsh/greninja-pet/skin"))
        candidates.append(home.appendingPathComponent(".dsh/greninja-pet-skin"))
        let executableDir = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent()
        candidates.append(executableDir.appendingPathComponent("../pet/assets"))
        candidates.append(executableDir.appendingPathComponent("pet/assets"))
        for candidate in candidates where fileManager.fileExists(atPath: candidate.path) {
            let skin = Skin(directory: candidate)
            if !skin.frames(for: "idle").isEmpty {
                view.skin = skin
                return
            }
        }
    }

    private func buildWindow() {
        view.onClick = { [weak self] in self?.focusDSH() }
        view.onDragEnd = { [weak self] in self?.saveOrigin() }
        view.onScaleChange = { [weak self] scale in self?.resizeForScale(scale) }
        view.onRightClick = { [weak self] event in
            guard let self else { return }
            NSMenu.popUpContextMenu(self.makeMenu(), with: event, for: self.view)
        }
        let size = view.requiredSize()
        let origin = restoredOrigin(size: size)
        window = PetWindow(contentRect: NSRect(origin: origin, size: size),
                           styleMask: [.borderless, .nonactivatingPanel],
                           backing: .buffered,
                           defer: false)
        window.isFloatingPanel = true
        window.becomesKeyOnlyIfNeeded = true
        window.hidesOnDeactivate = false
        window.worksWhenModal = true
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = false
        window.level = .floating
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        window.ignoresMouseEvents = false
        window.isMovable = false
        window.isReleasedWhenClosed = false
        view.frame = NSRect(origin: .zero, size: size)
        window.contentView = view
        window.orderFrontRegardless()
        petLog("started skin=\(view.skin?.displayName ?? "none") scale=\(view.pixelScale) frame=\(window.frame)")
    }

    private func restoredOrigin(size: NSSize) -> NSPoint {
        if let raw = UserDefaults.standard.string(forKey: "petOrigin") {
            let parts = raw.split(separator: ",").compactMap { Double($0) }
            if parts.count == 2 {
                let point = NSPoint(x: parts[0], y: parts[1])
                let rect = NSRect(origin: point, size: size)
                for screen in NSScreen.screens where NSIntersectsRect(screen.visibleFrame, rect) {
                    return clampedOrigin(point, size: size)
                }
            }
        }
        let screen = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        return NSPoint(x: screen.maxX - size.width - 16, y: screen.minY + 16)
    }

    private func clampedOrigin(_ origin: NSPoint, size: NSSize) -> NSPoint {
        let screen = NSScreen.screens.first { NSIntersectsRect($0.visibleFrame, NSRect(origin: origin, size: size)) }
            ?? NSScreen.main
        guard let frame = screen?.visibleFrame else { return origin }
        return NSPoint(
            x: min(max(origin.x, frame.minX), frame.maxX - size.width),
            y: min(max(origin.y, frame.minY), frame.maxY - size.height)
        )
    }

    private func saveOrigin() {
        UserDefaults.standard.set("\(window.frame.origin.x),\(window.frame.origin.y)", forKey: "petOrigin")
    }

    /// Resize the window for a zoom change, keeping the bottom-left corner and
    /// clamping the result on screen.
    private func resizeForScale(_ scale: Int) {
        let size = view.requiredSize()
        let origin = clampedOrigin(window.frame.origin, size: size)
        window.setFrame(NSRect(origin: origin, size: size), display: true)
        view.frame = NSRect(origin: .zero, size: size)
        UserDefaults.standard.set(scale, forKey: "petPixelScale")
        saveOrigin()
    }

    // MARK: snapshot mode

    private func renderSnapshot(to path: String) {
        let mode = snapshotMode ?? "working"
        view.mode = mode
        view.bubbleMode = mode
        view.bubbleVisible = true
        switch mode {
        case "working":
            view.title = "⚔️ bash · 已运行 3分12秒"
            view.detail = "待办 2/4 · 跑一遍测试"
        case "success":
            view.title = "✅ 任务完成 · 3分12秒"
            view.detail = "DeepSeek Harness 任务进度提醒插件"
        case "error":
            view.title = "💥 出错了"
            view.detail = "provider returned 500"
        case "thinking":
            view.title = "🤔 思考中 · 0分42秒"
            view.detail = "阅读项目代码"
        case "idle":
            view.title = "💤 待命中"
            view.detail = ""
        default:
            view.title = "🔌 连接断开"
            view.detail = ""
        }
        let size = view.requiredSize()
        view.frame = NSRect(origin: .zero, size: size)
        view.layoutSubtreeIfNeeded()
        view.display()
        guard let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else {
            NSApp.terminate(nil)
            return
        }
        view.cacheDisplay(in: view.bounds, to: rep)
        if let data = rep.representation(using: .png, properties: [:]) {
            try? data.write(to: URL(fileURLWithPath: path))
            print("snapshot written to \(path)")
        }
        NSApp.terminate(nil)
    }

    // MARK: bridge wiring

    private func connect() {
        if let port = argumentPort {
            start(port: port, token: argumentToken)
            return
        }
        if let discovered = readBridgeDiscovery() {
            start(port: discovered.port, token: discovered.token)
            return
        }
        view.mode = "disconnected"
        view.title = "等待 DeepSeek Harness…"
        view.detail = ""
        view.bubbleVisible = true
        if Date().timeIntervalSince(startedAt) > 300 {
            NSApp.terminate(nil)
            return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in self?.connect() }
    }

    private func start(port: Int, token: String?) {
        client?.stop()
        let client = BridgeClient(port: port, token: token)
        client.onState = { [weak self] state in self?.apply(state) }
        client.onFailure = { [weak self] in self?.handleFailure() }
        self.client = client
        client.start()
    }

    private func handleFailure() {
        if connectedOnce {
            if disconnectedSince == nil { disconnectedSince = Date() }
            let downtime = Date().timeIntervalSince(disconnectedSince ?? Date())
            view.mode = "disconnected"
            view.title = "连接断开"
            view.detail = downtime > 3 ? "DSH 可能已经关闭" : "重连中…"
            view.bubbleVisible = true
            if downtime > 10 { NSApp.terminate(nil) }
        }
    }

    private func apply(_ state: BridgeState) {
        connectedOnce = true
        disconnectedSince = nil
        let mode = normalizedMode(state.mode)
        view.mode = mode
        var displayMode = mode
        var title = bubbleTitle(state: state, mode: mode)
        var detail = bubbleDetail(state: state, mode: mode)
        // Only active work (and a short completion window) needs a bubble.
        let runningModes: Set<String> = ["thinking", "working", "streaming", "disconnected", "success", "error", "aborted"]
        var visible = runningModes.contains(mode)

        if mode == "idle" || mode == "sleep" {
            if let event = state.lastEvent,
               event.kind == "success" || event.kind == "error" || event.kind == "aborted" {
                let age = state.now - event.at
                if age >= 0 && age < Double(completionBubbleMilliseconds) {
                    displayMode = event.kind
                    title = bubbleTitle(state: state, mode: event.kind)
                    detail = bubbleDetail(state: state, mode: event.kind)
                    visible = true
                }
            }
        }
        view.bubbleMode = displayMode
        view.bubbleVisible = visible
        if visible != lastBubbleVisible {
            lastBubbleVisible = visible
            petLog("bubble visible=\(visible) mode=\(displayMode)")
        }
        view.title = title
        view.detail = detail
        if state.seq != lastSeq {
            let previous = lastSeq
            lastSeq = state.seq
            if previous >= 0, let event = state.lastEvent,
               event.kind == "success" || event.kind == "error" {
                playChime(for: event.kind)
            }
        }
        if mode != lastMode { lastMode = mode }
    }

    private func normalizedMode(_ raw: String) -> String {
        switch raw {
        case "idle", "thinking", "working", "streaming", "success", "error", "aborted", "sleep": return raw
        default: return "idle"
        }
    }

    private func bubbleTitle(state: BridgeState, mode: String) -> String {
        let running = state.sessions.first(where: { $0.phase == "working" || $0.phase == "thinking" || $0.phase == "streaming" })
        let duration = formatDuration(ms: running?.elapsedMs ?? 0)
        switch mode {
        case "working":
            if let tool = running?.tool { return "⚔️ \(tool.name) · 已运行 \(duration)" }
            return "⚔️ 执行任务中 · \(duration)"
        case "thinking": return "🤔 思考中 · \(duration)"
        case "streaming": return "✍️ 写回答中 · \(duration)"
        case "success": return "✅ 任务完成 · \(formatDuration(ms: state.lastEvent?.elapsedMs ?? 0))"
        case "error": return "💥 出错了"
        case "aborted": return "🛑 任务已停止"
        case "sleep": return "😴 睡着啦"
        case "disconnected": return "🔌 连接断开"
        default: return "💤 待命中"
        }
    }

    private func bubbleDetail(state: BridgeState, mode: String) -> String {
        switch mode {
        case "working":
            if let session = state.sessions.first(where: { $0.phase == "working" }) {
                if let todos = session.todos {
                    let suffix = todos.current.isEmpty ? "" : " · \(todos.current)"
                    return "待办 \(todos.done)/\(todos.total)\(suffix)"
                }
                return clip(session.title, 24)
            }
            return ""
        case "success", "error", "aborted":
            if let event = state.lastEvent { return clip(event.title, 26) }
            return ""
        case "thinking", "streaming":
            if let active = state.sessions.first { return clip(active.title, 26) }
            return ""
        default:
            if state.activeCount > 1 { return "\(state.activeCount) 个任务在跑" }
            return ""
        }
    }

    private func playChime(for kind: String) {
        guard !muted else { return }
        let soundURL = view.skin?.stateSounds[kind]
        let player = soundURL.flatMap { NSSound(contentsOf: $0, byReference: true) } ?? sound
        guard let player else { return }
        if player.isPlaying { player.stop() }
        player.play()
    }

    // MARK: interactions

    private func focusDSH() {
        for app in NSWorkspace.shared.runningApplications where app.bundleIdentifier == "com.deepseek.dsh" {
            app.activate(options: [.activateAllWindows])
            return
        }
        let url = URL(fileURLWithPath: "/Applications/DeepSeek Harness.app")
        NSWorkspace.shared.openApplication(at: url, configuration: NSWorkspace.OpenConfiguration(), completionHandler: nil)
    }

    private func toggleMute() {
        muted.toggle()
        UserDefaults.standard.set(muted, forKey: "petMuted")
        muteItem?.title = muted ? "取消静音" : "静音"
    }

    private func hideTemporarily() {
        window.orderOut(nil)
        DispatchQueue.main.asyncAfter(deadline: .now() + 900) { [weak self] in self?.window.orderFrontRegardless() }
    }

    private func resetPosition() {
        let size = window.frame.size
        let screen = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        window.setFrameOrigin(NSPoint(x: screen.maxX - size.width - 16, y: screen.minY + 16))
        saveOrigin()
    }

    private func openAssetSite() {
        if let url = URL(string: "https://www.spriters-resource.com/") { NSWorkspace.shared.open(url) }
    }

    private func copyAssetPrompt() {
        let prompt = """
        帮我给 DSH 忍蛙桌宠安装一套自定义素材（只用于个人自用，注意素材版权）：
        1. 打开素材网站（例如 https://www.spriters-resource.com/ 或 https://pokemondb.net/sprites ），下载透明背景的 PNG 像素图；
        2. 保存到 ~/.dsh/greninja-pet/skin/ 目录（没有就创建），默认图命名为 idle.png；
        3. 想给每个状态单独配图时，在同目录写 skin.json，例如：
           {
             "name": "我的宠物",
             "states": {
               "idle":    { "sprite": "idle.png" },
               "working": { "sprite": "working.png" },
               "success": { "frames": ["win1.png", "win2.png"], "fps": 8 },
               "error":   { "sprite": "error.png", "sound": "fail.mp3" }
             }
           }
           未配置的状态会回退到 idle。
        4. 重启 DeepSeek Harness，宠物就会使用新素材。
        """
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(prompt, forType: .string)
    }

    func makeMenu() -> NSMenu {
        let menu = NSMenu()
        let focus = NSMenuItem(title: "回到 DeepSeek Harness", action: #selector(menuFocus), keyEquivalent: "")
        focus.target = self
        menu.addItem(focus)
        menu.addItem(.separator())
        let mute = NSMenuItem(title: muted ? "取消静音" : "静音", action: #selector(menuMute), keyEquivalent: "")
        mute.target = self
        muteItem = mute
        menu.addItem(mute)

        let sizeItem = NSMenuItem(title: "大小", action: nil, keyEquivalent: "")
        let sizeMenu = NSMenu()
        for (label, value) in [("小", 1), ("中", 2), ("大", 3), ("特大", 4)] {
            let item = NSMenuItem(title: label, action: #selector(menuSetScale(_:)), keyEquivalent: "")
            item.tag = value
            item.target = self
            sizeMenu.addItem(item)
        }
        sizeMenu.addItem(.separator())
        let zoomIn = NSMenuItem(title: "放大一级", action: #selector(menuZoomIn), keyEquivalent: "")
        zoomIn.target = self
        sizeMenu.addItem(zoomIn)
        let zoomOut = NSMenuItem(title: "缩小一级", action: #selector(menuZoomOut), keyEquivalent: "")
        zoomOut.target = self
        sizeMenu.addItem(zoomOut)
        sizeItem.submenu = sizeMenu
        menu.addItem(sizeItem)

        let moveItem = NSMenuItem(title: "移动", action: nil, keyEquivalent: "")
        let moveMenu = NSMenu()
        for (label, tag) in [("上移", 1), ("下移", 2), ("左移", 3), ("右移", 4)] {
            let item = NSMenuItem(title: label, action: #selector(menuMove(_:)), keyEquivalent: "")
            item.tag = tag
            item.target = self
            moveMenu.addItem(item)
        }
        moveItem.submenu = moveMenu
        menu.addItem(moveItem)

        let reset = NSMenuItem(title: "复位位置", action: #selector(menuResetPosition), keyEquivalent: "")
        reset.target = self
        menu.addItem(reset)
        menu.addItem(.separator())

        let assets = NSMenuItem(title: "获取宠物素材", action: nil, keyEquivalent: "")
        let assetsMenu = NSMenu()
        let open = NSMenuItem(title: "打开素材网站…", action: #selector(menuOpenAssets), keyEquivalent: "")
        open.target = self
        assetsMenu.addItem(open)
        let copy = NSMenuItem(title: "复制给 Agent 的安装指令", action: #selector(menuCopyPrompt), keyEquivalent: "")
        copy.target = self
        assetsMenu.addItem(copy)
        assets.submenu = assetsMenu
        menu.addItem(assets)

        menu.addItem(.separator())
        let hide = NSMenuItem(title: "隐藏 15 分钟", action: #selector(menuHide), keyEquivalent: "")
        hide.target = self
        menu.addItem(hide)
        let quit = NSMenuItem(title: "退出宠物", action: #selector(menuQuit), keyEquivalent: "")
        quit.target = self
        menu.addItem(quit)
        return menu
    }

    @objc private func menuFocus() { focusDSH() }
    @objc private func menuMute() { toggleMute() }
    @objc private func menuHide() { hideTemporarily() }
    @objc private func menuQuit() { NSApp.terminate(nil) }
    @objc private func menuSetScale(_ sender: NSMenuItem) {
        view.pixelScale = sender.tag
        resizeForScale(sender.tag)
    }
    @objc private func menuResetPosition() { resetPosition() }
    @objc private func menuZoomIn() {
        view.pixelScale = min(6, view.pixelScale + 1)
        resizeForScale(view.pixelScale)
    }
    @objc private func menuZoomOut() {
        view.pixelScale = max(1, view.pixelScale - 1)
        resizeForScale(view.pixelScale)
    }
    @objc private func menuMove(_ sender: NSMenuItem) {
        let step: CGFloat = 24
        var origin = window.frame.origin
        switch sender.tag {
        case 1: origin.y += step
        case 2: origin.y -= step
        case 3: origin.x -= step
        case 4: origin.x += step
        default: break
        }
        window.setFrameOrigin(clampedOrigin(origin, size: window.frame.size))
        saveOrigin()
        petLog("menuMove tag=\(sender.tag) frame=\(window.frame)")
    }
    @objc private func menuOpenAssets() { openAssetSite() }
    @objc private func menuCopyPrompt() { copyAssetPrompt() }
}

// MARK: - Entry point

let app = NSApplication.shared
let delegate = PetApp()
app.delegate = delegate
app.run()
