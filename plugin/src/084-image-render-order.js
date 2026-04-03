/**
 * 084-image-render-order — 렌더 순서와 동일한 <img> 노드 id 수집·선행 export(에셋 경로/해시 디듀프는 083)
 *
 * buildCodeAsync에서 마크업 전에 호출: ap-section__image 번호는 렌더 순서, 파일명 imgNN은 해시·할당 순(별개).
 */
/** 섹션 서브트리에서 nodeId에 해당하는 SceneNode 탐색 */
function findNodeByIdInSubtree(root, targetId) {
    if (!root || targetId == null) return null
    var want = String(targetId)
    var found = null
    function walk(n) {
        if (!n || found) return
        if (String(n.id) === want) {
            found = n
            return
        }
        if (isContainer(n) && n.children) {
            for (var i = 0; i < n.children.length; i++) walk(n.children[i])
        }
    }
    walk(root)
    return found
}

/**
 * MO prefetch 시 PC 상대 노드 (에셋 imgNN·pairPcNodeIdByMoId).
 * 1) MO 노드 pluginData sourceNodeId 가 pcOrderedIds 안의 PC id이면 우선
 * 2) 같은 레이어명(트림)·아직 안 쓴 PC 슬롯 중 |인덱스 차| 최소
 * 3) 동일 인덱스 슬롯이 아직 미사용이면
 */
function resolvePairedPcImageNodeForMoPrefetch(moNode, slotIndex, pairedDesktopSection, pcOrderedIds, cache, secNo) {
    if (!moNode || !pairedDesktopSection || !pcOrderedIds || !pcOrderedIds.length) return null
    if (!cache || cache.imageSuffix !== "_mo") return null

    if (!cache.moPcPairUsedBySec) cache.moPcPairUsedBySec = {}
    var usedMap = cache.moPcPairUsedBySec[secNo]
    if (!usedMap) return null

    function isPcUsed(pcId) {
        return pcId != null && usedMap[String(pcId)] === true
    }
    function markPc(pcId) {
        if (pcId != null) usedMap[String(pcId)] = true
    }

    var src = ""
    try {
        if (typeof moNode.getPluginData === "function") src = String(moNode.getPluginData("sourceNodeId") || "").trim()
    } catch (e0) {}
    if (src) {
        var bySrc = findNodeByIdInSubtree(pairedDesktopSection, src)
        if (!bySrc && cache.pairedDesktopRootForMo) {
            try {
                bySrc = findNodeByIdInSubtree(cache.pairedDesktopRootForMo, src)
            } catch (e1) {}
        }
        if (bySrc && bySrc.id != null) {
            var sid = String(bySrc.id)
            for (var xi = 0; xi < pcOrderedIds.length; xi++) {
                if (String(pcOrderedIds[xi]) === sid) {
                    if (!isPcUsed(sid)) {
                        markPc(sid)
                        return bySrc
                    }
                    break
                }
            }
        }
    }

    var moName = String(moNode.name || "").trim()
    if (moName) {
        var bestPc = null
        var bestDist = 1e9
        for (var j = 0; j < pcOrderedIds.length; j++) {
            var pid = pcOrderedIds[j]
            if (pid == null || isPcUsed(pid)) continue
            var pn = findNodeByIdInSubtree(pairedDesktopSection, pid)
            if (!pn) continue
            if (String(pn.name || "").trim() !== moName) continue
            var dist = Math.abs(j - slotIndex)
            if (dist < bestDist) {
                bestDist = dist
                bestPc = pn
            }
        }
        if (bestPc && bestPc.id != null) {
            markPc(bestPc.id)
            return bestPc
        }
    }

    var at = pcOrderedIds[slotIndex]
    if (at != null && !isPcUsed(at)) {
        var pAt = findNodeByIdInSubtree(pairedDesktopSection, at)
        if (pAt && pAt.id != null) {
            markPc(pAt.id)
            return pAt
        }
    }

    return null
}

/**
 * renderNodeAsync 분기와 동일 순서로, 최종 <img> 한 장이 나가는 노드 id를 누적 (DFS·자식 순서 일치).
 * @param {object} ropts includeHidden, allowedFonts, fontHtmlUnrestricted, sectionSemantics
 */
function collectImageFigureNodeIdsRenderNodeAsync(node, parent, cache, secNo, ropts) {
    if (!node) return Promise.resolve([])
    if (!(ropts && ropts.includeHidden) && !isVisible(node)) return Promise.resolve([])

    if (node.type === "TEXT") {
        return getTextSummaryAsync(node).then(function (ts) {
            var families = ts.fontFamilies && ts.fontFamilies.length ? ts.fontFamilies : ts.fontFamily ? [ts.fontFamily] : []
            if (textFamiliesAllowedAsHtml(families, ropts && ropts.allowedFonts ? ropts.allowedFonts : [], ropts && ropts.fontHtmlUnrestricted)) {
                return []
            }
            return node.id != null ? [String(node.id)] : []
        })
    }

    if (isVideoNodeEffective(node, cache)) return Promise.resolve([])

    if (isVectorOnlyTree(node)) {
        if (isCodeRasterNodeEffective(node, cache)) return node.id != null ? Promise.resolve([String(node.id)]) : Promise.resolve([])
        if (isLineLikeNode(node)) return Promise.resolve([])
        if (node.type === "ELLIPSE") return Promise.resolve([])
        return node.id != null ? Promise.resolve([String(node.id)]) : Promise.resolve([])
    }

    if (shouldExportAsSingleRasterImage(node, cache)) {
        if (
            isContainer(node) &&
            hasMultipleImageLikeChildren(node, cache) &&
            !isCompositeCandidate(node) &&
            !isCodeRasterNodeEffective(node, cache) &&
            !isMaskImageRasterGroup(node)
        ) {
            var childrenImgGrp = node.children || []
            var acc = []
            var ix = 0
            function nextSplit() {
                if (ix >= childrenImgGrp.length) return Promise.resolve(acc)
                var cImg = childrenImgGrp[ix++]
                if (!cImg || (!(ropts && ropts.includeHidden) && !isVisible(cImg))) return nextSplit()
                return collectImageFigureNodeIdsRenderNodeAsync(cImg, node, cache, secNo, ropts).then(function (part) {
                    acc = acc.concat(part)
                    return nextSplit()
                })
            }
            return nextSplit()
        }
        return node.id != null ? Promise.resolve([String(node.id)]) : Promise.resolve([])
    }

    if (node.type === "FRAME" && isContainer(node)) {
        return collectImageFigureNodeIdsFrameChildrenAsync(node, parent, cache, secNo, ropts)
    }

    if (isContainer(node)) {
        return collectImageFigureNodeIdsGenericContainerAsync(node, parent, cache, secNo, ropts)
    }

    return Promise.resolve([])
}

function collectImageFigureNodeIdsFrameChildrenAsync(node, parent, cache, secNo, ropts) {
    return buildBackgroundDeclAsync(node, false, cache, secNo).then(function () {
        var children = node.children || []
        var i = 0
        var acc = []
        function nextChild() {
            if (i >= children.length) return Promise.resolve(acc)
            var ch = children[i++]
            if (!ch || !isVisible(ch)) return nextChild()

            if (ch.type === "FRAME" && isContainer(ch)) {
                return collectImageFigureNodeIdsRenderNodeAsync(ch, node, cache, secNo, ropts).then(function (part) {
                    acc = acc.concat(part)
                    return nextChild()
                })
            }

            var chAbs = isAbsoluteLike(ch, node)
            if (!chAbs && (ch.type === "LINE" || ch.type === "ELLIPSE" || isLineLikeNode(ch))) {
                return collectImageFigureNodeIdsRenderNodeAsync(ch, node, cache, secNo, ropts).then(function (part) {
                    acc = acc.concat(part)
                    return nextChild()
                })
            }

            var isChContainer = isContainer(ch)
            return Promise.all([
                buildBackgroundDeclAsync(ch, false, cache, secNo, {
                    skipImageFill: isImageCandidate(ch, cache) || isVectorOnlyTree(ch),
                    skipSolidFill: isVectorOnlyTree(ch),
                }),
                !chAbs ? Promise.resolve("") : Promise.resolve(buildAbsDecl(ch, node) || ""),
            ]).then(function () {
                if (isChContainer) {
                    return collectImageFigureNodeIdsRenderNodeAsync(ch, node, cache, secNo, ropts).then(function (part) {
                        acc = acc.concat(part)
                        return nextChild()
                    })
                }
                return collectImageFigureNodeIdsRenderNodeAsync(ch, node, cache, secNo, ropts).then(function (part) {
                    acc = acc.concat(part)
                    return nextChild()
                })
            })
        }
        return nextChild()
    })
}

function collectImageFigureNodeIdsGenericContainerAsync(node, parent, cache, secNo, ropts) {
    var abs2 = isAbsoluteLike(node, parent)
    var flex = isFlex(node)
    var useFlex = useApFlexClass(node, abs2, flex)
    return buildBackgroundDeclAsync(node, false, cache, secNo).then(function (bgDecl2) {
        var declParts2Visual = []
        if (bgDecl2) declParts2Visual.push(bgDecl2)
        var strokeDecl2 = buildStrokeDecl(node)
        if (strokeDecl2) declParts2Visual.push(strokeDecl2)
        if (abs2) {
            var absDecl3 = buildAbsDecl(node, parent)
            if (absDecl3) declParts2Visual.push(absDecl3)
        }
        if (!useFlex && !abs2 && containerNeedsRelativeForAbsoluteChildren(node)) declParts2Visual.push("position:relative")
        if (useFlex) {
            var lv3 = getLayoutVars(node)
            var flexDecl3 = buildFlexDecl(lv3, node, abs2)
            if (flexDecl3) declParts2Visual.push(flexDecl3)
        }
        var fillWidthDecl2 = getFillFlexStartWidthDecl(node, parent)
        if (fillWidthDecl2 && !nodeHasApSectionImageSemantic(node.id, ropts)) declParts2Visual.push(fillWidthDecl2)
        var declParts2Flex = []
        var declParts2 = declParts2Visual.concat(declParts2Flex)
        var children2 = node.children || []
        var visibleChildren = children2.filter(function (c) {
            return c && (ropts && ropts.includeHidden ? true : isVisible(c))
        })
        var singleChild = visibleChildren.length === 1 ? visibleChildren[0] : null
        var groupHasAttrs = declParts2.length > 0
        var skipGroupWrapper = singleChild && !groupHasAttrs && !isFlex(node)

        if (skipGroupWrapper) {
            return collectImageFigureNodeIdsRenderNodeAsync(singleChild, node, cache, secNo, ropts)
        }
        var acc = []
        var j = 0
        function next2() {
            if (j >= children2.length) return Promise.resolve(acc)
            var ch2 = children2[j++]
            if (!ch2 || (!(ropts && ropts.includeHidden) && !isVisible(ch2))) return next2()
            return collectImageFigureNodeIdsRenderNodeAsync(ch2, node, cache, secNo, ropts).then(function (part) {
                acc = acc.concat(part)
                return next2()
            })
        }
        return next2()
    })
}

function collectImageFigureNodeIdsSectionChildAsync(ch, sectionNode, bg, cache, secNo, ropts) {
    if (!ch || (bg.bgChildId && ch.id === bg.bgChildId)) return Promise.resolve([])
    if (!(ropts && ropts.includeHidden) && !isVisible(ch)) return Promise.resolve([])
    if (ch.type === "FRAME" && isContainer(ch)) {
        return collectImageFigureNodeIdsRenderNodeAsync(ch, sectionNode, cache, secNo, ropts)
    }
    var chAbsVirtual = isAbsoluteLike(ch, sectionNode)
    if (!chAbsVirtual && (ch.type === "LINE" || ch.type === "ELLIPSE" || isLineLikeNode(ch))) {
        return collectImageFigureNodeIdsRenderNodeAsync(ch, sectionNode, cache, secNo, ropts)
    }
    return Promise.all([
        buildBackgroundDeclAsync(ch, false, cache, secNo, {
            skipImageFill: isImageCandidate(ch, cache) || isVectorOnlyTree(ch),
            skipSolidFill: isVectorOnlyTree(ch),
        }),
        isAbsoluteLike(ch, sectionNode) ? Promise.resolve(buildAbsDecl(ch, sectionNode) || "") : Promise.resolve(""),
    ]).then(function () {
        return collectImageFigureNodeIdsRenderNodeAsync(ch, sectionNode, cache, secNo, ropts)
    })
}

/**
 * pass1(비슬라이드 자식) + pass2(swiper-slide) 순서로 섹션 HTML과 동일한 이미지 노드 순서
 */
function collectImageFigureNodeIdsForSectionAsync(sectionNode, bg, slideData, cache, secNo, ropts) {
    var acc1 = []
    var kids = sectionNode.children || []
    var i = 0

    function isSlideContainerNodeInSection(child) {
        if (!slideData || !child) return false
        if (slideData.parent && child.id === slideData.parent.id) return true
        if (isSlideNode(child)) return true
        return false
    }

    function pass1Next() {
        if (i >= kids.length) return Promise.resolve(acc1)
        var ch = kids[i++]
        if (!ch || !isVisible(ch)) return pass1Next()
        if (bg.bgChildId && ch.id === bg.bgChildId) return pass1Next()
        if (isSlideContainerNodeInSection(ch)) return pass1Next()

        return collectImageFigureNodeIdsSectionChildAsync(ch, sectionNode, bg, cache, secNo, ropts).then(function (part) {
            acc1 = acc1.concat(part)
            return pass1Next()
        })
    }

    return pass1Next().then(function () {
        if (!slideData) return acc1
        var slideItems = collectSwiperSlideItemNodes(sectionNode, bg.bgChildId)
        var slideParent = slideData.parent || sectionNode
        var acc2 = []
        var si = 0
        function slideNext() {
            if (si >= slideItems.length) return Promise.resolve(acc1.concat(acc2))
            var ch = slideItems[si++]
            return collectImageFigureNodeIdsSectionChildAsync(ch, slideParent, bg, cache, secNo, ropts).then(function (part) {
                acc2 = acc2.concat(part)
                return slideNext()
            })
        }
        return slideNext()
    })
}

function precomputeRasterFormatsForSlotsAsync(sectionRoot, orderedIds, secNo, cache, pairedRoot, pairedIds) {
    var moNodes = []
    var pcNodes = pairedRoot && pairedIds ? [] : null
    for (var i = 0; i < orderedIds.length; i++) {
        moNodes.push(findNodeByIdInSubtree(sectionRoot, orderedIds[i]))
        if (pcNodes) {
            var pid = pairedIds[i]
            pcNodes.push(pid != null ? findNodeByIdInSubtree(pairedRoot, pid) : null)
        }
    }
    return precomputeRasterFormatsForOrderedNodePairsAsync(moNodes, pcNodes, secNo, cache)
}

function prefetchOneImageNodeAsync(node, cache, secNo, bg, sectionNode, slotIndex, pairedDesktopSection, pcOrderedIds, slideData) {
    if (!node) return Promise.resolve()
    var slideIdSet = Object.create(null)
    if (slideData && sectionNode) {
        var sit = collectSwiperSlideItemNodes(sectionNode, bg.bgChildId)
        for (var sj = 0; sj < sit.length; sj++) {
            if (sit[sj] && sit[sj].id != null) slideIdSet[String(sit[sj].id)] = true
        }
    }
    var pairPc = null
    if (pairedDesktopSection && pcOrderedIds && pcOrderedIds.length) {
        if (cache.imageSuffix === "_mo") {
            pairPc = resolvePairedPcImageNodeForMoPrefetch(node, slotIndex, pairedDesktopSection, pcOrderedIds, cache, secNo)
        } else if (pcOrderedIds[slotIndex] != null) {
            pairPc = findNodeByIdInSubtree(pairedDesktopSection, pcOrderedIds[slotIndex])
        }
    }
    if (pairPc && node && node.id != null && pairPc.id != null) {
        cache.pairPcNodeIdByMoId = cache.pairPcNodeIdByMoId || Object.create(null)
        cache.pairPcNodeIdByMoId[String(node.id)] = String(pairPc.id)
    }
    var clipPar = sectionNode ? findDirectFigmaParentUnderRoot(sectionNode, node) : null
    var imgCtx = {
        cache: cache,
        secNo: secNo,
        slotIndex: slotIndex,
        pairPcNode: pairPc,
        insideSwiperSlide: !!slideIdSet[String(node.id)],
        fromPrefetchSlot: true,
        clipExportParent: clipPar,
    }
    return pipelineEnsureImageAsync(node, imgCtx).then(function (meta) {
        if (!meta) return
        if (meta.kind === "pc-shared-slide" && meta.dataUrl && meta.assetKey) setCachedAsset(cache, meta.assetKey, meta.dataUrl)
        var pathOpts = { skipExport: isVideoNodeEffective(node, cache), imageHash: getPrimaryImageFillHash(node) }
        if (meta.reuseAssetKey) pathOpts.reuseAssetKey = meta.reuseAssetKey
        if (cache.usePcMoImageFilenameVariants && !cache.imageSuffix && slideData && imgCtx.insideSwiperSlide) {
            pathOpts.omitPcMoVariant = true
        }
        if (cache.imageSuffix === "_mo" && pairPc && meta && meta.kind !== "pc-shared-slide" && !meta.reuseAssetKey) {
            pathOpts.pairedPcAssetKey = makePairedPcAssetKeyForInheritedPathLookup(pairPc, meta, secNo, cache, false)
        }
        getOrAssignImagePath(cache, meta.assetKey, meta.dataUrl || "", secNo, pathOpts)
        if (slideData && slideIdSet[String(node.id)] && meta.assetKey) {
            cache.slideAssetKeyByNodeId = cache.slideAssetKeyByNodeId || Object.create(null)
            cache.slideAssetKeyByNodeId[String(node.id)] = meta.reuseAssetKey || meta.assetKey
        }
        if (slideData && !cache.imageSuffix && slideIdSet[String(node.id)] && meta.assetKey) {
            if (!cache.slideAssetKeyBySlot) cache.slideAssetKeyBySlot = Object.create(null)
            cache.slideAssetKeyBySlot[secNo + ":" + slotIndex] = meta.reuseAssetKey || meta.assetKey
        }
    })
}

function prefetchSectionImageAssetsAsync(sectionNode, orderedIds, cache, secNo, bg, slideData, pairedDesktopSection, pcOrderedIds) {
    if (!orderedIds || !orderedIds.length) return Promise.resolve()
    if (cache.imageSuffix === "_mo" && pairedDesktopSection && pcOrderedIds && pcOrderedIds.length) {
        if (!cache.moPcPairUsedBySec) cache.moPcPairUsedBySec = {}
        cache.moPcPairUsedBySec[secNo] = Object.create(null)
    }
    var ix = 0
    function next() {
        if (ix >= orderedIds.length) return Promise.resolve()
        var slot = ix
        var nid = orderedIds[ix++]
        var node = findNodeByIdInSubtree(sectionNode, nid)
        if (!node) return next()
        return prefetchOneImageNodeAsync(node, cache, secNo, bg, sectionNode, slot, pairedDesktopSection, pcOrderedIds, slideData).then(next)
    }
    return next()
}
