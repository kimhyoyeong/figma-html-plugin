/**
 * 085-section-background — 노드 fill 배경 선언 + 섹션 루트 풀블리드 이미지 승격
 *
 * buildBackgroundDeclAsync — 일반 노드 --bgc/--bg-img (060 fill·070 export·083 경로)
 * buildSectionBackgroundAsync — stroke/radius 포함, 90% 이상 덮는 직계 이미지 → --bg-img 승격
 */
// ----- Section background (fill → CSS vars, 풀블리드 자식 승격) -----
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

