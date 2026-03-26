/**
 * 메인 스레드 소스 → code.js 감시 (경로는 ../build-paths.js)
 * UI는 plugin/ui.html 단일 파일 — 수정 후 Figma에서 플러그인 다시 실행.
 *
 *   npm run dev
 */
/* eslint-disable no-console */
var fs = require("fs")
var path = require("path")

var paths = require("../build-paths.js")
var PARTS_DIR = paths.MAIN_SOURCE_DIR

var buildCode = require("./build-code.js")

var debounceMs = 150
var t = null

function runBuild() {
    try {
        buildCode.build()
        console.log("[code] " + new Date().toLocaleTimeString())
    } catch (e) {
        console.error("[code] build failed:", e)
    }
}

function schedule() {
    if (t) clearTimeout(t)
    t = setTimeout(function () {
        t = null
        runBuild()
    }, debounceMs)
}

if (!fs.existsSync(PARTS_DIR)) {
    console.error("Missing " + PARTS_DIR)
    process.exit(1)
}

runBuild()

console.log("")
console.log("dev — " + path.relative(process.cwd(), PARTS_DIR) + " → " + path.relative(process.cwd(), paths.OUT_CODE))
console.log("UI는 plugin/ui.html 단일 파일. 저장 후 Figma 플러그인 다시 실행.")
console.log("종료: Ctrl+C")
console.log("")

try {
    fs.watch(PARTS_DIR, { recursive: true }, function (_ev, filename) {
        if (!filename) return
        var lower = String(filename).toLowerCase()
        if (!lower.endsWith(".js")) return
        schedule()
    })
} catch (e) {
    console.error("watch:", e.message)
    process.exit(1)
}
