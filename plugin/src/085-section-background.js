/**
 * 085-section-background — 섹션·노드 배경 fill → CSS (--bg-img 등)
 */
function getTopmostVisibleFill(node, opts) {
    try {
        if (!node || !node.fills || node.fills === figma.mixed) return null

        opts = opts || {}
        var skipImageFill = opts.skipImageFill === true
        var skipSolidFill = opts.skipSolidFill === true

        var fills = node.fills || []
        for (var i = fills.length - 1; i >= 0; i--) {
            var f = fills[i]
            if (!f || f.visible === false) continue

            if (f.type === "IMAGE" && !skipImageFill) {
                return { type: "IMAGE", fill: f, index: i }
            }
            if (f.type === "SOLID" && !skipSolidFill) {
                return { type: "SOLID", fill: f, index: i }
            }
        }
    } catch (e) {}
    return null
}

function pipelineRasterBackgroundImageDeclAsync(node, useCssVarsForSection, cache, secNo) {
    var bgCtx = { cache: cache, secNo: secNo, slotIndex: 0, insideSwiperSlide: false, sectionBackgroundImageFillOnly: true }
    if (cache.imageSuffix === "_mo" && node && node.id != null && cache.pairPcNodeIdByMoId) {
        var _pcBgId = cache.pairPcNodeIdByMoId[String(node.id)]
        if (_pcBgId) {
            try {
                bgCtx.pairPcNode = figma.getNodeById(_pcBgId)
            } catch (e) {}
        }
    }
    return pipelineEnsureImageAsync(node, bgCtx).then(function (meta) {
        if (!meta || !meta.dataUrl) return ""
        var path = cache
            ? getOrAssignImagePath(cache, meta.assetKey, meta.dataUrl || "", secNo, {
                  skipExport: isVideoNode(node),
                  imageHash: getPrimaryImageFillHash(node),
                  reuseAssetKey: meta.reuseAssetKey || undefined,
              })
            : ""
        var imgUrl = (path && path.length) ? path : meta.dataUrl
        if (!imgUrl) return ""
        if (useCssVarsForSection) {
            return "--bg-img:url(" + imgUrl + ")"
        }
        return (
            "background-image:url(" +
            imgUrl +
            ");background-repeat:no-repeat;background-position:center;background-size:100% 100%"
        )
    })
}

function buildBackgroundDeclAsync(node, useCssVarsForSection, cache, secNo, opts) {
    if (!node) return Promise.resolve("")
    if (node.type === "TEXT") return Promise.resolve("")

    opts = opts || {}
    var topFill = getTopmostVisibleFill(node, opts)
    if (!topFill) return Promise.resolve("")

    var parts = []

    if (topFill.type === "SOLID") {
        if (hasImageFill(node)) {
            return pipelineRasterBackgroundImageDeclAsync(node, useCssVarsForSection, cache, secNo)
        }
        var solid = topFill.fill
        var color = solid && solid.color ? rgbToHex(solid.color) : ""
        if (!color) return Promise.resolve("")

        var opacity = typeof solid.opacity === "number" ? r2(solid.opacity) : null
        var finalColor = color
        if (opacity != null && opacity >= 0 && opacity < 1) {
            finalColor = hexToRgba(color, opacity) || color
        }

        if (useCssVarsForSection) parts.push("--bgc:" + finalColor)
        else parts.push("background-color:" + finalColor)

        return Promise.resolve(parts.join(";"))
    }

    if (topFill.type === "IMAGE") {
        return pipelineRasterBackgroundImageDeclAsync(node, useCssVarsForSection, cache, secNo)
    }

    return Promise.resolve("")
}

function buildSectionBackgroundAsync(sectionNode, cache, secNo) {
    var slideData = getSlideItems(sectionNode)

    return buildBackgroundDeclAsync(sectionNode, true, cache, secNo).then(function (decl) {
        var strokeDecl = buildStrokeDecl(sectionNode)
        if (strokeDecl) decl = decl ? decl + ";" + strokeDecl : strokeDecl
        var radiusDecl = buildCornerRadiusDecl(sectionNode)
        if (radiusDecl) decl = decl ? decl + ";" + radiusDecl : radiusDecl

        var topFillForBg = getTopmostVisibleFill(sectionNode)
        if (topFillForBg && topFillForBg.type === "IMAGE") return { decl: decl, bgChildId: null }
        if (topFillForBg && topFillForBg.type === "SOLID" && hasImageFill(sectionNode)) return { decl: decl, bgChildId: null }
        if (slideData) return { decl: decl, bgChildId: null }

        var children = sectionNode && sectionNode.children ? sectionNode.children : []
        var sectionBox = getAbs(sectionNode)
        if (!sectionBox || children.length === 0) return { decl: decl, bgChildId: null }

        var fullBleedChild = null
        for (var i = 0; i < children.length; i++) {
            var ch = children[i]
            if (!ch || !isVisible(ch) || !isImageCandidate(ch)) continue
            if (isContainer(ch) && ch.children && ch.children.length > 0) continue
            var chBox = getAbs(ch)
            if (!chBox) continue
            if (chBox.w >= sectionBox.w * 0.9 && chBox.h >= sectionBox.h * 0.9) {
                fullBleedChild = ch
                break
            }
        }
        if (!fullBleedChild) return { decl: decl, bgChildId: null }

        var bleedCtx = { cache: cache, secNo: secNo, slotIndex: 0, insideSwiperSlide: false, sectionBackgroundImageFillOnly: true }
        if (cache.imageSuffix === "_mo" && fullBleedChild && fullBleedChild.id != null && cache.pairPcNodeIdByMoId) {
            var _pcBleedId = cache.pairPcNodeIdByMoId[String(fullBleedChild.id)]
            if (_pcBleedId) {
                try {
                    bleedCtx.pairPcNode = figma.getNodeById(_pcBleedId)
                } catch (e) {}
            }
        }
        return pipelineEnsureImageAsync(fullBleedChild, bleedCtx).then(function (meta) {
            if (!meta || !meta.dataUrl) return { decl: decl, bgChildId: null }
            var path = cache
                ? getOrAssignImagePath(cache, meta.assetKey, meta.dataUrl, secNo, {
                      skipExport: isVideoNode(fullBleedChild),
                      imageHash: getPrimaryImageFillHash(fullBleedChild),
                      reuseAssetKey: meta.reuseAssetKey || undefined,
                  })
                : ""
            if (path && meta.dataUrl) {
                var merged = decl ? decl + ";--bg-img:url(" + path + ")" : "--bg-img:url(" + path + ")"
                return { decl: merged, bgChildId: fullBleedChild.id }
            }
            return { decl: decl, bgChildId: null }
        })
    })
}
