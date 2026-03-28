/**
 * 070-image-export — 이미지 바이너리 판별·PNG/JPG 휴리스틱·export·노드 분류·nodeSel
 *
 * 시맨틱 BEM·inner 셀렉터·이름 기반 수집은 081. 지연 CSS·이미지 크기 var는 082.
 * readUint32BE … exportImagePreferSourceBytesAsync, isVectorOnlyTree 등 분류, nodeSel.
 * exportNodeImageAsync, exportNodeSvgAsync, getImageSizeDecl — 래스터/SVG·크기 선언
 */
// ----- 8. Image Export Utils (포맷 판정, raster, 경로) -----
/** 바이너리 헤더·PNG/WebP (bytes: Uint8Array) */
function readUint32BE(bytes, offset) {
    return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
}
/** JPEG 시그니처(FF D8 FF) 여부 */
function isJpegBytes(bytes) {
    return !!(bytes && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
}
/** PNG 시그니처 여부 */
function isPngBytes(bytes) {
    return !!(
        bytes &&
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
    )
}
/** GIF 시그니처(GIF87a/89a) 여부 */
function isGifBytes(bytes) {
    return !!(
        bytes &&
        bytes.length >= 6 &&
        bytes[0] === 0x47 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x38 &&
        (bytes[4] === 0x39 || bytes[4] === 0x37) &&
        bytes[5] === 0x61
    )
}
/** RIFF WEBP 시그니처 여부 */
function isWebpBytes(bytes) {
    return !!(
        bytes &&
        bytes.length >= 12 &&
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50
    )
}
/**
 * PNG 알파 채널(타입 4·6) 또는 tRNS 청크 → 투명 사용 가능으로 간주
 * @param {Uint8Array} bytes
 */
function pngBytesHasTransparency(bytes) {
    if (!isPngBytes(bytes) || bytes.length < 33) return false
    var pos = 8
    while (pos + 12 <= bytes.length) {
        var len = readUint32BE(bytes, pos)
        var typeStr = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7])
        if (len > 0x7fffffff || pos + 12 + len > bytes.length) break
        if (typeStr === "IHDR" && len >= 13) {
            var colorType = bytes[pos + 8 + 9]
            if (colorType === 4 || colorType === 6) return true
        }
        if (typeStr === "tRNS") return true
        if (typeStr === "IEND") break
        pos += 12 + len
    }
    return false
}
/**
 * WebP: VP8X 알파 플래그, 또는 VP8L(로스리스·알파 가능) → PNG export 경로
 * @param {Uint8Array} bytes
 */
function webpBytesHasTransparency(bytes) {
    if (!isWebpBytes(bytes)) return false
    var pos = 12
    while (pos + 8 <= bytes.length) {
        var chunk = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3])
        var sz = bytes[pos + 4] | (bytes[pos + 5] << 8) | (bytes[pos + 6] << 16) | (bytes[pos + 7] << 24)
        if (sz < 0 || pos + 8 + sz > bytes.length) break
        if (chunk === "VP8X" && sz >= 10) {
            return (bytes[pos + 8] & 0x10) !== 0
        }
        if (chunk === "VP8L") return true
        pos += 8 + sz + (sz & 1)
    }
    return false
}
/** Graphic Control Extension: 투명 색 플래그
 * @param {Uint8Array} bytes
 */
function gifBytesHasTransparency(bytes) {
    if (!isGifBytes(bytes)) return false
    for (var i = 0; i < bytes.length - 4; i++) {
        if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] >= 4) {
            if ((bytes[i + 3] & 1) !== 0) return true
        }
    }
    return false
}
/**
 * 첫 번째 보이는 IMAGE fill 원본 바이트 기준 투명도 여부 (Figma는 알파 메타 미제공)
 * @param {SceneNode} node
 * @returns {Promise<boolean>}
 */
function imageFillSourceHasTransparencyAsync(node) {
    if (!node) return Promise.resolve(false)
    try {
        var fills = node.fills
        if (!fills || fills === figma.mixed) return Promise.resolve(false)
        for (var i = fills.length - 1; i >= 0; i--) {
            var f = fills[i]
            if (f && f.visible !== false && f.type === "IMAGE" && f.imageHash) {
                var imageObj = figma.getImageByHash(f.imageHash)
                if (!imageObj) return Promise.resolve(false)
                return imageObj
                    .getBytesAsync()
                    .then(function (bytes) {
                        if (!bytes || bytes.length === 0) return false
                        if (isJpegBytes(bytes)) return false
                        if (isPngBytes(bytes)) return pngBytesHasTransparency(bytes)
                        if (isWebpBytes(bytes)) return webpBytesHasTransparency(bytes)
                        if (isGifBytes(bytes)) return gifBytesHasTransparency(bytes)
                        return false
                    })
                    .catch(function () {
                        return false
                    })
            }
        }
    } catch (e) {}
    return Promise.resolve(false)
}

/**
 * 서브트리에 임베디드 IMAGE fill이 알파를 가지는지 순차 확인 (루트만 보면 하위 PNG 알파 누락 방지)
 * @param {SceneNode} node
 * @returns {Promise<boolean>}
 */
function imageFillTransparencyInSubtreeAsync(node) {
    if (!node || !isVisible(node)) return Promise.resolve(false)
    return imageFillSourceHasTransparencyAsync(node).then(function (here) {
        if (here) return true
        if (!isContainer(node) || !node.children || !node.children.length) return false
        var ci = 0
        function nextChild() {
            if (ci >= node.children.length) return Promise.resolve(false)
            var ch = node.children[ci++]
            return imageFillTransparencyInSubtreeAsync(ch).then(function (sub) {
                return sub || nextChild()
            })
        }
        return nextChild()
    })
}

/** 서브트리 어딘가에서 노드·fill 불완전 불투명 → 실질 투명 (강제 PNG) */
function hasTransparencyInSubtreeSync(node) {
    if (!node || !isVisible(node)) return false
    if (typeof node.opacity === "number" && node.opacity < 1) return true
    if (hasVisibleFillWithOpacityLessThanOne(node)) return true
    if (!isContainer(node) || !node.children) return false
    for (var i = 0; i < node.children.length; i++) {
        if (hasTransparencyInSubtreeSync(node.children[i])) return true
    }
    return false
}

/**
 * PNG/JPG 판단용 서브트리 1패스 분석 (동기)
 * @param {SceneNode} root
 * @returns {{
 *   gradientCount: number,
 *   effectPhotoLike: boolean,
 *   hasAutoLayout: boolean,
 *   maxImageFillArea: number,
 *   vectorCount: number,
 *   hasText: boolean,
 *   hasStroke: boolean,
 *   hasImageFillSubtree: boolean
 * }}
 */
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

/**
 * 점수 기반 PNG vs JPG (동기). 최종은 imageExportNeedsPngAsync에서 투명 강제 후 적용.
 * @param {object} analysis analyzeExportFormatSubtree 결과
 * @param {SceneNode} rootNode
 * @returns {{ png: number, jpg: number }}
 */
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
    return {png: png, jpg: jpg}
}

/** 서브트리에 보이는 SOLID stroke가 있으면 true (JPG는 경계가 번질 수 있음) */
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

/**
 * UI·아이콘성 벡터 개수 (사진판: RECT + IMAGE fill만·stroke 없음 → 제외)
 * BOOLEAN_OPERATION은 1개로만 센 뒤 자식은 이중 집계 안 함
 */
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

/**
 * PNG vs JPG — 점수제 휴리스틱 + 강제 룰
 * 강제: 서브트리 실투명(opacity / fill opacity / 임베디드 이미지 알파) → 무조건 PNG
 * 그 외: computeExportFormatScores → png >= jpg 이면 PNG
 *
 * @param {SceneNode} node
 * @returns {Promise<boolean>}
 */
function imageExportNeedsPngAsync(node) {
    if (!node) return Promise.resolve(false)
    if (hasTransparencyInSubtreeSync(node)) return Promise.resolve(true)
    return imageFillTransparencyInSubtreeAsync(node).then(function (bitmapAlpha) {
        if (bitmapAlpha) return true
        var analysis = analyzeExportFormatSubtree(node)
        var scores = computeExportFormatScores(analysis, node)
        return scores.png >= scores.jpg
    })
}
/**
 * imageHash 원본 그대로 반환(가능할 때).
 * JPEG·PNG는 포맷 유지. (예전에는 불투명 PNG만 null → 래스터 JPG로 바뀌어 "PNG 넣었는데 jpg" 이슈 발생)
 * WebP/GIF 등은 브라우저/HTML 호환·투명 이슈로 null → exportNodeImageAsync 경로
 */
function exportImageFillOnlyAsync(node) {
    if (!node) return Promise.resolve(null)
    try {
        var fills = node.fills
        if (!fills || fills === figma.mixed) return Promise.resolve(null)
        for (var i = fills.length - 1; i >= 0; i--) {
            var f = fills[i]
            if (f && f.visible !== false && f.type === "IMAGE" && f.imageHash) {
                var img = figma.getImageByHash(f.imageHash)
                if (!img) return Promise.resolve(null)
                return img
                    .getBytesAsync()
                    .then(function (bytes) {
                        if (!bytes || bytes.length === 0) return null
                        if (isJpegBytes(bytes)) {
                            return "data:image/jpeg;base64," + figma.base64Encode(bytes)
                        }
                        if (isPngBytes(bytes)) {
                            return "data:image/png;base64," + figma.base64Encode(bytes)
                        }
                        if (webpBytesHasTransparency(bytes) || gifBytesHasTransparency(bytes)) {
                            return null
                        }
                        if (isWebpBytes(bytes) || isGifBytes(bytes)) {
                            return null
                        }
                        return null
                    })
                    .catch(function () {
                        return null
                    })
            }
        }
    } catch (e) {}
    return Promise.resolve(null)
}

/** 자식 제거한 복제본을 export → fill만 있는 이미지 (imageHash 실패 시 대안) */
function exportNodeImageFillOnlyAsync(node, moAlignCtx) {
    if (!node || !isContainer(node)) return Promise.resolve(null)
    try {
        var clone = node.clone()
        while (clone.children && clone.children.length > 0) clone.removeChild(clone.children[0])
        return exportNodeImageAsync(clone, moAlignCtx)
            .then(function (dataUrl) {
                clone.remove()
                return dataUrl
            })
            .catch(function () {
                try {
                    clone.remove()
                } catch (e) {}
                return null
            })
    } catch (e) {
        return Promise.resolve(null)
    }
}

/** imageHash → (필요 시) 자식 제거 클론 래스터 → 전체 노드 export */
function exportImageFillThenCloneFallbackAsync(node, moAlignCtx) {
    moAlignCtx = moAlignCtx || {}
    var forced = getForceRasterFormatForMoExport(moAlignCtx.cache, moAlignCtx.secNo)
    if (forced === "JPG" || forced === "PNG") {
        if (hasImageFill(node) && isContainer(node) && hasVisibleChildren(node)) {
            return exportNodeImageFillOnlyAsync(node, moAlignCtx)
        }
        return exportNodeImageAsync(node, moAlignCtx)
    }
    return exportImageFillOnlyAsync(node).then(function (fromHash) {
        if (fromHash) return fromHash
        if (hasImageFill(node) && isContainer(node) && hasVisibleChildren(node)) return exportNodeImageFillOnlyAsync(node, moAlignCtx)
        return exportNodeImageAsync(node, moAlignCtx)
    })
}

/**
 * 배경/ap-image 공통. exportNodeImageAsync 는 자식 TEXT 까지 합쳐 래스터 → fill+TEXT 프레임은
 * mustStrip 경로에서 fill/클론만 사용.
 */
function exportImagePreferSourceBytesAsync(node, moAlignCtx) {
    moAlignCtx = moAlignCtx || {}
    var mustStripChildrenForRaster = hasImageFill(node) && isContainer(node) && hasTextInSubtree(node)
    if (mustStripChildrenForRaster) return exportImageFillThenCloneFallbackAsync(node, moAlignCtx)
    return exportNodeImageAsync(node, moAlignCtx).then(function (dataUrl) {
        if (dataUrl) return dataUrl
        return exportImageFillThenCloneFallbackAsync(node, moAlignCtx)
    })
}

/** VECTOR 계열 타입 목록 (UI 필터와 공유) */
var VECTOR_TYPES = ["VECTOR", "BOOLEAN_OPERATION", "STAR", "LINE", "ELLIPSE", "POLYGON", "RECTANGLE"]
/** 타입이 VECTOR 계열인지 */
function isVectorType(t) {
    return VECTOR_TYPES.indexOf(t) >= 0
}
/** 서브트리 어딘가에 IMAGE fill이 있는지 */
function hasImageFillInSubtree(node) {
    if (!node) return false
    if (hasImageFill(node)) return true
    if (!isContainer(node)) return false
    for (var i = 0; i < node.children.length; i++) {
        if (hasImageFillInSubtree(node.children[i])) return true
    }
    return false
}
/** 이미지 fill 없이 벡터/도형만 있는 트리인지 (TEXT 제외) */
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
/**
 * 한 장으로 래스터 합쳐야 하는 “합성” 후보.
 * 예전: 비텍스트 자식 2개 이상이면 그룹 전체를 이미지로 뽑음 → 텍스트/버튼이 있는 배너도 한 PNG로 뭉개짐.
 * 현재: clipsContent(마스크/클립)만 합성 후보. 그 외 그룹은 프레임으로 풀어 자식(이미지·텍스트) 각각 출력.
 */
function isCompositeCandidate(node) {
    if (!node || !isContainer(node)) return false
    try {
        return !!node.clipsContent
    } catch (e) {
        return false
    }
}
/**
 * 이미지 export “후보” (시맨틱/배경 승격/덤프 등에서 사용).
 * 실제로 한 장 PNG/JPG로 뭉개는지는 shouldExportAsSingleRasterImage() 와 별개.
 *
 * - true: 레이어에 IMAGE fill 이 있음, 또는 clipsContent(마스크 합성)
 * - false: 이미지 fill 없고 클립 아님 → 일반 FRAME/GROUP (자식만 순회)
 */
function isImageCandidate(node) {
    return !!(node && (hasImageFill(node) || isCompositeCandidate(node) || isCodeRasterNode(node)))
}

/**
 * 노드를 단일 래스터(<img> 한 장)로 내보낼지 — renderImageNodeAsync 진입용.
 *
 * 1) isImageCandidate 가 false 이면 false (오토레이아웃 프레임에 텍스트만 있는 경우 등은 여기 해당 없음).
 * 2) 서브트리에 Figma TEXT 가 있으면 false — 텍스트는 HTML로 두고 프레임은 renderFrameNodeAsync.
 * 3) (1)(2) 로도 안 막히는 경우만 true — 예: 리프 사각형+이미지 fill, 클립 마스크만 있는 그룹+이미지만 등.
 */
function shouldExportAsSingleRasterImage(node) {
    if (!node) return false
    if (isCodeRasterNode(node)) return true
    if (!isImageCandidate(node)) return false
    if (isContainer(node) && hasTextInSubtree(node)) return false
    return true
}

/**
 * renderNodeAsync 최종 출력이 .ap-image(<img> 또는 SVG img)인지 — walkImg가 놓친 노드도
 * walkFillMissing에서 ap-section__layer 대신 ap-section__image 로 맞추기 위해 사용.
 * (이미지 2장 이상 분리 출력 프레임은 .ap-flex 등으로 나가므로 제외)
 */
function nodeWillRenderAsApImageFigure(node) {
    if (!node || node.type === "TEXT") return false
    if (isVideoNode(node)) return false
    if (isCodeRasterNode(node)) return true
    if (isVectorOnlyTree(node)) {
        return !isLineLikeNode(node) && node.type !== "ELLIPSE"
    }
    if (!isImageCandidate(node)) return false
    if (isContainer(node) && hasTextInSubtree(node)) return false
    if (isContainer(node) && hasMultipleImageLikeChildren(node) && !isCompositeCandidate(node)) return false
    return true
}

/** fill 중 하나라도 opacity < 1 이면 true (투명 필요) */
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

/** 컨테이너의 visible 자식이 2개 이상이고 전부 이미지류(ap-image로 나가는)인지. 분리된 이미지 판별용 */
function hasMultipleImageLikeChildren(node) {
    if (!node || !isContainer(node) || !node.children) return false
    var list = []
    for (var i = 0; i < node.children.length; i++) {
        var c = node.children[i]
        if (!c || !isVisible(c)) continue
        var imgLike = isImageCandidate(c) || hasImageFill(c) || (isVectorOnlyTree(c) && !isLineLikeNode(c) && c.type !== "ELLIPSE")
        if (!imgLike) return false
        list.push(c)
    }
    return list.length >= 2
}

/** 서브트리 어딘가에 Figma TEXT 노드가 있는지 */
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

/** 클래스 기반 selector (섹션 스코프는 selInSection으로 접두) */
function nodeSel(id) {
    return id ? "." + nodeUniqueClass(String(id)) : ".ap-missing"
}

var IMAGE_EXPORT_MAX_WIDTH = 200   // 미리보기
var IMAGE_EXPORT_ZIP_WIDTH = 1200  // ZIP 내보내기
var _currentExportWidth = IMAGE_EXPORT_MAX_WIDTH

/** MO(_mo): 다음 imgNN stem 이 PC imageList 와 같을 때 PC 확장자로 래스터 export 우선 */
function getForceRasterFormatForMoExport(cache, secNo) {
    if (!cache || cache.imageSuffix !== "_mo" || !cache.pcRasterExtByStem) return null
    var secEarly = Number(secNo) || 1
    if (!cache.imgCountBySec) return null
    var n = (cache.imgCountBySec[secEarly] || 0) + 1
    var project = normalizeProjectName(cache.projectName)
    var stemPrefix = typeof ASSETS_IMAGES_PREFIX !== "undefined" ? ASSETS_IMAGES_PREFIX : "assets/images/"
    var stem = stemPrefix + "page_" + project + "_sec" + pad2(secEarly) + "_img" + pad2(n)
    var ext = cache.pcRasterExtByStem[stem]
    if (ext === ".jpg" || ext === ".jpeg") return "JPG"
    if (ext === ".png") return "PNG"
    return null
}

/** 노드 PNG/JPG export — imageExportNeedsPngAsync(투명 강제 + 점수제) 후 JPG 우선·실패 시 PNG */
/** @param {{ cache?: object, secNo?: number }|null} moAlignCtx */
function exportNodeImageAsync(node, moAlignCtx) {
    moAlignCtx = moAlignCtx || {}
    if (!node) return Promise.resolve(null)
    try {
        var w = _currentExportWidth
        /** @param {"PNG"|"JPG"} format */
        function doExport(format, widthOrNull, extraOpts) {
            var opts = widthOrNull != null ? {constraint: {type: "WIDTH", value: widthOrNull}, format: format} : {format: format}
            if (extraOpts && typeof extraOpts === "object") {
                for (var k in extraOpts) {
                    if (Object.prototype.hasOwnProperty.call(extraOpts, k)) opts[k] = extraOpts[k]
                }
            }
            return node
                .exportAsync(opts)
                .then(function (bytes) {
                    if (bytes && bytes.length > 0) {
                        var b64 = figma.base64Encode(bytes)
                        return format === "PNG" ? "data:image/png;base64," + b64 : "data:image/jpeg;base64," + b64
                    }
                    return null
                })
                .catch(function () {
                    return null
                })
        }
        // TEXT: useAbsoluteBounds false → 글리프에 가까운 시각적 bounds(좁은 PNG).
        var exportBoundsOpts = {useAbsoluteBounds: false}
        /** 동일 포맷으로 width → 800 → 제약 없음 순 시도 */
        function tryFormatSequence(fmt) {
            return doExport(fmt, w, exportBoundsOpts).then(function (result) {
                if (result) return result
                return doExport(fmt, 800, exportBoundsOpts)
            }).then(function (result) {
                if (result) return result
                return doExport(fmt, null, exportBoundsOpts)
            })
        }
        function trySequence(usePng) {
            if (usePng) {
                return tryFormatSequence("PNG")
            }
            return tryFormatSequence("JPG").then(function (result) {
                if (result) return result
                return tryFormatSequence("PNG")
            })
        }
        var forced = getForceRasterFormatForMoExport(moAlignCtx.cache, moAlignCtx.secNo)
        if (forced === "JPG") {
            return tryFormatSequence("JPG").then(function (result) {
                if (result) return result
                return tryFormatSequence("PNG")
            })
        }
        if (forced === "PNG") {
            return tryFormatSequence("PNG").then(function (result) {
                if (result) return result
                return tryFormatSequence("JPG")
            })
        }
        return imageExportNeedsPngAsync(node).then(function (usePng) {
            return trySequence(usePng)
        })
    } catch (e) {
        return Promise.resolve(null)
    }
}
/** 벡터 전용 트리 노드 → SVG data URL */
function exportNodeSvgAsync(node) {
    if (!node || !isVectorOnlyTree(node)) return Promise.resolve(null)
    try {
        return node
            .exportAsync({format: "SVG"})
            .then(function (bytes) {
                if (bytes && bytes.length > 0) {
                    var b64 = figma.base64Encode(bytes)
                    return "data:image/svg+xml;base64," + b64
                }
                return null
            })
            .catch(function () {
                return null
            })
    } catch (e) {
        return Promise.resolve(null)
    }
}

/** 이미지 노드 크기로 img용 CSS var 선언 (TEXT 래스터는 시각적 bounds) */
function getImageSizeDecl(node) {
    var box = node && node.type === "TEXT" ? getTextRasterBounds(node) : getAbs(node)
    if (!box || (box.w == null && box.h == null)) return ""
    var parts = []
    if (box.w != null) parts.push("--ap-w:" + cssOutLayoutPx(box.w))
    if (box.h != null) parts.push("--ap-h:" + cssOutLayoutPx(box.h))
    return parts.join(";")
}
