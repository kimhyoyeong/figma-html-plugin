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
