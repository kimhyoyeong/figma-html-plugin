/**
 * 070-image-export — 벡터/이미지 후보 분류·PNG·JPG 휴리스틱 분석(067 export가 사용)
 *
 * isMaskImageRasterGroup — 직계 마스크 1 + IMAGE fill 서브트리 → 단일 래스터 export
 */
// ----- 8. Image tree classification & format heuristics (export는 067) -----
/** VECTOR 계열 타입 목록 (UI 필터와 공유) */
var VECTOR_TYPES = ["VECTOR", "BOOLEAN_OPERATION", "STAR", "LINE", "ELLIPSE", "POLYGON", "RECTANGLE"]
function isVectorType(t) {
    return VECTOR_TYPES.indexOf(t) >= 0
}
function hasImageFillInSubtree(node) {
    if (!node) return false
    if (hasImageFill(node)) return true
    try {
        if (typeof hasVideoFill === "function" && hasVideoFill(node)) return true
    } catch (e) {}
    if (!isContainer(node)) return false
    for (var i = 0; i < node.children.length; i++) {
        if (hasImageFillInSubtree(node.children[i])) return true
    }
    return false
}
function isVectorOnlyTree(node) {
    if (!node) return false
    if (node.type === "TEXT") return false
    if (hasImageFillInSubtree(node)) return false
    if (!isContainer(node)) return isVectorType(node.type)
    for (var i = 0; i < node.children.length; i++) {
        if (!isVectorOnlyTree(node.children[i])) return false
    }
    return true
}
function isCompositeCandidate(node) {
    if (!node || !isContainer(node)) return false
    try {
        return !!node.clipsContent
    } catch (e) {
        return false
    }
}
/** 직계 자식의 isMask (API 미지원 타입은 false) */
function nodeIsMaskLayer070(n) {
    if (!n) return false
    try {
        return n.isMask === true
    } catch (e) {
        return false
    }
}
/** 마스크 레이어 1개 + 서브트리에 IMAGE fill — exportAsync 한 번에 합쳐야 하는 그룹 */
function isMaskImageRasterGroup(node) {
    if (!node || !isContainer(node) || !node.children) return false
    var maskDirect = 0
    for (var i = 0; i < node.children.length; i++) {
        var c = node.children[i]
        if (!c || !isVisible(c)) continue
        if (nodeIsMaskLayer070(c)) maskDirect++
    }
    if (maskDirect !== 1) return false
    if (!hasImageFillInSubtree(node)) return false
    return true
}
function subtreeHasVideo070(n, cache) {
    if (!n || !isVisible(n)) return false
    if (isVideoNodeEffective(n, cache)) return true
    var kids = n.children
    if (!kids) return false
    for (var j = 0; j < kids.length; j++) {
        if (subtreeHasVideo070(kids[j], cache)) return true
    }
    return false
}
function isImageCandidate(node, cache) {
    return !!(
        node &&
        (hasImageFill(node) ||
            isCompositeCandidate(node) ||
            isCodeRasterNodeEffective(node, cache) ||
            isMaskImageRasterGroup(node))
    )
}
/** IMAGE fill 부모 위에 얹는 콘텐츠(TEXT·비디오·code-raster·벡터-only). 클립 KV+로고도 여기서 걸림 */
function subtreeHasVectorOrTextOverlay(node, cache) {
    if (!node || !isContainer(node) || !node.children) return false
    for (var i = 0; i < node.children.length; i++) {
        if (subtreeOverlayWalk070(node.children[i], 0, cache)) return true
    }
    return false
}
function subtreeOverlayWalk070(n, depth, cache) {
    if (!n || !isVisible(n) || depth > 32) return false
    if (n.type === "TEXT") return true
    if (isVideoNodeEffective(n, cache)) return true
    if (isCodeRasterNodeEffective(n, cache)) return true
    if (isVectorOnlyTree(n)) return true
    if (isContainer(n) && n.children) {
        for (var j = 0; j < n.children.length; j++) {
            if (subtreeOverlayWalk070(n.children[j], depth + 1, cache)) return true
        }
    }
    return false
}
function shouldExportAsSingleRasterImage(node, cache) {
    if (!node) return false
    if (isCodeRasterNodeEffective(node, cache)) return true
    if (isMaskImageRasterGroup(node)) return !hasTextInSubtree(node) && !subtreeHasVideo070(node, cache)
    if (!isImageCandidate(node, cache)) return false
    if (isContainer(node) && hasTextInSubtree(node)) return false
    // IMAGE fill + 자식: 전체 exportAsync 시 배경+오버레이가 한 PNG. 무클립이거나(항상) 클립이어도 벡터/텍스트 자식이 있으면 분리(KV+로고).
    if (isContainer(node) && hasImageFill(node) && hasVisibleChildren(node)) {
        if (!isCompositeCandidate(node) || subtreeHasVectorOrTextOverlay(node, cache)) return false
    }
    if (isContainer(node) && shouldCompositeRasterGroup(node)) return true
    if (isContainer(node) && hasMultipleImageLikeChildren(node, cache) && !isCompositeCandidate(node) && !isMaskImageRasterGroup(node))
        return false
    // 클립 프레임(clipsContent): 겹친 래스터 2장도 부모 한 번 exportAsync로 합성 가능. 무클립 2장은 위 분기에서 이미 분리.
    if (isContainer(node) && countDirectRasterImageChildren(node) >= 2 && !isCompositeCandidate(node)) return false
    return true
}
function nodeWillRenderAsApImageFigure(node, cache) {
    if (!node || node.type === "TEXT") return false
    if (isVideoNodeEffective(node, cache)) return false
    if (isCodeRasterNodeEffective(node, cache)) return true
    if (isVectorOnlyTree(node)) {
        return !isLineLikeNode(node) && node.type !== "ELLIPSE"
    }
    if (!isImageCandidate(node, cache)) return false
    return shouldExportAsSingleRasterImage(node, cache)
}
function hasVisibleFillWithOpacityLessThanOne(node) {
    try {
        var fills = node.fills
        if (!fills || fills === figma.mixed) return false
        for (var i = 0; i < fills.length; i++) {
            var f = fills[i]
            if (f && f.visible !== false && typeof f.opacity === "number" && f.opacity < 1) return true
        }
    } catch (e) {}
    return false
}
function hasMultipleImageLikeChildren(node, cache) {
    if (!node || !isContainer(node) || !node.children) return false
    var list = []
    for (var i = 0; i < node.children.length; i++) {
        var c = node.children[i]
        if (!c || !isVisible(c)) continue
        var imgLike =
            isImageCandidate(c, cache) || hasImageFill(c) || (isVectorOnlyTree(c) && !isLineLikeNode(c) && c.type !== "ELLIPSE")
        if (!imgLike) return false
        list.push(c)
    }
    return list.length >= 2
}
/** 직계 자식만: 보이는 IMAGE fill 보유 레이어 수 */
function countDirectRasterImageChildren(node) {
    if (!node || !isContainer(node) || !node.children) return 0
    var c = 0
    for (var i = 0; i < node.children.length; i++) {
        var ch = node.children[i]
        if (!ch || !isVisible(ch) || ch.type === "TEXT") continue
        if (hasImageFill(ch)) c++
    }
    return c
}
/** pipeline composite-raster: code-raster 제외 시 직계 래스터 이미지 3개 이상일 때만 */
function shouldCompositeRasterGroup(node) {
    return !!(node && isContainer(node) && countDirectRasterImageChildren(node) >= 3)
}
function hasTextInSubtree(node) {
    if (!node) return false
    if (node.type === "TEXT") return true
    var kids = node.children
    if (!kids || !kids.length) return false
    for (var i = 0; i < kids.length; i++) {
        if (hasTextInSubtree(kids[i])) return true
    }
    return false
}
function hasVisibleSolidStrokeInSubtree(node) {
    if (!node || !isVisible(node)) return false
    try {
        if (getFirstSolidStroke(node)) return true
    } catch (e) {}
    if (!isContainer(node) || !node.children) return false
    for (var i = 0; i < node.children.length; i++) {
        if (hasVisibleSolidStrokeInSubtree(node.children[i])) return true
    }
    return false
}
function subtreeUiVectorElementCount(node) {
    var total = 0
    function walk(x) {
        if (!x || !isVisible(x)) return
        var t = x.type
        if (t === "BOOLEAN_OPERATION") {
            total++
            return
        }
        if (t === "VECTOR" || t === "STAR" || t === "POLYGON" || t === "LINE") {
            total++
        } else if (t === "ELLIPSE") {
            if (!isLineLikeNode(x)) total++
        } else if (t === "RECTANGLE") {
            var hasImg = hasImageFill(x)
            var st = getFirstSolidStroke(x)
            if (st) total++
            else if (!hasImg) total++
        }
        if (isContainer(x) && x.children) {
            for (var i = 0; i < x.children.length; i++) walk(x.children[i])
        }
    }
    walk(node)
    return total
}
function analyzeExportFormatSubtree(root) {
    var gradientCount = 0
    var effectPhotoLike = false
    var hasAutoLayout = false
    var maxImageFillArea = 0
    function walk(n) {
        if (!n || !isVisible(n)) return
        if (isFlex(n)) hasAutoLayout = true
        try {
            var fills = n.fills
            if (fills && fills !== figma.mixed) {
                for (var fi = 0; fi < fills.length; fi++) {
                    var f = fills[fi]
                    if (!f || f.visible === false) continue
                    var ft = f.type
                    if (
                        ft === "GRADIENT_LINEAR" ||
                        ft === "GRADIENT_RADIAL" ||
                        ft === "GRADIENT_ANGULAR" ||
                        ft === "GRADIENT_DIAMOND"
                    ) {
                        gradientCount++
                    }
                    if (ft === "IMAGE") {
                        var box = getAbs(n)
                        if (box && box.w != null && box.h != null) {
                            var area = box.w * box.h
                            if (area > maxImageFillArea) maxImageFillArea = area
                        }
                    }
                }
            }
        } catch (e1) {}
        try {
            var eff = n.effects
            if (eff && eff.length) {
                for (var ej = 0; ej < eff.length; ej++) {
                    var e = eff[ej]
                    if (!e || e.visible === false) continue
                    var et = e.type
                    if (et === "LAYER_BLUR" || et === "BACKGROUND_BLUR" || et === "DROP_SHADOW" || et === "INNER_SHADOW") {
                        effectPhotoLike = true
                        break
                    }
                }
            }
        } catch (e2) {}
        if (isContainer(n) && n.children) {
            for (var k = 0; k < n.children.length; k++) walk(n.children[k])
        }
    }
    walk(root)
    return {
        gradientCount: gradientCount,
        effectPhotoLike: effectPhotoLike,
        hasAutoLayout: hasAutoLayout,
        maxImageFillArea: maxImageFillArea,
        vectorCount: subtreeUiVectorElementCount(root),
        hasText: hasTextInSubtree(root),
        hasStroke: hasVisibleSolidStrokeInSubtree(root),
        hasImageFillSubtree: hasImageFillInSubtree(root),
    }
}
function computeExportFormatScores(analysis, rootNode) {
    var png = 0
    var jpg = 0
    if (analysis.hasText) png += 5
    var vc = analysis.vectorCount
    if (vc >= 2) png += 3
    else if (analysis.hasImageFillSubtree && vc >= 1) png += 3
    if (analysis.hasStroke) png += 2
    if (analysis.hasAutoLayout) png += 2

    if (analysis.hasImageFillSubtree) jpg += 5
    var largeBitmapPx = 400 * 400
    if (analysis.maxImageFillArea >= largeBitmapPx) jpg += 3
    if (analysis.gradientCount >= 2) jpg += 2
    if (analysis.effectPhotoLike) jpg += 2

    var rootBox = rootNode ? getAbs(rootNode) : null
    if (rootBox && rootBox.w != null && rootBox.h != null) {
        var exportArea = rootBox.w * rootBox.h
        if (exportArea >= 800 * 800) jpg += 3
    }
    return { png: png, jpg: jpg }
}
/** 보이는 직계 자식 1개·이미지 계열일 때 부모 export로 프레임에 맞게 클립 */
function shouldRasterExportViaParentClip(child, parent) {
    if (!child || !parent || !isContainer(parent)) return false
    if (!isFigmaDirectParent(parent, child)) return false
    try {
        if (isAbsoluteLike(child, parent)) return false
    } catch (eAbs) {}
    if (!hasImageFill(child) && !hasImageFillInSubtree(child)) return false
    var cnt = 0
    var kids = parent.children || []
    for (var i = 0; i < kids.length; i++) {
        if (kids[i] && isVisible(kids[i])) cnt++
    }
    if (cnt !== 1) return false
    try {
        if (parent.clipsContent === true) return true
    } catch (e) {}
    var a = getAbs(child)
    var p = getAbs(parent)
    if (!a || !p) return false
    try {
        var rb = child.absoluteRenderBounds
        if (rb && typeof rb.width === "number" && typeof rb.height === "number") {
            if (r2(rb.width) > p.w + 0.5 || r2(rb.height) > p.h + 0.5) return true
        }
    } catch (e2) {}
    if (
        a.x < p.x - 0.5 ||
        a.y < p.y - 0.5 ||
        a.x + a.w > p.x + p.w + 0.5 ||
        a.y + a.h > p.y + p.h + 0.5
    )
        return true
    return false
}

function nodeSel(id) {
    return id ? "." + nodeUniqueClass(String(id)) : ".ap-missing"
}
var IMAGE_EXPORT_MAX_WIDTH = 200
var IMAGE_EXPORT_ZIP_WIDTH = 1200
var _currentExportWidth = IMAGE_EXPORT_MAX_WIDTH
function getImageSizeDecl(node, parent) {
    var box
    var useParentClipBounds = false
    if (node && node.type !== "TEXT" && parent && isFigmaDirectParent(parent, node)) {
        try {
            useParentClipBounds = !isAbsoluteLike(node, parent)
        } catch (e) {
            useParentClipBounds = true
        }
    }
    if (node && node.type === "TEXT") box = getTextRasterBounds(node)
    else if (useParentClipBounds) box = getRasterExportBoundsClippedToParent(node, parent)
    else box = getRasterExportBounds(node)
    if (!box || (box.w == null && box.h == null)) return ""
    var parts = []
    if (box.w != null) parts.push("--ap-w:" + cssOutLayoutPx(box.w))
    if (box.h != null) parts.push("--ap-h:" + cssOutLayoutPx(box.h))
    return parts.join(";")
}
