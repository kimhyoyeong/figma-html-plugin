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
        var fileName = "page_" + project + "_sec" + pad2(secEarly) + "_img" + pad2(n) + suffix + ext

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
        if (!name || /_mo\.(png|jpe?g)$/i.test(name)) continue
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
        var m = /^(.*)_mo\.(png|jpe?g)$/i.exec(name)
        if (!m) continue
        var suf = m[2].toLowerCase()
        if (suf === "jpeg") suf = "jpg"
        map[m[1]] = m[1] + "_mo." + suf
    }
    return map
}
