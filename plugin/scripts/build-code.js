/**
 * Figma 플러그인 메인 스레드 빌드
 *
 * 소스: build-paths.js 의 MAIN_SOURCE_DIR/*.js (순서는 PART_FILES)
 * 산출: build-paths.js 의 OUT_CODE (= manifest.json 의 "main", Figma가 실행하는 파일)
 *
 * PART_FILES 번호(00, 010, …)는 「단일 code.js로 이어붙이는 순서」일 뿐이며,
 * 런타임 처리 파이프라인 단계(먼저 A 다음 B)와 1:1로 대응하지 않음.
 * 머릿속 기준: 070 이미지·분류, 080 폰트/TEXT, 081 섹션 BEM·GEO, 082 지연 CSS, 083 에셋 경로, 085 배경.
 *
 *   npm run build — code.js만 (UI는 plugin/ui.html 단일 파일)
 *   경로 변경: plugin/build-paths.js
 *   code.legacy.js — 과거 단일 파일 스냅샷; extract 서브커맨드로만 src 분할에 사용
 */
/* eslint-disable no-console */
var fs = require("fs")
var path = require("path")

var paths = require("../build-paths.js")
var LEGACY_PATH = paths.LEGACY_PATH
var OUT_PATH = paths.OUT_CODE
var PARTS_DIR = paths.MAIN_SOURCE_DIR

/** code.legacy.js → src 분할용 (과거 줄 번호). 파일 추가 시 수동 갱신 필요. */
var LEGACY_SLICES = [
    ["00-entry.js", 1, 23],
    ["010-format-class.js", 25, 137],
    ["020-slide.js", 138, 392],
    ["030-shape.js", 393, 474],
    ["040-text-utils.js", 475, 733],
    ["050-core-node.js", 734, 824],
    ["060-layout.js", 825, 1291],
    ["070-image-export.js", 1292, 2445],
    ["080-text-fonts.js", 2446, 3603],
    ["085-section-background.js", 3604, 3657],
    ["090-tree-inspect.js", 3658, 3767],
    ["095-responsive-pcmo.js", 3768, 4216],
    ["096-html-code-builder.js", 4443, 5461],
    ["097-dump-tree-async.js", 4217, 4442],
    ["099-ui-router.js", 5462, 5751],
]

var PART_FILES = [
    "00-entry.js",
    "010-format-class.js",
    "020-slide.js",
    "030-shape.js",
    "040-text-utils.js",
    "050-core-node.js",
    "060-layout.js",
    "070-image-export.js",
    "080-text-fonts.js",
    "081-section-semantics.js",
    "082-deferred-css.js",
    "083-assets-cache.js",
    "085-section-background.js",
    "090-tree-inspect.js",
    "095-responsive-pcmo.js",
    "096-html-code-builder.js",
    "097-dump-tree-async.js",
    "099-ui-router.js",
]

function sliceLines(text, startLine, endLine) {
    var lines = text.split(/\r?\n/)
    return lines.slice(startLine - 1, endLine).join("\n") + "\n"
}

function extractFromLegacy() {
    if (!fs.existsSync(LEGACY_PATH)) {
        console.error("Missing " + LEGACY_PATH + " — copy current code.js there and re-run extract.")
        process.exit(1)
    }
    var text = fs.readFileSync(LEGACY_PATH, "utf8")
    if (!fs.existsSync(PARTS_DIR)) fs.mkdirSync(PARTS_DIR, { recursive: true })
    for (var i = 0; i < LEGACY_SLICES.length; i++) {
        var t = LEGACY_SLICES[i]
        var name = t[0]
        var start = t[1]
        var end = t[2]
        var body = sliceLines(text, start, end)
        fs.writeFileSync(path.join(PARTS_DIR, name), body, "utf8")
        console.log("Wrote " + name)
    }
    console.log("Done. Run `node plugin/scripts/build-code.js` to regenerate code.js")
}

function build() {
    if (!fs.existsSync(PARTS_DIR)) {
        console.error("Missing folder " + PARTS_DIR)
        process.exit(1)
    }
    var chunks = []
    for (var j = 0; j < PART_FILES.length; j++) {
        var fn = PART_FILES[j]
        var p = path.join(PARTS_DIR, fn)
        if (!fs.existsSync(p)) {
            console.error("Missing part file: " + p)
            process.exit(1)
        }
        chunks.push(fs.readFileSync(p, "utf8"))
    }
    var out = chunks.join("\n")
    fs.writeFileSync(OUT_PATH, out, "utf8")
    console.log("Wrote " + OUT_PATH + " (" + out.split(/\r?\n/).length + " lines)")
}

module.exports = { build: build, extractFromLegacy: extractFromLegacy }

if (require.main === module) {
    var cmd = process.argv[2]
    if (cmd === "extract") {
        extractFromLegacy()
    } else {
        build()
    }
}
