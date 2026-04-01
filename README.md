# Figma HTML Export (figma-html-plugin)

---

## 1. 프로젝트 소개

Figma 플러그인(`figma.showUI`) 기반으로 선택한 프레임(ROOT)에서 레이아웃·텍스트·이미지 정보를 읽어 HTML/CSS를 생성하고, UI에서 미리보기·ZIP 보내기·(선택) AI 검수를 제공하는 도구입니다. 메인 스레드는 빌드된 `plugin/code.js`, UI는 `plugin/ui.html` 단일 파일 구조입니다.

---

## 2. 문제 정의

- Figma 디자인을 퍼블리싱할 때 수작업 비중이 큼.
- 레이어 구조가 표준화되지 않으면 자동 변환 규칙을 일관되게 적용하기 어려움.
- PC·MO(모바일) 프레임이 서로 다른 트리 구조를 가질 때, 단일 규칙만으로 스타일·에셋을 맞추기 어려움.
- 상세 페이지(PDP) 등에서 작업 기간이 길어지는 경우가 있음(도메인·팀 기준 수치는 본 저장소 코드와 무관).

---

## 3. 해결 방법

- Figma Plugin API로 선택 노드 트리를 순회·분석하고, 레이어 이름 규칙(`code-*`)과 레이아웃·이미지 export 파이프라인으로 **HTML/CSS 초안**을 생성합니다.
- PC·MO를 동시에 선택한 경우, 가로 폭이 큰 프레임을 PC로 해석하고, 트리·시맨틱·이름 등 **규칙 기반 휴리스틱**으로 MO용 `@media` 오버라이드 또는 `pc-only` / `mo-only` 분기 HTML을 조합합니다.
- 생성된 마크업에 대해 UI에서 **OpenAI 또는 Gemini**를 호출해 SEO·접근성·시맨틱·`alt`·헤딩을 검수하고, 선택적으로 이미지 비전(JPEG)을 붙여 `alt` 품질을 높입니다(아래 [5. AI 활용 방식](#5-ai-활용-방식)).

---

## 4. 주요 기능

### 4.1 구현된 기능

- **선택 노드 기반 분석**: ROOT 1개(PC만) 또는 2개(PC+MO). 2개일 때 가로가 큰 쪽을 PC, 작은 쪽을 MO로 처리(`resolveDesktopMobile`).
- **레이어 인스펙트 데이터**: `dumpTreeAsync`가 `dataTree` 객체(`rootSummary`, `sections`, `legend`)와 평탄화 텍스트를 만들어 UI로 전달(원시 Figma REST “씬 JSON 파일” 덤프와는 별개).
- **레이아웃·위치·자식 관계 분석**: Auto Layout·절대 배치·텍스트·이미지 후보 등 메인 스레드 모듈(`060-layout.js`, `050-core-node.js`, `070-image-export.js` 등)에서 처리.
- **레이어 이름 규칙**: 대소문자 무관 정확 일치 기준  
  - `code-btn` → `<a class="ap-btn">` 계열  
  - `code-slide` → Swiper용 슬라이드 구조(자식 구성 규칙은 `getSlideItems` 주석 참고)  
  - `code-video` → 비디오 플레이스홀더  
  - `code-raster` → 단일 래스터 export 우선
- **HTML/CSS 생성**: 섹션 BEM(`ap-section--NN`), 슬라이드 마크업, 지연 CSS, 이미지 경로·폰트 등(`096-html-code-builder.js` 등).
- **Swiper 관련 계산**: `computeSlidesPerView` / `computeSlidesPerViewMo`, `resolveSlideMeta`로 슬라이드당 노출 수 등 메타 계산; 생성 HTML에 Swiper 초기화용 인라인 조립(주석상 **Swiper CDN `<script>`/`<link>` 주입은 미리보기 UI 쪽**).
- **PC/MO 비교·병합(규칙 기반)**  
  - 섹션별 트리 시그니처 비교(`getSectionStructureMatch`, 최대 3레벨 자식 시그니처)  
  - 구조가 맞지 않으면 UI/상태에서 “불일치” 표시 및 `pc-only` / `mo-only` 래핑·지연 CSS 경로  
  - `@media` 병합(`combinePcMoAsBreakpoint`), 이미지는 `sourceNodeId`·semantic slot·동일 id·이름 폴백 등으로 MO 노드 해석(`resolveMoImageNodeForPc`)
- **보내기**: 이미지·코드·ZIP 관련 메시지 타입(`RESULT`, `RESULT_IMAGES_*`, `ZIP_*` 등)으로 UI와 연동(`099-ui-router.js`).
- **`img alt` (보내기 시점)**: `getImageAltText` — **이미지 노드의 레이어 `name`을 이스케이프 후 사용**(최대 125자). AI와 무관.

### 4.2 부분 구현 / 조건부

- **고품질 `alt`·헤딩**: 초기 HTML은 레이어명 기반. **의미 있는 접근성 문구**는 코드 탭의 AI **검수·반영** 플로우에서 보완(네트워크·API 키·모델 응답 품질에 의존).
- **Swiper 런타임**: 생성물에 맞춘 마크업/스타일은 포함하나, **라이브러리 CDN 로드는 미리보기 UI에서의 주입 패턴**으로 기술되어 있음 — 배포 HTML에 CDN을 자동 삽입하는지 여부는 생성 문자열과 배포 방식에 따라 별도 확인이 필요.

### 4.3 미구현(본 저장소 코드 기준으로 확인되지 않음)

- **Figma 노드 트리를 외부 AI에 보내 PC/MO 노드를 자동 재정렬·“의미 단위”로 매핑하는 파이프라인** (PC/MO 처리는 전부 플러그인 내 규칙/휴리스틱).
- **공식 Figma REST API 형태의 전체 씬 JSON 파일 export** 전용 기능.
- **AI 없이도 완전 자동으로 PDP급 품질을 보장**하는 검증 단계(수동 검토·프롬프트 튜닝 여지).

---

## 5. AI 활용 방식

### 5.1 AI 역할(코드 기준)

| 구분 | 내용 |
|------|------|
| **위치** | `plugin/ui.html` — 코드 탭의 **분석(검수)** / **반영(패치)**. 메인 스레드 `code.js`는 API 키 저장·로드(`LOAD_*_KEY`, `SAVE_*_KEY`)만 담당. |
| **입력** | 생성된 HTML/CSS(및 프롬프트에 정의된 범위: `<style>`·`<article class="ap-post">` 등). 검수 시 **이미지 JPEG 비전** 첨부 옵션(기본 ON 여부는 `00-entry.js`의 `AP_AI_DEFAULT_ALT_VISION`). |
| **출력** | JSON 형태의 검수 리포트(이슈, `alt` 제안, `headingAudit`, `headingPatches` 등). Gemini는 구조화 출력 스키마(`AP_GEMINI_*_SCHEMA`) 사용. |
| **반영** | 마지막 검수의 `alt`·헤딩 관련 제안을 코드 문자열에 패치하는 UI 측 로직. |

**PC/MO “구조 매칭” 자체는 AI를 사용하지 않습니다.** 구조 판별·병합은 `095-responsive-pcmo.js` 등 **규칙 기반**입니다.

### 5.2 왜 AI가 필요한가(이 프로젝트 맥락)

- **레이어명만으로는** 제품 이미지·타이포 이미지·장식 이미지를 구분해 적절한 `alt`를 쓰기 어렵고, **페이지 단위 시맨틱·헤딩 계층**은 디자인 레이어 구조와 1:1로 대응하지 않는 경우가 많습니다.
- 이에 대해 **이미지 픽셀(비전)과 본문 HTML을 함께 보도록** 프롬프트가 설계되어 있으며, 순수 규칙만으로 동일 수준의 검수를 재현하기 어렵습니다.  
  → **“시각·문맥을 이해한 `alt`/헤딩 검수”는 AI 없이 해결하기 어려운 문제에 가깝고**, PC/MO 트리 정합은 **현재 코드에서는 AI가 담당하지 않음**을 구분해야 합니다.

### 5.3 사용 가능한 모델(UI에 하드코딩된 예시)

- **OpenAI**: `gpt-4o`, `gpt-4o-mini`
- **Google Gemini**: `gemini-2.5-flash`, `gemini-2.5-flash-lite`  
- 플러그인 기본값: 제공자 `gemini`, 모델 `gemini-2.5-flash`(`00-entry.js`의 `AP_AI_DEFAULT_*` 및 UI `AI_UI_DEFAULTS`).

### 5.4 처리 방식(요약)

1. 사용자가 코드 탭에서 **분석** 실행.  
2. UI가 선택된 제공자·모델·API 키로 **OpenAI Chat Completions** 또는 **Gemini Generative Language API** 호출(`manifest.json`의 `networkAccess` 허용 도메인과 일치).  
3. 응답 JSON 파싱·정규화 후 리포트 표시.  
4. **반영** 시 동일 검수 결과를 바탕으로 HTML 문자열 패치.

**참고:** AI 입력은 **이미 생성된 HTML/CSS**(및 선택적 비전 JPEG)이며, **Figma 노드 JSON을 AI에 넘겨 PC/MO 트리를 재매핑하는 단계는 코드에 없습니다.**

---

## 6. 시스템 구조(Flow)

1. Figma에서 ROOT **1개 또는 2개** 선택.  
2. UI → `postMessage` → 메인 스레드 `RUN_ANALYZE` / `RUN_DESKTOP` / `RUN_MOBILE` 처리(`099-ui-router.js`).  
3. `dumpTreeAsync`로 레이어 인스펙트 `dataTree`·텍스트 생성, `buildCodeAsync`로 HTML/CSS·이미지 export 목록 생성(`097-dump-tree-async.js` 등).  
4. PC+MO인 경우: PC 트리 생성 후 MO 트리 처리, `combinePcMoAsBreakpoint`로 단일 문서 문자열 조합.  
5. `RESULT`·이미지 청크·ZIP 관련 메시지로 UI에 전달.  
6. UI에서 코드·미리보기·ZIP·(선택) AI 검수/반영.

---

## 7. 기술 스택

- **Figma Plugin**: `manifest.json` — `api: "1.0.0"`, `main: "code.js"`, `ui: "ui.html"`.
- **메인 스레드**: `plugin/src/*.js`를 순서대로 이어 붙인 **`plugin/code.js`**(빌드 스크립트로 생성). Vanilla JavaScript.
- **UI**: **`plugin/ui.html`** 단일 파일(HTML + CSS + JS). 별도 프레임워크 번들은 없음.
- **빌드**: Node.js — `plugin/scripts/build-code.js`, `plugin/scripts/dev.js`, 경로 상수 `plugin/build-paths.js`.
- **외부 네트워크**: `api.openai.com`, `generativelanguage.googleapis.com`, `cdnjs.cloudflare.com`(미리보기 등).

---

## 8. 실행 방법

1. 저장소 클론 후 프로젝트 루트에서 메인 스레드 번들 생성:  
   `npm run build`  
   → `plugin/src` → `plugin/code.js` 갱신.
2. 개발 시 소스 감시:  
   `npm run dev`  
   → `plugin/src` 변경 시 `code.js` 재빌드(UI는 `ui.html` 수정 후 Figma에서 플러그인을 다시 실행해야 함 — `dev.js` 주석과 동일).
3. Figma Desktop: **Plugins → Development → Import plugin from manifest…** 에서 `plugin/manifest.json` 선택.

`package.json`에 런타임 npm 의존성은 없고, 스크립트만 정의되어 있습니다.

---

## 9. 사용 방법(Step-by-step)

1. Figma에서 PC용(또는 단일) ROOT 프레임을 준비합니다. MO까지 쓰려면 PC·MO ROOT를 **두 개** 선택합니다.  
2. 플러그인 실행 후 **분석**(또는 PC 전용 / PC+MO 흐름)을 실행합니다. 선택이 없거나 ROOT 개수가 맞지 않으면 에러 메시지가 표시됩니다.  
3. UI에 표시된 **레이어 규칙**(`code-btn`, `code-slide`, `code-raster`, `code-video`)에 맞춰 Figma 레이어 이름을 정리하는 것이 좋습니다.  
4. 생성된 코드·미리보기·ZIP을 확인합니다.  
5. AI 검수를 쓰려면 UI에서 **OpenAI 또는 Gemini** 제공자·모델·API 키를 설정한 뒤 코드 탭에서 **분석** → 필요 시 **반영**을 실행합니다.

---

## 10. 한계점

- ROOT는 **최대 2개**이며, 그 이상 선택 시 오류 처리됩니다.  
- PC/MO 대응은 **동일 섹션 순서·트리 시그니처·인덱스 walk** 등에 기대므로, 디자이너가 구조를 크게 다르게 가져가면 `pc-only`/`mo-only` 분기·수동 수정 비중이 커질 수 있습니다.  
- 초기 `alt`는 **레이어명**에 의존합니다.  
- AI 검수는 **네트워크·API 키·할당량·모델 출력 형식**에 의존하며, JSON 파싱 실패 시 UI에 진단 메시지가 표시될 수 있습니다.  
- Swiper **라이브러리 로드 방식**은 미리보기와 배포 HTML이 다를 수 있으므로 통합 배포 시 스크립트 포함 여부를 별도 확인해야 합니다.

---

## 11. 향후 개선 방향(제안)

- Figma 트리·메타데이터를 활용한 **노드 단위 PC/MO 매칭** 고도화(이름·시맨틱 외 추가 휴리스틱 또는, 필요 시 **별도** AI 파이프라인 설계 — 현재 미구현).  
- 보내기 HTML에 **Swiper(및 기타 CDN) 삽입 옵션**을 명시적으로 토글.  
- `dataTree`/덤프를 **표준 JSON 파일로 저장**하는 UI 옵션(현재는 메시지로 UI에 전달).  
- AI 검수 프롬프트·스키마를 도메인별로 외부 설정화.

---

## 문서·코드 출처 요약

- 플러그인 진입·UI 크기: `plugin/src/00-entry.js`  
- 메시지 라우팅·선택 규칙: `plugin/src/099-ui-router.js`  
- PC/MO: `plugin/src/095-responsive-pcmo.js`  
- HTML 생성: `plugin/src/096-html-code-builder.js`  
- 덤프·빌드 루프: `plugin/src/097-dump-tree-async.js`  
- 슬라이드: `plugin/src/020-slide.js`  
- 레이어 규칙: `plugin/src/010-format-class.js`  
- AI·모델 UI: `plugin/ui.html`  
- 네트워크 허용 도메인: `plugin/manifest.json`
