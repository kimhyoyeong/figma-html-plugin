# Figma HTML Export (figma-html-plugin)

Figma 시안을 **반응형 HTML/CSS 초안**으로 변환하고,  
AI로 **heading·이미지 alt·섹션 블록 역할·CTA 버튼(후보 판정·링크 패치)** 등을 **제안**합니다(코드 탭에서 반영). 초안 품질을 올리는 데 도움을 주는 Figma 플러그인입니다.

---

## 1. 개요

본 플러그인은 AP 주요 업무인 **헤라 라이브러리 페이지**, **설화수 커버 페이지** 제작을 위해 개발되었습니다.

일반적으로 해당 업무는 **PC·모바일 두 벌의 디자인을 각각 작업한 뒤 반응형으로 구현**하는 방식으로 진행되며,  
디자인을 코드로 옮기는 과정은 수작업으로 이루어져 **최소 약 2~3일 이상의 공수**가 소요되는 경우가 많습니다.

본 플러그인은 이러한 **초기 퍼블리싱 초안**을 빠르게 만들고, 구조화된 HTML/CSS로 이어가기 쉽게 하는 것을 목표로 합니다.

---

## 2. 주요 기능

- **Figma 시안을 HTML/CSS 초안과 이미지 에셋으로 변환합니다.**
- **레이어 구조 기반 마크업을 생성합니다.**  
  - 섹션 단위(`ap-section--NN`)와 역할 기반 클래스(`ap-section__*`)를 자동 생성합니다.
- **규칙 기반으로 텍스트·이미지를 변환합니다.**  
- **혼합 스타일 텍스트를 처리합니다.**  
  - `span.ap-text__part`와 `--ap-part-*` CSS 변수로 구간별 스타일을 표현합니다.
- **각주 윗첨자를 후처리합니다.**  
  - 본문의 `1)`, `2)` 형태를 `<sup>`로 바꾸고, 스타일 구간은 `<sup class="ap-text__part">` 형태로 둡니다(`<style>` 블록 안은 변경하지 않습니다).
- **레이어명 기반 `code-*` 규칙을 적용합니다.**  
  - `code-btn`: `<a class="ap-btn">` 링크·버튼 구조  
  - `code-slide`: Swiper 마크업과 초기화 스크립트  
  - `code-raster`: 래스터 이미지 export·처리 강제  
  - `code-video`: 비디오 슬롯(레이어명 또는 Figma Video 채우기)
- **AI로 초안을 검수·보정합니다**
  - heading·alt·**`contentRoles`**·CTA(`linkBtnAudit` → **`linkBtnPatches`**) 등을 제안하고, UI에서 선택 반영합니다.
- **Export를 정리합니다.**  
  - ZIP 내보내기 시 `<!-- ap-ai-audit:start/end -->` 주석 블록을 제거합니다.

---

## 3. 사용 방법

1. Figma에서 플러그인을 실행합니다.
2. ROOT 기준으로 PC / 모바일 프레임을 선택합니다(1개면 PC만, 2개면 가로가 큰 쪽이 PC).
3. **분석**을 실행합니다.

### 3.1 레이어 탭

- 레이어 트리와 노드 속성·구성 정보를 확인합니다.

### 3.2 코드 / AI

- 생성된 HTML/CSS를 확인합니다.
- **OpenAI / Gemini**, 모델, API 키를 설정합니다(키는 로컬 저장소에 보관).
- AI **분석** 후 **반영** 시 `headingPatches`, `linkBtnPatches` 등으로 코드 탭 HTML을 패치합니다.
- **EXPORT_ZIP**으로 HTML과 이미지를 내보냅니다(ZIP HTML에서는 AI audit 주석을 제거합니다).

### 3.3 미리보기

- PC / 모바일 화면을 확인하고 1차 검증합니다.

---

## 4. 동작 구조 (핵심 로직)

플러그인은 Figma 레이어를 분석해 구조를 해석하고, HTML/CSS 초안을 만듭니다.

> **분석 → 구조 해석 → 역할 분류 → 스타일 변환 → HTML/CSS 생성**

### 4.1 분석

- 선택한 ROOT 프레임을 기준으로 레이아웃을 분석합니다.
- ROOT가 **2개**이면 가로 크기로 **PC / 모바일**을 나눕니다.
- 프로젝트명·국가 코드 등은 **이미지 파일명·export 규칙**에 반영됩니다.
- 레이어명 **`code-*`**로 버튼·슬라이드·비디오·래스터 등 마크업·export 방식을 정합니다.

### 4.2 레이어 구조 요약

선택한 ROOT 기준으로 레이어 구조를 **텍스트로 요약**해 보여 줍니다.

- 레이어 이름 및 타입  
- Auto Layout 정보(방향, 간격, 패딩)  
- 배경·테두리 스타일  
- 섹션 내 상대 위치  

Figma 원본 JSON 그대로 쓰는 게 아니라, 필요한 것만 재구성해서 쓰는 데이터입니다.

### 4.3 섹션 구조 및 역할 기반 클래스

레이어 구조와 스타일 정보를 바탕으로 `ap-section__*` 클래스가 붙습니다.  
의미 추론 AI가 아니라 **`081-section-semantics.js`의 규칙(휴리스틱)**으로 동작합니다.

#### 구조(프레임 depth)

레이어는 섹션을 기준으로 하위로 내려가며, Frame의 depth와 계층 구조를 기준으로 단계적인 역할이 부여됩니다.

- 조건을 만족하는 Frame에 대해  **`container` → `content` → `group` → `block` → `item` → …** 식 구조 역할을 한 단계씩 할당합니다.

#### 텍스트(폰트 크기·위치)

섹션 내부의 텍스트 요소는 폰트 크기와 위치 정보를 기준으로 역할이 결정됩니다.

- 섹션 안 TEXT를 **글자 크기 내림차순**, 같으면 **위쪽 순**으로 봅니다.  
- 일정 기준 이하의 폰트 크기는 본문(`desc`)으로 분류됩니다(예: 약 26px 이하).
- **첫째 → `title`**, **둘째 → `subtitle`**, **그 외 → `desc`**로 나눕니다.  

#### 이미지·비디오 등

- 이미지·비디오 후보를 분류해 `ap-section__image`, `ap-section__video` 등을 붙이고, 필요 시 **`--01`** 등 접미사로 순서를 구분합니다.


### 4.4 레이아웃 처리

- **Auto Layout** → flex 기반으로 변환합니다.  
- **Absolute** → `--ap-left`, `--ap-top`, `--ap-w`, `--ap-h`, `--ap-width` 등 **CSS 변수**로 분리합니다.  
- `calc(... / var(--ap-width) * 100cqi)` 등으로 **비율 스케일링**을 적용합니다.  
- **여러 해상도에서도 디자인 비율을 유지한 반응형 레이아웃**을 맞춥니다.

### 4.5 HTML / CSS 생성

- 섹션 단위(`ap-section--NN`)로 HTML·CSS 초안을 만듭니다.  
- **`ap-` 접두사**, **BEM(`ap-section__*`)**을 씁니다.  
- 공통 스타일을 병합·정리하고, 차이는 변수·개별 선언으로 둡니다.  
- 필요 시 **Swiper** 마크업·스크립트를 붙입니다(미리보기·UI는 CDN에서 Swiper 로드).  
- `code-slide` / `code-video` / `code-btn` 등은 각각 슬라이드·비디오·버튼 구조로 이어집니다.

### 4.6 타이포 처리

- `--ap-fs`, `--ap-lh`, `--ap-fw`, `--ap-ls` 등으로 블록 타이포를 관리합니다.  
- 혼합 스타일은 **`ap-text__part`**와 `--ap-part-*`로 나눕니다.  
- PC/MO 차이는 `@media` 등으로 분기합니다.

### 4.7 이미지 처리

- PC/MO **매칭**(`sourceNodeId`, 이름, 순서 등), 미리보기 썸네일 vs ZIP 해상도, 파일명 규칙(`page_…_sec…_img…`)을 적용합니다.

### 4.8 PC / 모바일 처리

- 섹션 구조가 같으면 HTML 하나 + `@media`, 다르면 `pc-only` / `mo-only` 등으로 나눕니다.

---

## 5. AI 활용 방식

AI는 **Figma를 분석해 HTML을 처음부터 만들지 않습니다.**  
이미 **`code.js`가 생성한 HTML/CSS**와 분석용 JPEG를 입력으로 받아, **검수·수정 제안·패치**를 하는 **보조** 역할입니다.

### 5.1 동작 흐름

1. **`code.js`**에서 HTML/CSS 초안 생성  
2. 해당 HTML + 분석용 JPEG를 AI에 전달  
3. JSON 형태로 검수 결과·제안 생성  
4. UI에서 확인 후 **선택적으로** 코드 탭 HTML에 패치 반영  

즉 **생성 → 검수 → 패치**가 분리되어 있습니다.

### 5.2 입력·출력·반영

| 구분 | 내용 |
| --- | --- |
| 입력 | 생성된 HTML/CSS + 분석용 JPEG(축소·인코딩) |
| 출력 | JSON 검수 결과(`headingAudit`, `altProposals`, `linkBtnAudit`, `contentRoles` 등) |
| 반영 | `ui.html`에서 `headingPatches`, `linkBtnPatches` 등 **before/after** 치환 |


### 5.3 주요 검수 항목

- **Heading**: `headingAudit` → 문제 분석, `headingPatches` → 수정 제안  
- **이미지 alt**: `altProposals`  
- **CTA 버튼**: `linkBtnAudit` → 후보, `linkBtnPatches` → `<a class="ap-btn">` 등 치환 제안  

### 5.4 적용 방식

- AI 결과는 **자동 반영되지 않습니다.** 사용자가 UI에서 검토한 뒤 적용합니다.  
- HTML은 **문자열 치환(before/after)** 형태로 고칩니다.

### 5.5 사용 모델·환경

- **OpenAI**: `gpt-4o`, `gpt-4o-mini`  
- **Gemini**(기본): `gemini-2.5-flash`, `gemini-2.5-flash-lite`  

API 키는 플러그인 UI에 입력하며, 브라우저 **localStorage**에 저장합니다.  
**`manifest.json`**의 `networkAccess`로 OpenAI·Gemini·CDN 등 허용 도메인만 접근합니다.

### 5.6 역할·한계

- AI는 **구조 생성 엔진이 아니라**, 이미 나온 HTML을 **품질 보정**하는 데 씁니다.  
- **장점**: 접근성·SEO 관점 보완, alt·heading·CTA 제안  
- **한계**: 모델·프롬프트 의존, **완전한 검수 도구는 아님**, 일부 제안은 수동 검토 필요  

**정리**: 구조 생성은 **`code.js`**, 품질 검수·제안은 **AI**, 최종 판단은 **사용자**입니다.  
AI는 **“초안을 더 나은 상태로 보정하는 단계”**로 쓰입니다.

---

## 6. 주의사항

### 6.1 Auto Layout

- **Auto Layout** 기반이면 flex 구조로 안정적으로 변환하기 쉽습니다.  
- absolute 많으면 CSS가 복잡해지고 의도와 다르게 나올 수 있습니다.

### 6.2 PC / 모바일 구조

- PC·MO 프레임은 가능한 한 **트리 구조를 동일하게** 두는 것이 `@media` 병합에 유리합니다.  
- 구조가 크게 다르면 매칭·병합에서 어긋날 수 있습니다.

### 6.3 레이어 정리

- 불필요한 그룹·과한 중첩·모호한 이름은 분석 정확도를 떨어뜨릴 수 있습니다.

### 6.4 규칙 기반 분석의 특성

- **장점**: 빠르고 일관된 초안  
- **한계**: 복잡·예외적인 화면에서는 오분류 가능  

디자인 단계에서 구조를 명확히 할수록 결과가 좋아집니다.

---

## 7. 개발

- **`npm run build`**: `plugin/src`를 묶어 **`plugin/code.js`**를 생성합니다(`plugin/scripts/build-code.js`).  
- **`npm run dev`**: 파일을 감시해 자동 빌드합니다(`plugin/scripts/dev.js`).  

Figma 플러그인은 **`plugin/code.js`**, **`plugin/ui.html`**, **`manifest.json`**을 읽습니다. 소스만 고치고 빌드하지 않으면 반영되지 않습니다.

---

## 8. 소스 구조

| 경로 | 담당 |
| --- | --- |
| `00-entry.js` | 진입, UI 크기 |
| `010-format-class.js` | `code-*` 이름 규칙, BEM·숫자/CSS 출력, ZIP용 AI audit 주석 제거 |
| `020-slide.js` | 슬라이드·Swiper 관련 |
| `030-shape.js` | Line·Ellipse CSS, 버튼 래핑, `alt` 기본 |
| `040-text-utils.js` | 혼합 스타일·`ap-text__part`·줄바꿈 처리 |
| `050-core-node.js` | 노드 공통 |
| `060-layout.js` | 레이아웃·fills·stroke·Video fill 유틸 |
| `070-image-export.js` | 이미지 분류·export 폭 상수 |
| `080-text-fonts.js` | 타이포 변수·줄간 스냅 |
| `081-section-semantics.js` | 섹션 BEM·텍스트·역할 힌트·이미지/비디오 슬롯 수집 |
| `082-deferred-css.js` | 지연 스타일 |
| `083-assets-cache.js` | 에셋 경로·PC/MO 파일명·상속 맵 |
| `067-image-system.js` | 이미지 파이프라인·export |
| `084-image-render-order.js` | 이미지 렌더 순서·PC–모바일 prefetch 짝 |
| `085-section-background.js` | 섹션·호이스트 배경 |
| `090-tree-inspect.js` | 트리 인스펙트 보조 |
| `095-responsive-pcmo.js` | PC/MO 병합·`@media`·모바일 노드 매칭(스타일) |
| `096-html-code-builder.js` | 최종 HTML/CSS 조립·각주 `<sup>` 후처리 |
| `097-dump-tree-async.js` | 분석 덤프·빌드 진입 연결 |
| `099-ui-router.js` | UI 메시지 라우팅 |
| `ui.html` | 미리보기·OpenAI/Gemini 호출·`headingPatches` / `linkBtnPatches` 적용 |
| `manifest.json` | 네트워크 허용 도메인 등 |
