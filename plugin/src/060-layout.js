/**
 * 060-layout — Flex CSS 변수, 절대 좌표 선언, 채우기/스트로크/반지름, 섹션 높이
 *
 * 경계: CSS 선언 조립(레이아웃·칠·테두리). 노드 판별은 050, 최종 HTML 문자열은 096.
 *
 * getLayoutVars, getFlexStyleDefaultForKey, applySectionSingleChildAlignOverride, buildFlexVarsDecl — ap-flex 변수
 * buildAbsDecl, buildAbsDeclTextRaster, *Diff — 절대 위치·TEXT 래스터·PC/MO 차이
 * getImageSizeDeclDiff, getVideoSizeDeclDiff — figure/비디오 크기 MO 오버라이드
 * toHex2, rgbToHex, hexToRgba, getFirstSolidColorFromPaints — 색 문자열
 * getFirstSolidFill, hasImageFill — fill 조회
 * needsMinHeight, getPcSectionCanvasHeightDecls, getMediaSectionCanvasHeightDecl — 캔버스형 섹션 min-height
 * frameHasMinHeightVisualReason — 프레임에 시각적 이유로 min-height 줄지
 * getFirstSolidStroke, buildCornerRadiusDecl, buildStrokeDecl, buildStrokeDeclDiff — 테두리·모서리
 */
// ----- 4. Layout Utils (flex vars, abs decl) -----
/** Auto Layout 설정을 CSS 변수용 객체로 추출. isFlex(node)일 때만 값 채움 */
function getLayoutVars(node) {
    var out = {direction: "", gap: "", pt: "", pr: "", pb: "", pl: "", justify: "", align: "", wrap: ""}
    if (!node || !isFlex(node)) return out
    try {
        var mode = node.layoutMode
        if (mode === "VERTICAL") out.direction = "column"
        else out.direction = "row"

        var primary = String(node.primaryAxisAlignItems || "").toUpperCase()
        var gap = Number(node.itemSpacing) || 0
        out.gap = primary === "SPACE_BETWEEN" ? "0" : cssOutLayoutPx(gap)

        out.pt = cssOutLayoutPx(Number(node.paddingTop) || 0)
        out.pr = cssOutLayoutPx(Number(node.paddingRight) || 0)
        out.pb = cssOutLayoutPx(Number(node.paddingBottom) || 0)
        out.pl = cssOutLayoutPx(Number(node.paddingLeft) || 0)

        if (primary === "MIN") out.justify = "flex-start"
        else if (primary === "MAX") out.justify = "flex-end"
        else if (primary === "CENTER") out.justify = "center"
        else if (primary === "SPACE_BETWEEN") out.justify = "space-between"
        else out.justify = "flex-start"

        var counter = String(node.counterAxisAlignItems || "").toUpperCase()
        if (counter === "MIN") out.align = "flex-start"
        else if (counter === "MAX") out.align = "flex-end"
        else if (counter === "CENTER") out.align = "center"
        else if (counter === "BASELINE") out.align = "baseline"
        else out.align = "center"

        out.wrap = node.layoutWrap === "WRAP" ? "wrap" : "nowrap"

        // 고정 크기 + 양축 center + 패딩 있음 → 시각 요소 없는 순수 레이아웃일 때만 패딩 제거 (배지/카드는 stroke·fill로 패딩 유지)
        var fixedW = node.layoutSizingHorizontal === "FIXED" || (typeof node.width === "number" && node.width > 0)
        var fixedH = node.layoutSizingVertical === "FIXED" || (typeof node.height === "number" && node.height > 0)
        var allCenter = out.justify === "center" && out.align === "center"
        var hasPadding = (Number(out.pt) || 0) > 0 || (Number(out.pr) || 0) > 0 || (Number(out.pb) || 0) > 0 || (Number(out.pl) || 0) > 0
        var hasFrameVisual = !!(getFirstSolidStroke(node) || getFirstSolidFill(node) || hasImageFill(node))
        if (fixedW && fixedH && allCenter && hasPadding && !hasFrameVisual) {
            out.pt = out.pr = out.pb = out.pl = "0"
        }
        // 버튼 노드이고 주축 정렬이 center일 때 좌우 패딩 0 (텍스트 중앙 정렬 시 시각적 균형)
        if (isBtnNode(node) && out.justify === "center") {
            out.pr = "0"
            out.pl = "0"
        }
    } catch (e) {}
    return out
}

/** .ap-flex 생성부의 --ap-* 초기값과 반드시 동기화 */
var AP_FLEX_STYLE_DEFAULTS = {
    direction: "row",
    wrap: "nowrap",
    justify: "flex-start",
    align: "stretch",
}

function getFlexStyleDefaultForKey(key) {
    if (key === "direction") return AP_FLEX_STYLE_DEFAULTS.direction
    if (key === "wrap") return AP_FLEX_STYLE_DEFAULTS.wrap
    if (key === "justify") return AP_FLEX_STYLE_DEFAULTS.justify
    if (key === "align") return AP_FLEX_STYLE_DEFAULTS.align
    return ""
}

/** PC 섹션 export와 동일: 단일 자식 + align center → flex-start */
function applySectionSingleChildAlignOverride(sectionNode, lv) {
    if (!lv || !sectionNode) return lv
    var vis = (sectionNode.children || []).filter(function (c) {
        return c && isVisible(c)
    })
    if (vis.length === 1 && lv.align === "center") return Object.assign({}, lv, { align: "flex-start" })
    return lv
}

/** ap-flex 노드용 flex CSS 변수 선언 */
function buildFlexVarsDecl(layoutVars) {
    if (!layoutVars) return ""
    var parts = []
    var d = AP_FLEX_STYLE_DEFAULTS
    if (layoutVars.direction && layoutVars.direction !== d.direction) parts.push("--ap-direction:" + layoutVars.direction)
    var gapN = r2(Number(layoutVars.gap !== "" && layoutVars.gap != null ? layoutVars.gap : 0) || 0)
    if (gapN !== 0) parts.push("--ap-gap:" + (layoutVars.gap !== "" ? layoutVars.gap : "0"))
    if (r2(Number(layoutVars.pt !== "" && layoutVars.pt != null ? layoutVars.pt : 0) || 0) !== 0)
        parts.push("--ap-pt:" + (layoutVars.pt !== "" ? layoutVars.pt : "0"))
    if (r2(Number(layoutVars.pr !== "" && layoutVars.pr != null ? layoutVars.pr : 0) || 0) !== 0)
        parts.push("--ap-pr:" + (layoutVars.pr !== "" ? layoutVars.pr : "0"))
    if (r2(Number(layoutVars.pb !== "" && layoutVars.pb != null ? layoutVars.pb : 0) || 0) !== 0)
        parts.push("--ap-pb:" + (layoutVars.pb !== "" ? layoutVars.pb : "0"))
    if (r2(Number(layoutVars.pl !== "" && layoutVars.pl != null ? layoutVars.pl : 0) || 0) !== 0)
        parts.push("--ap-pl:" + (layoutVars.pl !== "" ? layoutVars.pl : "0"))
    if (layoutVars.justify && layoutVars.justify !== d.justify) parts.push("--ap-justify:" + layoutVars.justify)
    if (layoutVars.align && layoutVars.align !== d.align) parts.push("--ap-align:" + layoutVars.align)
    if (layoutVars.wrap && layoutVars.wrap !== d.wrap) parts.push("--ap-wrap:" + layoutVars.wrap)
    return parts.join(";")
}

/** 절대 위치: 설계 좌표는 --ap-left/--ap-top/--ap-w/--ap-h (디자인 px). 실제 calc는 .ap-abs 공통 규칙. */
function buildAbsDecl(childNode, parentNode) {
    var box = getAbs(childNode)
    var parentBox = getAbs(parentNode)
    if (!box || !parentBox) return ""
    var relX = cssOutLayoutPx(box.x - parentBox.x)
    var relY = cssOutLayoutPx(box.y - parentBox.y)
    var w = box.w != null ? cssOutLayoutPx(box.w) : "0"
    var h = box.h != null ? cssOutLayoutPx(box.h) : "0"
    return "--ap-left:" + relX + ";--ap-top:" + relY + ";--ap-w:" + w + ";--ap-h:" + h
}

/** TEXT 래스터(.ap-image) 절대 배치: 시각적 bounds 기준 */
function buildAbsDeclTextRaster(childNode, parentNode) {
    var box = getTextRasterBounds(childNode) || getAbs(childNode)
    var parentBox = getAbs(parentNode)
    if (!box || !parentBox) return ""
    var relX = cssOutLayoutPx(box.x - parentBox.x)
    var relY = cssOutLayoutPx(box.y - parentBox.y)
    var w = box.w != null ? cssOutLayoutPx(box.w) : "0"
    var h = box.h != null ? cssOutLayoutPx(box.h) : "0"
    return "--ap-left:" + relX + ";--ap-top:" + relY + ";--ap-w:" + w + ";--ap-h:" + h
}

/** PC/MO TEXT 래스터 절대 위치 비교 후 MO 기준 선언 */
function buildAbsDeclTextRasterDiff(dChild, dParent, mChild, mParent) {
    var dB = getTextRasterBounds(dChild) || getAbs(dChild)
    var dPB = getAbs(dParent)
    var mB = getTextRasterBounds(mChild) || getAbs(mChild)
    var mPB = getAbs(mParent)
    if (!dB || !dPB || !mB || !mPB) return ""
    var dRelX = r2(dB.x - dPB.x),
        dRelY = r2(dB.y - dPB.y),
        dW = r2(dB.w != null ? dB.w : 0),
        dH = r2(dB.h != null ? dB.h : 0)
    var mRelX = r2(mB.x - mPB.x),
        mRelY = r2(mB.y - mPB.y),
        mW = r2(mB.w != null ? mB.w : 0),
        mH = r2(mB.h != null ? mB.h : 0)
    if (layoutPxNum(dRelX) === layoutPxNum(mRelX) && layoutPxNum(dRelY) === layoutPxNum(mRelY) && layoutPxNum(dW) === layoutPxNum(mW) && layoutPxNum(dH) === layoutPxNum(mH))
        return ""
    return buildAbsDeclTextRaster(mChild, mParent)
}

/** PC(d)와 MO(m) 레이아웃 변수 비교 후 달라진 것만 MO 값으로 선언 */
function buildFlexVarsDeclDiff(dLv, mLv) {
    if (!mLv) return ""
    var dNoFlex = !dLv
    var keys = ["direction", "gap", "pt", "pr", "pb", "pl", "justify", "align", "wrap"]
    var parts = []
    for (var k = 0; k < keys.length; k++) {
        var key = keys[k]
        var dv = dLv && dLv[key] != null ? String(dLv[key]) : ""
        var mv = mLv[key] != null ? String(mLv[key]) : ""
        if (key === "gap" || key === "pt" || key === "pr" || key === "pb" || key === "pl") {
            var dN = layoutPxInt(dv)
            var mN = layoutPxInt(mv)
            if (dN === mN) continue
            var prop = "--ap-" + (key === "gap" ? "gap" : key)
            if (dNoFlex) {
                if (mN === 0) continue
                parts.push(prop + ":" + String(mN))
                continue
            }
            if (mN === 0) {
                if (dN !== 0) parts.push(prop + ":0")
            } else parts.push(prop + ":" + String(mN))
            continue
        }
        if (dv === mv) continue
        var def = getFlexStyleDefaultForKey(key)
        if (!mv) continue
        if (dNoFlex) {
            if (mv === def) continue
            if (key === "direction") parts.push("--ap-direction:" + mv)
            else if (key === "justify") parts.push("--ap-justify:" + mv)
            else if (key === "align") parts.push("--ap-align:" + mv)
            else if (key === "wrap") parts.push("--ap-wrap:" + mv)
            continue
        }
        if (mv === def) {
            if (dv !== def && dv !== "") {
                if (key === "direction") parts.push("--ap-direction:" + mv)
                else if (key === "justify") parts.push("--ap-justify:" + mv)
                else if (key === "align") parts.push("--ap-align:" + mv)
                else if (key === "wrap") parts.push("--ap-wrap:" + mv)
            }
            continue
        }
        if (key === "direction") parts.push("--ap-direction:" + mv)
        else if (key === "justify") parts.push("--ap-justify:" + mv)
        else if (key === "align") parts.push("--ap-align:" + mv)
        else if (key === "wrap") parts.push("--ap-wrap:" + mv)
    }
    return parts.join(";")
}

/** PC(d)와 MO(m) 절대 위치 비교 후 달라질 때만 MO 기준 선언 */
function buildAbsDeclDiff(dChild, dParent, mChild, mParent) {
    var dB = getAbs(dChild)
    var dPB = getAbs(dParent)
    var mB = getAbs(mChild)
    var mPB = getAbs(mParent)
    if (!dB || !dPB || !mB || !mPB) return ""
    var dRelX = r2(dB.x - dPB.x),
        dRelY = r2(dB.y - dPB.y),
        dW = r2(dB.w != null ? dB.w : 0),
        dH = r2(dB.h != null ? dB.h : 0)
    var mRelX = r2(mB.x - mPB.x),
        mRelY = r2(mB.y - mPB.y),
        mW = r2(mB.w != null ? mB.w : 0),
        mH = r2(mB.h != null ? mB.h : 0)
    if (layoutPxNum(dRelX) === layoutPxNum(mRelX) && layoutPxNum(dRelY) === layoutPxNum(mRelY) && layoutPxNum(dW) === layoutPxNum(mW) && layoutPxNum(dH) === layoutPxNum(mH))
        return ""
    return buildAbsDecl(mChild, mParent)
}

/** ap-section__image figure: 크기는 getImageSizeDeclDiff 의 --ap-w/--ap-h 만 쓰고, MO 절대배치는 left/top 만 */
function buildAbsDeclDiffPositionOnly(dChild, dParent, mChild, mParent) {
    var dB = getAbs(dChild)
    var dPB = getAbs(dParent)
    var mB = getAbs(mChild)
    var mPB = getAbs(mParent)
    if (!dB || !dPB || !mB || !mPB) return ""
    var dRelX = r2(dB.x - dPB.x),
        dRelY = r2(dB.y - dPB.y)
    var mRelX = r2(mB.x - mPB.x),
        mRelY = r2(mB.y - mPB.y)
    if (layoutPxNum(dRelX) === layoutPxNum(mRelX) && layoutPxNum(dRelY) === layoutPxNum(mRelY)) return ""
    return "--ap-left:" + cssOutLayoutPx(mRelX) + ";--ap-top:" + cssOutLayoutPx(mRelY)
}

/** PC(d)와 MO(m) 이미지 크기 비교 후 달라진 것만 MO 값으로 선언 */
function getImageSizeDeclDiff(dNode, mNode) {
    var dBox = dNode && dNode.type === "TEXT" ? getTextRasterBounds(dNode) : getAbs(dNode)
    var mBox = mNode && mNode.type === "TEXT" ? getTextRasterBounds(mNode) : getAbs(mNode)
    if (!mBox || (mBox.w == null && mBox.h == null)) return ""
    var dw = dBox && dBox.w != null ? layoutPxNum(dBox.w) : null
    var dh = dBox && dBox.h != null ? layoutPxNum(dBox.h) : null
    var mw = mBox.w != null ? layoutPxNum(mBox.w) : null
    var mh = mBox.h != null ? layoutPxNum(mBox.h) : null
    if (layoutPxNum(dw) === layoutPxNum(mw) && layoutPxNum(dh) === layoutPxNum(mh)) return ""
    var parts = []
    if (mw != null) parts.push("--ap-w:" + cssOutLayoutPx(mw))
    if (mh != null) parts.push("--ap-h:" + cssOutLayoutPx(mh))
    return parts.join(";")
}

/** PC/MO 비디오 크기 diff → aspect-ratio 스타일 (인라인 style 오버라이드용) */
function getVideoSizeDeclDiff(dNode, mNode) {
    var mAbs = getAbs(mNode)
    if (!mAbs || mAbs.w == null || mAbs.h == null || mAbs.h <= 0) return ""
    var dAbs = getAbs(dNode)
    var dw = dAbs && dAbs.w != null ? layoutPxNum(dAbs.w) : null
    var dh = dAbs && dAbs.h != null ? layoutPxNum(dAbs.h) : null
    var mw = layoutPxNum(mAbs.w)
    var mh = layoutPxNum(mAbs.h)
    if (dw === mw && dh === mh) return ""
    return "aspect-ratio:" + cssOutLayoutPx(mw) + "/" + cssOutLayoutPx(mh)
}
/** 0~255 숫자 → 2자리 hex 문자열 */
function toHex2(n) {
    var s = n.toString(16)
    return (n < 16 ? "0" : "") + s
}
/** Figma RGB 객체 → #rrggbb */
function rgbToHex(rgb) {
    if (!rgb) return ""
    var r = Math.round((rgb.r || 0) * 255)
    var g = Math.round((rgb.g || 0) * 255)
    var b = Math.round((rgb.b || 0) * 255)
    return "#" + toHex2(r) + toHex2(g) + toHex2(b)
}
/** #rrggbb + opacity(0~1) → rgba(r,g,b,a) (fill opacity 오버레이용) */
function hexToRgba(hex, opacity) {
    if (!hex || typeof opacity !== "number") return null
    var h = String(hex).replace(/^#/, "")
    if (h.length !== 6) return null
    var r = parseInt(h.slice(0, 2), 16)
    var g = parseInt(h.slice(2, 4), 16)
    var b = parseInt(h.slice(4, 6), 16)
    var a = opacity < 0 ? 0 : opacity > 1 ? 1 : opacity
    return "rgba(" + r + "," + g + "," + b + "," + a + ")"
}
/** paints 배열에서 첫 SOLID 색상 hex (getStyledTextSegments의 fills용) */
function getFirstSolidColorFromPaints(paints) {
    if (!paints || !paints.length) return ""
    for (var i = 0; i < paints.length; i++) {
        var f = paints[i]
        if (f && f.visible !== false && f.type === "SOLID" && f.color) return rgbToHex(f.color)
    }
    return ""
}
/** 노드 fills에서 첫 번째 SOLID fill → {color, opacity} */
function getFirstSolidFill(node) {
    try {
        var fills = node.fills
        if (!fills || fills === figma.mixed) return null
        for (var i = 0; i < fills.length; i++) {
            var f = fills[i]
            if (f && f.visible !== false && f.type === "SOLID") {
                return {
                    color: rgbToHex(f.color),
                    opacity: typeof f.opacity === "number" ? r2(f.opacity) : null,
                }
            }
        }
    } catch (e) {}
    return null
}
/** 노드에 IMAGE 타입 fill이 있는지 */
function hasImageFill(node) {
    try {
        var fills = node.fills
        if (!fills || fills === figma.mixed) return false
        for (var i = 0; i < fills.length; i++) {
            var f = fills[i]
            if (f && f.visible !== false && f.type === "IMAGE") return true
        }
    } catch (e) {}
    return false
}


/** section이 캔버스형 레이아웃이면 min-height 필요 */
function needsMinHeight(sectionNode) {
    if (!sectionNode) return false

    var children = sectionNode.children || []
    var absCount = 0
    for (var i = 0; i < children.length; i++) {
        var c = children[i]
        if (!c || !isVisible(c)) continue
        if (isAbsoluteLike(c, sectionNode) || (c.layoutPositioning === "ABSOLUTE")) absCount++
    }

    var hasBgImage = false
    try {
        hasBgImage = hasImageFill(sectionNode)
    } catch (e) {}

    return absCount >= 1 || hasBgImage
}

/**
 * PC 기본(.ap-section--NN): 캔버스형 min-height 블록을 넣을지.
 * 슬라이더 섹션 제외, 박스 높이 있음, needsMinHeight 참일 때만 --ap-section-h + min-height(calc).
 */
function getPcSectionCanvasHeightDecls(sectionNode, slideData, box) {
    if (slideData || !box || box.h == null || !needsMinHeight(sectionNode)) return null
    return ["--ap-section-h:" + cssOutLayoutPx(box.h), "min-height:calc(var(--ap-section-h)/var(--ap-width)*100cqi)"]
}

/**
 * @media(max-width): MO 섹션 높이를 PC와 맞출 때 (슬라이드 섹션 제외).
 * - PC·MO 모두 비캔버스 → 선언 없음 (불필요한 --ap-section-h 제거)
 * - MO만 캔버스형 → --ap-section-h + min-height (PC 베이스에 calc 없을 때)
 * - PC 캔버스형(단독 또는 MO도 캔버스) → --ap-section-h만 MO 값으로 덮어씀 (min-height는 PC 베이스 규칙 유지)
 */
function getMediaSectionCanvasHeightDecl(dSec, mSec, mSecBox) {
    if (!dSec || !mSec || getSlideItems(dSec) || !mSecBox || mSecBox.h == null) return null
    var h = cssOutLayoutPx(mSecBox.h)
    var pcNeed = needsMinHeight(dSec)
    var moNeed = needsMinHeight(mSec)
    if (!pcNeed && !moNeed) return null
    if (moNeed && !pcNeed) {
        return "--ap-section-h:" + h + ";min-height:calc(var(--ap-section-h)/var(--ap-width)*100cqi)"
    }
    if (pcNeed) return "--ap-section-h:" + h
    return null
}

/** PC renderFrameNodeAsync와 동일: 배경(fill/이미지) 또는 stroke 또는 radius가 있을 때만 min-height 부여 */
function frameHasMinHeightVisualReason(node) {
    if (!node) return false
    try {
        if (hasImageFill(node)) return true
        var fill = getFirstSolidFill(node)
        if (fill && fill.color && (typeof fill.opacity !== "number" || fill.opacity > 0)) return true
    } catch (e) {}
    if (buildStrokeDecl(node)) return true
    if (buildCornerRadiusDecl(node)) return true
    return false
}

/** strokes에서 첫 번째 SOLID stroke 추출. 개별 변(FRAME/RECTANGLE) 지원 */
function getFirstSolidStroke(node) {
    try {
        if (!("strokes" in node) || !node.strokes || node.strokes === figma.mixed) return null
        var strokes = node.strokes
        for (var i = 0; i < strokes.length; i++) {
            var s = strokes[i]
            if (s && s.visible !== false && s.type === "SOLID") {
                var topW = "strokeTopWeight" in node && typeof node.strokeTopWeight === "number" ? node.strokeTopWeight : null
                var bottomW = "strokeBottomWeight" in node && typeof node.strokeBottomWeight === "number" ? node.strokeBottomWeight : null
                var leftW = "strokeLeftWeight" in node && typeof node.strokeLeftWeight === "number" ? node.strokeLeftWeight : null
                var rightW = "strokeRightWeight" in node && typeof node.strokeRightWeight === "number" ? node.strokeRightWeight : null
                var hasPerSide = topW != null || bottomW != null || leftW != null || rightW != null
                var uniformW = typeof node.strokeWeight === "number" ? node.strokeWeight : 1
                var top = hasPerSide ? r2(topW != null ? topW : 0) : r2(uniformW)
                var bottom = hasPerSide ? r2(bottomW != null ? bottomW : 0) : r2(uniformW)
                var left = hasPerSide ? r2(leftW != null ? leftW : 0) : r2(uniformW)
                var right = hasPerSide ? r2(rightW != null ? rightW : 0) : r2(uniformW)
                if (top <= 0 && bottom <= 0 && left <= 0 && right <= 0) return null
                return {
                    color: rgbToHex(s.color),
                    opacity: typeof s.opacity === "number" ? r2(s.opacity) : 1,
                    weight: r2(uniformW),
                    top: top,
                    bottom: bottom,
                    left: left,
                    right: right,
                    align: String(node.strokeAlign || "INSIDE").toUpperCase(),
                    dashes: node.strokeDashes && node.strokeDashes.length > 0,
                }
            }
        }
    } catch (e) {}
    return null
}

/** corner radius → border-radius CSS (responsive calc). cornerRadius 통일 또는 topLeftRadius 등 개별값 지원 */
function buildCornerRadiusDecl(node) {
    if (!node) return ""
    var calc = function (px) {
        return "calc(" + cssOutLayoutPx(px) + "/var(--ap-width)*100cqi)"
    }
    try {
        var cr = node.cornerRadius
        if (typeof cr === "number" && cr > 0) return "border-radius:" + calc(cr)
    } catch (e1) {}
    try {
        var tl = typeof node.topLeftRadius === "number" ? node.topLeftRadius : 0
        var tr = typeof node.topRightRadius === "number" ? node.topRightRadius : 0
        var br = typeof node.bottomRightRadius === "number" ? node.bottomRightRadius : 0
        var bl = typeof node.bottomLeftRadius === "number" ? node.bottomLeftRadius : 0
        if (tl > 0 || tr > 0 || br > 0 || bl > 0) return "border-radius:" + calc(tl) + " " + calc(tr) + " " + calc(br) + " " + calc(bl)
    } catch (e2) {}
    return ""
}

/** stroke → border CSS (responsive calc). 개별 변 지원 */
function buildStrokeDecl(node) {
    var stroke = getFirstSolidStroke(node)
    if (!stroke || !stroke.color) return ""
    var style = stroke.dashes ? "dashed" : "solid"
    var calc = function (w) {
        return "calc(" + cssOutLayoutPx(w) + "/var(--ap-width)*100cqi)"
    }
    var parts = []
    if (stroke.top > 0 || stroke.bottom > 0 || stroke.left > 0 || stroke.right > 0) {
        parts.push("border-width:" + calc(stroke.top) + " " + calc(stroke.right) + " " + calc(stroke.bottom) + " " + calc(stroke.left))
        parts.push("border-style:" + style)
        parts.push("border-color:" + stroke.color)
    }
    return parts.join(";")
}

/** PC(d)와 MO(m) stroke 비교 후 달라지면 MO 값으로 선언 */
function buildStrokeDeclDiff(dNode, mNode) {
    var dDecl = buildStrokeDecl(dNode)
    var mDecl = buildStrokeDecl(mNode)
    if (dDecl === mDecl) return ""
    if (mDecl) return mDecl
    return "border:none"
}

