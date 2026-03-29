/**
 * 099-ui-router — ui.html ↔ 메인 스레드 메시지 라우팅
 *
 * figma.ui.onmessage — RUN_ANALYZE/RUN_DESKTOP/RUN_MOBILE/EXPORT_ZIP, API 키 저장·로드 등.
 *   분석·ZIP 시 dumpTreeAsync, PC+MO 시 combinePcMoAsBreakpoint, 결과는 RESULT·RESULT_IMAGES_*·ZIP_* 로 UI 전달.
 *
 * 비대해지면 타입별 핸들러만 별 파일로 쪼개고, 여기서는 위임만 두는 편이 유지보수에 유리함.
 */
// ----- 1. UI Router (ui.html → code.js) -----
figma.ui.onmessage = function (msg) {
    if (!msg) return

    /** ROOT 1개=PC만, 2개=PC+MO(가로 큰 쪽 PC) @media 오버라이드 */
    if (msg.type === "RUN_ANALYZE") {
        var selPick = figma.currentPage.selection
        if (!selPick || !selPick.length) {
            figma.ui.postMessage({ type: "ERROR", message: "ROOT 1개(PC만) 또는 2개(PC+MO) 선택 후 분석" })
            return
        }
        if (selPick.length > 2) {
            figma.ui.postMessage({
                type: "ERROR",
                message: "ROOT는 1개 또는 2개만 선택합니다. 2개일 때 가로가 큰 프레임=PC, 작은 프레임=MO",
            })
            return
        }
        msg = Object.assign({}, msg, { type: selPick.length === 1 ? "RUN_DESKTOP" : "RUN_MOBILE" })
    }

    if (msg.type === "RUN_DESKTOP") {
        _currentExportWidth = IMAGE_EXPORT_MAX_WIDTH
        var sel = figma.currentPage.selection
        if (!sel || !sel.length) {
            figma.ui.postMessage({type: "ERROR", message: "선택된 레이어 없음 (ROOT 1개 선택 후 PC 분석)"})
            return
        }
        var root = sel[0]
        var projectName = msg.projectName || "project"
        var allowedFonts = msg.allowedFonts || []
        var fontHtmlFilterActive = msg.fontHtmlFilterActive === true
        figma.ui.postMessage({type: "LOADING", value: true})

        dumpTreeAsync(root, projectName, allowedFonts, {
            phase: "desktop",
            geoStructure: msg.geoStructure || null,
            fontHtmlFilterActive: fontHtmlFilterActive,
        })
            .then(function (payload) {
                figma.ui.postMessage({type: "LOADING", value: false})
                var images = payload.images || []
                var ingestId = "i" + Date.now() + "-" + String(Math.random()).slice(2, 10)
                figma.ui.postMessage({
                    type: "RESULT",
                    ingestId: ingestId,
                    text: payload.text,
                    dataTree: payload.dataTree,
                    code: payload.code,
                    images: [],
                    imageCount: images.length,
                    vectorTypes: payload.vectorTypes,
                    usedFonts: payload.usedFonts || [],
                    mobileDataTree: undefined,
                })
                sendImagesToUI(images, ingestId)
            })
            .catch(function (e) {
                figma.ui.postMessage({type: "LOADING", value: false})
                figma.ui.postMessage({type: "ERROR", message: String(e)})
            })
        return
    }

    if (msg.type === "RUN_MOBILE") {
        _currentExportWidth = IMAGE_EXPORT_MAX_WIDTH
        var selMo = figma.currentPage.selection
        if (!selMo || selMo.length < 2) {
            figma.ui.postMessage({type: "ERROR", message: "MO 분석: ROOT 2개 선택 (가로 큰 쪽=PC, 작은 쪽=MO)"})
            return
        }
        var resolved = resolveDesktopMobile(selMo)
        var rootDesktop = resolved.desktopRoot
        var rootMobile = resolved.mobileRoot
        var breakpoint = resolved.breakpoint
        var projectNameMo = msg.projectName || "project"
        var allowedFontsMo = msg.allowedFonts || []
        var fontHtmlFilterActiveMo = msg.fontHtmlFilterActive === true
        figma.ui.postMessage({type: "LOADING", value: true})

        dumpTreeAsync(rootDesktop, projectNameMo, allowedFontsMo, {
            phase: "desktop",
            geoStructure: msg.geoStructure || null,
            fontHtmlFilterActive: fontHtmlFilterActiveMo,
            mobileRoot: rootMobile,
        })
            .then(function (payload) {
                return loadFontsForMobileTreeAsync(rootMobile).then(function () {
                    var pcRasterExtByStem = buildPcRasterExtByStemFromImageList(payload.images || [])
                    return dumpTreeAsync(rootMobile, projectNameMo, allowedFontsMo, {
                        phase: "mobile",
                        imageSuffix: "_mo",
                        fontHtmlFilterActive: fontHtmlFilterActiveMo,
                        pcRasterExtByStem: pcRasterExtByStem,
                        inheritAssetStores: payload.assetStoresSnapshot,
                        inheritedSlideAssetKeyBySlot: payload.slideAssetKeyBySlot || {},
                    }).then(function (moPayload) {
                        var secMatch = getSectionStructureMatch(rootDesktop, rootMobile)
                        // 미리보기는 항상 단일 iframe + PC/MO 토글(@media·pc-only/mo-only 보정). 이중 탭은 사용하지 않음.
                        var separateViews = false
                        // 구조 불일치 섹션: HTML은 div.pc-only / div.mo-only … hybridMismatchSecs 로 트리 배지·상태만 전달.
                        var code = combinePcMoAsBreakpoint(payload.code || "", rootDesktop, rootMobile, breakpoint, {
                            exportedNodeIds: payload.exportedNodeIds,
                            ownImageNodeIds: payload.ownImageNodeIds,
                            geoStructure: msg.geoStructure || null,
                            allowedFonts: allowedFontsMo,
                            fontHtmlFilterActive: fontHtmlFilterActiveMo,
                            pcSectionImageRenderOrderIds: payload.sectionImageRenderOrderIds,
                            moSectionImageRenderOrderIds: moPayload.sectionImageRenderOrderIds,
                            moImages: moPayload.images || [],
                        })
                        var images = mergeImagesWithMoBackgroundFallback(code, payload.images || [], moPayload.images || [])
                        return {payload: payload, code: code, images: images, mobileDataTree: moPayload.dataTree, separateViews: separateViews, hybridMismatchSecs: (secMatch && secMatch.mismatchSecs) ? secMatch.mismatchSecs : []}
                    })
                })
            })
            .then(function (out) {
                figma.ui.postMessage({type: "LOADING", value: false})
                var images = out.images || []
                var ingestId = "i" + Date.now() + "-" + String(Math.random()).slice(2, 10)
                figma.ui.postMessage({
                    type: "RESULT",
                    ingestId: ingestId,
                    text: out.payload.text,
                    dataTree: out.payload.dataTree,
                    code: out.code,
                    images: [],
                    imageCount: images.length,
                    vectorTypes: out.payload.vectorTypes,
                    usedFonts: out.payload.usedFonts || [],
                    mobileDataTree: out.mobileDataTree,
                    separateViews: out.separateViews,
                    hybridMismatchSecs: out.hybridMismatchSecs,
                    moBreakpoint: breakpoint,
                })
                try {
                    sendImagesToUI(images, ingestId)
                } catch (chunkErr) {
                    figma.ui.postMessage({type: "ERROR", message: "이미지 전송 중 오류: " + String(chunkErr && chunkErr.message ? chunkErr.message : chunkErr)})
                }
            })
            .catch(function (e) {
                figma.ui.postMessage({type: "LOADING", value: false})
                figma.ui.postMessage({type: "ERROR", message: String(e && e.message ? e.message : e)})
            })
        return
    }

    if (msg.type === "EXPORT_ZIP") {
        var sel2 = figma.currentPage.selection
        var resolved = resolveDesktopMobile(sel2)
        var hasMobile = !!resolved
        var rootDesktop = resolved ? resolved.desktopRoot : sel2 && sel2[0]
        var rootMobile = resolved ? resolved.mobileRoot : null
        var breakpoint = resolved ? resolved.breakpoint : 768

        if (!sel2 || !sel2.length) {
            figma.ui.postMessage({type: "ERROR", message: "선택된 레이어 없음 (ROOT 1개: 데스크톱만, 2개: 가로 작은 쪽=MO)"})
            return
        }
        var projectName2 = msg.projectName || "project"
        var allowedFonts2 = msg.allowedFonts || []
        var fontHtmlFilterActiveZip = msg.fontHtmlFilterActive === true
        /** UI 코드 탭에 표시된 문자열(분석 직후·AI 정리 후 등). 있으면 ZIP _cms.html에 이걸 쓰고, 이미지만 피그마에서 다시 export */
        var codeFromTab = msg.code != null && String(msg.code).trim() ? String(msg.code) : ""

        _currentExportWidth = IMAGE_EXPORT_ZIP_WIDTH
        figma.ui.postMessage({type: "LOADING", value: true})

        // export 결과(파일/프리뷰/클립보드) 마무리 처리
        function finishExport(code, images) {
            _currentExportWidth = IMAGE_EXPORT_MAX_WIDTH
            figma.ui.postMessage({type: "ZIP_IMAGES", code: code, imageCount: images.length})
            images.forEach(function (item, i) {
                figma.ui.postMessage({type: "ZIP_IMAGES_CHUNK", index: i, name: item.name, dataUrl: item.dataUrl})
            })
            figma.ui.postMessage({type: "ZIP_IMAGES_END"})
            figma.ui.postMessage({type: "LOADING", value: false})
        }

        // 1) PC dump (MO 루트 있으면 PC 코드 생성 시점에 MO characters와 줄바꿈 비교)
        var zipDeskOpts = {phase: "desktop", fontHtmlFilterActive: fontHtmlFilterActiveZip}
        if (hasMobile && rootMobile) {
            zipDeskOpts.mobileRoot = rootMobile
            zipDeskOpts.moBreakpoint = breakpoint
        }
        dumpTreeAsync(rootDesktop, projectName2, allowedFonts2, zipDeskOpts)
            .then(function (payload) {
                var code = payload.code || ""
                var images = payload.images || []

                // 2) MO 있으면 MO dump + 합치기
                if (hasMobile && rootMobile) {
                    return loadFontsForMobileTreeAsync(rootMobile).then(function () {
                        var pcRasterExtByStemZip = buildPcRasterExtByStemFromImageList(payload.images || [])
                        return dumpTreeAsync(rootMobile, projectName2, allowedFonts2, {
                            phase: "mobile",
                            imageSuffix: "_mo",
                            exportWidth: Math.min(2400, Math.round(2 * breakpoint)),
                            fontHtmlFilterActive: fontHtmlFilterActiveZip,
                            pcRasterExtByStem: pcRasterExtByStemZip,
                            inheritAssetStores: payload.assetStoresSnapshot,
                            inheritedSlideAssetKeyBySlot: payload.slideAssetKeyBySlot || {},
                        }).then(function (moPayload) {
                            var secMatch = getSectionStructureMatch(rootDesktop, rootMobile)
                            // 구조 불일치 섹션: HTML·CSS는 096 래퍼+`.pc-only .ap-section--NN` — ZIP 경로도 동일 파이프라인
                            code = combinePcMoAsBreakpoint(code, rootDesktop, rootMobile, breakpoint, {
                                exportedNodeIds: payload.exportedNodeIds,
                                ownImageNodeIds: payload.ownImageNodeIds,
                                allowedFonts: allowedFonts2,
                                fontHtmlFilterActive: fontHtmlFilterActiveZip,
                                pcSectionImageRenderOrderIds: payload.sectionImageRenderOrderIds,
                                moSectionImageRenderOrderIds: moPayload.sectionImageRenderOrderIds,
                                moImages: moPayload.images || [],
                            })

                            images = mergeImagesWithMoBackgroundFallback(code, payload.images || [], moPayload.images || [])
                            return {code: code, images: images}
                        })
                    })
                }

                // 데스크톱만
                return {code: code, images: images}
            })
            .then(function (out) {
                var zipHtml
                if (hasMobile && rootMobile) {
                    zipHtml = stripApAiAuditBlock((out && out.code) || codeFromTab || "")
                } else {
                    zipHtml = stripApAiAuditBlock(codeFromTab || (out && out.code) || "")
                }
                finishExport(zipHtml, out.images || [])
            })
            .catch(function (e) {
                _currentExportWidth = IMAGE_EXPORT_MAX_WIDTH
                figma.ui.postMessage({type: "LOADING", value: false})
                figma.ui.postMessage({type: "ERROR", message: String(e)})
            })
        return
    }

    if (msg.type === "LOAD_OPENAI_KEY") {
        figma.clientStorage
            .getAsync("openai_key")
            .then(function (v) {
                figma.ui.postMessage({type: "OPENAI_KEY_LOADED", key: v != null ? String(v) : ""})
            })
            .catch(function () {
                figma.ui.postMessage({type: "OPENAI_KEY_LOADED", key: ""})
            })
        return
    }

    if (msg.type === "SAVE_OPENAI_KEY") {
        var keyToSave = msg.key != null ? String(msg.key) : ""
        figma.clientStorage
            .setAsync("openai_key", keyToSave)
            .then(function () {
                figma.ui.postMessage({type: "OPENAI_KEY_SAVED"})
            })
            .catch(function (e) {
                figma.ui.postMessage({type: "OPENAI_KEY_ERROR", message: String(e)})
            })
        return
    }

    if (msg.type === "LOAD_GEMINI_KEY") {
        figma.clientStorage
            .getAsync("gemini_key")
            .then(function (v) {
                figma.ui.postMessage({type: "GEMINI_KEY_LOADED", key: v != null ? String(v) : ""})
            })
            .catch(function () {
                figma.ui.postMessage({type: "GEMINI_KEY_LOADED", key: ""})
            })
        return
    }

    if (msg.type === "SAVE_GEMINI_KEY") {
        var geminiKeyToSave = msg.key != null ? String(msg.key) : ""
        figma.clientStorage
            .setAsync("gemini_key", geminiKeyToSave)
            .then(function () {
                figma.ui.postMessage({type: "GEMINI_KEY_SAVED"})
            })
            .catch(function (e) {
                figma.ui.postMessage({type: "GEMINI_KEY_ERROR", message: String(e)})
            })
        return
    }
}
