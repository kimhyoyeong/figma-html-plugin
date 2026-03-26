/**
 * 082-deferred-css — 지연 CSS 누적·병합·BEM 정리·MO 셀렉터 필터·이미지 크기 var
 *
 * 의존: 010 pad2, 070 getImageSizeDecl/cssInnerSel은 081·070 — pushDeferredImageImgSizeVars는 081 cssInner 이후
 */
// ----- Deferred CSS (빌드 컨텍스트에 sel+decl 누적, 최종 압축 전 병합) -----
/** deferred 스타일 배열에 셀렉터별 선언 누적 (같은 sel이면 decl 병합) */
function pushDeferredStyle(ctx, sel, decl) {
    if (!ctx || !ctx.deferredStyles || !sel || !decl) return
    for (var i = 0; i < ctx.deferredStyles.length; i++) {
        if (ctx.deferredStyles[i].sel === sel) {
            var prev = ctx.deferredStyles[i].decl || ""
            var merged = prev ? prev + ";" + decl : decl
            ctx.deferredStyles[i].decl = dedupeCssDecl(merged)
            return
        }
    }
    ctx.deferredStyles.push({ sel: sel, decl: decl })
}

/** CSS 선언 문자열에서 동일 속성 중복 제거 (마지막 값 유지) */
function dedupeCssDecl(decl) {
    if (!decl || !String(decl).trim()) return decl
    var parts = String(decl).split(";")
    var map = {}
    for (var i = 0; i < parts.length; i++) {
        var p = parts[i].trim()
        if (!p) continue
        var colon = p.indexOf(":")
        if (colon === -1) continue
        var key = p.substring(0, colon).trim()
        var value = p.substring(colon + 1).trim()
        map[key] = value
    }
    return Object.keys(map).map(function (k) { return k + ":" + map[k] }).join(";")
}

/** 그룹 키용: 속성 이름 순 정렬로 선언이 같으면 동일 키 (선언 순서 무관) */
function normalizeDeclForMergeKey(decl) {
    var d = dedupeCssDecl(decl)
    if (!d || !String(d).trim()) return ""
    var parts = String(d).split(";")
    var pairs = []
    for (var i = 0; i < parts.length; i++) {
        var p = parts[i].trim()
        if (!p) continue
        var colon = p.indexOf(":")
        if (colon === -1) continue
        pairs.push({
            k: p.substring(0, colon).trim(),
            v: p.substring(colon + 1).trim(),
        })
    }
    pairs.sort(function (a, b) {
        return String(a.k).localeCompare(String(b.k))
    })
    return pairs.map(function (x) { return x.k + ":" + x.v }).join(";")
}

/** deferred 규칙 선택자 선두의 `ap-section--` 번호 (없으면 빈 문자열) */
function leadingApSectionIdFromSelector(sel) {
    var m = /^\.ap-section--(\d+)/.exec(String(sel || "").trim())
    return m ? m[1] : ""
}

/**
 * 동일 선언(decl)을 쓰는 규칙을 쉼표 선택자 한 줄로 합침 (HTML·클래스명 유지).
 * 병합은 같은 섹션(`.ap-section--NN` 동일) 안에서만 수행 — 섹션 간 우연한 동일 선언은 묶지 않음.
 */
function consolidateDeferredStylesByIdenticalDecl(styles) {
    if (!styles || styles.length < 2) {
        if (!styles || !styles.length) return styles
        return styles.map(function (s) {
            return {
                sel: s.sel,
                decl: dedupeCssDecl(s.decl ? String(s.decl) : ""),
            }
        })
    }
    var n = styles.length
    var meta = []
    var groups = Object.create(null)

    for (var i = 0; i < n; i++) {
        var s = styles[i]
        var sel = s && s.sel ? String(s.sel).trim() : ""
        var declNorm = dedupeCssDecl(s && s.decl ? String(s.decl) : "")
        var mergeKey = normalizeDeclForMergeKey(declNorm)
        var secId = leadingApSectionIdFromSelector(sel)
        meta[i] = { sel: sel, decl: declNorm, secId: secId }
        if (!declNorm || !mergeKey || !secId) continue
        var gkey = secId + "\x00" + mergeKey
        if (!groups[gkey]) groups[gkey] = []
        groups[gkey].push(i)
    }

    var mergedMember = Object.create(null)
    var out = []

    for (var gk in groups) {
        if (!Object.prototype.hasOwnProperty.call(groups, gk)) continue
        var idxs = groups[gk]
        if (idxs.length < 2) continue
        idxs.sort(function (a, b) { return a - b })
        var seenSel = Object.create(null)
        var selParts = []
        for (var ii = 0; ii < idxs.length; ii++) {
            var ij = idxs[ii]
            var oneSel = meta[ij].sel
            if (!oneSel || seenSel[oneSel]) continue
            seenSel[oneSel] = true
            selParts.push(oneSel)
        }
        if (selParts.length < 2) continue
        for (var mk = 0; mk < idxs.length; mk++) mergedMember[idxs[mk]] = true
        out.push({
            sel: selParts.join(", "),
            decl: meta[idxs[0]].decl,
            _order: idxs[0],
        })
    }

    for (var j = 0; j < n; j++) {
        if (mergedMember[j]) continue
        var m = meta[j]
        out.push({
            sel: m.sel,
            decl: m.decl || dedupeCssDecl(styles[j] && styles[j].decl ? String(styles[j].decl) : ""),
            _order: j,
        })
    }

    out.sort(function (a, b) {
        if (a._order !== b._order) return a._order - b._order
        return String(a.sel).localeCompare(String(b.sel))
    })
    for (var r = 0; r < out.length; r++) delete out[r]._order
    return out
}

function splitTopLevelCommaSelectors(sel) {
    return String(sel || "")
        .split(",")
        .map(function (s) {
            return s.trim()
        })
        .filter(Boolean)
}

/** `.ap-section--NN .ap-section__foo--01` 단일 리프만 허용 (복합/자식 선택자면 null) */
function parseSimpleSectionScopedPart(part) {
    var m = /^\s*\.ap-section--(\d+)\s+(\.[a-zA-Z0-9_-]+)\s*$/.exec(String(part || "").trim())
    if (!m) return null
    return { sec: m[1], cls: m[2].slice(1) }
}

/** 묶인 BEM 리프 대표: 접미사 없는 베이스 클래스 우선, 없으면 --숫자 최소 */
function representativeBemClassForMerge(leaves) {
    var scored = leaves.map(function (leaf) {
        var mm = /--(\d+)$/.exec(leaf)
        if (!mm) return { leaf: leaf, suffixed: 0, n: 0 }
        return { leaf: leaf, suffixed: 1, n: parseInt(mm[1], 10) }
    })
    scored.sort(function (a, b) {
        if (a.suffixed !== b.suffixed) return a.suffixed - b.suffixed
        if (a.n !== b.n) return a.n - b.n
        return String(a.leaf).localeCompare(String(b.leaf))
    })
    return scored[0].leaf
}

/**
 * 쉼표 병합된 규칙 → 대표 클래스 하나만 쓰는 선택자 + HTML 클래스 치환 목록.
 * 형식이 `.ap-section--N .단일클래스` 가 아니면 원문 셀렉터 유지.
 * @returns {{ rules: { sel: string, decl: string }[], renames: { secId: string, from: string, to: string }[] }}
 */
function canonicalizeMergedRulesToSingleRepresentativeClass(rules) {
    var renames = []
    var out = []
    if (!rules || !rules.length) return { rules: rules || [], renames: [] }
    for (var i = 0; i < rules.length; i++) {
        var rule = rules[i]
        var sel = rule.sel ? String(rule.sel) : ""
        var decl = rule.decl
        if (sel.indexOf(",") < 0) {
            out.push({ sel: sel, decl: decl })
            continue
        }
        var parts = splitTopLevelCommaSelectors(sel)
        var parsed = []
        var ok = true
        for (var p = 0; p < parts.length; p++) {
            var one = parseSimpleSectionScopedPart(parts[p])
            if (!one) {
                ok = false
                break
            }
            parsed.push(one)
        }
        if (!ok || !parsed.length) {
            out.push({ sel: sel, decl: decl })
            continue
        }
        var sec0 = parsed[0].sec
        for (var q = 1; q < parsed.length; q++) {
            if (parsed[q].sec !== sec0) {
                ok = false
                break
            }
        }
        if (!ok) {
            out.push({ sel: sel, decl: decl })
            continue
        }
        var sheetLeaves = []
        for (var r = 0; r < parsed.length; r++) sheetLeaves.push(parsed[r].cls)
        var canon = representativeBemClassForMerge(sheetLeaves)
        var newSel = ".ap-section--" + sec0 + " ." + canon
        for (var t = 0; t < sheetLeaves.length; t++) {
            if (sheetLeaves[t] !== canon) renames.push({ secId: sec0, from: sheetLeaves[t], to: canon })
        }
        out.push({ sel: newSel, decl: decl })
    }
    return { rules: out, renames: renames }
}

/**
 * 섹션 스택 기준으로 `class="` 안 토큰만 치환 (리프 BEM → 대표 클래스).
 */
function applySectionScopedClassRenames(lines, renames) {
    if (!lines || !lines.length || !renames || !renames.length) return
    var map = Object.create(null)
    for (var ri = 0; ri < renames.length; ri++) {
        var rr = renames[ri]
        if (!rr || rr.from == null || rr.to == null) continue
        if (String(rr.from) === String(rr.to)) continue
        map[String(rr.secId) + "\x00" + String(rr.from)] = String(rr.to)
    }
    var stack = []
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i]
        if (/<section\b/i.test(line)) {
            var sid = null
            var cm = /class="([^"]*)"/.exec(line)
            if (cm) {
                var sm = cm[1].match(/(?:^|\s)ap-section--(\d+)(?:\s|$)/)
                if (sm) sid = sm[1]
            }
            stack.push(sid)
        }
        var closeSecs = line.match(/<\/section>/gi)
        if (closeSecs) {
            for (var ci = 0; ci < closeSecs.length; ci++) {
                if (stack.length) stack.pop()
            }
        }
        var curSec = stack.length ? stack[stack.length - 1] : null
        if (curSec == null || line.indexOf('class="') < 0) continue
        lines[i] = line.replace(/class="([^"]*)"/g, function (full, inner) {
            if (!inner) return full
            var toks = inner.split(/\s+/).filter(Boolean)
            var seen = Object.create(null)
            var outParts = []
            var changed = false
            for (var j = 0; j < toks.length; j++) {
                var tok = toks[j]
                var rep = map[String(curSec) + "\x00" + tok]
                if (rep && rep !== tok) {
                    tok = rep
                    changed = true
                }
                if (!seen[tok]) {
                    seen[tok] = true
                    outParts.push(tok)
                } else {
                    changed = true
                }
            }
            if (!changed && outParts.length === toks.length) return full
            return 'class="' + outParts.join(" ") + '"'
        })
    }
}

/**
 * 최종 deferred 규칙 셀렉터에서 섹션별로 참조된 ap-section__ 클래스 집합 (루트만 .ap-section--NN 인 규칙은 제외).
 */
function buildUsedApSectionClassBySectionFromRules(rules) {
    var map = Object.create(null)
    if (!rules || !rules.length) return map
    for (var i = 0; i < rules.length; i++) {
        var sel = rules[i] && rules[i].sel ? String(rules[i].sel) : ""
        if (!sel) continue
        var parts = splitTopLevelCommaSelectors(sel)
        for (var p = 0; p < parts.length; p++) {
            var m = /^\.ap-section--(\d+)\s+(.+)$/.exec(parts[p].trim())
            if (!m) continue
            var sec = m[1]
            var rest = m[2]
            var re = /\.(ap-section__[a-zA-Z0-9_-]+)/g
            var mm
            while ((mm = re.exec(rest)) !== null) {
                if (!map[sec]) map[sec] = Object.create(null)
                map[sec][mm[1]] = true
            }
        }
    }
    return map
}

/**
 * 해당 섹션에 스코프 CSS가 있는 경우, 사용되지 않는 ap-section__* 만 class 목록에서 제거.
 */
function stripUnusedApSectionBemFromContentLines(contentLines, usedBySection) {
    if (!contentLines || !contentLines.length || !usedBySection) return
    var stack = []
    for (var i = 0; i < contentLines.length; i++) {
        var line = contentLines[i]
        if (/<section\b/i.test(line)) {
            var sid = null
            var cm = /class="([^"]*)"/.exec(line)
            if (cm) {
                var sm = cm[1].match(/(?:^|\s)ap-section--(\d+)(?:\s|$)/)
                if (sm) sid = sm[1]
            }
            stack.push(sid)
        }
        var closeSecs = line.match(/<\/section>/gi)
        if (closeSecs) {
            for (var ci = 0; ci < closeSecs.length; ci++) {
                if (stack.length) stack.pop()
            }
        }
        var curSec = stack.length ? stack[stack.length - 1] : null
        if (curSec == null || line.indexOf('class="') < 0) continue
        var used = usedBySection[curSec]
        if (!used) continue
        var hasAny = false
        for (var uk in used) {
            if (Object.prototype.hasOwnProperty.call(used, uk)) {
                hasAny = true
                break
            }
        }
        if (!hasAny) continue

        contentLines[i] = line.replace(/class="([^"]*)"/g, function (full, inner) {
            if (!inner) return full
            var toks = inner.split(/\s+/).filter(Boolean)
            var outParts = []
            var changed = false
            for (var j = 0; j < toks.length; j++) {
                var tok = toks[j]
                if (tok.indexOf("ap-section__") === 0 && !used[tok]) {
                    changed = true
                    continue
                }
                outParts.push(tok)
            }
            if (!changed) return full
            return 'class="' + outParts.join(" ") + '"'
        })
    }
}

/**
 * PC보내기 최종 article HTML에 등장한 ap-section__* 토큰만 섹션별 집계.
 * deferred 규칙에 안 잡혀 stripUnused로 클래스가 빠진 뒤에도 MO가 옛 BEM으로 오버라이드하는 것을 막기 위함.
 */
function buildUsedApSectionBemFromArticleHtml(articleHtml) {
    var map = Object.create(null)
    if (!articleHtml) return map
    var lines = String(articleHtml).split(/\r?\n/)
    var stack = []
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i]
        if (/<section\b/i.test(line)) {
            var sid = null
            var cm = /class="([^"]*)"/.exec(line)
            if (cm) {
                var sm = cm[1].match(/(?:^|\s)ap-section--(\d+)(?:\s|$)/)
                if (sm) sid = sm[1]
            }
            stack.push(sid)
        }
        var closeSecs = line.match(/<\/section>/gi)
        if (closeSecs) {
            for (var ci = 0; ci < closeSecs.length; ci++) if (stack.length) stack.pop()
        }
        var curSec = stack.length ? stack[stack.length - 1] : null
        if (curSec == null) continue
        var idx = 0
        while (true) {
            var q = line.indexOf('class="', idx)
            if (q < 0) break
            var eq = line.indexOf('"', q + 7)
            if (eq < 0) break
            var inner = line.slice(q + 7, eq)
            var toks = inner.split(/\s+/).filter(Boolean)
            for (var t = 0; t < toks.length; t++) {
                if (toks[t].indexOf("ap-section__") === 0) {
                    if (!map[curSec]) map[curSec] = Object.create(null)
                    map[curSec][toks[t]] = true
                }
            }
            idx = eq + 1
        }
    }
    return map
}

function moOverrideSelectorPartIsLive(part, usedBySection) {
    part = String(part || "").trim()
    if (!part) return true
    if (/^\.ap-section--\d+$/.test(part)) return true
    if (/^\.ap-section--\d+\./.test(part)) {
        if (!/ap-section__/.test(part)) return true
        var m0 = /^\.ap-section--(\d+)/.exec(part)
        if (!m0) return true
        var sec0 = m0[1]
        var used0 = usedBySection[sec0]
        var re0 = /\.(ap-section__[a-zA-Z0-9_-]+)/g
        var mm0
        while ((mm0 = re0.exec(part)) !== null) {
            // 본문에 ap-section__* 집계가 없으면(섹션 키 없음) 필터 완화 — MO 오버라이드 전부 막히지 않게
            if (used0 && !used0[mm0[1]]) return false
        }
        return true
    }
    var m = /^\.ap-section--(\d+)\s+(.+)$/.exec(part)
    if (!m) return true
    var sec = m[1]
    var rest = m[2]
    var used = usedBySection[sec]
    var re = /\.(ap-section__[a-zA-Z0-9_-]+)/g
    var mm
    while ((mm = re.exec(rest)) !== null) {
        if (used && !used[mm[1]]) return false
    }
    return true
}

/** MO @media 규칙: strip 후 본문에 남은 ap-section__* 집계가 있을 때만, 그 맵에 없는 토큰은 생략 */
function moOverrideSelectorIsLive(sel, usedBySection) {
    if (!usedBySection) return true
    sel = String(sel || "").trim()
    if (!sel) return true
    var parts = splitTopLevelCommaSelectors(sel)
    for (var p = 0; p < parts.length; p++) {
        if (!moOverrideSelectorPartIsLive(parts[p], usedBySection)) return false
    }
    return true
}

/** 래퍼(.ap-image .ap-section__image--XX)에 --ap-w/--ap-h만 넣음. 기존 .ap-image img 규칙이 var()로 활용 (ap-abs 래퍼는 생략) */
function pushDeferredImageImgSizeVars(ctx, secClass, nodeId, node, opts, wrapperIsApAbs) {
    if (!nodeId || wrapperIsApAbs) return
    var decl = getImageSizeDecl(node)
    if (!decl) return
    var innerSel = cssInnerSelForNode(String(nodeId), opts, false)
    var sel = ".ap-section--" + secClass + " " + innerSel.replace(/,/g, ", .ap-section--" + secClass + " ")
    pushDeferredStyle(ctx, sel, decl)
}
