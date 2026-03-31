/**
 * 096-html-code-builder — 최종 HTML/CSS 생성(섹션·Swiper·노드 렌더)
 *
 * compressCssForStyleTag — <style> 안 CSS 압축(주석·공백 제거, } 단위 줄바꿈)
 * compressEmbeddedStyleTagsInHtml — HTML 문자열 속 <style> 내용만 압축
 * buildCodeAsync — article·섹션·지연 스타일·슬라이드 마크업/CSS·Swiper 인라인 초기화 조립(Swiper CDN link/script 는 미리보기 ui.html 에서만 주입)
 *   PC+MO 구조 불일치·비슬라이드: `div.pc-only`/`div.mo-only` 래퍼 + section, 지연 CSS `.pc-only .ap-section--NN …`
 */
// ----- 9. HTML Renderers / Code Builder (node-id 기반 HTML·CSS) -----
/** CMS <style> 블록용: 주석 제거·내부 공백 축약 + 닫는 } 마다 줄바꿈 (한 덩어리 한 줄 방지) */
function compressCssForStyleTag(src) {
    if (!src) return ""
    var s = String(src)
    s = s.replace(/\/\*[\s\S]*?\*\//g, "")
    s = s.replace(/[\r\n\t]+/g, "")
    s = s.replace(/\s*;\s*/g, ";")
    s = s.replace(/\s*{\s*/g, "{")
    s = s.replace(/\s*}\s*/g, "}")
    s = s.replace(/\s*,\s*/g, ",")
    s = s.replace(/\s+/g, " ")
    s = s.replace(/;\s*}/g, "}")
    s = s.replace(/}/g, "}\n")
    s = s.replace(/@media/g, "\n@media")
    s = s.replace(/\n+/g, "\n").replace(/^\n+/, "").trim()
    return s
}
/** 생성된 HTML 문자열 안의 각 <style>…</style>을 압축 (CMS 산출물) */
function compressEmbeddedStyleTagsInHtml(html) {
    return String(html || "").replace(/<style>([\s\S]*?)<\/style>/gi, function (_, inner) {
        return "<style>" + compressCssForStyleTag(inner) + "</style>"
    })
}

/** 루트 노드와 캐시로 전체 HTML/CSS 문자열 생성 (섹션별 스타일·article 본문) */
function buildCodeAsync(root, cache, sectionNodesParam, geoStructure, mobileRoot, structureMismatchSecs) {
    var codeLines = []
    var deferredStyles = []
    var exportedNodeIds = {}
    var ownImageNodeIds = {}
    var ctx = {deferredStyles: deferredStyles, exportedNodeIds: exportedNodeIds, ownImageNodeIds: ownImageNodeIds}

    var mismatchSet = Object.create(null)
    if (Array.isArray(structureMismatchSecs)) {
        for (var _msi = 0; _msi < structureMismatchSecs.length; _msi++) {
            mismatchSet[String(structureMismatchSecs[_msi])] = true
        }
    }

    /** 첫 분석(fontHtmlFilterActive 아님): 필터 없음. 이후: allowedFonts로만 HTML 허용. */
    var fontHtmlUnrestricted = cache.fontHtmlFilterActive !== true
    var allowedFontsForHtml = Array.isArray(cache.allowedFonts) ? cache.allowedFonts : []

    var sectionList = sectionNodesParam && sectionNodesParam.length >= 0 ? sectionNodesParam : (root.children || [])
    var rootBox = getAbs(root)
    var baseWidth = rootBox && rootBox.w ? r2(rootBox.w) : 1920

    codeLines.push("<style>")
    codeLines.push("")
    codeLines.push(".ap-post,")
    codeLines.push(".ap-post * {")
    codeLines.push("  margin:0;")
    codeLines.push("  box-sizing:border-box;")
    codeLines.push("}")
    codeLines.push("")
    codeLines.push(".ap-post__inner {")
    codeLines.push("  container:article/inline-size;")
    codeLines.push("  --ap-width:" + baseWidth + ";")
    //codeLines.push("  max-width:" + baseWidth + "px;width:100%;")
    codeLines.push("  margin:0 auto;")
    codeLines.push("}")
    codeLines.push("")

    codeLines.push(".ap-section {")
    codeLines.push("  position:relative;")
    codeLines.push("  overflow:hidden;")
    codeLines.push("  background-color:var(--bgc,transparent);")
    codeLines.push("  background-image:var(--bg-img,none);")
    codeLines.push("  background-repeat:no-repeat;")
    codeLines.push("  background-position:center;")
    codeLines.push("  background-size:cover;")
    codeLines.push("}")
    codeLines.push("")
    codeLines.push("")

    codeLines.push(".ap-abs{")
    codeLines.push("  position:absolute;")
    codeLines.push("  left:calc(var(--ap-left, 0)/var(--ap-width)*100cqi);")
    codeLines.push("  top:calc(var(--ap-top, 0)/var(--ap-width)*100cqi);")
    codeLines.push("  width:calc(var(--ap-w, 0)/var(--ap-width)*100cqi);")
    codeLines.push("  height:calc(var(--ap-h, 0)/var(--ap-width)*100cqi);")
    codeLines.push("}")
    codeLines.push("")

    // text
    codeLines.push(".ap-text {")
    codeLines.push("  margin:0;")
    codeLines.push("  font-size:calc(var(--ap-fs)/var(--ap-width)*100cqi);")
    codeLines.push("  line-height:calc(var(--ap-lh)/var(--ap-width)*100cqi);")
    codeLines.push("  letter-spacing:calc(var(--ap-ls)/var(--ap-width)*100cqi);")
    codeLines.push("  font-weight:var(--ap-fw);")
    codeLines.push("  text-align:var(--ap-ta);")
    codeLines.push("  color:var(--ap-clr);")
    codeLines.push("}")
    codeLines.push(".ap-text__part {")
    codeLines.push("  font-size:calc(var(--ap-fs)/var(--ap-width)*100cqi);")
    codeLines.push("  line-height:initial;")
    codeLines.push("  letter-spacing:calc(var(--ap-ls)/var(--ap-width)*100cqi);")
    codeLines.push("  font-weight:var(--ap-fw);")
    codeLines.push("  color:var(--ap-clr);")
    codeLines.push("}")
    codeLines.push("")
    codeLines.push(".pc-only{ display:block; }")
    codeLines.push(".mo-only{ display:none; }")
    codeLines.push("")

    // image: 인라인은 --ap-w로 크기, absolute는 wrapper 크기에 맞춤(중복 제거)
    codeLines.push(".ap-image img {")
    codeLines.push("  width:calc(var(--ap-w, 0) / var(--ap-width) * 100cqi);")
    codeLines.push("  height:calc(var(--ap-h, 0) / var(--ap-width) * 100cqi);")
    codeLines.push("  display:block;")
    codeLines.push("}")
    codeLines.push(".ap-image.ap-abs img { width:100%; height:100%; object-fit:cover; }")
    codeLines.push("")
    codeLines.push(".ap-video {")
    codeLines.push("  display:flex; align-items:center; justify-content:center;")
    codeLines.push("  width:calc(var(--ap-w, 0) / var(--ap-width) * 100cqi);")
    codeLines.push("  height:calc(var(--ap-h, 0) / var(--ap-width) * 100cqi);")
    codeLines.push("  aspect-ratio: calc(var(--ap-w, 1) / var(--ap-h, 1));")
    codeLines.push("}")
    codeLines.push(".ap-video.ap-abs { width:100%; height:100%; min-height:0; aspect-ratio:auto; }")
    codeLines.push(".ap-video video { width:100%; height:100%; object-fit:contain; display:block; }")
    codeLines.push("")
    codeLines.push(".ap-line {")
    codeLines.push("  display:block; flex-shrink:0; min-height:1px;")
    codeLines.push("  width:calc(var(--ap-line-w, 100)/var(--ap-width)*100cqi);")
    codeLines.push("  height:calc(var(--ap-line-h, 1)/var(--ap-width)*100cqi);")
    codeLines.push("  background:var(--ap-line-color,#000);")
    codeLines.push("  transform-origin:left center;")
    codeLines.push("  transform:rotate(var(--ap-line-rot, 0)deg);")
    codeLines.push("}")
    codeLines.push(".ap-line.ap-abs { min-height:0; }")
    codeLines.push("")
    codeLines.push(".ap-ellipse {")
    codeLines.push("  display:block; flex-shrink:0;")
    codeLines.push("  width:calc(var(--ap-ellipse-w, 100)/var(--ap-width)*100cqi);")
    codeLines.push("  height:calc(var(--ap-ellipse-h, 100)/var(--ap-width)*100cqi);")
    codeLines.push("  border-radius:50%;")
    codeLines.push("  background:var(--ap-ellipse-bgc,transparent);")
    codeLines.push("  border:calc(var(--ap-ellipse-bd, 0)/var(--ap-width)*100cqi) solid var(--ap-ellipse-bdc,transparent);")
    codeLines.push("}")
    codeLines.push(".ap-ellipse.ap-abs { width:100%; height:100%; box-sizing:border-box; }")
    codeLines.push("")
    codeLines.push("/* 슬라이드: 다음 장 피크·카드 폭이 슬라이드 셀보다 클 때 섹션/셀 overflow로 잘리지 않게 */")
    /** Swiper 기본 화살표 경로 · data URL은 수동 인코딩 대신 encodeURIComponent로만 생성(파서 호환) */
    var apSwiperNavArrowDataUrl =
        "data:image/svg+xml," +
        encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 27 44"><path d="M27,22L27,22L5,44l-2.1-2.1L22.8,22L2.9,2.1L5,0L27,22L27,22z" fill="#000"/></svg>'
        )
    codeLines.push(".ap-section--swiper { overflow: visible; height: auto; min-height: auto; }")
    codeLines.push(".ap-post .swiper {")
    codeLines.push("  overflow: hidden; width:100%; ")
    codeLines.push("  --swiper-navigation-color:#000;")
    codeLines.push("  --swiper-pagination-bullet-size:10px;")
    codeLines.push("}")
    codeLines.push(".ap-post .swiper-pagination {position: relative;width:100%;margin-top: calc(80 / var(--ap-width) * 100cqi); }")
    codeLines.push(".ap-post .swiper-button-prev:after,.ap-post .swiper-button-next:after { content:none; }")
    codeLines.push(".ap-post .swiper-button-prev,")
    codeLines.push(".ap-post .swiper-button-next {")
    codeLines.push("  width: clamp(0px, calc(40 / var(--ap-width) * 100cqi), 40px);")
    codeLines.push("  height: clamp(0px, calc(80 / var(--ap-width) * 100cqi), 80px);")
    codeLines.push("  background-color: var(--swiper-navigation-color);")
    codeLines.push('  -webkit-mask: url("' + apSwiperNavArrowDataUrl + '") no-repeat center / contain;')
    codeLines.push('  mask: url("' + apSwiperNavArrowDataUrl + '") no-repeat center / contain;')
    codeLines.push("  background-repeat: no-repeat;")
    codeLines.push("  background-size: contain;")
    codeLines.push("}")
    codeLines.push(".ap-post .swiper-button-prev { transform: rotate(180deg); }")
    codeLines.push(".ap-post .swiper-pagination-bullet{background-color: var(--swiper-navigation-color);}")
    codeLines.push("")
    // </style>는 deferred 스타일 합친 뒤에 한 번만 닫음

    var contentLines = []
    var articleYear = new Date().getFullYear()
    contentLines.push('<article class="ap-post" data-article-year="' + articleYear + '">')
    contentLines.push('  <div class="ap-post__inner">')

    // root children = sections
    var sectionCount = isContainer(root) ? root.children.length : 0
    var sectionIndex = 0
    var hasSlideSection = false
    /** 섹션별 HTML 렌더 순서 <img> 노드 id (applyApSectionImageRenderOrderFromIds와 동일) — 095 MO 이미지 diff에 전달 */
    var sectionImageRenderOrderIds = []

    function visWrapFromOpts(opts) {
        return opts && opts.visibilityWrapper ? String(opts.visibilityWrapper) : ""
    }

    function pipelineImgCtx(node, secNo, opts) {
        opts = opts || {}
        var o = {
            cache: cache,
            secNo: secNo,
            slotIndex: opts.slotIndex != null ? opts.slotIndex : 0,
            insideSwiperSlide: !!opts.insideSwiperSlide,
            fromPrefetchSlot: opts.fromPrefetchSlot === true,
            pairPcNode: opts.pairPcNode || null,
        }
        if (cache.imageSuffix === "_mo" && node && node.id != null && cache.pairPcNodeIdByMoId) {
            var pcid = cache.pairPcNodeIdByMoId[String(node.id)]
            if (pcid) {
                try {
                    var pn = figma.getNodeById(pcid)
                    if (pn) o.pairPcNode = pn
                } catch (e) {}
            }
        }
        if (opts && opts.clipExportParent) o.clipExportParent = opts.clipExportParent
        return o
    }

    /** 섹션 루트 한 줄 규칙용: `.ap-section--NN` 또는 `.pc-only .ap-section--NN` */
    function sectionRootSelector(secClass, visWrap) {
        var vw = visWrap ? String(visWrap).replace(/^\./, "") : ""
        return vw ? "." + vw + " .ap-section--" + secClass : ".ap-section--" + secClass
    }

    function selInSection(secClass, innerSel, visWrap) {
        var vw = visWrap ? String(visWrap).replace(/^\./, "") : ""
        var prefix = vw ? "." + vw + " .ap-section--" + secClass : ".ap-section--" + secClass
        return prefix + " " + String(innerSel || "").replace(/,/g, ", " + prefix + " ")
    }

    function pushTextNodeDeferredStyles(ctx, secClass, id, ts, node, parent, textAbs, includeAbs, ropts) {
        if (includeAbs === undefined) includeAbs = true
        var inner = cssInnerSelForNode(id, ropts || {}, false)
        var vw = visWrapFromOpts(ropts)
        var textDeclParts = []
        var decl = buildTextVarsDecl(ts)
        if (decl) textDeclParts.push(decl)
        var textFullW = getTextFullWidthDecl(node, textAbs, parent)
        if (textFullW) textDeclParts.push(textFullW)
        if (textDeclParts.length) pushDeferredStyle(ctx, selInSection(secClass, inner, vw), textDeclParts.join(";"))
        if (includeAbs && textAbs && id) {
            var textAbsDecl = buildAbsDecl(node, parent)
            if (textAbsDecl) pushDeferredStyle(ctx, selInSection(secClass, inner, vw), textAbsDecl)
        }
        var partResult = buildTextPartInnerHtml(ts)
        var parentStyle = typeof partResult === "string" ? "" : (partResult.parentStyle || "")
        if (parentStyle && id) pushDeferredStyle(ctx, selInSection(secClass, inner, vw), parentStyle)
    }

    function buildTextNodeHtml(ts, node, textCls, dataIdAttr, depth) {
        var partResult = buildTextPartInnerHtml(ts)
        var innerHtml = typeof partResult === "string" ? partResult : partResult.inner
        var rid = node.id != null ? String(node.id) : ""
        var resp
        if (rid && cache.responsiveTextInnerByNodeId && textSummaryAllowsResponsiveBrOverride(ts)) {
            resp = cache.responsiveTextInnerByNodeId[rid]
        }
        if (resp !== undefined && resp !== null) innerHtml = resp
        var tag = textNodeTag(node, textCls, dataIdAttr, depth)
        var html = indent(depth) + tag.open + innerHtml + tag.close
        return isBtnNode(node) ? html : wrapIfBtn(node, html, depth)
    }

    // TEXT: 체크된 허용 폰트만 HTML, 목록 밖(미체크) 패밀리는 래스터 이미지
    function renderTextNodeAsync(node, parent, secNo, secClass, depth, opts) {
        var id = node.id != null ? String(node.id) : ""
        var dataIdAttr = ""
        var textAbs = isAbsoluteLike(node, parent)
        var textCls = apNodeClassList("ap-text" + (textAbs ? " ap-abs" : ""), id, opts)
        return getTextSummaryAsync(node)
            .then(function (ts) {
                var families = ts.fontFamilies && ts.fontFamilies.length ? ts.fontFamilies : ts.fontFamily ? [ts.fontFamily] : []
                var fontAllowed = textFamiliesAllowedAsHtml(families, allowedFontsForHtml, fontHtmlUnrestricted)

                if (fontAllowed) {
                    pushTextNodeDeferredStyles(ctx, secClass, id, ts, node, parent, textAbs, true, opts)
                    return buildTextNodeHtml(ts, node, textCls, dataIdAttr, depth)
                }

                return pipelineEnsureImageAsync(
                        node,
                        pipelineImgCtx(node, secNo, {
                            insideSwiperSlide: !!(opts && opts.insideSwiperSlide),
                            clipExportParent: parent,
                        })
                    )
                    .then(function (meta) {
                        if (!meta || !meta.dataUrl) {
                            pushTextNodeDeferredStyles(ctx, secClass, id, ts, node, parent, textAbs, true, opts)
                            return buildTextNodeHtml(ts, node, textCls, dataIdAttr, depth)
                        }
                        var path =
                            cache &&
                            getOrAssignImagePath(cache, meta.assetKey, meta.dataUrl, secNo, {
                                skipExport: isVideoNode(node),
                                imageHash: getPrimaryImageFillHash(node),
                                reuseAssetKey: meta.reuseAssetKey || undefined,
                            })
                        var altText = getImageAltText(node)
                        if (id) ctx.ownImageNodeIds[id] = true
                        var rasterOpts = optsWithRasterTextAsImageSemantics(id, opts)
                        var imgWrapCls = apNodeClassList(("ap-image" + (textAbs ? " ap-abs" : "")).trim(), id, rasterOpts)
                        if (textAbs && id) {
                            var traDecl = buildAbsDeclTextRaster(node, parent)
                            if (traDecl) pushDeferredStyle(ctx, selInSection(secClass, cssInnerSelForNode(id, rasterOpts, false), visWrapFromOpts(opts)), traDecl)
                        }
                        pushDeferredImageImgSizeVars(ctx, secClass, id, node, rasterOpts, textAbs, visWrapFromOpts(opts), parent)
                        return wrapIfBtn(
                            node,
                            indent(depth) + '<div class="' + imgWrapCls + '"><img ' + apSlidePcImgAttr(opts) + 'src="' + (path || "") + '" alt="' + altText + '" /></div>',
                            depth
                        )
                    })
                    .catch(function () {
                        pushTextNodeDeferredStyles(ctx, secClass, id, ts, node, parent, textAbs, false, opts)
                        return buildTextNodeHtml(ts, node, textCls, dataIdAttr, depth)
                    })
            })
            .catch(function () {
                var tag = textNodeTag(node, textCls, dataIdAttr, depth)
                return indent(depth) + tag.open + tag.close
            })
    }

    // VECTOR — LINE/line/ELLIPSE는 CSS로 그리기, 나머지는 SVG export
    function renderVectorNodeAsync(node, parent, secNo, secClass, depth, opts) {
        var id = node.id != null ? String(node.id) : ""
        if (isLineLikeNode(node)) {
            var lineAbs = isAbsoluteLike(node, parent)
            var lineParentWraps = parent && parent.type === "FRAME" && isContainer(parent)
            var lineNeedWrapper = lineAbs && (!lineParentWraps || (node.type === "FRAME" && isContainer(node)))
            if (lineAbs && id) {
                var lineAbsDecl = buildAbsDecl(node, parent)
                if (lineAbsDecl) pushDeferredStyle(ctx, selInSection(secClass, cssInnerSelForNode(id, opts, false), visWrapFromOpts(opts)), lineAbsDecl)
            }
            var lineVars = buildLineVarsDecl(node)
            if (lineVars) pushDeferredStyle(ctx, selInSection(secClass, cssInnerSelForNode(id, opts, false), visWrapFromOpts(opts)), lineVars)
            var lineCls = apNodeClassList("ap-line" + (lineNeedWrapper ? " ap-abs" : ""), id, opts)
            var lineHtml = '<div class="' + lineCls + '"></div>'
            return Promise.resolve(wrapIfBtn(node, indent(depth) + lineHtml, depth))
        }
        if (node.type === "ELLIPSE") {
            var ellipseAbs = isAbsoluteLike(node, parent)
            var ellipseParentWraps = parent && parent.type === "FRAME" && isContainer(parent)
            var ellipseNeedWrapper = ellipseAbs && (!ellipseParentWraps || (node.type === "FRAME" && isContainer(node)))
            if (ellipseAbs && id) {
                var ellipseAbsDecl = buildAbsDecl(node, parent)
                if (ellipseAbsDecl) pushDeferredStyle(ctx, selInSection(secClass, cssInnerSelForNode(id, opts, false), visWrapFromOpts(opts)), ellipseAbsDecl)
            }
            var ellipseVars = buildEllipseVarsDecl(node)
            if (ellipseVars) pushDeferredStyle(ctx, selInSection(secClass, cssInnerSelForNode(id, opts, false), visWrapFromOpts(opts)), ellipseVars)
            var ellipseCls = apNodeClassList("ap-ellipse" + (ellipseNeedWrapper ? " ap-abs" : ""), id, opts)
            var ellipseHtml = '<div class="' + ellipseCls + '"></div>'
            return Promise.resolve(wrapIfBtn(node, indent(depth) + ellipseHtml, depth))
        }
        var svgImgAbs = isAbsoluteLike(node, parent)
        return pipelineEnsureImageAsync(
            node,
            pipelineImgCtx(node, secNo, { insideSwiperSlide: !!(opts && opts.insideSwiperSlide), clipExportParent: parent })
        ).then(function (meta) {
            if (!meta || !meta.dataUrl) return ""
            var path =
                cache &&
                getOrAssignImagePath(cache, meta.assetKey, meta.dataUrl, secNo, {
                    skipExport: isVideoNode(node),
                    imageHash: getPrimaryImageFillHash(node),
                    reuseAssetKey: meta.reuseAssetKey || undefined,
                })
            if (svgImgAbs && id) {
                var svgAbsDecl = buildAbsDecl(node, parent)
                if (svgAbsDecl) pushDeferredStyle(ctx, selInSection(secClass, cssInnerSelForNode(id, opts, false), visWrapFromOpts(opts)), svgAbsDecl)
            }
            var altText = getImageAltText(node)
            if (id) ctx.ownImageNodeIds[id] = true
            var svgImgCls = apNodeClassList(("ap-image" + (svgImgAbs ? " ap-abs" : "")).trim(), id, opts)
            pushDeferredImageImgSizeVars(ctx, secClass, id, node, opts, svgImgAbs, visWrapFromOpts(opts), parent)
            var html = indent(depth) + '<div class="' + svgImgCls + '"><img ' + apSlidePcImgAttr(opts) + 'src="' + (path || "") + '" alt="' + altText + '" /></div>'
            return wrapIfBtn(node, html, depth)
        })
    }

    // IMAGE — shouldExportAsSingleRasterImage: 직계 래스터 3+는 composite-raster(067), 그 외 분리는 hasMultiple+CLIP(isCompositeCandidate) 등 070 규칙과 동일
    function renderImageNodeAsync(node, parent, secNo, secClass, depth, opts) {
        var id = node.id != null ? String(node.id) : ""
        if (
            isContainer(node) &&
            hasMultipleImageLikeChildren(node) &&
            !isCompositeCandidate(node) &&
            !isCodeRasterNode(node) &&
            !isMaskImageRasterGroup(node)
        ) {
            var absImgGrp = isAbsoluteLike(node, parent)
            var useFlexImg = useApFlexClass(node, absImgGrp, isFlex(node))
            var declPartsImgGrp = []
            return buildBackgroundDeclAsync(node, false, cache, secNo).then(function (bgImgGrp) {
                if (bgImgGrp) declPartsImgGrp.push(bgImgGrp)
                var strokeImgGrp = buildStrokeDecl(node)
                if (strokeImgGrp) declPartsImgGrp.push(strokeImgGrp)
                if (absImgGrp) {
                    var absImgGrpDecl = buildAbsDecl(node, parent)
                    if (absImgGrpDecl) declPartsImgGrp.push(absImgGrpDecl)
                }
                if (useFlexImg) {
                    var lvImgGrp = getLayoutVars(node)
                    var flexImgGrp = buildFlexDecl(lvImgGrp, node, absImgGrp)
                    if (flexImgGrp) declPartsImgGrp.push(flexImgGrp)
                }
                var fillWImgGrp = getFillFlexStartWidthDecl(node, parent)
                var fillImgGrpPushed = !!(fillWImgGrp && !nodeHasApSectionImageSemantic(node.id, opts))
                if (fillImgGrpPushed) declPartsImgGrp.push(fillWImgGrp)
                else if (!absImgGrp && !nodeHasApSectionImageSemantic(node.id, opts)) {
                    var sameWImgGrp = getSameWidthAsParentDecl(node, parent)
                    if (sameWImgGrp) declPartsImgGrp.push(sameWImgGrp)
                }
                if (!useFlexImg && !absImgGrp && containerNeedsRelativeForAbsoluteChildren(node)) declPartsImgGrp.push("position:relative")
                if (declPartsImgGrp.length && id) {
                    pushDeferredStyle(ctx, selInSection(secClass, cssInnerSelForNode(id, opts, false), visWrapFromOpts(opts)), declPartsImgGrp.join(";"))
                }
                var chunksImg = []
                var imgGrpBase = [absImgGrp ? "ap-abs" : ""].filter(Boolean).join(" ")
                var imgGrpFrameCls = apNodeClassList(imgGrpBase, id, opts)
                var imgGrpTagOpen = indent(depth) + '<div class="' + imgGrpFrameCls + '">'
                var childrenImgGrp = node.children || []
                var idxImg = 0
                function nextImgCh() {
                    if (idxImg >= childrenImgGrp.length) {
                        var imgGrpHtml = wrapChunksAsUlOrDiv(depth, imgGrpFrameCls, "div", imgGrpTagOpen, false, chunksImg)
                        return Promise.resolve(wrapIfBtn(node, imgGrpHtml, depth))
                    }
                    var cImg = childrenImgGrp[idxImg++]
                    if (!cImg || (!(opts && opts.includeHidden) && !isVisible(cImg))) return nextImgCh()
                    return renderNodeAsync(cImg, node, secNo, secClass, depth + 1, opts).then(function (htmlImg) {
                        if (htmlImg) chunksImg.push(htmlImg)
                        return nextImgCh()
                    })
                }
                return nextImgCh()
            })
        }
        var imgAbs = isAbsoluteLike(node, parent)
        return pipelineEnsureImageAsync(
            node,
            pipelineImgCtx(node, secNo, { insideSwiperSlide: !!(opts && opts.insideSwiperSlide), clipExportParent: parent })
        ).then(function (meta) {
            if (!meta || !meta.dataUrl) return ""
            var path =
                cache &&
                getOrAssignImagePath(cache, meta.assetKey, meta.dataUrl, secNo, {
                    skipExport: isVideoNode(node),
                    imageHash: getPrimaryImageFillHash(node),
                    reuseAssetKey: meta.reuseAssetKey || undefined,
                })
            if (imgAbs && id) {
                var imgAbsDecl = buildAbsDecl(node, parent)
                if (imgAbsDecl) pushDeferredStyle(ctx, selInSection(secClass, cssInnerSelForNode(id, opts, false), visWrapFromOpts(opts)), imgAbsDecl)
            }
            var altText = getImageAltText(node)
            if (id) ctx.ownImageNodeIds[id] = true
            var figureCls = apNodeClassList("ap-image" + (imgAbs ? " ap-abs" : ""), id, opts)
            pushDeferredImageImgSizeVars(ctx, secClass, id, node, opts, imgAbs, visWrapFromOpts(opts), parent)
            var figureHtml = '<div class="' + figureCls + '"><img ' + apSlidePcImgAttr(opts) + 'src="' + (path || "") + '" alt="' + altText + '" /></div>'
            return wrapIfBtn(node, indent(depth) + figureHtml, depth)
        })
    }

    function renderFrameNodeAsync(node, parent, secNo, secClass, depth, opts) {
        var id = node.id != null ? String(node.id) : ""
        var abs = isAbsoluteLike(node, parent)
        var flex = isFlex(node)
        var useFlex = useApFlexClass(node, abs, flex)
        var box = getAbs(node)
        var parentBox = parent ? getAbs(parent) : null
        var isFullWidth = node.layoutSizingHorizontal === "FILL" ||
            (parentBox && box && box.w != null && parentBox.w != null && r2(box.w) === r2(parentBox.w))
        var containerStretchW = sectionContainerNeedsFullWidthInColumnParent(node, parent, opts && opts.sectionSemantics, null)
        var effFullWidth = isFullWidth || containerStretchW

            var frameBase = [abs ? "ap-abs" : "", isBtnNode(node) ? "ap-btn" : ""].filter(Boolean).join(" ")
            var cls = apNodeClassList(frameBase, id, opts)

        // style decl for this frame: flex vars + bg (frame는 background-image 가능)
        var declParts = []
        var frameLv = null
        /** 자기 자신이 ap-abs면 position은 클래스에만 있음 — relative를 deferred로 넣으면 섹션 셀렉터가 덮어써 깨짐 */
        if (!useFlex && !abs && containerNeedsRelativeForAbsoluteChildren(node)) declParts.push("position:relative")

        if (useFlex) {
            frameLv = getLayoutVars(node)
            var flexDecl = buildFlexDecl(frameLv, node, abs)
            if (flexDecl) declParts.push(flexDecl)
        }

        var axisGrowSelf = getFlexChildMainAxisGrowDecl(node, parent)
        if (axisGrowSelf && !abs && !nodeHasApSectionImageSemantic(node.id, opts)) declParts.push(axisGrowSelf)

        /** 전폭: ap-abs 는 .ap-abs + --ap-w 가 width 담당 — 지연 규칙에 width:100% 넣으면 특이도로 absolute 박스가 깨짐 */
        if (effFullWidth && !abs && !nodeHasApSectionImageSemantic(node.id, opts)) {
            if (flexFrameFixedWidthPreferMinWidth(frameLv))
                declParts.push("min-width:100%")
            else declParts.push("width:100%")
        }

        if (!effFullWidth) {
            /** FILL 이면 위에서 항상 effFullWidth → 여기서 getFillFlexStartWidthDecl 는 사실상 비-FILL only (코드 대칭·미래 변경 대비 유지) */
            var fillWidthDecl = getFillFlexStartWidthDecl(node, parent)
            if (fillWidthDecl && !nodeHasApSectionImageSemantic(node.id, opts)) declParts.push(fillWidthDecl)
            else if (!abs) {
                var sizingH = node.layoutSizingHorizontal
                if (sizingH === "FIXED" && box && box.w != null) {
                    declParts.push("--ap-w:" + cssOutLayoutPx(box.w))
                    var wCalc = "calc(var(--ap-w)/var(--ap-width)*100cqi)"
                    if (
                        !nodeHasApSectionImageSemantic(node.id, opts) &&
                        flexFrameFixedWidthPreferMinWidth(frameLv)
                    )
                        declParts.push("min-width:" + wCalc)
                    else declParts.push("width:" + wCalc)
                }
            }
        }

        // frame height: 배경(fill/이미지) 또는 stroke가 있을 때만 고정. 없으면 생략해 콘텐츠 증가 시 유지보수에 유리.
        return buildBackgroundDeclAsync(node, false, cache, secNo).then(function (bgDecl) {
            if (bgDecl) {
                declParts.push(bgDecl)
                var hasWidth = declParts.some(function (s) {
                    var t = String(s)
                    return (
                        t.indexOf("width:") !== -1 ||
                        t.indexOf("min-width:") !== -1 ||
                        t.indexOf("--ap-w:") !== -1
                    )
                })
                if (
                    box &&
                    box.w != null &&
                    !hasWidth &&
                    !abs &&
                    !nodeHasApSectionImageSemantic(node.id, opts)
                ) {
                    declParts.push("--ap-w:" + cssOutLayoutPx(box.w))
                    var wCalcBg = "calc(var(--ap-w)/var(--ap-width)*100cqi)"
                    if (flexFrameFixedWidthPreferMinWidth(frameLv)) declParts.push("min-width:" + wCalcBg)
                    else declParts.push("width:" + wCalcBg)
                }
            }
            var strokeDecl = buildStrokeDecl(node)
            if (strokeDecl) declParts.push(strokeDecl)
            var radiusDecl = buildCornerRadiusDecl(node)
            if (radiusDecl) declParts.push(radiusDecl)
            // min-height: Auto Layout+HUG 세로면 콘텐츠 높이 우선 → 프레임 고정 높이 min-height 생략
            // ・배경(fill/이미지): bgDecl · 테두리: strokeDecl · radius (박스 느낌)
            // ・직계 자식이 전부 absolute면 플로우 높이 없음 → Figma 프레임 높이로 잘림 방지
            var allAbsKids = containerAllVisibleChildrenAreAbsolute(node)
            var sbColMinH = flexColumnSpaceBetweenNeedsMinHeight(node)
            if (
                box &&
                box.h != null &&
                (bgDecl || strokeDecl || radiusDecl || allAbsKids || sbColMinH) &&
                (!flex || node.layoutSizingVertical === "FIXED" || allAbsKids)
            )
                declParts.push("min-height:calc(" + cssOutLayoutPx(box.h) + "/var(--ap-width)*100cqi)")

            // abs 좌표(부모 기준)
            if (abs) {
                var absDecl = buildAbsDecl(node, parent)
                if (absDecl) declParts.push(absDecl)
            }

            if (declParts.length) {
                pushDeferredStyle(ctx, selInSection(secClass, cssInnerSelForNode(id, opts, false), visWrapFromOpts(opts)), declParts.join(";"))
            }

            var isFrameBtn = isBtnNode(node)
            var frameTag = isFrameBtn ? "a" : "div"
            var frameTagOpen = "<" + frameTag + (isFrameBtn ? ' href="#"' : "") + ' class="' + cls + '">'
            var childChunks = []

            // children
            var children = node.children || []
            var i = 0
            function nextChild() {
                if (i >= children.length) {
                    var frameHtml = wrapChunksAsUlOrDiv(depth, cls, frameTag, frameTagOpen, isFrameBtn, childChunks)
                    return Promise.resolve(isFrameBtn ? frameHtml : wrapIfBtn(node, frameHtml, depth))
                }
                var ch = children[i++]
                if (!ch || !isVisible(ch)) return nextChild()

                // AutoLayout parent 안에서 ABS면 child가 FRAME이 아니어도 ap-abs wrapper 필요. 부모가 non-flex면 전부 absolute 처리.
                var chAbs = isAbsoluteLike(ch, node)

                // child가 FRAME이면 자체가 wrapper라서 추가 wrapper 없이 처리해도 되지만,
                // TEXT/IMAGE/기타 컨테이너는 wrapper(div)로 abs/배경 처리
                if (ch.type === "FRAME" && isContainer(ch)) {
                    return renderNodeAsync(ch, node, secNo, secClass, depth + 1, opts).then(function (html) {
                        if (html) childChunks.push(html)
                        return nextChild()
                    })
                }

                if (!chAbs && (ch.type === "LINE" || ch.type === "ELLIPSE" || isLineLikeNode(ch))) {
                    return renderNodeAsync(ch, node, secNo, secClass, depth + 1, opts).then(function (html) {
                        if (html) childChunks.push(html)
                        return nextChild()
                    })
                }

                var itemId = ch.id ? String(ch.id) : ""
                var leafSel = getLeafSelectorForNode(ch, opts)
                var isChContainer = isContainer(ch)

                return Promise.all([
                    buildBackgroundDeclAsync(ch, false, cache, secNo, {skipImageFill: isImageCandidate(ch) || isVectorOnlyTree(ch), skipSolidFill: isVectorOnlyTree(ch)}),
                    (function () {
                        if (!chAbs) return Promise.resolve("")
                        var absDecl2 = buildAbsDecl(ch, node)
                        return Promise.resolve(absDecl2 || "")
                    })(),
                    (function () {
                        if (!isFlex(ch)) return Promise.resolve("")
                        var lv2 = getLayoutVars(ch)
                        return Promise.resolve(buildFlexDecl(lv2, ch, chAbs))
                    })(),
                ]).then(function (res) {
                    var itemDeclParts = [res[2], res[0]].filter(Boolean)
                    if (res[1] && !isImageCandidate(ch)) itemDeclParts.push(res[1])
                    var strokeDeclCh = buildStrokeDecl(ch)
                    if (strokeDeclCh) itemDeclParts.push(strokeDeclCh)
                    var fillWidthCh = getFillFlexStartWidthDecl(ch, node)
                    var fillChPushed = !!(fillWidthCh && !chAbs && !nodeHasApSectionImageSemantic(ch.id, opts))
                    if (fillChPushed) itemDeclParts.push(fillWidthCh)
                    else if (!chAbs && !nodeHasApSectionImageSemantic(ch.id, opts)) {
                        var sameWCh = getSameWidthAsParentDecl(ch, node)
                        if (sameWCh) itemDeclParts.push(sameWCh)
                    }
                    var axisGrowCh = getFlexChildMainAxisGrowDecl(ch, node)
                    if (axisGrowCh && !chAbs && !nodeHasApSectionImageSemantic(ch.id, opts)) itemDeclParts.push(axisGrowCh)
                    var itemDecl = itemDeclParts.join(";")

                    if (itemDecl && leafSel) {
                        pushDeferredStyle(ctx, selInSection(secClass, leafSel, visWrapFromOpts(opts)), itemDecl)
                    }

                    // GROUP 등 컨테이너는 renderNodeAsync가 프레임 래퍼를 이미 출력
                    if (isChContainer) {
                        return renderNodeAsync(ch, node, secNo, secClass, depth + 1, opts).then(function (innerHtml) {
                            if (innerHtml) childChunks.push(innerHtml)
                            return nextChild()
                        })
                    }
                    return renderNodeAsync(ch, node, secNo, secClass, depth + 1, opts).then(function (innerHtml) {
                        if (innerHtml) childChunks.push(innerHtml)
                        return nextChild()
                    })
                })
            }

            return nextChild()
        })
    }

    // 기타 컨테이너: wrapper로 children 탐색
    function renderGenericContainerAsync(node, parent, secNo, secClass, depth, opts) {
        var id = node.id != null ? String(node.id) : ""
        var abs2 = isAbsoluteLike(node, parent)
        var flex = isFlex(node)
        var useFlex = useApFlexClass(node, abs2, flex)
        var declParts2Visual = []  // 배경/테두리/abs → 있으면 반드시 래퍼 유지
        var declParts2Flex = []

        return buildBackgroundDeclAsync(node, false, cache, secNo).then(function (bgDecl2) {
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
                if (flexDecl3) declParts2Flex.push(flexDecl3)
            }

            var fillWidthDecl2 = getFillFlexStartWidthDecl(node, parent)
            var fillGrpPushed = !!(fillWidthDecl2 && !nodeHasApSectionImageSemantic(node.id, opts))
            if (fillGrpPushed) declParts2Flex.push(fillWidthDecl2)
            else if (!abs2 && !nodeHasApSectionImageSemantic(node.id, opts)) {
                var sameWGrp = getSameWidthAsParentDecl(node, parent)
                if (sameWGrp) declParts2Flex.push(sameWGrp)
            }

            var axisGrowGrp = getFlexChildMainAxisGrowDecl(node, parent)
            if (axisGrowGrp && !abs2 && !nodeHasApSectionImageSemantic(node.id, opts)) declParts2Flex.push(axisGrowGrp)

            var boxGrp = getAbs(node)
            var allAbsChildrenGrp = containerAllVisibleChildrenAreAbsolute(node)
            var sbColMinHGrp = flexColumnSpaceBetweenNeedsMinHeight(node)
            if (
                boxGrp &&
                boxGrp.h != null &&
                (declParts2Visual.length > 0 || allAbsChildrenGrp || sbColMinHGrp) &&
                (!flex || node.layoutSizingVertical === "FIXED" || allAbsChildrenGrp)
            ) {
                declParts2Visual.push("min-height:calc(" + cssOutLayoutPx(boxGrp.h) + "/var(--ap-width)*100cqi)")
            }

            var children2 = node.children || []
            var visibleChildren = children2.filter(function (c) { return c && (opts && opts.includeHidden ? true : isVisible(c)) })
            var singleChild = visibleChildren.length === 1 ? visibleChildren[0] : null
            var groupHasVisualAttrs = declParts2Visual.length > 0
            var declParts2 = declParts2Visual.concat(declParts2Flex)
            var groupHasAttrs = declParts2.length > 0
            // 단일 자식·선언 없음이면 래퍼 생략. 단 Auto Layout(ap-flex)은 변수를 기본값만 써도 DOM은 유지
            var skipGroupWrapper = singleChild && !groupHasAttrs && !isFlex(node)

            if (groupHasAttrs && id && !skipGroupWrapper) {
                pushDeferredStyle(ctx, selInSection(secClass, cssInnerSelForNode(id, opts, false), visWrapFromOpts(opts)), declParts2.join(";"))
            }

            if (skipGroupWrapper) {
                if (declParts2Flex.length > 0) {
                    var childSel = getLeafSelectorForNode(singleChild, opts)
                    if (childSel) pushDeferredStyle(ctx, selInSection(secClass, childSel, visWrapFromOpts(opts)), declParts2Flex.join(";"))
                }
                return renderNodeAsync(singleChild, node, secNo, secClass, depth, opts)
            }

            var isGroupBtn = isBtnNode(node)
            var groupTag = isGroupBtn ? "a" : "div"
            var groupBase = [abs2 ? "ap-abs" : "", isBtnNode(node) ? "ap-btn" : ""].filter(Boolean).join(" ")
            var frameCls = apNodeClassList(groupBase, id, opts)
            var groupTagOpen = "<" + groupTag + (isGroupBtn ? ' href="#"' : "") + ' class="' + frameCls + '">'
            var chunks2 = []
            var j = 0
            function next2() {
                if (j >= children2.length) {
                    var containerHtml = wrapChunksAsUlOrDiv(depth, frameCls, groupTag, groupTagOpen, isGroupBtn, chunks2)
                    return Promise.resolve(isGroupBtn ? containerHtml : wrapIfBtn(node, containerHtml, depth))
                }
                var ch2 = children2[j++]
                if (!ch2 || (!(opts && opts.includeHidden) && !isVisible(ch2))) return next2()
                return renderNodeAsync(ch2, node, secNo, secClass, depth + 1, opts).then(function (html2) {
                    if (html2) chunks2.push(html2)
                    return next2()
                })
            }
            return next2()
        })
    }

    // 개별 노드를 HTML로 렌더링 (abs/flex/text/img 등)
    function renderNodeAsync(node, parent, secNo, secClass, depth, opts) {
        if (!node) return Promise.resolve("")
        if (!(opts && opts.includeHidden) && !isVisible(node)) return Promise.resolve("")

        var id = node.id != null ? String(node.id) : ""
        if (id) ctx.exportedNodeIds[id] = true

        if (node.type === "TEXT") {
            return renderTextNodeAsync(node, parent, secNo, secClass, depth, opts)
        }

        // 레이어 이름이 code-video면 그룹/프레임 여부와 관계없이 비디오 플레이스홀더로 출력
        if (isVideoNode(node)) {
            var videoAbs = isAbsoluteLike(node, parent)
            var videoParentWraps = parent && parent.type === "FRAME" && isContainer(parent)
            var videoNeedWrapper = videoAbs && (!videoParentWraps || (node.type === "FRAME" && isContainer(node)))
            if (videoAbs && id) {
                var videoAbsDecl = buildAbsDecl(node, parent)
                if (videoAbsDecl) pushDeferredStyle(ctx, selInSection(secClass, cssInnerSelForNode(id, opts, false), visWrapFromOpts(opts)), videoAbsDecl)
            } else if (id) {
                var videoSizeDecl = getImageSizeDecl(node)
                if (videoSizeDecl) pushDeferredStyle(ctx, selInSection(secClass, cssInnerSelForNode(id, opts, false), visWrapFromOpts(opts)), videoSizeDecl)
            }
            var videoCls = apNodeClassList("ap-video" + (videoNeedWrapper ? " ap-abs" : ""), id, opts)
            var videoHtml = '<div class="' + videoCls + '"><video src="" controls playsinline muted loop autoplay preload="metadata"></video></div>'
            return Promise.resolve(wrapIfBtn(node, indent(depth) + videoHtml, depth))
        }

        // VECTOR — LINE/line/ELLIPSE는 CSS로 그리기, 나머지는 SVG export (code-raster는 단일 래스터로 아래 분기)
        if (isVectorOnlyTree(node) && !isCodeRasterNode(node)) {
            return renderVectorNodeAsync(node, parent, secNo, secClass, depth, opts)
        }

        // IMAGE (단일 이미지 또는 컴포지트 → 하나의 이미지로 export) — 규칙: shouldExportAsSingleRasterImage
        if (shouldExportAsSingleRasterImage(node)) {
            return renderImageNodeAsync(node, parent, secNo, secClass, depth, opts)
        }

        if (node.type === "FRAME" && isContainer(node)) {
            return renderFrameNodeAsync(node, parent, secNo, secClass, depth, opts)
        }

        // 기타 컨테이너: wrapper로 children 탐색
        if (isContainer(node)) {
            return renderGenericContainerAsync(node, parent, secNo, secClass, depth, opts)
        }

        // leaf 기타 (absolute면 ap-abs + 좌표)
        var absLeaf = isAbsoluteLike(node, parent)
        var leafCls = apNodeClassList("ap-layer" + (absLeaf ? " ap-abs" : ""), id, opts)
        return buildBackgroundDeclAsync(node, false, cache, secNo).then(function (bgDecl) {
            var declParts = []
            if (bgDecl) declParts.push(bgDecl)
            var strokeDeclLeaf = buildStrokeDecl(node)
            if (strokeDeclLeaf) declParts.push(strokeDeclLeaf)
            if (absLeaf) {
                var absDeclLeaf = buildAbsDecl(node, parent)
                if (absDeclLeaf) declParts.push(absDeclLeaf)
            }
            if (declParts.length && id) pushDeferredStyle(ctx, selInSection(secClass, cssInnerSelForNode(id, opts, false), visWrapFromOpts(opts)), declParts.join(";"))
            return wrapIfBtn(node, indent(depth) + '<div class="' + leafCls + '"></div>', depth)
        })
    }

    function renderSectionChildAsync(ch, sectionNode, secNo, secClass, bg, depth, opts) {
        if (!ch || (bg.bgChildId && ch.id === bg.bgChildId)) return Promise.resolve("")
        if (!(opts && opts.includeHidden) && !isVisible(ch)) return Promise.resolve("")
        if (ch.type === "FRAME" && isContainer(ch)) {
            return renderNodeAsync(ch, sectionNode, secNo, secClass, depth, opts)
        }
        var chAbsVirtual = isAbsoluteLike(ch, sectionNode)
        if (!chAbsVirtual && (ch.type === "LINE" || ch.type === "ELLIPSE" || isLineLikeNode(ch))) {
            return renderNodeAsync(ch, sectionNode, secNo, secClass, depth, opts)
        }
        var chAbs = isAbsoluteLike(ch, sectionNode)
        var itemId = ch.id ? String(ch.id) : ""
        if (itemId) ctx.exportedNodeIds[itemId] = true
        var leafSel = getLeafSelectorForNode(ch, opts)
        var isChContainer = isContainer(ch)
        return Promise.all([buildBackgroundDeclAsync(ch, false, cache, secNo, {skipImageFill: isImageCandidate(ch) || isVectorOnlyTree(ch), skipSolidFill: isVectorOnlyTree(ch)}), chAbs ? Promise.resolve(buildAbsDecl(ch, sectionNode) || "") : Promise.resolve("")]).then(function (res) {
            var itemDeclParts = [res[0]].filter(Boolean)
            if (res[1] && !isImageCandidate(ch)) itemDeclParts.push(res[1])
            var strokeDeclVirtual = buildStrokeDecl(ch)
            if (strokeDeclVirtual) itemDeclParts.push(strokeDeclVirtual)
            var fillWidthVirtual = getFillFlexStartWidthDecl(ch, sectionNode)
            var fillVirtPushed = !!(fillWidthVirtual && !nodeHasApSectionImageSemantic(ch.id, opts))
            if (fillVirtPushed) itemDeclParts.push(fillWidthVirtual)
            else if (!chAbs && !nodeHasApSectionImageSemantic(ch.id, opts)) {
                var sameWVirt = getSameWidthAsParentDecl(ch, sectionNode)
                if (sameWVirt) itemDeclParts.push(sameWVirt)
            }
            var itemDecl = itemDeclParts.join(";")
            if (itemDecl && leafSel) pushDeferredStyle(ctx, selInSection(secClass, leafSel, visWrapFromOpts(opts)), itemDecl)
            if (isChContainer) return renderNodeAsync(ch, sectionNode, secNo, secClass, depth, opts)
            return renderNodeAsync(ch, sectionNode, secNo, secClass, depth, opts)
        })
    }

    /**
     * PC+MO 구조 불일치·비슬라이드: visWrap `pc-only` / `mo-only` 로 바깥 div → section (랜드마크는 section 유지).
     * 지연 CSS는 `.pc-only .ap-section--NN …` 자손 선택자(095 @media display 토글과 정합).
     */
    function runSectionPipeline(sectionNode, bg, visWrap, secNo, secClass, slideData, pairedDesktopSection) {
        var slideSectionMeta = null
        var sectionSemantics = buildSectionSemanticClasses(sectionNode, geoStructure, bg.bgChildId)
        promoteRasterTextNodesToImageSemantics(sectionNode, sectionSemantics, allowedFontsForHtml, fontHtmlUnrestricted)
        demoteNestedDuplicateSectionRoles(sectionNode, sectionSemantics)
        disambiguateSectionSemantics(sectionNode, sectionSemantics)
        demoteNestedDuplicateSectionRoles(sectionNode, sectionSemantics)
        disambiguateSectionSemantics(sectionNode, sectionSemantics)
        var collectRopts = {
            includeHidden: true,
            allowedFonts: allowedFontsForHtml,
            fontHtmlUnrestricted: fontHtmlUnrestricted,
            sectionSemantics: sectionSemantics,
        }
        return collectImageFigureNodeIdsForSectionAsync(sectionNode, bg, slideData, cache, secNo, collectRopts)
            .then(function (orderedIds) {
                applyApSectionImageRenderOrderFromIds(sectionSemantics, orderedIds)
                if (visWrap !== "mo-only") {
                    sectionImageRenderOrderIds[secNo - 1] = (orderedIds || []).map(function (id) {
                        return String(id)
                    })
                }
                var pcIdsPair = visWrap === "mo-only" && pairedDesktopSection ? sectionImageRenderOrderIds[secNo - 1] : null
                return precomputeRasterFormatsForSlotsAsync(
                    sectionNode,
                    orderedIds,
                    secNo,
                    cache,
                    visWrap === "mo-only" ? pairedDesktopSection : null,
                    pcIdsPair,
                ).then(function () {
                    return prefetchSectionImageAssetsAsync(
                        sectionNode,
                        orderedIds,
                        cache,
                        secNo,
                        bg,
                        slideData,
                        visWrap === "mo-only" ? pairedDesktopSection : null,
                        pcIdsPair,
                    )
                })
            })
            .then(function () {
                var vw = visWrap || ""
                var sectionRenderOpts = {
                    includeHidden: true,
                    sectionSemantics: sectionSemantics,
                    mobileRoot: mobileRoot || null,
                    visibilityWrapper: vw || undefined,
                }
                var sectionDeclParts = []

                var box = getAbs(sectionNode)
                if (slideData) {
                    var mSecForSlide = mobileRoot ? (getSectionNodes(mobileRoot)[secNo - 1] || null) : null
                    slideSectionMeta = resolveSlideMeta(sectionNode, mSecForSlide, bg.bgChildId, {
                        mobileRoot: mobileRoot || null,
                        secNo: secNo,
                    })
                    sectionDeclParts.push("height:auto;min-height:auto")
                } else {
                    var pcSecH = getPcSectionCanvasHeightDecls(sectionNode, slideData, box)
                    if (pcSecH) {
                        sectionDeclParts.push(pcSecH[0])
                        sectionDeclParts.push(pcSecH[1])
                    }
                }

                if (bg.decl) sectionDeclParts.push(bg.decl)

                if (isFlex(sectionNode)) {
                    var sectionLayoutVars = getLayoutVars(sectionNode)
                    var visibleSecChildren = (sectionNode.children || []).filter(function (c) { return c && isVisible(c) })
                    if (visibleSecChildren.length === 1 && sectionLayoutVars.align === "center") {
                        sectionLayoutVars = Object.assign({}, sectionLayoutVars, { align: "" })
                    }
                    var sectionFlexDecl = buildFlexDecl(sectionLayoutVars, sectionNode)
                    if (sectionFlexDecl) sectionDeclParts.push(sectionFlexDecl)
                }

                if (sectionDeclParts.length) {
                    pushDeferredStyle(ctx, sectionRootSelector(secClass, vw), sectionDeclParts.join(";"))
                }

                if (sectionNode.id != null) ctx.exportedNodeIds[String(sectionNode.id)] = true

                if (vw) contentLines.push('    <div class="' + vw + '">')

                var secClassList =
                    apNodeClassList(
                        "ap-section ap-section--" +
                            secClass +
                            (slideData ? " ap-section--swiper" : ""),
                        String(sectionNode.id),
                        {
                            sectionSemantics: {},
                        },
                    )
                contentLines.push('    <section class="' + secClassList + '">')

                var slideParent = sectionNode
                var slideItems = slideData ? collectSwiperSlideItemNodes(sectionNode, bg.bgChildId) : []
                if (slideData) slideParent = slideData.parent || sectionNode

                function isSlideContainerNodeInSection(child) {
                    if (!slideData || !child) return false

                    // 케이스1) 섹션 자식 중 code-slide 그룹 1개 → slideData.parent가 그 그룹
                    if (slideData.parent && child.id === slideData.parent.id) return true

                    // 케이스2) 섹션 자식 중 code-slide 여러 개 → 자식 레이어명이 code-slide일 수 있음
                    if (isSlideNode(child)) return true

                    // 케이스3) 섹션 자체가 code-slide면 — pass1 자식 순회와는 별도로 slideItems에서 처리
                    return false
                }

                var kids = sectionNode.children || []
                var i = 0

                function pass1NextChild() {
                    if (i >= kids.length) return Promise.resolve()

                    var ch = kids[i++]
                    if (!ch || !isVisible(ch)) return pass1NextChild()
                    if (bg.bgChildId && ch.id === bg.bgChildId) return pass1NextChild()

                    if (isSlideContainerNodeInSection(ch)) return pass1NextChild()

                    if (ch.type === "FRAME" && isContainer(ch)) {
                        return renderNodeAsync(ch, sectionNode, secNo, secClass, 3, sectionRenderOpts).then(function (html) {
                            if (html) contentLines.push(html)
                            return pass1NextChild()
                        })
                    }

                    var chAbsVirtual = isAbsoluteLike(ch, sectionNode)
                    if (!chAbsVirtual && (ch.type === "LINE" || ch.type === "ELLIPSE" || isLineLikeNode(ch))) {
                        return renderNodeAsync(ch, sectionNode, secNo, secClass, 3, sectionRenderOpts).then(function (html) {
                            if (html) contentLines.push(html)
                            return pass1NextChild()
                        })
                    }

                    var secChildDepth = 3
                    return (function () {
                        var chAbs = isAbsoluteLike(ch, sectionNode)
                        var itemId = ch.id ? String(ch.id) : ""
                        if (itemId) ctx.exportedNodeIds[itemId] = true
                        var leafSel = getLeafSelectorForNode(ch, sectionRenderOpts)
                        var isChContainer = isContainer(ch)

                        return Promise.all([
                            buildBackgroundDeclAsync(ch, false, cache, secNo, {skipImageFill: isImageCandidate(ch) || isVectorOnlyTree(ch), skipSolidFill: isVectorOnlyTree(ch)}),
                            (function () {
                                if (!chAbs) return Promise.resolve("")
                                var absDecl = buildAbsDecl(ch, sectionNode)
                                return Promise.resolve(absDecl || "")
                            })(),
                        ]).then(function (res) {
                            var itemDeclParts = [res[0]].filter(Boolean)
                            if (res[1] && !isImageCandidate(ch)) itemDeclParts.push(res[1])
                            var strokeDeclVirtual = buildStrokeDecl(ch)
                            if (strokeDeclVirtual) itemDeclParts.push(strokeDeclVirtual)
                            var fillWidthVirtual = getFillFlexStartWidthDecl(ch, sectionNode)
                            var fillVirtPushed2 = !!(fillWidthVirtual && !nodeHasApSectionImageSemantic(ch.id, sectionRenderOpts))
                            if (fillVirtPushed2) itemDeclParts.push(fillWidthVirtual)
                            else if (!chAbs && !nodeHasApSectionImageSemantic(ch.id, sectionRenderOpts)) {
                                var sameWVirt2 = getSameWidthAsParentDecl(ch, sectionNode)
                                if (sameWVirt2) itemDeclParts.push(sameWVirt2)
                            }
                            var itemDecl = itemDeclParts.join(";")

                            if (itemDecl && leafSel) pushDeferredStyle(ctx, selInSection(secClass, leafSel, visWrapFromOpts(sectionRenderOpts)), itemDecl)

                            if (isChContainer) {
                                return renderNodeAsync(ch, sectionNode, secNo, secClass, secChildDepth, sectionRenderOpts).then(function (inner) {
                                    if (inner) contentLines.push(inner)
                                    return pass1NextChild()
                                })
                            }
                            return renderNodeAsync(ch, sectionNode, secNo, secClass, secChildDepth, sectionRenderOpts).then(function (inner) {
                                if (inner) contentLines.push(inner)
                                return pass1NextChild()
                            })
                        })
                    })()
                }

                function renderSwiperPass2() {
                    if (!slideData) return Promise.resolve()

                    hasSlideSection = true

                    var slideCount = slideItems.length
                    var swiperMeta =
                        slideSectionMeta ||
                        resolveSlideMeta(sectionNode, mobileRoot ? (getSectionNodes(mobileRoot)[secNo - 1] || null) : null, bg.bgChildId, {
                            mobileRoot: mobileRoot || null,
                            secNo: secNo,
                        })
                    var pcSlidesPerView = swiperMeta.pcSlidesPerView
                    var moSlidesPerView = swiperMeta.moSlidesPerView

                    contentLines.push(
                        '      <div class="swiper" data-slide-view="' +
                            escapeHtml(String(pcSlidesPerView)) +
                            '" data-slide-view-mo="' +
                            escapeHtml(String(moSlidesPerView)) +
                            '">',
                    )
                    contentLines.push('        <div class="swiper-wrapper">')

                    function renderSlide(idx) {
                        if (idx >= slideCount) {
                            contentLines.push("        </div>")
                            contentLines.push('        <div class="swiper-pagination"></div>')
                            contentLines.push('        <div class="swiper-button-prev"></div>')
                            contentLines.push('        <div class="swiper-button-next"></div>')
                            contentLines.push("      </div>")
                            return Promise.resolve()
                        }

                        var ch = slideItems[idx]
                        contentLines.push('          <div class="swiper-slide">')

                        if (!ch) {
                            contentLines.push("          </div>")
                            return renderSlide(idx + 1)
                        }

                        return renderSectionChildAsync(ch, slideParent, secNo, secClass, bg, 6, Object.assign({}, sectionRenderOpts, { insideSwiperSlide: true })).then(function (html) {
                            if (html) contentLines.push(html)
                            contentLines.push("          </div>")
                            return renderSlide(idx + 1)
                        })
                    }

                    return renderSlide(0)
                }

                return pass1NextChild()
                    .then(renderSwiperPass2)
                    .then(function () {
                        contentLines.push("    </section>")
                        if (vw) contentLines.push("    </div>")
                        contentLines.push("")
                    })
            })
    }

    function nextSection() {
        if (sectionIndex >= sectionList.length) return Promise.resolve()

        var sectionNode = sectionList[sectionIndex]
        var secNo = sectionIndex + 1
        var secClass = sectionClassPrefix(secNo)
        sectionIndex++

        if (!sectionNode || !isVisible(sectionNode)) return nextSection()

        return buildSectionBackgroundAsync(sectionNode, cache, secNo).then(function (bg) {
            var slideData = getSlideItems(sectionNode)
            var isStructMismatch = !!(mobileRoot && !slideData && mismatchSet[secClass])

            if (!isStructMismatch) {
                return runSectionPipeline(sectionNode, bg, null, secNo, secClass, slideData).then(function () {
                    return nextSection()
                })
            }

            return runSectionPipeline(sectionNode, bg, "pc-only", secNo, secClass, slideData).then(function () {
                var mNode = getSectionNodes(mobileRoot)[secNo - 1] || null
                if (!mNode) {
                    contentLines.push('    <div class="mo-only">')
                    var emptySecClass = apNodeClassList("ap-section ap-section--" + secClass, "", { sectionSemantics: {} })
                    contentLines.push('    <section class="' + emptySecClass + '">')
                    contentLines.push('    </section>')
                    contentLines.push('    </div>')
                    contentLines.push('')
                    return nextSection()
                }

                var prevSuffix = cache.imageSuffix
                var prevImgCount = cache.imgCountBySec ? cache.imgCountBySec[secNo] : undefined
                cache.imageSuffix = "_mo"
                if (!cache.imgCountBySec) cache.imgCountBySec = {}
                cache.imgCountBySec[secNo] = 0

                return buildSectionBackgroundAsync(mNode, cache, secNo).then(function (mBg) {
                    var moSlideData = getSlideItems(mNode)
                    return runSectionPipeline(mNode, mBg, "mo-only", secNo, secClass, moSlideData, sectionNode)
                }).then(function () {
                    cache.imageSuffix = prevSuffix
                    if (prevImgCount === undefined) delete cache.imgCountBySec[secNo]
                    else cache.imgCountBySec[secNo] = prevImgCount
                    return nextSection()
                })
            })
        })
    }

    return nextSection().then(function () {
        if (deferredStyles.length) {
            codeLines.push("")
            var consolidatedStyles = consolidateDeferredStylesByIdenticalDecl(deferredStyles)
            var canon = canonicalizeMergedRulesToSingleRepresentativeClass(consolidatedStyles)
            consolidatedStyles = canon.rules || consolidatedStyles
            if (canon.renames && canon.renames.length) {
                applySectionScopedClassRenames(contentLines, canon.renames)
            }
            var usedApSecBem = buildUsedApSectionClassBySectionFromRules(consolidatedStyles)
            stripUnusedApSectionBemFromContentLines(contentLines, usedApSecBem)
            for (var i = 0; i < consolidatedStyles.length; i++) {
                var r = consolidatedStyles[i]
                var d = dedupeCssDecl(r && r.decl ? String(r.decl) : "")
                if (!d) continue
                codeLines.push(r.sel + " { " + d + " }")
            }
            codeLines.push("")
        }
        codeLines.push("</style>")
        codeLines.push("")

        for (var k = 0; k < contentLines.length; k++) codeLines.push(contentLines[k])
        codeLines.push("  </div>")
        codeLines.push("</article>")

        var code = compressEmbeddedStyleTagsInHtml(codeLines.join("\n").replace(/\u2028/g, "\n").replace(/\u2029/g, "\n"))
        if (hasSlideSection) {
            var swiperInitScript =
                '<script>\n' +
                'document.addEventListener("DOMContentLoaded", function () {\n' +
                '  document.querySelectorAll(".swiper").forEach(function (el) {\n' +
                '    if (typeof Swiper === "undefined") return;\n' +
                '\n' +
                '    var pcView = parseFloat(el.getAttribute("data-slide-view") || "1");\n' +
                '    var moView = parseFloat(el.getAttribute("data-slide-view-mo") || "1");\n' +
                '\n' +
                '    if (!isFinite(pcView) || pcView <= 0) pcView = 1;\n' +
                '    if (!isFinite(moView) || moView <= 0) moView = 1;\n' +
                '\n' +
                '    new Swiper(el, {\n' +
                '      slidesPerView: moView,\n' +
                '      watchOverflow: true,\n' +
                '      pagination: {\n' +
                '        el: el.querySelector(".swiper-pagination"),\n' +
                '        clickable: true\n' +
                '      },\n' +
                '      navigation: {\n' +
                '        nextEl: el.querySelector(".swiper-button-next"),\n' +
                '        prevEl: el.querySelector(".swiper-button-prev")\n' +
                '      },\n' +
                '      breakpoints: {\n' +
                '        768: {\n' +
                '          slidesPerView: pcView\n' +
                '        }\n' +
                '      }\n' +
                '    });\n' +
                '  });\n' +
                '});\n' +
                '<\/script>'
            code = code + "\n" + swiperInitScript
        }

        return {
            code: code,
            exportedNodeIds: exportedNodeIds,
            ownImageNodeIds: ownImageNodeIds,
            sectionImageRenderOrderIds: sectionImageRenderOrderIds,
        }
    })
}

