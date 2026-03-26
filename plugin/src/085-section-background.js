/**
 * 085-section-background — 노드 fill 배경 선언 + 섹션 루트 풀블리드 이미지 승격
 *
 * buildBackgroundDeclAsync — 일반 노드 --bgc/--bg-img (060 fill·070 export·083 경로)
 * buildSectionBackgroundAsync — stroke/radius 포함, 90% 이상 덮는 직계 이미지 → --bg-img 승격
 */
// ----- Section background (fill → CSS vars, 풀블리드 자식 승격) -----

/** fills 스택에서 최상단(마지막 visible) fill 1개만 반환 */
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

/** section이면 --bgc/--bg-img, 그 외는 background-color/background-image */
function buildBackgroundDeclAsync(node, useCssVarsForSection, cache, secNo, opts) {
    if (!node) return Promise.resolve("")
    if (node.type === "TEXT") return Promise.resolve("")

    opts = opts || {}
    var topFill = getTopmostVisibleFill(node, opts)
    if (!topFill) return Promise.resolve("")

    var parts = []

    // 최상단이 SOLID면 색만 적용
    if (topFill.type === "SOLID") {
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

    // 최상단이 IMAGE면 이미지 1개만 적용
    if (topFill.type === "IMAGE") {
        var dataUrlPromise
        if (cache && cache.image && node.id != null && cache.image[node.id]) {
            dataUrlPromise = Promise.resolve(cache.image[node.id])
        } else {
            dataUrlPromise = exportImagePreferSourceBytesAsync(node)
        }

        return dataUrlPromise
            .then(function (dataUrl) {
                if (node.id != null && dataUrl && cache && cache.image) cache.image[node.id] = dataUrl

                var path = cache
                    ? getOrAssignImagePath(cache, node.id, dataUrl || "", secNo, {
                          skipExport: isVideoNode(node),
                          imageHash: getPrimaryImageFillHash(node),
                      })
                    : ""
                var imgUrl = (path && path.length) ? path : dataUrl
                if (!imgUrl) return ""

                if (useCssVarsForSection) {
                    parts.push("--bg-img:url(" + imgUrl + ")")
                } else {
                    parts.push("background-image:url(" + imgUrl + ")")
                    parts.push("background-repeat:no-repeat")
                    parts.push("background-position:center")
                    parts.push("background-size:100% 100%")
                }
                return parts.join(";")
            })
            .catch(function () {
                return ""
            })
    }

    return Promise.resolve("")
}

/** 섹션 배경: fill 또는 직계 자식 중 90% 이상 크기 이미지 → --bg-img 승격 (slide 섹션 제외) */
function buildSectionBackgroundAsync(sectionNode, cache, secNo) {
  var slideData = getSlideItems(sectionNode)

  return buildBackgroundDeclAsync(sectionNode, true, cache, secNo).then(function (decl) {
      var strokeDecl = buildStrokeDecl(sectionNode)
      if (strokeDecl) decl = decl ? decl + ";" + strokeDecl : strokeDecl
      var radiusDecl = buildCornerRadiusDecl(sectionNode)
      if (radiusDecl) decl = decl ? decl + ";" + radiusDecl : radiusDecl

      var topFillForBg = getTopmostVisibleFill(sectionNode)
      if (topFillForBg && topFillForBg.type === "IMAGE") return {decl: decl, bgChildId: null}
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
              var path = cache
                  ? getOrAssignImagePath(cache, fullBleedChild.id, dataUrl, secNo, {
                        skipExport: isVideoNode(fullBleedChild),
                        imageHash: getPrimaryImageFillHash(fullBleedChild),
                    })
                  : ""
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
