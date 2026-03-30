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
        var suffix = cache.imageSuffix != null && cache.imageSuffix !== "" ? String(cache.imageSuffix) : ""
        var dateStem = getOrInitExportImageYymmddSuffix(cache)
        var fileName = "page_" + project + "_sec" + pad2(secEarly) + "_img" + pad2(n) + suffix + dateStem + ext

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
        if (!name || /_mo(?:_\d{6})?\.(png|jpe?g)$/i.test(name)) continue
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
    if (/_mo(?:_\d{6})?\.(png|jpe?g)$/i.test(p)) return p
    var m = /^(.+)_(\d{6})\.(png|jpe?g)$/i.exec(p)
    if (m) {
        var ex = m[3].toLowerCase()
        if (ex === "jpeg") ex = "jpg"
        return m[1] + "_mo_" + m[2] + "." + ex
    }
    return p.replace(new RegExp("\\." + ext + "$", "i"), "_mo." + ext)
}
