/**
 * 085-section-background — 섹션·노드 배경 fill → CSS (--bgc / --bg-img, ::before full-bleed)
 *
 * Section 배경 hoist: 직계(또는 직계 투명 래퍼 1단 아래) 컨테이너의 보이는 SOLID/IMAGE fill을
 * section에 CSS 변수로만 올리고, 해당 노드의 surface 배경은 096에서 생략한다.
 * (section 루트에 background-color 직접 부여하지 않음 — buildBackgroundDeclAsync(..., true) → --bgc)
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

/** 맨 위 solid 아래(더 아래 레이어)에 보이는 IMAGE fill이 있으면 반환 — 이미지+딤을 한 장으로 raster export 할 때 사용 */
function getVisibleImageFillBelowTopIndex(node, topFillIndex) {
    try {
        if (!node || !node.fills || node.fills === figma.mixed) return null
        var fills = node.fills || []
        for (var i = topFillIndex - 1; i >= 0; i--) {
            var f = fills[i]
            if (!f || f.visible === false) continue
            if (f.type === "IMAGE") return { type: "IMAGE", fill: f, index: i }
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
        var bgPathOpts = {
            skipExport: isVideoNodeEffective(node, cache),
            imageHash: getPrimaryImageFillHash(node),
            reuseAssetKey: meta.reuseAssetKey || undefined,
        }
        if (cache.imageSuffix === "_mo" && bgCtx.pairPcNode && meta && meta.kind !== "pc-shared-slide" && !meta.reuseAssetKey) {
            bgPathOpts.pairedPcAssetKey = makePairedPcAssetKeyForInheritedPathLookup(bgCtx.pairPcNode, meta, secNo, cache, true)
        }
        var path = cache ? getOrAssignImagePath(cache, meta.assetKey, meta.dataUrl || "", secNo, bgPathOpts) : ""
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

    // 맨 위 fill 기준으로만 판단 (단, solid 아래에 image면 fill-only 합성 래스터 한 장으로 export — 자식 텍스트 제외)
    if (topFill.type === "SOLID") {
        if (getVisibleImageFillBelowTopIndex(node, topFill.index)) {
            return pipelineRasterBackgroundImageDeclAsync(node, useCssVarsForSection, cache, secNo).then(function (rasterDecl) {
                if (rasterDecl) return rasterDecl
                var solid = topFill.fill
                var color = solid && solid.color ? rgbToHex(solid.color) : ""
                if (!color) return ""
                var opacity = typeof solid.opacity === "number" ? r2(solid.opacity) : null
                var finalColor = color
                if (opacity != null && opacity >= 0 && opacity < 1) {
                    finalColor = hexToRgba(color, opacity) || color
                }
                return useCssVarsForSection ? "--bgc:" + finalColor : "background-color:" + finalColor
            })
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

function sectionChildCoversFraction(chBox, sectionBox, fract) {
    return chBox.w >= sectionBox.w * fract && chBox.h >= sectionBox.h * fract
}

/**
 * 섹션(부모) Auto Layout 기준 직계 자식이 가로·세로 모두 FILL → CSS width/height 100%에 해당, 전면 배경판.
 */
function sectionDirectChildFillWidthHeight(ch, sectionNode) {
    try {
        if (!ch || !sectionNode || !isFlex(sectionNode)) return false
        return ch.layoutSizingHorizontal === "FILL" && ch.layoutSizingVertical === "FILL"
    } catch (e) {}
    return false
}

function childSpansSectionForImagePromote(chBox, sectionBox, fract, ch, sectionNode) {
    if (sectionDirectChildFillWidthHeight(ch, sectionNode)) return true
    return !!(chBox && sectionBox && sectionChildCoversFraction(chBox, sectionBox, fract))
}

/**
 * 레이어명 힌트(bg / background / section-bg / code-bg): 정렬 가산점만.
 * geometry·visual 불통과를 메우지 않음.
 */
function sectionBgHoistLayerNameHint(node) {
    try {
        var s = node && node.name != null ? String(node.name).toLowerCase() : ""
        if (!s) return false
        if (s.indexOf("section-bg") >= 0 || s.indexOf("code-bg") >= 0) return true
        if (s.indexOf("background") >= 0) return true
        if (/\bbg\b/.test(s)) return true
    } catch (e) {}
    return false
}

function nodeHasVisibleEffectsForSectionBgHoist(node) {
    try {
        var eff = node.effects
        if (!eff || !eff.length) return false
        for (var i = 0; i < eff.length; i++) {
            if (eff[i] && eff[i].visible !== false) return true
        }
    } catch (e) {}
    return false
}

function nodeBlendModeDisqualifiesSectionBgHoist(node) {
    try {
        var m = node.blendMode
        if (m == null || m === "") return false
        var u = String(m).toUpperCase()
        return u !== "PASS_THROUGH" && u !== "NORMAL"
    } catch (e2) {}
    return false
}

/** 맨 위 보이는 fill 단일 레이어 불투명도 < 1 이면 제외(노드 opacity와 별도) */
function topVisibleFillOpacityDisqualifiesSectionBgHoist(node) {
    var top = getTopmostVisibleFill(node, {})
    if (!top || !top.fill) return false
    var o = top.fill.opacity
    return typeof o === "number" && o < 1 - 1e-6
}

/**
 * 카드·장식·클립 레이어는 section ::before로 승격하면 안 됨.
 * radius, stroke, 노드/맨위 fill 불투명, effect, 비정상 blend, clipsContent 전부 제외.
 */
function nodeDisqualifiedFromSectionBgHoistVisual(node) {
    if (!node) return true
    try {
        if (typeof node.opacity === "number" && node.opacity < 1) return true
        if (nodeHasVisibleEffectsForSectionBgHoist(node)) return true
        if (nodeBlendModeDisqualifiesSectionBgHoist(node)) return true
        if (node.clipsContent === true) return true
        if (topVisibleFillOpacityDisqualifiesSectionBgHoist(node)) return true
        if (nodeHasNonZeroCornerRadius(node)) return true
        if (getFirstSolidStroke(node)) return true
    } catch (e) {}
    return false
}

/**
 * Auto Layout 패딩이 크면 내부 콘텐츠 surface일 가능성이 높음(단순 full-bleed 판과 구분).
 * 절대박스가 섹션을 거의 채워도 패딩·축 조합으로 plate로 본다.
 */
function sectionBgHoistPaddingSuggestsContentPlateNotFullBleed(ch, sectionBox) {
    if (!ch || !sectionBox || !isFlex(ch)) return false
    try {
        var pt = Number(ch.paddingTop) || 0
        var pb = Number(ch.paddingBottom) || 0
        var pl = Number(ch.paddingLeft) || 0
        var pr = Number(ch.paddingRight) || 0
        var padV = pt + pb
        var padH = pl + pr
        var chBox = getAbs(ch)
        if (!chBox || sectionBox.h == null || sectionBox.w == null) return false
        var hTh = Math.max(48, sectionBox.h * 0.06)
        var wTh = Math.max(48, sectionBox.w * 0.06)
        if (padV > hTh && chBox.h < sectionBox.h * 0.97) return true
        if (padH > wTh && chBox.w < sectionBox.w * 0.97) return true
        if (padV > hTh && padH > wTh) return true
        if (pt > sectionBox.h * 0.05 || pb > sectionBox.h * 0.05) return true
        if (pl > sectionBox.w * 0.05 || pr > sectionBox.w * 0.05) return true
    } catch (e) {}
    return false
}

/**
 * 주·교차축이 CENTER/MAX(end)로 모이는 정렬이면 콘텐츠 박스 패턴.
 * 박스가 섹션 면적을 97% 미만 채우면 하단/중앙 plate로 보고 제외.
 */
function sectionBgHoistFlexAlignSuggestsContentPlate(ch, sectionBox, chBox) {
    if (!ch || !sectionBox || !chBox || !isFlex(ch)) return false
    try {
        var p = String(ch.primaryAxisAlignItems || "").toUpperCase()
        var c = String(ch.counterAxisAlignItems || "").toUpperCase()
        var pushBoth = (p === "MAX" || p === "CENTER") && (c === "MAX" || c === "CENTER")
        if (!pushBoth) return false
        var hr = sectionBox.h > 0 ? chBox.h / sectionBox.h : 0
        var wr = sectionBox.w > 0 ? chBox.w / sectionBox.w : 0
        if (hr < 0.97 || wr < 0.97) return true
    } catch (e2) {}
    return false
}

/**
 * 섹션 직계에 서로 다른 보이는 배경 fill이 둘 이상(충분한 가로)이면 단일 ::before 승격 불가.
 */
function sectionHoistDirectChildrenHaveDistinctBackgroundFills(sectionNode, sectionBox) {
    if (!sectionNode || !sectionBox) return false
    var sigs = {}
    var nSig = 0
    var kids = sectionNode.children || []
    for (var i = 0; i < kids.length; i++) {
        var k = kids[i]
        if (!k || !isVisible(k)) continue
        if (!getTopmostVisibleFill(k, {})) continue
        if (nodeDisqualifiedFromSectionBgHoistVisual(k)) continue
        var kb = getAbs(k)
        if (!kb || kb.w < sectionBox.w * 0.35) continue
        var sig = sectionBgHoistTopFillSignature(k)
        if (!sig) continue
        if (!sigs[sig]) {
            sigs[sig] = true
            nSig++
            if (nSig > 1) return true
        }
    }
    return false
}

function sectionBgHoistTopFillSignature(node) {
    var top = getTopmostVisibleFill(node, {})
    if (!top) return ""
    if (top.type === "SOLID") {
        var c = top.fill && top.fill.color ? rgbToHex(top.fill.color) : ""
        var op = typeof top.fill.opacity === "number" ? r2(top.fill.opacity) : 1
        return "s:" + c + "/" + op
    }
    if (top.type === "IMAGE") return "i:" + getPrimaryImageFillHash(node)
    return ""
}

/**
 * full-bleed 배경 판: 후보 absoluteBoundingBox가 섹션과 같은 사각형에 가깝게 맞닿아야 함.
 * 좌·상 delta <= 2px, 하단 delta <= 4px, 너비 >= 95%, 높이 >= 90%.
 */
function sectionBgHoistCandidateGeometryOk(chBox, sectionBox) {
    if (!chBox || !sectionBox || sectionBox.w <= 0 || sectionBox.h <= 0) return false
    var xyTol = 2
    var bottomTol = 4
    var wMin = 0.95
    var hMin = 0.9
    if (Math.abs(r2(chBox.x) - r2(sectionBox.x)) > xyTol) return false
    if (Math.abs(r2(chBox.y) - r2(sectionBox.y)) > xyTol) return false
    if (chBox.w + 1e-6 < sectionBox.w * wMin) return false
    if (chBox.h + 1e-6 < sectionBox.h * hMin) return false
    var secBottom = r2(sectionBox.y) + r2(sectionBox.h)
    var chBottom = r2(chBox.y) + r2(chBox.h)
    if (Math.abs(chBottom - secBottom) > bottomTol) return false
    return true
}

/**
 * 후보가 둘 이상이고 서로 다른 fill 시그니처면 전체 포기. 동일 시그니처면 면적 최대 1개만.
 */
function sectionBgHoistResolveConflictingCandidates(out) {
    if (!out || out.length === 0) return out
    if (out.length === 1) return out
    var sig0 = sectionBgHoistTopFillSignature(out[0].node)
    for (var i = 1; i < out.length; i++) {
        if (sectionBgHoistTopFillSignature(out[i].node) !== sig0) return []
    }
    out.sort(function (a, b) {
        var ba = getAbs(a.node)
        var bb = getAbs(b.node)
        var aa = ba && ba.w != null && ba.h != null ? ba.w * ba.h : 0
        var ab = bb && bb.w != null && bb.h != null ? bb.w * bb.h : 0
        return ab - aa
    })
    return [out[0]]
}

function unwrapSingleVisibleChildChain(node) {
    var cur = node
    while (cur && isContainer(cur) && cur.children && cur.children.length) {
        var vis = []
        for (var i = 0; i < cur.children.length; i++) {
            var c = cur.children[i]
            if (c && isVisible(c)) vis.push(c)
        }
        if (vis.length !== 1) return null
        cur = vis[0]
    }
    return cur
}

/**
 * 섹션 자체에 이미지 fill이 없을 때, 직계 자식 중 배경으로 올릴 이미지 레이어.
 * 단일 이미지·한 겹(또는 단일 자식 체인) 래퍼·마스크 이미지 그룹. HTML에선 skipId 직계 자식 전체 생략.
 */
function findSectionBgImagePromoteTarget(sectionNode, sectionBox, cache) {
    var fract = 0.85
    var children = sectionNode && sectionNode.children ? sectionNode.children : []
    for (var i = 0; i < children.length; i++) {
        var ch = children[i]
        if (!ch || !isVisible(ch)) continue
        var chBox = getAbs(ch)
        if (!childSpansSectionForImagePromote(chBox, sectionBox, fract, ch, sectionNode)) continue

        var isCont = isContainer(ch) && ch.children && ch.children.length > 0

        if (!isCont) {
            if (isImageCandidate(ch, cache)) return { skipId: ch.id, exportNode: ch }
            continue
        }

        var maskGroup = isMaskImageRasterGroup(ch)
        if (subtreeHasVectorOrTextOverlay(ch, cache) && !maskGroup) continue

        if (isImageCandidate(ch, cache)) return { skipId: ch.id, exportNode: ch }

        var leaf = unwrapSingleVisibleChildChain(ch)
        if (leaf && isImageCandidate(leaf, cache)) return { skipId: ch.id, exportNode: leaf }
    }
    return null
}

/**
 * 섹션 직계 자식(d1) 기준으로만 후보를 만든다.
 * - d1에 fill 있음 → [d1] (배경이 래퍼에 있는 경우)
 * - d1에 fill 없음(투명 래퍼) → d1의 직계 자식 중, 컨테이너이고 fill 있는 노드만 (한 겹만)
 */
function collectBgHoistCandidatesUnderSectionDirectChild(d1) {
    var out = []
    if (!d1 || !isVisible(d1)) return out
    if (!(isContainer(d1) && d1.children && d1.children.length)) return out
    if (getTopmostVisibleFill(d1, {})) {
        out.push(d1)
        return out
    }
    var gKids = d1.children || []
    for (var j = 0; j < gKids.length; j++) {
        var inn = gKids[j]
        if (!inn || !isVisible(inn)) continue
        if (!(isContainer(inn) && inn.children && inn.children.length)) continue
        if (!getTopmostVisibleFill(inn, {})) continue
        out.push(inn)
    }
    return out
}

/**
 * 섹션 직계(또는 직계 투명 래퍼 1단 아래) 컨테이너의 SOLID/IMAGE fill을 section `--bgc`/`--bg-img`로 hoist.
 * 엄격한 전면 기하·시각 제외·패딩·flex 정렬·직계 다중 배경 충돌. 레이어명은 정렬 가산점만.
 */
function collectFullBleedContainerBgHoistTargets(sectionNode, sectionBox) {
    if (sectionHoistDirectChildrenHaveDistinctBackgroundFills(sectionNode, sectionBox)) return []
    var out = []
    var kids = sectionNode && sectionNode.children ? sectionNode.children : []
    for (var i = 0; i < kids.length; i++) {
        var d1 = kids[i]
        if (!d1 || !isVisible(d1)) continue
        var candidates = collectBgHoistCandidatesUnderSectionDirectChild(d1)
        for (var c = 0; c < candidates.length; c++) {
            var ch = candidates[c]
            if (nodeDisqualifiedFromSectionBgHoistVisual(ch)) continue
            if (sectionBgHoistPaddingSuggestsContentPlateNotFullBleed(ch, sectionBox)) continue
            var chBox = getAbs(ch)
            if (!chBox) continue
            if (sectionBgHoistFlexAlignSuggestsContentPlate(ch, sectionBox, chBox)) continue
            if (!sectionBgHoistCandidateGeometryOk(chBox, sectionBox)) continue
            var top = getTopmostVisibleFill(ch, {})
            if (!top) continue
            if (top.type === "SOLID") {
                out.push({ childId: ch.id, mode: "solid", node: ch })
            } else if (top.type === "IMAGE") {
                out.push({ childId: ch.id, mode: "image", node: ch })
            }
        }
    }
    out.sort(function (a, b) {
        var ha = sectionBgHoistLayerNameHint(a.node) ? 1 : 0
        var hb = sectionBgHoistLayerNameHint(b.node) ? 1 : 0
        if (ha !== hb) return hb - ha
        var sa = a.mode === "solid" ? 1 : 0
        var sb = b.mode === "solid" ? 1 : 0
        if (sa !== sb) return sb - sa
        var ba = getAbs(a.node)
        var bb = getAbs(b.node)
        var aa = ba && ba.w != null && ba.h != null ? ba.w * ba.h : 0
        var ab = bb && bb.w != null && bb.h != null ? bb.w * bb.h : 0
        return ab - aa
    })
    return sectionBgHoistResolveConflictingCandidates(out)
}

function sectionDeclHasBgCssVars(decl) {
    return /(^|;)\s*--bg-(img|c)\b/.test(";" + String(decl || ""))
}

function buildSectionBackgroundAsync(sectionNode, cache, secNo) {
    var slideData = getSlideItems(sectionNode)

    return buildBackgroundDeclAsync(sectionNode, true, cache, secNo).then(function (fillDecl) {
        var decl = fillDecl || ""
        var strokeDecl = buildStrokeDecl(sectionNode)
        if (strokeDecl) decl = decl ? decl + ";" + strokeDecl : strokeDecl
        var radiusDecl = buildCornerRadiusDecl(sectionNode)
        if (radiusDecl) decl = decl ? decl + ";" + radiusDecl : radiusDecl

        var topFillForBg = getTopmostVisibleFill(sectionNode)
        if (topFillForBg && topFillForBg.type === "IMAGE") return { decl: decl, bgChildId: null, hoistBgChildId: null }
        if (topFillForBg && topFillForBg.type === "SOLID" && hasImageFill(sectionNode))
            return { decl: decl, bgChildId: null, hoistBgChildId: null }
        if (slideData) return { decl: decl, bgChildId: null, hoistBgChildId: null }

        var sectionBox = getAbs(sectionNode)
        if (!sectionBox) return { decl: decl, bgChildId: null, hoistBgChildId: null }

        var sectionOwnBg = sectionDeclHasBgCssVars(fillDecl || "")

        function tryFullBleedContainerBgHoistPromise() {
            var hoists = collectFullBleedContainerBgHoistTargets(sectionNode, sectionBox)
            function tryHoistAtIndex(idx) {
                if (idx >= hoists.length) return Promise.resolve({ decl: decl, bgChildId: null, hoistBgChildId: null })
                var hoist = hoists[idx]
                if (!hoist || !hoist.node) return tryHoistAtIndex(idx + 1)
                return buildBackgroundDeclAsync(hoist.node, true, cache, secNo, { sectionBgHoist: true }).then(function (hoistDecl) {
                    if (!hoistDecl || !sectionDeclHasBgCssVars(hoistDecl)) return tryHoistAtIndex(idx + 1)
                    var merged = decl ? decl + ";" + hoistDecl : hoistDecl
                    return { decl: merged, bgChildId: null, hoistBgChildId: hoist.childId }
                })
            }
            return tryHoistAtIndex(0)
        }

        if (!sectionOwnBg) {
            var promote = findSectionBgImagePromoteTarget(sectionNode, sectionBox, cache)
            if (promote) {
                var exportNode = promote.exportNode
                var bleedCtx = {
                    cache: cache,
                    secNo: secNo,
                    slotIndex: 0,
                    insideSwiperSlide: false,
                    sectionBackgroundImageFillOnly: true,
                }
                if (cache.imageSuffix === "_mo" && exportNode && exportNode.id != null && cache.pairPcNodeIdByMoId) {
                    var _pcBleedId = cache.pairPcNodeIdByMoId[String(exportNode.id)]
                    if (_pcBleedId) {
                        try {
                            bleedCtx.pairPcNode = figma.getNodeById(_pcBleedId)
                        } catch (e) {}
                    }
                }
                return pipelineEnsureImageAsync(exportNode, bleedCtx).then(function (meta) {
                    if (!meta || !meta.dataUrl) return tryFullBleedContainerBgHoistPromise()
                    var bleedPathOpts = {
                        skipExport: isVideoNodeEffective(exportNode, cache),
                        imageHash: getPrimaryImageFillHash(exportNode),
                        reuseAssetKey: meta.reuseAssetKey || undefined,
                    }
                    if (cache.imageSuffix === "_mo" && bleedCtx.pairPcNode && meta && meta.kind !== "pc-shared-slide" && !meta.reuseAssetKey) {
                        bleedPathOpts.pairedPcAssetKey = makePairedPcAssetKeyForInheritedPathLookup(bleedCtx.pairPcNode, meta, secNo, cache, true)
                    }
                    var path = cache ? getOrAssignImagePath(cache, meta.assetKey, meta.dataUrl, secNo, bleedPathOpts) : ""
                    if (path && meta.dataUrl) {
                        var merged = decl ? decl + ";--bg-img:url(" + path + ")" : "--bg-img:url(" + path + ")"
                        return { decl: merged, bgChildId: promote.skipId, hoistBgChildId: null }
                    }
                    return tryFullBleedContainerBgHoistPromise()
                })
            }

            return tryFullBleedContainerBgHoistPromise()
        }

        return { decl: decl, bgChildId: null, hoistBgChildId: null }
    })
}
