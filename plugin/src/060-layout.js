/**
 * 060-layout — Flex CSS 변수, 절대 좌표 선언, 채우기/스트로크/반지름, 섹션 높이
 *
 * 경계: CSS 선언 조립(레이아웃·칠·테두리). 노드 판별은 050, 최종 HTML 문자열은 096.
 *
 * getLayoutVars, flexColumnSpaceBetweenNeedsMinHeight, applySectionSingleChildAlignOverride, buildFlexDecl, buildFlexPaddingDecl — ap-flex
 * buildAbsDecl, buildAbsDeclTextRaster, *Diff — 절대 위치·TEXT 래스터·PC/MO 차이
 * getImageSizeDeclDiff, getVideoSizeDeclDiff — figure/비디오 크기 MO 오버라이드
 * toHex2, rgbToHex, hexToRgba, getFirstSolidColorFromPaints — 색 문자열
 * getFirstSolidFill, hasImageFill, hasVideoFill — fill 조회
 * needsMinHeight, getPcSectionCanvasHeightDecls, getMediaSectionCanvasHeightDecl — 캔버스형 섹션 min-height
 * frameHasMinHeightVisualReason — 프레임에 시각적 이유로 min-height 줄지
 * getFirstSolidStroke, buildCornerRadiusDecl, buildStrokeDecl, buildStrokeDeclDiff — 테두리·모서리
 */
// ----- 4. Layout Utils (flex vars, abs decl) -----
/**
 * row Auto Layout에서 플로우에 참여하는 보이는 자식이 2개 이상이고,
 * absoluteBoundingBox 높이가 모두 같으면 true (교차축 MIN→flex-start 대신 stretch가 자연스러움).
 */
function rowFlexVisibleChildrenEqualHeight(node) {
    if (!node || !isFlex(node)) return false
    try {
        if (node.layoutMode === "VERTICAL") return false
        var kids = (node.children || []).filter(function (c) {
            return c && isVisible(c) && !isAbsolutePositioned(c)
        })
        if (kids.length < 2) return false
        var h0 = null
        for (var ri = 0; ri < kids.length; ri++) {
            var b = getAbs(kids[ri])
            if (!b || b.h == null) return false
            var hh = r2(b.h)
            if (h0 === null) h0 = hh
            else if (hh !== h0) return false
        }
        return true
    } catch (e) {
        return false
    }
}

/** cornerRadius 또는 개별 radius 중 하나라도 0 초과 */
function nodeHasNonZeroCornerRadius(node) {
    if (!node) return false
    try {
        if (typeof node.cornerRadius === "number" && node.cornerRadius > 0) return true
        var tl = typeof node.topLeftRadius === "number" ? node.topLeftRadius : 0
        var tr = typeof node.topRightRadius === "number" ? node.topRightRadius : 0
        var br = typeof node.bottomRightRadius === "number" ? node.bottomRightRadius : 0
        var bl = typeof node.bottomLeftRadius === "number" ? node.bottomLeftRadius : 0
        return tl > 0 || tr > 0 || br > 0 || bl > 0
    } catch (e) {
        return false
    }
}

/** 플로우에 보이는 직계 TEXT(ap-text) 자식이 1개 이상 */
function hasVisibleDirectTextChild(node) {
    if (!node || !Array.isArray(node.children)) return false
    for (var i = 0; i < node.children.length; i++) {
        var ch = node.children[i]
        if (!ch || !isVisible(ch) || isAbsolutePositioned(ch)) continue
        if (ch.type === "TEXT") return true
    }
    return false
}

/**
 * 가로 FIXED + (SOLID 배경색 또는 stroke 또는 radius) + 중앙 정렬 + 직계 TEXT 존재.
 * 조건을 만족하는 ap-text 직계 부모 frame에만 white-space:nowrap 적용.
 */
function flexFrameFixedBoxCenterApTextParentNoWrap(node) {
    if (!node || !isFlex(node)) return false
    try {
        var sh = String(node.layoutSizingHorizontal || "").toUpperCase()
        var widthOk = sh === "FIXED" || (typeof node.width === "number" && node.width > 0)
        if (!widthOk) return false
        if (String(node.primaryAxisAlignItems || "").toUpperCase() !== "CENTER") return false
        var hasBox = !!(getFirstSolidFill(node) || getFirstSolidStroke(node) || nodeHasNonZeroCornerRadius(node))
        if (!hasBox) return false
        return hasVisibleDirectTextChild(node)
    } catch (e) {
        return false
    }
}

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

        // MIN·기타 미매칭 = CSS 주축 기본(flex-start)과 동일 → 값 생략(buildFlexDecl에서 출력 안 함)
        if (primary === "MIN") out.justify = ""
        else if (primary === "MAX") out.justify = "flex-end"
        else if (primary === "CENTER") out.justify = "center"
        else if (primary === "SPACE_BETWEEN") out.justify = "space-between"
        else out.justify = ""

        var counter = String(node.counterAxisAlignItems || "").toUpperCase()
        // MIN → flex-start (생략 시 브라우저 기본은 stretch라 Figma와 어긋남)
        if (counter === "MIN") out.align = "flex-start"
        else if (counter === "MAX") out.align = "flex-end"
        else if (counter === "CENTER") out.align = "center"
        else if (counter === "BASELINE") out.align = "baseline"
        else if (counter === "STRETCH" || counter === "") out.align = ""
        else out.align = ""

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

        // row + 교차축 MIN → align flex-start 출력; 자식 높이가 전부 같으면 stretch(align 선언 생략)가 동일·배경 채움에 유리
        if (out.direction === "row" && out.align === "flex-start" && rowFlexVisibleChildrenEqualHeight(node)) {
            out.align = ""
        }
    } catch (e) {}
    return out
}

/**
 * 세로 오토레이아웃 + 주축 SPACE_BETWEEN → CSS에서 여유 세로가 있어야 분배됨.
 * 세로 FIXED일 때 min-height로 설계 높이를 확정 (배경 없는 프레임 포함).
 */
function flexColumnSpaceBetweenNeedsMinHeight(node) {
    if (!node || !isFlex(node)) return false
    try {
        if (node.layoutMode !== "VERTICAL") return false
        if (String(node.primaryAxisAlignItems || "").toUpperCase() !== "SPACE_BETWEEN") return false
        return node.layoutSizingVertical === "FIXED"
    } catch (e) {
        return false
    }
}

/** PC 섹션 export와 동일: 단일 자식 + align center → MIN과 같이 align-items 선언 생략 */
function applySectionSingleChildAlignOverride(sectionNode, lv) {
    if (!lv || !sectionNode) return lv
    var vis = (sectionNode.children || []).filter(function (c) {
        return c && isVisible(c)
    })
    if (vis.length === 1 && lv.align === "center") return Object.assign({}, lv, { align: "" })
    return lv
}

/** 패딩 한 변: 0은 키워드 0, 그 외는 cqi calc */
function paddingSideToCqi(px) {
    var n = Number(px) || 0
    if (n === 0) return "0"
    return "calc(" + n + "/var(--ap-width)*100cqi)"
}
/** ap-flex: padding 을 top right bottom left 네 값 한 줄로 (전부 0이면 생략) */
function buildFlexPaddingDecl(pt, pr, pb, pl) {
    pt = Number(pt) || 0
    pr = Number(pr) || 0
    pb = Number(pb) || 0
    pl = Number(pl) || 0
    if (pt === 0 && pr === 0 && pb === 0 && pl === 0) return ""
    return (
        "padding:" +
        paddingSideToCqi(pt) +
        " " +
        paddingSideToCqi(pr) +
        " " +
        paddingSideToCqi(pb) +
        " " +
        paddingSideToCqi(pl)
    )
}

/** ap-flex 노드용 flex CSS. absSelf: 이 노드가 ap-abs이면 자식 absolute용 position:relative 를 넣지 않음(지연 CSS가 absolute 덮어쓰기 방지) */
function buildFlexDecl(layoutVars, node, absSelf) {
    if (absSelf === undefined) absSelf = false
    if (!layoutVars) return ""
    var parts = []

    var direction = layoutVars.direction || "row"
    var wrap = layoutVars.wrap || "nowrap"
    var justify = layoutVars.justify || "flex-start"

    parts.push("display:flex")

    // ✅ 자식에 absolute 있을 때만 (자기 자신이 absolute 면 제외)
    if (hasAbsoluteChild(node) && !absSelf) {
        parts.push("position:relative")
    }

    if (direction !== "row") parts.push("flex-direction:" + direction)
    if (wrap !== "nowrap") parts.push("flex-wrap:" + wrap)
    if (justify !== "flex-start") parts.push("justify-content:" + justify)
    var alignRaw = layoutVars.align
    if (alignRaw !== "") {
        if (alignRaw !== "stretch") parts.push("align-items:" + alignRaw)
    }

    var gap = Number(layoutVars.gap) || 0
    var pt = Number(layoutVars.pt) || 0
    var pr = Number(layoutVars.pr) || 0
    var pb = Number(layoutVars.pb) || 0
    var pl = Number(layoutVars.pl) || 0

    if (gap !== 0) {
        parts.push("gap:calc(" + gap + "/var(--ap-width)*100cqi)")
    }

    var padDecl = buildFlexPaddingDecl(pt, pr, pb, pl)
    if (padDecl) parts.push(padDecl)

    return parts.join(";")
}

/** ap-abs·diff 공통: 직계 부모면 부모 영역으로 클립된 bounds(플로우 이미지 등). 절대 배치 이미지는 클립 안 함 */
function getBoundsForAbsDeclChild(childNode, parentNode) {
    if (!childNode) return null
    if (childNode.type === "TEXT") return getTextRasterBounds(childNode) || getAbs(childNode)
    if (parentNode && isFigmaDirectParent(parentNode, childNode)) {
        try {
            if (!isAbsoluteLike(childNode, parentNode)) return getRasterExportBoundsClippedToParent(childNode, parentNode)
        } catch (e) {
            return getRasterExportBounds(childNode)
        }
    }
    return getRasterExportBounds(childNode)
}

/** 절대 위치: 설계 좌표는 --ap-left/--ap-top/--ap-w/--ap-h (디자인 px). 실제 calc는 .ap-abs 공통 규칙. */
function buildAbsDecl(childNode, parentNode) {
    var box = getBoundsForAbsDeclChild(childNode, parentNode)
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

function hasAbsoluteChild(node) {
    if (!node || !node.children) return false
    return node.children.some(function (child) {
        return child.layoutPositioning === "ABSOLUTE"
    })
}

/** PC(d)와 MO(m) 레이아웃 변수 비교 후 달라진 것만 MO 값으로 선언 */
/** moAbsSelf: MO 노드가 ap-abs 이면 position:relative 생략 */
function buildFlexDeclDiff(dLv, mLv, node, moAbsSelf) {
    if (moAbsSelf === undefined) moAbsSelf = false
    if (!mLv) return ""

    function norm(lv) {
        if (!lv) {
            return {
                direction: "row",
                wrap: "nowrap",
                justify: "flex-start",
                align: "stretch",
                gap: 0,
                pt: 0,
                pr: 0,
                pb: 0,
                pl: 0,
            }
        }
        return {
            direction: lv.direction || "row",
            wrap: lv.wrap || "nowrap",
            justify: lv.justify || "flex-start",
            align: lv.align == null || lv.align === "" ? "stretch" : lv.align,
            gap: layoutPxInt(lv.gap),
            pt: layoutPxInt(lv.pt),
            pr: layoutPxInt(lv.pr),
            pb: layoutPxInt(lv.pb),
            pl: layoutPxInt(lv.pl),
        }
    }

    var d = norm(dLv)
    var m = norm(mLv)
    var parts = []

    // PC base에 이미 buildFlexDecl 로 display:flex 가 있으면 @media 에 중복 출력하지 않음
    if (!dLv) parts.push("display:flex")

    if (hasAbsoluteChild(node) && !moAbsSelf) {
        parts.push("position:relative")
    }

    if (d.direction !== m.direction) parts.push("flex-direction:" + m.direction)
    if (d.wrap !== m.wrap) parts.push("flex-wrap:" + m.wrap)
    if (d.justify !== m.justify) parts.push("justify-content:" + m.justify)
    if (d.align !== m.align) parts.push("align-items:" + m.align)

    if (d.gap !== m.gap) {
        if (m.gap === 0) parts.push("gap:0")
        else parts.push("gap:calc(" + m.gap + "/var(--ap-width)*100cqi)")
    }

    if (d.pt !== m.pt || d.pr !== m.pr || d.pb !== m.pb || d.pl !== m.pl) {
        var padMo = buildFlexPaddingDecl(m.pt, m.pr, m.pb, m.pl)
        parts.push(padMo || "padding:0")
    }

    return parts.join(";")
}
/** PC(d)와 MO(m) 절대 위치 비교 후 달라질 때만 MO 기준 선언 */
function buildAbsDeclDiff(dChild, dParent, mChild, mParent) {
    var dB = getBoundsForAbsDeclChild(dChild, dParent)
    var dPB = getAbs(dParent)
    var mB = getBoundsForAbsDeclChild(mChild, mParent)
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
    var dB = getBoundsForAbsDeclChild(dChild, dParent)
    var dPB = getAbs(dParent)
    var mB = getBoundsForAbsDeclChild(mChild, mParent)
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
    var dBox = dNode && dNode.type === "TEXT" ? getTextRasterBounds(dNode) : getRasterExportBounds(dNode)
    var mBox = mNode && mNode.type === "TEXT" ? getTextRasterBounds(mNode) : getRasterExportBounds(mNode)
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
/** 노드에 VIDEO 타입 fill(VideoPaint)이 있는지 — Figma는 비디오를 별도 노드가 아니라 채우기로 둠 */
function hasVideoFill(node) {
    try {
        var fillsV = node.fills
        if (!fillsV || fillsV === figma.mixed) return false
        for (var iv = 0; iv < fillsV.length; iv++) {
            var fv = fillsV[iv]
            if (fv && fv.visible !== false && fv.type === "VIDEO") return true
        }
    } catch (e) {}
    return false
}

/** 최상단(스택 맨 위) 보이는 IMAGE fill의 imageHash — UI·getTopmostVisibleFill과 동일 순서 (fills[0]=아래, 끝=위) */
function getPrimaryImageFillHash(node) {
    try {
        var fills = node.fills
        if (!fills || fills === figma.mixed) return ""
        for (var i = fills.length - 1; i >= 0; i--) {
            var f = fills[i]
            if (f && f.visible !== false && f.type === "IMAGE" && f.imageHash) return String(f.imageHash)
        }
    } catch (e) {}
    return ""
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
    var calcR = function (px) {
        return "calc(" + cssOutLayoutPx(px) + "/var(--ap-width)*100cqi)"
    }
    try {
        var cr = node.cornerRadius
        if (typeof cr === "number" && cr > 0) return "border-radius:" + calcR(cr)
    } catch (e1) {}
    try {
        var tl = typeof node.topLeftRadius === "number" ? node.topLeftRadius : 0
        var tr = typeof node.topRightRadius === "number" ? node.topRightRadius : 0
        var br = typeof node.bottomRightRadius === "number" ? node.bottomRightRadius : 0
        var bl = typeof node.bottomLeftRadius === "number" ? node.bottomLeftRadius : 0
        if (tl > 0 || tr > 0 || br > 0 || bl > 0) return "border-radius:" + calcR(tl) + " " + calcR(tr) + " " + calcR(br) + " " + calcR(bl)
    } catch (e2) {}
    return ""
}

/** stroke → border CSS (responsive calc). 개별 변 지원 */
function buildStrokeDecl(node) {
    var stroke = getFirstSolidStroke(node)
    if (!stroke || !stroke.color) return ""
    var style = stroke.dashes ? "dashed" : "solid"
    var calcW = function (w) {
        return "calc(" + cssOutLayoutPx(w) + "/var(--ap-width)*100cqi)"
    }
    var parts = []
    if (stroke.top > 0 || stroke.bottom > 0 || stroke.left > 0 || stroke.right > 0) {
        parts.push("border-width:" + calcW(stroke.top) + " " + calcW(stroke.right) + " " + calcW(stroke.bottom) + " " + calcW(stroke.left))
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

