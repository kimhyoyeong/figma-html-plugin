/**
 * 020-slide — Swiper 슬라이드 구조·slidesPerView·뷰포트/피치 계산
 *
 * getSlideItems — 섹션에서 slide 레이어 규칙에 따라 슬라이드 아이템·부모 노드 반환
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
