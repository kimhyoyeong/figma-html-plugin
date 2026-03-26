/**
 * 090-tree-inspect — 레이어 인스펙트 텍스트 덤프용 요약 + ROOT/섹션 해석
 *
 * 경계: 덤프 한 줄 요약·PC/MO 매칭·섹션 후보 목록. 비동기 전체 빌드 루프는 097, HTML 생성은 096.
 *
 * oneLineBase, dumpPadKey — 덤프 한 줄·키 패딩
 * bgDetails, flexDetails, layoutChildDetails — 배경·flex·자식 sizing 덤프 문자열
 * getFillFlexStartWidthDecl — FILL + flex-start일 때 width:100% 보조 선언
 * resolveDesktopMobile — 선택 2개 시 가로 큰 쪽=PC, breakpoint=MO 폭
 * getSectionNodes — ROOT 직계 보이는 자식 = 섹션 후보 목록
 */
// ----- Node Inspect / Dump (트리 덤프, PC/MO 매칭) -----
/** 덤프용 한 줄 요약: 타입, 이름, 플래그(FLEX/ABS/TEXT 등) */
function oneLineBase(node) {
    var t = node.type
    var name = String(node.name || "")
    var flags = []
    if (isFlex(node)) flags.push("FLEX")
    else if (node.type === "FRAME" || isContainer(node)) flags.push("ABS")
    if (node.type === "TEXT") flags.push("TEXT")
    if (hasImageFill(node)) flags.push("IMG_FILL")
    if (isVectorOnlyTree(node)) flags.push("VEC_ONLY")
    if (isCompositeCandidate(node)) flags.push("COMPOSITE?")
    return t + '  "' + name + '"' + (flags.length ? "  [" + flags.join(",") + "]" : "")
}
/** 덤프 키 정렬용 패딩 문자열 */
function dumpPadKey(key) {
    var DUMP_KEY_WIDTH = 18
    var s = key + ":"
    while (s.length < DUMP_KEY_WIDTH + 1) s += " "
    return s
}
/** 노드 배경/테두리 덤프 문자열 */
function bgDetails(node) {
    if (!node) return ""
    var parts = []
    if (hasImageFill(node)) parts.push("image")
    var solid = getFirstSolidFill(node)
    if (solid && solid.color) parts.push("color:" + solid.color)
    var stroke = getFirstSolidStroke(node)
    if (stroke && stroke.color) {
        var same = stroke.top === stroke.right && stroke.right === stroke.bottom && stroke.bottom === stroke.left
        var strokeDesc = same ? "border:" + stroke.top + "px " + (stroke.dashes ? "dashed" : "solid") + " " + stroke.color : "border T:" + stroke.top + " R:" + stroke.right + " B:" + stroke.bottom + " L:" + stroke.left + " " + (stroke.dashes ? "dashed" : "solid") + " " + stroke.color
        parts.push(strokeDesc)
    }
    if (parts.length === 0) return ""
    var s = parts.join(", ")
    if (parts.length > 1) s += " (둘 다)"
    return s
}
/** Auto Layout 노드 덤프용 flex 관련 문자열 */
function flexDetails(node) {
    if (!isFlex(node)) return ""
    var v = getLayoutVars(node)
    var parts = []
    parts.push("flex-direction:" + (v.direction || ""))
    parts.push("gap:" + (v.gap !== "" ? v.gap : "0"))
    parts.push("padding:" + [v.pt, v.pr, v.pb, v.pl].join(" "))
    parts.push("justify-content:" + (v.justify || "flex-start"))
    parts.push("align-items:" + (v.align || "flex-start"))
    parts.push("flex-wrap:" + (v.wrap || ""))
    return parts.join("; ")
}
/** 자식 노드 layout sizing/align 덤프 문자열 */
function layoutChildDetails(node) {
    var parts = []
    try {
        var box = getAbs(node)
        if ("layoutSizingHorizontal" in node && node.layoutSizingHorizontal) {
            var w = node.layoutSizingHorizontal
            if (w === "FILL") parts.push("width:fill")
            else if (w === "HUG") parts.push("width:auto")
            else if (w === "FIXED" && box && box.w != null) parts.push("width:" + r2(box.w) + "px")
        }
        if ("layoutSizingVertical" in node && node.layoutSizingVertical) {
            var h = node.layoutSizingVertical
            if (h === "FILL") parts.push("height:fill")
            else if (h === "HUG") parts.push("height:auto")
            else if (h === "FIXED" && box && box.h != null) parts.push("height:" + r2(box.h) + "px")
        }
        if ("layoutAlign" in node && node.layoutAlign && node.layoutAlign !== "INHERIT") {
            var a = String(node.layoutAlign).toUpperCase()
            if (a === "STRETCH") parts.push("align-self:stretch")
            else if (a === "MIN") parts.push("align-self:flex-start")
            else if (a === "CENTER") parts.push("align-self:center")
            else if (a === "MAX") parts.push("align-self:flex-end")
        }
        if ("layoutGrow" in node && node.layoutGrow !== undefined) parts.push("flex-grow:" + node.layoutGrow)
    } catch (e) {}
    return parts.length ? parts.join("; ") : ""
}

/** width:fill + 부모 flex-start일 때만 width:100% 반환 (코드 생성용) */
function getFillFlexStartWidthDecl(node, parent) {
    if (!node || !parent || !isFlex(parent)) return ""
    if (node.layoutSizingHorizontal !== "FILL") return ""
    var pv = getLayoutVars(parent)
    var isColumn = pv.direction === "column"
    if (isColumn && (pv.align === "" || pv.align === "flex-start")) return "width:100%"
    if (!isColumn && (pv.justify === "" || pv.justify === "flex-start")) return "width:100%"
    return ""
}

/** 선택 2개 시 가로 큰 쪽=데스크톱, 작은 쪽=모바일. breakpoint = 모바일 width */
function resolveDesktopMobile(sel) {
    if (!sel || sel.length < 2) return null
    var a = sel[0]
    var b = sel[1]
    var wa = (getAbs(a) && getAbs(a).w) != null ? getAbs(a).w : 0
    var wb = (getAbs(b) && getAbs(b).w) != null ? getAbs(b).w : 0
    if (wa >= wb) return {desktopRoot: a, mobileRoot: b, breakpoint: r2(wb) || 750}
    return {desktopRoot: b, mobileRoot: a, breakpoint: r2(wa) || 750}
}

/** 선택 ROOT의 보이는 직계 자식 각각 = `<section>`(ap-section--01..). 직계 자식마다 섹션을 쪼개면 배경-only·본문 분리 등 루트 레이아웃이 깨질 수 있음. */
function getSectionNodes(root) {
    if (!root || !isContainer(root)) return []
    return (root.children || []).filter(function (c) {
        return c && isVisible(c)
    })
}
