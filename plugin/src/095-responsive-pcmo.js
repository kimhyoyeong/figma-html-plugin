/**
 * 095-responsive-pcmo — PC HTML + @media로 MO 스타일·배경·picture 병합
 *
 * 구조 불일치 시 096이 `.pc-only .ap-section--NN` / `.mo-only .ap-section--NN` 지연 규칙 출력 — parseCodeIntoParts·injectBgOverridesForMo 가 래퍼+자손 선택자 인식.
 * buildMobileOverrides — 레이아웃·프레임 walk 시 형제는 `img`/`txt` 이름 우선 짝 + 나머지 이름 정렬 짝(순서만 바뀐 섹션 허용); 이미지 크기는 렌더순서·슬롯·sourceNodeId
 * getSectionStructureMatch — 동일 짝 규칙으로 구조 일치 판정(code-video·code-raster 슬롯은 하위 무시)
 * parseCodeIntoParts — 산출 HTML에서 base/section 스타일/article 분리
 * injectBgOverridesForMo — sectionStyles의 --bg-img를 MO용 _mo 경로로 @media에 병합
 * rewriteMoOnlyRasterBgUrls — .mo-only 규칙 안 배경 URL만 MO 파일명·확장자에 맞춤
 * mergeImagesWithMoBackgroundFallback — ZIP/미리보기 imageList에 누락된 _mo 배경 보강
 * apSlidePcImgAttr — 슬라이드 안 이미지는 picture 변환 생략 표시
 * combinePcMoAsBreakpoint — 위 요소 합쳐 최종 HTML 문자열
 */
// ----- 6. Section Utils (배경은 buildSectionBackgroundAsync) -----
/**
 * PC/MO visible 형제 짝: `img`·`txt` 레이어명(대소문자 무시) 동수면 시각 좌표로 짝, `txt`는 양쪽에 같은 개수일 때만 짝.
 * 나머지: 한쪽이라도 **같은 레이어명이 형제 중 2회 이상**이면 이름 정렬이 PC·MO 기준축을 어긋나게 하므로 **문서 순 인덱스 짝**만 사용.
 * 그 외에만 이름(동명이면 생성 순 idx) 정렬 후 짝. `img` 개수 불일치 등이면 null → 호출부에서 인덱스 짝 fallback.
 */
function pairVisibleSiblingsFlexible(dk, mk) {
    if (!dk || !mk || dk.length !== mk.length) return null
    function lowerName(n) {
        return String(n && n.name || "").trim().toLowerCase()
    }
    function remainderHasDuplicateLayerName(nodes) {
        var counts = Object.create(null)
        for (var ri = 0; ri < nodes.length; ri++) {
            var k = lowerName(nodes[ri])
            if (k === "") k = "\0"
            counts[k] = (counts[k] || 0) + 1
            if (counts[k] > 1) return true
        }
        return false
    }
    function pluckByName(nodes, tag) {
        var hit = []
        var rest = []
        for (var i = 0; i < nodes.length; i++) {
            if (lowerName(nodes[i]) === tag) hit.push(nodes[i])
            else rest.push(nodes[i])
        }
        return {hit: hit, rest: rest}
    }
    function sortNodesVisual(nodes) {
        return nodes
            .map(function (n, idx) {
                var k = idx
                try {
                    var b = getAbs(n)
                    if (b) k = (Number(b.x) || 0) * 1e9 + (Number(b.y) || 0) + idx * 1e-6
                } catch (eVis) {}
                return {n: n, k: k}
            })
            .sort(function (a, b) {
                return a.k - b.k
            })
            .map(function (x) {
                return x.n
            })
    }
    function sortNodesByNameStable(nodes) {
        return nodes
            .map(function (n, idx) {
                var ln = lowerName(n)
                return {n: n, k: (ln || "\0") + "\x01" + idx}
            })
            .sort(function (a, b) {
                return a.k.localeCompare(b.k)
            })
            .map(function (x) {
                return x.n
            })
    }
    var pairs = []
    var dR = dk.slice()
    var mR = mk.slice()
    var dImg = pluckByName(dR, "img")
    var mImg = pluckByName(mR, "img")
    if (dImg.hit.length !== mImg.hit.length) return null
    var dIs = sortNodesVisual(dImg.hit)
    var mIs = sortNodesVisual(mImg.hit)
    for (var ii = 0; ii < dIs.length; ii++) pairs.push([dIs[ii], mIs[ii]])
    dR = dImg.rest
    mR = mImg.rest
    if (dR.length !== mR.length) return null

    var dTxt = pluckByName(dR, "txt")
    var mTxt = pluckByName(mR, "txt")
    if (dTxt.hit.length === mTxt.hit.length && dTxt.hit.length > 0) {
        var dTs = sortNodesVisual(dTxt.hit)
        var mTs = sortNodesVisual(mTxt.hit)
        for (var ti = 0; ti < dTs.length; ti++) pairs.push([dTs[ti], mTs[ti]])
        dR = dTxt.rest
        mR = mTxt.rest
    }
    if (dR.length !== mR.length) return null
    if (remainderHasDuplicateLayerName(dR) || remainderHasDuplicateLayerName(mR)) {
        for (var zi = 0; zi < dR.length; zi++) pairs.push([dR[zi], mR[zi]])
    } else {
        var dN = sortNodesByNameStable(dR)
        var mN = sortNodesByNameStable(mR)
        for (var ji = 0; ji < dN.length; ji++) pairs.push([dN[ji], mN[ji]])
    }
    return pairs
}

function pcMoChildPairsOrIndex(dKids, mKids) {
    var flex = pairVisibleSiblingsFlexible(dKids, mKids)
    if (flex) return flex
    var out = []
    for (var i = 0; i < dKids.length && i < mKids.length; i++) out.push([dKids[i], mKids[i]])
    return out
}

/** 구조 일치 섹션만: PC가 code-video인 슬롯의 MO 노드 id → true (MO 레이어명 불일치 허용) */
function buildMoVideoInheritIdsMap(desktopRoot, mobileRoot, mismatchSecs) {
    var out = Object.create(null)
    if (!desktopRoot || !mobileRoot || !isContainer(desktopRoot) || !isContainer(mobileRoot)) return out
    var skip = Object.create(null)
    if (Array.isArray(mismatchSecs)) {
        for (var sx = 0; sx < mismatchSecs.length; sx++) skip[String(mismatchSecs[sx])] = true
    }
    var dSecs = getSectionNodes(desktopRoot)
    var mSecs = getSectionNodes(mobileRoot)
    function walkInherit(dNode, mNode) {
        var dKids = (dNode.children || []).filter(function (c) {
            return c && isVisible(c)
        })
        var mKids = (mNode.children || []).filter(function (c) {
            return c && isVisible(c)
        })
        var pairVi = pcMoChildPairsOrIndex(dKids, mKids)
        for (var i = 0; i < pairVi.length; i++) {
            var d = pairVi[i][0]
            var m = pairVi[i][1]
            if (d.type !== m.type) continue
            if (!d.id) {
                if (d.type === "FRAME" && isContainer(d)) walkInherit(d, m)
                continue
            }
            if (isVideoSlotByNameOrFill(d) && m.id) out[String(m.id)] = true
            if (d.type === "FRAME" && isContainer(d)) walkInherit(d, m)
        }
    }
    for (var s = 0; s < dSecs.length && s < mSecs.length; s++) {
        var secClass = sectionClassPrefix(s + 1)
        if (skip[secClass]) continue
        var dSec = dSecs[s]
        var mSec = mSecs[s]
        if (!dSec || !mSec || dSec.type !== mSec.type) continue
        walkInherit(dSec, mSec)
    }
    return out
}
/** 구조 일치 섹션만: PC가 code-raster인 슬롯의 MO 노드 id → true */
function buildMoRasterInheritIdsMap(desktopRoot, mobileRoot, mismatchSecs) {
    var out = Object.create(null)
    if (!desktopRoot || !mobileRoot || !isContainer(desktopRoot) || !isContainer(mobileRoot)) return out
    var skip = Object.create(null)
    if (Array.isArray(mismatchSecs)) {
        for (var srx = 0; srx < mismatchSecs.length; srx++) skip[String(mismatchSecs[srx])] = true
    }
    var dSecsR = getSectionNodes(desktopRoot)
    var mSecsR = getSectionNodes(mobileRoot)
    function walkRasterInherit(dNode, mNode) {
        var dKids = (dNode.children || []).filter(function (c) {
            return c && isVisible(c)
        })
        var mKids = (mNode.children || []).filter(function (c) {
            return c && isVisible(c)
        })
        var pairR = pcMoChildPairsOrIndex(dKids, mKids)
        for (var ri = 0; ri < pairR.length; ri++) {
            var d = pairR[ri][0]
            var m = pairR[ri][1]
            if (d.type !== m.type) continue
            if (!d.id) {
                if (d.type === "FRAME" && isContainer(d)) walkRasterInherit(d, m)
                continue
            }
            if (isCodeRasterNode(d) && m.id) out[String(m.id)] = true
            if (d.type === "FRAME" && isContainer(d)) walkRasterInherit(d, m)
        }
    }
    for (var sr = 0; sr < dSecsR.length && sr < mSecsR.length; sr++) {
        var secCl = sectionClassPrefix(sr + 1)
        if (skip[secCl]) continue
        var dS = dSecsR[sr]
        var mS = mSecsR[sr]
        if (!dS || !mS || dS.type !== mS.type) continue
        walkRasterInherit(dS, mS)
    }
    return out
}
/** MO 트리에서 PC 레이어 이름(예: code-video)으로 비디오 짝 조회 — 이름 매칭 fallback이 MO 전용 이름이어도 동작 */
function collectMoVideoNodesByPcLayerName(dSec, mSec) {
    var map = collectVideoNodesByName(mSec)
    function walk(dNode, mNode) {
        var dKids = (dNode.children || []).filter(function (c) {
            return c && isVisible(c)
        })
        var mKids = (mNode.children || []).filter(function (c) {
            return c && isVisible(c)
        })
        var pairV = pcMoChildPairsOrIndex(dKids, mKids)
        for (var i = 0; i < pairV.length; i++) {
            var d = pairV[i][0]
            var m = pairV[i][1]
            if (d.type !== m.type) continue
            if (!d.id) {
                if (d.type === "FRAME" && isContainer(d)) walk(d, m)
                continue
            }
            if (isVideoSlotByNameOrFill(d) && m.id) {
                var key = String(d.name || "").trim()
                if (key) map[key] = m
            }
            if (d.type === "FRAME" && isContainer(d)) walk(d, m)
        }
    }
    walk(dSec, mSec)
    return map
}
/** PC HTML 기준 MO 미디어쿼리 오버라이드 (프레임/텍스트 walk는 pcMoChildPairsOrIndex, 이미지는 렌더 순서·슬롯) */
function buildMobileOverrides(desktopRoot, mobileRoot, breakpoint, options) {
    options = options || {}
    var exportedSet = options.exportedNodeIds || null
    var ownImageSet = options.ownImageNodeIds || null
    function isExported(id) {
        if (!exportedSet || id == null) return true
        if (Object.keys(exportedSet).length === 0) return true
        return exportedSet[String(id)] === true
    }
    var skipStructSecs = options && options.skipStructureMismatchSecs ? options.skipStructureMismatchSecs : []
    var skipStructSet = Object.create(null)
    for (var si = 0; si < skipStructSecs.length; si++) skipStructSet[String(skipStructSecs[si])] = true
    var moVideoInheritIds = buildMoVideoInheritIdsMap(desktopRoot, mobileRoot, skipStructSecs)
    var moRasterInheritIds = buildMoRasterInheritIdsMap(desktopRoot, mobileRoot, skipStructSecs)
    var moInheritLookupCache = null
    if (moVideoInheritIds || moRasterInheritIds) {
        moInheritLookupCache = {}
        if (moVideoInheritIds) moInheritLookupCache.moVideoInheritIds = moVideoInheritIds
        if (moRasterInheritIds) moInheritLookupCache.moRasterInheritIds = moRasterInheritIds
    }
    /** @media 블록 안: 동일 셀렉터 선언을 한 규칙으로 합침 (diff·파일 길이·리뷰용) */
    var moMediaRuleList = []
    function pushMoMoRule(sel, decl) {
        if (!sel || !decl) return
        if (options.usedApSectionBemBySection && !moOverrideSelectorIsLive(sel, options.usedApSectionBemBySection)) return
        var d = dedupeCssDecl(String(decl).trim())
        if (!d) return
        sel = String(sel).trim()
        for (var i = 0; i < moMediaRuleList.length; i++) {
            if (moMediaRuleList[i].sel === sel) {
                moMediaRuleList[i].decl = dedupeCssDecl(moMediaRuleList[i].decl + ";" + d)
                return
            }
        }
        moMediaRuleList.push({ sel: sel, decl: d })
    }
    function parseApWhFromDecl(decl) {
        var s = String(decl || "")
        var wm = /--ap-w:([^;]+)/.exec(s)
        var hm = /--ap-h:([^;]+)/.exec(s)
        return { apW: wm ? wm[1].trim() : "", apH: hm ? hm[1].trim() : "" }
    }
    function resolveMoImageNodeForPc(d, slot, moLookup, imgByName) {
        var m = null
        var method = ""
        if (moLookup.bySourcePcId[String(d.id)]) {
            m = moLookup.bySourcePcId[String(d.id)]
            method = "sourceNodeId"
        } else if (slot && moLookup.bySlot[slot]) {
            m = moLookup.bySlot[slot]
            method = "semanticSlot"
        } else if (moLookup.byId[String(d.id)]) {
            m = moLookup.byId[String(d.id)]
            method = "sameNodeId"
        } else {
            var nk = String(d.name || "").trim()
            if (nk && imgByName[nk]) {
                m = imgByName[nk]
                method = "nameFallback"
            }
        }
        return { m: m, method: method }
    }
    function pushImageMoSizeOverridesForSection(dRoot, secCls, deskOpts, deskSemMap, moLookup, imgByName) {
        function walkD(n) {
            if (!n || !isVisible(n)) return
            var isImg = (isImageCandidate(n) || hasImageFill(n) || (isVectorOnlyTree(n) && !isLineLikeNode(n) && n.type !== "ELLIPSE"))
            if (n.id && isImg && isExported(n.id) && nodeHasApSectionImageSemantic(n.id, deskOpts)) {
                var sem = deskSemMap[String(n.id)] || []
                var slot = getApSectionImageSlotKeyFromSemantics(sem)
                var res = resolveMoImageNodeForPc(n, slot, moLookup, imgByName)
                var m = res.m
                var method = res.method
                var innerSel = cssInnerSelForNode(String(n.id), deskOpts, false)
                var fullSel = ".ap-section--" + secCls + " " + innerSel
                if (m) {
                    var decl = getImageSizeDeclDiff(n, m)
                    var wh = parseApWhFromDecl(decl)
                    if (decl) pushMoMoRule(fullSel, decl)
                    console.log("[ap-mo-img]", {
                        section: secCls,
                        pcId: n.id,
                        pcName: n.name,
                        slot: slot,
                        matchMethod: method,
                        moId: m.id,
                        moName: m.name,
                        selector: fullSel,
                        apW: wh.apW,
                        apH: wh.apH,
                        hasDecl: !!decl,
                    })
                } else console.log("[ap-mo-img] noMo", { section: secCls, pcId: n.id, pcName: n.name, slot: slot })
            }
            if (isContainer(n)) for (var ci = 0; ci < n.children.length; ci++) walkD(n.children[ci])
        }
        walkD(dRoot)
    }
    var lines = []
    var bp = Number(breakpoint) || 750
    lines.push("")
    lines.push("@media (max-width:" + bp + "px){")
    lines.push("  .ap-post__inner{ --ap-width:" + bp + "; }")
    lines.push("  .ap-video{ width:100%; height:auto; }")
    lines.push("  .pc-only{ display:none; }")
    lines.push("  .mo-only{ display:block; }")

    if (!isContainer(desktopRoot) || !isContainer(mobileRoot)) {
        lines.push("}")
        return lines.join("\n")
    }

    function walkPair(dNode, mNode, mParent, secClass, imageByName, textByName, textOverrideDone, semMap, videoByName, videoOverrideDone) {
        var moOpts = { sectionSemantics: semMap || {} }
        var dKids = (dNode.children || []).filter(function (c) {
            return c && isVisible(c)
        })
        var mKids = (mNode.children || []).filter(function (c) {
            return c && isVisible(c)
        })

        var pairW = pcMoChildPairsOrIndex(dKids, mKids)
        for (var i = 0; i < pairW.length; i++) {
            var d = pairW[i][0]
            var m = pairW[i][1]
            if (d.type !== m.type) continue
            if (!d.id) {
                if (d.type === "FRAME" && isContainer(d))
                    walkPair(d, m, m, secClass, imageByName, textByName, textOverrideDone, semMap, videoByName, videoOverrideDone)
                continue
            }
            var sel = ""
            var declParts = []
            var moImageFigureDup =
                nodeHasApSectionImageSemantic(d.id, moOpts) && nodeWillRenderAsApImageFigure(d)
            if (d.type === "FRAME" && isContainer(d)) {
                sel = ".ap-section--" + secClass + " " + cssInnerSelForNode(String(d.id), moOpts, false)
                if (isFlex(m)) {
                    var flexDiff = buildFlexDeclDiff(
                        isFlex(d) ? getLayoutVars(d) : null,
                        getLayoutVars(m),
                        m,
                        isAbsoluteLike(m, mNode)
                    )
                    if (flexDiff) declParts.push(flexDiff)
                }
                var mAbs = isAbsoluteLike(m, mNode)
                if (mAbs) {
                    var adFr = moImageFigureDup
                        ? buildAbsDeclDiffPositionOnly(d, dNode, m, mNode)
                        : buildAbsDeclDiff(d, dNode, m, mNode)
                    if (adFr) declParts.push(adFr)
                } else if (!moImageFigureDup) {
                    var fillW = getFillFlexStartWidthDecl(m, mNode)
                    var fillWD = getFillFlexStartWidthDecl(d, dNode)
                    if (fillW && fillW !== fillWD && !nodeHasApSectionImageSemantic(d.id, moOpts)) declParts.push(fillW)
                    else if (!nodeHasApSectionImageSemantic(d.id, moOpts)) {
                        var sameWM = getSameWidthAsParentDecl(m, mNode)
                        var sameWD = getSameWidthAsParentDecl(d, dNode)
                        if (sameWM && !sameWD) declParts.push(sameWM)
                        else {
                            var mBox = getAbs(m)
                            var dBox = getAbs(d)
                            var mFixed = mBox && mBox.w != null && m.layoutSizingHorizontal === "FIXED"
                            if (mFixed && layoutPxNum(mBox.w) !== layoutPxNum(dBox && dBox.w != null ? dBox.w : 0)) {
                                declParts.push("--ap-w:" + cssOutLayoutPx(mBox.w))
                                declParts.push("width:calc(var(--ap-w)/var(--ap-width)*100cqi)")
                            }
                        }
                    }
                }
                if (!mAbs && !moImageFigureDup && !nodeHasApSectionImageSemantic(d.id, moOpts)) {
                    var contStrM = sectionContainerNeedsFullWidthInColumnParent(m, mNode, semMap, String(d.id))
                    var contStrD = sectionContainerNeedsFullWidthInColumnParent(d, dNode, semMap, String(d.id))
                    if (contStrM && !contStrD) declParts.push("width:100%")
                }
                if (!mAbs && !moImageFigureDup && !nodeHasApSectionImageSemantic(d.id, moOpts)) {
                    var growM = getFlexChildMainAxisGrowDecl(m, mNode)
                    var growD = getFlexChildMainAxisGrowDecl(d, dNode)
                    if (growM && growM !== growD) declParts.push(growM)
                }
                var strokeDiff = buildStrokeDeclDiff(d, m)
                if (strokeDiff) declParts.push(strokeDiff)
                // MO min-height: PC가 쓰는 경우(dWantsMin)만 높이 불일치·PC 박스 없음으로 보정.
                // PC가 안 쓰는 경우(HUG 등)에는 PC/MO 바운딩 높이 차이만으로는 넣지 않음(1열·3열 전환 시 dh≠mh가 항상이라 빈 영역 발생).
                // 그때는 MO만 flexColumnSpaceBetweenNeedsMinHeight 일 때만.
                var mBoxH = getAbs(m)
                var dBoxH = getAbs(d)
                var mMinReason = frameHasMinHeightVisualReason(m)
                var dMinReason = frameHasMinHeightVisualReason(d)
                var sbMinM = flexColumnSpaceBetweenNeedsMinHeight(m)
                var sbMinD = flexColumnSpaceBetweenNeedsMinHeight(d)
                if (!moImageFigureDup && mBoxH && mBoxH.h != null && (mMinReason || sbMinM)) {
                    if (!(isFlex(m) && m.layoutSizingVertical !== "FIXED")) {
                        var mh = layoutPxNum(mBoxH.h)
                        var dh = dBoxH && dBoxH.h != null ? layoutPxNum(dBoxH.h) : null
                        var dWantsMin = dMinReason || sbMinD
                        var needMoMinH = false
                        if (dWantsMin) {
                            needMoMinH = dh === null || mh !== dh
                        } else {
                            needMoMinH = sbMinM && !sbMinD
                        }
                        if (needMoMinH)
                            declParts.push("min-height:calc(" + cssOutLayoutPx(mBoxH.h) + "/var(--ap-width)*100cqi)")
                    }
                }
            } else if (d.type === "TEXT" && m.type === "TEXT") {
                if (ownImageSet && ownImageSet[String(d.id)]) {
                    var moRasterOpts = optsWithRasterTextAsImageSemantics(String(d.id), moOpts)
                    sel = ".ap-section--" + secClass + " " + cssInnerSelForNode(String(d.id), moRasterOpts, false)
                    var szTr = getImageSizeDeclDiff(d, m)
                    if (szTr) declParts.push(szTr)
                    var mAbsTr = isAbsoluteLike(m, mNode)
                    if (mAbsTr) {
                        var adTr = buildAbsDeclTextRasterDiff(d, dNode, m, mNode)
                        if (adTr) declParts.push(adTr)
                    }
                    if (textOverrideDone && d.id != null) textOverrideDone[String(d.id)] = true
                } else {
                    sel = ".ap-section--" + secClass + " " + cssInnerSelForNode(String(d.id), moOpts, false)
                    var tsD = getTextSummarySync(d)
                    var tsM = getTextSummarySync(m)
                    if (tsM) {
                        var textDecl = buildTextVarsDeclDiff(tsD, tsM)
                        if (textDecl) declParts.push(textDecl)
                        if (textOverrideDone && d.id != null) textOverrideDone[String(d.id)] = true
                    }
                    var textFillM = getTextFullWidthDecl(m, isAbsoluteLike(m, mNode), mNode)
                    var textFillD = getTextFullWidthDecl(d, isAbsoluteLike(d, dNode), dNode)
                    if (textFillM && textFillM !== textFillD) declParts.push(textFillM)
                    if (isAbsoluteLike(m, mNode)) {
                        var adTxt = buildAbsDeclDiff(d, dNode, m, mNode)
                        if (adTxt) declParts.push(adTxt)
                    }
                }
            } else {
                var leafSelRaw = getLeafSelectorForNode(d, moOpts)
                sel = leafSelRaw ? ".ap-section--" + secClass + " " + leafSelRaw.replace(/,/g, ", .ap-section--" + secClass + " ") : ""
                if (isFlex(m)) {
                    var flexDiff2 = buildFlexDeclDiff(
                        isFlex(d) ? getLayoutVars(d) : null,
                        getLayoutVars(m),
                        m,
                        isAbsoluteLike(m, mNode)
                    )
                    if (flexDiff2) declParts.push(flexDiff2)
                }
                var fillW2 = getFillFlexStartWidthDecl(m, mNode)
                var fillW2D = getFillFlexStartWidthDecl(d, dNode)
                if (fillW2 && fillW2 !== fillW2D && !nodeHasApSectionImageSemantic(d.id, moOpts)) declParts.push(fillW2)
                else if (!nodeHasApSectionImageSemantic(d.id, moOpts)) {
                    var sw2M = getSameWidthAsParentDecl(m, mNode)
                    var sw2D = getSameWidthAsParentDecl(d, dNode)
                    if (sw2M && !sw2D) declParts.push(sw2M)
                }
                var grow2M = getFlexChildMainAxisGrowDecl(m, mNode)
                var grow2D = getFlexChildMainAxisGrowDecl(d, dNode)
                if (grow2M && grow2M !== grow2D && !nodeHasApSectionImageSemantic(d.id, moOpts)) declParts.push(grow2M)
                var mAbs2 = isAbsoluteLike(m, mNode)
                if (mAbs2) {
                    var ad2 =
                        moImageFigureDup && (isVectorOnlyTree(d) || hasImageFill(d) || isImageCandidate(d))
                            ? buildAbsDeclDiffPositionOnly(d, dNode, m, mNode)
                            : buildAbsDeclDiff(d, dNode, m, mNode)
                    if (ad2) declParts.push(ad2)
                }
                var strokeDiff2 = buildStrokeDeclDiff(d, m)
                if (strokeDiff2) declParts.push(strokeDiff2)
            }
            /** 래스터 이미지 --ap-w/h 는 렌더 순서·슬롯 매칭(pass pushImageMoSizeOverridesForSection). 비디오·라인·타원만 인덱스 m */
            var sizePairVideo = isVideoSlotByNameOrFill(d) || isVideoSlotByNameOrFill(m)
            if (d.id && isExported(d.id) && (sizePairVideo || isLineLikeNode(d) || d.type === "ELLIPSE")) {
                var sizeDeclM = ""
                if (isLineLikeNode(d)) sizeDeclM = buildLineVarsDeclDiff(d, m)
                else if (d.type === "ELLIPSE") sizeDeclM = buildEllipseVarsDeclDiff(d, m)
                else if (sizePairVideo) sizeDeclM = getVideoSizeDeclDiff(d, m)
                if (sizeDeclM) {
                    var leafSelM = cssInnerSelForNode(String(d.id), moOpts, false)
                    var fullSelM = ".ap-section--" + secClass + " " + leafSelM
                    if (sel && fullSelM === sel) declParts.push(sizeDeclM)
                    else pushMoMoRule(fullSelM, sizeDeclM)
                    if (sizePairVideo && videoOverrideDone && d.id != null) videoOverrideDone[String(d.id)] = true
                }
            }
            if (sel && declParts.length && isExported(d.id)) pushMoMoRule(sel, declParts.join(";"))
            if (d.type === "FRAME" && isContainer(d))
                walkPair(d, m, m, secClass, imageByName, textByName, textOverrideDone, semMap, videoByName, videoOverrideDone)
        }
    }

    var dSecs = getSectionNodes(desktopRoot)
    var mSecs = getSectionNodes(mobileRoot)
    for (var s = 0; s < dSecs.length; s++) {
        var dSec = dSecs[s]
        if (s >= mSecs.length) continue
        var mSec = mSecs[s]
        if (!mSec || dSec.type !== mSec.type) continue
        var secClass = sectionClassPrefix(s + 1)
        if (skipStructSet[secClass]) continue
        var mSecBox = getAbs(mSec)
        var mediaSecH = getMediaSectionCanvasHeightDecl(dSec, mSec, mSecBox)
        if (mediaSecH) pushMoMoRule(".ap-section--" + secClass, mediaSecH)
        if (isFlex(mSec)) {
            var dLvSec = isFlex(dSec) ? applySectionSingleChildAlignOverride(dSec, getLayoutVars(dSec)) : null
            var mLvSec = applySectionSingleChildAlignOverride(mSec, getLayoutVars(mSec))
            var secLvDiff = buildFlexDeclDiff(dLvSec, mLvSec, mSec)
            if (secLvDiff) pushMoMoRule(".ap-section--" + secClass, secLvDiff)
        }
        var secStrokeDiff = buildStrokeDeclDiff(dSec, mSec)
        if (secStrokeDiff) pushMoMoRule(".ap-section--" + secClass, secStrokeDiff)
        var secImageByName = collectImageNodesByName(mSec)
        var secVideoByName = skipStructSet[secClass] ? collectVideoNodesByName(mSec) : collectMoVideoNodesByPcLayerName(dSec, mSec)
        var secTextByName = collectTextNodesByName(mSec)
        var sectionVideoOverrideDone = {}
        var sectionTextOverrideDone = {}
        var deskSem = buildSectionSemanticClasses(dSec, (options && options.geoStructure) || null)
        var allowedMo = Array.isArray(options.allowedFonts)
            ? options.allowedFonts
                  .map(function (f) {
                      return normalizeFontFamilyForMatch(f)
                  })
                  .filter(Boolean)
            : []
        var fontMoActive = options.fontHtmlFilterActive === true
        promoteRasterTextNodesToImageSemantics(dSec, deskSem, allowedMo, !fontMoActive)
        demoteNestedDuplicateSectionRoles(dSec, deskSem)
        disambiguateSectionSemantics(dSec, deskSem)
        demoteNestedDuplicateSectionRoles(dSec, deskSem)
        disambiguateSectionSemantics(dSec, deskSem)
        var pcOrder = options.pcSectionImageRenderOrderIds && options.pcSectionImageRenderOrderIds[s]
        if (pcOrder && pcOrder.length) applyApSectionImageRenderOrderFromIds(deskSem, pcOrder)
        var deskMoOpts = { sectionSemantics: deskSem }
        var mSem = buildSectionSemanticClasses(mSec, (options && options.geoStructure) || null, null, moVideoInheritIds, moRasterInheritIds)
        promoteRasterTextNodesToImageSemantics(mSec, mSem, allowedMo, !fontMoActive)
        demoteNestedDuplicateSectionRoles(mSec, mSem)
        disambiguateSectionSemantics(mSec, mSem)
        demoteNestedDuplicateSectionRoles(mSec, mSem)
        disambiguateSectionSemantics(mSec, mSem)
        var moOrder = options.moSectionImageRenderOrderIds && options.moSectionImageRenderOrderIds[s]
        if (moOrder && moOrder.length) applyApSectionImageRenderOrderFromIds(mSem, moOrder)
        var moLookup = collectMoImageLookupMaps(mSec, mSem, moInheritLookupCache)
        walkPair(dSec, mSec, mSec, secClass, secImageByName, secTextByName, sectionTextOverrideDone, deskSem, secVideoByName, sectionVideoOverrideDone)
        pushImageMoSizeOverridesForSection(dSec, secClass, deskMoOpts, deskSem, moLookup, secImageByName)
        // code-video: 인덱스 매칭이 어긋난 경우 레이어 name 기준으로 MO 비디오 aspect-ratio 등
        function pushVideoOverridesByName(dNode, secCls, vidByName, overrideDone) {
            if (!dNode || !isVisible(dNode)) return
            if (
                dNode.id &&
                isExported(dNode.id) &&
                isVideoSlotByNameOrFill(dNode) &&
                !overrideDone[String(dNode.id)]
            ) {
                var key = String(dNode.name || "").trim()
                var mVid = key !== "" && vidByName ? vidByName[key] : null
                if (mVid) {
                    var declV = getVideoSizeDeclDiff(dNode, mVid)
                    if (declV)
                        pushMoMoRule(
                            ".ap-section--" + secCls + " " + cssInnerSelForNode(String(dNode.id), deskMoOpts, false),
                            declV
                        )
                }
            }
            if (isContainer(dNode))
                for (var vi = 0; vi < dNode.children.length; vi++) pushVideoOverridesByName(dNode.children[vi], secCls, vidByName, overrideDone)
        }
        pushVideoOverridesByName(dSec, secClass, secVideoByName, sectionVideoOverrideDone)
        // 텍스트: 인덱스로 매칭 안 된 경우 레이어 name 기준으로 MO 폰트/크기/색 등 오버라이드
        function pushTextOverridesByName(dNode, secCls, txtByName, overrideDone) {
            if (!dNode || !isVisible(dNode)) return
            if (dNode.type === "TEXT" && dNode.id && isExported(dNode.id) && !overrideDone[String(dNode.id)]) {
                var key = String(dNode.name || "").trim()
                var mText = key !== "" && txtByName ? txtByName[key] : null
                if (mText) {
                    var tsD = getTextSummarySync(dNode)
                    var tsM = getTextSummarySync(mText)
                    if (tsM) {
                        var deskRasterOpts = optsWithRasterTextAsImageSemantics(String(dNode.id), deskMoOpts)
                        var deskTxtSel =
                            ownImageSet && ownImageSet[String(dNode.id)]
                                ? cssInnerSelForNode(String(dNode.id), deskRasterOpts, false)
                                : cssInnerSelForNode(String(dNode.id), deskMoOpts, false)
                        if (ownImageSet && ownImageSet[String(dNode.id)]) {
                            var declTrN = getImageSizeDeclDiff(dNode, mText)
                            if (declTrN) pushMoMoRule(".ap-section--" + secCls + " " + deskTxtSel, declTrN)
                        } else {
                            var textDecl = buildTextVarsDeclDiff(tsD, tsM)
                            var nameTxtDecls = []
                            if (textDecl) nameTxtDecls.push(textDecl)
                            var dParN = dNode.parent
                            var mParN = mText.parent
                            var nameFillM = getTextFullWidthDecl(mText, isAbsoluteLike(mText, mParN), mParN)
                            var nameFillD = getTextFullWidthDecl(dNode, isAbsoluteLike(dNode, dParN), dParN)
                            if (dParN && mParN && isAbsoluteLike(mText, mParN)) {
                                var adName = buildAbsDeclDiff(dNode, dParN, mText, mParN)
                                if (adName) nameTxtDecls.push(adName)
                            }
                            if (nameFillM && nameFillM !== nameFillD) nameTxtDecls.push(nameFillM)
                            if (nameTxtDecls.length) {
                                pushMoMoRule(".ap-section--" + secCls + " " + deskTxtSel, nameTxtDecls.join(";"))
                            }
                        }
                    }
                }
            }
            if (isContainer(dNode)) for (var j = 0; j < dNode.children.length; j++) pushTextOverridesByName(dNode.children[j], secCls, txtByName, overrideDone)
        }
        pushTextOverridesByName(dSec, secClass, secTextByName, sectionTextOverrideDone)
    }
    for (var moR = 0; moR < moMediaRuleList.length; moR++) {
        lines.push("  " + moMediaRuleList[moR].sel + "{ " + dedupeCssDecl(moMediaRuleList[moR].decl) + " }")
    }
    lines.push("}")
    return lines.join("\n")
}

/** PC/MO 섹션 구조 매칭. allMatch, mismatchSecs[], matches[] (숨김 제외한 섹션 목록 기준) */
function getSectionStructureMatch(desktopRoot, mobileRoot) {
    var out = {allMatch: false, matches: [], mismatchSecs: []}

    if (!desktopRoot || !mobileRoot || !isContainer(desktopRoot) || !isContainer(mobileRoot)) return out

    function visibleChildren(n) {
        var arr = []
        if (!n || !n.children) return arr
        for (var i = 0; i < n.children.length; i++) {
            var ch = n.children[i]
            if (isVisible(ch)) arr.push(ch)
        }
        return arr
    }

    /**
     * PC·MO 트리를 각각 해시(nodeSig)하면 MO에 code-video/code-raster 명이 없을 때만 하위 구조가 전부 시그니처에 남아 불일치가 난다.
     * 형제는 pcMoChildPairsOrIndex(img·txt 이름·나머지 정렬). 한쪽이라도 code-video·Video fill·code-raster면 그 서브트리는 일치로 본다.
     */
    function pairedStructureMatch(dNode, mNode, depth) {
        depth = depth || 0
        if (!dNode || !mNode) return !dNode && !mNode
        if (!isVisible(dNode) || !isVisible(mNode)) return false
        if (isVideoSlotByNameOrFill(dNode) || isVideoSlotByNameOrFill(mNode)) return true
        if (isCodeRasterNode(dNode) || isCodeRasterNode(mNode)) return true
        var dt = dNode.type || "UNKNOWN"
        var mt = mNode.type || "UNKNOWN"
        if (dt !== mt) return false
        var dCont = isContainer(dNode)
        var mCont = isContainer(mNode)
        if (dCont !== mCont) return false
        if (!dCont) return true
        if (depth >= 3) return true
        var dk = visibleChildren(dNode)
        var mk = visibleChildren(mNode)
        if (dk.length !== mk.length) return false
        var plist = pcMoChildPairsOrIndex(dk, mk)
        for (var ci = 0; ci < plist.length; ci++) {
            if (!pairedStructureMatch(plist[ci][0], plist[ci][1], depth + 1)) return false
        }
        return true
    }

    var dSecs = getSectionNodes(desktopRoot)
    var mSecs = getSectionNodes(mobileRoot)

    // 섹션 개수부터 체크
    var count = Math.max(dSecs.length, mSecs.length)
    var allMatch = dSecs.length === mSecs.length

    for (var i = 0; i < count; i++) {
        var secNo = sectionClassPrefix(i + 1) // 01,02...
        var d = dSecs[i]
        var m = mSecs[i]
        var match = false
        var reason = ""

        if (!d || !m) {
            match = false
            reason = !d ? "PC 섹션 없음" : "MO 섹션 없음"
        } else {
            match = pairedStructureMatch(d, m, 0)
            if (!match) reason = "시그니처 불일치"
        }

        out.matches.push({sec: secNo, match: match, reason: reason})
        if (!match) {
            out.mismatchSecs.push(secNo)
            allMatch = false
        }
    }

    out.allMatch = !!allMatch
    return out
}

/** 전체 코드에서 base / section 스타일 / article HTML 분리 */
function parseCodeIntoParts(code) {
    if (!code || typeof code !== "string") return {baseStyles: "", sectionStyles: "", articleHtml: "", headPrefix: ""}
    var styleStart = code.indexOf("<style>")
    var styleEnd = code.indexOf("</style>")
    if (styleStart < 0 || styleEnd < 0 || styleEnd <= styleStart) return {baseStyles: "", sectionStyles: "", articleHtml: "", headPrefix: ""}
    var headPrefix = styleStart > 0 ? code.substring(0, styleStart).trim() : ""
    var fullStyle = code.substring(styleStart + 7, styleEnd).trim()
    var idxBare = fullStyle.search(/\n\.ap-section--/)
    var idxWrapped = fullStyle.search(/\n\.(?:pc-only|mo-only)\s+\.ap-section--/)
    var candidates = []
    if (idxBare >= 0) candidates.push(idxBare)
    if (idxWrapped >= 0) candidates.push(idxWrapped)
    var sectionStart = candidates.length ? Math.min.apply(null, candidates) : -1
    var baseStyles = sectionStart >= 0 ? fullStyle.substring(0, sectionStart) : fullStyle
    var sectionStyles = sectionStart >= 0 ? fullStyle.substring(sectionStart).trim() : ""
    var articleHtml = code.substring(styleEnd + 8).trim()
    return {baseStyles: baseStyles, sectionStyles: sectionStyles, articleHtml: articleHtml, headPrefix: headPrefix}
}

/**
 * MO 전용 선택자(.mo-only …) 블록 안의 배경 URL만 MO imageList 확장자·파일명에 맞춤.
 * 전체 치환 금지: .pc-only·기본 .ap-section--NN 은 PC assets 유지 (이전 버그: 전부 _mo로 덮어 PC 배경 깨짐).
 */
function rewriteMoOnlyRasterBgUrls(sectionStyles, moPathByPcStem) {
    if (!sectionStyles || !moPathByPcStem) return sectionStyles || ""
    function resolvePath(pathRaw) {
        var p = String(pathRaw || "").trim()
        if (p.indexOf("assets/images/") !== 0 || !/\.(png|jpe?g)$/i.test(p)) return null
        var stem = p.replace(/\.(png|jpe?g)$/i, "")
        var stemBase = apAssetStemToPcRasterLookupKey(stem)
        return moPathByPcStem[stemBase] || moPathByPcStem[stem] || null
    }
    function replaceUrlsInDecl(decl) {
        var d = String(decl || "").replace(/--bg-img\s*:\s*url\s*\(\s*["']?([^"'()]+)["']?\s*\)/gi, function (full, path) {
            var r = resolvePath(path)
            return r ? "--bg-img:url(" + r + ")" : full
        })
        d = d.replace(/(background-image\s*:\s*url\s*\(\s*["']?)([^"'()]+)(["']?\s*\))/gi, function (full, open, path, close) {
            var r = resolvePath(path)
            return r ? open + r + close : full
        })
        return d
    }
    var reStart = /\.mo-only\b/g
    var out = ""
    var last = 0
    var m
    while ((m = reStart.exec(sectionStyles)) !== null) {
        var idx = m.index
        if (idx < last) break
        out += sectionStyles.slice(last, idx)
        var openBrace = sectionStyles.indexOf("{", idx)
        if (openBrace < 0) {
            out += sectionStyles.slice(idx)
            last = sectionStyles.length
            break
        }
        var sel = sectionStyles.slice(idx, openBrace)
        if (/\.pc-only\b/.test(sel)) {
            var dPc = 0
            var kPc = openBrace
            for (; kPc < sectionStyles.length; kPc++) {
                if (sectionStyles[kPc] === "{") dPc++
                else if (sectionStyles[kPc] === "}") {
                    dPc--
                    if (dPc === 0) {
                        kPc++
                        break
                    }
                }
            }
            out += sectionStyles.slice(idx, kPc)
            last = kPc
            reStart.lastIndex = last
            continue
        }
        var depth = 0
        var k = openBrace
        for (; k < sectionStyles.length; k++) {
            var ch = sectionStyles[k]
            if (ch === "{") depth++
            else if (ch === "}") {
                depth--
                if (depth === 0) {
                    k++
                    break
                }
            }
        }
        out += sectionStyles.slice(idx, openBrace + 1)
        out += replaceUrlsInDecl(sectionStyles.slice(openBrace + 1, k - 1))
        out += "}"
        last = k
        reStart.lastIndex = last
    }
    out += sectionStyles.slice(last)
    return out
}

/**
 * @media용 --bg-img: MO에서 export 안 된 경로는 PC dataUrl로 imageList 보강 (미리보기·ZIP 공통)
 */
function mergeImagesWithMoBackgroundFallback(code, pcImages, moImages) {
    var list = (pcImages || []).concat(moImages || [])
    var moArr = moImages || []
    var moNames = {}
    for (var mi = 0; mi < moArr.length; mi++) {
        if (moArr[mi] && moArr[mi].name) moNames[String(moArr[mi].name).replace(/\\/g, "/")] = true
    }
    var moPathByPcStem = buildMoRasterPathByPcStemFromMoImageList(moArr)
    var pcByName = {}
    for (var pi = 0; pi < (pcImages || []).length; pi++) {
        var im = pcImages[pi]
        if (!im || !im.name || !im.dataUrl) continue
        var n = String(im.name).replace(/\\/g, "/")
        if (!/_mo(?:_[a-z]{2})?(?:_\d{6})?\.(png|jpe?g)$/i.test(n)) pcByName[n] = im.dataUrl
    }
    var sectionStyles = (parseCodeIntoParts(code || "").sectionStyles) || ""
    sectionStyles.replace(/--bg-img\s*:\s*url\s*\(\s*["']?([^"'()]+\.(?:png|jpg|jpeg))["']?\s*\)/gi, function (_, path) {
        var p = String(path || "").trim()
        var extMatch = /\.(png|jpe?g)$/i.exec(p)
        var ext = extMatch ? extMatch[1].toLowerCase() : "jpg"
        if (ext === "jpeg") ext = "jpg"
        var stem = p.replace(/\.(png|jpe?g)$/i, "")
        var stemBase = apAssetStemToPcRasterLookupKey(stem)
        var pathMo =
            moPathByPcStem[stemBase] ||
            moPathByPcStem[stem] ||
            (/_mo(?:_[a-z]{2})?(?:_\d{6})?\.(png|jpe?g)$/i.test(p) ? p : guessMoRasterPathFromPcRasterPath(p, ext))
        if (!moNames[pathMo] && pcByName[p]) {
            moNames[pathMo] = true
            list.push({ name: pathMo, dataUrl: pcByName[p] })
        }
        return ""
    })
    return list
}

/** sectionStyles에서 --bg-img/background-image → @media에 _mo 이미지 오버라이드 병합 */
function injectBgOverridesForMo(sectionStyles, overridesCss, excludedSecClasses, moPathByPcStem) {
    excludedSecClasses = excludedSecClasses || []
    var exclude = {}
    for (var i = 0; i < excludedSecClasses.length; i++) exclude[String(excludedSecClasses[i])] = true

    function resolveMoAssetPath(pcPathWithExt, ext) {
        var p = String(pcPathWithExt || "").trim()
        var stem = p.replace(/\.(png|jpe?g)$/i, "")
        var stemBase = apAssetStemToPcRasterLookupKey(stem)
        if (moPathByPcStem) {
            if (moPathByPcStem[stemBase]) return moPathByPcStem[stemBase]
            if (moPathByPcStem[stem]) return moPathByPcStem[stem]
        }
        if (/_mo(?:_[a-z]{2})?(?:_\d{6})?\.(png|jpe?g)$/i.test(p)) return p
        return guessMoRasterPathFromPcRasterPath(p, ext)
    }

    var reUrlAsset = "assets\\/images\\/[^\"')\\s]+\\.(?:png|jpg|jpeg)"
    var bgOverrides = {}
    ;(sectionStyles || "").replace(
        new RegExp(
            "(?:\\.(?:pc-only|mo-only)\\s+)?\\.ap-section--(\\d+)\\s*\\{[^}]*--bg-img\\s*:\\s*url\\s*\\(\\s*[\"']?(" +
                reUrlAsset +
                ")[\"']?\\s*\\)[^}]*\\}",
            "gi",
        ),
        function (_, secClass, path) {
            var pathTrim = String(path || "").trim()
            var extMatch = /\.(png|jpe?g)$/i.exec(pathTrim)
            var ext = extMatch ? extMatch[1].toLowerCase() : "jpg"
            if (ext === "jpeg") ext = "jpg"
            var secNorm = secClass.length === 1 ? "0" + secClass : secClass
            if (exclude[secNorm] || exclude[secClass]) return ""
            var pathMo = resolveMoAssetPath(pathTrim, ext)
            bgOverrides[secNorm] = "--bg-img:url(" + pathMo + ")"
            return ""
        },
    )
    var frameBgOverrides = []
    ;(sectionStyles || "").replace(
        new RegExp(
            "(\\.ap-section--\\d+(?:\\s+[^{]+)?)\\s*\\{[^}]*?background-image\\s*:\\s*url\\s*\\(\\s*[\"']?(" +
                reUrlAsset +
                ")[\"']?\\s*\\)[^}]*\\}",
            "gi",
        ),
        function (_, sel, path) {
            var selector = (sel || "").trim()
            if (!selector) return ""
            if (/^\.ap-section--\d+\s*$/.test(selector)) return ""
            var pathTrim = String(path || "").trim()
            var extMatch = /\.(png|jpe?g)$/i.exec(pathTrim)
            var ext = extMatch ? extMatch[1].toLowerCase() : "jpg"
            if (ext === "jpeg") ext = "jpg"
            var pathMo = resolveMoAssetPath(pathTrim, ext)
            frameBgOverrides.push({ sel: selector, pathMo: pathMo })
            return ""
        },
    )

    if (!Object.keys(bgOverrides).length && !frameBgOverrides.length) return overridesCss || ""

    var overrides = String(overridesCss || "")
    var reStripBgImg = /--bg-img\s*:\s*url\s*\([^)]+\)\s*;?/gi
    overrides = overrides.replace(/(\.ap-section--(\d+)\s*\{)([^}]*)(\})/g, function (_, open, secClass, decl, close) {
        var secNorm = secClass.length === 1 ? "0" + secClass : secClass
        var bgDecl = bgOverrides[secNorm]
        if (bgDecl) {
            var stripped = decl.replace(reStripBgImg, "").trim()
            var sep = stripped && !/;\s*$/.test(stripped) ? ";" : ""
            var newDecl = stripped + sep + bgDecl
            delete bgOverrides[secNorm]
            return open + newDecl + close
        }
        return _
    })
    var remaining = Object.keys(bgOverrides).map(function (sec) {
        return "  .ap-section--" + sec + "{ " + bgOverrides[sec] + " }"
    })
    if (remaining.length) {
        overrides = overrides.replace(/\n(\s*)\}\s*$/, "\n" + remaining.join("\n") + "\n}")
    }
    if (frameBgOverrides.length) {
        var frameLines = frameBgOverrides.map(function (o) {
            return "  " + o.sel + "{ background-image:url(" + o.pathMo + "); }"
        })
        overrides = overrides.replace(/\n(\s*)\}\s*$/, "\n" + frameLines.join("\n") + "\n$1}\n")
    }
    return overrides
}

/** 슬라이드(.swiper-slide) 하위 이미지: PC 전용 경로만 쓸 때 부착 → combine 시 picture/_mo 생략 */
function apSlidePcImgAttr(opts) {
    return opts && opts.insideSwiperSlide ? 'data-slide-pc-img="1" ' : ""
}

/** PC HTML + @media로 MO 스타일 오버라이드. MO 이미지는 picture/source로 전환 */
function combinePcMoAsBreakpoint(pcCode, desktopRoot, mobileRoot, breakpoint, options) {
    options = options || {}
    var pc = parseCodeIntoParts(pcCode)
    var base = pc.baseStyles || ""
    var sectionStyles = pc.sectionStyles || ""
    var artTrim = String(pc.articleHtml || "").trim()
    var usedBem = artTrim ? buildUsedApSectionBemFromArticleHtml(pc.articleHtml) : null
    var secStructMerge = getSectionStructureMatch(desktopRoot, mobileRoot)
    var skipMoWalkSecs = secStructMerge && secStructMerge.mismatchSecs ? secStructMerge.mismatchSecs : []
    var moPathByPcStem = buildMoRasterPathByPcStemFromMoImageList(options.moImages || [])
    sectionStyles = rewriteMoOnlyRasterBgUrls(sectionStyles, moPathByPcStem)

    var overrides = buildMobileOverrides(
        desktopRoot,
        mobileRoot,
        breakpoint,
        Object.assign({}, options, {
            usedApSectionBemBySection: usedBem,
            skipStructureMismatchSecs: skipMoWalkSecs,
        }),
    )
    overrides = injectBgOverridesForMo(sectionStyles, overrides, skipMoWalkSecs, moPathByPcStem)

    var mergedCss = [base, sectionStyles, overrides].filter(function (x) {
        return x && String(x).trim()
    }).join("\n")
    var styleBlock = "<style>" + compressCssForStyleTag(mergedCss) + "</style>\n\n"
    var articleHtml = pc.articleHtml || ""
    var bp = Number(breakpoint) || 750
    var reApRasterImgSrc =
        /<img\s+([^>]*?)src="(assets\/images\/page_[a-zA-Z0-9_-]+_sec\d+_img\d+(?:(?:_pc|_mo)(?:_[a-z]{2})?|_[a-z]{2})?(?:_\d{6})?)\.(png|jpg|jpeg)"([^>]*)>/gi
    articleHtml = articleHtml.replace(reApRasterImgSrc, function (full, before, basePath, ext, after) {
        if (/\bdata-slide-pc-img\s*=\s*["']1["']/.test(before + after)) return full
        if (String(ext).toLowerCase() === "svg") { return "<img " + before + "src=\"" + basePath + "." + ext + "\"" + after + ">"; }
        var moSrc = moPathByPcStem[basePath] || guessMoRasterPathFromPcRasterPath(basePath + "." + ext, ext)
        return '<picture><source media="(max-width:' + bp + 'px)" srcset="' + moSrc + '"><img ' + before + 'src="' + basePath + "." + ext + '"' + after + "></picture>"
    })
    var headPrefix = (pc.headPrefix || "").trim()
    return (headPrefix ? headPrefix + "\n" : "") + styleBlock + articleHtml
}
