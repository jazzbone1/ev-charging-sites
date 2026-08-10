# EV 충전기 등록·설치현황 사이트

한국환경공단 **전기차 충전소 정보 OpenAPI**(공공데이터포털, `B552584/EvCharger`)를 기반으로
전기차 충전기 **설치현황을 조회**하고, 신규 충전기를 **등록**할 수 있는 웹 서비스입니다.

## 주요 기능

- **설치현황 대시보드** (`/`)
  - 시·도별 충전기 설치 현황 조회 (공공데이터 OpenAPI 실시간 연동)
  - 요약 지표: 전체 등록 충전기, 사용 가능(충전대기), 급속 비율, 운영기관 수
  - 분포 차트: 충전기 타입 분포 / 실시간 상태 분포 / 상위 운영기관
  - **목록 / 지도 보기 전환** — 카카오맵에 충전소 위치를 마커로 표시
  - 충전기 목록 테이블 + 페이지네이션
- **충전기 등록** (`/register`)
  - 충전소명·주소·타입·용량·운영기관 등 입력 폼 (유효성 검사 포함)
  - 등록한 충전기는 설치현황 대시보드/지도에 함께 표시 (지역 일치 시)
  - **서버 저장소(REST API)에 영구 저장**, 서버 사용 불가 시 브라우저 `localStorage`로 자동 폴백

## 기술 스택

- [Next.js 14](https://nextjs.org/) (App Router) + TypeScript
- 서버 라우트에서 공공데이터 API를 프록시하여 **CORS 문제 없이** 호출하고
  XML 응답을 JSON으로 변환 ([`fast-xml-parser`](https://github.com/NaturalIntelligence/fast-xml-parser))
- 자체 등록 충전기는 서버 REST API(`/api/registrations`) + 파일 스토어로 영구 저장
- [카카오맵 JavaScript SDK](https://apis.map.kakao.com/) 로 위치 시각화
- 외부 UI/차트 라이브러리 없이 순수 CSS로 구현 (다크모드 자동 대응)

## 환경 변수

| 변수                       | 필수 | 설명                                                                                  |
| -------------------------- | ---- | ------------------------------------------------------------------------------------- |
| `DATA_GO_KR_SERVICE_KEY`   | ○\*  | 공공데이터포털 일반 인증키(Encoding, 끝의 `%3D%3D` 포함). 미설정 시 내장 개발용 키 사용 |
| `NEXT_PUBLIC_KAKAO_MAP_KEY`| ✕    | 카카오맵 JavaScript 앱 키. 미설정 시 지도 대신 안내 표시                               |
| `DATA_DIR`                 | ✕    | 서버 저장소 데이터 디렉토리. 기본 `./.data`. 컨테이너 배포 시 **영구 볼륨 경로**로 지정 |

`.env.example` 을 `.env.local` 로 복사해 값을 채우세요.

## 실행 방법

```bash
# 1) 의존성 설치
npm install

# 2) 환경 변수 설정(선택)
cp .env.example .env.local
#    - DATA_GO_KR_SERVICE_KEY : 본인 인증키 (미설정 시 내장 개발용 키)
#    - NEXT_PUBLIC_KAKAO_MAP_KEY : 지도 사용 시 카카오 JavaScript 키

# 3) 개발 서버
npm run dev            # http://localhost:3000

# 4) 프로덕션 빌드/실행
npm run build && npm start
```

## 배포

### Railway (권장 — 서버 저장소 영구화)

Railway는 볼륨을 마운트하면 파일 스토어가 영구 저장되어 **자체 등록 충전기가 그대로 유지**됩니다.

1. Railway에서 **New Project → Deploy from GitHub Repo** 로 이 저장소를 연결합니다.
   빌드는 `railway.json`(Nixpacks)로 자동 인식되며 `npm run build` → `npm run start` 로 실행됩니다.
   (`next start` 는 Railway가 주입하는 `PORT` 환경변수를 자동 사용)
2. **Variables** 에 환경 변수를 추가합니다.
   - `DATA_GO_KR_SERVICE_KEY`
   - `NEXT_PUBLIC_KAKAO_MAP_KEY` (지도 사용 시)
   - `DATA_DIR=/data`
3. **Volumes** 에서 볼륨을 하나 생성해 마운트 경로를 **`/data`** 로 지정합니다.
   (위 `DATA_DIR` 과 동일 경로) → 등록 데이터가 재배포/재시작 후에도 유지됩니다.
4. 카카오 개발자 콘솔의 **플랫폼 > Web** 에 배포된 Railway 도메인을 등록합니다.

> 볼륨을 붙이지 않으면 컨테이너 재시작 시 파일 스토어가 초기화됩니다(앱은 동작하지만 등록이 비영구).

### Vercel

Next.js를 자동 인식하므로 저장소 연결만으로 배포됩니다. 단, Vercel의 파일시스템은 **읽기 전용/휘발성**이라
서버 파일 스토어가 동작하지 않습니다 — 이 경우 등록 API는 501을 반환하고 앱은 자동으로
`localStorage` 저장으로 폴백합니다. Vercel에서 서버 영구 저장이 필요하면
Vercel KV / Postgres 등으로 `src/lib/store.ts` 의 함수를 교체하세요.
환경 변수(`DATA_GO_KR_SERVICE_KEY`, `NEXT_PUBLIC_KAKAO_MAP_KEY`)는 프로젝트 Settings에 등록합니다.

## 인증키(serviceKey) 안내

공공데이터포털에서 발급받은 **일반 인증키(Encoding)** 값을 그대로 사용합니다
(끝의 `%3D%3D` 포함). 환경변수 `DATA_GO_KR_SERVICE_KEY` 로 주입되며,
서버 측에서만 사용되어 브라우저에 노출되지 않습니다.

> data.go.kr 특성상 `serviceKey`는 이미 URL 인코딩된 상태이므로, 이중 인코딩을 피하기 위해
> `URLSearchParams` 대신 URL 문자열에 직접 조립합니다 (`src/lib/evcharger.ts`).

## API 개요

### 공공데이터 (`B552584/EvCharger`)

| Operation          | 설명                       |
| ------------------ | -------------------------- |
| `getChargerInfo`   | 전기차 충전소(충전기) 정보 |
| `getChargerStatus` | 전기차 충전기 실시간 상태  |

주요 파라미터: `serviceKey`, `pageNo`, `numOfRows`, `zcode`(시도), `zscode`(시군구),
`period`(상태 조회 시간범위, 분), `dataType`(XML).

**충전기 상태 코드(`stat`)**: 1 통신이상 · 2 충전대기 · 3 충전중 · 4 운영중지 · 5 점검중 · 9 상태미확인

### 이 앱의 내부 API

| 메서드 & 경로                     | 설명                                          |
| --------------------------------- | --------------------------------------------- |
| `GET /api/chargers`               | 공공데이터 프록시 (`op=info\|status`, `zcode` 등) |
| `GET /api/registrations`          | 자체 등록 충전기 목록                          |
| `POST /api/registrations`         | 신규 충전기 등록                              |
| `DELETE /api/registrations/:id`   | 등록 충전기 삭제                              |

## 프로젝트 구조

```
src/
  app/
    layout.tsx                      # 공통 레이아웃 / 네비게이션
    page.tsx                        # 설치현황 대시보드(목록/지도)
    register/page.tsx               # 충전기 등록
    api/chargers/route.ts           # 공공데이터 API 프록시 (XML→JSON)
    api/registrations/route.ts      # 등록 목록/생성
    api/registrations/[id]/route.ts # 등록 삭제
    globals.css                     # 전역 스타일
  components/
    ChargerMap.tsx                  # 카카오맵 위치 시각화
  lib/
    evcharger.ts                    # 공공데이터 API 클라이언트 · 타입 · 코드 매핑
    regions.ts                      # 시·도 코드(zcode) 매핑
    charger-record.ts               # 등록 레코드 타입 · 검증(공용)
    store.ts                        # 서버 파일 스토어 (DB 교체 지점)
    registrations.ts                # 클라이언트 등록 API(서버 우선 + 로컬 폴백)
```

## 데이터 출처

- 공공데이터포털: 한국환경공단_전기차 충전소 정보
  ([data.go.kr](https://www.data.go.kr/))

본 서비스는 참고용이며 실시간 정보와 차이가 있을 수 있습니다.
