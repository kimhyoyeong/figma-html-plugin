/**
 * 083-assets-cache — ZIP 에셋 파일명 (assetKey → path).
 * 경로는 assetKey(067에서 secNo·노드 id 포함)당 1개만. 내용/figma imageHash만으로 다른 노드에 경로를 재사용하지 않음.
 */
var ASSETS_IMAGES_PREFIX = "assets/images/"

/** true면 `getOrAssignImagePath` 호출·분기 로그 (Figma → Plugins → Development → Open console). 확인 후 false 권장 */
var DEBUG_LOG_IMAGE_PATH_ASSIGN = false

function dbgImgPath(msg, detail) {
    if (!DEBUG_LOG_IMAGE_PATH_ASSIGN) return
    try {
        if (detail != null) console.log("[imgPath]", msg, detail)
        else console.log("[imgPath]", msg)
    } catch (e0) {}
}

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

/** makeAssetKey 의 :mo: 세그먼트만 :pc: 로 바꿈 (슬라이드 등 해시가 PC와 동일할 때 보조 조회용) */
function moAssetKeyToPcAssetKeyByVariant(moKey) {
    return String(moKey || "").replace(/^([^:]+:)mo(:)/, "$1pc$2")
}

/**
 * PC dump 시 저장된 키는 parent clip export(:pclip)·FRAME 크기 등으로 해시가 달라질 수 있는데,
 * makePairedPcAssetKeyForInheritedPathLookup은 clip/rasterExportSource 없이 짜서 정확 키가 안 맞는 경우가 있다.
 * 같은 preview:pc:…:sN: 접두 + :n:nodeId 를 가진 맵 키로 PC 경로를 찾는다.
 */
function inheritedPcPathScanByPcNodeIdInMap(map, pairedPcAssetKey) {
    if (!map || !pairedPcAssetKey) return ""
    var pk = String(pairedPcAssetKey)
    var mN = /:n:([0-9]+_[0-9]+)(?=:pclip:|$)/.exec(pk)
    if (!mN) return ""
    var needle = ":n:" + mN[1]
    var prefixM = /^(preview:pc:[^:]+:[^:]+:s\d+:)/.exec(pk)
    var prefix = prefixM ? prefixM[1] : ""
    var cands = []
    for (var k in map) {
        if (!Object.prototype.hasOwnProperty.call(map, k)) continue
        if (prefix && k.indexOf(prefix) !== 0) continue
        if (k.indexOf(needle) < 0) continue
        if (!map[k]) continue
        cands.push(k)
    }
    if (!cands.length) return ""
    if (cands.length === 1) return map[cands[0]]
    cands.sort(function (a, b) {
        return b.length - a.length
    })
    return map[cands[0]]
}

function inheritedPcPathForPairedKey(cache, pairedPcAssetKey) {
    if (!cache || !cache.inheritedPcImageName || !pairedPcAssetKey) return ""
    var map = cache.inheritedPcImageName
    if (map[pairedPcAssetKey]) return map[pairedPcAssetKey]
    var toggled = String(pairedPcAssetKey).replace(/:png:/, ":__FMT__:").replace(/:jpg:/, ":png:").replace(/:__FMT__:/, ":jpg:")
    if (toggled !== pairedPcAssetKey && map[toggled]) return map[toggled]
    var scanned = inheritedPcPathScanByPcNodeIdInMap(map, pairedPcAssetKey)
    if (scanned) return scanned
    return ""
}

/**
 * PC export 경로 → 동일 imgNN 의 MO 파일명 (확장자는 MO 래스터에 맞춤). `_pc` 없이 img01_kr_YYMMDD 만 있는 경우도 처리.
 */
function pcExportPathToMoExportPath(pcPath, moExtDot) {
    var p = String(pcPath || "").replace(/\\/g, "/").trim()
    if (!p) return ""
    moExtDot = String(moExtDot || ".jpg").toLowerCase()
    if (moExtDot[0] !== ".") moExtDot = "." + moExtDot
    if (moExtDot === ".jpeg") moExtDot = ".jpg"
    var dirSlash = p.lastIndexOf("/")
    var dir = dirSlash >= 0 ? p.slice(0, dirSlash + 1) : ""
    var base = dirSlash >= 0 ? p.slice(dirSlash + 1) : p
    var stemMo = ""
    var mPc = /^(.+_img\d+)_pc((?:_[a-z]{2})?)(_\d{6})\.(png|jpe?g|webp|gif|svg)$/i.exec(base)
    if (mPc) {
        stemMo = mPc[1] + "_mo" + mPc[2] + mPc[3]
    } else {
        var mBare = /^(.+_img\d+)((?:_[a-z]{2})?)(_\d{6})\.(png|jpe?g|webp|gif|svg)$/i.exec(base)
        if (mBare && !/_img\d+_mo(?:_|$)/i.test(mBare[1])) {
            stemMo = mBare[1] + "_mo" + mBare[2] + mBare[3]
        }
    }
    if (!stemMo) {
        var g = guessMoRasterPathFromPcRasterPath(p, moExtDot.replace(/^\./, ""))
        if (g) return g.replace(/\.(png|jpe?g|webp|gif)$/i, moExtDot)
        return p.replace(/\.(png|jpe?g|webp|gif|svg)$/i, moExtDot)
    }
    return dir + stemMo + moExtDot
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
        dbgImgPath("reuseAssetKey branch", { reuseKey: String(opts.reuseAssetKey).slice(0, 80), ak: ak.slice(0, 80), reusedPath: reusedPath })
        return reusedPath
    }

    var key = assetKey != null ? String(assetKey) : ""
    if (!key) return ""

    var secEarly = Number(secNo) || 1
    var keyShort = key.length > 140 ? key.slice(0, 60) + "…" + key.slice(-70) : key
    var dataLen = dataUrl ? String(dataUrl).trim().length : 0
    var hadKey = Object.prototype.hasOwnProperty.call(cache.imageName, key)
    dbgImgPath("enter", {
        sec: secEarly,
        key: keyShort,
        dataLen: dataLen,
        suffix: cache.imageSuffix || "",
        skipExport: !!opts.skipExport,
        pairedPcKey: opts.pairedPcAssetKey ? String(opts.pairedPcAssetKey).slice(0, 100) : "",
        hadKey: hadKey,
        prevPath: hadKey ? cache.imageName[key] : undefined,
    })

    if (!Object.prototype.hasOwnProperty.call(cache.imageName, key)) {
        if (!dataUrl || !String(dataUrl).trim()) {
            cache.imageName[key] = ""
            dbgImgPath("EARLY empty dataUrl (path locked to \"\")", { key: keyShort })
            return ""
        }
        var ext = getDataUrlExt(dataUrl)
        var assignedPath = ""

        if (cache.imageSuffix === "_mo" && cache.inheritedPcImageName) {
            var pcKey = opts.pairedPcAssetKey || moAssetKeyToPcAssetKeyByVariant(key)
            var pcPathLook = inheritedPcPathForPairedKey(cache, pcKey)
            if (pcPathLook) {
                assignedPath = pcExportPathToMoExportPath(pcPathLook, ext)
                dbgImgPath("MO inherited PC path", { pcKey: String(pcKey).slice(0, 100), pcPathLook: pcPathLook, assignedPath: assignedPath })
            } else if (opts.pairedPcAssetKey) {
                dbgImgPath("MO pairedPcKey no exact inherited path (fall through to imgNN or retry scan next call)", {
                    pcKey: String(pcKey).slice(0, 120),
                    hasMap: !!cache.inheritedPcImageName,
                    mapHasPcKey: !!(cache.inheritedPcImageName && cache.inheritedPcImageName[pcKey]),
                })
            }
        }

        if (!assignedPath) {
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

            assignedPath = ASSETS_IMAGES_PREFIX + fileName
        }

        cache.imageName[key] = assignedPath
        dbgImgPath("first assign", { key: keyShort, assignedPath: assignedPath })
    } else if (hadKey && dataLen > 0 && (!cache.imageName[key] || !String(cache.imageName[key]).trim())) {
        dbgImgPath("WARN cached path empty but dataUrl now non-empty (cannot re-assign)", { key: keyShort, prevPath: cache.imageName[key], dataLen: dataLen })
    }

    var pathOut = cache.imageName[key] || ""
    var skipExportFinal = opts.skipExport || !!(dataUrl && cache.imageSuffix === "_mo" && dataUrl.indexOf("image/svg+xml") >= 0)
    var willList = !!(pathOut && dataUrl && !skipExportFinal)
    if (pathOut && dataUrl && !skipExportFinal) {
        ensureImageInListOnce(cache, pathOut, dataUrl)
    }
    dbgImgPath("exit", { key: keyShort, pathOut: pathOut, willList: willList, skipExportFinal: skipExportFinal })
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
