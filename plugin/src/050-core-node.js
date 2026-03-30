/**
 * 050-core-node — 바운딩 박스, 가시성, Auto Layout, 절대배치 판별
 *
 * 경계: 단일 노드 메타·가시성·flex/abs 판별. 전 트리 워크·데이터트리·HTML 조립은 090·097·096 쪽.
 *
 * getAbs — absoluteBoundingBox → {x,y,w,h}
 * getTextRasterBounds — TEXT는 렌더 bounds 우선(이미지 export·abs)
 * getRasterExportBounds — 래스터 export·ap-abs와 동일하게 시각 영역(absoluteRenderBounds, 클립 반영) 우선
 * isContainer, isVisible, hasVisibleChildren — 트리 순회·export 필터
 * isFlex — layoutMode !== NONE
 * isAbsoluteInParent, isAbsolutePositioned, isAbsoluteByParentNotFlex, isAbsoluteLike — CSS ap-abs 판별
 * containerNeedsRelativeForAbsoluteChildren — 비-flex 부모에 position:relative 필요 여부
 * containerAllVisibleChildrenAreAbsolute — 보이는 직계 자식이 1개 이상이며 전부 ap-abs 계열이면 true (플로우 높이 0 방지용)
 */
// ----- 2. Core Node Utils (bounds, visibility, flex/abs; 레이어명·slide 판별은 상단) -----
/** 노드 absoluteBoundingBox → {x,y,w,h} (r2 적용) */
function getAbs(node) {
    try {
        var b = node.absoluteBoundingBox
        if (!b) return null
        return {x: r2(b.x), y: r2(b.y), w: r2(b.width), h: r2(b.height)}
    } catch (e) {
        return null
    }
}

/** TEXT 래스터: 프레임(absoluteBoundingBox)이 아니라 실제 그려진 영역(absoluteRenderBounds) — 넓은 텍스트 박스·여백 방지 */
function getTextRasterBounds(node) {
    if (!node || node.type !== "TEXT") return null
    try {
        var rb = node.absoluteRenderBounds
        if (rb && typeof rb.x === "number" && typeof rb.y === "number" && typeof rb.width === "number" && typeof rb.height === "number" && rb.width > 0 && rb.height > 0)
            return {x: r2(rb.x), y: r2(rb.y), w: r2(rb.width), h: r2(rb.height)}
    } catch (e) {}
    return getAbs(node)
}

/** PNG/JPG export(useAbsoluteBounds false)와 동일: 그려진 시각 영역. 없거나 0이면 getAbs */
function getRasterExportBounds(node) {
    if (!node) return null
    try {
        var rb = node.absoluteRenderBounds
        if (rb && typeof rb.x === "number" && typeof rb.y === "number" && typeof rb.width === "number" && typeof rb.height === "number" && rb.width > 0 && rb.height > 0)
            return {x: r2(rb.x), y: r2(rb.y), w: r2(rb.width), h: r2(rb.height)}
    } catch (e) {}
    return getAbs(node)
}

/** 자식이 있는 노드(컨테이너) 여부 */
function isContainer(node) {
    return !!(node && "children" in node && node.children && node.children.length)
}
/** 노드가 보이는 상태(visible !== false)인지 */
function isVisible(node) {
    return node != null && node.visible !== false
}
/** 보이는 자식이 하나라도 있는지 (이미지 fill 클론 export 등) */
function hasVisibleChildren(node) {
    return !!(node && node.children && node.children.some(function (c) { return c && isVisible(c) }))
}
/** Auto Layout이 켜진 노드 여부 */
function isFlex(node) {
    try {
        return "layoutMode" in node && node.layoutMode && node.layoutMode !== "NONE"
    } catch (e) {
        return false
    }
}
/** Flex 부모 안에서 자식이 Absolute로 배치된 경우인지 */
function isAbsoluteInParent(child, parent) {
    try {
        if (!parent || !child) return false
        if (!isFlex(parent)) return false
        if (isAbsolutePositioned(child)) return true
    } catch (e) {}
    return false
}

/** Figma Auto Layout 자식의 Absolute 배치 여부 (명시적으로 ABSOLUTE일 때만 true; undefined/null → AUTO와 동일) */
function isAbsolutePositioned(node) {
    try {
        if (!node || !("layoutPositioning" in node)) return false
        var v = node.layoutPositioning
        if (v === undefined || v === null) return false
        return String(v).toUpperCase() === "ABSOLUTE"
    } catch (e) {
        return false
    }
}

/** 부모가 flex가 아니면 자식은 모두 x,y 기준 배치 → absolute로 처리 */
function isAbsoluteByParentNotFlex(node, parent) {
    try {
        return !!(parent && !isFlex(parent) && node)
    } catch (e) {
        return false
    }
}

/** 절대 위치 계열 판별 (in-parent / self absolute / parent not flex) 통합 */
function isAbsoluteLike(node, parent) {
    return isAbsoluteInParent(node, parent) || isAbsolutePositioned(node) || isAbsoluteByParentNotFlex(node, parent)
}

/** 비 flex 컨테이너는 .ap-flex의 position:relative가 없음 → 직계 abs 자식이 있을 때만 명시 */
function containerNeedsRelativeForAbsoluteChildren(node) {
    if (!node || isFlex(node)) return false
    var kids = node.children || []
    for (var i = 0; i < kids.length; i++) {
        var ch = kids[i]
        if (!ch || !isVisible(ch)) continue
        if (isAbsoluteLike(ch, node)) return true
    }
    return false
}

/** 보이는 직계 자식이 모두 절대 배치면 컨테이너는 플로우 높이가 없어짐 → Figma 박스 높이를 min-height로 줄 때 사용 */
function containerAllVisibleChildrenAreAbsolute(node) {
    if (!node) return false
    var kids = node.children || []
    var seen = false
    for (var i = 0; i < kids.length; i++) {
        var ch = kids[i]
        if (!ch || !isVisible(ch)) continue
        seen = true
        if (!isAbsoluteLike(ch, node)) return false
    }
    return seen
}

