/**
 * 플러그인 루트(manifest.json 있는 폴더) 기준 경로.
 * `src` 이나 `scripts` 위치를 바꿀 때는 여기와 package.json의 npm 스크립트만 맞추면 됨.
 *
 * Figma가 읽는 메인 스크립트: manifest "main" → OUT_CODE (빌드로 생성). 편집 원본은 MAIN_SOURCE_DIR.
 */
var path = require("path")

var PLUGIN_ROOT = __dirname

module.exports = {
    PLUGIN_ROOT: PLUGIN_ROOT,
    /** 메인 스레드 소스 파트 (*.js) — 폴더명을 바꾸면 아래 segment만 수정 */
    MAIN_SOURCE_DIR: path.join(PLUGIN_ROOT, "src"),
  OUT_CODE: path.join(PLUGIN_ROOT, "code.js"),
  LEGACY_PATH: path.join(PLUGIN_ROOT, "code.legacy.js"),
}
