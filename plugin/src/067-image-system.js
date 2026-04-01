/**
 * 067-image-system — 정책·포맷·export·에셋 캐시 (node.id 기반 이미지 캐시 없음)
 */
function createImageAssetStores() {
    return { preview: Object.create(null), export: Object.create(null), zip: Object.create(null) }
}

function ensureImagePipelineOnCache(cache) {
    if (!cache.assetStores) cache.assetStores = createImageAssetStores()
    if (!cache.imagePipeline) cache.imagePipeline = { mode: "export", variant: "pc" }
}

function getAssetStore(cache) {
    ensureImagePipelineOnCache(cache)
    var m = cache.imagePipeline.mode
    if (m === "preview") return cache.assetStores.preview
    if (m === "zip") return cache.assetStores.zip
    return cache.assetStores.export
}

function getCachedAsset(cache, assetKey) {
    var st = getAssetStore(cache)
    return st[assetKey] || null
}

function setCachedAsset(cache, assetKey, data) {
    var st = getAssetStore(cache)
    st[assetKey] = data
}

function structuralSourceHash(node) {
    if (!node) return "nil"
    var box = getAbs(node)
    var w = box && box.w != null ? Math.round(box.w * 100) : 0
    var h = box && box.h != null ? Math.round(box.h * 100) : 0
    var cc = 0
    try {
        cc = node.clipsContent ? 1 : 0
    } catch (e) {}
    return "st:" + (node.type || "?") + ":" + w + "x" + h + ":" + cc
}

function sourceHashForAssetKey(node, kind, ctx) {
    var keyNode = ctx && ctx.pairPcNode && ctx.cache && ctx.cache.imageSuffix === "_mo" && ctx.insideSwiperSlide ? ctx.pairPcNode : node
    var nid = node && node.id != null ? String(node.id).replace(/[^a-zA-Z0-9_-]/g, "_") : "noid"
    var exportSrc = ctx && ctx.rasterExportSourceNode
    var structBase =
        exportSrc && exportSrc.id != null && node && node.id != null && String(exportSrc.id) !== String(node.id)
            ? exportSrc
            : keyNode
    var pclip =
        exportSrc && exportSrc.id != null && node && node.id != null && String(exportSrc.id) !== String(node.id)
            ? ":pclip:" + String(exportSrc.id).replace(/[^a-zA-Z0-9_-]/g, "_")
            : ""
    var ih = getPrimaryImageFillHash(keyNode)
    if (ih) return "ih:" + ih + ":n:" + nid + pclip
    if (kind === "svg") return "svg:" + structuralSourceHash(keyNode) + ":n:" + nid
    return structuralSourceHash(structBase) + ":n:" + nid + pclip
}

function makeAssetKey(node, kind, format, ctx) {
    ensureImagePipelineOnCache(ctx.cache)
    var mode = ctx.cache.imagePipeline.mode
    var variant = ctx.cache.imagePipeline.variant
    if (ctx.cache.imageSuffix === "_mo") variant = "mo"
    var fmt = format === "PNG" ? "png" : format === "JPG" ? "jpg" : "-"
    var sh = sourceHashForAssetKey(node, kind, ctx)
    // 같은 Figma 이미지 해시(ih)라도 섹션마다 별도 파일·export 캐시(083 imageName[key]가 섹션 간 공유되지 않게)
    var secN = ctx && ctx.secNo != null && ctx.secNo !== "" ? Number(ctx.secNo) || 1 : 1
    return mode + ":" + variant + ":" + kind + ":" + fmt + ":s" + secN + ":" + sh
}

function readUint32BEImg(bytes, offset) {
    return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
}

function isJpegBytesImg(bytes) {
    return !!(bytes && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
}

function isPngBytesImg(bytes) {
    return !!(bytes && bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
}

function isGifBytesImg(bytes) {
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

function isWebpBytesImg(bytes) {
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

function pngBytesHasTransparencyImg(bytes) {
    if (!isPngBytesImg(bytes) || bytes.length < 33) return false
    var pos = 8
    while (pos + 12 <= bytes.length) {
        var len = readUint32BEImg(bytes, pos)
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

function webpBytesHasTransparencyImg(bytes) {
    if (!isWebpBytesImg(bytes)) return false
    var pos = 12
    while (pos + 8 <= bytes.length) {
        var chunk = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3])
        var sz = bytes[pos + 4] | (bytes[pos + 5] << 8) | (bytes[pos + 6] << 16) | (bytes[pos + 7] << 24)
        if (sz < 0 || pos + 8 + sz > bytes.length) break
        if (chunk === "VP8X" && sz >= 10) return (bytes[pos + 8] & 0x10) !== 0
        if (chunk === "VP8L") return true
        pos += 8 + sz + (sz & 1)
    }
    return false
}

function gifBytesHasTransparencyImg(bytes) {
    if (!isGifBytesImg(bytes)) return false
    for (var i = 0; i < bytes.length - 4; i++) {
        if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] >= 4) {
            if ((bytes[i + 3] & 1) !== 0) return true
        }
    }
    return false
}

function embeddedImageFillBytesTransparencyAsync(node) {
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
                        if (isJpegBytesImg(bytes)) return false
                        if (isPngBytesImg(bytes)) return pngBytesHasTransparencyImg(bytes)
                        if (isWebpBytesImg(bytes)) return webpBytesHasTransparencyImg(bytes)
                        if (isGifBytesImg(bytes)) return gifBytesHasTransparencyImg(bytes)
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

function scanSubtreeEmbeddedTransparencyAsync(node) {
    if (!node || !isVisible(node)) return Promise.resolve(false)
    return embeddedImageFillBytesTransparencyAsync(node).then(function (here) {
        if (here) return true
        if (!isContainer(node) || !node.children || !node.children.length) return false
        var ci = 0
        function nextChild() {
            if (ci >= node.children.length) return Promise.resolve(false)
            var ch = node.children[ci++]
            return scanSubtreeEmbeddedTransparencyAsync(ch).then(function (sub) {
                return sub || nextChild()
            })
        }
        return nextChild()
    })
}

function hasOpacityTransparencySubtreeSync(node) {
    if (!node || !isVisible(node)) return false
    if (typeof node.opacity === "number" && node.opacity < 1) return true
    if (hasVisibleFillWithOpacityLessThanOne(node)) return true
    if (!isContainer(node) || !node.children) return false
    for (var i = 0; i < node.children.length; i++) {
        if (hasOpacityTransparencySubtreeSync(node.children[i])) return true
    }
    return false
}

function nodeNeedsPngFromHeuristicAsync(node) {
    if (!node) return Promise.resolve(false)
    if (hasOpacityTransparencySubtreeSync(node)) return Promise.resolve(true)
    return scanSubtreeEmbeddedTransparencyAsync(node).then(function (bitmapAlpha) {
        if (bitmapAlpha) return true
        var analysis = analyzeExportFormatSubtree(node)
        var scores = computeExportFormatScores(analysis, node)
        return scores.png >= scores.jpg
    })
}

function decideRasterFormatFromPair(pcNode, moNode, ctx) {
    var pPc = pcNode ? nodeNeedsPngFromHeuristicAsync(pcNode) : Promise.resolve(false)
    var pMo = moNode ? nodeNeedsPngFromHeuristicAsync(moNode) : Promise.resolve(false)
    return Promise.all([pPc, pMo]).then(function (arr) {
        return arr[0] || arr[1] ? "PNG" : "JPG"
    })
}

function precomputeRasterFormatsForOrderedNodePairsAsync(moNodes, pcNodesOrNull, secNo, cache) {
    cache.rasterFormatBySlot = cache.rasterFormatBySlot || {}
    cache.rasterFormatByNodeId = cache.rasterFormatByNodeId || {}
    var proms = []
    var n = moNodes.length
    for (var i = 0; i < n; i++) {
        ;(function (slot) {
            var moN = moNodes[slot]
            var pcN = pcNodesOrNull && pcNodesOrNull[slot] != null ? pcNodesOrNull[slot] : null
            if (!moN && !pcN) {
                proms.push(Promise.resolve())
                return
            }
            var paired = !!pcNodesOrNull
            var pcFor = paired && pcN ? pcN : moN
            var moFor = paired && moN ? moN : null
            if (!paired) {
                pcFor = moN
                moFor = null
            }
            proms.push(
                decideRasterFormatFromPair(pcFor, moFor, {}).then(function (fmt) {
                    var sk = secNo + ":" + slot
                    cache.rasterFormatBySlot[sk] = fmt
                    if (moN && moN.id != null) cache.rasterFormatByNodeId[String(moN.id)] = fmt
                    if (pcN && pcN.id != null) cache.rasterFormatByNodeId[String(pcN.id)] = fmt
                }),
            )
        })(i)
    }
    return Promise.all(proms)
}

function rasterFormatFromNodeOrSlotMaps(cache, ctx, node) {
    var sk = slotRasterKey(ctx)
    if (sk && cache.rasterFormatBySlot && cache.rasterFormatBySlot[sk]) return cache.rasterFormatBySlot[sk]
    if (node && node.id != null && cache.rasterFormatByNodeId) {
        var hid = String(node.id)
        if (cache.rasterFormatByNodeId[hid]) return cache.rasterFormatByNodeId[hid]
    }
    var pc = ctx && ctx.pairPcNode
    if (pc && pc.id != null && cache.rasterFormatByNodeId) {
        var pid = String(pc.id)
        if (cache.rasterFormatByNodeId[pid]) return cache.rasterFormatByNodeId[pid]
    }
    return null
}

function resolveRasterFormatOnceAsync(node, ctx) {
    var cache = ctx.cache
    var cached = rasterFormatFromNodeOrSlotMaps(cache, ctx, node)
    if (cached) return Promise.resolve(cached)
    var mo = cache && cache.imageSuffix === "_mo"
    return decideRasterFormatFromPair(ctx.pairPcNode || node, mo ? node : null, ctx).then(function (fmt) {
        cache.rasterFormatByNodeId = cache.rasterFormatByNodeId || {}
        if (node && node.id != null) cache.rasterFormatByNodeId[String(node.id)] = fmt
        if (ctx.pairPcNode && ctx.pairPcNode.id != null) cache.rasterFormatByNodeId[String(ctx.pairPcNode.id)] = fmt
        var sk = slotRasterKey(ctx)
        if (sk) {
            cache.rasterFormatBySlot = cache.rasterFormatBySlot || {}
            cache.rasterFormatBySlot[sk] = fmt
        }
        return fmt
    })
}

function slotRasterKey(ctx) {
    if (!ctx.fromPrefetchSlot) return ""
    return (ctx.secNo || 1) + ":" + (ctx.slotIndex != null ? ctx.slotIndex : 0)
}

function decideImageKind(node, ctx) {
    ctx = ctx || {}
    if (!node) return Promise.resolve("skip")
    var cache = ctx.cache
    var mo = cache && cache.imageSuffix === "_mo"
    var sk = slotRasterKey(ctx)
    if (mo && ctx.insideSwiperSlide) {
        var rkSlide = null
        if (node.id != null && cache.slideAssetKeyByNodeId) rkSlide = cache.slideAssetKeyByNodeId[String(node.id)]
        if (!rkSlide && sk && cache.slideAssetKeyBySlot) rkSlide = cache.slideAssetKeyBySlot[sk]
        if (rkSlide) return Promise.resolve("pc-shared-slide")
    }
    if (node.type === "TEXT") {
        return resolveRasterFormatOnceAsync(node, ctx).then(function (fmt) {
            return fmt === "PNG" ? "raster-png" : "raster-jpg"
        })
    }
    if (isCodeRasterNode(node)) return Promise.resolve("composite-raster")
    if (ctx.sectionBackgroundImageFillOnly && hasImageFill(node)) {
        return resolveRasterFormatOnceAsync(node, ctx).then(function (fmt) {
            return fmt === "PNG" ? "raster-png" : "raster-jpg"
        })
    }
    if (isVectorOnlyTree(node)) return Promise.resolve("svg")
    if (isContainer(node) && shouldCompositeRasterGroup(node)) return Promise.resolve("composite-raster")
    if (!shouldExportAsSingleRasterImage(node)) return Promise.resolve("skip")
    return resolveRasterFormatOnceAsync(node, ctx).then(function (fmt) {
        return fmt === "PNG" ? "raster-png" : "raster-jpg"
    })
}

function rasterFormatFromKind(kind) {
    if (kind === "raster-png") return "PNG"
    if (kind === "raster-jpg") return "JPG"
    return "JPG"
}

/** IMAGE fill만 있는 빈 프레임을 만들어 export (clone 불가·clone 결과 빈 경우) */
function exportFillOnlySyntheticFrameAsync(node, format, ctx) {
    if (!node || !hasImageFill(node)) return Promise.resolve(null)
    var box = null
    try {
        box = getAbs(node)
    } catch (e0) {}
    if (!box || box.w == null || box.h == null) return Promise.resolve(null)
    var w = Math.max(1, Math.round(Number(box.w)))
    var h = Math.max(1, Math.round(Number(box.h)))
    var fills = null
    try {
        fills = node.fills
    } catch (e1) {}
    if (!fills || fills === figma.mixed) return Promise.resolve(null)
    var tmp = null
    try {
        tmp = figma.createFrame()
        tmp.name = "__bg_fill_only__"
        figma.currentPage.appendChild(tmp)
        tmp.resize(w, h)
        var dup = []
        for (var fi = 0; fi < fills.length; fi++) dup.push(JSON.parse(JSON.stringify(fills[fi])))
        tmp.fills = dup
        try {
            if (typeof node.cornerRadius === "number" && !isNaN(node.cornerRadius)) tmp.cornerRadius = node.cornerRadius
        } catch (eCr) {}
    } catch (e2) {
        try {
            if (tmp) tmp.remove()
        } catch (e3) {}
        return Promise.resolve(null)
    }
    return exportRasterAssetAsync(tmp, format, ctx).then(function (res) {
        try {
            if (tmp) tmp.remove()
        } catch (e4) {}
        return res
    })
}

function exportFillOnlyRasterAsync(node, format, ctx) {
    if (!node || !isContainer(node)) return Promise.resolve(null)
    var clone = null
    try {
        clone = node.clone()
        while (clone.children && clone.children.length > 0) clone.removeChild(clone.children[0])
    } catch (e) {
        return exportFillOnlySyntheticFrameAsync(node, format, ctx)
    }
    return exportRasterAssetAsync(clone, format, ctx).then(function (res) {
        try {
            if (clone) clone.remove()
        } catch (e2) {}
        if (res && res.dataUrl) return res
        return exportFillOnlySyntheticFrameAsync(node, format, ctx)
    })
}

/** 최상단 IMAGE fill의 원본 바이트만 (자식·벡터 없음). crop/scale은 프레임과 다를 수 있음 */
function exportRasterFromEmbeddedImageFillBytesAsync(node) {
    var hash = getPrimaryImageFillHash(node)
    if (!hash) return Promise.resolve(null)
    try {
        var img = figma.getImageByHash(hash)
        if (!img) return Promise.resolve(null)
        return img.getBytesAsync().then(function (bytes) {
            if (!bytes || bytes.length === 0) return null
            var b64 = figma.base64Encode(bytes)
            var mime = "image/png"
            var fmtEff = "PNG"
            if (isJpegBytesImg(bytes)) {
                mime = "image/jpeg"
                fmtEff = "JPG"
            } else if (isPngBytesImg(bytes)) {
                mime = "image/png"
                fmtEff = "PNG"
            } else if (isGifBytesImg(bytes)) {
                mime = "image/gif"
                fmtEff = "PNG"
            } else if (isWebpBytesImg(bytes)) {
                mime = "image/webp"
                fmtEff = "PNG"
            }
            return { dataUrl: "data:" + mime + ";base64," + b64, format: fmtEff }
        })
    } catch (e) {
        return Promise.resolve(null)
    }
}

/** 섹션/프레임 배경: fill만(클론·합성 프레임·임베드 원본). 보이는 자식이 있으면 전체 exportAsync로 합치지 않음 */
function exportSectionBackgroundImageRasterAsync(node, format, ctx) {
    if (!node || !hasImageFill(node)) return Promise.resolve(null)
    if (isContainer(node)) {
        return exportFillOnlyRasterAsync(node, format, ctx).then(function (res) {
            if (res && res.dataUrl) return res
            if (hasVisibleChildren(node)) return exportRasterFromEmbeddedImageFillBytesAsync(node)
            if (hasTextInSubtree(node)) return exportRasterWithoutTextSubtreeAsync(node, format, ctx)
            return exportRasterAssetAsync(node, format, ctx)
        })
    }
    if (hasTextInSubtree(node)) return exportRasterWithoutTextSubtreeAsync(node, format, ctx)
    return exportRasterAssetAsync(node, format, ctx)
}

/** 배경 래스터: fill·비텍스트 레이어는 유지, TEXT 노드만 클론에서 제거 후 export */
function exportRasterWithoutTextSubtreeAsync(node, format, ctx) {
    if (!node) return Promise.resolve(null)
    try {
        var clone = node.clone()
        function stripTextUnder(n) {
            if (!n || !isContainer(n) || !n.children) return
            var i = n.children.length
            while (i-- > 0) {
                var c = n.children[i]
                if (!c) continue
                if (c.type === "TEXT") {
                    try {
                        c.remove()
                    } catch (e) {}
                } else {
                    stripTextUnder(c)
                }
            }
        }
        stripTextUnder(clone)
        return exportRasterAssetAsync(clone, format, ctx).then(function (res) {
            try {
                clone.remove()
            } catch (e2) {}
            return res
        })
    } catch (e) {
        return Promise.resolve(null)
    }
}

function exportRasterAssetAsync(node, format, ctx) {
    if (!node) return Promise.resolve(null)
    /** ZIP 산출물: 피그마 노드 실제(1×) 픽셀 크기 — WIDTH 제약 시 1200 등으로 강제 축소됨 */
    var w =
        ctx && ctx.cache && ctx.cache.imagePipeline && ctx.cache.imagePipeline.mode === "zip"
            ? null
            : _currentExportWidth
    // false: 노드 선택 박스(클립된 시각 영역) 기준. true면 자손·오버플로가 절대 바운딩까지 PNG에 포함됨.
    var exportBoundsOpts = { useAbsoluteBounds: false }
    function pack(dataUrl, fmtEff) {
        return dataUrl ? { dataUrl: dataUrl, format: fmtEff } : null
    }
    function doExport(widthOrNull, fmtEff) {
        var opts =
            widthOrNull != null
                ? { constraint: { type: "WIDTH", value: widthOrNull }, format: fmtEff }
                : { format: fmtEff }
        for (var k in exportBoundsOpts) {
            if (Object.prototype.hasOwnProperty.call(exportBoundsOpts, k)) opts[k] = exportBoundsOpts[k]
        }
        return node
            .exportAsync(opts)
            .then(function (bytes) {
                if (bytes && bytes.length > 0) {
                    var b64 = figma.base64Encode(bytes)
                    return pack(
                        fmtEff === "PNG" ? "data:image/png;base64," + b64 : "data:image/jpeg;base64," + b64,
                        fmtEff,
                    )
                }
                return null
            })
            .catch(function () {
                return null
            })
    }
    function tryFmtSeq(fmtEff) {
        return doExport(w, fmtEff).then(function (r) {
            if (r) return r
            return doExport(800, fmtEff)
        }).then(function (r) {
            if (r) return r
            return doExport(null, fmtEff)
        })
    }
    if (format === "PNG") return tryFmtSeq("PNG")
    return tryFmtSeq("JPG").then(function (r) {
        if (r) return r
        return tryFmtSeq("PNG")
    })
}

function exportSvgAssetAsync(node, ctx) {
    if (!node || !isVectorOnlyTree(node)) return Promise.resolve(null)
    try {
        return node
            .exportAsync({ format: "SVG" })
            .then(function (bytes) {
                if (bytes && bytes.length > 0) return "data:image/svg+xml;base64," + figma.base64Encode(bytes)
                return null
            })
            .catch(function () {
                return null
            })
    } catch (e) {
        return Promise.resolve(null)
    }
}

function exportCompositeRasterAsync(node, format, ctx) {
    return exportRasterAssetAsync(node, format || "JPG", ctx)
}

function needsFillOnlyStrip(node) {
    return !!(hasImageFill(node) && isContainer(node) && hasTextInSubtree(node))
}

function exportByKind(node, kind, format, ctx) {
    if (!node || kind === "skip") return Promise.resolve(null)
    if (kind === "pc-shared-slide") return Promise.resolve(null)
    if (kind === "svg") return exportSvgAssetAsync(node, ctx)
    var fmt = format || rasterFormatFromKind(kind)
    var src = (ctx && ctx.rasterExportSourceNode) || node
    var fromParentClip = src !== node
    if (ctx && ctx.sectionBackgroundImageFillOnly && hasImageFill(node)) {
        return exportSectionBackgroundImageRasterAsync(node, fmt, ctx)
    }
    if (kind === "composite-raster") return exportCompositeRasterAsync(src, fmt, ctx)
    if (!fromParentClip && needsFillOnlyStrip(node)) return exportFillOnlyRasterAsync(node, fmt, ctx)
    if (!fromParentClip && hasImageFill(node) && isContainer(node) && hasVisibleChildren(node))
        return exportFillOnlyRasterAsync(node, fmt, ctx)
    return exportRasterAssetAsync(src, fmt, ctx)
}

function finishExport(node, kind, fmt, ctx) {
    var cache = ctx.cache
    var assetKey = makeAssetKey(node, kind, fmt, ctx)
    var hit = getCachedAsset(cache, assetKey)
    if (hit)
        return Promise.resolve({
            dataUrl: hit,
            assetKey: assetKey,
            kind: kind,
            format: fmt,
            reuseAssetKey: null,
        })
    return exportByKind(node, kind, fmt, ctx).then(function (exp) {
        var dataUrl = null
        var fmtFinal = fmt
        if (exp && typeof exp === "object" && exp.dataUrl != null) {
            dataUrl = exp.dataUrl
            if (exp.format) fmtFinal = exp.format
        } else if (typeof exp === "string") {
            dataUrl = exp
        }
        if (fmtFinal && fmtFinal !== fmt) assetKey = makeAssetKey(node, kind, fmtFinal, ctx)
        if (dataUrl) setCachedAsset(cache, assetKey, dataUrl)
        return { dataUrl: dataUrl, assetKey: assetKey, kind: kind, format: fmtFinal, reuseAssetKey: null }
    })
}

function pipelineEnsureImageAsync(node, ctx) {
    if (!node) return Promise.resolve(null)
    ensureImagePipelineOnCache(ctx.cache)
    var cache = ctx.cache
    return decideImageKind(node, ctx).then(function (kind) {
        if (kind === "skip") return null
        if (kind === "pc-shared-slide") {
            var sk2 = slotRasterKey(ctx)
            var rk = null
            if (node.id != null && cache.slideAssetKeyByNodeId) rk = cache.slideAssetKeyByNodeId[String(node.id)]
            if (!rk && sk2 && cache.slideAssetKeyBySlot) rk = cache.slideAssetKeyBySlot[sk2]
            var dataUrlPc = rk ? getCachedAsset(cache, rk) : null
            return {
                dataUrl: dataUrlPc,
                assetKey: rk || makeAssetKey(node, kind, null, ctx),
                kind: kind,
                format: null,
                reuseAssetKey: rk,
            }
        }
        if (kind === "svg") {
            return finishExport(node, kind, null, ctx)
        }
        if (kind === "composite-raster") {
            return resolveRasterFormatOnceAsync(node, ctx).then(function (f) {
                var effCtx =
                    ctx &&
                    !ctx.sectionBackgroundImageFillOnly &&
                    ctx.clipExportParent &&
                    shouldRasterExportViaParentClip(node, ctx.clipExportParent)
                        ? Object.assign({}, ctx, { rasterExportSourceNode: ctx.clipExportParent })
                        : ctx
                return finishExport(node, kind, f, effCtx)
            })
        }
        return resolveRasterFormatOnceAsync(node, ctx).then(function (f) {
            var effCtx2 =
                ctx &&
                !ctx.sectionBackgroundImageFillOnly &&
                ctx.clipExportParent &&
                shouldRasterExportViaParentClip(node, ctx.clipExportParent)
                    ? Object.assign({}, ctx, { rasterExportSourceNode: ctx.clipExportParent })
                    : ctx
            return finishExport(node, kind, f, effCtx2)
        })
    })
}

function resolvePipelineImageAsync(node, ctx) {
    return pipelineEnsureImageAsync(node, ctx).then(function (r) {
        return r && r.dataUrl ? r.dataUrl : null
    })
}

function sendImagesToUI(images, ingestId) {
    if (!images || !images.length) return
    for (var i = 0; i < images.length; i++) {
        var item = images[i]
        figma.ui.postMessage({
            type: "RESULT_IMAGES_CHUNK",
            ingestId: ingestId,
            index: i,
            name: item.name,
            dataUrl: item.dataUrl,
        })
    }
    figma.ui.postMessage({ type: "RESULT_IMAGES_END", ingestId: ingestId })
}
