/**
 * 097-dump-tree-async
 *
 * 이름의 dump는 「인스펙트용 트리 텍스트」 산출 형식을 뜻함. 개발 전용 디버그가 아니라
 * 분석/ZIP 경로에서 호출되는 제품 파이프라인의 한 축(비동기 트리 워크 + buildCodeAsync 연계).
 *
 * dumpTreeAsync — ROOT 기준 레이어 인스펙트 트리 텍스트(dataTree) 생성, buildCodeAsync 호출로 code·이미지·폰트 목록 반환.
 *   내부 walkAsync 등으로 섹션별 덤프, phase(desktop/mobile)에 따라 캐시·export 폭 처리.
 */
function dumpTreeAsync(root, projectName, allowedFonts, options) {
    options = options || {}
    var prevExportWidth = _currentExportWidth
    if (options.exportWidth != null) _currentExportWidth = Math.max(200, Number(options.exportWidth))

    var cache = {
        projectName: normalizeProjectName(projectName),
        allowedFonts: Array.isArray(allowedFonts)
            ? allowedFonts
                  .map(function (f) {
                      return normalizeFontFamilyForMatch(f)
                  })
                  .filter(Boolean)
            : [],
        imageSuffix: options.imageSuffix != null ? String(options.imageSuffix) : "",
        /** 이전에 분석해 폰트 UI가 있음 → 빈 allowedFonts = 체크 전부 해제 = 텍스트도 전부 이미지 */
        fontHtmlFilterActive: options.fontHtmlFilterActive === true,
        usedFonts: {},
        text: {},
        textMeta: {},
        image: {},
        imageName: {},
        imageList: [],
        imgCountBySec: {},
    }
    if (options.mobileRoot && options.phase === "desktop") {
        cache.responsiveTextInnerByNodeId = buildResponsiveTextInnerByNodeIdMap(root, options.mobileRoot)
    }

    var rootBox = getAbs(root)
    var rootSummary = ["", "  ─── LAYER INSPECT ───", "  ROOT    " + oneLineBase(root)]
    if (rootBox) rootSummary.push("  " + dumpPadKey("ROOT_BOX") + "x=" + rootBox.x + " y=" + rootBox.y + " w=" + rootBox.w + " h=" + rootBox.h)
    rootSummary.push("")

    var sectionNodes = getSectionNodes(root)
    if (!sectionNodes || sectionNodes.length === 0) {
        return Promise.reject(new Error("보이는 섹션이 없습니다. ROOT 프레임의 직계 자식 레이어가 최소 1개 보이도록 선택했는지 확인하세요."))
    }
    var sections = []

    function walkAsync(node, depth, isRootChild, sectionIndex, sectionNode, path) {
        if (!isVisible(node)) return Promise.resolve(null)
        path = path || []
        var label = indent(depth) + "• " + oneLineBase(node)
        if (isRootChild && sectionIndex != null) label += '  → <section class="ap-section ap-section--' + sectionClassPrefix(sectionIndex) + '">'

        var props = []
        var box = getAbs(node)

        if (sectionNode) {
            var sectionBox = getAbs(sectionNode)
            if (sectionBox && box) {
                var relX = r2(box.x - sectionBox.x)
                var relY = r2(box.y - sectionBox.y)
                props.push(indent(depth + 1) + dumpPadKey("sectionRelative") + "x=" + relX + ", y=" + relY + ", w=" + box.w + ", h=" + box.h)
            }
        }

        var fd = flexDetails(node)
        if (fd) props.push(indent(depth + 1) + dumpPadKey("flex") + fd)

        var lcd = layoutChildDetails(node)
        if (lcd) props.push(indent(depth + 1) + dumpPadKey("layoutChild") + lcd)

        var bg = bgDetails(node)
        if (bg) props.push(indent(depth + 1) + dumpPadKey("bg") + bg)

        if ("layoutPositioning" in node && node.layoutPositioning === "ABSOLUTE") {
            var px = typeof node.x === "number" ? r2(node.x) : ""
            var py = typeof node.y === "number" ? r2(node.y) : ""
            if (px !== "" || py !== "") props.push(indent(depth + 1) + dumpPadKey("position") + "x=" + px + ", y=" + py)
        }

        function addChildren(extra) {
            return walkChildrenAsync(node, depth, sectionNode, sectionIndex, path).then(function (children) {
                var out = {label: label, props: props, children: children, path: path}
                if (extra && typeof extra === "object") {
                    for (var key in extra) {
                        if (Object.prototype.hasOwnProperty.call(extra, key)) out[key] = extra[key]
                    }
                }
                return out
            })
        }

        if (node.type === "TEXT") {
            return getTextSummaryAsync(node).then(function (ts) {
                if (node.id != null) {
                    cache.text[node.id] = ts.text != null ? String(ts.text) : ""
                    cache.textMeta[node.id] = ts
                }
                ;(ts.fontFamilies || (ts.fontFamily ? [ts.fontFamily] : [])).forEach(function (f) {
                    if (f) cache.usedFonts[usedFontListLabel(f)] = true
                })
                var textDisplay = ts.text.indexOf("\n") >= 0 || ts.text.length > 60 ? ts.textShort : ts.text
                props.push(indent(depth + 1) + dumpPadKey("text") + '"' + textDisplay + '"')
                var box = getAbs(node)
                if (box) {
                    ts.sizeW = r2(box.w)
                    ts.sizeH = r2(box.h)
                }
                return addChildren({textMeta: ts})
            })
        }

        if (hasImageFill(node)) {
            var isSection = isRootChild && sectionIndex != null
            if (isSection) {
                props.push(indent(depth + 1) + dumpPadKey("bgImage") + "(section, 코드 생성 시 fill만 사용)")
                return addChildren()
            }
            var exportPromise = exportImagePreferSourceBytesAsync(node)
            return exportPromise.then(function (dataUrl) {
                if (node.id != null && dataUrl) cache.image[node.id] = dataUrl
                /** assets 경로·imgNN(083), BEM 이미지 접미사(렌더 순서)는 buildCodeAsync */
                props.push(indent(depth + 1) + dumpPadKey("bgImage") + "(HTML 생성 시 assets 경로)")
                return addChildren()
            })
        }

        if (isVectorOnlyTree(node) && node.id != null) {
            var vecLabel = isLineLikeNode(node) ? "(ap-line, CSS)" : node.type === "ELLIPSE" ? "(ap-ellipse, CSS)" : "(ap-image, SVG)"
            props.push(indent(depth + 1) + dumpPadKey("vector") + vecLabel)
            return addChildren()
        }

        return addChildren()
    }

    function walkChildrenAsync(node, depth, sectionNode, sectionIndex, path) {
        if (!isContainer(node)) return Promise.resolve([])
        path = path || []
        var list = (node.children || []).filter(function (c) {
            return c && isVisible(c)
        })
        var results = []
        var i = 0
        function next() {
            if (i >= list.length) return Promise.resolve(results)
            var child = list[i]
            var childPath = path.concat([i])
            i++
            return walkAsync(child, depth + 1, false, sectionIndex != null ? sectionIndex : null, sectionNode, childPath)
                .then(function (treeNode) {
                    if (treeNode) results.push(treeNode)
                    return next()
                })
                .catch(function (err) {
                    results.push({label: indent(depth + 1) + dumpPadKey("SKIP") + (child.name || "?") + " — " + String(err), props: [], children: [], path: childPath})
                    return next()
                })
        }
        return next()
    }

    var totalSections = sectionNodes.length
    var phase = options.phase || "desktop"
    if (totalSections > 0) {
        figma.ui.postMessage({type: "PROGRESS", phase: phase, current: 0, total: totalSections})
    }

    function runSectionsSequential(index) {
        if (index >= sectionNodes.length) return Promise.resolve()
        var node = sectionNodes[index]
        if (!node) return runSectionsSequential(index + 1)
        if (!isVisible(node)) return runSectionsSequential(index + 1)
        var sectionNumber = index + 1
        return walkAsync(node, 0, true, sectionNumber, node, [sectionNumber])
            .then(function (treeNode) {
                if (treeNode) sections.push({title: "Section " + sectionClassPrefix(sectionNumber), node: treeNode})
                figma.ui.postMessage({type: "PROGRESS", phase: phase, current: sections.length, total: totalSections})
            })
            .then(function () {
                return new Promise(function (r) {
                    setTimeout(r, 0)
                })
            })
            .then(function () {
                return runSectionsSequential(index + 1)
            })
    }

    var legend = ["", "  ─── LEGEND ───", "  ROOT = 선택 1개 | 직계 자식(보이는 레이어) 각각 = ap-section (ap-section--01..)", "  " + dumpPadKey("flex") + "AutoLayout 정보", "  " + dumpPadKey("layoutChild") + "width/height(fill|auto|Npx), align-self, flex-grow", "  " + dumpPadKey("bg") + "배경: image, color:#hex, border (둘 다 있으면 둘 다 표기, export는 image 우선)", "  " + dumpPadKey("bgImage") + "image일 때 내보낸 이미지 경로 (assets/images/...)", "  " + dumpPadKey("sectionRelative") + "해당 ap-section 기준 상대 좌표 (x,y,w,h)", ""]

    function flattenNode(n) {
        return [n.label].concat(n.props).concat(
            (n.children || []).reduce(function (acc, ch) {
                return acc.concat(flattenNode(ch))
            }, []),
        )
    }
    function flattenTree(dataTree) {
        var out = dataTree.rootSummary.slice()
        dataTree.sections.forEach(function (sec) {
            out.push("")
            out.push("  ═══ " + sec.title + " ═══")
            out.push("")
            out.push.apply(out, flattenNode(sec.node))
        })
        out.push("")
        out.push.apply(out, dataTree.legend)
        return out.join("\n")
    }

    return runSectionsSequential(0)
        .then(function () {
            var dataTree = {rootSummary: rootSummary, sections: sections, legend: legend}
            var text = flattenTree(dataTree)
            return buildCodeAsync(root, cache, sectionNodes, options.geoStructure || null, options.mobileRoot || null).then(function (result) {
                var code = result && result.code != null ? result.code : typeof result === "string" ? result : ""
                var exportedNodeIds = result && result.exportedNodeIds ? result.exportedNodeIds : {}
                var ownImageNodeIds = result && result.ownImageNodeIds ? result.ownImageNodeIds : {}
                var usedFonts = Object.keys(cache.usedFonts || {})
                    .filter(Boolean)
                    .sort()
                _currentExportWidth = prevExportWidth
                return {text: text, dataTree: dataTree, code: code, exportedNodeIds: exportedNodeIds, ownImageNodeIds: ownImageNodeIds, images: cache.imageList || [], vectorTypes: VECTOR_TYPES, usedFonts: usedFonts}
            })
        })
        .catch(function (err) {
            _currentExportWidth = prevExportWidth
            throw err
        })
}
