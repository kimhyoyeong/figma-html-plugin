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

/** nodeId당 1회 할당. page_{project}_sec{01}_img{01}.{ext} (SVG는 내용 해시로 동일 벡터 공유) */
function getOrAssignImagePath(cache, nodeId, dataUrl, secNo, opts) {
    opts = opts || {}
    if (!cache) return ""
    if (!cache.imageName) cache.imageName = {}
    if (!cache.imgCountBySec) cache.imgCountBySec = {}
    if (!cache.imageList) cache.imageList = []

    var key = nodeId != null ? nodeId : dataUrl ? "_" + (Math.random() + "") : null
    if (key == null) return ""

    var isSvg = dataUrl && dataUrl.indexOf("image/svg+xml") >= 0
    var svgHash = isSvg && dataUrl ? simpleHash(dataUrl) : null
    if (isSvg && !cache.svgByHash) cache.svgByHash = {}
    if (svgHash && cache.svgByHash[svgHash]) {
        cache.imageName[key] = cache.svgByHash[svgHash].name
        return cache.imageName[key]
    }

    if (!cache.imageName[key]) {
        var ext = ".jpg"
        if (dataUrl) {
            if (dataUrl.indexOf("image/png") >= 0) ext = ".png"
            else if (dataUrl.indexOf("image/svg+xml") >= 0) ext = ".svg"
        }

        var sec = Number(secNo) || 1
        var n = (cache.imgCountBySec[sec] || 0) + 1
        cache.imgCountBySec[sec] = n

        var project = normalizeProjectName(cache.projectName)
        var suffix = cache.imageSuffix != null && cache.imageSuffix !== "" ? String(cache.imageSuffix) : ""
        var fileName = "page_" + project + "_sec" + pad2(sec) + "_img" + pad2(n) + suffix + ext

        cache.imageName[key] = ASSETS_IMAGES_PREFIX + fileName
        var isSvgMo = dataUrl && cache.imageSuffix === "_mo" && dataUrl.indexOf("image/svg+xml") >= 0
        var skipExport = opts.skipExport || isSvgMo
        if (dataUrl && !skipExport) {
            cache.imageList.push({name: cache.imageName[key], dataUrl: dataUrl})
            if (svgHash && cache.svgByHash) cache.svgByHash[svgHash] = { name: cache.imageName[key], dataUrl: dataUrl }
        }
    }
    return cache.imageName[key]
}

