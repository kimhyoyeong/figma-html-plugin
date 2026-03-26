/**
 * 095-responsive-pcmo — PC HTML + @media로 MO 스타일·배경·picture 병합
 *
 * buildMobileOverrides — PC/MO 트리 visible 자식 인덱스 1:1 walk로 달라진 CSS만 @media에 출력
 * getSectionStructureMatch — 섹션별 구조 시그니처 일치 여부(하이브리드 경고용)
 * parseCodeIntoParts — 산출 HTML에서 base/section 스타일/article 분리
 * injectBgOverridesForMo — sectionStyles의 --bg-img를 MO용 _mo 경로로 덮어씀
 * apSlidePcImgAttr — 슬라이드 안 이미지는 picture 변환 생략 표시
 * combinePcMoAsBreakpoint — 위 요소 합쳐 최종 HTML 문자열
 */
// ----- 6. Section Utils (배경은 buildSectionBackgroundAsync) -----
/** PC HTML 기준 MO 미디어쿼리 오버라이드 (visible 자식 인덱스 1:1 매칭, diff만 출력) */
function buildMobileOverrides(desktopRoot, mobileRoot, breakpoint, options) {
    options = options || {}
    var exportedSet = options.exportedNodeIds || null
    var ownImageSet = options.ownImageNodeIds || null
    function isExported(id) {
        if (!exportedSet || id == null) return true
        if (Object.keys(exportedSet).length === 0) return true
        return exportedSet[String(id)] === true
    }
    function hasOwnImageFigure(id) {
        if (!ownImageSet || id == null) return true
        return ownImageSet[String(id)] === true
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

    function walkPair(dNode, mNode, mParent, secClass, imageByName, imageOverrideDone, textByName, textOverrideDone, semMap, videoByName, videoOverrideDone) {
        var moOpts = { sectionSemantics: semMap || {} }
        var dKids = (dNode.children || []).filter(function (c) {
            return c && isVisible(c)
        })
        var mKids = (mNode.children || []).filter(function (c) {
            return c && isVisible(c)
        })

        for (var i = 0; i < dKids.length && i < mKids.length; i++) {
            var d = dKids[i]
            var m = mKids[i]
            if (d.type !== m.type) continue
            if (!d.id) {
                if (d.type === "FRAME" && isContainer(d))
                    walkPair(d, m, m, secClass, imageByName, imageOverrideDone, textByName, textOverrideDone, semMap, videoByName, videoOverrideDone)
                continue
            }
            var sel = ""
            var declParts = []
            var moImageFigureDup =
                nodeHasApSectionImageSemantic(d.id, moOpts) && nodeWillRenderAsApImageFigure(d)
            if (d.type === "FRAME" && isContainer(d)) {
                sel = ".ap-section--" + secClass + " " + cssInnerSelForNode(String(d.id), moOpts, false)
                if (isFlex(m)) {
                    var flexDiff = buildFlexDeclDiff(isFlex(d) ? getLayoutVars(d) : null, getLayoutVars(m), m)
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
                var strokeDiff = buildStrokeDeclDiff(d, m)
                if (strokeDiff) declParts.push(strokeDiff)
                // PC 프레임과 동일 조건(bg|stroke|radius) + 높이가 다를 때만 MO min-height (Auto Layout+HUG 세로 제외)
                var mBoxH = getAbs(m)
                var dBoxH = getAbs(d)
                var mMinReason = frameHasMinHeightVisualReason(m)
                var dMinReason = frameHasMinHeightVisualReason(d)
                if (!moImageFigureDup && mBoxH && mBoxH.h != null && mMinReason) {
                    if (!(isFlex(m) && m.layoutSizingVertical !== "FIXED")) {
                        var mh = layoutPxNum(mBoxH.h)
                        var dh = dBoxH && dBoxH.h != null ? layoutPxNum(dBoxH.h) : null
                        if (!dMinReason || dh === null || mh !== dh)
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
                    if (isAbsoluteLike(m, mNode)) {
                        var adTxt = buildAbsDeclDiff(d, dNode, m, mNode)
                        if (adTxt) declParts.push(adTxt)
                    }
                }
            } else {
                var leafSelRaw = getLeafSelectorForNode(d, moOpts)
                sel = leafSelRaw ? ".ap-section--" + secClass + " " + leafSelRaw.replace(/,/g, ", .ap-section--" + secClass + " ") : ""
                if (isFlex(m)) {
                    var flexDiff2 = buildFlexDeclDiff(isFlex(d) ? getLayoutVars(d) : null, getLayoutVars(m), m)
                    if (flexDiff2) declParts.push(flexDiff2)
                }
                var fillW2 = getFillFlexStartWidthDecl(m, mNode)
                var fillW2D = getFillFlexStartWidthDecl(d, dNode)
                if (fillW2 && fillW2 !== fillW2D && !nodeHasApSectionImageSemantic(d.id, moOpts)) declParts.push(fillW2)
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
            var sizePairVideo = isVideoNode(d) || isVideoNode(m)
            if (
                d.id &&
                isExported(d.id) &&
                (((isVectorOnlyTree(d) || hasImageFill(d) || isImageCandidate(d)) && hasOwnImageFigure(d.id)) || sizePairVideo)
            ) {
                var sizeDeclM = ""
                if (isLineLikeNode(d)) sizeDeclM = buildLineVarsDeclDiff(d, m)
                else if (d.type === "ELLIPSE") sizeDeclM = buildEllipseVarsDeclDiff(d, m)
                else if (sizePairVideo) sizeDeclM = getVideoSizeDeclDiff(d, m)
                else sizeDeclM = getImageSizeDeclDiff(d, m)
                if (sizeDeclM) {
                    var leafSelM = cssInnerSelForNode(String(d.id), moOpts, false)
                    var fullSelM = ".ap-section--" + secClass + " " + leafSelM
                    if (sel && fullSelM === sel) declParts.push(sizeDeclM)
                    else pushMoMoRule(fullSelM, sizeDeclM)
                    if (sizePairVideo && videoOverrideDone && d.id != null) videoOverrideDone[String(d.id)] = true
                    if (imageOverrideDone && d.id != null && !isLineLikeNode(d) && d.type !== "ELLIPSE" && !sizePairVideo)
                        imageOverrideDone[String(d.id)] = true
                }
            }
            if (sel && declParts.length && isExported(d.id)) pushMoMoRule(sel, declParts.join(";"))
            if (d.type === "FRAME" && isContainer(d))
                walkPair(d, m, m, secClass, imageByName, imageOverrideDone, textByName, textOverrideDone, semMap, videoByName, videoOverrideDone)
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
        var secVideoByName = collectVideoNodesByName(mSec)
        var secTextByName = collectTextNodesByName(mSec)
        var sectionImageOverrideDone = {}
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
        var deskMoOpts = { sectionSemantics: deskSem }
        walkPair(
            dSec,
            mSec,
            mSec,
            secClass,
            secImageByName,
            sectionImageOverrideDone,
            secTextByName,
            sectionTextOverrideDone,
            deskSem,
            secVideoByName,
            sectionVideoOverrideDone
        )
        // 이미지: 인덱스로 매칭 안 된 경우에만 레이어 name 기준으로 MO 매칭
        function pushImageOverridesByName(dNode, secCls, imgByName, overrideDone) {
            if (!dNode || !isVisible(dNode)) return
            var isImg = (isImageCandidate(dNode) || hasImageFill(dNode) || (isVectorOnlyTree(dNode) && !isLineLikeNode(dNode) && dNode.type !== "ELLIPSE"))
            if (dNode.id && isImg && isExported(dNode.id) && hasOwnImageFigure(dNode.id) && !overrideDone[String(dNode.id)]) {
                var key = String(dNode.name || "").trim()
                var mImg = key !== "" && imgByName ? imgByName[key] : null
                if (mImg) {
                    var decl = getImageSizeDeclDiff(dNode, mImg)
                    if (decl)
                        pushMoMoRule(
                            ".ap-section--" + secCls + " " + cssInnerSelForNode(String(dNode.id), deskMoOpts, false),
                            decl
                        )
                }
            }
            if (isContainer(dNode)) for (var j = 0; j < dNode.children.length; j++) pushImageOverridesByName(dNode.children[j], secCls, imgByName, overrideDone)
        }
        pushImageOverridesByName(dSec, secClass, secImageByName, sectionImageOverrideDone)
        // code-video: 인덱스 매칭이 어긋난 경우 레이어 name 기준으로 MO 비디오 aspect-ratio 등
        function pushVideoOverridesByName(dNode, secCls, vidByName, overrideDone) {
            if (!dNode || !isVisible(dNode)) return
            if (
                dNode.id &&
                isExported(dNode.id) &&
                isVideoNode(dNode) &&
                !overrideDone[String(dNode.id)]
            ) {
                var key = String(dNode.name || "").trim()
                var mVid = key !== "" && vidByName ? vidByName[key] : null
                if (mVid && isVideoNode(mVid)) {
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
                            if (dParN && mParN && isAbsoluteLike(mText, mParN)) {
                                var adName = buildAbsDeclDiff(dNode, dParN, mText, mParN)
                                if (adName) nameTxtDecls.push(adName)
                            }
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

    function nodeSig(n, depth) {
        depth = depth || 0
        if (!n) return "null"
        var t = n.type || "UNKNOWN"
        var isCont = isContainer(n) ? "C" : "L"
        // 너무 깊게 들어가면 비용 커지므로 3레벨까지만
        if (!isContainer(n) || depth >= 3) return t + ":" + isCont
        var kids = visibleChildren(n)
        var parts = []
        for (var i = 0; i < kids.length; i++) parts.push(nodeSig(kids[i], depth + 1))
        return t + ":" + isCont + "[" + parts.join("|") + "]"
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
            var ds = nodeSig(d, 0)
            var ms = nodeSig(m, 0)
            match = ds === ms
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
    var sectionStart = fullStyle.search(/\n\.ap-section--/)
    var baseStyles = sectionStart >= 0 ? fullStyle.substring(0, sectionStart) : fullStyle
    var sectionStyles = sectionStart >= 0 ? fullStyle.substring(sectionStart).trim() : ""
    var articleHtml = code.substring(styleEnd + 8).trim()
    return {baseStyles: baseStyles, sectionStyles: sectionStyles, articleHtml: articleHtml, headPrefix: headPrefix}
}

/** sectionStyles에서 --bg-img/background-image → @media에 _mo 이미지 오버라이드 병합 */
function injectBgOverridesForMo(sectionStyles, overridesCss, excludedSecClasses) {
    excludedSecClasses = excludedSecClasses || []
    var exclude = {}
    for (var i = 0; i < excludedSecClasses.length; i++) exclude[String(excludedSecClasses[i])] = true

    var bgOverrides = {}
    ;(sectionStyles || "").replace(/\.ap-section--(\d+)\s*\{[^}]*--bg-img\s*:\s*url\s*\(\s*(assets\/images\/[^)]+\.(png|jpg|jpeg))\s*\)[^}]*\}/gi, function (_, secClass, path, ext) {
        var secNorm = secClass.length === 1 ? "0" + secClass : secClass
        if (exclude[secNorm] || exclude[secClass]) return ""
        var pathMo = path.trim().replace(new RegExp("\\." + ext + "$", "i"), "_mo." + ext)
        bgOverrides[secNorm] = "--bg-img:url(" + pathMo + ")"
        return ""
    })
    var frameBgOverrides = []
    ;(sectionStyles || "").replace(/(\.ap-section--\d+(?:\s+[^{]+)?)\s*\{[^}]*?background-image\s*:\s*url\s*\(\s*(assets\/images\/[^)]+\.(png|jpg|jpeg))\s*\)[^}]*\}/gi, function (_, sel, path, ext) {
        var selector = (sel || "").trim()
        if (!selector) return ""
        if (/^\.ap-section--\d+\s*$/.test(selector)) return ""
        var pathMo = path.trim().replace(new RegExp("\\." + ext + "$", "i"), "_mo." + ext)
        frameBgOverrides.push({ sel: selector, pathMo: pathMo })
        return ""
    })

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
    var overrides = buildMobileOverrides(
        desktopRoot,
        mobileRoot,
        breakpoint,
        Object.assign({}, options, { usedApSectionBemBySection: usedBem }),
    )
    overrides = injectBgOverridesForMo(sectionStyles, overrides)

    var mergedCss = [base, sectionStyles, overrides].filter(function (x) {
        return x && String(x).trim()
    }).join("\n")
    var styleBlock = "<style>" + compressCssForStyleTag(mergedCss) + "</style>\n\n"
    var articleHtml = pc.articleHtml || ""
    var bp = Number(breakpoint) || 750
    articleHtml = articleHtml.replace(/<img\s+([^>]*?)src="(assets\/images\/page_[a-zA-Z0-9_-]+_sec\d+_img\d+)\.(png|jpg|jpeg)"([^>]*)>/gi, function (full, before, basePath, ext, after) {
        if (/\bdata-slide-pc-img\s*=\s*["']1["']/.test(before + after)) return full
        if (String(ext).toLowerCase() === "svg") { return "<img " + before + "src=\"" + basePath + "." + ext + "\"" + after + ">"; }
        return '<picture><source media="(max-width:' + bp + 'px)" srcset="' + basePath + "_mo." + ext + '"><img ' + before + 'src="' + basePath + "." + ext + '"' + after + "></picture>"
    })
    var headPrefix = (pc.headPrefix || "").trim()
    return (headPrefix ? headPrefix + "\n" : "") + styleBlock + articleHtml
}
