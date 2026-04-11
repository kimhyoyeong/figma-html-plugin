/**
 * 080-text-fonts — 폰트 로드, TEXT 스타일 구간, ap-text CSS 변수, 허용 폰트 판별
 *
 * getTextSummaryAsync/Sync — TEXT 노드 → {fs,lh,ls,fw,ta,clr,textCase,textDecoration,parts} 스타일 객체
 * mergeAdjacentSameStyleParts — Figma 세그먼트 분할 병합 (동일 스타일 인접 parts 통합)
 * figTextDecorationToDecl — textDecoration → text-decoration CSS
 * buildTextVarsDecl/Diff — ap-text CSS 변수 선언·PC/MO 차이
 * textFamiliesAllowedAsHtml — UI 허용 폰트 목록 판별
 * getTextFontFamiliesSync — 폰트 패밀리 목록 (동기)
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
    var runTextCase = ""
    try {
        if (typeof tn.textCase !== "undefined" && tn.textCase != null && tn.textCase !== figma.mixed) {
            runTextCase = String(tn.textCase)
        }
    } catch (eTcRun) {}
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
                textCase: runTextCase,
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

/** Figma TextCase → 정규 키 (characters와 별도인 스타일; All caps 등은 여기만 반영됨) */
function normalizeFigTextCaseKey(tc) {
    if (tc == null || tc === "") return "ORIGINAL"
    try {
        if (tc === figma.mixed) return "ORIGINAL"
    } catch (eMix) {}
    var t = String(tc).toUpperCase().replace(/-/g, "_")
    if (t === "UPPER" || t === "LOWER" || t === "TITLE" || t === "SMALL_CAPS" || t === "SMALL_CAPS_FORCED" || t === "ORIGINAL") return t
    return "ORIGINAL"
}

/** TextCase → 지연 CSS에 넣을 선언(표준 속성). ORIGINAL은 빈 문자열 */
function figTextCaseToDeclFragment(tc) {
    var k = normalizeFigTextCaseKey(tc)
    if (k === "ORIGINAL") return ""
    if (k === "UPPER") return "text-transform:uppercase"
    if (k === "LOWER") return "text-transform:lowercase"
    if (k === "TITLE") return "text-transform:capitalize"
    if (k === "SMALL_CAPS" || k === "SMALL_CAPS_FORCED") return "font-variant:small-caps"
    return ""
}

/** 인접 동일 스타일 parts 병합 — Figma가 특수문자(™ 등) 경계에서 불필요하게 분할한 세그먼트 통합 */
function mergeAdjacentSameStyleParts(parts) {
    if (!parts || parts.length <= 1) return parts
    var out = [parts[0]]
    for (var i = 1; i < parts.length; i++) {
        var prev = out[out.length - 1]
        var cur = parts[i]
        if (prev.fw === cur.fw &&
            prev.fs === cur.fs &&
            prev.clr === cur.clr &&
            Math.abs((prev.ls || 0) - (cur.ls || 0)) < 0.001 &&
            (prev.textCase || "") === (cur.textCase || "")) {
            out[out.length - 1] = {
                start: prev.start,
                end: cur.end,
                characters: (prev.characters || "") + (cur.characters || ""),
                clr: prev.clr,
                fs: prev.fs,
                fw: prev.fw,
                ls: prev.ls,
                textCase: prev.textCase
            }
        } else {
            out.push(cur)
        }
    }
    return out.length === 1 ? null : out
}

/** Figma textDecoration → CSS text-decoration 선언. NONE/없으면 빈 문자열 */
function figTextDecorationToDecl(td) {
    if (!td || td === "NONE") return ""
    var v = String(td).toUpperCase()
    if (v === "UNDERLINE") return "text-decoration:underline"
    if (v === "STRIKETHROUGH") return "text-decoration:line-through"
    return ""
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
            textCase: "",
        }

        var nodeTextCaseStr = ""
        try {
            if (typeof tn.textCase !== "undefined") {
                var ntc = tn.textCase
                if (ntc != null && ntc !== figma.mixed) nodeTextCaseStr = String(ntc)
            }
        } catch (eTc) {}
        out.textCase = nodeTextCaseStr

        out.textDecoration = ""
        try {
            var td = tn.textDecoration
            if (td && td !== figma.mixed && td !== "NONE") out.textDecoration = String(td)
        } catch (eTd) {}

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
                    var segFields = ["fontName", "fontSize", "fontWeight", "fills", "letterSpacing", "textCase"]
                    var rawSegs
                    try {
                        rawSegs = tn.getStyledTextSegments(segFields)
                    } catch (eSegTc) {
                        rawSegs = tn.getStyledTextSegments(["fontName", "fontSize", "fontWeight", "fills", "letterSpacing"])
                    }
                    if (rawSegs && rawSegs.length > 0) {
                        var baseClr = (out.clr || "").toLowerCase()
                        var baseFs = out.fs !== "" ? Number(out.fs) || 0 : 0
                        var baseFw = out.fw !== "" ? Number(out.fw) || 400 : 400
                        var baseLsEm = out.ls !== "" ? Number(out.ls) || 0 : 0
                        var hasAnyDiff = false
                        var hasTextCaseDiff = false
                        var baseTcKey = ""
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
                            var segTcKey = normalizeFigTextCaseKey(
                                seg.textCase != null && seg.textCase !== figma.mixed ? seg.textCase : nodeTextCaseStr,
                            )
                            if (si === 0) baseTcKey = segTcKey
                            else if (segTcKey !== baseTcKey) hasTextCaseDiff = true
                            if (segClr && segClr !== baseClr) hasAnyDiff = true
                            if (segFs && baseFs && Math.abs(segFs - baseFs) >= 1) hasAnyDiff = true
                            if (segFw !== baseFw) hasAnyDiff = true
                            if (Math.abs(segLsEm - baseLsEm) >= 0.001) hasAnyDiff = true
                        }
                        if (hasAnyDiff || hasTextCaseDiff) {
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
                                    textCase:
                                        seg.textCase != null && seg.textCase !== figma.mixed
                                            ? String(seg.textCase)
                                            : nodeTextCaseStr,
                                }
                            })
                        }
                        if (out.parts) out.parts = mergeAdjacentSameStyleParts(out.parts)
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
                    runs = mergeAdjacentSameStyleParts(runs) || runs
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

/** line-height 를 font-size 대비 배율(1.2, 1.25…)로 스냅 — --ap-lh 는 단위 없음, line-height = fs*ratio */
function snapLineHeightRatio(ratio) {
    if (!(ratio > 0) || !isFinite(ratio)) return 1.2
    var c = Math.min(2.5, Math.max(0.8, ratio))
    return r2(Math.round(c * 20) / 20)
}

function effectiveLineHeightPx(fs, lhRaw) {
    var f = Number(fs) || 0
    var lh = Number(lhRaw) || 0
    if (lh <= 0) return f > 0 ? f : 0
    if (lh > 0 && lh <= 3 && f > 0) return lh * f
    return lh
}

function lineHeightRatioFromFsAndLhRaw(fs, lhRaw) {
    var f = Number(fs) || 0
    if (f <= 0) return 1
    var lhPx = effectiveLineHeightPx(f, lhRaw)
    if (lhPx <= 0) return 1
    return snapLineHeightRatio(lhPx / f)
}

/** .ap-text 기본값과 같으면 buildTextVarsDecl 에서 변수 생략 (096 .ap-text fallback 과 맞춤) */
var AP_TEXT_DEFAULT_LH_RATIO = 1.2
var AP_TEXT_DEFAULT_FW = 400
var AP_TEXT_DEFAULT_TA = "center"

function normalizeApTextColorHex(clr) {
    var s = String(clr || "")
        .trim()
        .toLowerCase()
    if (s === "#000" || s === "#000000") return "#000"
    return s
}

function isDefaultApTextColor(clr) {
    var n = normalizeApTextColorHex(clr)
    return n === "" || n === "#000"
}

function isDefaultApTextLhRatio(ratio) {
    return r2(Number(ratio) || 0) === AP_TEXT_DEFAULT_LH_RATIO
}

/** 텍스트 스타일 → CSS 변수 (--ap-fs 필수, 나머지는 기본과 다를 때만) */
function buildTextVarsDecl(ts) {
    if (!ts) return ""
    var fs = ts.fs !== "" ? Number(ts.fs) || 0 : 0
    var lhRaw = ts.lh !== "" ? Number(ts.lh) || 0 : 0
    var ls = ts.ls !== "" ? Number(ts.ls) || 0 : 0
    var fw = ts.fw !== "" ? Number(ts.fw) || 400 : 400
    var ta = normTextAlign(ts.ta)
    var clr = ts.clr || ""
    var lhRatio = lineHeightRatioFromFsAndLhRaw(fs, lhRaw)

    var parts = []
    parts.push("--ap-fs:" + cssOutNum(fs))
    if (!isDefaultApTextLhRatio(lhRatio)) parts.push("--ap-lh:" + cssOutNum(lhRatio))
    if (r2(ls) !== 0) parts.push("--ap-ls:" + cssOutNum(ls))
    if (fw !== AP_TEXT_DEFAULT_FW) parts.push("--ap-fw:" + fw)
    if (ta !== AP_TEXT_DEFAULT_TA) parts.push("--ap-ta:" + ta)
    if (!isDefaultApTextColor(clr)) parts.push("--ap-clr:" + clr)

    if (!ts.parts || !ts.parts.length) {
        var tcf = figTextCaseToDeclFragment(ts.textCase)
        if (tcf) parts.push(tcf)
    }
    var tdDecl = figTextDecorationToDecl(ts.textDecoration)
    if (tdDecl) parts.push(tdDecl)

    return parts.join(";")
}

/** PC(tsD)와 MO(tsM) 텍스트 변수 비교 후 달라진 것만 MO 값으로 선언 */
function buildTextVarsDeclDiff(tsD, tsM) {
    if (!tsM) return ""
    var parts = []
    function normTs(ts) {
        if (!ts) {
            return {
                fs: 0,
                lhRatio: AP_TEXT_DEFAULT_LH_RATIO,
                ls: 0,
                fw: AP_TEXT_DEFAULT_FW,
                ta: AP_TEXT_DEFAULT_TA,
                clr: "",
                tc: "ORIGINAL",
            }
        }
        var fs = ts.fs !== "" ? Number(ts.fs) || 0 : 0
        var lhRaw = ts.lh !== "" ? Number(ts.lh) || 0 : 0
        return {
            fs: fs,
            lhRatio: lineHeightRatioFromFsAndLhRaw(fs, lhRaw),
            ls: ts.ls !== "" ? Number(ts.ls) || 0 : 0,
            fw: ts.fw !== "" ? Number(ts.fw) || 400 : 400,
            ta: normTextAlign(ts.ta),
            clr: ts.clr || "",
            tc: normalizeFigTextCaseKey(ts && ts.textCase),
        }
    }
    var d = normTs(tsD)
    var m = normTs(tsM)
    if (d.fs !== m.fs) parts.push("--ap-fs:" + cssOutNum(m.fs))
    if (d.lhRatio !== m.lhRatio) parts.push("--ap-lh:" + cssOutNum(m.lhRatio))
    if (r2(d.ls) !== r2(m.ls)) parts.push("--ap-ls:" + cssOutNum(m.ls))
    if (d.fw !== m.fw) parts.push("--ap-fw:" + m.fw)
    if (d.ta !== m.ta) parts.push("--ap-ta:" + m.ta)
    if (normalizeApTextColorHex(d.clr) !== normalizeApTextColorHex(m.clr)) {
        if (isDefaultApTextColor(m.clr)) parts.push("--ap-clr:#000")
        else parts.push("--ap-clr:" + m.clr)
    }
    if (d.tc !== m.tc) {
        var moCaseFrag = figTextCaseToDeclFragment(tsM && tsM.textCase)
        if (moCaseFrag) parts.push(moCaseFrag)
        else if (m.tc === "ORIGINAL") parts.push("text-transform:none;font-variant:normal")
    }
    var dTd = figTextDecorationToDecl(tsD && tsD.textDecoration)
    var mTd = figTextDecorationToDecl(tsM && tsM.textDecoration)
    if (dTd !== mTd) parts.push(mTd || "text-decoration:none")
    return parts.join(";")
}

/** TextNode → ts 객체 (동기, 폰트 로드 가정). mixed fontSize는 getStyledTextSegments로 첫 구간 값 사용 */
function getTextSummarySync(tn) {
    if (!tn || tn.type !== "TEXT") return null
    try {
        var out = {fs: "", lh: "", ls: "", fw: "", ta: "", clr: "", textDecoration: ""}
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
        try {
            var tdSync = tn.textDecoration
            if (tdSync && tdSync !== figma.mixed && tdSync !== "NONE") out.textDecoration = String(tdSync)
        } catch (eTdS) {}
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
