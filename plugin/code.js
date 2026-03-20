// code.js — Figma → HTML/CMS Export Plugin
figma.showUI(__html__, {width: 900, height: 1000})

/** 참고: ui.html AI 검수는 비전(썸네일) 기본 사용. 이미지 바이너리는 PC/MO 분석 완료 후 RESULT_IMAGES_* 로 UI에 전달됨(ZIP만으로는 코드 탭에 붙여 넣은 경우 미전달). */
var AP_AI_DEFAULT_ALT_VISION = true
setTimeout(function () {
    try {
        figma.ui.postMessage({type: "AI_UI_DEFAULTS", aiVisionAlt: AP_AI_DEFAULT_ALT_VISION})
    } catch (e) {}
}, 0)

/** UI onmessage → 분석/매칭 → buildCodeAsync → export. 섹션은 // ----- 주석으로 구분. (분할은 빌드 번들 필요) */

// ----- Utils (포맷, escape, 노드 판별) -----
/** 숫자를 소수 둘째 자리까지 반올림 */
function r2(v) {
    return Math.round(v * 100) / 100
}
/** 1~9를 "01", "02" 형태 2자리 문자열로 */
function pad2(n) {
    n = Number(n) || 0
    return (n < 10 ? "0" : "") + String(n)
}
/** 섹션 인덱스 → CSS 클래스 접두어 (1 → "01") */
function sectionClassPrefix(oneBasedIndex) {
    var n = Math.max(1, Math.floor(oneBasedIndex))
    return (n < 10 ? "0" : "") + n
}
/** ap-ai-audit 주석 블록 — ZIP 등 산출물에 포함하지 않음 */
function stripApAiAuditBlock(html) {
    return String(html || "").replace(
        /<!--\s*ap-ai-audit:start\s*-->[\s\S]*?<!--\s*ap-ai-audit:end\s*-->\s*/gi,
        ""
    )
}

/** 모든 토큰에 ap- 강제 (소문자·하이픈) */
function makeClassName(name) {
    name = String(name || "").trim().toLowerCase()
    name = name.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    if (!name) name = "node"
    if (name.indexOf("ap-") !== 0) name = "ap-" + name
    return name
}
/** CSS/HTML 공통: 노드별 유일 클래스 (data-node-id 셀렉터 대체) */
function nodeUniqueClass(id) {
    if (id == null || String(id) === "") return makeClassName("anon")
    var slug = String(id)
        .replace(/:/g, "-")
        .replace(/[^a-z0-9-]/gi, "-")
        .replace(/^-+|-+$/g, "")
    if (!slug) slug = "x"
    return makeClassName("n-" + slug)
}
/** BEM 요소: ap-section__title, ap-section__content */
function apSectionBem(part) {
    var p = String(part || "item")
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .replace(/^-+|-+$/g, "") || "item"
    return "ap-section__" + p
}
/** 레이어 이름이 지정 문자열과 일치하는지 (대소문자 무관, trim) */
function isNodeName(node, name) {
    return !!(node && String(node.name || "").trim().toLowerCase() === name)
}
/** 레이어 이름이 btn이면 링크로 감쌀지 여부 (대소문자 무관: btn, Btn, BTN 등) */
function isBtnNode(node) {
    return isNodeName(node, "btn")
}
/** 레이어 이름이 video이면 비디오 영역 플레이스홀더 (대소문자 무관: video, Video, VIDEO 등) */
function isVideoNode(node) {
    return isNodeName(node, "video")
}
/** 레이어 이름이 slide이면 Swiper 구조로 감쌈 */
function isSlideNode(node) {
    return isNodeName(node, "slide")
}
/** 섹션에서 swiper-slide 대상 노드들 반환. null이면 슬라이드 모드 아님.
 * - 섹션 자식 중 slide 1개(그룹) → 그 그룹의 자식들이 각각 swiper-slide
 * - 섹션 자식 중 slide 여러 개 → 각각 swiper-slide
 * - 섹션 자체가 slide이면 → 섹션의 자식들이 각각 swiper-slide */
function getSlideItems(sectionNode) {
    if (!sectionNode) return null
    var children = sectionNode.children || []
    var slideNamed = []
    for (var i = 0; i < children.length; i++) {
        if (children[i] && isSlideNode(children[i])) slideNamed.push(children[i])
    }
    if (slideNamed.length === 1 && slideNamed[0].children && slideNamed[0].children.length > 0) {
        return {items: slideNamed[0].children, parent: slideNamed[0]}
    }
    if (slideNamed.length > 0) return {items: slideNamed, parent: sectionNode}
    if (isSlideNode(sectionNode)) return {items: children, parent: sectionNode}
    return null
}
/** LINE 노드 또는 레이어명 "line"인 벡터 → ap-line 처리 */
function isLineLikeNode(node) {
    if (!node) return false
    if (node.type === "LINE") return true
    if (isVectorOnlyTree(node) && isNodeName(node, "line")) return true
    return false
}

// ----- HTML/CSS Builder (LINE, ELLIPSE, 텍스트, 레이아웃 변수 등) -----
/** LINE/line 벡터 → CSS 변수 선언 (deferred style) */
function buildLineVarsDecl(node) {
    if (!node || !isLineLikeNode(node)) return ""
    var stroke = getFirstSolidStroke(node)
    var color = stroke && stroke.color ? stroke.color : "#000"
    var weight = stroke && stroke.weight > 0 ? stroke.weight : typeof node.strokeWeight === "number" ? node.strokeWeight : 1
    var len, rot
    if (node.type === "LINE") {
        len = typeof node.width === "number" ? node.width : 100
        rot = typeof node.rotation === "number" ? r2(node.rotation) : 0
    } else {
        var box = getAbs(node)
        if (!box || box.w == null) return ""
        len = Math.max(box.w, box.h != null ? box.h : 0) || 100
        rot = typeof node.rotation === "number" ? r2(node.rotation) : 0
        weight = weight > 0 ? weight : box.h != null && box.h > 0 ? box.h : 1
    }
    var parts = []
    parts.push("--ap-line-w:" + r2(len))
    parts.push("--ap-line-h:" + r2(weight))
    parts.push("--ap-line-color:" + color)
    parts.push("--ap-line-rot:" + rot)
    return parts.join(";")
}
/** PC/MO LINE diff */
function buildLineVarsDeclDiff(dNode, mNode) {
    if (!isLineLikeNode(dNode) || !isLineLikeNode(mNode)) return ""
    var mDecl = buildLineVarsDecl(mNode)
    var dDecl = buildLineVarsDecl(dNode)
    if (dDecl === mDecl) return ""
    return mDecl
}

/** ELLIPSE 노드 → CSS 변수 선언 (deferred style용) */
function buildEllipseVarsDecl(node) {
    if (!node || node.type !== "ELLIPSE") return ""
    var box = getAbs(node)
    if (!box || box.w == null || box.h == null) return ""
    var fill = getFirstSolidFill(node)
    var stroke = getFirstSolidStroke(node)
    var parts = []
    parts.push("--ap-ellipse-w:" + r2(box.w))
    parts.push("--ap-ellipse-h:" + r2(box.h))
    parts.push("--ap-ellipse-bgc:" + (fill && fill.color ? fill.color : "transparent"))
    parts.push("--ap-ellipse-bd:" + (stroke && stroke.weight > 0 ? r2(stroke.weight) : "0"))
    parts.push("--ap-ellipse-bdc:" + (stroke && stroke.color ? stroke.color : "transparent"))
    return parts.join(";")
}
/** PC/MO ELLIPSE diff */
function buildEllipseVarsDeclDiff(dNode, mNode) {
    if (!dNode || dNode.type !== "ELLIPSE" || !mNode || mNode.type !== "ELLIPSE") return ""
    var mDecl = buildEllipseVarsDecl(mNode)
    var dDecl = buildEllipseVarsDecl(dNode)
    if (dDecl === mDecl) return ""
    return mDecl
}

/** btn 노드면 <a href="#">로 감싸기. TEXT 노드는 별도로 <a class="ap-text">로 출력하므로 여기서는 비텍스트만 감쌈 */
function wrapIfBtn(node, html, depth) {
    if (!html || !isBtnNode(node)) return html
    return indent(depth) + '<a href="#">' + "\n" + html + "\n" + indent(depth) + "</a>"
}

/** TEXT 노드용 태그: btn이면 <a href="#" class="ap-text">, 아니면 <span class="ap-text">. parentStyle 있으면 open에 style 속성 추가 */
function textNodeTag(node, textCls, dataIdAttr, depth, parentStyle) {
    var styleAttr = (parentStyle && String(parentStyle).trim()) ? ' style="' + String(parentStyle).trim() + '"' : ""
    var open = isBtnNode(node)
        ? '<a href="#" class="' + textCls + '"' + dataIdAttr + styleAttr + ">"
        : '<span class="' + textCls + '"' + dataIdAttr + styleAttr + ">"
    var close = isBtnNode(node) ? "</a>" : "</span>"
    return { open: open, close: close }
}

/** img alt 텍스트: 이미지 노드의 name 사용 */
function getImageAltText(node) {
    if (!node) return ""
    var name = String(node.name || "").trim()
    if (!name) return ""
    return escapeHtml(name.length > 125 ? name.slice(0, 125) : name)
}

/** HTML 이스케이프. U+2028/U+2029 → \\n 정규화 */
function escapeHtml(s) {
    if (s == null) return ""
    var t = String(s).replace(/\u2028/g, "\n").replace(/\u2029/g, "\n")
    return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}
/** 텍스트를 HTML로 변환. 개행(\n) 및 LS/PS(U+2028/U+2029)는 <br>로 출력 */
function textToHtmlWithBreaks(s) {
    if (s == null) return ""
    var t = String(s).replace(/\u2028/g, "\n").replace(/\u2029/g, "\n")
    return t.split(/\r?\n/).map(escapeHtml).join("<br>")
}
/** mixed 텍스트: parts 있으면 ap-text__part span으로 출력 (--ap-fs, --ap-fw, --ap-clr, --ap-ls 로 부모 변수 오버라이드). 모든 part가 동일한 값이면 부모 style로만 출력 */
function buildTextPartInnerHtml(ts) {
    if (!ts) return ""
    var parts = ts.parts
    var text = ts.text || ""
    if (!parts || parts.length === 0) return textToHtmlWithBreaks(text)
    var baseClr = (ts.clr || "").toLowerCase()
    var baseFs = ts.fs !== "" ? Number(ts.fs) || 0 : 0
    var baseFw = ts.fw !== "" ? Number(ts.fw) || 400 : 400
    var baseLsEm = ts.ls !== "" ? Number(ts.ls) || 0 : 0
    var partLs = [], partFw = [], partClr = [], partFs = []
    for (var i = 0; i < parts.length; i++) {
        var p = parts[i]
        if (Math.abs((p.ls || 0) - baseLsEm) >= 0.001) partLs.push("--ap-ls:" + (Number(p.ls) || 0).toFixed(3) + "em")
        else partLs.push(null)
        if (p.fw != null && p.fw !== baseFw) partFw.push("--ap-fw:" + Number(p.fw))
        else partFw.push(null)
        if (p.clr && (p.clr !== baseClr)) partClr.push("--ap-clr:" + p.clr)
        else partClr.push(null)
        if (p.fs != null && p.fs > 0 && (!baseFs || Math.abs(p.fs - baseFs) >= 1)) partFs.push("--ap-fs:" + Math.round(p.fs))
        else partFs.push(null)
    }
    function allSame(arr) {
        var first = null
        for (var j = 0; j < arr.length; j++) {
            if (arr[j] == null) return null
            if (first === null) first = arr[j]
            else if (arr[j] !== first) return null
        }
        return first
    }
    var commonLs = allSame(partLs)
    var commonFw = allSame(partFw)
    var commonClr = allSame(partClr)
    var commonFs = allSame(partFs)
    var parentVars = [commonLs, commonFw, commonClr, commonFs].filter(Boolean)
    var parentStyle = parentVars.length ? parentVars.join(";") : ""
    var out = ""
    var pos = 0
    for (var i = 0; i < parts.length; i++) {
        var p = parts[i]
        var from = Math.max(0, Math.min(text.length, Number(p.start) || 0))
        var to = Math.max(0, Math.min(text.length, Number(p.end) || 0))
        if (to <= from) continue
        if (from < pos) from = pos
        if (to <= from) continue
        if (from > pos) out += textToHtmlWithBreaks(text.substring(pos, from))
        var chunk = p.characters || text.substring(from, to)
        var escaped = textToHtmlWithBreaks(chunk)
        var vars = []
        if (partClr[i] != null && partClr[i] !== commonClr) vars.push(partClr[i])
        if (partFs[i] != null && partFs[i] !== commonFs) vars.push(partFs[i])
        if (partFw[i] != null && partFw[i] !== commonFw) vars.push(partFw[i])
        if (partLs[i] != null && partLs[i] !== commonLs) vars.push(partLs[i])
        var leadingBr = ""
        if (vars.length > 0) {
            var brMatch = escaped.match(/^(\s*<br\s*\/?>\s*)+/i)
            if (brMatch) {
                leadingBr = brMatch[0]
                escaped = escaped.slice(brMatch[0].length)
            }
        }
        if (vars.length > 0) {
            out += leadingBr + '<span class="ap-text__part" style="' + vars.join(";") + '">' + escaped + "</span>"
        } else {
            out += (leadingBr ? leadingBr : "") + escaped
        }
        pos = to
    }
    if (pos < text.length) out += textToHtmlWithBreaks(text.substring(pos))
    return parentStyle ? { inner: out, parentStyle: parentStyle } : out
}
/** Figma textAlignHorizontal → CSS text-align 값 */
function normTextAlign(a) {
    a = String(a || "").toUpperCase()
    if (a === "LEFT") return "left"
    if (a === "RIGHT") return "right"
    if (a === "CENTER") return "center"
    if (a === "JUSTIFIED") return "justify"
    return "left"
}
/** 문자열에서 줄바꿈 위치(indices)와 줄 배열 반환 */
function getLineBreakPoints(str) {
    if (str == null) str = ""
    var s = String(str)
    var indices = []
    var i = 0
    while (i < s.length) {
        var n = s.indexOf("\n", i)
        if (n === -1) break
        indices.push(n)
        i = n + 1
    }
    var lines = s.split(/\r?\n/)
    return {indices: indices, lines: lines}
}
/** depth만큼 공백 2칸 들여쓰기 문자열 */
function indent(depth) {
    var s = ""
    for (var i = 0; i < depth; i++) s += "  "
    return s
}

/** 자식 chunk HTML을 프레임 태그로 감쌈 */
function wrapChunksAsUlOrDiv(depth, cls, frameTag, frameTagOpen, isFrameBtn, chunks) {
    var out = []
    out.push(indent(depth) + frameTagOpen)
    for (var cj = 0; cj < (chunks || []).length; cj++) {
        if (chunks[cj]) out.push(chunks[cj])
    }
    out.push(indent(depth) + "</" + frameTag + ">")
    return out.join("\n")
}

/** 노드 absoluteBoundingBox → {x,y,w,h} (r2 적용) */
function getAbs(node) {
    try {
        var b = node.absoluteBoundingBox
        if (!b) return null
        return {x: r2(b.x), y: r2(b.y), w: r2(b.width), h: r2(b.height)}
    } catch (e) {
        return null
    }
}

/** 자식이 있는 노드(컨테이너) 여부 */
function isContainer(node) {
    return !!(node && "children" in node && node.children && node.children.length)
}
/** 노드가 보이는 상태(visible !== false)인지 */
function isVisible(node) {
    return node != null && node.visible !== false
}
/** 보이는 자식이 하나라도 있는지 (이미지 fill 클론 export 등) */
function hasVisibleChildren(node) {
    return !!(node && node.children && node.children.some(function (c) { return c && isVisible(c) }))
}
/** Auto Layout이 켜진 노드 여부 */
function isFlex(node) {
    try {
        return "layoutMode" in node && node.layoutMode && node.layoutMode !== "NONE"
    } catch (e) {
        return false
    }
}
/** Flex 부모 안에서 자식이 Absolute로 배치된 경우인지 */
function isAbsoluteInParent(child, parent) {
    try {
        if (!parent || !child) return false
        if (!isFlex(parent)) return false
        if (isAbsolutePositioned(child)) return true
    } catch (e) {}
    return false
}

/** Figma Absolute positioning 여부 */
function isAbsolutePositioned(node) {
    try {
        if (!node || !("layoutPositioning" in node)) return false
        var v = node.layoutPositioning
        if (v === undefined || v === null) return true
        return String(v).toUpperCase() !== "AUTO"
    } catch (e) {
        return false
    }
}

/** 부모가 flex가 아니면 자식은 모두 x,y 기준 배치 → absolute로 처리 */
function isAbsoluteByParentNotFlex(node, parent) {
    try {
        return !!(parent && !isFlex(parent) && node)
    } catch (e) {
        return false
    }
}

/** 절대 위치 계열 판별 (in-parent / self absolute / parent not flex) 통합 */
function isAbsoluteLike(node, parent) {
    return isAbsoluteInParent(node, parent) || isAbsolutePositioned(node) || isAbsoluteByParentNotFlex(node, parent)
}

/** Auto Layout 설정을 CSS 변수용 객체로 추출. isFlex(node)일 때만 값 채움 */
function getLayoutVars(node) {
    var out = {direction: "", gap: "", pt: "", pr: "", pb: "", pl: "", justify: "", align: "", wrap: ""}
    if (!node || !isFlex(node)) return out
    try {
        var mode = node.layoutMode
        if (mode === "VERTICAL") out.direction = "column"
        else out.direction = "row"

        var primary = String(node.primaryAxisAlignItems || "").toUpperCase()
        var gap = Number(node.itemSpacing) || 0
        out.gap = primary === "SPACE_BETWEEN" ? "0" : r2(gap)

        out.pt = r2(Number(node.paddingTop) || 0)
        out.pr = r2(Number(node.paddingRight) || 0)
        out.pb = r2(Number(node.paddingBottom) || 0)
        out.pl = r2(Number(node.paddingLeft) || 0)

        if (primary === "MIN") out.justify = "flex-start"
        else if (primary === "MAX") out.justify = "flex-end"
        else if (primary === "CENTER") out.justify = "center"
        else if (primary === "SPACE_BETWEEN") out.justify = "space-between"
        else out.justify = "flex-start"

        var counter = String(node.counterAxisAlignItems || "").toUpperCase()
        if (counter === "MIN") out.align = "flex-start"
        else if (counter === "MAX") out.align = "flex-end"
        else if (counter === "CENTER") out.align = "center"
        else if (counter === "BASELINE") out.align = "baseline"
        else out.align = "center"

        out.wrap = node.layoutWrap === "WRAP" ? "wrap" : "nowrap"

        // 고정 크기 + 양축 center + 패딩 있음 → 시각 요소 없는 순수 레이아웃일 때만 패딩 제거 (배지/카드는 stroke·fill로 패딩 유지)
        var fixedW = node.layoutSizingHorizontal === "FIXED" || (typeof node.width === "number" && node.width > 0)
        var fixedH = node.layoutSizingVertical === "FIXED" || (typeof node.height === "number" && node.height > 0)
        var allCenter = out.justify === "center" && out.align === "center"
        var hasPadding = (Number(out.pt) || 0) > 0 || (Number(out.pr) || 0) > 0 || (Number(out.pb) || 0) > 0 || (Number(out.pl) || 0) > 0
        var hasFrameVisual = !!(getFirstSolidStroke(node) || getFirstSolidFill(node) || hasImageFill(node))
        if (fixedW && fixedH && allCenter && hasPadding && !hasFrameVisual) {
            out.pt = out.pr = out.pb = out.pl = "0"
        }
        // 버튼 노드이고 주축 정렬이 center일 때 좌우 패딩 0 (텍스트 중앙 정렬 시 시각적 균형)
        if (isBtnNode(node) && out.justify === "center") {
            out.pr = "0"
            out.pl = "0"
        }
    } catch (e) {}
    return out
}

/** ap-flex 노드용 flex CSS 변수 선언 */
function buildFlexVarsDecl(layoutVars) {
    if (!layoutVars) return ""
    var parts = []
    if (layoutVars.direction) parts.push("--ap-direction:" + layoutVars.direction)
    parts.push("--ap-gap:" + (layoutVars.gap !== "" ? layoutVars.gap : "0"))
    parts.push("--ap-pt:" + (layoutVars.pt !== "" ? layoutVars.pt : "0"))
    parts.push("--ap-pr:" + (layoutVars.pr !== "" ? layoutVars.pr : "0"))
    parts.push("--ap-pb:" + (layoutVars.pb !== "" ? layoutVars.pb : "0"))
    parts.push("--ap-pl:" + (layoutVars.pl !== "" ? layoutVars.pl : "0"))
    if (layoutVars.justify) parts.push("--ap-justify:" + layoutVars.justify)
    if (layoutVars.align) parts.push("--ap-align:" + layoutVars.align)
    if (layoutVars.wrap) parts.push("--ap-wrap:" + layoutVars.wrap)
    return parts.join(";")
}

/** 절대 위치 노드의 부모 기준 left/top/width/height (calc) */
function buildAbsDecl(childNode, parentNode) {
    var box = getAbs(childNode)
    var parentBox = getAbs(parentNode)
    if (!box || !parentBox) return ""
    var relX = r2(box.x - parentBox.x)
    var relY = r2(box.y - parentBox.y)
    var w = box.w != null ? r2(box.w) : 0
    var h = box.h != null ? r2(box.h) : 0
    return "left:calc(" + relX + "/var(--ap-width)*100cqi);" + "top:calc(" + relY + "/var(--ap-width)*100cqi);" + "width:calc(" + w + "/var(--ap-width)*100cqi);" + "height:calc(" + h + "/var(--ap-width)*100cqi)"
}

/** PC(d)와 MO(m) 레이아웃 변수 비교 후 달라진 것만 MO 값으로 선언 */
function buildFlexVarsDeclDiff(dLv, mLv) {
    if (!mLv) return ""
    var keys = ["direction", "gap", "pt", "pr", "pb", "pl", "justify", "align", "wrap"]
    var parts = []
    for (var k = 0; k < keys.length; k++) {
        var key = keys[k]
        var dv = dLv && dLv[key] != null ? String(dLv[key]) : ""
        var mv = mLv[key] != null ? String(mLv[key]) : ""
        if (key === "gap" || key === "pt" || key === "pr" || key === "pb" || key === "pl") {
            if (r2(Number(dv) || 0) !== r2(Number(mv) || 0)) parts.push("--ap-" + (key === "gap" ? "gap" : key) + ":" + (mv !== "" ? mv : "0"))
        } else if (dv !== mv) {
            if (key === "direction" && mv) parts.push("--ap-direction:" + mv)
            else if (key === "justify" && mv) parts.push("--ap-justify:" + mv)
            else if (key === "align" && mv) parts.push("--ap-align:" + mv)
            else if (key === "wrap" && mv) parts.push("--ap-wrap:" + mv)
        }
    }
    return parts.join(";")
}

/** PC(d)와 MO(m) 절대 위치 비교 후 달라질 때만 MO 기준 선언 */
function buildAbsDeclDiff(dChild, dParent, mChild, mParent) {
    var dB = getAbs(dChild)
    var dPB = getAbs(dParent)
    var mB = getAbs(mChild)
    var mPB = getAbs(mParent)
    if (!dB || !dPB || !mB || !mPB) return ""
    var dRelX = r2(dB.x - dPB.x),
        dRelY = r2(dB.y - dPB.y),
        dW = r2(dB.w != null ? dB.w : 0),
        dH = r2(dB.h != null ? dB.h : 0)
    var mRelX = r2(mB.x - mPB.x),
        mRelY = r2(mB.y - mPB.y),
        mW = r2(mB.w != null ? mB.w : 0),
        mH = r2(mB.h != null ? mB.h : 0)
    if (dRelX === mRelX && dRelY === mRelY && dW === mW && dH === mH) return ""
    return buildAbsDecl(mChild, mParent)
}

/** PC(d)와 MO(m) 이미지 크기 비교 후 달라진 것만 MO 값으로 선언 */
function getImageSizeDeclDiff(dNode, mNode) {
    var dAbs = getAbs(dNode)
    var mAbs = getAbs(mNode)
    if (!mAbs || (mAbs.w == null && mAbs.h == null)) return ""
    var dw = dAbs && dAbs.w != null ? r2(dAbs.w) : null
    var dh = dAbs && dAbs.h != null ? r2(dAbs.h) : null
    var mw = mAbs.w != null ? r2(mAbs.w) : null
    var mh = mAbs.h != null ? r2(mAbs.h) : null
    if (dw === mw && dh === mh) return ""
    var parts = []
    if (mw != null) parts.push("--ap-w:" + mw)
    if (mh != null) parts.push("--ap-h:" + mh)
    return parts.join(";")
}

/** PC/MO 비디오 크기 diff → aspect-ratio 스타일 (인라인 style 오버라이드용) */
function getVideoSizeDeclDiff(dNode, mNode) {
    var mAbs = getAbs(mNode)
    if (!mAbs || mAbs.w == null || mAbs.h == null || mAbs.h <= 0) return ""
    var dAbs = getAbs(dNode)
    var dw = dAbs && dAbs.w != null ? r2(dAbs.w) : null
    var dh = dAbs && dAbs.h != null ? r2(dAbs.h) : null
    var mw = r2(mAbs.w)
    var mh = r2(mAbs.h)
    if (dw === mw && dh === mh) return ""
    return "aspect-ratio:" + mw + "/" + mh
}
/** 0~255 숫자 → 2자리 hex 문자열 */
function toHex2(n) {
    var s = n.toString(16)
    return (n < 16 ? "0" : "") + s
}
/** Figma RGB 객체 → #rrggbb */
function rgbToHex(rgb) {
    if (!rgb) return ""
    var r = Math.round((rgb.r || 0) * 255)
    var g = Math.round((rgb.g || 0) * 255)
    var b = Math.round((rgb.b || 0) * 255)
    return "#" + toHex2(r) + toHex2(g) + toHex2(b)
}
/** #rrggbb + opacity(0~1) → rgba(r,g,b,a) (fill opacity 오버레이용) */
function hexToRgba(hex, opacity) {
    if (!hex || typeof opacity !== "number") return null
    var h = String(hex).replace(/^#/, "")
    if (h.length !== 6) return null
    var r = parseInt(h.slice(0, 2), 16)
    var g = parseInt(h.slice(2, 4), 16)
    var b = parseInt(h.slice(4, 6), 16)
    var a = opacity < 0 ? 0 : opacity > 1 ? 1 : opacity
    return "rgba(" + r + "," + g + "," + b + "," + a + ")"
}
/** paints 배열에서 첫 SOLID 색상 hex (getStyledTextSegments의 fills용) */
function getFirstSolidColorFromPaints(paints) {
    if (!paints || !paints.length) return ""
    for (var i = 0; i < paints.length; i++) {
        var f = paints[i]
        if (f && f.visible !== false && f.type === "SOLID" && f.color) return rgbToHex(f.color)
    }
    return ""
}
/** 노드 fills에서 첫 번째 SOLID fill → {color, opacity} */
function getFirstSolidFill(node) {
    try {
        var fills = node.fills
        if (!fills || fills === figma.mixed) return null
        for (var i = 0; i < fills.length; i++) {
            var f = fills[i]
            if (f && f.visible !== false && f.type === "SOLID") {
                return {
                    color: rgbToHex(f.color),
                    opacity: typeof f.opacity === "number" ? r2(f.opacity) : null,
                }
            }
        }
    } catch (e) {}
    return null
}
/** 노드에 IMAGE 타입 fill이 있는지 */
function hasImageFill(node) {
    try {
        var fills = node.fills
        if (!fills || fills === figma.mixed) return false
        for (var i = 0; i < fills.length; i++) {
            var f = fills[i]
            if (f && f.visible !== false && f.type === "IMAGE") return true
        }
    } catch (e) {}
    return false
}

/** strokes에서 첫 번째 SOLID stroke 추출. 개별 변(FRAME/RECTANGLE) 지원 */
function getFirstSolidStroke(node) {
    try {
        if (!("strokes" in node) || !node.strokes || node.strokes === figma.mixed) return null
        var strokes = node.strokes
        for (var i = 0; i < strokes.length; i++) {
            var s = strokes[i]
            if (s && s.visible !== false && s.type === "SOLID") {
                var topW = "strokeTopWeight" in node && typeof node.strokeTopWeight === "number" ? node.strokeTopWeight : null
                var bottomW = "strokeBottomWeight" in node && typeof node.strokeBottomWeight === "number" ? node.strokeBottomWeight : null
                var leftW = "strokeLeftWeight" in node && typeof node.strokeLeftWeight === "number" ? node.strokeLeftWeight : null
                var rightW = "strokeRightWeight" in node && typeof node.strokeRightWeight === "number" ? node.strokeRightWeight : null
                var hasPerSide = topW != null || bottomW != null || leftW != null || rightW != null
                var uniformW = typeof node.strokeWeight === "number" ? node.strokeWeight : 1
                var top = hasPerSide ? r2(topW != null ? topW : 0) : r2(uniformW)
                var bottom = hasPerSide ? r2(bottomW != null ? bottomW : 0) : r2(uniformW)
                var left = hasPerSide ? r2(leftW != null ? leftW : 0) : r2(uniformW)
                var right = hasPerSide ? r2(rightW != null ? rightW : 0) : r2(uniformW)
                if (top <= 0 && bottom <= 0 && left <= 0 && right <= 0) return null
                return {
                    color: rgbToHex(s.color),
                    opacity: typeof s.opacity === "number" ? r2(s.opacity) : 1,
                    weight: r2(uniformW),
                    top: top,
                    bottom: bottom,
                    left: left,
                    right: right,
                    align: String(node.strokeAlign || "INSIDE").toUpperCase(),
                    dashes: node.strokeDashes && node.strokeDashes.length > 0,
                }
            }
        }
    } catch (e) {}
    return null
}

/** corner radius → border-radius CSS (responsive calc). cornerRadius 통일 또는 topLeftRadius 등 개별값 지원 */
function buildCornerRadiusDecl(node) {
    if (!node) return ""
    var calc = function (px) {
        return "calc(" + px + "/var(--ap-width)*100cqi)"
    }
    try {
        var cr = node.cornerRadius
        if (typeof cr === "number" && cr > 0) return "border-radius:" + calc(cr)
    } catch (e1) {}
    try {
        var tl = typeof node.topLeftRadius === "number" ? node.topLeftRadius : 0
        var tr = typeof node.topRightRadius === "number" ? node.topRightRadius : 0
        var br = typeof node.bottomRightRadius === "number" ? node.bottomRightRadius : 0
        var bl = typeof node.bottomLeftRadius === "number" ? node.bottomLeftRadius : 0
        if (tl > 0 || tr > 0 || br > 0 || bl > 0) return "border-radius:" + calc(tl) + " " + calc(tr) + " " + calc(br) + " " + calc(bl)
    } catch (e2) {}
    return ""
}

/** stroke → border CSS (responsive calc). 개별 변 지원 */
function buildStrokeDecl(node) {
    var stroke = getFirstSolidStroke(node)
    if (!stroke || !stroke.color) return ""
    var style = stroke.dashes ? "dashed" : "solid"
    var calc = function (w) {
        return "calc(" + w + "/var(--ap-width)*100cqi)"
    }
    var parts = []
    if (stroke.top > 0 || stroke.bottom > 0 || stroke.left > 0 || stroke.right > 0) {
        parts.push("border-width:" + calc(stroke.top) + " " + calc(stroke.right) + " " + calc(stroke.bottom) + " " + calc(stroke.left))
        parts.push("border-style:" + style)
        parts.push("border-color:" + stroke.color)
    }
    return parts.join(";")
}

/** PC(d)와 MO(m) stroke 비교 후 달라지면 MO 값으로 선언 */
function buildStrokeDeclDiff(dNode, mNode) {
    var dDecl = buildStrokeDecl(dNode)
    var mDecl = buildStrokeDecl(mNode)
    if (dDecl === mDecl) return ""
    if (mDecl) return mDecl
    return "border:none"
}

// ----- Asset Export (이미지/리소스 export, 파일명·포맷) -----
/** @param {Uint8Array} bytes */
function readUint32BE(bytes, offset) {
    return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
}
/** @param {Uint8Array} bytes */
function isJpegBytes(bytes) {
    return !!(bytes && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
}
/** @param {Uint8Array} bytes */
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
/** @param {Uint8Array} bytes */
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
/** @param {Uint8Array} bytes */
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
        for (var i = 0; i < fills.length; i++) {
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
        for (var i = 0; i < fills.length; i++) {
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
function exportNodeImageFillOnlyAsync(node) {
    if (!node || !isContainer(node)) return Promise.resolve(null)
    try {
        var clone = node.clone()
        while (clone.children && clone.children.length > 0) clone.removeChild(clone.children[0])
        return exportNodeImageAsync(clone)
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
function exportImageFillThenCloneFallbackAsync(node) {
    return exportImageFillOnlyAsync(node).then(function (fromHash) {
        if (fromHash) return fromHash
        if (hasImageFill(node) && isContainer(node) && hasVisibleChildren(node)) return exportNodeImageFillOnlyAsync(node)
        return exportNodeImageAsync(node)
    })
}

/**
 * 배경/ap-image 공통. exportNodeImageAsync 는 자식 TEXT 까지 합쳐 래스터 → fill+TEXT 프레임은
 * mustStrip 경로에서 fill/클론만 사용.
 */
function exportImagePreferSourceBytesAsync(node) {
    var mustStripChildrenForRaster = hasImageFill(node) && isContainer(node) && hasTextInSubtree(node)
    if (mustStripChildrenForRaster) return exportImageFillThenCloneFallbackAsync(node)
    return exportNodeImageAsync(node).then(function (dataUrl) {
        if (dataUrl) return dataUrl
        return exportImageFillThenCloneFallbackAsync(node)
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
    return !!(node && (hasImageFill(node) || isCompositeCandidate(node)))
}

/**
 * 노드를 단일 래스터(<img> 한 장)로 내보낼지 — renderImageNodeAsync 진입용.
 *
 * 1) isImageCandidate 가 false 이면 false (오토레이아웃 프레임에 텍스트만 있는 경우 등은 여기 해당 없음).
 * 2) 서브트리에 Figma TEXT 가 있으면 false — 텍스트는 HTML로 두고 프레임은 renderFrameNodeAsync.
 * 3) (1)(2) 로도 안 막히는 경우만 true — 예: 리프 사각형+이미지 fill, 클립 마스크만 있는 그룹+이미지만 등.
 */
function shouldExportAsSingleRasterImage(node) {
    if (!isImageCandidate(node)) return false
    if (isContainer(node) && hasTextInSubtree(node)) return false
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
function textSel(id) { return nodeSel(id) }
function frameSel(id) { return nodeSel(id) }
function imageSel(id) { return nodeSel(id) }
function imageImgSel(id) { return nodeSel(id) + " > img" }
function videoSel(id) { return nodeSel(id) }
function lineSel(id) { return nodeSel(id) }
function ellipseSel(id) { return nodeSel(id) }
function layerSel(id) { return nodeSel(id) }

/** 리프·자식 노드 지연 스타일용 inner selector */
function getLeafSelectorForNode(ch, opts) {
    if (!ch || !ch.id) return ""
    if (opts && opts.sectionSemantics) return cssInnerSelForNode(String(ch.id), opts, false)
    return nodeSel(String(ch.id))
}

/** 섹션 서브트리에서 .ap-image로 출력되는 노드들을 레이어 name 기준으로 수집 (MO 이미지 이름 매칭용) */
function collectImageNodesByName(root) {
    var map = {}
    if (!root) return map
    function walk(n) {
        if (!n || !isVisible(n)) return
        var isImg = (isImageCandidate(n) || hasImageFill(n) || (isVectorOnlyTree(n) && !isLineLikeNode(n) && n.type !== "ELLIPSE"))
        if (n.id && isImg) {
            var key = String(n.name || "").trim()
            if (key !== "" && !map[key]) map[key] = n
        }
        if (isContainer(n)) for (var i = 0; i < n.children.length; i++) walk(n.children[i])
    }
    walk(root)
    return map
}

/** 섹션 서브트리에서 TEXT 노드를 레이어 name 기준으로 수집 (MO 텍스트 이름 매칭용) */
function collectTextNodesByName(root) {
    var map = {}
    if (!root) return map
    function walk(n) {
        if (!n || !isVisible(n)) return
        if (n.type === "TEXT" && n.id) {
            var key = String(n.name || "").trim()
            if (key !== "" && !map[key]) map[key] = n
        }
        if (isContainer(n)) for (var i = 0; i < n.children.length; i++) walk(n.children[i])
    }
    walk(root)
    return map
}

/** section 기준 깊이 → 구조 역할. 10단계 넘으면 part로 통일 */
var SECTION_STRUCTURE_LEVELS = [
    "container",
    "content",
    "group",
    "block",
    "item",
    "part",
    "slot",
    "cell",
    "unit",
]

function normalizeGeoTextForMatch(s) {
    return String(s || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase()
}

function sanitizeGeoRoleForBem(role) {
    var r = String(role || "")
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
    var ok = {title: 1, subtitle: 1, description: 1, caption: 1, cta: 1, label: 1, body: 1}
    return ok[r] ? r : "description"
}

/**
 * 섹션 트리 기준 시맨틱 보조 클래스 (id → 클래스 배열).
 * geoHints: AI 검수 GEO.structure [{ text, role }] — 본문 텍스트 매칭 시 ap-section__* 우선 반영.
 */
function buildSectionSemanticClasses(sectionNode, geoHints) {
    if (geoHints != null && !Array.isArray(geoHints)) geoHints = null
    if (geoHints && geoHints.length > 64) geoHints = geoHints.slice(0, 64)
    var map = {}
    function add(nid, cls) {
        if (nid == null) return
        var s = String(nid)
        if (!map[s]) map[s] = []
        if (map[s].indexOf(cls) < 0) map[s].push(cls)
    }
    if (!sectionNode) return map

    function walkStructure(n, depthFromSection) {
        if (!n || !isVisible(n)) return
        if (n.id && n.type === "FRAME" && isContainer(n)) {
            var role = SECTION_STRUCTURE_LEVELS[depthFromSection - 1] || "part"
            add(n.id, apSectionBem(role))
        }
        if (isContainer(n)) {
            for (var i = 0; i < (n.children || []).length; i++) {
                walkStructure(n.children[i], depthFromSection + 1)
            }
        }
    }
    var visKids = (sectionNode.children || []).filter(function (c) {
        return c && isVisible(c)
    })
    for (var i = 0; i < visKids.length; i++) {
        walkStructure(visKids[i], 1)
    }

    var texts = []
    var secBox = getAbs(sectionNode)
    var secTop = secBox ? secBox.y : 0
    function walkText(n) {
        if (!n || !isVisible(n)) return
        if (n.type === "TEXT" && n.id) {
            var ts = getTextSummarySync(n)
            var fs = ts && ts.fs !== "" ? Number(ts.fs) || 0 : 0
            var tb = getAbs(n)
            var relY = tb ? tb.y - secTop : 0
            var rawT = ts && ts.text != null ? String(ts.text) : ""
            texts.push({id: n.id, fs: fs, relY: relY, textNorm: normalizeGeoTextForMatch(rawT)})
        }
        if (isContainer(n)) for (var j = 0; j < (n.children || []).length; j++) walkText(n.children[j])
    }
    walkText(sectionNode)
    texts.sort(function (a, b) {
        if (b.fs !== a.fs) return b.fs - a.fs
        return a.relY - b.relY
    })

    var TEXT_ROLE_RE = /^ap-section__(title|subtitle|description|caption|cta|label|body)$/

    function stripTextSemanticRoles(nid) {
        var s = String(nid)
        var arr = map[s]
        if (!arr || !arr.length) return
        map[s] = arr.filter(function (c) {
            return !TEXT_ROLE_RE.test(c)
        })
    }

    var forcedById = {}
    if (geoHints && geoHints.length) {
        var matchedTextIds = {}
        for (var gi = 0; gi < geoHints.length; gi++) {
            var gh = geoHints[gi]
            if (!gh || typeof gh !== "object") continue
            var gtxt = normalizeGeoTextForMatch(gh.text)
            var groom = sanitizeGeoRoleForBem(gh.role)
            if (!gtxt) continue
            for (var ti = 0; ti < texts.length; ti++) {
                var tx = texts[ti]
                if (matchedTextIds[tx.id]) continue
                var tn = tx.textNorm || ""
                if (!tn) continue
                if (tn === gtxt || tn.indexOf(gtxt) !== -1 || gtxt.indexOf(tn) !== -1) {
                    forcedById[String(tx.id)] = groom
                    matchedTextIds[tx.id] = true
                    break
                }
            }
        }
    }

    for (var tsIdx = 0; tsIdx < texts.length; tsIdx++) {
        stripTextSemanticRoles(texts[tsIdx].id)
    }

    for (var fid in forcedById) {
        if (Object.prototype.hasOwnProperty.call(forcedById, fid)) {
            add(fid, apSectionBem(forcedById[fid]))
        }
    }

    var remaining = []
    for (var ri = 0; ri < texts.length; ri++) {
        if (!forcedById[String(texts[ri].id)]) remaining.push(texts[ri])
    }
    remaining.sort(function (a, b) {
        if (b.fs !== a.fs) return b.fs - a.fs
        return a.relY - b.relY
    })
    for (var rj = 0; rj < remaining.length; rj++) {
        var roleRem = rj === 0 ? "title" : rj === 1 ? "subtitle" : "description"
        add(remaining[rj].id, apSectionBem(roleRem))
    }

    function tagImageNode(n) {
        if (!n || !n.id) return
        var nm = String(n.name || "").toLowerCase()
        if (/logo|brand|wordmark|sym/.test(nm)) add(n.id, apSectionBem("logo"))
        else if (/icon|deco|decoration|divider|bullet|line/.test(nm)) add(n.id, apSectionBem("decoration"))
        else add(n.id, apSectionBem("image"))
    }
    function walkImg(n) {
        if (!n || !isVisible(n)) return
        if (isContainer(n) && hasTextInSubtree(n)) {
            for (var k = 0; k < (n.children || []).length; k++) walkImg(n.children[k])
            return
        }
        if (isContainer(n) && isImageCandidate(n)) {
            if (hasMultipleImageLikeChildren(n) && !isCompositeCandidate(n)) {
                for (var k2 = 0; k2 < (n.children || []).length; k2++) walkImg(n.children[k2])
                return
            }
            tagImageNode(n)
            return
        }
        if (
            n.id &&
            (isImageCandidate(n) || (isVectorOnlyTree(n) && !isLineLikeNode(n) && n.type !== "ELLIPSE")) &&
            n.type !== "TEXT"
        ) {
            tagImageNode(n)
        }
        if (isContainer(n)) for (var k3 = 0; k3 < (n.children || []).length; k3++) walkImg(n.children[k3])
    }
    walkImg(sectionNode)

    function walkFillMissing(n) {
        if (!n || !isVisible(n)) return
        if (n.id && !map[String(n.id)]) {
            if (isVideoNode(n)) add(n.id, apSectionBem("video"))
            else if (isLineLikeNode(n)) add(n.id, apSectionBem("line"))
            else if (n.type === "ELLIPSE") add(n.id, apSectionBem("ellipse"))
            else add(n.id, apSectionBem("layer"))
        }
        if (isContainer(n)) for (var wf = 0; wf < (n.children || []).length; wf++) walkFillMissing(n.children[wf])
    }
    walkFillMissing(sectionNode)

    disambiguateSectionSemantics(sectionNode, map)

    return map
}

/** 동일 ap-section__* 가 여러 노드면 --01, --02 로만 구분 (ap-n-* 불사용) */
function disambiguateSectionSemantics(sectionNode, map) {
    var classToIds = {}
    for (var nid in map) {
        if (!Object.prototype.hasOwnProperty.call(map, nid)) continue
        var arr = map[nid] || []
        for (var i = 0; i < arr.length; i++) {
            var c = arr[i]
            if (!classToIds[c]) classToIds[c] = []
            if (classToIds[c].indexOf(nid) < 0) classToIds[c].push(nid)
        }
    }
    var order = []
    function walkOrd(n) {
        if (!n || !isVisible(n)) return
        if (n.id) order.push(String(n.id))
        if (isContainer(n)) for (var j = 0; j < (n.children || []).length; j++) walkOrd(n.children[j])
    }
    walkOrd(sectionNode)
    function rank(id) {
        var x = order.indexOf(id)
        return x < 0 ? 999999 : x
    }
    for (var cls in classToIds) {
        var ids = classToIds[cls]
        if (ids.length <= 1) continue
        ids = ids.slice().sort(function (a, b) {
            return rank(a) - rank(b)
        })
        for (var k = 0; k < ids.length; k++) {
            var newCls = cls + "--" + pad2(k + 1)
            var arr = map[ids[k]]
            var idx = arr.indexOf(cls)
            if (idx >= 0) arr[idx] = newCls
        }
    }
}

/** 지연 CSS용: 섹션 스코프 안 시맨틱 클래스만 (ap-n 없음) */
function cssInnerSelForNode(id, opts, forImgChild) {
    var sid = id != null ? String(id) : ""
    if (!sid) return forImgChild ? ".ap-missing > img" : ".ap-missing"
    var sem = (opts && opts.sectionSemantics && opts.sectionSemantics[sid]) || []
    if (!sem.length) return forImgChild ? ".ap-missing > img" : ".ap-missing"
    var pick = sem[sem.length - 1]
    if (forImgChild) {
        for (var i = sem.length - 1; i >= 0; i--) {
            if (/__(image|logo|decoration)(--|$)/.test(sem[i])) {
                pick = sem[i]
                break
            }
        }
    }
    return forImgChild ? "." + pick + " > img" : "." + pick
}

/** base + 시맨틱만 (ap-n-* 출력 안 함) */
function apNodeClassList(base, id, opts) {
    var parts = [base || ""]
    var sem = id && opts && opts.sectionSemantics ? opts.sectionSemantics[String(id)] : null
    if (sem && sem.length) {
        for (var i = 0; i < sem.length; i++) parts.push(sem[i])
    }
    return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim()
}

var IMAGE_EXPORT_MAX_WIDTH = 200   // 미리보기
var IMAGE_EXPORT_ZIP_WIDTH = 1200  // ZIP 내보내기
var _currentExportWidth = IMAGE_EXPORT_MAX_WIDTH

/** 노드 PNG/JPG export — imageExportNeedsPngAsync(투명 강제 + 점수제) 후 JPG 우선·실패 시 PNG */
function exportNodeImageAsync(node) {
    if (!node) return Promise.resolve(null)
    try {
        var isText = node.type === "TEXT"
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
        var textOpts = isText ? {useAbsoluteBounds: true} : undefined
        /** 동일 포맷으로 width → 800 → 제약 없음 순 시도 */
        function tryFormatSequence(fmt) {
            return doExport(fmt, w, textOpts).then(function (result) {
                if (result) return result
                return doExport(fmt, 800, textOpts)
            }).then(function (result) {
                if (result) return result
                return doExport(fmt, null, textOpts)
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

/** 이미지 노드 크기로 img용 CSS var 선언 */
function getImageSizeDecl(node) {
    var abs = getAbs(node)
    if (!abs || (abs.w == null && abs.h == null)) return ""
    var parts = []
    if (abs.w != null) parts.push("--ap-w:" + abs.w)
    if (abs.h != null) parts.push("--ap-h:" + abs.h)
    return parts.join(";")
}

/** 래퍼(.ap-image .ap-section__image--XX)에 --ap-w/--ap-h만 넣음. 기존 .ap-image img 규칙이 var()로 활용 (ap-abs 래퍼는 생략) */
function pushDeferredImageImgSizeVars(ctx, secClass, nodeId, node, opts, wrapperIsApAbs) {
    if (!nodeId || wrapperIsApAbs) return
    var decl = getImageSizeDecl(node)
    if (!decl) return
    var innerSel = cssInnerSelForNode(String(nodeId), opts, false)
    var sel = ".ap-section--" + secClass + " " + innerSel.replace(/,/g, ", .ap-section--" + secClass + " ")
    pushDeferredStyle(ctx, sel, decl)
}

// ----- 텍스트 (폰트 로드, 스타일 구간, CSS 변수) -----
/** 폰트 객체 → "family::style" 고유 키 */
function uniqFontKey(fn) {
    if (!fn) return ""
    return String(fn.family || "") + "::" + String(fn.style || "")
}
/** 트리 내 모든 TEXT 노드 폰트 비동기 로드 */
function loadFontsForMobileTreeAsync(root) {
    var list = []
    function walk(n) {
        if (!n || !isVisible(n)) return
        if (n.type === "TEXT") list.push(n)
        if (isContainer(n)) for (var i = 0; i < n.children.length; i++) walk(n.children[i])
    }
    walk(root)
    return Promise.all(
        list.map(function (tn) {
            return loadFontsForTextNodeAsync(tn)
        }),
    ).then(function () {})
}

/** getStyledTextSegments 없을 때 getRange* 로 스타일 구간 묶기 */
function extractTextStyleRunsFromRangeApi(tn, len) {
    var runs = []
    var start = 0
    var text = tn.characters || ""
    var styleToWeight = { Bold: 700, "Extra Bold": 800, "Semi Bold": 600, Medium: 500, Regular: 400, Light: 300, "Extra Light": 200, Thin: 100 }
    function getFs(i) {
        try {
            var v = tn.getRangeFontSize(i, i + 1)
            return v != null && v !== figma.mixed ? Number(v) || 0 : 0
        } catch (e) {
            return 0
        }
    }
    function getFont(i) {
        try {
            var fn = tn.getRangeFontName(i, i + 1)
            if (!fn || fn === figma.mixed || typeof fn !== "object") return { style: "", weight: 400 }
            var style = String(fn.style || "")
            var w = styleToWeight[style]
            if (w == null && /bold/i.test(style)) w = 700
            if (w == null && /medium/i.test(style)) w = 500
            if (w == null) w = 400
            return { style: style, weight: w }
        } catch (e) {
            return { style: "", weight: 400 }
        }
    }
    for (var i = 1; i <= len; i++) {
        var prevFs = getFs(start)
        var prevFont = getFont(start)
        var currFs = i < len ? getFs(i) : prevFs
        var currFont = i < len ? getFont(i) : prevFont
        if (i === len || currFs !== prevFs || currFont.style !== prevFont.style) {
            runs.push({
                start: start,
                end: i,
                characters: text.slice(start, i),
                fs: prevFs,
                fw: prevFont.weight,
                clr: "",
                ls: 0,
            })
            start = i
        }
    }
    return runs
}
/** 단일 TEXT 노드 폰트 로드 (mixed 시 getRangeAllFontNames 사용) */
function loadFontsForTextNodeAsync(tn) {
    function loadOne(fn) {
        if (!fn || fn === figma.mixed) return Promise.resolve()
        return figma.loadFontAsync(fn).catch(function () {
            return Promise.resolve()
        })
    }
    var fn = null
    try {
        fn = tn.fontName
    } catch (e) {
        fn = null
    }
    if (fn && fn !== figma.mixed) return loadOne(fn)

    var names = []
    try {
        var len = 0
        try {
            len = tn.characters.length
        } catch (e2) {
            len = 0
        }
        if (len > 0) names = tn.getRangeAllFontNames(0, len)
    } catch (e3) {
        names = []
    }

    var seen = {},
        ps = []
    for (var i = 0; i < names.length; i++) {
        var key = uniqFontKey(names[i])
        if (seen[key]) continue
        seen[key] = true
        ps.push(loadOne(names[i]))
    }
    return Promise.all(ps).then(function () {
        return
    })
}
/** TEXT 노드 → {text, fs, lh, ls, fw, ta, clr, parts(구간별 스타일)} (폰트 로드 후) */
function getTextSummaryAsync(tn) {
    return loadFontsForTextNodeAsync(tn).then(function () {
        var out = {
            text: "",
            textShort: "",
            fs: "",
            lh: "",
            ls: "",
            fw: "",
            ta: "",
            clr: "",
            fontFamily: "",
            fontStyle: "",
            lineBreakIndices: [],
            lines: [],
        }

        try {
            var s = tn.characters
            if (s == null) s = ""
            out.text = String(s)
            var lb = getLineBreakPoints(out.text)
            out.lineBreakIndices = lb.indices
            out.lines = lb.lines
            var short = out.text.replace(/\n/g, "↵")
            if (short.length > 24) short = short.slice(0, 24) + "…"
            out.textShort = short
        } catch (e) {
            out.text = "[text]"
            out.textShort = "[text]"
        }

        try {
            if (tn.fontSize !== figma.mixed) {
                out.fs = String(Number(tn.fontSize) || 0)
            } else {
                out.fs = ""
            }
        } catch (e) {
            out.fs = ""
        }

        try {
            var lh = tn.lineHeight
            if (!lh || lh === figma.mixed) out.lh = ""
            else if (typeof lh === "object") {
                if (lh.unit === "PERCENT") out.lh = String(r2((lh.value || 0) / 100))
                else out.lh = String(r2(lh.value || 0))
            }
        } catch (e) {
            out.lh = ""
        }

        try {
            var ls = tn.letterSpacing
            var fsNum = tn.fontSize !== figma.mixed ? Number(tn.fontSize) || 0 : 0
            if (!ls || ls === figma.mixed || !fsNum) out.ls = ""
            else if (typeof ls === "object") {
                if (ls.unit === "PERCENT") out.ls = "0"
                else out.ls = String(r2((Number(ls.value) || 0) / fsNum)) // px -> em
            }
        } catch (e) {
            out.ls = ""
        }

        try {
            out.fw = tn.fontWeight != null ? String(tn.fontWeight) : ""
        } catch (e) {
            out.fw = ""
        }
        try {
            out.ta = String(tn.textAlignHorizontal || "")
        } catch (e) {
            out.ta = ""
        }

        try {
            var fill = getFirstSolidFill(tn)
            out.clr = fill && fill.color ? fill.color : ""
        } catch (e) {
            out.clr = ""
        }

        try {
            var fn = tn.fontName
            if (fn && fn !== figma.mixed && typeof fn === "object") {
                out.fontFamily = String(fn.family || "")
                out.fontStyle = String(fn.style || "")
                out.fontFamilies = [out.fontFamily]
            } else if (fn === figma.mixed) {
                out.fontFamilies = []
                try {
                    var len = tn.characters.length
                    if (len > 0) {
                        var names = tn.getRangeAllFontNames(0, len)
                        for (var i = 0; i < names.length; i++) if (names[i] && names[i].family) out.fontFamilies.push(String(names[i].family))
                    }
                } catch (e2) {}
            } else {
                out.fontFamilies = []
            }
        } catch (e) {
            out.fontFamilies = []
        }
        if (!out.fontFamilies) out.fontFamilies = out.fontFamily ? [out.fontFamily] : []

        var isMixed = false
        try {
            if (tn.fontName === figma.mixed || tn.fontSize === figma.mixed || tn.fills === figma.mixed) isMixed = true
        } catch (eMixed) {}
        var len = 0
        try {
            len = tn.characters.length
        } catch (eLen) {}
        if (isMixed && len > 0) {
            try {
                if (typeof tn.getStyledTextSegments === "function") {
                    var segFields = ["fontName", "fontSize", "fontWeight", "fills", "letterSpacing"]
                    var rawSegs = tn.getStyledTextSegments(segFields)
                    if (rawSegs && rawSegs.length > 0) {
                        var baseClr = (out.clr || "").toLowerCase()
                        var baseFs = out.fs !== "" ? Number(out.fs) || 0 : 0
                        var baseFw = out.fw !== "" ? Number(out.fw) || 400 : 400
                        var baseLsEm = out.ls !== "" ? Number(out.ls) || 0 : 0
                        var hasAnyDiff = false
                        for (var si = 0; si < rawSegs.length; si++) {
                            var seg = rawSegs[si]
                            var segFs = seg.fontSize != null && seg.fontSize !== figma.mixed ? Number(seg.fontSize) || 0 : 0
                            var segFw = seg.fontWeight != null && seg.fontWeight !== figma.mixed ? Number(seg.fontWeight) || 400 : 400
                            var segClr = getFirstSolidColorFromPaints(seg.fills) || ""
                            if (segClr) segClr = segClr.toLowerCase()
                            var segLsEm = baseLsEm
                            if (seg.letterSpacing != null && seg.letterSpacing !== figma.mixed && typeof seg.letterSpacing === "object") {
                                var lso = seg.letterSpacing
                                if (lso.unit === "PERCENT") segLsEm = (Number(lso.value) || 0) / 100
                                else if (lso.unit === "PIXELS" && segFs > 0) segLsEm = (Number(lso.value) || 0) / segFs
                            }
                            if (segClr && segClr !== baseClr) hasAnyDiff = true
                            if (segFs && baseFs && Math.abs(segFs - baseFs) >= 1) hasAnyDiff = true
                            if (segFw !== baseFw) hasAnyDiff = true
                            if (Math.abs(segLsEm - baseLsEm) >= 0.001) hasAnyDiff = true
                        }
                        if (hasAnyDiff) {
                            out.parts = rawSegs.map(function (seg) {
                                var segFs = seg.fontSize != null && seg.fontSize !== figma.mixed ? Number(seg.fontSize) || 0 : 0
                                if (!segFs && typeof tn.getRangeFontSize === "function") {
                                    try {
                                        var rangeFs = tn.getRangeFontSize(seg.start, seg.end)
                                        if (rangeFs != null && rangeFs !== figma.mixed) segFs = Number(rangeFs) || 0
                                    } catch (eRange) {}
                                }
                                var segFw = seg.fontWeight != null && seg.fontWeight !== figma.mixed ? Number(seg.fontWeight) || 400 : 400
                                var segClr = getFirstSolidColorFromPaints(seg.fills) || ""
                                if (segClr) segClr = segClr.toLowerCase()
                                var segLsEm = baseLsEm
                                if (seg.letterSpacing != null && seg.letterSpacing !== figma.mixed && typeof seg.letterSpacing === "object") {
                                    var lso = seg.letterSpacing
                                    if (lso.unit === "PERCENT") segLsEm = (Number(lso.value) || 0) / 100
                                    else if (lso.unit === "PIXELS" && segFs > 0) segLsEm = (Number(lso.value) || 0) / segFs
                                }
                                return {
                                    start: seg.start,
                                    end: seg.end,
                                    characters: seg.characters != null ? String(seg.characters) : "",
                                    clr: segClr,
                                    fs: segFs,
                                    fw: segFw,
                                    ls: segLsEm,
                                }
                            })
                        }
                        if (out.fs === "" && out.parts && out.parts.length > 0) {
                            var firstFs = out.parts[0].fs
                            if (firstFs != null && firstFs > 0) out.fs = String(Math.round(firstFs))
                        }
                        if (out.fs === "" && rawSegs.length > 0) {
                            var r0 = rawSegs[0]
                            var r0fs = r0.fontSize
                            if (r0fs != null && r0fs !== figma.mixed) out.fs = String(Math.round(Number(r0fs) || 0))
                            if (out.fs === "" && typeof tn.getRangeFontSize === "function") {
                                try {
                                    var rf = tn.getRangeFontSize(r0.start, r0.end)
                                    if (rf != null && rf !== figma.mixed) out.fs = String(Math.round(Number(rf) || 0))
                                } catch (eR) {}
                            }
                        }
                    }
                } else {
                    var runs = extractTextStyleRunsFromRangeApi(tn, len)
                    if (runs && runs.length > 1) {
                        out.parts = runs
                        if (out.fs === "" && runs[0] && runs[0].fs > 0) out.fs = String(Math.round(runs[0].fs))
                    } else if (out.fs === "" && runs && runs.length === 1 && runs[0].fs > 0) {
                        out.fs = String(Math.round(runs[0].fs))
                    }
                }
            } catch (ePart) {
                out.parts = null
            }
        }

        return out
    })
}

/** 텍스트 스타일 → CSS 변수 (--ap-fs, --ap-lh, --ap-clr 등) */
function buildTextVarsDecl(ts) {
    if (!ts) return ""
    var fs = ts.fs !== "" ? Number(ts.fs) || 0 : 0
    var lhRaw = ts.lh !== "" ? Number(ts.lh) || 0 : 0
    var ls = ts.ls !== "" ? Number(ts.ls) || 0 : 0
    var fw = ts.fw !== "" ? Number(ts.fw) || 400 : 400
    var ta = normTextAlign(ts.ta)
    var clr = ts.clr || ""

    var parts = []
    parts.push("--ap-fs:" + fs)

    if (lhRaw > 0) {
        var lhPx = lhRaw
        if (lhRaw <= 3 && fs > 0) lhPx = lhRaw * fs // ratio -> px
        parts.push("--ap-lh:" + r2(lhPx))
    } else {
        parts.push("--ap-lh:" + fs)
    }

    parts.push("--ap-ls:" + ls)
    parts.push("--ap-fw:" + fw)
    parts.push("--ap-ta:" + ta)
    if (clr) parts.push("--ap-clr:" + clr)

    return parts.join(";")
}

/** PC(tsD)와 MO(tsM) 텍스트 변수 비교 후 달라진 것만 MO 값으로 선언 */
function buildTextVarsDeclDiff(tsD, tsM) {
    if (!tsM) return ""
    var parts = []
    function normTs(ts) {
        if (!ts) return {fs: 0, lh: 0, lhPx: 0, ls: 0, fw: 400, ta: "left", clr: ""}
        var fs = ts.fs !== "" ? Number(ts.fs) || 0 : 0
        var lhRaw = ts.lh !== "" ? Number(ts.lh) || 0 : 0
        var lhPx = lhRaw
        if (lhRaw > 0 && lhRaw <= 3 && fs > 0) lhPx = lhRaw * fs
        else if (lhRaw <= 0) lhPx = fs
        return {
            fs: fs,
            lh: lhRaw,
            lhPx: r2(lhPx),
            ls: ts.ls !== "" ? Number(ts.ls) || 0 : 0,
            fw: ts.fw !== "" ? Number(ts.fw) || 400 : 400,
            ta: normTextAlign(ts.ta),
            clr: ts.clr || "",
        }
    }
    var d = normTs(tsD)
    var m = normTs(tsM)
    if (d.fs !== m.fs) parts.push("--ap-fs:" + m.fs)
    if (d.lhPx !== m.lhPx) parts.push("--ap-lh:" + m.lhPx)
    if (r2(d.ls) !== r2(m.ls)) parts.push("--ap-ls:" + m.ls)
    if (d.fw !== m.fw) parts.push("--ap-fw:" + m.fw)
    if (d.ta !== m.ta) parts.push("--ap-ta:" + m.ta)
    if (d.clr !== m.clr && m.clr) parts.push("--ap-clr:" + m.clr)
    return parts.join(";")
}

/** TextNode → ts 객체 (동기, 폰트 로드 가정). mixed fontSize는 getStyledTextSegments로 첫 구간 값 사용 */
function getTextSummarySync(tn) {
    if (!tn || tn.type !== "TEXT") return null
    try {
        var out = {fs: "", lh: "", ls: "", fw: "", ta: "", clr: ""}
        if (tn.fontSize !== figma.mixed) {
            out.fs = String(Number(tn.fontSize) || 0)
        } else {
            if (typeof tn.getStyledTextSegments === "function") {
                try {
                    var segs = tn.getStyledTextSegments(["fontSize"])
                    if (segs && segs.length > 0 && segs[0].fontSize != null && segs[0].fontSize !== figma.mixed) {
                        out.fs = String(Math.round(Number(segs[0].fontSize) || 0))
                    }
                } catch (eSeg) {}
            }
            if (out.fs === "" && typeof tn.getRangeFontSize === "function" && tn.characters.length > 0) {
                try {
                    var rangeFs = tn.getRangeFontSize(0, 1)
                    if (rangeFs != null && rangeFs !== figma.mixed) out.fs = String(Math.round(Number(rangeFs) || 0))
                } catch (eRange) {}
            }
        }
        var lh = tn.lineHeight
        if (lh && lh !== figma.mixed && typeof lh === "object") {
            if (lh.unit === "PERCENT") out.lh = String(r2((lh.value || 0) / 100))
            else out.lh = String(r2(lh.value || 0))
        }
        var fsNum = out.fs !== "" ? Number(out.fs) || 0 : 0
        var ls = tn.letterSpacing
        if (ls && ls !== figma.mixed && typeof ls === "object" && fsNum) {
            if (ls.unit !== "PERCENT") out.ls = String(r2((Number(ls.value) || 0) / fsNum))
        }
        out.fw = tn.fontWeight != null ? String(tn.fontWeight) : ""
        out.ta = String(tn.textAlignHorizontal || "")
        var fill = getFirstSolidFill(tn)
        if (fill && fill.color) out.clr = fill.color
        return out
    } catch (e) {
        return null
    }
}
/** deferred 스타일 배열에 셀렉터별 선언 누적 (같은 sel이면 decl 병합) */
function pushDeferredStyle(ctx, sel, decl) {
    if (!ctx || !ctx.deferredStyles || !sel || !decl) return
    for (var i = 0; i < ctx.deferredStyles.length; i++) {
        if (ctx.deferredStyles[i].sel === sel) {
            var prev = ctx.deferredStyles[i].decl || ""
            var merged = prev ? prev + ";" + decl : decl
            ctx.deferredStyles[i].decl = dedupeCssDecl(merged)
            return
        }
    }
    ctx.deferredStyles.push({ sel: sel, decl: decl })
}

/** CSS 선언 문자열에서 동일 속성 중복 제거 (마지막 값 유지) */
function dedupeCssDecl(decl) {
    if (!decl || !String(decl).trim()) return decl
    var parts = String(decl).split(";")
    var map = {}
    for (var i = 0; i < parts.length; i++) {
        var p = parts[i].trim()
        if (!p) continue
        var colon = p.indexOf(":")
        if (colon === -1) continue
        var key = p.substring(0, colon).trim()
        var value = p.substring(colon + 1).trim()
        map[key] = value
    }
    return Object.keys(map).map(function (k) { return k + ":" + map[k] }).join(";")
}

/** 그룹 키용: 속성 이름 순 정렬로 선언이 같으면 동일 키 (선언 순서 무관) */
function normalizeDeclForMergeKey(decl) {
    var d = dedupeCssDecl(decl)
    if (!d || !String(d).trim()) return ""
    var parts = String(d).split(";")
    var pairs = []
    for (var i = 0; i < parts.length; i++) {
        var p = parts[i].trim()
        if (!p) continue
        var colon = p.indexOf(":")
        if (colon === -1) continue
        pairs.push({
            k: p.substring(0, colon).trim(),
            v: p.substring(colon + 1).trim(),
        })
    }
    pairs.sort(function (a, b) {
        return String(a.k).localeCompare(String(b.k))
    })
    return pairs.map(function (x) { return x.k + ":" + x.v }).join(";")
}

/** deferred 규칙 선택자 선두의 `ap-section--` 번호 (없으면 빈 문자열) */
function leadingApSectionIdFromSelector(sel) {
    var m = /^\.ap-section--(\d+)/.exec(String(sel || "").trim())
    return m ? m[1] : ""
}

/**
 * 동일 선언(decl)을 쓰는 규칙을 쉼표 선택자 한 줄로 합침 (HTML·클래스명 유지).
 * 병합은 같은 섹션(`.ap-section--NN` 동일) 안에서만 수행 — 섹션 간 우연한 동일 선언은 묶지 않음.
 */
function consolidateDeferredStylesByIdenticalDecl(styles) {
    if (!styles || styles.length < 2) {
        if (!styles || !styles.length) return styles
        return styles.map(function (s) {
            return {
                sel: s.sel,
                decl: dedupeCssDecl(s.decl ? String(s.decl) : ""),
            }
        })
    }
    var n = styles.length
    var meta = []
    var groups = Object.create(null)

    for (var i = 0; i < n; i++) {
        var s = styles[i]
        var sel = s && s.sel ? String(s.sel).trim() : ""
        var declNorm = dedupeCssDecl(s && s.decl ? String(s.decl) : "")
        var mergeKey = normalizeDeclForMergeKey(declNorm)
        var secId = leadingApSectionIdFromSelector(sel)
        meta[i] = { sel: sel, decl: declNorm, secId: secId }
        if (!declNorm || !mergeKey || !secId) continue
        var gkey = secId + "\x00" + mergeKey
        if (!groups[gkey]) groups[gkey] = []
        groups[gkey].push(i)
    }

    var mergedMember = Object.create(null)
    var out = []

    for (var gk in groups) {
        if (!Object.prototype.hasOwnProperty.call(groups, gk)) continue
        var idxs = groups[gk]
        if (idxs.length < 2) continue
        idxs.sort(function (a, b) { return a - b })
        var seenSel = Object.create(null)
        var selParts = []
        for (var ii = 0; ii < idxs.length; ii++) {
            var ij = idxs[ii]
            var oneSel = meta[ij].sel
            if (!oneSel || seenSel[oneSel]) continue
            seenSel[oneSel] = true
            selParts.push(oneSel)
        }
        if (selParts.length < 2) continue
        for (var mk = 0; mk < idxs.length; mk++) mergedMember[idxs[mk]] = true
        out.push({
            sel: selParts.join(", "),
            decl: meta[idxs[0]].decl,
            _order: idxs[0],
        })
    }

    for (var j = 0; j < n; j++) {
        if (mergedMember[j]) continue
        var m = meta[j]
        out.push({
            sel: m.sel,
            decl: m.decl || dedupeCssDecl(styles[j] && styles[j].decl ? String(styles[j].decl) : ""),
            _order: j,
        })
    }

    out.sort(function (a, b) {
        if (a._order !== b._order) return a._order - b._order
        return String(a.sel).localeCompare(String(b.sel))
    })
    for (var r = 0; r < out.length; r++) delete out[r]._order
    return out
}

function splitTopLevelCommaSelectors(sel) {
    return String(sel || "")
        .split(",")
        .map(function (s) {
            return s.trim()
        })
        .filter(Boolean)
}

/** `.ap-section--NN .ap-section__foo--01` 단일 리프만 허용 (복합/자식 선택자면 null) */
function parseSimpleSectionScopedPart(part) {
    var m = /^\s*\.ap-section--(\d+)\s+(\.[a-zA-Z0-9_-]+)\s*$/.exec(String(part || "").trim())
    if (!m) return null
    return { sec: m[1], cls: m[2].slice(1) }
}

/** 묶인 BEM 리프 중 `--숫자` 접미사 최소인 클래스를 대표로 */
function representativeBemClassForMerge(leaves) {
    var scored = leaves.map(function (leaf) {
        var n = 999999
        var mm = /--(\d+)$/.exec(leaf)
        if (mm) n = parseInt(mm[1], 10)
        return { leaf: leaf, n: n }
    })
    scored.sort(function (a, b) {
        if (a.n !== b.n) return a.n - b.n
        return String(a.leaf).localeCompare(String(b.leaf))
    })
    return scored[0].leaf
}

/**
 * 쉼표 병합된 규칙 → 대표 클래스 하나만 쓰는 선택자 + HTML 클래스 치환 목록.
 * 형식이 `.ap-section--N .단일클래스` 가 아니면 원문 셀렉터 유지.
 * @returns {{ rules: { sel: string, decl: string }[], renames: { secId: string, from: string, to: string }[] }}
 */
function canonicalizeMergedRulesToSingleRepresentativeClass(rules) {
    var renames = []
    var out = []
    if (!rules || !rules.length) return { rules: rules || [], renames: [] }
    for (var i = 0; i < rules.length; i++) {
        var rule = rules[i]
        var sel = rule.sel ? String(rule.sel) : ""
        var decl = rule.decl
        if (sel.indexOf(",") < 0) {
            out.push({ sel: sel, decl: decl })
            continue
        }
        var parts = splitTopLevelCommaSelectors(sel)
        var parsed = []
        var ok = true
        for (var p = 0; p < parts.length; p++) {
            var one = parseSimpleSectionScopedPart(parts[p])
            if (!one) {
                ok = false
                break
            }
            parsed.push(one)
        }
        if (!ok || !parsed.length) {
            out.push({ sel: sel, decl: decl })
            continue
        }
        var sec0 = parsed[0].sec
        for (var q = 1; q < parsed.length; q++) {
            if (parsed[q].sec !== sec0) {
                ok = false
                break
            }
        }
        if (!ok) {
            out.push({ sel: sel, decl: decl })
            continue
        }
        var sheetLeaves = []
        for (var r = 0; r < parsed.length; r++) sheetLeaves.push(parsed[r].cls)
        var canon = representativeBemClassForMerge(sheetLeaves)
        var newSel = ".ap-section--" + sec0 + " ." + canon
        for (var t = 0; t < sheetLeaves.length; t++) {
            if (sheetLeaves[t] !== canon) renames.push({ secId: sec0, from: sheetLeaves[t], to: canon })
        }
        out.push({ sel: newSel, decl: decl })
    }
    return { rules: out, renames: renames }
}

/**
 * 섹션 스택 기준으로 `class="` 안 토큰만 치환 (리프 BEM → 대표 클래스).
 */
function applySectionScopedClassRenames(lines, renames) {
    if (!lines || !lines.length || !renames || !renames.length) return
    var map = Object.create(null)
    for (var ri = 0; ri < renames.length; ri++) {
        var rr = renames[ri]
        if (!rr || rr.from == null || rr.to == null) continue
        if (String(rr.from) === String(rr.to)) continue
        map[String(rr.secId) + "\x00" + String(rr.from)] = String(rr.to)
    }
    var stack = []
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i]
        if (/<section\b/i.test(line)) {
            var sid = null
            var cm = /class="([^"]*)"/.exec(line)
            if (cm) {
                var sm = cm[1].match(/(?:^|\s)ap-section--(\d+)(?:\s|$)/)
                if (sm) sid = sm[1]
            }
            stack.push(sid)
        }
        var closeSecs = line.match(/<\/section>/gi)
        if (closeSecs) {
            for (var ci = 0; ci < closeSecs.length; ci++) {
                if (stack.length) stack.pop()
            }
        }
        var curSec = stack.length ? stack[stack.length - 1] : null
        if (curSec == null || line.indexOf('class="') < 0) continue
        lines[i] = line.replace(/class="([^"]*)"/g, function (full, inner) {
            if (!inner) return full
            var toks = inner.split(/\s+/).filter(Boolean)
            var seen = Object.create(null)
            var outParts = []
            var changed = false
            for (var j = 0; j < toks.length; j++) {
                var tok = toks[j]
                var rep = map[String(curSec) + "\x00" + tok]
                if (rep && rep !== tok) {
                    tok = rep
                    changed = true
                }
                if (!seen[tok]) {
                    seen[tok] = true
                    outParts.push(tok)
                } else {
                    changed = true
                }
            }
            if (!changed && outParts.length === toks.length) return full
            return 'class="' + outParts.join(" ") + '"'
        })
    }
}

/**
 * 최종 deferred 규칙 셀렉터에서 섹션별로 참조된 ap-section__ 클래스 집합 (루트만 .ap-section--NN 인 규칙은 제외).
 */
function buildUsedApSectionClassBySectionFromRules(rules) {
    var map = Object.create(null)
    if (!rules || !rules.length) return map
    for (var i = 0; i < rules.length; i++) {
        var sel = rules[i] && rules[i].sel ? String(rules[i].sel) : ""
        if (!sel) continue
        var parts = splitTopLevelCommaSelectors(sel)
        for (var p = 0; p < parts.length; p++) {
            var m = /^\.ap-section--(\d+)\s+(.+)$/.exec(parts[p].trim())
            if (!m) continue
            var sec = m[1]
            var rest = m[2]
            var re = /\.(ap-section__[a-zA-Z0-9_-]+)/g
            var mm
            while ((mm = re.exec(rest)) !== null) {
                if (!map[sec]) map[sec] = Object.create(null)
                map[sec][mm[1]] = true
            }
        }
    }
    return map
}

/**
 * 해당 섹션에 스코프 CSS가 있는 경우, 사용되지 않는 ap-section__* 만 class 목록에서 제거.
 */
function stripUnusedApSectionBemFromContentLines(contentLines, usedBySection) {
    if (!contentLines || !contentLines.length || !usedBySection) return
    var stack = []
    for (var i = 0; i < contentLines.length; i++) {
        var line = contentLines[i]
        if (/<section\b/i.test(line)) {
            var sid = null
            var cm = /class="([^"]*)"/.exec(line)
            if (cm) {
                var sm = cm[1].match(/(?:^|\s)ap-section--(\d+)(?:\s|$)/)
                if (sm) sid = sm[1]
            }
            stack.push(sid)
        }
        var closeSecs = line.match(/<\/section>/gi)
        if (closeSecs) {
            for (var ci = 0; ci < closeSecs.length; ci++) {
                if (stack.length) stack.pop()
            }
        }
        var curSec = stack.length ? stack[stack.length - 1] : null
        if (curSec == null || line.indexOf('class="') < 0) continue
        var used = usedBySection[curSec]
        if (!used) continue
        var hasAny = false
        for (var uk in used) {
            if (Object.prototype.hasOwnProperty.call(used, uk)) {
                hasAny = true
                break
            }
        }
        if (!hasAny) continue

        contentLines[i] = line.replace(/class="([^"]*)"/g, function (full, inner) {
            if (!inner) return full
            var toks = inner.split(/\s+/).filter(Boolean)
            var outParts = []
            var changed = false
            for (var j = 0; j < toks.length; j++) {
                var tok = toks[j]
                if (tok.indexOf("ap-section__") === 0 && !used[tok]) {
                    changed = true
                    continue
                }
                outParts.push(tok)
            }
            if (!changed) return full
            return 'class="' + outParts.join(" ") + '"'
        })
    }
}

var ASSETS_IMAGES_PREFIX = "assets/images/"
/** 프로젝트명 → 파일명에 쓸 수 있는 문자열 (공백·특수문자 제거) */
function normalizeProjectName(s) {
    s = String(s || "").trim()
    if (!s) return "project"
    s = s.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9_-]/g, "")
    return s || "project"
}

/** 문자열 해시 (동일 SVG 내용 → 동일 파일 재사용용) */
function simpleHash(str) {
    if (str == null || str.length === 0) return "0"
    var h = 0
    for (var i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i)
        h = h & h
    }
    return (h >>> 0).toString(36)
}

/** nodeId당 1회 할당. page_{project}_sec{01}_img{01}.{ext} (SVG는 내용 해시로 동일 벡터 공유) */
function getOrAssignImagePath(cache, nodeId, dataUrl, secNo, opts) {
    opts = opts || {}
    if (!cache) return ""
    if (!cache.imageName) cache.imageName = {}
    if (!cache.imgCountBySec) cache.imgCountBySec = {}
    if (!cache.imageList) cache.imageList = []

    var key = nodeId != null ? nodeId : dataUrl ? "_" + (Math.random() + "") : null
    if (key == null) return ""

    var isSvg = dataUrl && dataUrl.indexOf("image/svg+xml") >= 0
    var svgHash = isSvg && dataUrl ? simpleHash(dataUrl) : null
    if (isSvg && !cache.svgByHash) cache.svgByHash = {}
    if (svgHash && cache.svgByHash[svgHash]) {
        cache.imageName[key] = cache.svgByHash[svgHash].name
        return cache.imageName[key]
    }

    if (!cache.imageName[key]) {
        var ext = ".jpg"
        if (dataUrl) {
            if (dataUrl.indexOf("image/png") >= 0) ext = ".png"
            else if (dataUrl.indexOf("image/svg+xml") >= 0) ext = ".svg"
        }

        var sec = Number(secNo) || 1
        var n = (cache.imgCountBySec[sec] || 0) + 1
        cache.imgCountBySec[sec] = n

        var project = normalizeProjectName(cache.projectName)
        var suffix = cache.imageSuffix != null && cache.imageSuffix !== "" ? String(cache.imageSuffix) : ""
        var fileName = "page_" + project + "_sec" + pad2(sec) + "_img" + pad2(n) + suffix + ext

        cache.imageName[key] = ASSETS_IMAGES_PREFIX + fileName
        var isSvgMo = dataUrl && cache.imageSuffix === "_mo" && dataUrl.indexOf("image/svg+xml") >= 0
        var skipExport = opts.skipExport || isSvgMo
        if (dataUrl && !skipExport) {
            cache.imageList.push({name: cache.imageName[key], dataUrl: dataUrl})
            if (svgHash && cache.svgByHash) cache.svgByHash[svgHash] = { name: cache.imageName[key], dataUrl: dataUrl }
        }
    }
    return cache.imageName[key]
}

/** section이면 --bgc/--bg-img, 그 외는 background-color/background-image */
function buildBackgroundDeclAsync(node, useCssVarsForSection, cache, secNo, opts) {
    if (!node) return Promise.resolve("")
    if (node.type === "TEXT") return Promise.resolve("")

    var skipImageFill = opts && opts.skipImageFill === true
    var skipSolidFill = opts && opts.skipSolidFill === true

    var fill = getFirstSolidFill(node)
    var hasImg = skipImageFill ? false : hasImageFill(node)

    if (!fill && !hasImg) return Promise.resolve("")

    var parts = []
    var solidVisible = fill && fill.color && !skipSolidFill && (typeof fill.opacity !== "number" || fill.opacity > 0)
    if (solidVisible) {
        if (useCssVarsForSection) {
            parts.push("--bgc:" + fill.color)
        } else {
            parts.push("background-color:" + fill.color)
        }
    }

    if (!hasImg) return Promise.resolve(parts.join(";"))

    var dataUrlPromise
    if (cache && cache.image && node.id != null && cache.image[node.id]) {
        dataUrlPromise = Promise.resolve(cache.image[node.id])
    } else {
        dataUrlPromise = exportImagePreferSourceBytesAsync(node)
    }

    return dataUrlPromise
        .then(function (dataUrl) {
            if (node.id != null && dataUrl && cache && cache.image) cache.image[node.id] = dataUrl

            var path = cache ? getOrAssignImagePath(cache, node.id, dataUrl, secNo, { skipExport: isVideoNode(node) }) : ""
            var imgUrl = (path && path.length) ? path : dataUrl
            if (imgUrl && dataUrl) {
                var overlay = ""
                if (fill && fill.color && typeof fill.opacity === "number" && fill.opacity < 1) {
                    var rgba = hexToRgba(fill.color, fill.opacity)
                    if (rgba) overlay = "linear-gradient(" + rgba + "," + rgba + "),"
                }
                var imgValue = overlay + "url(" + imgUrl + ")"
                if (useCssVarsForSection) {
                    parts.push("--bg-img:" + imgValue)
                } else {
                    parts.push("background-image:" + imgValue, "background-repeat:no-repeat", "background-position:center", "background-size:100% 100%")
                }
            } else if (dataUrl && !cache) {
                var overlay2 = ""
                if (fill && fill.color && typeof fill.opacity === "number" && fill.opacity < 1) {
                    var rgba2 = hexToRgba(fill.color, fill.opacity)
                    if (rgba2) overlay2 = "linear-gradient(" + rgba2 + "," + rgba2 + "),"
                }
                var imgValue2 = overlay2 + "url(" + dataUrl + ")"
                if (useCssVarsForSection) parts.push("--bg-img:" + imgValue2)
                else parts.push("background-image:" + imgValue2, "background-repeat:no-repeat", "background-position:center", "background-size:100% 100%")
            }
            return parts.join(";")
        })
        .catch(function () {
            return parts.join(";")
        })
}

/** 섹션 배경: fill 또는 직계 자식 중 90% 이상 크기 이미지 → --bg-img 승격 (slide 섹션 제외) */
function buildSectionBackgroundAsync(sectionNode, cache, secNo) {
  var slideData = getSlideItems(sectionNode)

  return buildBackgroundDeclAsync(sectionNode, true, cache, secNo).then(function (decl) {
      var strokeDecl = buildStrokeDecl(sectionNode)
      if (strokeDecl) decl = decl ? decl + ";" + strokeDecl : strokeDecl
      var radiusDecl = buildCornerRadiusDecl(sectionNode)
      if (radiusDecl) decl = decl ? decl + ";" + radiusDecl : radiusDecl

      if (hasImageFill(sectionNode)) return {decl: decl, bgChildId: null}
      if (slideData) return {decl: decl, bgChildId: null}

      var children = sectionNode && sectionNode.children ? sectionNode.children : []
      var sectionBox = getAbs(sectionNode)
      if (!sectionBox || children.length === 0) return {decl: decl, bgChildId: null}

      // 90% 이상 덮는 이미지만 배경 승격. 자식이 있는 프레임(배너 등)은 제외 → 내부 텍스트/버튼 누락 방지
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
      if (!fullBleedChild) return {decl: decl, bgChildId: null}

      var dataUrlPromise =
          cache && cache.image && fullBleedChild.id != null && cache.image[fullBleedChild.id]
              ? Promise.resolve(cache.image[fullBleedChild.id])
              : exportNodeImageAsync(fullBleedChild)

      return dataUrlPromise
          .then(function (dataUrl) {
              if (fullBleedChild.id != null && dataUrl && cache && cache.image) cache.image[fullBleedChild.id] = dataUrl
              var path = cache ? getOrAssignImagePath(cache, fullBleedChild.id, dataUrl, secNo, { skipExport: isVideoNode(fullBleedChild) }) : ""
              if (path && dataUrl) {
                  var merged = decl ? decl + ";--bg-img:url(" + path + ")" : "--bg-img:url(" + path + ")"
                  return {decl: merged, bgChildId: fullBleedChild.id}
              }
              return {decl: decl, bgChildId: null}
          })
          .catch(function () {
              return {decl: decl, bgChildId: null}
          })
  })
}

// ----- Node Inspect / Dump (트리 덤프, PC/MO 매칭) -----
/** 덤프용 한 줄 요약: 타입, 이름, 플래그(FLEX/ABS/TEXT 등) */
function oneLineBase(node) {
    var t = node.type
    var name = String(node.name || "")
    var flags = []
    if (isFlex(node)) flags.push("FLEX")
    else if (node.type === "FRAME" || isContainer(node)) flags.push("ABS")
    if (node.type === "TEXT") flags.push("TEXT")
    if (hasImageFill(node)) flags.push("IMG_FILL")
    if (isVectorOnlyTree(node)) flags.push("VEC_ONLY")
    if (isCompositeCandidate(node)) flags.push("COMPOSITE?")
    return t + '  "' + name + '"' + (flags.length ? "  [" + flags.join(",") + "]" : "")
}
/** 덤프 키 정렬용 패딩 문자열 */
function dumpPadKey(key) {
    var DUMP_KEY_WIDTH = 18
    var s = key + ":"
    while (s.length < DUMP_KEY_WIDTH + 1) s += " "
    return s
}
/** 노드 배경/테두리 덤프 문자열 */
function bgDetails(node) {
    if (!node) return ""
    var parts = []
    if (hasImageFill(node)) parts.push("image")
    var solid = getFirstSolidFill(node)
    if (solid && solid.color) parts.push("color:" + solid.color)
    var stroke = getFirstSolidStroke(node)
    if (stroke && stroke.color) {
        var same = stroke.top === stroke.right && stroke.right === stroke.bottom && stroke.bottom === stroke.left
        var strokeDesc = same ? "border:" + stroke.top + "px " + (stroke.dashes ? "dashed" : "solid") + " " + stroke.color : "border T:" + stroke.top + " R:" + stroke.right + " B:" + stroke.bottom + " L:" + stroke.left + " " + (stroke.dashes ? "dashed" : "solid") + " " + stroke.color
        parts.push(strokeDesc)
    }
    if (parts.length === 0) return ""
    var s = parts.join(", ")
    if (parts.length > 1) s += " (둘 다)"
    return s
}
/** Auto Layout 노드 덤프용 flex 관련 문자열 */
function flexDetails(node) {
    if (!isFlex(node)) return ""
    var v = getLayoutVars(node)
    var parts = []
    parts.push("flex-direction:" + (v.direction || ""))
    parts.push("gap:" + (v.gap !== "" ? v.gap : "0"))
    parts.push("padding:" + [v.pt, v.pr, v.pb, v.pl].join(" "))
    parts.push("justify-content:" + (v.justify || ""))
    parts.push("align-items:" + (v.align || ""))
    parts.push("flex-wrap:" + (v.wrap || ""))
    return parts.join("; ")
}
/** 자식 노드 layout sizing/align 덤프 문자열 */
function layoutChildDetails(node) {
    var parts = []
    try {
        var box = getAbs(node)
        if ("layoutSizingHorizontal" in node && node.layoutSizingHorizontal) {
            var w = node.layoutSizingHorizontal
            if (w === "FILL") parts.push("width:fill")
            else if (w === "HUG") parts.push("width:auto")
            else if (w === "FIXED" && box && box.w != null) parts.push("width:" + r2(box.w) + "px")
        }
        if ("layoutSizingVertical" in node && node.layoutSizingVertical) {
            var h = node.layoutSizingVertical
            if (h === "FILL") parts.push("height:fill")
            else if (h === "HUG") parts.push("height:auto")
            else if (h === "FIXED" && box && box.h != null) parts.push("height:" + r2(box.h) + "px")
        }
        if ("layoutAlign" in node && node.layoutAlign && node.layoutAlign !== "INHERIT") {
            var a = String(node.layoutAlign).toUpperCase()
            if (a === "STRETCH") parts.push("align-self:stretch")
            else if (a === "MIN") parts.push("align-self:flex-start")
            else if (a === "CENTER") parts.push("align-self:center")
            else if (a === "MAX") parts.push("align-self:flex-end")
        }
        if ("layoutGrow" in node && node.layoutGrow !== undefined) parts.push("flex-grow:" + node.layoutGrow)
    } catch (e) {}
    return parts.length ? parts.join("; ") : ""
}

/** width:fill + 부모 flex-start일 때만 width:100% 반환 (코드 생성용) */
function getFillFlexStartWidthDecl(node, parent) {
    if (!node || !parent || !isFlex(parent)) return ""
    if (node.layoutSizingHorizontal !== "FILL") return ""
    var pv = getLayoutVars(parent)
    var isColumn = pv.direction === "column"
    if (isColumn && pv.align === "flex-start") return "width:100%"
    if (!isColumn && pv.justify === "flex-start") return "width:100%"
    return ""
}

/** 선택 2개 시 가로 큰 쪽=데스크톱, 작은 쪽=모바일. breakpoint = 모바일 width */
function resolveDesktopMobile(sel) {
    if (!sel || sel.length < 2) return null
    var a = sel[0]
    var b = sel[1]
    var wa = (getAbs(a) && getAbs(a).w) != null ? getAbs(a).w : 0
    var wb = (getAbs(b) && getAbs(b).w) != null ? getAbs(b).w : 0
    if (wa >= wb) return {desktopRoot: a, mobileRoot: b, breakpoint: r2(wb) || 750}
    return {desktopRoot: b, mobileRoot: a, breakpoint: r2(wa) || 750}
}

/** ROOT의 섹션으로 쓸 노드 목록. 래퍼 1개(직계 자식 1개 컨테이너)면 그 자식들을 섹션으로 사용 → 모바일 프레임 구조 대응 */
function getSectionNodes(root) {
    if (!root || !isContainer(root)) return []
    var kids = (root.children || []).filter(function (c) { return c && isVisible(c) })
    if (kids.length === 1 && isContainer(kids[0])) {
        var inner = (kids[0].children || []).filter(function (c) { return c && isVisible(c) })
        if (inner.length > 0) return inner
    }
    return kids
}

/** PC/MO 루트가 동일한 레이어 순서·구조인지 (visible 자식 기준, 타입·순서만 비교) */
function isSameLayerStructure(desktopRoot, mobileRoot) {
    if (!desktopRoot || !mobileRoot) return false
    var dKids = (desktopRoot.children || []).filter(function (c) {
        return c && isVisible(c)
    })
    var mKids = (mobileRoot.children || []).filter(function (c) {
        return c && isVisible(c)
    })
    if (dKids.length !== mKids.length) return false
    for (var i = 0; i < dKids.length; i++) {
        if (dKids[i].type !== mKids[i].type) return false
        if (isContainer(dKids[i]) && isContainer(mKids[i])) {
            if (!isSameLayerStructure(dKids[i], mKids[i])) return false
        }
    }
    return true
}

/** PC HTML 기준 MO 미디어쿼리 오버라이드 (visible 자식 1:1 매칭, diff만 출력) */
function buildMobileOverrides(desktopRoot, mobileRoot, breakpoint, options) {
    options = options || {}
    var exportedSet = options.exportedNodeIds || null
    var ownImageSet = options.ownImageNodeIds || null
    function isExported(id) {
        if (!exportedSet || id == null) return true
        return exportedSet[String(id)] === true
    }
    function hasOwnImageFigure(id) {
        if (!ownImageSet || id == null) return true
        return ownImageSet[String(id)] === true
    }
    var lines = []
    var bp = Number(breakpoint) || 750
    lines.push("")
    lines.push("@media (max-width:" + bp + "px){")
    lines.push("  .ap-post__inner{ --ap-width:" + bp + "; }")
    lines.push("  .ap-video{ width:100%; height:auto; }")

    if (!isContainer(desktopRoot) || !isContainer(mobileRoot)) {
        lines.push("}")
        return lines.join("\n")
    }

    function walkPair(dNode, mNode, mParent, secClass, imageByName, imageOverrideDone, textByName, textOverrideDone, semMap) {
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
                    walkPair(d, m, m, secClass, imageByName, imageOverrideDone, textByName, textOverrideDone, semMap)
                continue
            }
            var sel = ""
            var declParts = []
            if (d.type === "FRAME" && isContainer(d)) {
                sel = ".ap-section--" + secClass + " " + cssInnerSelForNode(String(d.id), moOpts, false)
                if (isFlex(m)) {
                    var flexDiff = buildFlexVarsDeclDiff(isFlex(d) ? getLayoutVars(d) : null, getLayoutVars(m))
                    if (flexDiff) declParts.push(flexDiff)
                }
                var mAbs = isAbsoluteLike(m, mNode)
                if (mAbs) {
                    var ad = buildAbsDeclDiff(d, dNode, m, mNode)
                    if (ad) declParts.push(ad)
                } else {
                    var fillW = getFillFlexStartWidthDecl(m, mNode)
                    var fillWD = getFillFlexStartWidthDecl(d, dNode)
                    if (fillW && fillW !== fillWD) declParts.push(fillW)
                    else {
                        var mBox = getAbs(m)
                        var dBox = getAbs(d)
                        var mFixed = mBox && mBox.w != null && m.layoutSizingHorizontal === "FIXED"
                        if (mFixed && r2(mBox.w) !== r2(dBox && dBox.w != null ? dBox.w : 0)) declParts.push("width:calc(" + r2(mBox.w) + "/var(--ap-width)*100cqi)")
                    }
                }
                var strokeDiff = buildStrokeDeclDiff(d, m)
                if (strokeDiff) declParts.push(strokeDiff)
                // 모바일에서도 min-height 오버라이드(데스크톱만 적용되던 min-height가 미디어쿼리에서 덮이도록)
                var mBoxH = getAbs(m)
                if (mBoxH && mBoxH.h != null) declParts.push("min-height:calc(" + r2(mBoxH.h) + "/var(--ap-width)*100cqi)")
            } else if (d.type === "TEXT" && m.type === "TEXT") {
                sel = ".ap-section--" + secClass + " " + cssInnerSelForNode(String(d.id), moOpts, false)
                var tsD = getTextSummarySync(d)
                var tsM = getTextSummarySync(m)
                if (tsM) {
                    var textDecl = buildTextVarsDeclDiff(tsD, tsM)
                    if (textDecl) declParts.push(textDecl)
                    if (textOverrideDone && d.id != null) textOverrideDone[String(d.id)] = true
                }
            } else {
                var leafSelRaw = getLeafSelectorForNode(d, moOpts)
                sel = leafSelRaw ? ".ap-section--" + secClass + " " + leafSelRaw.replace(/,/g, ", .ap-section--" + secClass + " ") : ""
                if (isFlex(m)) {
                    var flexDiff2 = buildFlexVarsDeclDiff(isFlex(d) ? getLayoutVars(d) : null, getLayoutVars(m))
                    if (flexDiff2) declParts.push(flexDiff2)
                }
                var fillW2 = getFillFlexStartWidthDecl(m, mNode)
                var fillW2D = getFillFlexStartWidthDecl(d, dNode)
                if (fillW2 && fillW2 !== fillW2D) declParts.push(fillW2)
                var mAbs2 = isAbsoluteLike(m, mNode)
                if (mAbs2) {
                    var ad2 = buildAbsDeclDiff(d, dNode, m, mNode)
                    if (ad2) declParts.push(ad2)
                }
                var strokeDiff2 = buildStrokeDeclDiff(d, m)
                if (strokeDiff2) declParts.push(strokeDiff2)
            }
            if (declParts.length && isExported(d.id)) lines.push("  " + sel + "{ " + declParts.join(";") + " }")
            if ((isVectorOnlyTree(d) || hasImageFill(d) || isImageCandidate(d)) && isExported(d.id) && hasOwnImageFigure(d.id)) {
                var sizeDecl = ""
                var leafSel = ""
                if (isLineLikeNode(d)) {
                    sizeDecl = buildLineVarsDeclDiff(d, m)
                    leafSel = cssInnerSelForNode(String(d.id), moOpts, false)
                } else if (d.type === "ELLIPSE") {
                    sizeDecl = buildEllipseVarsDeclDiff(d, m)
                    leafSel = cssInnerSelForNode(String(d.id), moOpts, false)
                } else if (isVideoNode(d)) {
                    sizeDecl = getVideoSizeDeclDiff(d, m)
                    leafSel = cssInnerSelForNode(String(d.id), moOpts, false)
                } else {
                    sizeDecl = getImageSizeDeclDiff(d, m)
                    leafSel = cssInnerSelForNode(String(d.id), moOpts, true)
                    if (imageOverrideDone && d.id != null) imageOverrideDone[String(d.id)] = true
                }
                if (sizeDecl && leafSel) {
                    lines.push("  .ap-section--" + secClass + " " + leafSel + "{ " + sizeDecl + " }")
                }
            }
            if (d.type === "FRAME" && isContainer(d))
                walkPair(d, m, m, secClass, imageByName, imageOverrideDone, textByName, textOverrideDone, semMap)
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
        if (getSlideItems(mSec)) {
            lines.push("  .ap-section--" + secClass + "{ min-height:auto; }")
        }
        if (mSecBox && mSecBox.h != null) {
            lines.push("  .ap-section--" + secClass + "{ --ap-section-h:" + r2(mSecBox.h) + "; }")
        }
        if (isFlex(mSec)) {
            var secLvDiff = buildFlexVarsDeclDiff(isFlex(dSec) ? getLayoutVars(dSec) : null, getLayoutVars(mSec))
            if (secLvDiff) lines.push("  .ap-section--" + secClass + ".ap-flex{ " + secLvDiff + " }")
        }
        var secStrokeDiff = buildStrokeDeclDiff(dSec, mSec)
        if (secStrokeDiff) lines.push("  .ap-section--" + secClass + "{ " + secStrokeDiff + " }")
        var secImageByName = collectImageNodesByName(mSec)
        var secTextByName = collectTextNodesByName(mSec)
        var sectionImageOverrideDone = {}
        var sectionTextOverrideDone = {}
        var deskSem = buildSectionSemanticClasses(dSec, (options && options.geoStructure) || null)
        var deskMoOpts = { sectionSemantics: deskSem }
        walkPair(dSec, mSec, mSec, secClass, secImageByName, sectionImageOverrideDone, secTextByName, sectionTextOverrideDone, deskSem)
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
                        lines.push(
                            "  .ap-section--" + secCls + " " + cssInnerSelForNode(String(dNode.id), deskMoOpts, true) + "{ " + decl + " }"
                        )
                }
            }
            if (isContainer(dNode)) for (var j = 0; j < dNode.children.length; j++) pushImageOverridesByName(dNode.children[j], secCls, imgByName, overrideDone)
        }
        pushImageOverridesByName(dSec, secClass, secImageByName, sectionImageOverrideDone)
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
                        var textDecl = buildTextVarsDeclDiff(tsD, tsM)
                        if (textDecl) {
                            lines.push(
                                "  .ap-section--" +
                                    secCls +
                                    " " +
                                    cssInnerSelForNode(String(dNode.id), deskMoOpts, false) +
                                    "{ " +
                                    textDecl +
                                    " }"
                            )
                        }
                    }
                }
            }
            if (isContainer(dNode)) for (var j = 0; j < dNode.children.length; j++) pushTextOverridesByName(dNode.children[j], secCls, txtByName, overrideDone)
        }
        pushTextOverridesByName(dSec, secClass, secTextByName, sectionTextOverrideDone)
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
    if (!code || typeof code !== "string") return {baseStyles: "", sectionStyles: "", articleHtml: ""}
    var styleStart = code.indexOf("<style>")
    var styleEnd = code.indexOf("</style>")
    if (styleStart < 0 || styleEnd < 0 || styleEnd <= styleStart) return {baseStyles: "", sectionStyles: "", articleHtml: ""}
    var fullStyle = code.substring(styleStart + 7, styleEnd).trim()
    var sectionStart = fullStyle.search(/\n\.ap-section--/)
    var baseStyles = sectionStart >= 0 ? fullStyle.substring(0, sectionStart) : fullStyle
    var sectionStyles = sectionStart >= 0 ? fullStyle.substring(sectionStart).trim() : ""
    var articleHtml = code.substring(styleEnd + 8).trim()
    return {baseStyles: baseStyles, sectionStyles: sectionStyles, articleHtml: articleHtml}
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

/** PC HTML + @media로 MO 스타일 오버라이드. MO 이미지는 picture/source로 전환 */
function combinePcMoAsBreakpoint(pcCode, desktopRoot, mobileRoot, breakpoint, options) {
    options = options || {}
    var pc = parseCodeIntoParts(pcCode)
    var base = pc.baseStyles || ""
    var sectionStyles = pc.sectionStyles || ""
    var overrides = buildMobileOverrides(desktopRoot, mobileRoot, breakpoint, options)
    overrides = injectBgOverridesForMo(sectionStyles, overrides)

    var styleBlock = "<style>\n" + base + "\n" + (sectionStyles ? sectionStyles + "\n" : "") + overrides + "\n</style>\n\n"
    var articleHtml = pc.articleHtml || ""
    var bp = Number(breakpoint) || 750
    articleHtml = articleHtml.replace(/<img\s+([^>]*?)src="(assets\/images\/page_[a-zA-Z0-9_-]+_sec\d+_img\d+)\.(png|jpg|jpeg)"([^>]*)>/gi, function (_, before, basePath, ext, after) {
        if (String(ext).toLowerCase() === "svg") { return "<img " + before + "src=\"" + basePath + "." + ext + "\"" + after + ">"; }
        return '<picture><source media="(max-width:' + bp + 'px)" srcset="' + basePath + "_mo." + ext + '"><img ' + before + 'src="' + basePath + "." + ext + '"' + after + "></picture>"
    })
    return styleBlock + articleHtml
}
/** 선택 루트 트리 덤프 + HTML/CSS 생성 + 이미지 export → 결과 및 이미지 목록 반환 */
function dumpTreeAsync(root, projectName, allowedFonts, options) {
    options = options || {}
    var prevExportWidth = _currentExportWidth
    if (options.exportWidth != null) _currentExportWidth = Math.max(200, Number(options.exportWidth))

    var cache = {
        projectName: normalizeProjectName(projectName),
        allowedFonts: Array.isArray(allowedFonts)
            ? allowedFonts
                  .map(function (f) {
                      return String(f).trim().toLowerCase()
                  })
                  .filter(Boolean)
            : [],
        imageSuffix: options.imageSuffix != null ? String(options.imageSuffix) : "",
        usedFonts: {},
        text: {},
        textMeta: {},
        image: {},
        imageName: {},
        imageList: [],
        imgCountBySec: {},
    }

    var rootBox = getAbs(root)
    var rootSummary = ["", "  ─── LAYER INSPECT ───", "  ROOT    " + oneLineBase(root)]
    if (rootBox) rootSummary.push("  " + dumpPadKey("ROOT_BOX") + "x=" + rootBox.x + " y=" + rootBox.y + " w=" + rootBox.w + " h=" + rootBox.h)
    rootSummary.push("")

    var sectionNodes = getSectionNodes(root)
    if (!sectionNodes || sectionNodes.length === 0) {
        return Promise.reject(new Error("보이는 섹션이 없습니다. ROOT 프레임의 직계 자식(또는 래퍼 안)에 표시된 레이어가 있는지 확인하세요."))
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
                    if (f) cache.usedFonts[f] = true
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
                var secNo = sectionIndex != null ? sectionIndex : 1
                var path = getOrAssignImagePath(cache, node.id, dataUrl, secNo, { skipExport: isVideoNode(node) })
                if (path) props.push(indent(depth + 1) + dumpPadKey("bgImage") + path)
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

    var legend = ["", "  ─── LEGEND ───", "  ROOT = 선택 1개 | 직계 자식 = ap-section (ap-section--01..)", "  " + dumpPadKey("flex") + "AutoLayout 정보", "  " + dumpPadKey("layoutChild") + "width/height(fill|auto|Npx), align-self, flex-grow", "  " + dumpPadKey("bg") + "배경: image, color:#hex, border (둘 다 있으면 둘 다 표기, export는 image 우선)", "  " + dumpPadKey("bgImage") + "image일 때 내보낸 이미지 경로 (assets/images/...)", "  " + dumpPadKey("sectionRelative") + "해당 ap-section 기준 상대 좌표 (x,y,w,h)", ""]

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
            return buildCodeAsync(root, cache, sectionNodes, options.geoStructure || null).then(function (result) {
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

// ----- Code Builder (node-id 기반 HTML/CSS 생성) -----
/** 루트 노드와 캐시로 전체 HTML/CSS 문자열 생성 (섹션별 스타일·article 본문) */
function buildCodeAsync(root, cache, sectionNodesParam, geoStructure) {
    var codeLines = []
    var deferredStyles = []
    var exportedNodeIds = {}
    var ownImageNodeIds = {}
    var ctx = {deferredStyles: deferredStyles, exportedNodeIds: exportedNodeIds, ownImageNodeIds: ownImageNodeIds}

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
    codeLines.push("  min-height:calc(var(--ap-section-h, 0) / var(--ap-width) * 100cqi);")
    codeLines.push("  background-color:var(--bgc,transparent);")
    codeLines.push("  background-image:var(--bg-img,none);")
    codeLines.push("  background-repeat:no-repeat;")
    codeLines.push("  background-position:center;")
    codeLines.push("  background-size:100% 100%;")
    codeLines.push("}")
    codeLines.push("")
    codeLines.push(".ap-flex {")
    codeLines.push("  display:flex;")
    codeLines.push("  flex-direction:var(--ap-direction);")
    codeLines.push("  flex-wrap:var(--ap-wrap);")
    codeLines.push("  justify-content:var(--ap-justify);")
    codeLines.push("  align-items:var(--ap-align);")
    codeLines.push("  gap:calc(var(--ap-gap)/var(--ap-width)*100cqi);")
    codeLines.push("  padding-top:calc(var(--ap-pt)/var(--ap-width)*100cqi);")
    codeLines.push("  padding-right:calc(var(--ap-pr)/var(--ap-width)*100cqi);")
    codeLines.push("  padding-bottom:calc(var(--ap-pb)/var(--ap-width)*100cqi);")
    codeLines.push("  padding-left:calc(var(--ap-pl)/var(--ap-width)*100cqi);")
    codeLines.push("}")
    codeLines.push(".ap-frame { position:relative; }")
    codeLines.push("")

    codeLines.push(".ap-abs{ position:absolute; }")
    codeLines.push("")

    // text
    codeLines.push(".ap-text {")
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

    // image: 인라인은 --ap-w로 크기, absolute는 wrapper 크기에 맞춤(중복 제거)
    codeLines.push(".ap-image img {")
    codeLines.push("  width:calc(var(--ap-w, 0) / var(--ap-width) * 100cqi);")
    codeLines.push("  height:auto;max-width:100%;")
    codeLines.push("  display:block;")
    codeLines.push("}")
    codeLines.push(".ap-image.ap-abs img { width:100%; height:100%; object-fit:contain; }")
    codeLines.push("")
    codeLines.push(".ap-video {")
    codeLines.push("  display:flex; align-items:center; justify-content:center;")
    codeLines.push("  background:#eee;")
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
    // </style>는 deferred 스타일 합친 뒤에 한 번만 닫음

    var contentLines = []
    contentLines.push('<article class="ap-post">')
    contentLines.push('  <div class="ap-post__inner">')

    // root children = sections
    var sectionCount = isContainer(root) ? root.children.length : 0
    var sectionIndex = 0
    var hasSlideSection = false

    function selInSection(secClass, innerSel) {
        // 쉼표로 구분된 복합 선택자 각각에 prefix 적용
        // e.g. .ap-text[...], .ap-image[...] -> .ap-section--01 .ap-text[...], .ap-section--01 .ap-image[...]
        return ".ap-section--" + secClass + " " + innerSel.replace(/,/g, ", .ap-section--" + secClass + " ")
    }

    function pushTextNodeDeferredStyles(ctx, secClass, id, ts, node, parent, textAbs, includeAbs, ropts) {
        if (includeAbs === undefined) includeAbs = true
        var inner = cssInnerSelForNode(id, ropts || {}, false)
        var decl = buildTextVarsDecl(ts)
        if (decl) pushDeferredStyle(ctx, selInSection(secClass, inner), decl)
        if (includeAbs && textAbs && id) {
            var textAbsDecl = buildAbsDecl(node, parent)
            if (textAbsDecl) pushDeferredStyle(ctx, selInSection(secClass, inner), textAbsDecl)
        }
        var partResult = buildTextPartInnerHtml(ts)
        var parentStyle = typeof partResult === "string" ? "" : (partResult.parentStyle || "")
        if (parentStyle && id) pushDeferredStyle(ctx, selInSection(secClass, inner), parentStyle)
    }

    function buildTextNodeHtml(ts, node, textCls, dataIdAttr, depth) {
        var partResult = buildTextPartInnerHtml(ts)
        var innerHtml = typeof partResult === "string" ? partResult : partResult.inner
        var tag = textNodeTag(node, textCls, dataIdAttr, depth)
        var html = indent(depth) + tag.open + innerHtml + tag.close
        return isBtnNode(node) ? html : wrapIfBtn(node, html, depth)
    }

    // TEXT: 허용 폰트 목록에 없으면 이미지로 내보냄 (project 이미지와 동일하게 path 사용)
    function renderTextNodeAsync(node, parent, secNo, secClass, depth, opts) {
        var id = node.id != null ? String(node.id) : ""
        var dataIdAttr = ""
        var textAbs = isAbsoluteLike(node, parent)
        var textCls = apNodeClassList("ap-text" + (textAbs ? " ap-abs" : ""), id, opts)
        return getTextSummaryAsync(node)
            .then(function (ts) {
                var allowed = cache.allowedFonts || []
                var fontFamilyLower = (ts.fontFamily || "").toLowerCase().trim()
                var families = ts.fontFamilies && ts.fontFamilies.length ? ts.fontFamilies : ts.fontFamily ? [ts.fontFamily] : []
                var fontAllowed =
                    allowed.length === 0 ||
                    (families.length > 0 &&
                        families.every(function (f) {
                            return allowed.indexOf(String(f).toLowerCase().trim()) >= 0
                        }))

                if (fontAllowed) {
                    pushTextNodeDeferredStyles(ctx, secClass, id, ts, node, parent, textAbs, true, opts)
                    return buildTextNodeHtml(ts, node, textCls, dataIdAttr, depth)
                }

                return exportNodeImageAsync(node)
                    .then(function (dataUrl) {
                        if (!dataUrl) {
                            pushTextNodeDeferredStyles(ctx, secClass, id, ts, node, parent, textAbs, true, opts)
                            return buildTextNodeHtml(ts, node, textCls, dataIdAttr, depth)
                        }
                        if (node.id != null && cache && cache.image) cache.image[node.id] = dataUrl
                        var path = cache ? getOrAssignImagePath(cache, node.id, dataUrl, secNo, { skipExport: isVideoNode(node) }) : dataUrl
                        var altText = getImageAltText(node)
                        if (id) ctx.ownImageNodeIds[id] = true
                        var imgWrapCls = apNodeClassList("ap-image", id, opts)
                        pushDeferredImageImgSizeVars(ctx, secClass, id, node, opts, false)
                        return wrapIfBtn(node, indent(depth) + '<div class="' + imgWrapCls + '"><img src="' + (path || "") + '" alt="' + altText + '" /></div>', depth)
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
                if (lineAbsDecl) pushDeferredStyle(ctx, selInSection(secClass, cssInnerSelForNode(id, opts, false)), lineAbsDecl)
            }
            var lineVars = buildLineVarsDecl(node)
            if (lineVars) pushDeferredStyle(ctx, selInSection(secClass, cssInnerSelForNode(id, opts, false)), lineVars)
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
                if (ellipseAbsDecl) pushDeferredStyle(ctx, selInSection(secClass, cssInnerSelForNode(id, opts, false)), ellipseAbsDecl)
            }
            var ellipseVars = buildEllipseVarsDecl(node)
            if (ellipseVars) pushDeferredStyle(ctx, selInSection(secClass, cssInnerSelForNode(id, opts, false)), ellipseVars)
            var ellipseCls = apNodeClassList("ap-ellipse" + (ellipseNeedWrapper ? " ap-abs" : ""), id, opts)
            var ellipseHtml = '<div class="' + ellipseCls + '"></div>'
            return Promise.resolve(wrapIfBtn(node, indent(depth) + ellipseHtml, depth))
        }
        return exportNodeSvgAsync(node).then(function (dataUrl) {
            if (dataUrl && node.id != null && cache && cache.image) cache.image[node.id] = dataUrl
            var path = cache ? getOrAssignImagePath(cache, node.id, dataUrl || "", secNo, { skipExport: isVideoNode(node) }) : dataUrl || ""
            var altText = getImageAltText(node)
            if (id) ctx.ownImageNodeIds[id] = true
            var svgImgCls = apNodeClassList("ap-image", id, opts)
            pushDeferredImageImgSizeVars(ctx, secClass, id, node, opts, false)
            var html = indent(depth) + '<div class="' + svgImgCls + '"><img src="' + (path || "") + '" alt="' + altText + '" /></div>'
            return wrapIfBtn(node, html, depth)
        })
    }

    // IMAGE (단일 이미지 또는 컴포지트 → 하나의 이미지로 export)
    // 컨테이너에 텍스트가 있으면 이미지로보내지 않고 자식 재귀 렌더 (텍스트 유지)
    // 겹친 composite(clipsContent)일 때만 한 장으로 export. 분리된 이미지 2개 이상이면 ap-frame으로 풀어서 각각 figure로
    function renderImageNodeAsync(node, parent, secNo, secClass, depth, opts) {
        var id = node.id != null ? String(node.id) : ""
        if (isContainer(node) && hasMultipleImageLikeChildren(node) && !isCompositeCandidate(node)) {
            var absImgGrp = isAbsoluteLike(node, parent)
            var declPartsImgGrp = []
            return buildBackgroundDeclAsync(node, false, cache, secNo).then(function (bgImgGrp) {
                if (bgImgGrp) declPartsImgGrp.push(bgImgGrp)
                var strokeImgGrp = buildStrokeDecl(node)
                if (strokeImgGrp) declPartsImgGrp.push(strokeImgGrp)
                if (absImgGrp) {
                    var absImgGrpDecl = buildAbsDecl(node, parent)
                    if (absImgGrpDecl) declPartsImgGrp.push(absImgGrpDecl)
                }
                if (isFlex(node)) {
                    var lvImgGrp = getLayoutVars(node)
                    var flexImgGrp = buildFlexVarsDecl(lvImgGrp)
                    if (flexImgGrp) declPartsImgGrp.push(flexImgGrp)
                }
                var fillWImgGrp = getFillFlexStartWidthDecl(node, parent)
                if (fillWImgGrp) declPartsImgGrp.push(fillWImgGrp)
                if (declPartsImgGrp.length && id) {
                    pushDeferredStyle(ctx, selInSection(secClass, cssInnerSelForNode(id, opts, false)), declPartsImgGrp.join(";"))
                }
                var chunksImg = []
                var imgGrpFrameCls = apNodeClassList("ap-frame" + (absImgGrp ? " ap-abs" : "") + (isFlex(node) ? " ap-flex" : ""), id, opts)
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
        return exportImagePreferSourceBytesAsync(node).then(function (dataUrl) {
            if (dataUrl && node.id != null && cache && cache.image) cache.image[node.id] = dataUrl
            var path = cache ? getOrAssignImagePath(cache, node.id, dataUrl || "", secNo, { skipExport: isVideoNode(node) }) : dataUrl || ""
            if (imgAbs && id) {
                var imgAbsDecl = buildAbsDecl(node, parent)
                if (imgAbsDecl) pushDeferredStyle(ctx, selInSection(secClass, cssInnerSelForNode(id, opts, false)), imgAbsDecl)
            }
            var altText = getImageAltText(node)
            if (id) ctx.ownImageNodeIds[id] = true
            var figureCls = apNodeClassList("ap-image" + (imgAbs ? " ap-abs" : ""), id, opts)
            pushDeferredImageImgSizeVars(ctx, secClass, id, node, opts, imgAbs)
            var figureHtml = '<div class="' + figureCls + '"><img src="' + (path || "") + '" alt="' + altText + '" /></div>'
            return wrapIfBtn(node, indent(depth) + figureHtml, depth)
        })
    }

    function renderFrameNodeAsync(node, parent, secNo, secClass, depth, opts) {
        var id = node.id != null ? String(node.id) : ""
        var abs = isAbsoluteLike(node, parent)
        var flex = isFlex(node)
        var box = getAbs(node)
        var parentBox = parent ? getAbs(parent) : null
        var isFullWidth = node.layoutSizingHorizontal === "FILL" ||
            (parentBox && box && box.w != null && parentBox.w != null && r2(box.w) === r2(parentBox.w))

        var cls = apNodeClassList("ap-frame" + (abs ? " ap-abs" : "") + (flex ? " ap-flex" : ""), id, opts)

        // style decl for this frame: flex vars + bg (frame는 background-image 가능)
        var declParts = []

        if (flex) {
            var lv = getLayoutVars(node)
            var flexDecl = buildFlexVarsDecl(lv)
            if (flexDecl) declParts.push(flexDecl)
        }

        if (isFullWidth) {

            declParts.push("width:100%")

        }

        if (!isFullWidth) {
            var fillWidthDecl = getFillFlexStartWidthDecl(node, parent)
            if (fillWidthDecl) declParts.push(fillWidthDecl)
            else if (!abs) {
                var sizingH = node.layoutSizingHorizontal
                if (sizingH === "FIXED" && box && box.w != null) declParts.push("width:calc(" + box.w + "/var(--ap-width)*100cqi)")
            }
        }

        // frame height: 배경(fill/이미지) 또는 stroke가 있을 때만 고정. 없으면 생략해 콘텐츠 증가 시 유지보수에 유리.
        return buildBackgroundDeclAsync(node, false, cache, secNo).then(function (bgDecl) {
            if (bgDecl) {
                declParts.push(bgDecl)
                var hasWidth = declParts.some(function (s) { return String(s).indexOf("width:") !== -1 })
                if (box && box.w != null && !hasWidth) declParts.push("width:calc(" + box.w + "/var(--ap-width)*100cqi)")
            }
            var strokeDecl = buildStrokeDecl(node)
            if (strokeDecl) declParts.push(strokeDecl)
            var radiusDecl = buildCornerRadiusDecl(node)
            if (radiusDecl) declParts.push(radiusDecl)
            // min-height: 시각적 영역이 있을 때 최소 높이만 지정 → 콘텐츠가 늘어나도 잘리지 않고 유연하게 확장.
            // ・배경(fill/이미지): bgDecl
            // ・테두리: strokeDecl
            // ・모서리 둥글기: radiusDecl (박스 느낌 있음)
            // ・height 대신 min-height 사용 시 다국어/긴 텍스트 오버플로우 방지.
            if (box && box.h != null && (bgDecl || strokeDecl || radiusDecl)) declParts.push("min-height:calc(" + box.h + "/var(--ap-width)*100cqi)")

            // abs 좌표(부모 기준)
            if (abs) {
                var absDecl = buildAbsDecl(node, parent)
                if (absDecl) declParts.push(absDecl)
            }

            if (declParts.length) {
                pushDeferredStyle(ctx, selInSection(secClass, cssInnerSelForNode(id, opts, false)), declParts.join(";"))
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
                        return Promise.resolve(buildFlexVarsDecl(lv2))
                    })(),
                ]).then(function (res) {
                    var itemDeclParts = [res[2], res[0]].filter(Boolean)
                    if (res[1] && !isImageCandidate(ch)) itemDeclParts.push(res[1])
                    var strokeDeclCh = buildStrokeDecl(ch)
                    if (strokeDeclCh) itemDeclParts.push(strokeDeclCh)
                    var fillWidthCh = getFillFlexStartWidthDecl(ch, node)
                    if (fillWidthCh) itemDeclParts.push(fillWidthCh)
                    var itemDecl = itemDeclParts.join(";")

                    if (itemDecl && leafSel) {
                        pushDeferredStyle(ctx, selInSection(secClass, leafSel), itemDecl)
                    }

                    // GROUP 등 컨테이너는 renderNodeAsync가 ap-frame 래퍼를 이미 출력
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
        var declParts2Visual = []  // 배경/테두리/abs → 있으면 반드시 ap-frame 유지
        var declParts2Flex = []

        return buildBackgroundDeclAsync(node, false, cache, secNo).then(function (bgDecl2) {
            if (bgDecl2) declParts2Visual.push(bgDecl2)
            var strokeDecl2 = buildStrokeDecl(node)
            if (strokeDecl2) declParts2Visual.push(strokeDecl2)

            if (abs2) {
                var absDecl3 = buildAbsDecl(node, parent)
                if (absDecl3) declParts2Visual.push(absDecl3)
            }

            if (isFlex(node)) {
                var lv3 = getLayoutVars(node)
                var flexDecl3 = buildFlexVarsDecl(lv3)
                if (flexDecl3) declParts2Flex.push(flexDecl3)
            }

            var fillWidthDecl2 = getFillFlexStartWidthDecl(node, parent)
            if (fillWidthDecl2) declParts2Flex.push(fillWidthDecl2)

            var children2 = node.children || []
            var visibleChildren = children2.filter(function (c) { return c && (opts && opts.includeHidden ? true : isVisible(c)) })
            var singleChild = visibleChildren.length === 1 ? visibleChildren[0] : null
            var groupHasVisualAttrs = declParts2Visual.length > 0
            var declParts2 = declParts2Visual.concat(declParts2Flex)
            var groupHasAttrs = declParts2.length > 0
            var skipGroupWrapper = singleChild && !groupHasVisualAttrs

            if (groupHasAttrs && id && !skipGroupWrapper) {
                pushDeferredStyle(ctx, selInSection(secClass, cssInnerSelForNode(id, opts, false)), declParts2.join(";"))
            }

            if (skipGroupWrapper) {
                if (declParts2Flex.length > 0) {
                    var childSel = getLeafSelectorForNode(singleChild, opts)
                    if (childSel) pushDeferredStyle(ctx, selInSection(secClass, childSel), declParts2Flex.join(";"))
                }
                return renderNodeAsync(singleChild, node, secNo, secClass, depth, opts)
            }

            var isGroupBtn = isBtnNode(node)
            var groupTag = isGroupBtn ? "a" : "div"
            var frameCls = apNodeClassList("ap-frame" + (abs2 ? " ap-abs" : "") + (isFlex(node) ? " ap-flex" : ""), id, opts)
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

        // 레이어 이름이 video면 그룹/프레임 여부와 관계없이 비디오 플레이스홀더로 출력
        if (isVideoNode(node)) {
            var videoAbs = isAbsoluteLike(node, parent)
            var videoParentWraps = parent && parent.type === "FRAME" && isContainer(parent)
            var videoNeedWrapper = videoAbs && (!videoParentWraps || (node.type === "FRAME" && isContainer(node)))
            if (videoAbs && id) {
                var videoAbsDecl = buildAbsDecl(node, parent)
                if (videoAbsDecl) pushDeferredStyle(ctx, selInSection(secClass, cssInnerSelForNode(id, opts, false)), videoAbsDecl)
            } else if (id) {
                var videoSizeDecl = getImageSizeDecl(node)
                if (videoSizeDecl) pushDeferredStyle(ctx, selInSection(secClass, cssInnerSelForNode(id, opts, false)), videoSizeDecl)
            }
            var videoCls = apNodeClassList("ap-video" + (videoNeedWrapper ? " ap-abs" : ""), id, opts)
            var videoHtml = '<div class="' + videoCls + '"><video src="" controls playsinline muted loop autoplay preload="metadata"></video></div>'
            return Promise.resolve(wrapIfBtn(node, indent(depth) + videoHtml, depth))
        }

        // VECTOR — LINE/line/ELLIPSE는 CSS로 그리기, 나머지는 SVG export
        if (isVectorOnlyTree(node)) {
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
            if (declParts.length && id) pushDeferredStyle(ctx, selInSection(secClass, cssInnerSelForNode(id, opts, false)), declParts.join(";"))
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
            if (fillWidthVirtual) itemDeclParts.push(fillWidthVirtual)
            var itemDecl = itemDeclParts.join(";")
            if (itemDecl && leafSel) pushDeferredStyle(ctx, selInSection(secClass, leafSel), itemDecl)
            if (isChContainer) return renderNodeAsync(ch, sectionNode, secNo, secClass, depth, opts)
            return renderNodeAsync(ch, sectionNode, secNo, secClass, depth, opts)
        })
    }

    function nextSection() {
        if (sectionIndex >= sectionList.length) return Promise.resolve()

        var sectionNode = sectionList[sectionIndex]
        var secNo = sectionIndex + 1
        var secClass = sectionClassPrefix(secNo)
        sectionIndex++

        if (!sectionNode || !isVisible(sectionNode)) return nextSection()

        // section style: height + background (incl child bg detection) + flex(섹션이 Auto Layout일 때)
        return buildSectionBackgroundAsync(sectionNode, cache, secNo).then(function (bg) {
            var sectionSemantics = buildSectionSemanticClasses(sectionNode, geoStructure)
            var sectionRenderOpts = {
                includeHidden: true,
                sectionSemantics: sectionSemantics,
            }
            var sectionDeclParts = []

            // 섹션 높이: 슬라이드 섹션은 min-height auto, 그 외는 --ap-section-h로 최소 높이 유지
            var box = getAbs(sectionNode)
            if (getSlideItems(sectionNode)) {
                sectionDeclParts.push("min-height:auto")
            } else if (box && box.h != null) {
                sectionDeclParts.push("--ap-section-h:" + box.h)
            }

            if (bg.decl) sectionDeclParts.push(bg.decl)

            if (isFlex(sectionNode)) {
                var sectionLayoutVars = getLayoutVars(sectionNode)
                var visibleSecChildren = (sectionNode.children || []).filter(function (c) { return c && isVisible(c) })
                if (visibleSecChildren.length === 1 && sectionLayoutVars.align === "center") {
                    sectionLayoutVars = Object.assign({}, sectionLayoutVars, { align: "flex-start" })
                }
                var sectionFlexDecl = buildFlexVarsDecl(sectionLayoutVars)
                if (sectionFlexDecl) sectionDeclParts.push(sectionFlexDecl)
            }

            if (sectionDeclParts.length) {
                pushDeferredStyle(ctx, ".ap-section--" + secClass, sectionDeclParts.join(";"))
            }

            if (sectionNode.id != null) ctx.exportedNodeIds[String(sectionNode.id)] = true

            var secClassList =
                apNodeClassList("ap-section ap-section--" + secClass + (isFlex(sectionNode) ? " ap-flex" : ""), String(sectionNode.id), {
                    sectionSemantics: {},
                })
            contentLines.push('    <section class="' + secClassList + '">')

            var slideData = getSlideItems(sectionNode)
            var slideParent = sectionNode
            var slideItems = []
            if (slideData) {
                slideParent = slideData.parent || sectionNode
                for (var si = 0; si < (slideData.items || []).length; si++) {
                    var it = slideData.items[si]
                    if (!it) continue
                    // slide 아이템 렌더에서도 bg 승격된 노드는 제외
                    if (bg.bgChildId && it.id === bg.bgChildId) continue
                    // visible은 슬라이드에서는 includeHidden 유지하되, 보통 visible만 쓰는게 안전
                    if (!isVisible(it)) continue
                    slideItems.push(it)
                }
            }

            function isSlideContainerNodeInSection(child) {
                if (!slideData || !child) return false

                // 케이스1) 섹션 자식 중 slide 그룹 1개 → slideData.parent가 그 그룹
                if (slideData.parent && child.id === slideData.parent.id) return true

                // 케이스2) 섹션 자식 중 slide 여러 개 → 자식들 자체가 이름 slide일 수 있음
                if (isSlideNode(child)) return true

                // 케이스3) 섹션 자체가 slide면(=sectionNode가 slide 이름) 이 케이스는 보통 섹션 자체를 슬라이더로 쓰는거라
                // 형제 개념이 없음. 여기선 section child들을 slideItems로 잡았으니 1-pass는 스킵하고 2-pass만 쓰고 싶으면:
                //if (isSlideNode(sectionNode)) return true

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
                        if (fillWidthVirtual) itemDeclParts.push(fillWidthVirtual)
                        var itemDecl = itemDeclParts.join(";")

                        if (itemDecl && leafSel) pushDeferredStyle(ctx, selInSection(secClass, leafSel), itemDecl)

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

                var slideCount = slideItems.length;

                contentLines.push('      <div class="swiper">')
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
                    contentLines.push('          <div class="swiper-slide" style="position:relative">')

                    if (!ch) {
                        contentLines.push("          </div>")
                        return renderSlide(idx + 1)
                    }

                    return renderSectionChildAsync(ch, slideParent, secNo, secClass, bg, 6, sectionRenderOpts).then(function (html) {
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
                    contentLines.push("")
                    return nextSection()
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
        if (hasSlideSection) {
            codeLines.push("")
            codeLines.push(".ap-section .swiper { width:100%; height:100%; min-height:200px; }")
            codeLines.push("")
        }
        codeLines.push("</style>")
        codeLines.push("")

        for (var k = 0; k < contentLines.length; k++) codeLines.push(contentLines[k])
        codeLines.push("  </div>")
        codeLines.push("</article>")

        var code = codeLines.join("\n").replace(/\u2028/g, "\n").replace(/\u2029/g, "\n")
        if (hasSlideSection) {
            // manifest networkAccess: cdnjs.cloudflare.com 만 허용 → jsdelivr 는 플러그인 UI/미리보기에서 차단됨
            var swiperCdnBase = "https://cdnjs.cloudflare.com/ajax/libs/Swiper/11.0.0"
            var swiperCss = '<link rel="stylesheet" href="' + swiperCdnBase + '/swiper-bundle.min.css">'
            var swiperScript =
                '<script src="' +
                swiperCdnBase +
                '/swiper-bundle.min.js"><\/script>\n<script>\ndocument.addEventListener(\'DOMContentLoaded\',function(){document.querySelectorAll(\'.swiper\').forEach(function(el){if(typeof Swiper!==\'undefined\')new Swiper(el,{pagination:{el:el.querySelector(\'.swiper-pagination\')},navigation:{nextEl:el.querySelector(\'.swiper-button-next\'),prevEl:el.querySelector(\'.swiper-button-prev\')}})});});\n<\/script>'
            code = swiperCss + "\n" + code + "\n" + swiperScript
        }

        return {code: code, exportedNodeIds: exportedNodeIds, ownImageNodeIds: ownImageNodeIds}
    })
}

// ----- UI Message Router (ui.html → code.js) -----
figma.ui.onmessage = function (msg) {
    if (!msg) return

    if (msg.type === "RUN_DESKTOP") {
        _currentExportWidth = IMAGE_EXPORT_MAX_WIDTH
        var sel = figma.currentPage.selection
        if (!sel || !sel.length) {
            figma.ui.postMessage({type: "ERROR", message: "선택된 레이어 없음 (ROOT 1개 선택 후 PC 분석)"})
            return
        }
        var root = sel[0]
        var projectName = msg.projectName || "project"
        var allowedFonts = msg.allowedFonts || []
        figma.ui.postMessage({type: "LOADING", value: true})

        dumpTreeAsync(root, projectName, allowedFonts, {phase: "desktop", geoStructure: msg.geoStructure || null})
            .then(function (payload) {
                figma.ui.postMessage({type: "LOADING", value: false})
                var images = payload.images || []
                figma.ui.postMessage({
                    type: "RESULT",
                    text: payload.text,
                    dataTree: payload.dataTree,
                    code: payload.code,
                    images: [],
                    imageCount: images.length,
                    vectorTypes: payload.vectorTypes,
                    usedFonts: payload.usedFonts || [],
                    mobileDataTree: undefined,
                })
                images.forEach(function (item, i) {
                    figma.ui.postMessage({type: "RESULT_IMAGES_CHUNK", index: i, name: item.name, dataUrl: item.dataUrl})
                })
                figma.ui.postMessage({type: "RESULT_IMAGES_END"})
            })
            .catch(function (e) {
                figma.ui.postMessage({type: "LOADING", value: false})
                figma.ui.postMessage({type: "ERROR", message: String(e)})
            })
        return
    }

    if (msg.type === "RUN_MOBILE") {
        _currentExportWidth = IMAGE_EXPORT_MAX_WIDTH
        var selMo = figma.currentPage.selection
        if (!selMo || selMo.length < 2) {
            figma.ui.postMessage({type: "ERROR", message: "MO 분석: ROOT 2개 선택 (가로 큰 쪽=PC, 작은 쪽=MO)"})
            return
        }
        var resolved = resolveDesktopMobile(selMo)
        var rootDesktop = resolved.desktopRoot
        var rootMobile = resolved.mobileRoot
        var breakpoint = resolved.breakpoint
        var projectNameMo = msg.projectName || "project"
        var allowedFontsMo = msg.allowedFonts || []
        figma.ui.postMessage({type: "LOADING", value: true})

        dumpTreeAsync(rootDesktop, projectNameMo, allowedFontsMo, {phase: "desktop", geoStructure: msg.geoStructure || null})
            .then(function (payload) {
                return loadFontsForMobileTreeAsync(rootMobile).then(function () {
                    return dumpTreeAsync(rootMobile, projectNameMo, allowedFontsMo, {phase: "mobile", imageSuffix: "_mo"}).then(function (moPayload) {
                        var secMatch = getSectionStructureMatch(rootDesktop, rootMobile)
                        // 구조 불일치여도 PC 기준 단일 뷰 + @media MO 오버라이드만 사용 (텍스트/이미지는 1:1 매칭 가능, frame 구조는 PC 기준·MO는 사람이 수정)
                        var code = combinePcMoAsBreakpoint(payload.code || "", rootDesktop, rootMobile, breakpoint, {
                            exportedNodeIds: payload.exportedNodeIds,
                            ownImageNodeIds: payload.ownImageNodeIds,
                            geoStructure: msg.geoStructure || null,
                        })
                        var separateViews = false
                        var images = (payload.images || []).concat(moPayload.images || [])
                        // MO 미리보기: 섹션 배경 --bg-img의 _mo 경로가 MO에서 export 안 됐을 수 있음 → PC 이미지로 채움
                        var pcParts = parseCodeIntoParts(payload.code || "")
                        var sectionStyles = pcParts.sectionStyles || ""
                        var moNames = {}
                        ;(moPayload.images || []).forEach(function (img) { moNames[img.name] = true })
                        var pcByName = {}
                        ;(payload.images || []).forEach(function (img) { pcByName[img.name] = img.dataUrl })
                        sectionStyles.replace(/--bg-img\s*:\s*url\s*\(\s*(assets\/images\/[^)]+\.(png|jpg|jpeg))\s*\)/gi, function (_, path, ext) {
                            var p = path.trim()
                            var pathMo = p.replace(new RegExp("\\." + ext + "$", "i"), "_mo." + ext)
                            if (!moNames[pathMo] && pcByName[p]) {
                                images.push({ name: pathMo, dataUrl: pcByName[p] })
                            }
                        })
                        return {payload: payload, code: code, images: images, mobileDataTree: moPayload.dataTree, separateViews: separateViews, hybridMismatchSecs: (secMatch && secMatch.mismatchSecs) ? secMatch.mismatchSecs : []}
                    })
                })
            })
            .then(function (out) {
                figma.ui.postMessage({type: "LOADING", value: false})
                var images = out.images || []
                figma.ui.postMessage({
                    type: "RESULT",
                    text: out.payload.text,
                    dataTree: out.payload.dataTree,
                    code: out.code,
                    images: [],
                    imageCount: images.length,
                    vectorTypes: out.payload.vectorTypes,
                    usedFonts: out.payload.usedFonts || [],
                    mobileDataTree: out.mobileDataTree,
                    separateViews: out.separateViews,
                    hybridMismatchSecs: out.hybridMismatchSecs,
                })
                try {
                    for (var i = 0; i < images.length; i++) {
                        var item = images[i]
                        figma.ui.postMessage({type: "RESULT_IMAGES_CHUNK", index: i, name: item.name, dataUrl: item.dataUrl})
                    }
                } catch (chunkErr) {
                    figma.ui.postMessage({type: "ERROR", message: "이미지 전송 중 오류: " + String(chunkErr && chunkErr.message ? chunkErr.message : chunkErr)})
                }
                figma.ui.postMessage({type: "RESULT_IMAGES_END"})
            })
            .catch(function (e) {
                figma.ui.postMessage({type: "LOADING", value: false})
                figma.ui.postMessage({type: "ERROR", message: String(e && e.message ? e.message : e)})
            })
        return
    }

    if (msg.type === "EXPORT_ZIP") {
        var sel2 = figma.currentPage.selection
        var resolved = resolveDesktopMobile(sel2)
        var hasMobile = !!resolved
        var rootDesktop = resolved ? resolved.desktopRoot : sel2 && sel2[0]
        var rootMobile = resolved ? resolved.mobileRoot : null
        var breakpoint = resolved ? resolved.breakpoint : 768

        if (!sel2 || !sel2.length) {
            figma.ui.postMessage({type: "ERROR", message: "선택된 레이어 없음 (ROOT 1개: 데스크톱만, 2개: 가로 작은 쪽=MO)"})
            return
        }
        var projectName2 = msg.projectName || "project"
        var allowedFonts2 = msg.allowedFonts || []
        /** UI 코드 탭에 표시된 문자열(분석 직후·AI 정리 후 등). 있으면 ZIP _cms.html에 이걸 쓰고, 이미지만 피그마에서 다시 export */
        var codeFromTab = msg.code != null && String(msg.code).trim() ? String(msg.code) : ""

        _currentExportWidth = IMAGE_EXPORT_ZIP_WIDTH
        figma.ui.postMessage({type: "LOADING", value: true})

        // export 결과(파일/프리뷰/클립보드) 마무리 처리
        function finishExport(code, images) {
            _currentExportWidth = IMAGE_EXPORT_MAX_WIDTH
            figma.ui.postMessage({type: "ZIP_IMAGES", code: code, imageCount: images.length})
            images.forEach(function (item, i) {
                figma.ui.postMessage({type: "ZIP_IMAGES_CHUNK", index: i, name: item.name, dataUrl: item.dataUrl})
            })
            figma.ui.postMessage({type: "ZIP_IMAGES_END"})
            figma.ui.postMessage({type: "LOADING", value: false})
        }

        // 1) PC dump
        dumpTreeAsync(rootDesktop, projectName2, allowedFonts2, {phase: "desktop"})
            .then(function (payload) {
                var code = payload.code || ""
                var images = payload.images || []

                // 2) MO 있으면 MO dump + 합치기
                if (hasMobile && rootMobile) {
                    return loadFontsForMobileTreeAsync(rootMobile).then(function () {
                        return dumpTreeAsync(rootMobile, projectName2, allowedFonts2, {
                            phase: "mobile",
                            imageSuffix: "_mo",
                            exportWidth: Math.min(2400, Math.round(2 * breakpoint)),
                        }).then(function (moPayload) {
                            var secMatch = getSectionStructureMatch(rootDesktop, rootMobile)
                            // 구조 불일치여도 PC 기준 단일 뷰 + @media MO 오버라이드만 사용
                            code = combinePcMoAsBreakpoint(code, rootDesktop, rootMobile, breakpoint, { exportedNodeIds: payload.exportedNodeIds, ownImageNodeIds: payload.ownImageNodeIds })

                            images = (images || []).concat(moPayload.images || [])
                            return {code: code, images: images}
                        })
                    })
                }

                // 데스크톱만
                return {code: code, images: images}
            })
            .then(function (out) {
                var zipHtml = stripApAiAuditBlock(codeFromTab || out.code || "")
                finishExport(zipHtml, out.images || [])
            })
            .catch(function (e) {
                _currentExportWidth = IMAGE_EXPORT_MAX_WIDTH
                figma.ui.postMessage({type: "LOADING", value: false})
                figma.ui.postMessage({type: "ERROR", message: String(e)})
            })
        return
    }

    if (msg.type === "LOAD_OPENAI_KEY") {
        figma.clientStorage
            .getAsync("openai_key")
            .then(function (v) {
                figma.ui.postMessage({type: "OPENAI_KEY_LOADED", key: v != null ? String(v) : ""})
            })
            .catch(function () {
                figma.ui.postMessage({type: "OPENAI_KEY_LOADED", key: ""})
            })
        return
    }

    if (msg.type === "SAVE_OPENAI_KEY") {
        var keyToSave = msg.key != null ? String(msg.key) : ""
        figma.clientStorage
            .setAsync("openai_key", keyToSave)
            .then(function () {
                figma.ui.postMessage({type: "OPENAI_KEY_SAVED"})
            })
            .catch(function (e) {
                figma.ui.postMessage({type: "OPENAI_KEY_ERROR", message: String(e)})
            })
        return
    }
}