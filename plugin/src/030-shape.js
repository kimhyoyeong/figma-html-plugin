/**
 * 030-shape — LINE/ELLIPSE CSS 변수, 버튼 래핑, 텍스트 태그, img alt
 *
 * isLineLikeNode — LINE 또는 이름 "line" 벡터 트리 → ap-line 대상 (isVectorOnlyTree는 070)
 * buildLineVarsDecl / buildLineVarsDeclDiff — ap-line용 --ap-line-* 선언·PC/MO 차이
 * buildEllipseVarsDecl / buildEllipseVarsDeclDiff — 타원 --ap-ellipse-* 선언·차이
 * wrapIfBtn — btn 레이어를 <a class="ap-btn">로 감쌈
 * textNodeTag — TEXT용 <a>/<span> 여는·닫는 태그
 * getImageAltText — 레이어 이름 기반 img alt (이스케이프·길이 제한)
 */
// ----- 5. Style/Shape Utils (LINE, ELLIPSE, stroke, radius 등) -----
/** LINE 노드 또는 레이어명 "line"인 벡터 → ap-line 처리 */
function isLineLikeNode(node) {
    if (!node) return false
    if (node.type === "LINE") return true
    if (isVectorOnlyTree(node) && isNodeName(node, "line")) return true
    return false
}

/** LINE/line 벡터 → CSS 변수 선언 (deferred style) */
function buildLineVarsDecl(node) {
    if (!node || !isLineLikeNode(node)) return ""
    var stroke = getFirstSolidStroke(node)
    var color = stroke && stroke.color ? stroke.color : "#000"
    var weight = stroke && stroke.weight > 0 ? stroke.weight : typeof node.strokeWeight === "number" ? node.strokeWeight : 1
    var len, rot
    if (node.type === "LINE") {
        len = typeof node.width === "number" ? node.width : 100
        rot = typeof node.rotation === "number" ? node.rotation : 0
    } else {
        var box = getAbs(node)
        if (!box || box.w == null) return ""
        len = Math.max(box.w, box.h != null ? box.h : 0) || 100
        rot = typeof node.rotation === "number" ? node.rotation : 0
        weight = weight > 0 ? weight : box.h != null && box.h > 0 ? box.h : 1
    }
    var parts = []
    parts.push("--ap-line-w:" + cssOutLayoutPx(len))
    parts.push("--ap-line-h:" + cssOutLayoutPx(weight))
    parts.push("--ap-line-color:" + color)
    parts.push("--ap-line-rot:" + cssOutNum(rot))
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
    parts.push("--ap-ellipse-w:" + cssOutLayoutPx(box.w))
    parts.push("--ap-ellipse-h:" + cssOutLayoutPx(box.h))
    parts.push("--ap-ellipse-bgc:" + (fill && fill.color ? fill.color : "transparent"))
    parts.push("--ap-ellipse-bd:" + (stroke && stroke.weight > 0 ? cssOutLayoutPx(stroke.weight) : "0"))
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

/** btn 노드면 <a href="#" class="ap-btn">로 감싸기. TEXT/프레임 btn은 각각 ap-btn을 태그 class에 직접 포함 */
function wrapIfBtn(node, html, depth) {
    if (!html || !isBtnNode(node)) return html
    return indent(depth) + '<a href="#" class="ap-btn">' + "\n" + html + "\n" + indent(depth) + "</a>"
}

/** TEXT 노드용 태그: btn이면 <a href="#" class="ap-btn ap-text">, 아니면 <span class="ap-text">. parentStyle 있으면 open에 style 속성 추가 */
function textNodeTag(node, textCls, dataIdAttr, depth, parentStyle) {
    var styleAttr = (parentStyle && String(parentStyle).trim()) ? ' style="' + String(parentStyle).trim() + '"' : ""
    var open = isBtnNode(node)
        ? '<a href="#" class="ap-btn ' + textCls + '"' + dataIdAttr + styleAttr + ">"
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

