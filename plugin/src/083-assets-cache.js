/**
 * 083-assets-cache — ZIP 에셋 파일명·프로젝트 슬러그·이미지 경로 할당
 *
 * page_*_imgNN 파일 번호·해시 디듀프는 여기(에셋 단계). ap-section__image--NN BEM 번호는 084/096 렌더 순서와 별개.
 *
 * 의존: 010 pad2
 */
// ----- Asset paths (cache.imageName, imageList, svgByHash) -----
var ASSETS_IMAGES_PREFIX = "assets/images/"
/** 프로젝트명 → 파일명에 쓸 수 있는 문자열 (공백·특수문자 제거) */
function normalizeProjectName(s) {
    s = String(s || "").trim()
    if (!s) return "project"
    s = s.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9_-]/g, "")
    return s || "project"
}

/** 동일 경로는 imageList에 한 번만 (dump walk + build 이중 호출·재사용 안전) */
function ensureImageInListOnce(cache, name, dataUrl) {
    if (!cache || !cache.imageList || !name || !dataUrl) return
    for (var i = 0; i < cache.imageList.length; i++) {
        if (cache.imageList[i].name === name) return
    }
    cache.imageList.push({name: name, dataUrl: dataUrl})
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

/** nodeId당 1회 할당. page_{project}_sec{01}_img{01}.{ext} — dump walk는 호출하지 않음(build만 호출 → imgNN 연속) (SVG·imageHash·raster bytes 공유) */
function getOrAssignImagePath(cache, nodeId, dataUrl, secNo, opts) {
    opts = opts || {}
    if (!cache) return ""
    if (!cache.imageName) cache.imageName = {}
    if (!cache.imgCountBySec) cache.imgCountBySec = {}
    if (!cache.imageList) cache.imageList = []

    var key = nodeId != null ? nodeId : dataUrl ? "_" + (Math.random() + "") : null
    if (key == null) return ""

    var isSvg = dataUrl && dataUrl.indexOf("image/svg+xml") >= 0
    var secEarly = Number(secNo) || 1
    var figmaImgHash = !opts || opts.imageHash == null || String(opts.imageHash) === "" ? "" : String(opts.imageHash)
    var phKey = !isSvg && figmaImgHash ? secEarly + ":" + figmaImgHash : ""
    var svgHash = isSvg && dataUrl ? simpleHash(dataUrl) : null
    if (isSvg && !cache.svgByHash) cache.svgByHash = {}
    if (svgHash && cache.svgByHash[svgHash]) {
        cache.imageName[key] = cache.svgByHash[svgHash].name
    }

    /** 동일 피그마 IMAGE 소스(imageHash) — PC/MO export 픽셀이 달라도 같은 imgNN·파일 하나 */
    if (!cache.imageName[key] && phKey) {
        if (!cache.pathByImageHash) cache.pathByImageHash = {}
        if (cache.pathByImageHash[phKey]) {
            cache.imageName[key] = cache.pathByImageHash[phKey]
        }
    }

    /** 동일 PNG/JPG/WebP export 결과 → 노드가 달라도 파일 하나 (피그마에서 같은 이미지를 여러 레이어에 쓴 경우) */
    var rasterHash = !isSvg && dataUrl ? simpleHash(dataUrl) : null
    if (rasterHash && !cache.rasterByHash) cache.rasterByHash = {}
    if (!cache.imageName[key] && rasterHash && cache.rasterByHash[rasterHash]) {
        cache.imageName[key] = cache.rasterByHash[rasterHash].name
    }

    if (!cache.imageName[key]) {
        if (!dataUrl || !String(dataUrl).trim()) return ""
        var ext = ".jpg"
        if (dataUrl) {
            if (dataUrl.indexOf("image/png") >= 0) ext = ".png"
            else if (dataUrl.indexOf("image/svg+xml") >= 0) ext = ".svg"
        }

        var n = (cache.imgCountBySec[secEarly] || 0) + 1
        cache.imgCountBySec[secEarly] = n

        var project = normalizeProjectName(cache.projectName)
        var suffix = cache.imageSuffix != null && cache.imageSuffix !== "" ? String(cache.imageSuffix) : ""
        var fileName = "page_" + project + "_sec" + pad2(secEarly) + "_img" + pad2(n) + suffix + ext

        cache.imageName[key] = ASSETS_IMAGES_PREFIX + fileName
        var isSvgMo = dataUrl && cache.imageSuffix === "_mo" && dataUrl.indexOf("image/svg+xml") >= 0
        var skipExport = opts.skipExport || isSvgMo
        if (dataUrl && !skipExport) {
            if (svgHash && cache.svgByHash) cache.svgByHash[svgHash] = { name: cache.imageName[key], dataUrl: dataUrl }
            if (rasterHash && cache.rasterByHash) cache.rasterByHash[rasterHash] = { name: cache.imageName[key], dataUrl: dataUrl }
        }
        if (phKey) {
            if (!cache.pathByImageHash) cache.pathByImageHash = {}
            cache.pathByImageHash[phKey] = cache.imageName[key]
        }
    }

    var pathOut = cache.imageName[key] || ""
    var skipExportFinal = opts.skipExport || !!(dataUrl && cache.imageSuffix === "_mo" && dataUrl.indexOf("image/svg+xml") >= 0)
    if (pathOut && dataUrl && !skipExportFinal) {
        ensureImageInListOnce(cache, pathOut, dataUrl)
    }
    return pathOut
}

/**
 * PC imageList 항목의 경로 → 확장자 맵 (확장자 제외 stem → .jpg | .png).
 * MO(_mo) export 시 같은 sec/img 순서면 PC와 동일 확장자로 래스터를 맞춤.
 */
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

/**
 * MO(_mo) imageList → PC 래스터 stem(확장자 제외 전체 경로) → 실제 MO 에셋 경로.
 */
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

