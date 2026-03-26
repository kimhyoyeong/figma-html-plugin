/**
 * 083-assets-cache — ZIP 에셋 파일명·프로젝트 슬러그·이미지 경로 할당
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

