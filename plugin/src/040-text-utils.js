/**
 * 040-text-utils — HTML 이스케이프, 줄바꿈, PC/MO 반응형 BR, mixed 스타일 텍스트 inner HTML
 *
 * 경계: 문자열·inner HTML·줄바꿈/BR 슬롯. 폰트 로드·스타일 구간·허용 폰트 필터는 080.
 *
 * escapeHtml, textToHtmlWithBreaks — 특수문자·개행 → 안전한 HTML
 * textToHtmlWithResponsiveBr, getResponsiveBrTrailing — brState 기반 반응형 BR(공백↔개행 교환 포함)
 * normalizeTextNewlinesForResponsive, textFlatForResponsiveCompare — PC/MO 텍스트 정규화·비교용 평탄화
 * newlineGapsForResponsive, appendResponsiveSepHtml, appendResponsiveBrSlotHtml — 가시 문자 간 구분자·BR 슬롯
 * moTextNodeFromNameMap, buildResponsiveTextInnerByNodeIdMap — MO 텍스트를 이름/트리로 매칭해 노드 id → MO characters
 * buildTextPartInnerHtml — 스타일 구간별 ap-text__part span (--ap-part-* 는 블록 .ap-text 의 --ap-* 와 분리)
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
/** 반응형 BR: PC 텍스트 부분 문자열을 처리, brState.visIdx 기반 공백/pc-only/mo-only <br> 출력 */
function textToHtmlWithResponsiveBr(s, brState) {
    if (s == null) return ""
    if (!brState) return textToHtmlWithBreaks(s)
    var t = String(s).replace(/\u2028/g, "\n").replace(/\u2029/g, "\n")
    var out = ""
    for (var i = 0; i < t.length; i++) {
        var ch = t.charAt(i)
        if (ch === "\n" || ch === " " || ch === "\t") continue
        out += appendResponsiveSepHtml(
            brState.pcGaps[brState.visIdx] || 0,
            brState.moGaps[brState.visIdx] || 0,
            brState.pcSpGaps[brState.visIdx] || 0,
            brState.moSpGaps[brState.visIdx] || 0
        )
        out += escapeHtml(ch)
        brState.visIdx++
    }
    return out
}
/** brState 종료 후 마지막 가시 문자 뒤 trailing 출력 */
function getResponsiveBrTrailing(brState) {
    if (!brState) return ""
    return appendResponsiveSepHtml(
        brState.pcGaps[brState.visIdx] || 0,
        brState.moGaps[brState.visIdx] || 0,
        brState.pcSpGaps[brState.visIdx] || 0,
        brState.moSpGaps[brState.visIdx] || 0
    )
}
/** PC/MO 반응형 줄바꿈: LS/PS·CR 정규화 (본문 flat 비교용) */
function normalizeTextNewlinesForResponsive(s) {
    if (s == null) return ""
    return String(s).replace(/\u2028/g, "\n").replace(/\u2029/g, "\n").replace(/\r\n/g, "\n").replace(/\r/g, "\n")
}
/** 공백·개행 모두 제거한 문자열 비교(PC/MO 동일 문장 여부) — 공백↔개행 교환 허용 */
function textFlatForResponsiveCompare(s) {
    return normalizeTextNewlinesForResponsive(s).replace(/[\s\n]+/g, "")
}
/** 각 가시 문자 사이의 연속 \\n 개수(gaps)·공백 개수(spGaps)와 flat 문자열 — 반응형 BR 슬롯 계산용 */
function newlineGapsForResponsive(norm) {
    var gaps = []
    var spGaps = []
    var flatParts = []
    var nlRun = 0
    var spRun = 0
    for (var i = 0; i < norm.length; i++) {
        var ch = norm.charAt(i)
        if (ch === "\n") nlRun++
        else if (ch === " " || ch === "\t") spRun++
        else {
            gaps.push(nlRun)
            spGaps.push(spRun)
            nlRun = 0
            spRun = 0
            flatParts.push(ch)
        }
    }
    gaps.push(nlRun)
    spGaps.push(spRun)
    return { flat: flatParts.join(""), gaps: gaps, spGaps: spGaps }
}
/** 구분자 위치의 반응형 HTML: 공백↔개행 교환 시 공백 유지 + pc-only/mo-only BR */
function appendResponsiveSepHtml(pcNl, moNl, pcSp, moSp) {
    var hasBr = pcNl > 0 || moNl > 0
    var hasSpace = pcSp > 0 || moSp > 0
    var out = ""
    if (hasSpace) out += " "
    if (hasBr) out += appendResponsiveBrSlotHtml(pcNl, moNl)
    return out
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
        var pairs = pcMoChildPairsOrIndex(dKids, mKids)
        for (var i = 0; i < pairs.length; i++) {
            var d = pairs[i][0]
            var m = pairs[i][1]
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
                var pcFlat = textFlatForResponsiveCompare(pcStr)
                var moFlat = textFlatForResponsiveCompare(moStr)
                if (pcFlat.toLowerCase() === moFlat.toLowerCase()) {
                    map[String(d.id)] = moStr
                }
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
/** mixed 텍스트: parts 있으면 ap-text__part span (--ap-part-fs/fw/clr/ls; 부모 p는 --ap-*). 모든 part가 동일하면 부모 style만 */
function buildTextPartInnerHtml(ts, brState) {
    if (!ts) return ""
    var parts = ts.parts
    var text = ts.text || ""
    if (!parts || parts.length === 0) {
        if (brState) return textToHtmlWithResponsiveBr(text, brState) + getResponsiveBrTrailing(brState)
        return textToHtmlWithBreaks(text)
    }
    var baseClr = (ts.clr || "").toLowerCase()
    var baseFs = ts.fs !== "" ? Number(ts.fs) || 0 : 0
    var baseFw = ts.fw !== "" ? Number(ts.fw) || 400 : 400
    var baseLsEm = ts.ls !== "" ? Number(ts.ls) || 0 : 0
    var partLs = [], partFw = [], partClr = [], partFs = [], partTc = []
    for (var i = 0; i < parts.length; i++) {
        var p = parts[i]
        if (Math.abs((p.ls || 0) - baseLsEm) >= 0.001) partLs.push("--ap-part-ls:" + (Number(p.ls) || 0).toFixed(3) + "em")
        else partLs.push(null)
        if (p.fw != null && p.fw !== baseFw) partFw.push("--ap-part-fw:" + Number(p.fw))
        else partFw.push(null)
        if (p.clr && (p.clr !== baseClr)) partClr.push("--ap-part-clr:" + p.clr)
        else partClr.push(null)
        if (p.fs != null && p.fs > 0 && (!baseFs || Math.abs(p.fs - baseFs) >= 1)) partFs.push("--ap-part-fs:" + Math.round(p.fs))
        else partFs.push(null)
        partTc.push(
            normalizeFigTextCaseKey(p.textCase != null && p.textCase !== "" ? p.textCase : ts.textCase),
        )
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
    var commonTcKey = allSame(partTc)
    var parentVars = [commonLs, commonFw, commonClr, commonFs].filter(Boolean)
    var parentStyle = parentVars.length ? parentVars.join(";") : ""
    var commonTcFrag =
        commonTcKey && commonTcKey !== "ORIGINAL" ? figTextCaseToDeclFragment(commonTcKey) : ""
    if (commonTcFrag) parentStyle = parentStyle ? parentStyle + ";" + commonTcFrag : commonTcFrag
    var out = ""
    var pos = 0
    for (var i = 0; i < parts.length; i++) {
        var p = parts[i]
        var from = Math.max(0, Math.min(text.length, Number(p.start) || 0))
        var to = Math.max(0, Math.min(text.length, Number(p.end) || 0))
        if (to <= from) continue
        if (from < pos) from = pos
        if (to <= from) continue
        if (from > pos) out += (brState ? textToHtmlWithResponsiveBr(text.substring(pos, from), brState) : textToHtmlWithBreaks(text.substring(pos, from)))
        var chunk = (brState ? null : p.characters) || text.substring(from, to)
        var escaped = brState ? textToHtmlWithResponsiveBr(chunk, brState) : textToHtmlWithBreaks(chunk)
        var vars = []
        if (partClr[i] != null && partClr[i] !== commonClr) vars.push(partClr[i])
        if (partFs[i] != null && partFs[i] !== commonFs) vars.push(partFs[i])
        if (partFw[i] != null && partFw[i] !== commonFw) vars.push(partFw[i])
        if (partLs[i] != null && partLs[i] !== commonLs) vars.push(partLs[i])
        if (commonTcKey == null) {
            var partTcFrag = figTextCaseToDeclFragment(partTc[i])
            if (partTcFrag) vars.push(partTcFrag)
        }
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
    if (pos < text.length) out += (brState ? textToHtmlWithResponsiveBr(text.substring(pos), brState) : textToHtmlWithBreaks(text.substring(pos)))
    if (brState) out += getResponsiveBrTrailing(brState)
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

