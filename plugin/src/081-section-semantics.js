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
function collectMoImageLookupMaps(moSec, moSem, moInheritCache) {
    var bySlot = {}
    var bySourcePcId = {}
    var byId = {}
    if (!moSec || !moSem) return { bySlot: bySlot, bySourcePcId: bySourcePcId, byId: byId }
    function walk(n) {
        if (!n || !isVisible(n)) return
        var isImg = (isImageCandidate(n, moInheritCache) || hasImageFill(n) || (isVectorOnlyTree(n) && !isLineLikeNode(n) && n.type !== "ELLIPSE"))
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

/** 섹션 서브트리에서 code-video·Video fill 레이어를 name 기준으로 수집 (MO 비디오 이름 매칭용) */
function collectVideoNodesByName(root) {
    var map = {}
    if (!root) return map
    function walk(n) {
        if (!n || !isVisible(n)) return
        if (n.id && isVideoSlotByNameOrFill(n)) {
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
function isSemanticWrapperFrame(n, inheritCache) {
    if (!n || n.type !== "FRAME" || !isContainer(n)) return false
    if (hasTextInSubtree(n)) return true
    if (hasMultipleImageLikeChildren(n, inheritCache) && !isCompositeCandidate(n)) return false
    if (isImageCandidate(n, inheritCache)) return false
    return true
}

/**
 * 섹션 트리 기준 시맨틱 보조 클래스 (id → 클래스 배열).
 * geoHints: AI 검수 GEO.structure [{ text, role }] — 본문 텍스트 매칭 시 ap-section__* 우선 반영.
 * bgChildId: 섹션 배경으로만 승격된 직계 이미지 — HTML/CSS에 해당 노드가 없으므로 시맨틱·중복 접미사·이미지 번호에서 제외.
 * moVideoInheritIds / moRasterInheritIds: PC와 구조 짝인 MO 노드 id → true (095·MO 덤프와 동일).
 */
function buildSectionSemanticClasses(sectionNode, geoHints, bgChildId, moVideoInheritIds, moRasterInheritIds) {
    if (geoHints != null && !Array.isArray(geoHints)) geoHints = null
    if (geoHints && geoHints.length > 64) geoHints = geoHints.slice(0, 64)
    var moInheritCache = null
    if (moVideoInheritIds || moRasterInheritIds) {
        moInheritCache = {}
        if (moVideoInheritIds) moInheritCache.moVideoInheritIds = moVideoInheritIds
        if (moRasterInheritIds) moInheritCache.moRasterInheritIds = moRasterInheritIds
    }
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
        if (n.id && isSemanticWrapperFrame(n, moInheritCache)) {
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
        /** code-video 또는 PC 짝 비디오(MO) — render에서 플레이스홀더로 나감 */
        if (isVideoNodeEffective(n, moInheritCache)) {
            map[String(n.id)] = [apSectionBem("video")]
            return
        }
        map[String(n.id)] = [apSectionBem("image")]
    }
    function walkImg(n) {
        if (!n || !isVisible(n)) return
        if (isContainer(n) && hasTextInSubtree(n) && !isCodeRasterNodeEffective(n, moInheritCache)) {
            for (var k = 0; k < (n.children || []).length; k++) walkImg(n.children[k])
            return
        }
        if (isContainer(n) && isImageCandidate(n, moInheritCache)) {
            if (
                hasMultipleImageLikeChildren(n, moInheritCache) &&
                !isCompositeCandidate(n) &&
                !isCodeRasterNodeEffective(n, moInheritCache) &&
                !isMaskImageRasterGroup(n)
            ) {
                for (var k2 = 0; k2 < (n.children || []).length; k2++) walkImg(n.children[k2])
                return
            }
            if (hasImageFill(n) && hasVisibleChildren(n) && (!isCompositeCandidate(n) || subtreeHasVectorOrTextOverlay(n, moInheritCache))) {
                for (var kBg = 0; kBg < (n.children || []).length; kBg++) walkImg(n.children[kBg])
                return
            }
            tagImageNode(n)
            return
        }
        if (
            n.id &&
            (isImageCandidate(n, moInheritCache) || (isVectorOnlyTree(n) && !isLineLikeNode(n) && n.type !== "ELLIPSE")) &&
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
            if (isVideoNodeEffective(n, moInheritCache)) add(n.id, apSectionBem("video"))
            else if (isLineLikeNode(n)) add(n.id, apSectionBem("line"))
            else if (n.type === "ELLIPSE") add(n.id, apSectionBem("ellipse"))
            else if (nodeWillRenderAsApImageFigure(n, moInheritCache)) tagImageNode(n)
            else if (isImageCandidate(n, moInheritCache) && !isContainer(n)) tagImageNode(n)
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
            var newCls = baseNm + "--" + pad2(k + 1)
            var arrM = map[ids[k]]
            var idx = arrM.indexOf(clsStr)
            if (idx >= 0) arrM[idx] = newCls
        }
    }
    // 모든 요소 타입에 대해 문서 순서 기준 연번 재정렬
    var allBases = {}
    for (var rid in map) {
        if (!Object.prototype.hasOwnProperty.call(map, rid)) continue
        var ra = map[rid] || []
        for (var ri = 0; ri < ra.length; ri++) {
            var rb = String(ra[ri] || "").replace(/--\d{2}$/, "")
            if (rb && rb.indexOf("ap-section__") === 0) allBases[rb] = true
        }
    }
    var elemParts = Object.keys(allBases).map(function (b) { return b.replace("ap-section__", "") })
    for (var ei = 0; ei < elemParts.length; ei++) {
        renumberApSectionElemGlobally(sectionNode, map, elemParts[ei])
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

