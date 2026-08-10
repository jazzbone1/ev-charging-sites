# EV 충전기 등록·설치현황 사이트

한국환경공단 **전기차 충전소 정보 OpenAPI**(공공데이터포털, `B552584/EvCharger`)를 기반으로
전기차 충전기 **설치현황을 조회**하고, 신규 충전기를 **등록**할 수 있는 웹 서비스입니다.

## 주요 기능

- **설치현황 대시보드** (`/`)
  - 시·도별 충전기 설치 현황 조회 (공공데이터 OpenAPI 실시간 연동)
  - 요약 지표: 전체 등록 충전기, 사용 가능(충전대기), 급속 비율, 운영기관 수
  - 분포 차트: 충전기 타입 분포 / 실시간 상태 분포 / 상위 운영기관
  - 충전기 목록 테이블 + 페이지네이션
- **충전기 등록** (`/register`)
  - 충전소명·주소·타입·용량·운영기관 등 입력 폼
  - 등록한 충전기는 설치현황 대시보드에 함께 표시 (지역 일치 시)
  - 등록 데이터는 브라우저 `localStorage`에 저장

## 기술 스택

- [Next.js 14](https://nextjs.org/) (App Router) + TypeScript
- 서버 라우트(`/api/chargers`)에서 공공데이터 API를 프록시하여 **CORS 문제 없이** 호출하고
  XML 응답을 JSON으로 변환 ([`fast-xml-parser`](https://github.com/NaturalIntelligence/fast-xml-parser))
- 외부 UI/차트 라이브러리 없이 순수 CSS로 구현 (다크모드 자동 대응)

## 실행 방법

```bash
# 1) 의존성 설치
npm install

# 2) (선택) 인증키 설정
cp .env.example .env.local
# .env.local 의 DATA_GO_KR_SERVICE_KEY 값을 본인 키로 교체
#  - 미설정 시 저장소 내장 개발용 키 사용

# 3) 개발 서버 실행
npm run dev
# http://localhost:3000

# 4) 프로덕션 빌드
npm run build && npm start
```

## 인증키(serviceKey) 안내

공공데이터포털에서 발급받은 **일반 인증키(Encoding)** 값을 그대로 사용합니다
(끝의 `%3D%3D` 포함). 환경변수 `DATA_GO_KR_SERVICE_KEY` 로 주입되며,
서버 측에서만 사용되어 브라우저에 노출되지 않습니다.

> data.go.kr 특성상 `serviceKey`는 이미 URL 인코딩된 상태이므로, 이중 인코딩을 피하기 위해
> `URLSearchParams` 대신 URL 문자열에 직접 조립합니다 (`src/lib/evcharger.ts`).

## API 개요 (`B552584/EvCharger`)

| Operation          | 설명                       |
| ------------------ | -------------------------- |
| `getChargerInfo`   | 전기차 충전소(충전기) 정보 |
| `getChargerStatus` | 전기차 충전기 실시간 상태  |

주요 파라미터: `serviceKey`, `pageNo`, `numOfRows`, `zcode`(시도), `zscode`(시군구),
`period`(상태 조회 시간범위, 분), `dataType`(XML).

**충전기 상태 코드(`stat`)**: 1 통신이상 · 2 충전대기 · 3 충전중 · 4 운영중지 · 5 점검중 · 9 상태미확인

## 프로젝트 구조

```
src/
  app/
    layout.tsx            # 공통 레이아웃 / 네비게이션
    page.tsx              # 설치현황 대시보드
    register/page.tsx     # 충전기 등록
    api/chargers/route.ts # 공공데이터 API 프록시 (XML→JSON)
    globals.css           # 전역 스타일
  lib/
    evcharger.ts          # API 클라이언트 · 타입 · 코드 매핑
    regions.ts            # 시·도 코드(zcode) 매핑
    registrations.ts      # 자체 등록(localStorage) 저장소
```

## 데이터 출처

- 공공데이터포털: 한국환경공단_전기차 충전소 정보
  ([data.go.kr](https://www.data.go.kr/))

본 서비스는 참고용이며 실시간 정보와 차이가 있을 수 있습니다.
