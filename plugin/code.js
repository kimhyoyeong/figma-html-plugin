/**
 * 00-entry — 플러그인 UI 띄우기 + AI 관련 전역 기본값
 *
 * Figma 엔트리: manifest "main" → plugin/code.js (빌드 산출물). 편집은 이 파일 등 src/*.js.
 *
 * - figma.showUI: ui.html 로드 (900×900)
 * - AP_* 상수: UI 초기값 등 (postMessage로 ui에 전달)
 * - setTimeout(0): 플러그인 부팅 직후 AI_UI_DEFAULTS 메시지 (비전 alt, Gemini 기본 등)
 */
// Figma → HTML/CMS export.
// 소스 파트는 build-paths.js 의 MAIN_SOURCE_DIR · 합쳐서 plugin/code.js (npm run build).
figma.showUI(__html__, {width: 1200, height: 900})

// ui 검수: 비전 기본 ON. 이미지 바이너리는 PC/MO 분석 후 RESULT_IMAGES_* 로만 UI 전달(ZIP만으로 코드만 붙은 경우 미전달).
var AP_AI_DEFAULT_ALT_VISION = true
/** AI 제공자 기본값 (ui.html 셀렉트·AI_UI_DEFAULTS와 동기) */
var AP_AI_DEFAULT_PROVIDER = "gemini"
/** Gemini 기본 모델 (Flash) */
var AP_AI_DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
setTimeout(function () {
    try {
        figma.ui.postMessage({
            type: "AI_UI_DEFAULTS",
            aiVisionAlt: AP_AI_DEFAULT_ALT_VISION,
            aiProvider: AP_AI_DEFAULT_PROVIDER,
            aiGeminiModel: AP_AI_DEFAULT_GEMINI_MODEL
        })
    } catch (e) {}
}, 0)

/**
 * 010-format-class — 숫자/CSS 출력, ap- 클래스·BEM, 레이어 이름 규칙(code-btn / code-slide / code-video / code-raster)
 *
 * r2, cssOutNum, cssOutLayoutPx, layoutPxInt, layoutPxNum — Figma 수치 → CSS 문자열·비교용 정수
 * useApFlexClass — 불필요한 ap-flex 생략 여부
 * pad2, sectionClassPrefix — 섹션 번호 → "01" 형태 클래스 접두
 * stripApAiAuditBlock — AI 검수 HTML 주석 제거(ZIP용)
 * makeClassName, nodeUniqueClass, apSectionBem — 클래스 문자열 생성
 * isNodeName, isBtnNode, isVideoNode, isSlideNode, isCodeRasterNode — 레이어명 기반 특수 처리 판별
 */
// ----- 공통·포맷 (r2, 클래스, BEM) + Core 일부(레이어명 판별은 아래 isNodeName~) -----
/** 숫자를 소수 둘째 자리까지 반올림 */
function r2(v) {
    return Math.round(v * 100) / 100
}
/** CSS 출력용: 거의 정수면 정수, 아니면 소수 최대 2자리·불필요한 끝 0 제거 */
function cssOutNum(v) {
    if (v == null || v === "") return ""
    var n = Number(v)
    if (!isFinite(n)) return String(v)
    if (Math.abs(n - Math.round(n)) < 1e-4) return String(Math.round(n))
    var x = Math.round(n * 100) / 100
    if (Math.abs(x - Math.round(x)) < 1e-4) return String(Math.round(x))
    var s = x.toFixed(2).replace(/\.?0+$/, "")
    return s
}
/** 간격·패딩 등 레이아웃 px: 정수로 통일 (Figma 부동소수·긴 소수 제거) */
function cssOutLayoutPx(v) {
    if (v == null || v === "") return ""
    var n = Number(v)
    if (!isFinite(n)) return String(v)
    return String(Math.round(n))
}
/** 레이아웃 숫자 비교용 (부동소수·문자열 차이로 인한 불필요한 MO :0 방지) */
function layoutPxInt(s) {
    return Math.round(Number(s !== "" && s != null ? s : 0) || 0)
}
/** 좌표·크기 비교용 */
function layoutPxNum(n) {
    if (n == null || !isFinite(Number(n))) return 0
    return Math.round(Number(n))
}
/** abs+AutoLayout: 자식 없고 갭·패딩도 없으면 ap-flex 불필요(display:flex 낭비) */
function useApFlexClass(node, abs, flex) {
    if (!flex) return false
    if (!abs) return true
    var vis = 0
    var ch = (node && node.children) || []
    for (var i = 0; i < ch.length; i++) {
        if (ch[i] && isVisible(ch[i])) vis++
    }
    if (vis > 0) return true
    var lv = getLayoutVars(node)
    if (!lv) return false
    return (
        layoutPxInt(lv.gap) !== 0 ||
        layoutPxInt(lv.pt) !== 0 ||
        layoutPxInt(lv.pr) !== 0 ||
        layoutPxInt(lv.pb) !== 0 ||
        layoutPxInt(lv.pl) !== 0
    )
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
/** 레이어 이름이 code-btn이면 <a class="ap-btn"> 링크 (정확히 일치, 대소문자 무관) */
function isBtnNode(node) {
    return isNodeName(node, "code-btn")
}
/** 레이어 이름이 code-video이면 비디오 플레이스홀더 */
function isVideoNode(node) {
    return isNodeName(node, "code-video")
}
/** 레이어 이름이 code-slide이면 Swiper 구조 */
function isSlideNode(node) {
    return isNodeName(node, "code-slide")
}
/** 레이어 이름이 code-raster이면 단일 래스터 이미지 export 강제(벡터·다중 자식 분할 등 일반 규칙보다 우선) */
function isCodeRasterNode(node) {
    return isNodeName(node, "code-raster")
}


/**
 * 020-slide — Swiper 슬라이드 구조·slidesPerView·뷰포트/피치 계산
 *
 * getSlideItems — 섹션에서 code-slide 레이어 규칙에 따라 슬라이드 아이템·부모 노드 반환
 * collectSwiperSlideItemNodes — 배경 자식 제외 후 실제 슬라이드 노드 배열
 * clamp — min~max 제한
 * getSlideViewportWidth — 슬라이드 영역 가로(섹션 폭으로 클램프)
 * getSlideItemPitch — 슬라이드 간격(아이템 폭+갭) 추정
 * collectMoSlideItemNodes — PC 기준으로 MO 슬라이드 노드 순서 맞춤
 * computeSlidesPerView / computeSlidesPerViewMo — PC·MO 각각 한 화면에 몇 장 보일지
 * resolveSlideMeta — PC/MO slidesPerView를 한 객체로
 */
// ----- 7. Slide Utils (캐러셀 meta, pitch, slidesPerView) -----
/** 섹션에서 swiper-slide 대상 노드들 반환. null이면 슬라이드 모드 아님.
 * - 섹션 자식 중 code-slide 1개(그룹) → 그 그룹의 자식들이 각각 swiper-slide
 * - 섹션 자식 중 code-slide 여러 개 → 각각 swiper-slide
 * - 섹션 자체가 code-slide이면 → 섹션의 자식들이 각각 swiper-slide */
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
/** Swiper에 올라가는 슬라이드 아이템 노드 목록 (PC·MO 동일 순서) */
function collectSwiperSlideItemNodes(sectionNode, bgChildId) {
    var slideData = getSlideItems(sectionNode)
    if (!slideData) return []
    var out = []
    for (var i = 0; i < (slideData.items || []).length; i++) {
        var it = slideData.items[i]
        if (!it) continue
        if (bgChildId && it.id === bgChildId) continue
        if (!isVisible(it)) continue
        out.push(it)
    }
    return out
}

/** 숫자 범위 제한 */
function clamp(n, min, max) {
    n = Number(n)
    if (!isFinite(n)) n = min
    return Math.min(max, Math.max(min, n))
}

/** 슬라이드 부모의 가로폭(HTML에서 .swiper는 ap-section 폭을 쓰므로 섹션보다 넓게 잡힌 slide 그룹은 섹션 폭으로 자름) */
function getSlideViewportWidth(sectionNode, bgChildId) {
    var slideData = getSlideItems(sectionNode)
    if (!slideData) return 0

    var target = slideData.parent || sectionNode
    var box = getAbs(target)
    if (!box || box.w == null) return 0

    var w = r2(box.w)
    var secBox = getAbs(sectionNode)
    if (secBox && secBox.w != null && secBox.w > 0) {
        w = Math.min(w, r2(secBox.w))
    }
    return w
}

/** 슬라이드 pitch(= item width + gap) 추정 */
function getSlideItemPitch(items) {
    if (!items || !items.length) return 0
    if (items.length === 1) {
        var onlyBox = getAbs(items[0])
        return onlyBox && onlyBox.w != null ? r2(onlyBox.w) : 0
    }

    var pairs = []
    for (var i = 0; i < items.length - 1; i++) {
        var a = getAbs(items[i])
        var b = getAbs(items[i + 1])
        if (!a || !b || a.x == null || b.x == null) continue
        var dx = r2(b.x - a.x)
        if (dx > 0) pairs.push(dx)
    }

    if (pairs.length) {
        pairs.sort(function (x, y) {
            return x - y
        })
        return r2(pairs[Math.floor(pairs.length / 2)])
    }

    var firstBox = getAbs(items[0])
    return firstBox && firstBox.w != null ? r2(firstBox.w) : 0
}

/** MO 섹션에서 슬라이드 아이템 노드 나열(computeSlidesPerViewMo와 동일 규칙) */
function collectMoSlideItemNodes(dSec, mSec, bgChildId) {
    if (!dSec || !mSec) return []
    if (getSlideItems(mSec)) return collectSwiperSlideItemNodes(mSec, bgChildId)

    var dData = getSlideItems(dSec)
    var dItems = collectSwiperSlideItemNodes(dSec, bgChildId)
    if (!dItems.length) return []

    var dSecKids = (dSec.children || []).filter(function (c) {
        return c && isVisible(c)
    })
    var mSecKids = (mSec.children || []).filter(function (c) {
        return c && isVisible(c)
    })
    var moItemNodes = []
    if (dData && dData.parent && dData.parent !== dSec) {
        var pidx = -1
        for (var i = 0; i < dSecKids.length; i++) {
            if (dSecKids[i].id === dData.parent.id) {
                pidx = i
                break
            }
        }
        if (pidx >= 0 && pidx < mSecKids.length) {
            var viewportTarget = mSecKids[pidx]
            var mCh = (viewportTarget.children || []).filter(function (c) {
                return c && isVisible(c)
            })
            for (var j = 0; j < dItems.length && j < mCh.length; j++) {
                moItemNodes.push(mCh[j])
            }
        }
    } else {
        for (var k = 0; k < dItems.length; k++) {
            var dIt = dItems[k]
            var found = -1
            for (var i2 = 0; i2 < dSecKids.length; i2++) {
                if (dSecKids[i2].id === dIt.id) {
                    found = i2
                    break
                }
            }
            if (found >= 0 && found < mSecKids.length) {
                moItemNodes.push(mSecKids[found])
            }
        }
    }
    return moItemNodes
}

/** slidesPerView 계산 */
function computeSlidesPerView(sectionNode, bgChildId, fallbackValue) {
    var items = collectSwiperSlideItemNodes(sectionNode, bgChildId)
    if (!items.length) return fallbackValue != null ? fallbackValue : 1

    var viewportW = getSlideViewportWidth(sectionNode, bgChildId)
    var pitch = getSlideItemPitch(items)
    if (!(viewportW > 0) || !(pitch > 0)) return fallbackValue != null ? fallbackValue : 1

    var raw = viewportW / pitch

    // 너무 이상한 값 방지
    raw = clamp(raw, 1, items.length)

    // 정수에 가까우면 정수로, 아니면 소수 2자리
    var rounded = Math.round(raw)
    if (Math.abs(raw - rounded) < 0.15) return rounded

    return r2(raw)
}

/** PC 섹션 기준으로 MO 섹션 매칭 후 slidesPerView 계산 */
function computeSlidesPerViewMo(dSec, mSec, bgChildId, fallbackValue) {
    if (!dSec) return fallbackValue != null ? fallbackValue : 1
    if (mSec && getSlideItems(mSec)) {
        return computeSlidesPerView(mSec, bgChildId, fallbackValue)
    }

    var dItems = collectSwiperSlideItemNodes(dSec, bgChildId)
    if (!dItems.length || !mSec) return fallbackValue != null ? fallbackValue : computeSlidesPerView(dSec, bgChildId, 1)

    var moItemNodes = collectMoSlideItemNodes(dSec, mSec, bgChildId)
    var viewportTarget = mSec
    var dData = getSlideItems(dSec)
    if (dData && dData.parent && dData.parent !== dSec) {
        var dSecKidsVt = (dSec.children || []).filter(function (c) {
            return c && isVisible(c)
        })
        var mSecKidsVt = (mSec.children || []).filter(function (c) {
            return c && isVisible(c)
        })
        var pidxVt = -1
        for (var ivt = 0; ivt < dSecKidsVt.length; ivt++) {
            if (dSecKidsVt[ivt].id === dData.parent.id) {
                pidxVt = ivt
                break
            }
        }
        if (pidxVt >= 0 && pidxVt < mSecKidsVt.length) viewportTarget = mSecKidsVt[pidxVt]
    }

    if (!moItemNodes.length) {
        return fallbackValue != null ? fallbackValue : computeSlidesPerView(dSec, bgChildId, 1)
    }

    var box = getAbs(viewportTarget)
    if (!box || box.w == null) {
        return fallbackValue != null ? fallbackValue : computeSlidesPerView(dSec, bgChildId, 1)
    }

    var viewportW = r2(box.w)
    var mSecBox = getAbs(mSec)
    if (mSecBox && mSecBox.w != null && mSecBox.w > 0) {
        viewportW = Math.min(viewportW, r2(mSecBox.w))
    }

    var pitch = getSlideItemPitch(moItemNodes)
    if (!(viewportW > 0) || !(pitch > 0)) {
        return fallbackValue != null ? fallbackValue : 1
    }

    var raw = viewportW / pitch
    // 상한은 PC 슬라이드 아이템 개수 기준. mSec 직계 자식 수(예: slide 그룹 1개)를 쓰면 항상 1로 죽는 버그 방지
    raw = clamp(raw, 1, dItems.length)

    var rounded = Math.round(raw)
    if (Math.abs(raw - rounded) < 0.15) return rounded

    return r2(raw)
}

/**
 * PC 기준 슬라이드 메타 일원화. 콘텐츠/아이템 스택은 항상 PC(source).
 * mobileRoot 있을 때만 MO slidesPerView 추정.
 */
function resolveSlideMeta(dSec, mSec, bgChildId, opts) {
    opts = opts || {}
    var mobileRoot = opts.mobileRoot
    var secNo = opts.secNo
    var empty = {
        pcSlidesPerView: 1,
        moSlidesPerView: 1,
    }
    if (!dSec || !getSlideItems(dSec)) return empty

    var pcSlidesPerView = computeSlidesPerView(dSec, bgChildId, 1)
    var moSlidesPerView = pcSlidesPerView

    if (mobileRoot && secNo != null) {
        var mobileSections = getSectionNodes(mobileRoot)
        var mobileSectionNode = mSec != null ? mSec : mobileSections[secNo - 1] || null
        moSlidesPerView = computeSlidesPerViewMo(dSec, mobileSectionNode, bgChildId, pcSlidesPerView)
    }

    return {
        pcSlidesPerView: pcSlidesPerView,
        moSlidesPerView: moSlidesPerView,
    }
}

/**
 * 030-shape — LINE/ELLIPSE CSS 변수, 버튼 래핑, 텍스트 태그, img alt
 *
 * isLineLikeNode — LINE 또는 이름 "line" 벡터 트리 → ap-line 대상 (isVectorOnlyTree는 070)
 * buildLineVarsDecl / buildLineVarsDeclDiff — ap-line용 --ap-line-* 선언·PC/MO 차이
 * buildEllipseVarsDecl / buildEllipseVarsDeclDiff — 타원 --ap-ellipse-* 선언·차이
 * wrapIfBtn — code-btn 레이어를 <a class="ap-btn">로 감쌈
 * textNodeTag — TEXT용 <a>/<p> 여는·닫는 태그 (버튼은 <a>, 그 외는 <p class="ap-text">)
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

/** code-btn 노드면 <a href="#" class="ap-btn">로 감싸기. TEXT/프레임은 각각 ap-btn을 태그 class에 직접 포함 */
function wrapIfBtn(node, html, depth) {
    if (!html || !isBtnNode(node)) return html
    return indent(depth) + '<a href="#" class="ap-btn">' + "\n" + html + "\n" + indent(depth) + "</a>"
}

/** TEXT 노드용 태그: code-btn이면 <a href="#" class="ap-btn ap-text">, 아니면 <p class="ap-text">. parentStyle 있으면 open에 style 속성 추가 */
function textNodeTag(node, textCls, dataIdAttr, depth, parentStyle) {
    var styleAttr = (parentStyle && String(parentStyle).trim()) ? ' style="' + String(parentStyle).trim() + '"' : ""
    var open = isBtnNode(node)
        ? '<a href="#" class="ap-btn ' + textCls + '"' + dataIdAttr + styleAttr + ">"
        : '<p class="' + textCls + '"' + dataIdAttr + styleAttr + ">"
    var close = isBtnNode(node) ? "</a>" : "</p>"
    return { open: open, close: close }
}

/** img alt 텍스트: 이미지 노드의 name 사용 */
function getImageAltText(node) {
    if (!node) return ""
    var name = String(node.name || "").trim()
    if (!name) return ""
    return escapeHtml(name.length > 125 ? name.slice(0, 125) : name)
}


/**
 * 040-text-utils — HTML 이스케이프, 줄바꿈, PC/MO 반응형 BR, mixed 스타일 텍스트 inner HTML
 *
 * 경계: 문자열·inner HTML·줄바꿈/BR 슬롯. 폰트 로드·스타일 구간·허용 폰트 필터는 080.
 *
 * escapeHtml, textToHtmlWithBreaks — 특수문자·개행 → 안전한 HTML
 * normalizeTextNewlinesForResponsive, textFlatForResponsiveCompare — PC/MO 텍스트 정규화·비교용 평탄화
 * newlineGapsForResponsive, appendResponsiveBrSlotHtml, buildResponsiveBrInnerFromPcMoChars — 개행 개수만 다를 때 pc-only/mo-only <br>
 * textSummaryAllowsResponsiveBrOverride — 단일 스타일 구간일 때만 MO 줄바꿈 오버라이드 허용
 * moTextNodeFromNameMap, buildResponsiveTextInnerByNodeIdMap — MO 텍스트를 이름/트리로 매칭해 노드 id → inner HTML
 * buildTextPartInnerHtml — 스타일 구간별 ap-text__part span·부모 변수
 * normTextAlign, getLineBreakPoints — Figma 정렬 → CSS, 줄바꿈 인덱스
 * indent, wrapChunksAsUlOrDiv — HTML 들여쓰기·리스트/프레임 래핑
 */
// ----- 3. Text Utils -----
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
/** PC/MO 반응형 줄바꿈: LS/PS·CR 정규화 (본문 flat 비교용) */
function normalizeTextNewlinesForResponsive(s) {
    if (s == null) return ""
    return String(s).replace(/\u2028/g, "\n").replace(/\u2029/g, "\n").replace(/\r\n/g, "\n").replace(/\r/g, "\n")
}
/** 개행 제거한 문자열만 비교(PC/MO 동일 문장 여부) */
function textFlatForResponsiveCompare(s) {
    return normalizeTextNewlinesForResponsive(s).replace(/\n/g, "")
}
/** 각 문자 사이의 연속 \\n 개수(gaps)와 flat 문자열 — 반응형 BR 슬롯 계산용 */
function newlineGapsForResponsive(norm) {
    var gaps = []
    var flatParts = []
    var run = 0
    for (var i = 0; i < norm.length; i++) {
        var ch = norm.charAt(i)
        if (ch === "\n") run++
        else {
            gaps.push(run)
            run = 0
            flatParts.push(ch)
        }
    }
    gaps.push(run)
    return { flat: flatParts.join(""), gaps: gaps }
}
function appendResponsiveBrSlotHtml(pcRun, moRun) {
    var mx = Math.max(pcRun, moRun)
    var buf = ""
    for (var slot = 1; slot <= mx; slot++) {
        var inPc = slot <= pcRun
        var inMo = slot <= moRun
        if (inPc && inMo) buf += "<br>"
        else if (inPc) buf += '<br class="pc-only">'
        else buf += '<br class="mo-only">'
    }
    return buf
}
/**
 * PC·MO 문자열이 개행(횟수)만 다를 때 inner HTML. 가시 문자열이 다르면 null → 호출부에서 PC만 textToHtmlWithBreaks.
 */
function buildResponsiveBrInnerFromPcMoChars(pcText, moText) {
    var pcN = normalizeTextNewlinesForResponsive(pcText)
    var moN = normalizeTextNewlinesForResponsive(moText)
    if (textFlatForResponsiveCompare(pcN).toLowerCase() !== textFlatForResponsiveCompare(moN).toLowerCase()) return null
    var pcG = newlineGapsForResponsive(pcN)
    var moG = newlineGapsForResponsive(moN)
    var flat = pcG.flat
    var out = ""
    for (var gi = 0; gi <= flat.length; gi++) {
        var k = pcG.gaps[gi] || 0
        var j = moG.gaps[gi] || 0
        out += appendResponsiveBrSlotHtml(k, j)
        if (gi < flat.length) out += escapeHtml(flat.charAt(gi))
    }
    return out
}
/**
 * 하이브리드(PC+MO 루트 선택) 시: PC 코드 생성 직전에 호출.
 * 섹션·가시 자식 1:1 walk + 레이어 이름이 있으면 MO 문자열 우선(이름 대소문자 무시 보조).
 * 데스크톱 TEXT 노드 id → 반응형 줄바꿈 inner HTML.
 */
function textSummaryAllowsResponsiveBrOverride(ts) {
    if (!ts) return true
    var parts = ts.parts
    if (!parts || parts.length === 0) return true
    if (parts.length !== 1) return false
    var text = ts.text || ""
    var tlen = text.length
    if (tlen === 0) return true
    var p = parts[0]
    var from = Math.max(0, Math.min(tlen, Number(p.start) || 0))
    var to = Math.max(0, Math.min(tlen, Number(p.end) || 0))
    return from <= 0 && to >= tlen
}
function moTextNodeFromNameMap(byNameMo, layerName) {
    var key = String(layerName || "").trim()
    if (!key || !byNameMo) return null
    if (byNameMo[key]) return byNameMo[key]
    var low = key.toLowerCase()
    for (var k in byNameMo) {
        if (Object.prototype.hasOwnProperty.call(byNameMo, k) && String(k).toLowerCase() === low) return byNameMo[k]
    }
    return null
}
function buildResponsiveTextInnerByNodeIdMap(desktopRoot, mobileRoot) {
    var map = {}
    if (!isContainer(desktopRoot) || !isContainer(mobileRoot)) return map
    var byNameMo = {}
    try {
        byNameMo = collectTextNodesByName(mobileRoot)
    } catch (e) {
        byNameMo = {}
    }
    function walkPair(dNode, mNode) {
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
                if (d.type === "FRAME" && isContainer(d)) walkPair(d, m)
                continue
            }
            if (d.type === "TEXT" && m.type === "TEXT") {
                var pcStr = d.characters != null ? String(d.characters) : ""
                var moStr = m.characters != null ? String(m.characters) : ""
                var key = String(d.name || "").trim()
                var mnByName = moTextNodeFromNameMap(byNameMo, key)
                if (mnByName) {
                    moStr = mnByName.characters != null ? String(mnByName.characters) : ""
                }
                var inner = buildResponsiveBrInnerFromPcMoChars(pcStr, moStr)
                if (inner != null) map[String(d.id)] = inner
            }
            if (d.type === "FRAME" && isContainer(d)) walkPair(d, m)
        }
    }
    var dSecs = getSectionNodes(desktopRoot)
    var mSecs = getSectionNodes(mobileRoot)
    for (var s = 0; s < dSecs.length; s++) {
        if (s >= mSecs.length) break
        var dSec = dSecs[s]
        var mSec = mSecs[s]
        if (!dSec || !mSec || dSec.type !== mSec.type) continue
        walkPair(dSec, mSec)
    }
    return map
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
            var brMatch = escaped.match(/^(\s*<br[^>]*>\s*)+/i)
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


/**
 * 050-core-node — 바운딩 박스, 가시성, Auto Layout, 절대배치 판별
 *
 * 경계: 단일 노드 메타·가시성·flex/abs 판별. 전 트리 워크·데이터트리·HTML 조립은 090·097·096 쪽.
 *
 * getAbs — absoluteBoundingBox → {x,y,w,h}
 * getTextRasterBounds — TEXT는 렌더 bounds 우선(이미지 export·abs)
 * getRasterExportBounds — 래스터·레이아웃: render가 레이어 박스보다 크면 박스로 제한
 * getRasterExportBoundsClippedToParent — 직계 부모 프레임·클립 영역으로 추가 교차
 * isFigmaDirectParent / findDirectFigmaParentUnderRoot — 트리·클립 export용
 * isContainer, isVisible, hasVisibleChildren — 트리 순회·export 필터
 * isFlex — layoutMode !== NONE
 * isAbsoluteInParent, isAbsolutePositioned, isAbsoluteByParentNotFlex, isAbsoluteLike — CSS ap-abs 판별
 * containerNeedsRelativeForAbsoluteChildren — 비-flex 부모에 position:relative 필요 여부
 * containerAllVisibleChildrenAreAbsolute — 보이는 직계 자식이 1개 이상이며 전부 ap-abs 계열이면 true (플로우 높이 0 방지용)
 */
// ----- 2. Core Node Utils (bounds, visibility, flex/abs; 레이어명·slide 판별은 상단) -----
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

/** TEXT 래스터: 프레임(absoluteBoundingBox)이 아니라 실제 그려진 영역(absoluteRenderBounds) — 넓은 텍스트 박스·여백 방지 */
function getTextRasterBounds(node) {
    if (!node || node.type !== "TEXT") return null
    try {
        var rb = node.absoluteRenderBounds
        if (rb && typeof rb.x === "number" && typeof rb.y === "number" && typeof rb.width === "number" && typeof rb.height === "number" && rb.width > 0 && rb.height > 0)
            return {x: r2(rb.x), y: r2(rb.y), w: r2(rb.width), h: r2(rb.height)}
    } catch (e) {}
    return getAbs(node)
}

/** 래스터·CSS 크기: absoluteRenderBounds가 레이어 박스보다 크면(이미지 오버플로 등) bounding box로 맞춤 */
function getRasterExportBounds(node) {
    if (!node) return null
    var absB = getAbs(node)
    try {
        var rb = node.absoluteRenderBounds
        if (rb && typeof rb.x === "number" && typeof rb.y === "number" && typeof rb.width === "number" && typeof rb.height === "number" && rb.width > 0 && rb.height > 0) {
            var rw = r2(rb.width)
            var rh = r2(rb.height)
            var aw = absB ? absB.w : rw
            var ah = absB ? absB.h : rh
            if (absB && absB.w != null && absB.h != null && (rw > aw + 1 || rh > ah + 1))
                return {x: r2(absB.x), y: r2(absB.y), w: r2(absB.w), h: r2(absB.h)}
            return {x: r2(rb.x), y: r2(rb.y), w: rw, h: rh}
        }
    } catch (e) {}
    return absB
}

/** 직계 부모와의 교차 영역(부모 clipsContent·자식 박스 삐져나감·render 박스 초과 시) */
function getRasterExportBoundsClippedToParent(node, parent) {
    var inner = getRasterExportBounds(node)
    if (!inner || !parent) return inner
    var a = getAbs(node)
    var p = getAbs(parent)
    if (!a || !p || a.w == null || p.w == null) return inner
    var clipPc = false
    try {
        clipPc = parent.clipsContent === true
    } catch (e) {}
    var protrude =
        a.x < p.x - 0.5 || a.y < p.y - 0.5 || a.x + a.w > p.x + p.w + 0.5 || a.y + a.h > p.y + p.h + 0.5
    var renderOver = false
    try {
        var rb = node.absoluteRenderBounds
        if (rb && typeof rb.width === "number" && typeof rb.height === "number" && a.w != null && a.h != null) {
            if (r2(rb.width) > a.w + 1 || r2(rb.height) > a.h + 1) renderOver = true
        }
    } catch (e2) {}
    if (!clipPc && !protrude && !renderOver) return inner
    var ix = Math.max(inner.x, p.x)
    var iy = Math.max(inner.y, p.y)
    var ix2 = Math.min(inner.x + inner.w, p.x + p.w)
    var iy2 = Math.min(inner.y + inner.h, p.y + p.h)
    var iw = r2(ix2 - ix)
    var ih = r2(iy2 - iy)
    if (iw < 1 || ih < 1) return inner
    return {x: r2(ix), y: r2(iy), w: iw, h: ih}
}

function isFigmaDirectParent(possibleParent, child) {
    try {
        return !!(possibleParent && child && child.parent && child.parent.id === possibleParent.id)
    } catch (e) {
        return false
    }
}

/** 섹션 등 루트 아래에서 target의 직계 부모 노드 */
function findDirectFigmaParentUnderRoot(root, targetNode) {
    if (!root || !targetNode || targetNode.id == null) return null
    var tid = String(targetNode.id)
    function walk(n) {
        if (!n || !n.children) return null
        var ch = n.children
        for (var i = 0; i < ch.length; i++) {
            var c = ch[i]
            if (!c) continue
            if (String(c.id) === tid) return n
            var f = walk(c)
            if (f) return f
        }
        return null
    }
    return walk(root)
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

/** Figma Auto Layout 자식의 Absolute 배치 여부 (명시적으로 ABSOLUTE일 때만 true; undefined/null → AUTO와 동일) */
function isAbsolutePositioned(node) {
    try {
        if (!node || !("layoutPositioning" in node)) return false
        var v = node.layoutPositioning
        if (v === undefined || v === null) return false
        return String(v).toUpperCase() === "ABSOLUTE"
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

/** 비 flex 컨테이너는 .ap-flex의 position:relative가 없음 → 직계 abs 자식이 있을 때만 명시 */
function containerNeedsRelativeForAbsoluteChildren(node) {
    if (!node || isFlex(node)) return false
    var kids = node.children || []
    for (var i = 0; i < kids.length; i++) {
        var ch = kids[i]
        if (!ch || !isVisible(ch)) continue
        if (isAbsoluteLike(ch, node)) return true
    }
    return false
}

/** 보이는 직계 자식이 모두 절대 배치면 컨테이너는 플로우 높이가 없어짐 → Figma 박스 높이를 min-height로 줄 때 사용 */
function containerAllVisibleChildrenAreAbsolute(node) {
    if (!node) return false
    var kids = node.children || []
    var seen = false
    for (var i = 0; i < kids.length; i++) {
        var ch = kids[i]
        if (!ch || !isVisible(ch)) continue
        seen = true
        if (!isAbsoluteLike(ch, node)) return false
    }
    return seen
}


/**
 * 060-layout — Flex CSS 변수, 절대 좌표 선언, 채우기/스트로크/반지름, 섹션 높이
 *
 * 경계: CSS 선언 조립(레이아웃·칠·테두리). 노드 판별은 050, 최종 HTML 문자열은 096.
 *
 * getLayoutVars, flexColumnSpaceBetweenNeedsMinHeight, applySectionSingleChildAlignOverride, buildFlexDecl, buildFlexPaddingDecl — ap-flex
 * buildAbsDecl, buildAbsDeclTextRaster, *Diff — 절대 위치·TEXT 래스터·PC/MO 차이
 * getImageSizeDeclDiff, getVideoSizeDeclDiff — figure/비디오 크기 MO 오버라이드
 * toHex2, rgbToHex, hexToRgba, getFirstSolidColorFromPaints — 색 문자열
 * getFirstSolidFill, hasImageFill — fill 조회
 * needsMinHeight, getPcSectionCanvasHeightDecls, getMediaSectionCanvasHeightDecl — 캔버스형 섹션 min-height
 * frameHasMinHeightVisualReason — 프레임에 시각적 이유로 min-height 줄지
 * getFirstSolidStroke, buildCornerRadiusDecl, buildStrokeDecl, buildStrokeDeclDiff — 테두리·모서리
 */
// ----- 4. Layout Utils (flex vars, abs decl) -----
/**
 * row Auto Layout에서 플로우에 참여하는 보이는 자식이 2개 이상이고,
 * absoluteBoundingBox 높이가 모두 같으면 true (교차축 MIN→flex-start 대신 stretch가 자연스러움).
 */
function rowFlexVisibleChildrenEqualHeight(node) {
    if (!node || !isFlex(node)) return false
    try {
        if (node.layoutMode === "VERTICAL") return false
        var kids = (node.children || []).filter(function (c) {
            return c && isVisible(c) && !isAbsolutePositioned(c)
        })
        if (kids.length < 2) return false
        var h0 = null
        for (var ri = 0; ri < kids.length; ri++) {
            var b = getAbs(kids[ri])
            if (!b || b.h == null) return false
            var hh = r2(b.h)
            if (h0 === null) h0 = hh
            else if (hh !== h0) return false
        }
        return true
    } catch (e) {
        return false
    }
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
        out.gap = primary === "SPACE_BETWEEN" ? "0" : cssOutLayoutPx(gap)

        out.pt = cssOutLayoutPx(Number(node.paddingTop) || 0)
        out.pr = cssOutLayoutPx(Number(node.paddingRight) || 0)
        out.pb = cssOutLayoutPx(Number(node.paddingBottom) || 0)
        out.pl = cssOutLayoutPx(Number(node.paddingLeft) || 0)

        // MIN·기타 미매칭 = CSS 주축 기본(flex-start)과 동일 → 값 생략(buildFlexDecl에서 출력 안 함)
        if (primary === "MIN") out.justify = ""
        else if (primary === "MAX") out.justify = "flex-end"
        else if (primary === "CENTER") out.justify = "center"
        else if (primary === "SPACE_BETWEEN") out.justify = "space-between"
        else out.justify = ""

        var counter = String(node.counterAxisAlignItems || "").toUpperCase()
        // MIN → flex-start (생략 시 브라우저 기본은 stretch라 Figma와 어긋남)
        if (counter === "MIN") out.align = "flex-start"
        else if (counter === "MAX") out.align = "flex-end"
        else if (counter === "CENTER") out.align = "center"
        else if (counter === "BASELINE") out.align = "baseline"
        else if (counter === "STRETCH" || counter === "") out.align = ""
        else out.align = ""

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

        // row + 교차축 MIN → align flex-start 출력; 자식 높이가 전부 같으면 stretch(align 선언 생략)가 동일·배경 채움에 유리
        if (out.direction === "row" && out.align === "flex-start" && rowFlexVisibleChildrenEqualHeight(node)) {
            out.align = ""
        }
    } catch (e) {}
    return out
}

/**
 * 세로 오토레이아웃 + 주축 SPACE_BETWEEN → CSS에서 여유 세로가 있어야 분배됨.
 * 세로 FIXED일 때 min-height로 설계 높이를 확정 (배경 없는 프레임 포함).
 */
function flexColumnSpaceBetweenNeedsMinHeight(node) {
    if (!node || !isFlex(node)) return false
    try {
        if (node.layoutMode !== "VERTICAL") return false
        if (String(node.primaryAxisAlignItems || "").toUpperCase() !== "SPACE_BETWEEN") return false
        return node.layoutSizingVertical === "FIXED"
    } catch (e) {
        return false
    }
}

/** PC 섹션 export와 동일: 단일 자식 + align center → MIN과 같이 align-items 선언 생략 */
function applySectionSingleChildAlignOverride(sectionNode, lv) {
    if (!lv || !sectionNode) return lv
    var vis = (sectionNode.children || []).filter(function (c) {
        return c && isVisible(c)
    })
    if (vis.length === 1 && lv.align === "center") return Object.assign({}, lv, { align: "" })
    return lv
}

/** 패딩 한 변: 0은 키워드 0, 그 외는 cqi calc */
function paddingSideToCqi(px) {
    var n = Number(px) || 0
    if (n === 0) return "0"
    return "calc(" + n + "/var(--ap-width)*100cqi)"
}
/** ap-flex: padding 을 top right bottom left 네 값 한 줄로 (전부 0이면 생략) */
function buildFlexPaddingDecl(pt, pr, pb, pl) {
    pt = Number(pt) || 0
    pr = Number(pr) || 0
    pb = Number(pb) || 0
    pl = Number(pl) || 0
    if (pt === 0 && pr === 0 && pb === 0 && pl === 0) return ""
    return (
        "padding:" +
        paddingSideToCqi(pt) +
        " " +
        paddingSideToCqi(pr) +
        " " +
        paddingSideToCqi(pb) +
        " " +
        paddingSideToCqi(pl)
    )
}

/** ap-flex 노드용 flex CSS. absSelf: 이 노드가 ap-abs이면 자식 absolute용 position:relative 를 넣지 않음(지연 CSS가 absolute 덮어쓰기 방지) */
function buildFlexDecl(layoutVars, node, absSelf) {
    if (absSelf === undefined) absSelf = false
    if (!layoutVars) return ""
    var parts = []

    var direction = layoutVars.direction || "row"
    var wrap = layoutVars.wrap || "nowrap"
    var justify = layoutVars.justify || "flex-start"

    parts.push("display:flex")

    // ✅ 자식에 absolute 있을 때만 (자기 자신이 absolute 면 제외)
    if (hasAbsoluteChild(node) && !absSelf) {
        parts.push("position:relative")
    }

    if (direction !== "row") parts.push("flex-direction:" + direction)
    if (wrap !== "nowrap") parts.push("flex-wrap:" + wrap)
    if (justify !== "flex-start") parts.push("justify-content:" + justify)
    var alignRaw = layoutVars.align
    if (alignRaw !== "") {
        if (alignRaw !== "stretch") parts.push("align-items:" + alignRaw)
    }

    var gap = Number(layoutVars.gap) || 0
    var pt = Number(layoutVars.pt) || 0
    var pr = Number(layoutVars.pr) || 0
    var pb = Number(layoutVars.pb) || 0
    var pl = Number(layoutVars.pl) || 0

    if (gap !== 0) {
        parts.push("gap:calc(" + gap + "/var(--ap-width)*100cqi)")
    }

    var padDecl = buildFlexPaddingDecl(pt, pr, pb, pl)
    if (padDecl) parts.push(padDecl)

    return parts.join(";")
}

/** ap-abs·diff 공통: 직계 부모면 부모 영역으로 클립된 bounds(플로우 이미지 등). 절대 배치 이미지는 클립 안 함 */
function getBoundsForAbsDeclChild(childNode, parentNode) {
    if (!childNode) return null
    if (childNode.type === "TEXT") return getTextRasterBounds(childNode) || getAbs(childNode)
    if (parentNode && isFigmaDirectParent(parentNode, childNode)) {
        try {
            if (!isAbsoluteLike(childNode, parentNode)) return getRasterExportBoundsClippedToParent(childNode, parentNode)
        } catch (e) {
            return getRasterExportBounds(childNode)
        }
    }
    return getRasterExportBounds(childNode)
}

/** 절대 위치: 설계 좌표는 --ap-left/--ap-top/--ap-w/--ap-h (디자인 px). 실제 calc는 .ap-abs 공통 규칙. */
function buildAbsDecl(childNode, parentNode) {
    var box = getBoundsForAbsDeclChild(childNode, parentNode)
    var parentBox = getAbs(parentNode)
    if (!box || !parentBox) return ""
    var relX = cssOutLayoutPx(box.x - parentBox.x)
    var relY = cssOutLayoutPx(box.y - parentBox.y)
    var w = box.w != null ? cssOutLayoutPx(box.w) : "0"
    var h = box.h != null ? cssOutLayoutPx(box.h) : "0"
    return "--ap-left:" + relX + ";--ap-top:" + relY + ";--ap-w:" + w + ";--ap-h:" + h
}

/** TEXT 래스터(.ap-image) 절대 배치: 시각적 bounds 기준 */
function buildAbsDeclTextRaster(childNode, parentNode) {
    var box = getTextRasterBounds(childNode) || getAbs(childNode)
    var parentBox = getAbs(parentNode)
    if (!box || !parentBox) return ""
    var relX = cssOutLayoutPx(box.x - parentBox.x)
    var relY = cssOutLayoutPx(box.y - parentBox.y)
    var w = box.w != null ? cssOutLayoutPx(box.w) : "0"
    var h = box.h != null ? cssOutLayoutPx(box.h) : "0"
    return "--ap-left:" + relX + ";--ap-top:" + relY + ";--ap-w:" + w + ";--ap-h:" + h
}

/** PC/MO TEXT 래스터 절대 위치 비교 후 MO 기준 선언 */
function buildAbsDeclTextRasterDiff(dChild, dParent, mChild, mParent) {
    var dB = getTextRasterBounds(dChild) || getAbs(dChild)
    var dPB = getAbs(dParent)
    var mB = getTextRasterBounds(mChild) || getAbs(mChild)
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
    if (layoutPxNum(dRelX) === layoutPxNum(mRelX) && layoutPxNum(dRelY) === layoutPxNum(mRelY) && layoutPxNum(dW) === layoutPxNum(mW) && layoutPxNum(dH) === layoutPxNum(mH))
        return ""
    return buildAbsDeclTextRaster(mChild, mParent)
}

function hasAbsoluteChild(node) {
    if (!node || !node.children) return false
    return node.children.some(function (child) {
        return child.layoutPositioning === "ABSOLUTE"
    })
}

/** PC(d)와 MO(m) 레이아웃 변수 비교 후 달라진 것만 MO 값으로 선언 */
/** moAbsSelf: MO 노드가 ap-abs 이면 position:relative 생략 */
function buildFlexDeclDiff(dLv, mLv, node, moAbsSelf) {
    if (moAbsSelf === undefined) moAbsSelf = false
    if (!mLv) return ""

    function norm(lv) {
        if (!lv) {
            return {
                direction: "row",
                wrap: "nowrap",
                justify: "flex-start",
                align: "stretch",
                gap: 0,
                pt: 0,
                pr: 0,
                pb: 0,
                pl: 0,
            }
        }
        return {
            direction: lv.direction || "row",
            wrap: lv.wrap || "nowrap",
            justify: lv.justify || "flex-start",
            align: lv.align == null || lv.align === "" ? "stretch" : lv.align,
            gap: layoutPxInt(lv.gap),
            pt: layoutPxInt(lv.pt),
            pr: layoutPxInt(lv.pr),
            pb: layoutPxInt(lv.pb),
            pl: layoutPxInt(lv.pl),
        }
    }

    var d = norm(dLv)
    var m = norm(mLv)
    var parts = []

    parts.push("display:flex")

    if (hasAbsoluteChild(node) && !moAbsSelf) {
        parts.push("position:relative")
    }

    if (d.direction !== m.direction) parts.push("flex-direction:" + m.direction)
    if (d.wrap !== m.wrap) parts.push("flex-wrap:" + m.wrap)
    if (d.justify !== m.justify) parts.push("justify-content:" + m.justify)
    if (d.align !== m.align) parts.push("align-items:" + m.align)

    if (d.gap !== m.gap && m.gap !== 0) {
        parts.push("gap:calc(" + m.gap + "/var(--ap-width)*100cqi)")
    }

    if (d.pt !== m.pt || d.pr !== m.pr || d.pb !== m.pb || d.pl !== m.pl) {
        var padMo = buildFlexPaddingDecl(m.pt, m.pr, m.pb, m.pl)
        parts.push(padMo || "padding:0")
    }

    return parts.join(";")
}
/** PC(d)와 MO(m) 절대 위치 비교 후 달라질 때만 MO 기준 선언 */
function buildAbsDeclDiff(dChild, dParent, mChild, mParent) {
    var dB = getBoundsForAbsDeclChild(dChild, dParent)
    var dPB = getAbs(dParent)
    var mB = getBoundsForAbsDeclChild(mChild, mParent)
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
    if (layoutPxNum(dRelX) === layoutPxNum(mRelX) && layoutPxNum(dRelY) === layoutPxNum(mRelY) && layoutPxNum(dW) === layoutPxNum(mW) && layoutPxNum(dH) === layoutPxNum(mH))
        return ""
    return buildAbsDecl(mChild, mParent)
}

/** ap-section__image figure: 크기는 getImageSizeDeclDiff 의 --ap-w/--ap-h 만 쓰고, MO 절대배치는 left/top 만 */
function buildAbsDeclDiffPositionOnly(dChild, dParent, mChild, mParent) {
    var dB = getBoundsForAbsDeclChild(dChild, dParent)
    var dPB = getAbs(dParent)
    var mB = getBoundsForAbsDeclChild(mChild, mParent)
    var mPB = getAbs(mParent)
    if (!dB || !dPB || !mB || !mPB) return ""
    var dRelX = r2(dB.x - dPB.x),
        dRelY = r2(dB.y - dPB.y)
    var mRelX = r2(mB.x - mPB.x),
        mRelY = r2(mB.y - mPB.y)
    if (layoutPxNum(dRelX) === layoutPxNum(mRelX) && layoutPxNum(dRelY) === layoutPxNum(mRelY)) return ""
    return "--ap-left:" + cssOutLayoutPx(mRelX) + ";--ap-top:" + cssOutLayoutPx(mRelY)
}

/** PC(d)와 MO(m) 이미지 크기 비교 후 달라진 것만 MO 값으로 선언 */
function getImageSizeDeclDiff(dNode, mNode) {
    var dBox = dNode && dNode.type === "TEXT" ? getTextRasterBounds(dNode) : getRasterExportBounds(dNode)
    var mBox = mNode && mNode.type === "TEXT" ? getTextRasterBounds(mNode) : getRasterExportBounds(mNode)
    if (!mBox || (mBox.w == null && mBox.h == null)) return ""
    var dw = dBox && dBox.w != null ? layoutPxNum(dBox.w) : null
    var dh = dBox && dBox.h != null ? layoutPxNum(dBox.h) : null
    var mw = mBox.w != null ? layoutPxNum(mBox.w) : null
    var mh = mBox.h != null ? layoutPxNum(mBox.h) : null
    if (layoutPxNum(dw) === layoutPxNum(mw) && layoutPxNum(dh) === layoutPxNum(mh)) return ""
    var parts = []
    if (mw != null) parts.push("--ap-w:" + cssOutLayoutPx(mw))
    if (mh != null) parts.push("--ap-h:" + cssOutLayoutPx(mh))
    return parts.join(";")
}

/** PC/MO 비디오 크기 diff → aspect-ratio 스타일 (인라인 style 오버라이드용) */
function getVideoSizeDeclDiff(dNode, mNode) {
    var mAbs = getAbs(mNode)
    if (!mAbs || mAbs.w == null || mAbs.h == null || mAbs.h <= 0) return ""
    var dAbs = getAbs(dNode)
    var dw = dAbs && dAbs.w != null ? layoutPxNum(dAbs.w) : null
    var dh = dAbs && dAbs.h != null ? layoutPxNum(dAbs.h) : null
    var mw = layoutPxNum(mAbs.w)
    var mh = layoutPxNum(mAbs.h)
    if (dw === mw && dh === mh) return ""
    return "aspect-ratio:" + cssOutLayoutPx(mw) + "/" + cssOutLayoutPx(mh)
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

/** 최상단(스택 맨 위) 보이는 IMAGE fill의 imageHash — UI·getTopmostVisibleFill과 동일 순서 (fills[0]=아래, 끝=위) */
function getPrimaryImageFillHash(node) {
    try {
        var fills = node.fills
        if (!fills || fills === figma.mixed) return ""
        for (var i = fills.length - 1; i >= 0; i--) {
            var f = fills[i]
            if (f && f.visible !== false && f.type === "IMAGE" && f.imageHash) return String(f.imageHash)
        }
    } catch (e) {}
    return ""
}

/** section이 캔버스형 레이아웃이면 min-height 필요 */
function needsMinHeight(sectionNode) {
    if (!sectionNode) return false

    var children = sectionNode.children || []
    var absCount = 0
    for (var i = 0; i < children.length; i++) {
        var c = children[i]
        if (!c || !isVisible(c)) continue
        if (isAbsoluteLike(c, sectionNode) || (c.layoutPositioning === "ABSOLUTE")) absCount++
    }

    var hasBgImage = false
    try {
        hasBgImage = hasImageFill(sectionNode)
    } catch (e) {}

    return absCount >= 1 || hasBgImage
}

/**
 * PC 기본(.ap-section--NN): 캔버스형 min-height 블록을 넣을지.
 * 슬라이더 섹션 제외, 박스 높이 있음, needsMinHeight 참일 때만 --ap-section-h + min-height(calc).
 */
function getPcSectionCanvasHeightDecls(sectionNode, slideData, box) {
    if (slideData || !box || box.h == null || !needsMinHeight(sectionNode)) return null
    return ["--ap-section-h:" + cssOutLayoutPx(box.h), "min-height:calc(var(--ap-section-h)/var(--ap-width)*100cqi)"]
}

/**
 * @media(max-width): MO 섹션 높이를 PC와 맞출 때 (슬라이드 섹션 제외).
 * - PC·MO 모두 비캔버스 → 선언 없음 (불필요한 --ap-section-h 제거)
 * - MO만 캔버스형 → --ap-section-h + min-height (PC 베이스에 calc 없을 때)
 * - PC 캔버스형(단독 또는 MO도 캔버스) → --ap-section-h만 MO 값으로 덮어씀 (min-height는 PC 베이스 규칙 유지)
 */
function getMediaSectionCanvasHeightDecl(dSec, mSec, mSecBox) {
    if (!dSec || !mSec || getSlideItems(dSec) || !mSecBox || mSecBox.h == null) return null
    var h = cssOutLayoutPx(mSecBox.h)
    var pcNeed = needsMinHeight(dSec)
    var moNeed = needsMinHeight(mSec)
    if (!pcNeed && !moNeed) return null
    if (moNeed && !pcNeed) {
        return "--ap-section-h:" + h + ";min-height:calc(var(--ap-section-h)/var(--ap-width)*100cqi)"
    }
    if (pcNeed) return "--ap-section-h:" + h
    return null
}

/** PC renderFrameNodeAsync와 동일: 배경(fill/이미지) 또는 stroke 또는 radius가 있을 때만 min-height 부여 */
function frameHasMinHeightVisualReason(node) {
    if (!node) return false
    try {
        if (hasImageFill(node)) return true
        var fill = getFirstSolidFill(node)
        if (fill && fill.color && (typeof fill.opacity !== "number" || fill.opacity > 0)) return true
    } catch (e) {}
    if (buildStrokeDecl(node)) return true
    if (buildCornerRadiusDecl(node)) return true
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
        return "calc(" + cssOutLayoutPx(px) + "/var(--ap-width)*100cqi)"
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
        return "calc(" + cssOutLayoutPx(w) + "/var(--ap-width)*100cqi)"
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


/**
 * 070-image-export — 벡터/이미지 후보 분류·PNG·JPG 휴리스틱 분석(067 export가 사용)
 *
 * isMaskImageRasterGroup — 직계 마스크 1 + IMAGE fill 서브트리 → 단일 래스터 export
 */
// ----- 8. Image tree classification & format heuristics (export는 067) -----
/** VECTOR 계열 타입 목록 (UI 필터와 공유) */
var VECTOR_TYPES = ["VECTOR", "BOOLEAN_OPERATION", "STAR", "LINE", "ELLIPSE", "POLYGON", "RECTANGLE"]
function isVectorType(t) {
    return VECTOR_TYPES.indexOf(t) >= 0
}
function hasImageFillInSubtree(node) {
    if (!node) return false
    if (hasImageFill(node)) return true
    if (!isContainer(node)) return false
    for (var i = 0; i < node.children.length; i++) {
        if (hasImageFillInSubtree(node.children[i])) return true
    }
    return false
}
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
function isCompositeCandidate(node) {
    if (!node || !isContainer(node)) return false
    try {
        return !!node.clipsContent
    } catch (e) {
        return false
    }
}
/** 직계 자식의 isMask (API 미지원 타입은 false) */
function nodeIsMaskLayer070(n) {
    if (!n) return false
    try {
        return n.isMask === true
    } catch (e) {
        return false
    }
}
/** 마스크 레이어 1개 + 서브트리에 IMAGE fill — exportAsync 한 번에 합쳐야 하는 그룹 */
function isMaskImageRasterGroup(node) {
    if (!node || !isContainer(node) || !node.children) return false
    var maskDirect = 0
    for (var i = 0; i < node.children.length; i++) {
        var c = node.children[i]
        if (!c || !isVisible(c)) continue
        if (nodeIsMaskLayer070(c)) maskDirect++
    }
    if (maskDirect !== 1) return false
    if (!hasImageFillInSubtree(node)) return false
    return true
}
function subtreeHasVideo070(n) {
    if (!n || !isVisible(n)) return false
    if (isVideoNode(n)) return true
    var kids = n.children
    if (!kids) return false
    for (var j = 0; j < kids.length; j++) {
        if (subtreeHasVideo070(kids[j])) return true
    }
    return false
}
function isImageCandidate(node) {
    return !!(node && (hasImageFill(node) || isCompositeCandidate(node) || isCodeRasterNode(node) || isMaskImageRasterGroup(node)))
}
/** IMAGE fill 부모 위에 얹는 콘텐츠(TEXT·비디오·code-raster·벡터-only). 클립 KV+로고도 여기서 걸림 */
function subtreeHasVectorOrTextOverlay(node) {
    if (!node || !isContainer(node) || !node.children) return false
    for (var i = 0; i < node.children.length; i++) {
        if (subtreeOverlayWalk070(node.children[i], 0)) return true
    }
    return false
}
function subtreeOverlayWalk070(n, depth) {
    if (!n || !isVisible(n) || depth > 32) return false
    if (n.type === "TEXT") return true
    if (isVideoNode(n)) return true
    if (isCodeRasterNode(n)) return true
    if (isVectorOnlyTree(n)) return true
    if (isContainer(n) && n.children) {
        for (var j = 0; j < n.children.length; j++) {
            if (subtreeOverlayWalk070(n.children[j], depth + 1)) return true
        }
    }
    return false
}
function shouldExportAsSingleRasterImage(node) {
    if (!node) return false
    if (isCodeRasterNode(node)) return true
    if (isMaskImageRasterGroup(node)) return !hasTextInSubtree(node) && !subtreeHasVideo070(node)
    if (!isImageCandidate(node)) return false
    if (isContainer(node) && hasTextInSubtree(node)) return false
    // IMAGE fill + 자식: 전체 exportAsync 시 배경+오버레이가 한 PNG. 무클립이거나(항상) 클립이어도 벡터/텍스트 자식이 있으면 분리(KV+로고).
    if (isContainer(node) && hasImageFill(node) && hasVisibleChildren(node)) {
        if (!isCompositeCandidate(node) || subtreeHasVectorOrTextOverlay(node)) return false
    }
    if (isContainer(node) && shouldCompositeRasterGroup(node)) return true
    if (isContainer(node) && hasMultipleImageLikeChildren(node) && !isCompositeCandidate(node) && !isMaskImageRasterGroup(node))
        return false
    // 클립 프레임(clipsContent): 겹친 래스터 2장도 부모 한 번 exportAsync로 합성 가능. 무클립 2장은 위 분기에서 이미 분리.
    if (isContainer(node) && countDirectRasterImageChildren(node) >= 2 && !isCompositeCandidate(node)) return false
    return true
}
function nodeWillRenderAsApImageFigure(node) {
    if (!node || node.type === "TEXT") return false
    if (isVideoNode(node)) return false
    if (isCodeRasterNode(node)) return true
    if (isVectorOnlyTree(node)) {
        return !isLineLikeNode(node) && node.type !== "ELLIPSE"
    }
    if (!isImageCandidate(node)) return false
    return shouldExportAsSingleRasterImage(node)
}
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
/** 직계 자식만: 보이는 IMAGE fill 보유 레이어 수 */
function countDirectRasterImageChildren(node) {
    if (!node || !isContainer(node) || !node.children) return 0
    var c = 0
    for (var i = 0; i < node.children.length; i++) {
        var ch = node.children[i]
        if (!ch || !isVisible(ch) || ch.type === "TEXT") continue
        if (hasImageFill(ch)) c++
    }
    return c
}
/** pipeline composite-raster: code-raster 제외 시 직계 래스터 이미지 3개 이상일 때만 */
function shouldCompositeRasterGroup(node) {
    return !!(node && isContainer(node) && countDirectRasterImageChildren(node) >= 3)
}
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
    return { png: png, jpg: jpg }
}
/** 보이는 직계 자식 1개·이미지 계열일 때 부모 export로 프레임에 맞게 클립 */
function shouldRasterExportViaParentClip(child, parent) {
    if (!child || !parent || !isContainer(parent)) return false
    if (!isFigmaDirectParent(parent, child)) return false
    try {
        if (isAbsoluteLike(child, parent)) return false
    } catch (eAbs) {}
    if (!hasImageFill(child) && !hasImageFillInSubtree(child)) return false
    var cnt = 0
    var kids = parent.children || []
    for (var i = 0; i < kids.length; i++) {
        if (kids[i] && isVisible(kids[i])) cnt++
    }
    if (cnt !== 1) return false
    try {
        if (parent.clipsContent === true) return true
    } catch (e) {}
    var a = getAbs(child)
    var p = getAbs(parent)
    if (!a || !p) return false
    try {
        var rb = child.absoluteRenderBounds
        if (rb && typeof rb.width === "number" && typeof rb.height === "number") {
            if (r2(rb.width) > p.w + 0.5 || r2(rb.height) > p.h + 0.5) return true
        }
    } catch (e2) {}
    if (
        a.x < p.x - 0.5 ||
        a.y < p.y - 0.5 ||
        a.x + a.w > p.x + p.w + 0.5 ||
        a.y + a.h > p.y + p.h + 0.5
    )
        return true
    return false
}

function nodeSel(id) {
    return id ? "." + nodeUniqueClass(String(id)) : ".ap-missing"
}
var IMAGE_EXPORT_MAX_WIDTH = 200
var IMAGE_EXPORT_ZIP_WIDTH = 1200
var _currentExportWidth = IMAGE_EXPORT_MAX_WIDTH
function getImageSizeDecl(node, parent) {
    var box
    var useParentClipBounds = false
    if (node && node.type !== "TEXT" && parent && isFigmaDirectParent(parent, node)) {
        try {
            useParentClipBounds = !isAbsoluteLike(node, parent)
        } catch (e) {
            useParentClipBounds = true
        }
    }
    if (node && node.type === "TEXT") box = getTextRasterBounds(node)
    else if (useParentClipBounds) box = getRasterExportBoundsClippedToParent(node, parent)
    else box = getRasterExportBounds(node)
    if (!box || (box.w == null && box.h == null)) return ""
    var parts = []
    if (box.w != null) parts.push("--ap-w:" + cssOutLayoutPx(box.w))
    if (box.h != null) parts.push("--ap-h:" + cssOutLayoutPx(box.h))
    return parts.join(";")
}

/**
 * 080-text-fonts — 폰트 로드, TEXT 스타일 구간, ap-text CSS 변수, 허용 폰트 판별
 *
 * getTextSummaryAsync/Sync, getTextFontFamiliesSync, buildTextVarsDecl*, textFamiliesAllowedAsHtml 등.
 * 지연 CSS·에셋 경로·배경·섹션 시맨틱·폰트 래스터 시맨틱 승격은 082·083·085·081.
 */
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
        if (!out.fontFamilies || out.fontFamilies.length === 0) {
            out.fontFamilies = out.fontFamily ? [out.fontFamily] : []
        }

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

        if ((!out.fontFamilies || out.fontFamilies.length === 0) && len > 0 && typeof tn.getStyledTextSegments === "function") {
            try {
                var segsFn = tn.getStyledTextSegments(["fontName"])
                if (segsFn && segsFn.length) {
                    var seenG = {}
                    for (var gi = 0; gi < segsFn.length; gi++) {
                        var gnm = segsFn[gi].fontName
                        if (gnm && gnm !== figma.mixed && gnm.family) {
                            var gff = String(gnm.family)
                            var gk = gff.toLowerCase().trim()
                            if (gk && !seenG[gk]) {
                                seenG[gk] = true
                                out.fontFamilies.push(gff)
                            }
                        }
                    }
                }
            } catch (eGfam) {}
        }
        if (!out.fontFamilies || out.fontFamilies.length === 0) {
            out.fontFamilies = out.fontFamily ? [out.fontFamily] : []
        }
        if (out.fontFamilies.length > 1) {
            var seenD = {}
            out.fontFamilies = out.fontFamilies.filter(function (fam) {
                var dk = String(fam || "").toLowerCase().trim()
                if (!dk || seenD[dk]) return false
                seenD[dk] = true
                return true
            })
        }

        return out
    })
}

/**
 * 폰트 패밀리 문자열 정규화 (매칭용).
 * Noto* 전부 동일 키(noto) — Sans/Serif/CJK/KR/Mono/Color Emoji 등 구분 없음.
 */
function canonicalizeFontFamilyAlias(s) {
    var t = String(s || "").trim()
    if (!t) return ""
    t = t.replace(/\s+/g, " ").trim()
    if (/^noto/i.test(t)) return "noto"
    return t
}

function normalizeFontFamilyForMatch(s) {
    return canonicalizeFontFamilyAlias(
        String(s || "")
            .toLowerCase()
            .trim()
            .replace(/[\-_]+/g, " ")
            .replace(/\s+/g, " ")
            .trim()
    )
}

/** 분석 결과 usedFonts / UI 체크 한 줄. Noto 계열은 전부 "Noto"로 합침 */
function usedFontListLabel(figFamily) {
    if (!figFamily) return ""
    if (normalizeFontFamilyForMatch(figFamily) === "noto") return "Noto"
    return String(figFamily).trim()
}

/**
 * allowedNorm: normalizeFontFamilyForMatch 적용된 UI 허용 목록.
 * Figma "Cera Pro Medium" ↔ 체크 "Cera Pro" 등 접두 일치 허용.
 */
function figFontFamilyMatchesAllowedList(figFamily, allowedNorm) {
    if (!allowedNorm || !allowedNorm.length) return true
    var f = normalizeFontFamilyForMatch(figFamily)
    if (!f) return false
    for (var i = 0; i < allowedNorm.length; i++) {
        var a = allowedNorm[i]
        if (!a) continue
        if (f === a) return true
        if (f.length > a.length && f.slice(0, a.length + 1) === a + " ") return true
        if (a.length > f.length && a.slice(0, f.length + 1) === f + " ") return true
    }
    return false
}

/**
 * UI 허용 폰트 목록과 비교해 TEXT를 HTML로 둘지 (buildCodeAsync / renderTextNodeAsync).
 * unrestricted: 첫 분석 등 — allowedHtml 무시하고 전부 HTML.
 * 그 외: allowedHtml 비면(체크 0개) 전부 이미지, 있으면 목록 매칭.
 */
function textFamiliesAllowedAsHtml(families, allowedHtml, unrestricted) {
    if (unrestricted) return true
    if (!allowedHtml || !allowedHtml.length) return false
    if (!families || !families.length) return false
    for (var ti = 0; ti < families.length; ti++) {
        if (!figFontFamilyMatchesAllowedList(families[ti], allowedHtml)) return false
    }
    return true
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
    parts.push("--ap-fs:" + cssOutNum(fs))

    if (lhRaw > 0) {
        var lhPx = lhRaw
        if (lhRaw <= 3 && fs > 0) lhPx = lhRaw * fs // ratio -> px
        parts.push("--ap-lh:" + cssOutNum(lhPx))
    } else {
        parts.push("--ap-lh:" + cssOutNum(fs))
    }

    parts.push("--ap-ls:" + cssOutNum(ls))
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
    if (d.fs !== m.fs) parts.push("--ap-fs:" + cssOutNum(m.fs))
    if (d.lhPx !== m.lhPx) parts.push("--ap-lh:" + cssOutNum(m.lhPx))
    if (r2(d.ls) !== r2(m.ls)) parts.push("--ap-ls:" + cssOutNum(m.ls))
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

/** TEXT 노드 폰트 패밀리 목록 (동기, textFamiliesAllowedAsHtml / 래스터 판별용) */
function getTextFontFamiliesSync(tn) {
    if (!tn || tn.type !== "TEXT") return []
    var out = []
    try {
        var fn = tn.fontName
        if (fn && fn !== figma.mixed && typeof fn === "object" && fn.family) return [String(fn.family)]
        if (fn === figma.mixed) {
            var len = 0
            try {
                len = tn.characters ? tn.characters.length : 0
            } catch (eLen) {
                len = 0
            }
            if (len > 0 && typeof tn.getRangeAllFontNames === "function") {
                var names = tn.getRangeAllFontNames(0, len)
                var seen = {}
                for (var i = 0; i < names.length; i++) {
                    var fam = names[i] && names[i].family ? String(names[i].family) : ""
                    if (fam && !seen[fam]) {
                        seen[fam] = true
                        out.push(fam)
                    }
                }
            }
        }
    } catch (e) {}
    return out
}

/**
 * 081-section-semantics — ap-section BEM·GEO 힌트·이름 기반 노드 수집·클래스/inner 셀렉터
 *
 * 080 getTextSummarySync 이후에 둠 (buildSectionSemanticClasses).
 * 의존: 010 BEM, 050 bounds, 070 노드 분류·isImageCandidate 등, 080 getTextSummarySync·폰트 허용 판별
 * getApSectionImageSlotKeyFromSemantics / collectMoImageLookupMaps — 095 MO 이미지 크기(렌더 순서와 함께 사용)
 */
/** 남은 텍스트에 title/subtitle 부여 시, 이 px 이하(fs)는 ap-section__desc 로만 분류 */
var AP_SECTION_TITLE_MIN_FS = 26
// ----- Section semantics (id → ap-section__* , MO 이름 매칭용 수집) -----
/** ap-section__image(+접미사) 시맨틱 — 크기는 --ap-w/--ap-h·.ap-image img 규칙으로 두고 flex fill width:100% 제외 */
function nodeHasApSectionImageSemantic(nodeId, opts) {
    var sid = nodeId != null ? String(nodeId) : ""
    if (!sid || !opts || !opts.sectionSemantics) return false
    var sem = opts.sectionSemantics[sid] || []
    for (var i = 0; i < sem.length; i++) {
        if (/^ap-section__image(?:--[0-9]{2})?$/.test(String(sem[i] || ""))) return true
    }
    return false
}

/** HTML과 동일한 ap-section__image(--NN) 키 (applyApSectionImageRenderOrderFromIds 적용 후) */
function getApSectionImageSlotKeyFromSemantics(semArr) {
    if (!semArr || !semArr.length) return ""
    for (var i = 0; i < semArr.length; i++) {
        var c = String(semArr[i] || "")
        if (/^ap-section__image(?:--[0-9]{2})?$/.test(c)) return c
    }
    return ""
}

/** MO 트리: 슬롯·sourceNodeId·id 로 이미지 노드 조회 (095 PC/MO size diff) */
function collectMoImageLookupMaps(moSec, moSem) {
    var bySlot = {}
    var bySourcePcId = {}
    var byId = {}
    if (!moSec || !moSem) return { bySlot: bySlot, bySourcePcId: bySourcePcId, byId: byId }
    function walk(n) {
        if (!n || !isVisible(n)) return
        var isImg = (isImageCandidate(n) || hasImageFill(n) || (isVectorOnlyTree(n) && !isLineLikeNode(n) && n.type !== "ELLIPSE"))
        if (n.id && isImg) {
            var sid = String(n.id)
            var sem = moSem[sid] || []
            var slot = getApSectionImageSlotKeyFromSemantics(sem)
            if (slot) bySlot[slot] = n
            byId[sid] = n
            if (typeof n.getPluginData === "function") {
                var pcSrc = n.getPluginData("sourceNodeId")
                if (pcSrc != null && String(pcSrc).trim() !== "") {
                    var k = String(pcSrc).trim()
                    if (!bySourcePcId[k]) bySourcePcId[k] = n
                }
            }
        }
        if (isContainer(n)) for (var i = 0; i < n.children.length; i++) walk(n.children[i])
    }
    walk(moSec)
    return { bySlot: bySlot, bySourcePcId: bySourcePcId, byId: byId }
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

/** 섹션 서브트리에서 code-video 레이어를 name 기준으로 수집 (MO 비디오 이름 매칭용) */
function collectVideoNodesByName(root) {
    var map = {}
    if (!root) return map
    function walk(n) {
        if (!n || !isVisible(n)) return
        if (n.id && isVideoNode(n)) {
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

/**
 * ap-section 구조 역할 사다리(바깥→안).
 * walkStructure 깊이 매핑·getNextSectionRole(중복 역할 demote)가 같은 순서를 씀. 깊이 초과 시 part.
 */
var AP_SECTION_STRUCTURE_ROLES = [
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

function getApSectionRole(cls) {
    var m = String(cls || "").match(/^ap-section__(container|content|group|block|item|part|slot|cell|unit)(--[a-z0-9-]+)?$/)
    return m ? m[1] : ""
}

function getApSectionRoleSuffix(cls) {
    var m = String(cls || "").match(/^ap-section__(container|content|group|block|item|part|slot|cell|unit)(--[a-z0-9-]+)?$/)
    return m && m[2] ? m[2] : ""
}

function getNextSectionRole(role) {
    var ladder = AP_SECTION_STRUCTURE_ROLES
    var idx = ladder.indexOf(String(role || ""))
    if (idx < 0) return "part"
    if (idx >= ladder.length - 1) return ladder[ladder.length - 1]
    return ladder[idx + 1]
}

function replaceSectionRoleClass(arr, fromRole, toRole) {
    if (!arr || !arr.length) return arr || []
    var out = []
    var replaced = false

    for (var i = 0; i < arr.length; i++) {
        var cls = arr[i]
        var role = getApSectionRole(cls)

        if (role && role === fromRole) {
            var suffix = getApSectionRoleSuffix(cls)
            var nextCls = "ap-section__" + toRole + suffix
            if (out.indexOf(nextCls) < 0) out.push(nextCls)
            replaced = true
            continue
        }

        if (out.indexOf(cls) < 0) out.push(cls)
    }

    if (!replaced) return arr.slice()
    return out
}

function demoteNestedDuplicateSectionRoles(sectionNode, classMap) {
    if (!sectionNode || !classMap) return

    function getOwnRoleFromClassMap(id) {
        var arr = classMap[id] || []
        for (var i = 0; i < arr.length; i++) {
            var role = getApSectionRole(arr[i])
            if (role) return role
        }
        return ""
    }

    function walk(node, parentRole) {
        if (!node || !isVisible(node)) return

        var id = node.id != null ? String(node.id) : ""
        var ownRole = id ? getOwnRoleFromClassMap(id) : ""

        if (id && parentRole && ownRole && parentRole === ownRole) {
            var nextRole = getNextSectionRole(ownRole)
            classMap[id] = replaceSectionRoleClass(classMap[id] || [], ownRole, nextRole)
            ownRole = getOwnRoleFromClassMap(id)
        }

        if (isContainer(node) && node.children && node.children.length) {
            for (var j = 0; j < node.children.length; j++) {
                walk(node.children[j], ownRole || parentRole || "")
            }
        }
    }

    walk(sectionNode, "")
}

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
    if (r === "description") r = "desc"
    var ok = {title: 1, subtitle: 1, desc: 1, caption: 1, cta: 1, label: 1, body: 1}
    return ok[r] ? r : "desc"
}

/**
 * walkStructure 에서 depth 기반 container/content/… 를 줄 FRAME 인지.
 * 단일 이미지·이미지 fill 위주 프레임 등은 leaf 가 tagImageNode 로 image 가 되므로 여기서 구조 역할을 주지 않음.
 */
function isSemanticWrapperFrame(n) {
    if (!n || n.type !== "FRAME" || !isContainer(n)) return false
    if (hasTextInSubtree(n)) return true
    if (hasMultipleImageLikeChildren(n) && !isCompositeCandidate(n)) return false
    if (isImageCandidate(n)) return false
    return true
}

/**
 * 섹션 트리 기준 시맨틱 보조 클래스 (id → 클래스 배열).
 * geoHints: AI 검수 GEO.structure [{ text, role }] — 본문 텍스트 매칭 시 ap-section__* 우선 반영.
 * bgChildId: 섹션 배경으로만 승격된 직계 이미지 — HTML/CSS에 해당 노드가 없으므로 시맨틱·중복 접미사·이미지 번호에서 제외.
 */
function buildSectionSemanticClasses(sectionNode, geoHints, bgChildId) {
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
        if (n.id && isSemanticWrapperFrame(n)) {
            var role = AP_SECTION_STRUCTURE_ROLES[depthFromSection - 1] || "part"
            add(n.id, apSectionBem(role))
        }
        if (isContainer(n)) {
            /** GROUP / INSTANCE / COMPONENT 는 레이아웃 단계를 한 칸 먹지 않음(빈 래퍼 통과) */
            var passDepth =
                n.type === "GROUP" || n.type === "INSTANCE" || n.type === "COMPONENT" ? depthFromSection : depthFromSection + 1
            for (var i = 0; i < (n.children || []).length; i++) {
                walkStructure(n.children[i], passDepth)
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

    var TEXT_ROLE_RE = /^ap-section__(title|subtitle|desc|description|caption|cta|label|body)$/

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
    var bigRank = 0
    for (var rj = 0; rj < remaining.length; rj++) {
        var remFs = remaining[rj].fs != null ? Number(remaining[rj].fs) || 0 : 0
        var roleRem
        if (remFs <= AP_SECTION_TITLE_MIN_FS) {
            roleRem = "desc"
        } else {
            if (bigRank === 0) roleRem = "title"
            else if (bigRank === 1) roleRem = "subtitle"
            else roleRem = "desc"
            bigRank++
        }
        add(remaining[rj].id, apSectionBem(roleRem))
    }

    /** walkStructure 가 먼지 부여한 content 등과 충돌하지 않게: .ap-image 로 나가는 노드는 시맨틱을 image 하나로만 둠 */
    function tagImageNode(n) {
        if (!n || !n.id) return
        /** 이름이 code-video인 레이어는 render에서 플레이스홀더로 나감 — IMAGE fill 있어도 image 시맨틱만 주면 apply가 image를 지운 뒤 빈 map이 됨 */
        if (isVideoNode(n)) {
            map[String(n.id)] = [apSectionBem("video")]
            return
        }
        map[String(n.id)] = [apSectionBem("image")]
    }
    function walkImg(n) {
        if (!n || !isVisible(n)) return
        if (isContainer(n) && hasTextInSubtree(n) && !isCodeRasterNode(n)) {
            for (var k = 0; k < (n.children || []).length; k++) walkImg(n.children[k])
            return
        }
        if (isContainer(n) && isImageCandidate(n)) {
            if (
                hasMultipleImageLikeChildren(n) &&
                !isCompositeCandidate(n) &&
                !isCodeRasterNode(n) &&
                !isMaskImageRasterGroup(n)
            ) {
                for (var k2 = 0; k2 < (n.children || []).length; k2++) walkImg(n.children[k2])
                return
            }
            if (hasImageFill(n) && hasVisibleChildren(n) && (!isCompositeCandidate(n) || subtreeHasVectorOrTextOverlay(n))) {
                for (var kBg = 0; kBg < (n.children || []).length; kBg++) walkImg(n.children[kBg])
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
            else if (nodeWillRenderAsApImageFigure(n)) tagImageNode(n)
            else if (isImageCandidate(n) && !isContainer(n)) tagImageNode(n)
            else add(n.id, apSectionBem("layer"))
        }
        if (isContainer(n)) for (var wf = 0; wf < (n.children || []).length; wf++) walkFillMissing(n.children[wf])
    }
    walkFillMissing(sectionNode)

    var bgSkip = bgChildId != null ? String(bgChildId) : ""
    if (bgSkip && Object.prototype.hasOwnProperty.call(map, bgSkip)) delete map[bgSkip]

    demoteNestedDuplicateSectionRoles(sectionNode, map)
    disambiguateSectionSemantics(sectionNode, map)
    demoteNestedDuplicateSectionRoles(sectionNode, map)
    disambiguateSectionSemantics(sectionNode, map)

    return map
}

/**
 * ap-section__image / ap-section__content 는 섹션 트리 순서로 한 번에 번호 부여.
 * promoteRaster 이후 무접미사 image 가 생겨도 기존 --01… 과 충돌하지 않음.
 * 1개면 접미사 없음, 2개 이상이면 전부 --01, --02…
 */
/**
 * HTML에 실제로 그려지는 <img> 도출 순서(렌더 순서)로 ap-section__image / ap-section__image--NN 부여.
 * 에셋 파일명 imgNN(083 해시·섹션 카운터)과 독립 — orderedImageIds 에 없는 노드의 image 시맨틱은 제거.
 */
function applyApSectionImageRenderOrderFromIds(sectionSemantics, orderedImageIds) {
    if (!sectionSemantics || !orderedImageIds) return
    var set = {}
    for (var si = 0; si < orderedImageIds.length; si++) {
        set[String(orderedImageIds[si])] = true
    }
    for (var nid in sectionSemantics) {
        if (!Object.prototype.hasOwnProperty.call(sectionSemantics, nid)) continue
        if (set[nid]) continue
        var arr0 = sectionSemantics[nid] || []
        sectionSemantics[nid] = arr0.filter(function (c) {
            return !/^ap-section__image(?:--[0-9]{2})?$/.test(String(c || ""))
        })
    }
    var n = orderedImageIds.length
    if (n === 0) return
    for (var j = 0; j < n; j++) {
        var idStr = String(orderedImageIds[j])
        var cls = n === 1 ? apSectionBem("image") : apSectionBem("image") + "--" + pad2(j + 1)
        var arr = sectionSemantics[idStr] ? sectionSemantics[idStr].slice() : []
        arr = arr.filter(function (c) {
            return !/^ap-section__image(?:--[0-9]{2})?$/.test(String(c || ""))
        })
        arr.push(cls)
        sectionSemantics[idStr] = arr
    }
}

function renumberApSectionElemGlobally(sectionNode, map, elemPart) {
    if (!sectionNode || !map) return
    var base = "ap-section__" + elemPart
    var re = new RegExp("^" + base + "(?:--\\d{2})?$")
    var orderedIds = []
    function walkOrd2(n) {
        if (!n || !isVisible(n)) return
        if (n.id) orderedIds.push(String(n.id))
        if (isContainer(n)) for (var j = 0; j < (n.children || []).length; j++) walkOrd2(n.children[j])
    }
    walkOrd2(sectionNode)
    var hits = []
    for (var oi = 0; oi < orderedIds.length; oi++) {
        var nid = orderedIds[oi]
        if (!Object.prototype.hasOwnProperty.call(map, nid)) continue
        var arr = map[nid]
        if (!arr || !arr.length) continue
        for (var ai = 0; ai < arr.length; ai++) {
            if (re.test(String(arr[ai] || ""))) {
                hits.push({ id: nid, idx: ai })
                break
            }
        }
    }
    if (hits.length === 0) return
    if (hits.length === 1) {
        map[hits[0].id][hits[0].idx] = base
        return
    }
    for (var hi = 0; hi < hits.length; hi++) {
        map[hits[hi].id][hits[hi].idx] = base + "--" + pad2(hi + 1)
    }
}

/** 동일 ap-section__* 가 여러 노드면: 그 외 역할은 첫 노드 접미사 없음·둘째부터 --02… (image/content 는 renumberApSectionElemGlobally) */
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
        var clsStr = String(cls || "")
        var baseNm = clsStr.replace(/--\d{2}$/, "")
        if (baseNm === "ap-section__content" || baseNm === "ap-section__image") continue
        for (var k = 0; k < ids.length; k++) {
            var newCls = k === 0 ? clsStr : baseNm + "--" + pad2(k + 1)
            var arrM = map[ids[k]]
            var idx = arrM.indexOf(clsStr)
            if (idx >= 0) arrM[idx] = newCls
        }
    }
    renumberApSectionElemGlobally(sectionNode, map, "image")
    renumberApSectionElemGlobally(sectionNode, map, "content")
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
            if (/^ap-section__image(?:--[0-9]{2})?$/.test(String(sem[i] || ""))) {
                pick = sem[i]
                break
            }
        }
    }
    return forImgChild ? "." + pick + " > img" : "." + pick
}

/** TEXT 래스터 시 ap-section__title/__desc 등 제거 후 이미지 레이아웃(ap-section__image)과 동일 계열로 맞춤 */
var RASTER_STRIP_TEXT_ROLE_RE = /^ap-section__(title|subtitle|desc|description|caption|cta|label|body)(--|$)/

function optsWithRasterTextAsImageSemantics(id, opts) {
    if (!opts) return { sectionSemantics: {} }
    var sid = id != null ? String(id) : ""
    if (!sid) return opts
    var sem = opts.sectionSemantics || {}
    var orig = sem[sid] ? sem[sid].slice() : []
    var disambigSuffix = ""
    for (var oi = 0; oi < orig.length; oi++) {
        var m = /^ap-section__(?:title|subtitle|desc|description|caption|cta|label|body)(--[0-9]{2})$/.exec(String(orig[oi] || ""))
        if (m) disambigSuffix = m[1]
    }
    var arr = orig.filter(function (c) {
        return !RASTER_STRIP_TEXT_ROLE_RE.test(String(c || ""))
    })
    var hasImgLike = arr.some(function (c) {
        return /^ap-section__image(?:--[0-9]{2})?$/.test(String(c || ""))
    })
    if (!hasImgLike) arr.push(apSectionBem("image") + disambigSuffix)
    var nextSem = {}
    for (var k in sem) {
        if (Object.prototype.hasOwnProperty.call(sem, k)) nextSem[k] = sem[k]
    }
    nextSem[sid] = arr
    var out = {}
    for (var ko in opts) {
        if (Object.prototype.hasOwnProperty.call(opts, ko)) out[ko] = opts[ko]
    }
    out.sectionSemantics = nextSem
    return out
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
/** 리프·자식 노드 지연 스타일용 inner selector */
function getLeafSelectorForNode(ch, opts) {
    if (!ch || !ch.id) return ""
    if (opts && opts.sectionSemantics) return cssInnerSelForNode(String(ch.id), opts, false)
    return nodeSel(String(ch.id))
}

/**
 * HTML 텍스트가 아닌(폰트 필터로 래스터) TEXT는 시맨틱에서 title/subtitle 등을 제거하고
 * ap-section__image 를 부여 — 접미사(--01…)는 호출부에서 promote 이후 disambiguateSectionSemantics 로 통일.
 */
function promoteRasterTextNodesToImageSemantics(sectionNode, map, allowedHtml, unrestricted) {
    if (!sectionNode || !map) return
    var rasterIdsOrdered = []
    function walkCollect(n) {
        if (!n || !isVisible(n)) return
        if (n.type === "TEXT" && n.id != null) {
            var families = getTextFontFamiliesSync(n)
            if (!textFamiliesAllowedAsHtml(families, allowedHtml, unrestricted)) rasterIdsOrdered.push(String(n.id))
        }
        if (isContainer(n)) for (var i = 0; i < n.children.length; i++) walkCollect(n.children[i])
    }
    walkCollect(sectionNode)
    for (var ri = 0; ri < rasterIdsOrdered.length; ri++) {
        var sid = rasterIdsOrdered[ri]
        var arr = (map[sid] || []).slice().filter(function (c) {
            return !RASTER_STRIP_TEXT_ROLE_RE.test(String(c || ""))
        })
        var hasImg = arr.some(function (c) {
            return /^ap-section__image(?:--[0-9]{2})?$/.test(String(c || ""))
        })
        if (!hasImg) {
            arr.push(apSectionBem("image"))
            map[sid] = arr
        }
    }
}


/**
 * 082-deferred-css — 지연 CSS 누적·병합·BEM 정리·MO 셀렉터 필터·이미지 크기 var
 *   구조 불일치(PC+MO) 시 096에서 `.pc-only .ap-section--NN …` / `.mo-only .ap-section--NN …` 형태로 누적
 *
 * 의존: 010 pad2, 070 getImageSizeDecl/cssInnerSel은 081·070 — pushDeferredImageImgSizeVars는 081 cssInner 이후
 */
// ----- Deferred CSS (빌드 컨텍스트에 sel+decl 누적, 최종 압축 전 병합) -----
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

/** deferred 규칙에 포함된 첫 `ap-section--NN` 번호 (`.pc-only .ap-section--02 …` 등 대응) */
function leadingApSectionIdFromSelector(sel) {
    var m = /\.ap-section--(\d+)/.exec(String(sel || "").trim())
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

/** 묶인 BEM 리프 대표: 접미사 없는 베이스 클래스 우선, 없으면 --숫자 최소 */
function representativeBemClassForMerge(leaves) {
    var scored = leaves.map(function (leaf) {
        var mm = /--(\d+)$/.exec(leaf)
        if (!mm) return { leaf: leaf, suffixed: 0, n: 0 }
        return { leaf: leaf, suffixed: 1, n: parseInt(mm[1], 10) }
    })
    scored.sort(function (a, b) {
        if (a.suffixed !== b.suffixed) return a.suffixed - b.suffixed
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

/**
 * PC보내기 최종 article HTML에 등장한 ap-section__* 토큰만 섹션별 집계.
 * deferred 규칙에 안 잡혀 stripUnused로 클래스가 빠진 뒤에도 MO가 옛 BEM으로 오버라이드하는 것을 막기 위함.
 */
function buildUsedApSectionBemFromArticleHtml(articleHtml) {
    var map = Object.create(null)
    if (!articleHtml) return map
    var lines = String(articleHtml).split(/\r?\n/)
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
            for (var ci = 0; ci < closeSecs.length; ci++) if (stack.length) stack.pop()
        }
        var curSec = stack.length ? stack[stack.length - 1] : null
        if (curSec == null) continue
        var idx = 0
        while (true) {
            var q = line.indexOf('class="', idx)
            if (q < 0) break
            var eq = line.indexOf('"', q + 7)
            if (eq < 0) break
            var inner = line.slice(q + 7, eq)
            var toks = inner.split(/\s+/).filter(Boolean)
            for (var t = 0; t < toks.length; t++) {
                if (toks[t].indexOf("ap-section__") === 0) {
                    if (!map[curSec]) map[curSec] = Object.create(null)
                    map[curSec][toks[t]] = true
                }
            }
            idx = eq + 1
        }
    }
    return map
}

function moOverrideSelectorPartIsLive(part, usedBySection) {
    part = String(part || "").trim()
    if (!part) return true
    if (/^\.ap-section--\d+$/.test(part)) return true
    if (/^\.ap-section--\d+\./.test(part)) {
        if (!/ap-section__/.test(part)) return true
        var m0 = /^\.ap-section--(\d+)/.exec(part)
        if (!m0) return true
        var sec0 = m0[1]
        var used0 = usedBySection[sec0]
        var re0 = /\.(ap-section__[a-zA-Z0-9_-]+)/g
        var mm0
        while ((mm0 = re0.exec(part)) !== null) {
            // 본문에 ap-section__* 집계가 없으면(섹션 키 없음) 필터 완화 — MO 오버라이드 전부 막히지 않게
            if (used0 && !used0[mm0[1]]) return false
        }
        return true
    }
    var m = /^\.ap-section--(\d+)\s+(.+)$/.exec(part)
    if (!m) return true
    var sec = m[1]
    var rest = m[2]
    var used = usedBySection[sec]
    var re = /\.(ap-section__[a-zA-Z0-9_-]+)/g
    var mm
    while ((mm = re.exec(rest)) !== null) {
        if (used && !used[mm[1]]) return false
    }
    return true
}

/** MO @media 규칙: strip 후 본문에 남은 ap-section__* 집계가 있을 때만, 그 맵에 없는 토큰은 생략 */
function moOverrideSelectorIsLive(sel, usedBySection) {
    if (!usedBySection) return true
    sel = String(sel || "").trim()
    if (!sel) return true
    var parts = splitTopLevelCommaSelectors(sel)
    for (var p = 0; p < parts.length; p++) {
        if (!moOverrideSelectorPartIsLive(parts[p], usedBySection)) return false
    }
    return true
}

/** 래퍼(.ap-image .ap-section__image--XX)에 --ap-w/--ap-h만 넣음. 기존 .ap-image img 규칙이 var()로 활용 (ap-abs 래퍼는 생략) */
function pushDeferredImageImgSizeVars(ctx, secClass, nodeId, node, opts, wrapperIsApAbs, visibilityWrapper, clipParent) {
    if (!nodeId || wrapperIsApAbs) return
    var decl = getImageSizeDecl(node, clipParent)
    if (!decl) return
    var innerSel = cssInnerSelForNode(String(nodeId), opts, false)
    var vw = visibilityWrapper ? String(visibilityWrapper).replace(/^\./, "") : ""
    var prefix = vw ? "." + vw + " .ap-section--" + secClass : ".ap-section--" + secClass
    var sel = prefix + " " + innerSel.replace(/,/g, ", " + prefix + " ")
    pushDeferredStyle(ctx, sel, decl)
}

/**
 * 083-assets-cache — ZIP 에셋 파일명 (assetKey → path).
 * 경로는 assetKey(067에서 secNo·노드 id 포함)당 1개만. 내용/figma imageHash만으로 다른 노드에 경로를 재사용하지 않음.
 */
var ASSETS_IMAGES_PREFIX = "assets/images/"
function normalizeProjectName(s) {
    s = String(s || "").trim()
    if (!s) return "project"
    s = s.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9_-]/g, "")
    return s || "project"
}

/** 이미지 파일명용 국가 코드 (소문자 2자, 예: kr, jp). 비우면 파일명에 국가 접미사 없음. */
function normalizeExportCountryCode(s) {
    s = String(s || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z]/g, "")
    if (s.length !== 2) return ""
    return s
}

/**
 * MO 전용 CSS 등에 들어간 stem → moPathByPcStem 조회용 PC stem.
 * 예: …_img01_mo_kr_260330 → …_img01_pc_kr_260330
 */
function apAssetStemToPcRasterLookupKey(stem) {
    stem = String(stem || "")
    var m = /^(.+_img\d+)_mo((?:_[a-z]{2})?)(_\d{6})$/.exec(stem)
    if (m) return m[1] + "_pc" + m[2] + m[3]
    return stem.replace(/_mo$/i, "")
}

function ensureImageInListOnce(cache, name, dataUrl) {
    if (!cache || !cache.imageList || !name || !dataUrl) return
    for (var i = 0; i < cache.imageList.length; i++) {
        if (cache.imageList[i].name === name) return
    }
    cache.imageList.push({ name: name, dataUrl: dataUrl })
}

function getDataUrlExt(dataUrl) {
    if (!dataUrl) return ".jpg"
    if (dataUrl.indexOf("image/svg+xml") >= 0) return ".svg"
    if (dataUrl.indexOf("image/png") >= 0) return ".png"
    if (dataUrl.indexOf("image/jpeg") >= 0) return ".jpg"
    if (dataUrl.indexOf("image/webp") >= 0) return ".webp"
    if (dataUrl.indexOf("image/gif") >= 0) return ".gif"
    return ".jpg"
}

/** ZIP 이미지 파일명에 붙는 제작일 접미사 `_YYMMDD` (한 번의 export 세션마다 동일). */
function getOrInitExportImageYymmddSuffix(cache) {
    if (!cache) return ""
    if (cache._exportImageYymmddSuffix != null) return cache._exportImageYymmddSuffix
    var d = new Date()
    var y = String(d.getFullYear()).slice(-2)
    var mo = String(d.getMonth() + 1)
    if (mo.length < 2) mo = "0" + mo
    var da = String(d.getDate())
    if (da.length < 2) da = "0" + da
    cache._exportImageYymmddSuffix = "_" + y + mo + da
    return cache._exportImageYymmddSuffix
}

function getOrAssignImagePath(cache, assetKey, dataUrl, secNo, opts) {
    opts = opts || {}
    if (!cache) return ""
    if (!cache.imageName) cache.imageName = {}
    if (!cache.imgCountBySec) cache.imgCountBySec = {}
    if (!cache.imageList) cache.imageList = []

    if (opts.reuseAssetKey && cache.imageName[opts.reuseAssetKey]) {
        var reusedPath = cache.imageName[opts.reuseAssetKey]
        var ak = assetKey != null ? String(assetKey) : ""
        if (ak && reusedPath) cache.imageName[ak] = reusedPath
        return reusedPath
    }

    var key = assetKey != null ? String(assetKey) : ""
    if (!key) return ""

    var secEarly = Number(secNo) || 1

    if (!cache.imageName[key]) {
        if (!dataUrl || !String(dataUrl).trim()) return ""
        var ext = getDataUrlExt(dataUrl)

        var n = (cache.imgCountBySec[secEarly] || 0) + 1
        cache.imgCountBySec[secEarly] = n

        var project = normalizeProjectName(cache.projectName)
        var dateStem = getOrInitExportImageYymmddSuffix(cache)
        var country = normalizeExportCountryCode(cache.exportCountryCode)
        var countrySeg = country ? "_" + country : ""
        var variantSeg = ""
        var isSvg = ext === ".svg"
        if (!isSvg && !opts.omitPcMoVariant) {
            if (cache.imageSuffix === "_mo") {
                variantSeg = "_mo"
            } else if (cache.usePcMoImageFilenameVariants) {
                variantSeg = "_pc"
            }
        }
        var fileName = "page_" + project + "_sec" + pad2(secEarly) + "_img" + pad2(n) + variantSeg + countrySeg + dateStem + ext

        cache.imageName[key] = ASSETS_IMAGES_PREFIX + fileName
    }

    var pathOut = cache.imageName[key] || ""
    var skipExportFinal = opts.skipExport || !!(dataUrl && cache.imageSuffix === "_mo" && dataUrl.indexOf("image/svg+xml") >= 0)
    if (pathOut && dataUrl && !skipExportFinal) {
        ensureImageInListOnce(cache, pathOut, dataUrl)
    }
    return pathOut
}

function buildPcRasterExtByStemFromImageList(images) {
    var map = Object.create(null)
    if (!images || !images.length) return map
    for (var i = 0; i < images.length; i++) {
        var name = String((images[i] && images[i].name) || "").replace(/\\/g, "/")
        if (!name || /_mo(?:_[a-z]{2})?(?:_\d{6})?\.(png|jpe?g)$/i.test(name)) continue
        var m = /^(.*)\.(png|jpe?g)$/i.exec(name)
        if (!m) continue
        var ext = "." + m[2].toLowerCase()
        if (ext === ".jpeg") ext = ".jpg"
        map[m[1]] = ext
    }
    return map
}

function buildMoRasterPathByPcStemFromMoImageList(moImages) {
    var map = Object.create(null)
    if (!moImages || !moImages.length) return map
    for (var i = 0; i < moImages.length; i++) {
        var name = String((moImages[i] && moImages[i].name) || "").replace(/\\/g, "/")
        var mNew = /^(.+_img\d+)_mo(?:_([a-z]{2}))?(_\d{6})\.(png|jpe?g)$/i.exec(name)
        if (mNew) {
            var cc = mNew[2] ? "_" + mNew[2] : ""
            map[mNew[1] + "_pc" + cc + mNew[3]] = name
            continue
        }
        var m = /^(.+)_mo(?:_(\d{6}))?\.(png|jpe?g)$/i.exec(name)
        if (!m) continue
        var pcStem = m[2] ? m[1] + "_" + m[2] : m[1]
        map[pcStem] = name
    }
    return map
}

/** PC 래스터 경로 → MO 경로 추정(moPathByPcStem 미스). `_YYMMDD`가 있으면 `_mo`를 날짜 앞에 둠. */
function guessMoRasterPathFromPcRasterPath(pcPathWithExt, ext) {
    var p = String(pcPathWithExt || "").trim()
    ext = String(ext || "jpg").toLowerCase()
    if (ext === "jpeg") ext = "jpg"
    if (/_mo(?:_[a-z]{2})?(?:_\d{6})?\.(png|jpe?g)$/i.test(p)) return p
    var mPc = /^(.+_img\d+)_pc(?:_([a-z]{2}))?(_\d{6})\.(png|jpe?g)$/i.exec(p)
    if (mPc) {
        var ex = mPc[4].toLowerCase()
        if (ex === "jpeg") ex = "jpg"
        var cc = mPc[2] ? "_" + mPc[2] : ""
        return mPc[1] + "_mo" + cc + mPc[3] + "." + ex
    }
    var m = /^(.+)_(\d{6})\.(png|jpe?g)$/i.exec(p)
    if (m) {
        var ex2 = m[3].toLowerCase()
        if (ex2 === "jpeg") ex2 = "jpg"
        return m[1] + "_mo_" + m[2] + "." + ex2
    }
    return p.replace(new RegExp("\\." + ext + "$", "i"), "_mo." + ext)
}

/**
 * 067-image-system — 정책·포맷·export·에셋 캐시 (node.id 기반 이미지 캐시 없음)
 */
function createImageAssetStores() {
    return { preview: Object.create(null), export: Object.create(null), zip: Object.create(null) }
}

function ensureImagePipelineOnCache(cache) {
    if (!cache.assetStores) cache.assetStores = createImageAssetStores()
    if (!cache.imagePipeline) cache.imagePipeline = { mode: "export", variant: "pc" }
}

function getAssetStore(cache) {
    ensureImagePipelineOnCache(cache)
    var m = cache.imagePipeline.mode
    if (m === "preview") return cache.assetStores.preview
    if (m === "zip") return cache.assetStores.zip
    return cache.assetStores.export
}

function getCachedAsset(cache, assetKey) {
    var st = getAssetStore(cache)
    return st[assetKey] || null
}

function setCachedAsset(cache, assetKey, data) {
    var st = getAssetStore(cache)
    st[assetKey] = data
}

function structuralSourceHash(node) {
    if (!node) return "nil"
    var box = getAbs(node)
    var w = box && box.w != null ? Math.round(box.w * 100) : 0
    var h = box && box.h != null ? Math.round(box.h * 100) : 0
    var cc = 0
    try {
        cc = node.clipsContent ? 1 : 0
    } catch (e) {}
    return "st:" + (node.type || "?") + ":" + w + "x" + h + ":" + cc
}

function sourceHashForAssetKey(node, kind, ctx) {
    var keyNode = ctx && ctx.pairPcNode && ctx.cache && ctx.cache.imageSuffix === "_mo" && ctx.insideSwiperSlide ? ctx.pairPcNode : node
    var nid = node && node.id != null ? String(node.id).replace(/[^a-zA-Z0-9_-]/g, "_") : "noid"
    var exportSrc = ctx && ctx.rasterExportSourceNode
    var structBase =
        exportSrc && exportSrc.id != null && node && node.id != null && String(exportSrc.id) !== String(node.id)
            ? exportSrc
            : keyNode
    var pclip =
        exportSrc && exportSrc.id != null && node && node.id != null && String(exportSrc.id) !== String(node.id)
            ? ":pclip:" + String(exportSrc.id).replace(/[^a-zA-Z0-9_-]/g, "_")
            : ""
    var ih = getPrimaryImageFillHash(keyNode)
    if (ih) return "ih:" + ih + ":n:" + nid + pclip
    if (kind === "svg") return "svg:" + structuralSourceHash(keyNode) + ":n:" + nid
    return structuralSourceHash(structBase) + ":n:" + nid + pclip
}

function makeAssetKey(node, kind, format, ctx) {
    ensureImagePipelineOnCache(ctx.cache)
    var mode = ctx.cache.imagePipeline.mode
    var variant = ctx.cache.imagePipeline.variant
    if (ctx.cache.imageSuffix === "_mo") variant = "mo"
    var fmt = format === "PNG" ? "png" : format === "JPG" ? "jpg" : "-"
    var sh = sourceHashForAssetKey(node, kind, ctx)
    // 같은 Figma 이미지 해시(ih)라도 섹션마다 별도 파일·export 캐시(083 imageName[key]가 섹션 간 공유되지 않게)
    var secN = ctx && ctx.secNo != null && ctx.secNo !== "" ? Number(ctx.secNo) || 1 : 1
    return mode + ":" + variant + ":" + kind + ":" + fmt + ":s" + secN + ":" + sh
}

function readUint32BEImg(bytes, offset) {
    return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
}

function isJpegBytesImg(bytes) {
    return !!(bytes && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
}

function isPngBytesImg(bytes) {
    return !!(bytes && bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
}

function isGifBytesImg(bytes) {
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

function isWebpBytesImg(bytes) {
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

function pngBytesHasTransparencyImg(bytes) {
    if (!isPngBytesImg(bytes) || bytes.length < 33) return false
    var pos = 8
    while (pos + 12 <= bytes.length) {
        var len = readUint32BEImg(bytes, pos)
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

function webpBytesHasTransparencyImg(bytes) {
    if (!isWebpBytesImg(bytes)) return false
    var pos = 12
    while (pos + 8 <= bytes.length) {
        var chunk = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3])
        var sz = bytes[pos + 4] | (bytes[pos + 5] << 8) | (bytes[pos + 6] << 16) | (bytes[pos + 7] << 24)
        if (sz < 0 || pos + 8 + sz > bytes.length) break
        if (chunk === "VP8X" && sz >= 10) return (bytes[pos + 8] & 0x10) !== 0
        if (chunk === "VP8L") return true
        pos += 8 + sz + (sz & 1)
    }
    return false
}

function gifBytesHasTransparencyImg(bytes) {
    if (!isGifBytesImg(bytes)) return false
    for (var i = 0; i < bytes.length - 4; i++) {
        if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] >= 4) {
            if ((bytes[i + 3] & 1) !== 0) return true
        }
    }
    return false
}

function embeddedImageFillBytesTransparencyAsync(node) {
    if (!node) return Promise.resolve(false)
    try {
        var fills = node.fills
        if (!fills || fills === figma.mixed) return Promise.resolve(false)
        for (var i = fills.length - 1; i >= 0; i--) {
            var f = fills[i]
            if (f && f.visible !== false && f.type === "IMAGE" && f.imageHash) {
                var imageObj = figma.getImageByHash(f.imageHash)
                if (!imageObj) return Promise.resolve(false)
                return imageObj
                    .getBytesAsync()
                    .then(function (bytes) {
                        if (!bytes || bytes.length === 0) return false
                        if (isJpegBytesImg(bytes)) return false
                        if (isPngBytesImg(bytes)) return pngBytesHasTransparencyImg(bytes)
                        if (isWebpBytesImg(bytes)) return webpBytesHasTransparencyImg(bytes)
                        if (isGifBytesImg(bytes)) return gifBytesHasTransparencyImg(bytes)
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

function scanSubtreeEmbeddedTransparencyAsync(node) {
    if (!node || !isVisible(node)) return Promise.resolve(false)
    return embeddedImageFillBytesTransparencyAsync(node).then(function (here) {
        if (here) return true
        if (!isContainer(node) || !node.children || !node.children.length) return false
        var ci = 0
        function nextChild() {
            if (ci >= node.children.length) return Promise.resolve(false)
            var ch = node.children[ci++]
            return scanSubtreeEmbeddedTransparencyAsync(ch).then(function (sub) {
                return sub || nextChild()
            })
        }
        return nextChild()
    })
}

function hasOpacityTransparencySubtreeSync(node) {
    if (!node || !isVisible(node)) return false
    if (typeof node.opacity === "number" && node.opacity < 1) return true
    if (hasVisibleFillWithOpacityLessThanOne(node)) return true
    if (!isContainer(node) || !node.children) return false
    for (var i = 0; i < node.children.length; i++) {
        if (hasOpacityTransparencySubtreeSync(node.children[i])) return true
    }
    return false
}

function nodeNeedsPngFromHeuristicAsync(node) {
    if (!node) return Promise.resolve(false)
    if (hasOpacityTransparencySubtreeSync(node)) return Promise.resolve(true)
    return scanSubtreeEmbeddedTransparencyAsync(node).then(function (bitmapAlpha) {
        if (bitmapAlpha) return true
        var analysis = analyzeExportFormatSubtree(node)
        var scores = computeExportFormatScores(analysis, node)
        return scores.png >= scores.jpg
    })
}

function decideRasterFormatFromPair(pcNode, moNode, ctx) {
    var pPc = pcNode ? nodeNeedsPngFromHeuristicAsync(pcNode) : Promise.resolve(false)
    var pMo = moNode ? nodeNeedsPngFromHeuristicAsync(moNode) : Promise.resolve(false)
    return Promise.all([pPc, pMo]).then(function (arr) {
        return arr[0] || arr[1] ? "PNG" : "JPG"
    })
}

function precomputeRasterFormatsForOrderedNodePairsAsync(moNodes, pcNodesOrNull, secNo, cache) {
    cache.rasterFormatBySlot = cache.rasterFormatBySlot || {}
    cache.rasterFormatByNodeId = cache.rasterFormatByNodeId || {}
    var proms = []
    var n = moNodes.length
    for (var i = 0; i < n; i++) {
        ;(function (slot) {
            var moN = moNodes[slot]
            var pcN = pcNodesOrNull && pcNodesOrNull[slot] != null ? pcNodesOrNull[slot] : null
            if (!moN && !pcN) {
                proms.push(Promise.resolve())
                return
            }
            var paired = !!pcNodesOrNull
            var pcFor = paired && pcN ? pcN : moN
            var moFor = paired && moN ? moN : null
            if (!paired) {
                pcFor = moN
                moFor = null
            }
            proms.push(
                decideRasterFormatFromPair(pcFor, moFor, {}).then(function (fmt) {
                    var sk = secNo + ":" + slot
                    cache.rasterFormatBySlot[sk] = fmt
                    if (moN && moN.id != null) cache.rasterFormatByNodeId[String(moN.id)] = fmt
                    if (pcN && pcN.id != null) cache.rasterFormatByNodeId[String(pcN.id)] = fmt
                }),
            )
        })(i)
    }
    return Promise.all(proms)
}

function rasterFormatFromNodeOrSlotMaps(cache, ctx, node) {
    var sk = slotRasterKey(ctx)
    if (sk && cache.rasterFormatBySlot && cache.rasterFormatBySlot[sk]) return cache.rasterFormatBySlot[sk]
    if (node && node.id != null && cache.rasterFormatByNodeId) {
        var hid = String(node.id)
        if (cache.rasterFormatByNodeId[hid]) return cache.rasterFormatByNodeId[hid]
    }
    var pc = ctx && ctx.pairPcNode
    if (pc && pc.id != null && cache.rasterFormatByNodeId) {
        var pid = String(pc.id)
        if (cache.rasterFormatByNodeId[pid]) return cache.rasterFormatByNodeId[pid]
    }
    return null
}

function resolveRasterFormatOnceAsync(node, ctx) {
    var cache = ctx.cache
    var cached = rasterFormatFromNodeOrSlotMaps(cache, ctx, node)
    if (cached) return Promise.resolve(cached)
    var mo = cache && cache.imageSuffix === "_mo"
    return decideRasterFormatFromPair(ctx.pairPcNode || node, mo ? node : null, ctx).then(function (fmt) {
        cache.rasterFormatByNodeId = cache.rasterFormatByNodeId || {}
        if (node && node.id != null) cache.rasterFormatByNodeId[String(node.id)] = fmt
        if (ctx.pairPcNode && ctx.pairPcNode.id != null) cache.rasterFormatByNodeId[String(ctx.pairPcNode.id)] = fmt
        var sk = slotRasterKey(ctx)
        if (sk) {
            cache.rasterFormatBySlot = cache.rasterFormatBySlot || {}
            cache.rasterFormatBySlot[sk] = fmt
        }
        return fmt
    })
}

function slotRasterKey(ctx) {
    if (!ctx.fromPrefetchSlot) return ""
    return (ctx.secNo || 1) + ":" + (ctx.slotIndex != null ? ctx.slotIndex : 0)
}

function decideImageKind(node, ctx) {
    ctx = ctx || {}
    if (!node) return Promise.resolve("skip")
    var cache = ctx.cache
    var mo = cache && cache.imageSuffix === "_mo"
    var sk = slotRasterKey(ctx)
    if (mo && ctx.insideSwiperSlide) {
        var rkSlide = null
        if (node.id != null && cache.slideAssetKeyByNodeId) rkSlide = cache.slideAssetKeyByNodeId[String(node.id)]
        if (!rkSlide && sk && cache.slideAssetKeyBySlot) rkSlide = cache.slideAssetKeyBySlot[sk]
        if (rkSlide) return Promise.resolve("pc-shared-slide")
    }
    if (node.type === "TEXT") {
        return resolveRasterFormatOnceAsync(node, ctx).then(function (fmt) {
            return fmt === "PNG" ? "raster-png" : "raster-jpg"
        })
    }
    if (isCodeRasterNode(node)) return Promise.resolve("composite-raster")
    if (ctx.sectionBackgroundImageFillOnly && hasImageFill(node)) {
        return resolveRasterFormatOnceAsync(node, ctx).then(function (fmt) {
            return fmt === "PNG" ? "raster-png" : "raster-jpg"
        })
    }
    if (isVectorOnlyTree(node)) return Promise.resolve("svg")
    if (isContainer(node) && shouldCompositeRasterGroup(node)) return Promise.resolve("composite-raster")
    if (!shouldExportAsSingleRasterImage(node)) return Promise.resolve("skip")
    return resolveRasterFormatOnceAsync(node, ctx).then(function (fmt) {
        return fmt === "PNG" ? "raster-png" : "raster-jpg"
    })
}

function rasterFormatFromKind(kind) {
    if (kind === "raster-png") return "PNG"
    if (kind === "raster-jpg") return "JPG"
    return "JPG"
}

/** IMAGE fill만 있는 빈 프레임을 만들어 export (clone 불가·clone 결과 빈 경우) */
function exportFillOnlySyntheticFrameAsync(node, format, ctx) {
    if (!node || !hasImageFill(node)) return Promise.resolve(null)
    var box = null
    try {
        box = getAbs(node)
    } catch (e0) {}
    if (!box || box.w == null || box.h == null) return Promise.resolve(null)
    var w = Math.max(1, Math.round(Number(box.w)))
    var h = Math.max(1, Math.round(Number(box.h)))
    var fills = null
    try {
        fills = node.fills
    } catch (e1) {}
    if (!fills || fills === figma.mixed) return Promise.resolve(null)
    var tmp = null
    try {
        tmp = figma.createFrame()
        tmp.name = "__bg_fill_only__"
        figma.currentPage.appendChild(tmp)
        tmp.resize(w, h)
        var dup = []
        for (var fi = 0; fi < fills.length; fi++) dup.push(JSON.parse(JSON.stringify(fills[fi])))
        tmp.fills = dup
        try {
            if (typeof node.cornerRadius === "number" && !isNaN(node.cornerRadius)) tmp.cornerRadius = node.cornerRadius
        } catch (eCr) {}
    } catch (e2) {
        try {
            if (tmp) tmp.remove()
        } catch (e3) {}
        return Promise.resolve(null)
    }
    return exportRasterAssetAsync(tmp, format, ctx).then(function (res) {
        try {
            if (tmp) tmp.remove()
        } catch (e4) {}
        return res
    })
}

function exportFillOnlyRasterAsync(node, format, ctx) {
    if (!node || !isContainer(node)) return Promise.resolve(null)
    var clone = null
    try {
        clone = node.clone()
        while (clone.children && clone.children.length > 0) clone.removeChild(clone.children[0])
    } catch (e) {
        return exportFillOnlySyntheticFrameAsync(node, format, ctx)
    }
    return exportRasterAssetAsync(clone, format, ctx).then(function (res) {
        try {
            if (clone) clone.remove()
        } catch (e2) {}
        if (res && res.dataUrl) return res
        return exportFillOnlySyntheticFrameAsync(node, format, ctx)
    })
}

/** 최상단 IMAGE fill의 원본 바이트만 (자식·벡터 없음). crop/scale은 프레임과 다를 수 있음 */
function exportRasterFromEmbeddedImageFillBytesAsync(node) {
    var hash = getPrimaryImageFillHash(node)
    if (!hash) return Promise.resolve(null)
    try {
        var img = figma.getImageByHash(hash)
        if (!img) return Promise.resolve(null)
        return img.getBytesAsync().then(function (bytes) {
            if (!bytes || bytes.length === 0) return null
            var b64 = figma.base64Encode(bytes)
            var mime = "image/png"
            var fmtEff = "PNG"
            if (isJpegBytesImg(bytes)) {
                mime = "image/jpeg"
                fmtEff = "JPG"
            } else if (isPngBytesImg(bytes)) {
                mime = "image/png"
                fmtEff = "PNG"
            } else if (isGifBytesImg(bytes)) {
                mime = "image/gif"
                fmtEff = "PNG"
            } else if (isWebpBytesImg(bytes)) {
                mime = "image/webp"
                fmtEff = "PNG"
            }
            return { dataUrl: "data:" + mime + ";base64," + b64, format: fmtEff }
        })
    } catch (e) {
        return Promise.resolve(null)
    }
}

/** 섹션/프레임 배경: fill만(클론·합성 프레임·임베드 원본). 보이는 자식이 있으면 전체 exportAsync로 합치지 않음 */
function exportSectionBackgroundImageRasterAsync(node, format, ctx) {
    if (!node || !hasImageFill(node)) return Promise.resolve(null)
    if (isContainer(node)) {
        return exportFillOnlyRasterAsync(node, format, ctx).then(function (res) {
            if (res && res.dataUrl) return res
            if (hasVisibleChildren(node)) return exportRasterFromEmbeddedImageFillBytesAsync(node)
            if (hasTextInSubtree(node)) return exportRasterWithoutTextSubtreeAsync(node, format, ctx)
            return exportRasterAssetAsync(node, format, ctx)
        })
    }
    if (hasTextInSubtree(node)) return exportRasterWithoutTextSubtreeAsync(node, format, ctx)
    return exportRasterAssetAsync(node, format, ctx)
}

/** 배경 래스터: fill·비텍스트 레이어는 유지, TEXT 노드만 클론에서 제거 후 export */
function exportRasterWithoutTextSubtreeAsync(node, format, ctx) {
    if (!node) return Promise.resolve(null)
    try {
        var clone = node.clone()
        function stripTextUnder(n) {
            if (!n || !isContainer(n) || !n.children) return
            var i = n.children.length
            while (i-- > 0) {
                var c = n.children[i]
                if (!c) continue
                if (c.type === "TEXT") {
                    try {
                        c.remove()
                    } catch (e) {}
                } else {
                    stripTextUnder(c)
                }
            }
        }
        stripTextUnder(clone)
        return exportRasterAssetAsync(clone, format, ctx).then(function (res) {
            try {
                clone.remove()
            } catch (e2) {}
            return res
        })
    } catch (e) {
        return Promise.resolve(null)
    }
}

function exportRasterAssetAsync(node, format, ctx) {
    if (!node) return Promise.resolve(null)
    var w = _currentExportWidth
    // false: 노드 선택 박스(클립된 시각 영역) 기준. true면 자손·오버플로가 절대 바운딩까지 PNG에 포함됨.
    var exportBoundsOpts = { useAbsoluteBounds: false }
    function pack(dataUrl, fmtEff) {
        return dataUrl ? { dataUrl: dataUrl, format: fmtEff } : null
    }
    function doExport(widthOrNull, fmtEff) {
        var opts =
            widthOrNull != null
                ? { constraint: { type: "WIDTH", value: widthOrNull }, format: fmtEff }
                : { format: fmtEff }
        for (var k in exportBoundsOpts) {
            if (Object.prototype.hasOwnProperty.call(exportBoundsOpts, k)) opts[k] = exportBoundsOpts[k]
        }
        return node
            .exportAsync(opts)
            .then(function (bytes) {
                if (bytes && bytes.length > 0) {
                    var b64 = figma.base64Encode(bytes)
                    return pack(
                        fmtEff === "PNG" ? "data:image/png;base64," + b64 : "data:image/jpeg;base64," + b64,
                        fmtEff,
                    )
                }
                return null
            })
            .catch(function () {
                return null
            })
    }
    function tryFmtSeq(fmtEff) {
        return doExport(w, fmtEff).then(function (r) {
            if (r) return r
            return doExport(800, fmtEff)
        }).then(function (r) {
            if (r) return r
            return doExport(null, fmtEff)
        })
    }
    if (format === "PNG") return tryFmtSeq("PNG")
    return tryFmtSeq("JPG").then(function (r) {
        if (r) return r
        return tryFmtSeq("PNG")
    })
}

function exportSvgAssetAsync(node, ctx) {
    if (!node || !isVectorOnlyTree(node)) return Promise.resolve(null)
    try {
        return node
            .exportAsync({ format: "SVG" })
            .then(function (bytes) {
                if (bytes && bytes.length > 0) return "data:image/svg+xml;base64," + figma.base64Encode(bytes)
                return null
            })
            .catch(function () {
                return null
            })
    } catch (e) {
        return Promise.resolve(null)
    }
}

function exportCompositeRasterAsync(node, format, ctx) {
    return exportRasterAssetAsync(node, format || "JPG", ctx)
}

function needsFillOnlyStrip(node) {
    return !!(hasImageFill(node) && isContainer(node) && hasTextInSubtree(node))
}

function exportByKind(node, kind, format, ctx) {
    if (!node || kind === "skip") return Promise.resolve(null)
    if (kind === "pc-shared-slide") return Promise.resolve(null)
    if (kind === "svg") return exportSvgAssetAsync(node, ctx)
    var fmt = format || rasterFormatFromKind(kind)
    var src = (ctx && ctx.rasterExportSourceNode) || node
    var fromParentClip = src !== node
    if (ctx && ctx.sectionBackgroundImageFillOnly && hasImageFill(node)) {
        return exportSectionBackgroundImageRasterAsync(node, fmt, ctx)
    }
    if (kind === "composite-raster") return exportCompositeRasterAsync(src, fmt, ctx)
    if (!fromParentClip && needsFillOnlyStrip(node)) return exportFillOnlyRasterAsync(node, fmt, ctx)
    if (!fromParentClip && hasImageFill(node) && isContainer(node) && hasVisibleChildren(node))
        return exportFillOnlyRasterAsync(node, fmt, ctx)
    return exportRasterAssetAsync(src, fmt, ctx)
}

function finishExport(node, kind, fmt, ctx) {
    var cache = ctx.cache
    var assetKey = makeAssetKey(node, kind, fmt, ctx)
    var hit = getCachedAsset(cache, assetKey)
    if (hit)
        return Promise.resolve({
            dataUrl: hit,
            assetKey: assetKey,
            kind: kind,
            format: fmt,
            reuseAssetKey: null,
        })
    return exportByKind(node, kind, fmt, ctx).then(function (exp) {
        var dataUrl = null
        var fmtFinal = fmt
        if (exp && typeof exp === "object" && exp.dataUrl != null) {
            dataUrl = exp.dataUrl
            if (exp.format) fmtFinal = exp.format
        } else if (typeof exp === "string") {
            dataUrl = exp
        }
        if (fmtFinal && fmtFinal !== fmt) assetKey = makeAssetKey(node, kind, fmtFinal, ctx)
        if (dataUrl) setCachedAsset(cache, assetKey, dataUrl)
        return { dataUrl: dataUrl, assetKey: assetKey, kind: kind, format: fmtFinal, reuseAssetKey: null }
    })
}

function pipelineEnsureImageAsync(node, ctx) {
    if (!node) return Promise.resolve(null)
    ensureImagePipelineOnCache(ctx.cache)
    var cache = ctx.cache
    return decideImageKind(node, ctx).then(function (kind) {
        if (kind === "skip") return null
        if (kind === "pc-shared-slide") {
            var sk2 = slotRasterKey(ctx)
            var rk = null
            if (node.id != null && cache.slideAssetKeyByNodeId) rk = cache.slideAssetKeyByNodeId[String(node.id)]
            if (!rk && sk2 && cache.slideAssetKeyBySlot) rk = cache.slideAssetKeyBySlot[sk2]
            var dataUrlPc = rk ? getCachedAsset(cache, rk) : null
            return {
                dataUrl: dataUrlPc,
                assetKey: rk || makeAssetKey(node, kind, null, ctx),
                kind: kind,
                format: null,
                reuseAssetKey: rk,
            }
        }
        if (kind === "svg") {
            return finishExport(node, kind, null, ctx)
        }
        if (kind === "composite-raster") {
            return resolveRasterFormatOnceAsync(node, ctx).then(function (f) {
                var effCtx =
                    ctx &&
                    !ctx.sectionBackgroundImageFillOnly &&
                    ctx.clipExportParent &&
                    shouldRasterExportViaParentClip(node, ctx.clipExportParent)
                        ? Object.assign({}, ctx, { rasterExportSourceNode: ctx.clipExportParent })
                        : ctx
                return finishExport(node, kind, f, effCtx)
            })
        }
        return resolveRasterFormatOnceAsync(node, ctx).then(function (f) {
            var effCtx2 =
                ctx &&
                !ctx.sectionBackgroundImageFillOnly &&
                ctx.clipExportParent &&
                shouldRasterExportViaParentClip(node, ctx.clipExportParent)
                    ? Object.assign({}, ctx, { rasterExportSourceNode: ctx.clipExportParent })
                    : ctx
            return finishExport(node, kind, f, effCtx2)
        })
    })
}

function resolvePipelineImageAsync(node, ctx) {
    return pipelineEnsureImageAsync(node, ctx).then(function (r) {
        return r && r.dataUrl ? r.dataUrl : null
    })
}

function sendImagesToUI(images, ingestId) {
    if (!images || !images.length) return
    for (var i = 0; i < images.length; i++) {
        var item = images[i]
        figma.ui.postMessage({
            type: "RESULT_IMAGES_CHUNK",
            ingestId: ingestId,
            index: i,
            name: item.name,
            dataUrl: item.dataUrl,
        })
    }
    figma.ui.postMessage({ type: "RESULT_IMAGES_END", ingestId: ingestId })
}

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

    if (isVideoNode(node)) return Promise.resolve([])

    if (isVectorOnlyTree(node)) {
        if (isCodeRasterNode(node)) return node.id != null ? Promise.resolve([String(node.id)]) : Promise.resolve([])
        if (isLineLikeNode(node)) return Promise.resolve([])
        if (node.type === "ELLIPSE") return Promise.resolve([])
        return node.id != null ? Promise.resolve([String(node.id)]) : Promise.resolve([])
    }

    if (shouldExportAsSingleRasterImage(node)) {
        if (
            isContainer(node) &&
            hasMultipleImageLikeChildren(node) &&
            !isCompositeCandidate(node) &&
            !isCodeRasterNode(node) &&
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
                    skipImageFill: isImageCandidate(ch) || isVectorOnlyTree(ch),
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
            skipImageFill: isImageCandidate(ch) || isVectorOnlyTree(ch),
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
    if (pairedDesktopSection && pcOrderedIds && pcOrderedIds[slotIndex] != null) {
        pairPc = findNodeByIdInSubtree(pairedDesktopSection, pcOrderedIds[slotIndex])
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
        var pathOpts = { skipExport: isVideoNode(node), imageHash: getPrimaryImageFillHash(node) }
        if (meta.reuseAssetKey) pathOpts.reuseAssetKey = meta.reuseAssetKey
        if (cache.usePcMoImageFilenameVariants && !cache.imageSuffix && slideData && imgCtx.insideSwiperSlide) {
            pathOpts.omitPcMoVariant = true
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

/**
 * 085-section-background — 섹션·노드 배경 fill → CSS (--bg-img 등)
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
        var path = cache
            ? getOrAssignImagePath(cache, meta.assetKey, meta.dataUrl || "", secNo, {
                  skipExport: isVideoNode(node),
                  imageHash: getPrimaryImageFillHash(node),
                  reuseAssetKey: meta.reuseAssetKey || undefined,
              })
            : ""
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

    if (topFill.type === "SOLID") {
        if (hasImageFill(node)) {
            return pipelineRasterBackgroundImageDeclAsync(node, useCssVarsForSection, cache, secNo)
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

function buildSectionBackgroundAsync(sectionNode, cache, secNo) {
    var slideData = getSlideItems(sectionNode)

    return buildBackgroundDeclAsync(sectionNode, true, cache, secNo).then(function (decl) {
        var strokeDecl = buildStrokeDecl(sectionNode)
        if (strokeDecl) decl = decl ? decl + ";" + strokeDecl : strokeDecl
        var radiusDecl = buildCornerRadiusDecl(sectionNode)
        if (radiusDecl) decl = decl ? decl + ";" + radiusDecl : radiusDecl

        var topFillForBg = getTopmostVisibleFill(sectionNode)
        if (topFillForBg && topFillForBg.type === "IMAGE") return { decl: decl, bgChildId: null }
        if (topFillForBg && topFillForBg.type === "SOLID" && hasImageFill(sectionNode)) return { decl: decl, bgChildId: null }
        if (slideData) return { decl: decl, bgChildId: null }

        var children = sectionNode && sectionNode.children ? sectionNode.children : []
        var sectionBox = getAbs(sectionNode)
        if (!sectionBox || children.length === 0) return { decl: decl, bgChildId: null }

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
        if (!fullBleedChild) return { decl: decl, bgChildId: null }

        var bleedCtx = { cache: cache, secNo: secNo, slotIndex: 0, insideSwiperSlide: false, sectionBackgroundImageFillOnly: true }
        if (cache.imageSuffix === "_mo" && fullBleedChild && fullBleedChild.id != null && cache.pairPcNodeIdByMoId) {
            var _pcBleedId = cache.pairPcNodeIdByMoId[String(fullBleedChild.id)]
            if (_pcBleedId) {
                try {
                    bleedCtx.pairPcNode = figma.getNodeById(_pcBleedId)
                } catch (e) {}
            }
        }
        return pipelineEnsureImageAsync(fullBleedChild, bleedCtx).then(function (meta) {
            if (!meta || !meta.dataUrl) return { decl: decl, bgChildId: null }
            var path = cache
                ? getOrAssignImagePath(cache, meta.assetKey, meta.dataUrl, secNo, {
                      skipExport: isVideoNode(fullBleedChild),
                      imageHash: getPrimaryImageFillHash(fullBleedChild),
                      reuseAssetKey: meta.reuseAssetKey || undefined,
                  })
                : ""
            if (path && meta.dataUrl) {
                var merged = decl ? decl + ";--bg-img:url(" + path + ")" : "--bg-img:url(" + path + ")"
                return { decl: merged, bgChildId: fullBleedChild.id }
            }
            return { decl: decl, bgChildId: null }
        })
    })
}

/**
 * 090-tree-inspect — 레이어 인스펙트 텍스트 덤프용 요약 + ROOT/섹션 해석
 *
 * 경계: 덤프 한 줄 요약·PC/MO 매칭·섹션 후보 목록. 비동기 전체 빌드 루프는 097, HTML 생성은 096.
 *
 * oneLineBase, dumpPadKey — 덤프 한 줄·키 패딩
 * bgDetails, flexDetails, layoutChildDetails — 배경·flex·자식 sizing 덤프 문자열
 * getFillFlexStartWidthDecl — FILL + flex-start일 때 width:100% 보조 선언
 * getFlexChildMainAxisGrowDecl — 부모 주축 기준 layoutGrow / 세로 FILL → flex-grow 등
 * resolveDesktopMobile — 선택 2개 시 가로 큰 쪽=PC, breakpoint=MO 폭
 * getSectionNodes — ROOT 직계 보이는 자식 = 섹션 후보 목록
 */
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
    parts.push("justify-content:" + (v.justify || "flex-start"))
    parts.push("align-items:" + (v.align || "flex-start"))
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
    if (isColumn && (pv.align === "" || pv.align === "flex-start")) return "width:100%"
    if (!isColumn && (pv.justify === "" || pv.justify === "flex-start")) return "width:100%"
    return ""
}

/**
 * 부모 오토레이아웃 주축 방향으로 늘리는 자식: layoutGrow>0 또는 세로 FILL(column 부모).
 * row 부모에서 세로 FILL + 교차축 flex-start → height:100%.
 */
function getFlexChildMainAxisGrowDecl(node, parent) {
    if (!node || !parent || !isFlex(parent)) return ""
    try {
        if (isAbsoluteLike(node, parent)) return ""
    } catch (e) {
        return ""
    }
    var pv = getLayoutVars(parent)
    var isColumn = pv.direction === "column"
    var growN = 0
    try {
        if ("layoutGrow" in node && node.layoutGrow != null && Number(node.layoutGrow) > 0) growN = Number(node.layoutGrow)
    } catch (e) {}
    var vFill = false
    try {
        vFill = node.layoutSizingVertical === "FILL"
    } catch (e) {}
    if (isColumn) {
        if (growN > 0) return "flex-grow:" + growN + ";min-height:0"
        if (vFill) return "flex-grow:1;min-height:0"
        return ""
    }
    if (growN > 0) return "flex-grow:" + growN + ";min-width:0"
    if (vFill && pv.align === "flex-start") return "height:100%"
    return ""
}

/**
 * 직계 부모·자식 getAbs 가로가 같으면 width:100% (반응형에서 부모 안 전폭).
 * 절대 배치 자식은 제외 (--ap-w와 충돌).
 */
function getSameWidthAsParentDecl(node, parent) {
    if (!node || !parent) return ""
    try {
        if (isAbsoluteLike(node, parent)) return ""
    } catch (e) {
        return ""
    }
    var cBox = getAbs(node)
    var pBox = getAbs(parent)
    if (!cBox || !pBox || cBox.w == null || pBox.w == null) return ""
    if (r2(cBox.w) !== r2(pBox.w)) return ""
    return "width:100%"
}

/**
 * ap-section__container: 섹션이 column + align-items flex-start 이면 자식이 가로로 안 늘어남.
 * bounding 상 자식이 부모보다 좁을 때 width:100% 로 자손의 % 기준을 잡아줌.
 * 가로 FIXED(고정 픽셀)인 컨테이너는 의도적으로 부모보다 좁을 수 있음 → 휴리스틱 제외(--ap-w calc 유지).
 * semanticNodeId: PC/MO walkPair에서 MO 노드 m에 데스크톱 시맨틱(d.id)을 넘길 때 사용.
 */
function sectionContainerNeedsFullWidthInColumnParent(frameNode, parent, sectionSemantics, semanticNodeId) {
    if (!frameNode || frameNode.type !== "FRAME" || !parent) return false
    try {
        if (isAbsoluteLike(frameNode, parent)) return false
        if (frameNode.layoutSizingHorizontal === "FIXED") return false
        var semId = semanticNodeId != null ? String(semanticNodeId) : String(frameNode.id)
        var arr = sectionSemantics && sectionSemantics[semId]
        if (!arr || !arr.length) return false
        var hasContainer = false
        for (var si = 0; si < arr.length; si++) {
            if (/^ap-section__container/.test(String(arr[si] || ""))) {
                hasContainer = true
                break
            }
        }
        if (!hasContainer) return false
        if (!isFlex(parent)) return false
        var pv = getLayoutVars(parent)
        if (pv.direction !== "column") return false
        var pBox = getAbs(parent)
        var fBox = getAbs(frameNode)
        if (!pBox || !fBox || pBox.w == null || fBox.w == null) return false
        if (r2(fBox.w) >= r2(pBox.w)) return false
        return true
    } catch (e) {
        return false
    }
}

/**
 * Hug 텍스트는 absoluteBoundingBox 가로가 글자 폭만 잡혀 부모 프레임과 숫자가 다름.
 * column flex 안에서 CENTER/RIGHT/JUSTIFIED면 부모 전폭 기준 정렬이 되려면 width:100% 필요.
 * 단, 부모 교차축이 CENTER(align-items:center)면 자식은 flex로 가로 중앙 배치되므로 width:100% 생략(전폭+text-align로 이중·깨짐 방지).
 */
function textNeedsFullWidthForAlignInColumnFlex(textNode, parent) {
    if (!textNode || textNode.type !== "TEXT" || !parent) return false
    try {
        if (!isFlex(parent)) return false
        var pv = getLayoutVars(parent)
        if (pv.direction !== "column") return false
        var counterAxis = String(parent.counterAxisAlignItems || "").toUpperCase()
        if (counterAxis === "CENTER") return false
        var ta = String(textNode.textAlignHorizontal || "").toUpperCase()
        if (ta !== "CENTER" && ta !== "RIGHT" && ta !== "JUSTIFIED") return false
        var isFill = false
        try {
            isFill = textNode.layoutSizingHorizontal === "FILL"
        } catch (e2) {}
        if (isFill) return false
        var pBox = getAbs(parent)
        var tBox = getAbs(textNode)
        if (!pBox || !tBox || pBox.w == null || tBox.w == null) return false
        if (r2(pBox.w) <= r2(tBox.w)) return false
        return true
    } catch (e) {
        return false
    }
}

/**
 * TEXT가 직계 부모 가로를 “채우는” 경우 → 시맨틱 지연 규칙(.ap-section__*)에 width:100% 병합 (줄바꿈·text-align 기준 폭).
 * 1) Auto Layout Fill: layoutSizingHorizontal === "FILL"
 * 2) 또는 getSameWidthAsParentDecl (bounding 가로 = 부모)
 * 3) 또는 column flex + (CENTER|RIGHT|JUSTIFIED) + Hug·좁은 박스 — 단 부모 align-items:center 제외
 * 절대 배치(ap-abs)는 --ap-w와 충돌하므로 제외.
 */
function getTextFullWidthDecl(node, textAbs, parent) {
    if (textAbs || !node || node.type !== "TEXT") return ""
    var byFill = false
    try {
        if (node.layoutSizingHorizontal === "FILL") byFill = true
    } catch (e) {}
    if (!byFill && parent && getSameWidthAsParentDecl(node, parent)) byFill = true
    if (!byFill && parent && textNeedsFullWidthForAlignInColumnFlex(node, parent)) byFill = true
    return byFill ? "width:100%" : ""
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

/** 선택 ROOT의 보이는 직계 자식 각각 = `<section>`(ap-section--01..). 직계 자식마다 섹션을 쪼개면 배경-only·본문 분리 등 루트 레이아웃이 깨질 수 있음. */
function getSectionNodes(root) {
    if (!root || !isContainer(root)) return []
    return (root.children || []).filter(function (c) {
        return c && isVisible(c)
    })
}

/**
 * 095-responsive-pcmo — PC HTML + @media로 MO 스타일·배경·picture 병합
 *
 * 구조 불일치 시 096이 `.pc-only .ap-section--NN` / `.mo-only .ap-section--NN` 지연 규칙 출력 — parseCodeIntoParts·injectBgOverridesForMo 가 래퍼+자손 선택자 인식.
 * buildMobileOverrides — 레이아웃 등은 인덱스 walk; 이미지 크기는 렌더순서(096)·슬롯·sourceNodeId 매칭
 * getSectionStructureMatch — 섹션별 구조 시그니처 일치 여부(하이브리드 경고용)
 * parseCodeIntoParts — 산출 HTML에서 base/section 스타일/article 분리
 * injectBgOverridesForMo — sectionStyles의 --bg-img를 MO용 _mo 경로로 @media에 병합
 * rewriteMoOnlyRasterBgUrls — .mo-only 규칙 안 배경 URL만 MO 파일명·확장자에 맞춤
 * mergeImagesWithMoBackgroundFallback — ZIP/미리보기 imageList에 누락된 _mo 배경 보강
 * apSlidePcImgAttr — 슬라이드 안 이미지는 picture 변환 생략 표시
 * combinePcMoAsBreakpoint — 위 요소 합쳐 최종 HTML 문자열
 */
// ----- 6. Section Utils (배경은 buildSectionBackgroundAsync) -----
/** PC HTML 기준 MO 미디어쿼리 오버라이드 (프레임/텍스트는 인덱스 walk, 이미지는 렌더 순서 반영 시맨틱) */
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

        for (var i = 0; i < dKids.length && i < mKids.length; i++) {
            var d = dKids[i]
            var m = mKids[i]
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
                // PC 프레임과 동일 조건(bg|stroke|radius) + 높이가 다를 때만 MO min-height (Auto Layout+HUG 세로 제외)
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
                        if (!dWantsMin || dh === null || mh !== dh)
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
            var sizePairVideo = isVideoNode(d) || isVideoNode(m)
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
        var secVideoByName = collectVideoNodesByName(mSec)
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
        var mSem = buildSectionSemanticClasses(mSec, (options && options.geoStructure) || null)
        promoteRasterTextNodesToImageSemantics(mSec, mSem, allowedMo, !fontMoActive)
        demoteNestedDuplicateSectionRoles(mSec, mSem)
        disambiguateSectionSemantics(mSec, mSem)
        demoteNestedDuplicateSectionRoles(mSec, mSem)
        disambiguateSectionSemantics(mSec, mSem)
        var moOrder = options.moSectionImageRenderOrderIds && options.moSectionImageRenderOrderIds[s]
        if (moOrder && moOrder.length) applyApSectionImageRenderOrderFromIds(mSem, moOrder)
        var moLookup = collectMoImageLookupMaps(mSec, mSem)
        walkPair(dSec, mSec, mSec, secClass, secImageByName, secTextByName, sectionTextOverrideDone, deskSem, secVideoByName, sectionVideoOverrideDone)
        pushImageMoSizeOverridesForSection(dSec, secClass, deskMoOpts, deskSem, moLookup, secImageByName)
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
        /** 자기 자신이 ap-abs면 position은 클래스에만 있음 — relative를 deferred로 넣으면 섹션 셀렉터가 덮어써 깨짐 */
        if (!useFlex && !abs && containerNeedsRelativeForAbsoluteChildren(node)) declParts.push("position:relative")

        if (useFlex) {
            var lv = getLayoutVars(node)
            var flexDecl = buildFlexDecl(lv, node, abs)
            if (flexDecl) declParts.push(flexDecl)
        }

        var axisGrowSelf = getFlexChildMainAxisGrowDecl(node, parent)
        if (axisGrowSelf && !abs && !nodeHasApSectionImageSemantic(node.id, opts)) declParts.push(axisGrowSelf)

        if (effFullWidth && !nodeHasApSectionImageSemantic(node.id, opts)) {
            declParts.push("width:100%")
        }

        if (!effFullWidth) {
            var fillWidthDecl = getFillFlexStartWidthDecl(node, parent)
            if (fillWidthDecl && !nodeHasApSectionImageSemantic(node.id, opts)) declParts.push(fillWidthDecl)
            else if (!abs) {
                var sizingH = node.layoutSizingHorizontal
                if (sizingH === "FIXED" && box && box.w != null) {
                    declParts.push("--ap-w:" + cssOutLayoutPx(box.w))
                    declParts.push("width:calc(var(--ap-w)/var(--ap-width)*100cqi)")
                }
            }
        }

        // frame height: 배경(fill/이미지) 또는 stroke가 있을 때만 고정. 없으면 생략해 콘텐츠 증가 시 유지보수에 유리.
        return buildBackgroundDeclAsync(node, false, cache, secNo).then(function (bgDecl) {
            if (bgDecl) {
                declParts.push(bgDecl)
                var hasWidth = declParts.some(function (s) {
                    var t = String(s)
                    return t.indexOf("width:") !== -1 || t.indexOf("--ap-w:") !== -1
                })
                if (box && box.w != null && !hasWidth) {
                    declParts.push("--ap-w:" + cssOutLayoutPx(box.w))
                    declParts.push("width:calc(var(--ap-w)/var(--ap-width)*100cqi)")
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
        exportCountryCode: normalizeExportCountryCode(options.exportCountryCode),
        /** PC+MO(데스크톱 단계)에서 래스터 파일명에 `_pc` 접미사 — 슬라이드 공유 에셋은 omitPcMoVariant로 제외 */
        usePcMoImageFilenameVariants: !!(options.mobileRoot && options.phase === "desktop"),
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
        imageName: {},
        imageList: [],
        imgCountBySec: {},
    }
    if (options.mobileRoot && options.phase === "desktop") {
        cache.responsiveTextInnerByNodeId = buildResponsiveTextInnerByNodeIdMap(root, options.mobileRoot)
    }
    if (options.pcRasterExtByStem && typeof options.pcRasterExtByStem === "object") {
        cache.pcRasterExtByStem = options.pcRasterExtByStem
    }
    ensureImagePipelineOnCache(cache)
    cache.imagePipeline.mode = _currentExportWidth >= IMAGE_EXPORT_ZIP_WIDTH ? "zip" : "preview"
    cache.imagePipeline.variant = options.phase === "mobile" ? "mo" : "pc"
    if (options.inheritAssetStores) {
        var ias = options.inheritAssetStores
        for (var storeName in ias) {
            if (!ias[storeName] || !cache.assetStores[storeName]) continue
            var srcS = ias[storeName]
            var dstS = cache.assetStores[storeName]
            for (var ik in srcS) dstS[ik] = srcS[ik]
        }
    }
    if (options.inheritedSlideAssetKeyBySlot) {
        cache.slideAssetKeyBySlot = Object.assign(Object.create(null), options.inheritedSlideAssetKeyBySlot)
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
            // 레이어 트리 워크에서는 export·getOrAssignImagePath 금지:
            // 예전엔 slotIndex=0 고정으로 pipeline을 돌려 rasterFormatBySlot[sec:0]을 오염시키고,
            // makeAssetKey(fmt 불일치)로 동일 노드가 img 두 장으로 중복 export 되는 경우가 있었음.
            // 실제 에셋·경로는 buildCodeAsync prefetch/렌더만 담당.
            props.push(indent(depth + 1) + dumpPadKey("bgImage") + "(코드 생성 시 export·assets 경로)")
            return addChildren()
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
            var structureMismatchSecs = []
            if (options.mobileRoot && options.phase === "desktop") {
                var _sm = getSectionStructureMatch(root, options.mobileRoot)
                if (_sm && !_sm.allMatch && _sm.mismatchSecs && _sm.mismatchSecs.length) structureMismatchSecs = _sm.mismatchSecs
            }
            return buildCodeAsync(
                root,
                cache,
                sectionNodes,
                options.geoStructure || null,
                options.mobileRoot || null,
                structureMismatchSecs,
            ).then(function (result) {
                var code = result && result.code != null ? result.code : typeof result === "string" ? result : ""
                var exportedNodeIds = result && result.exportedNodeIds ? result.exportedNodeIds : {}
                var ownImageNodeIds = result && result.ownImageNodeIds ? result.ownImageNodeIds : {}
                var usedFonts = Object.keys(cache.usedFonts || {})
                    .filter(Boolean)
                    .sort()
                _currentExportWidth = prevExportWidth
                ensureImagePipelineOnCache(cache)
                var assetStoresSnapshot = {
                    preview: Object.assign({}, cache.assetStores.preview),
                    export: Object.assign({}, cache.assetStores.export),
                    zip: Object.assign({}, cache.assetStores.zip),
                }
                return {
                    text: text,
                    dataTree: dataTree,
                    code: code,
                    exportedNodeIds: exportedNodeIds,
                    ownImageNodeIds: ownImageNodeIds,
                    sectionImageRenderOrderIds: result && result.sectionImageRenderOrderIds ? result.sectionImageRenderOrderIds : [],
                    images: cache.imageList || [],
                    vectorTypes: VECTOR_TYPES,
                    usedFonts: usedFonts,
                    assetStoresSnapshot: assetStoresSnapshot,
                    slideAssetKeyBySlot: cache.slideAssetKeyBySlot ? Object.assign(Object.create(null), cache.slideAssetKeyBySlot) : {},
                }
            })
        })
        .catch(function (err) {
            _currentExportWidth = prevExportWidth
            throw err
        })
}

/**
 * 099-ui-router — ui.html ↔ 메인 스레드 메시지 라우팅
 *
 * figma.ui.onmessage — RUN_ANALYZE/RUN_DESKTOP/RUN_MOBILE/EXPORT_ZIP, API 키 저장·로드 등.
 *   분석·ZIP 시 dumpTreeAsync, PC+MO 시 combinePcMoAsBreakpoint, 결과는 RESULT·RESULT_IMAGES_*·ZIP_* 로 UI 전달.
 *
 * 비대해지면 타입별 핸들러만 별 파일로 쪼개고, 여기서는 위임만 두는 편이 유지보수에 유리함.
 */
// ----- 1. UI Router (ui.html → code.js) -----
figma.ui.onmessage = function (msg) {
    if (!msg) return

    /** ROOT 1개=PC만, 2개=PC+MO(가로 큰 쪽 PC) @media 오버라이드 */
    if (msg.type === "RUN_ANALYZE") {
        var selPick = figma.currentPage.selection
        if (!selPick || !selPick.length) {
            figma.ui.postMessage({ type: "ERROR", message: "ROOT 1개(PC만) 또는 2개(PC+MO) 선택 후 분석" })
            return
        }
        if (selPick.length > 2) {
            figma.ui.postMessage({
                type: "ERROR",
                message: "ROOT는 1개 또는 2개만 선택합니다. 2개일 때 가로가 큰 프레임=PC, 작은 프레임=MO",
            })
            return
        }
        msg = Object.assign({}, msg, { type: selPick.length === 1 ? "RUN_DESKTOP" : "RUN_MOBILE" })
    }

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
        var fontHtmlFilterActive = msg.fontHtmlFilterActive === true
        figma.ui.postMessage({type: "LOADING", value: true})

        dumpTreeAsync(root, projectName, allowedFonts, {
            phase: "desktop",
            geoStructure: msg.geoStructure || null,
            fontHtmlFilterActive: fontHtmlFilterActive,
            exportCountryCode: msg.exportCountryCode,
        })
            .then(function (payload) {
                figma.ui.postMessage({type: "LOADING", value: false})
                var images = payload.images || []
                var ingestId = "i" + Date.now() + "-" + String(Math.random()).slice(2, 10)
                figma.ui.postMessage({
                    type: "RESULT",
                    ingestId: ingestId,
                    text: payload.text,
                    dataTree: payload.dataTree,
                    code: payload.code,
                    images: [],
                    imageCount: images.length,
                    vectorTypes: payload.vectorTypes,
                    usedFonts: payload.usedFonts || [],
                    mobileDataTree: undefined,
                })
                sendImagesToUI(images, ingestId)
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
        var fontHtmlFilterActiveMo = msg.fontHtmlFilterActive === true
        figma.ui.postMessage({type: "LOADING", value: true})

        dumpTreeAsync(rootDesktop, projectNameMo, allowedFontsMo, {
            phase: "desktop",
            geoStructure: msg.geoStructure || null,
            fontHtmlFilterActive: fontHtmlFilterActiveMo,
            mobileRoot: rootMobile,
            exportCountryCode: msg.exportCountryCode,
        })
            .then(function (payload) {
                return loadFontsForMobileTreeAsync(rootMobile).then(function () {
                    var pcRasterExtByStem = buildPcRasterExtByStemFromImageList(payload.images || [])
                    return dumpTreeAsync(rootMobile, projectNameMo, allowedFontsMo, {
                        phase: "mobile",
                        imageSuffix: "_mo",
                        fontHtmlFilterActive: fontHtmlFilterActiveMo,
                        pcRasterExtByStem: pcRasterExtByStem,
                        inheritAssetStores: payload.assetStoresSnapshot,
                        inheritedSlideAssetKeyBySlot: payload.slideAssetKeyBySlot || {},
                        exportCountryCode: msg.exportCountryCode,
                    }).then(function (moPayload) {
                        var secMatch = getSectionStructureMatch(rootDesktop, rootMobile)
                        // 미리보기는 항상 단일 iframe + PC/MO 토글(@media·pc-only/mo-only 보정). 이중 탭은 사용하지 않음.
                        var separateViews = false
                        // 구조 불일치 섹션: HTML은 div.pc-only / div.mo-only … hybridMismatchSecs 로 트리 배지·상태만 전달.
                        var code = combinePcMoAsBreakpoint(payload.code || "", rootDesktop, rootMobile, breakpoint, {
                            exportedNodeIds: payload.exportedNodeIds,
                            ownImageNodeIds: payload.ownImageNodeIds,
                            geoStructure: msg.geoStructure || null,
                            allowedFonts: allowedFontsMo,
                            fontHtmlFilterActive: fontHtmlFilterActiveMo,
                            pcSectionImageRenderOrderIds: payload.sectionImageRenderOrderIds,
                            moSectionImageRenderOrderIds: moPayload.sectionImageRenderOrderIds,
                            moImages: moPayload.images || [],
                        })
                        var images = mergeImagesWithMoBackgroundFallback(code, payload.images || [], moPayload.images || [])
                        return {payload: payload, code: code, images: images, mobileDataTree: moPayload.dataTree, separateViews: separateViews, hybridMismatchSecs: (secMatch && secMatch.mismatchSecs) ? secMatch.mismatchSecs : []}
                    })
                })
            })
            .then(function (out) {
                figma.ui.postMessage({type: "LOADING", value: false})
                var images = out.images || []
                var ingestId = "i" + Date.now() + "-" + String(Math.random()).slice(2, 10)
                figma.ui.postMessage({
                    type: "RESULT",
                    ingestId: ingestId,
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
                    moBreakpoint: breakpoint,
                })
                try {
                    sendImagesToUI(images, ingestId)
                } catch (chunkErr) {
                    figma.ui.postMessage({type: "ERROR", message: "이미지 전송 중 오류: " + String(chunkErr && chunkErr.message ? chunkErr.message : chunkErr)})
                }
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
        var fontHtmlFilterActiveZip = msg.fontHtmlFilterActive === true
        /** UI 코드 탭(반영·수정 포함). 비어 있지 않으면 ZIP _cms.html에 항상 우선 사용 · 이미지만 피그마에서 ZIP 해상도로 재 export */
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

        // 1) PC dump (MO 루트 있으면 PC 코드 생성 시점에 MO characters와 줄바꿈 비교)
        var zipDeskOpts = {phase: "desktop", fontHtmlFilterActive: fontHtmlFilterActiveZip, exportCountryCode: msg.exportCountryCode}
        if (hasMobile && rootMobile) {
            zipDeskOpts.mobileRoot = rootMobile
            zipDeskOpts.moBreakpoint = breakpoint
        }
        dumpTreeAsync(rootDesktop, projectName2, allowedFonts2, zipDeskOpts)
            .then(function (payload) {
                var code = payload.code || ""
                var images = payload.images || []

                // 2) MO 있으면 MO dump + 합치기
                if (hasMobile && rootMobile) {
                    return loadFontsForMobileTreeAsync(rootMobile).then(function () {
                        var pcRasterExtByStemZip = buildPcRasterExtByStemFromImageList(payload.images || [])
                        return dumpTreeAsync(rootMobile, projectName2, allowedFonts2, {
                            phase: "mobile",
                            imageSuffix: "_mo",
                            exportWidth: Math.min(2400, Math.round(2 * breakpoint)),
                            fontHtmlFilterActive: fontHtmlFilterActiveZip,
                            pcRasterExtByStem: pcRasterExtByStemZip,
                            inheritAssetStores: payload.assetStoresSnapshot,
                            inheritedSlideAssetKeyBySlot: payload.slideAssetKeyBySlot || {},
                            exportCountryCode: msg.exportCountryCode,
                        }).then(function (moPayload) {
                            var secMatch = getSectionStructureMatch(rootDesktop, rootMobile)
                            // 구조 불일치 섹션: HTML·CSS는 096 래퍼+`.pc-only .ap-section--NN` — ZIP 경로도 동일 파이프라인
                            code = combinePcMoAsBreakpoint(code, rootDesktop, rootMobile, breakpoint, {
                                exportedNodeIds: payload.exportedNodeIds,
                                ownImageNodeIds: payload.ownImageNodeIds,
                                allowedFonts: allowedFonts2,
                                fontHtmlFilterActive: fontHtmlFilterActiveZip,
                                pcSectionImageRenderOrderIds: payload.sectionImageRenderOrderIds,
                                moSectionImageRenderOrderIds: moPayload.sectionImageRenderOrderIds,
                                moImages: moPayload.images || [],
                            })

                            images = mergeImagesWithMoBackgroundFallback(code, payload.images || [], moPayload.images || [])
                            return {code: code, images: images}
                        })
                    })
                }

                // 데스크톱만
                return {code: code, images: images}
            })
            .then(function (out) {
                var zipHtml = stripApAiAuditBlock(codeFromTab || (out && out.code) || "")
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

    if (msg.type === "LOAD_GEMINI_KEY") {
        figma.clientStorage
            .getAsync("gemini_key")
            .then(function (v) {
                figma.ui.postMessage({type: "GEMINI_KEY_LOADED", key: v != null ? String(v) : ""})
            })
            .catch(function () {
                figma.ui.postMessage({type: "GEMINI_KEY_LOADED", key: ""})
            })
        return
    }

    if (msg.type === "SAVE_GEMINI_KEY") {
        var geminiKeyToSave = msg.key != null ? String(msg.key) : ""
        figma.clientStorage
            .setAsync("gemini_key", geminiKeyToSave)
            .then(function () {
                figma.ui.postMessage({type: "GEMINI_KEY_SAVED"})
            })
            .catch(function (e) {
                figma.ui.postMessage({type: "GEMINI_KEY_ERROR", message: String(e)})
            })
        return
    }
}
