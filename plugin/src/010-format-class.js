/**
 * 010-format-class — 숫자/CSS 출력, ap- 클래스·BEM, 레이어 이름 규칙(code-btn / code-slide / code-video / code-raster)
 *
 * r2, cssOutNum, cssOutLayoutPx, layoutPxInt, layoutPxNum — Figma 수치 → CSS 문자열·비교용 정수
 * useApFlexClass — 불필요한 ap-flex 생략 여부
 * pad2, sectionClassPrefix — 섹션 번호 → "01" 형태 클래스 접두
 * stripApAiAuditBlock — AI 검수 HTML 주석 제거(ZIP용)
 * makeClassName, nodeUniqueClass, apSectionBem — 클래스 문자열 생성
 * isNodeName, isBtnNode, isVideoNode, isSlideNode, isCodeRasterNode — 레이어명 기반 특수 처리 판별
 */
// ----- 공통·포맷 (r2, 클래스, BEM) + Core 일부(레이어명 판별은 아래 isNodeName~) -----
/** 숫자를 소수 둘째 자리까지 반올림 */
function r2(v) {
    return Math.round(v * 100) / 100
}
/** CSS 출력용: 거의 정수면 정수, 아니면 소수 최대 2자리·불필요한 끝 0 제거 */
function cssOutNum(v) {
    if (v == null || v === "") return ""
    var n = Number(v)
    if (!isFinite(n)) return String(v)
    if (Math.abs(n - Math.round(n)) < 1e-4) return String(Math.round(n))
    var x = Math.round(n * 100) / 100
    if (Math.abs(x - Math.round(x)) < 1e-4) return String(Math.round(x))
    var s = x.toFixed(2).replace(/\.?0+$/, "")
    return s
}
/** 간격·패딩 등 레이아웃 px: 정수로 통일 (Figma 부동소수·긴 소수 제거) */
function cssOutLayoutPx(v) {
    if (v == null || v === "") return ""
    var n = Number(v)
    if (!isFinite(n)) return String(v)
    return String(Math.round(n))
}
/** 레이아웃 숫자 비교용 (부동소수·문자열 차이로 인한 불필요한 MO :0 방지) */
function layoutPxInt(s) {
    return Math.round(Number(s !== "" && s != null ? s : 0) || 0)
}
/** 좌표·크기 비교용 */
function layoutPxNum(n) {
    if (n == null || !isFinite(Number(n))) return 0
    return Math.round(Number(n))
}
/** abs+AutoLayout: 자식 없고 갭·패딩도 없으면 ap-flex 불필요(display:flex 낭비) */
function useApFlexClass(node, abs, flex) {
    if (!flex) return false
    if (!abs) return true
    var vis = 0
    var ch = (node && node.children) || []
    for (var i = 0; i < ch.length; i++) {
        if (ch[i] && isVisible(ch[i])) vis++
    }
    if (vis > 0) return true
    var lv = getLayoutVars(node)
    if (!lv) return false
    return (
        layoutPxInt(lv.gap) !== 0 ||
        layoutPxInt(lv.pt) !== 0 ||
        layoutPxInt(lv.pr) !== 0 ||
        layoutPxInt(lv.pb) !== 0 ||
        layoutPxInt(lv.pl) !== 0
    )
}
/** 1~9를 "01", "02" 형태 2자리 문자열로 */
function pad2(n) {
    n = Number(n) || 0
    return (n < 10 ? "0" : "") + String(n)
}
/** 섹션 인덱스 → CSS 클래스 접두어 (1 → "01") */
function sectionClassPrefix(oneBasedIndex) {
    var n = Math.max(1, Math.floor(oneBasedIndex))
    return (n < 10 ? "0" : "") + n
}
/** ap-ai-audit 주석 블록 — ZIP 등 산출물에 포함하지 않음 */
function stripApAiAuditBlock(html) {
    return String(html || "").replace(
        /<!--\s*ap-ai-audit:start\s*-->[\s\S]*?<!--\s*ap-ai-audit:end\s*-->\s*/gi,
        ""
    )
}

/** 모든 토큰에 ap- 강제 (소문자·하이픈) */
function makeClassName(name) {
    name = String(name || "").trim().toLowerCase()
    name = name.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    if (!name) name = "node"
    if (name.indexOf("ap-") !== 0) name = "ap-" + name
    return name
}
/** CSS/HTML 공통: 노드별 유일 클래스 (data-node-id 셀렉터 대체) */
function nodeUniqueClass(id) {
    if (id == null || String(id) === "") return makeClassName("anon")
    var slug = String(id)
        .replace(/:/g, "-")
        .replace(/[^a-z0-9-]/gi, "-")
        .replace(/^-+|-+$/g, "")
    if (!slug) slug = "x"
    return makeClassName("n-" + slug)
}
/** BEM 요소: ap-section__title, ap-section__content */
function apSectionBem(part) {
    var p = String(part || "item")
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .replace(/^-+|-+$/g, "") || "item"
    return "ap-section__" + p
}
/** 레이어 이름이 지정 문자열과 일치하는지 (대소문자 무관, trim) */
function isNodeName(node, name) {
    return !!(node && String(node.name || "").trim().toLowerCase() === name)
}
/** 레이어 이름이 code-btn이면 <a class="ap-btn"> 링크 (정확히 일치, 대소문자 무관) */
function isBtnNode(node) {
    return isNodeName(node, "code-btn")
}
/** 레이어 이름이 code-video이면 비디오 플레이스홀더 */
function isVideoNode(node) {
    return isNodeName(node, "code-video")
}
/** 레이어 이름이 code-slide이면 Swiper 구조 */
function isSlideNode(node) {
    return isNodeName(node, "code-slide")
}
/** 레이어 이름이 code-raster이면 단일 래스터 이미지 export 강제(벡터·다중 자식 분할 등 일반 규칙보다 우선) */
function isCodeRasterNode(node) {
    return isNodeName(node, "code-raster")
}

