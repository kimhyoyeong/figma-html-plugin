/**
 * 00-entry — 플러그인 UI 띄우기 + AI 관련 전역 기본값
 *
 * Figma 엔트리: manifest "main" → plugin/code.js (빌드 산출물). 편집은 이 파일 등 src/*.js.
 *
 * - figma.showUI: ui.html 로드 (900×900)
 * - AP_* 상수: UI 초기값 등 (postMessage로 ui에 전달)
 * - setTimeout(0): 플러그인 부팅 직후 AI_UI_DEFAULTS 메시지 (비전 alt, Gemini 기본 등)
 */
// Figma → HTML/CMS export.
// 소스 파트는 build-paths.js 의 MAIN_SOURCE_DIR · 합쳐서 plugin/code.js (npm run build).
figma.showUI(__html__, {width: 1200, height: 900})

// ui 검수: 비전 기본 ON. AI 제공자·모델 기본값을 UI에 전달.
setTimeout(function () {
    try {
        figma.ui.postMessage({
            type: "AI_UI_DEFAULTS",
            aiVisionAlt: true,
            aiProvider: "gemini",
            aiGeminiModel: "gemini-2.5-flash"
        })
    } catch (e) {}
}, 0)
