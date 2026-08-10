import { XMLParser } from 'fast-xml-parser';

// ---------------------------------------------------------------------------
// 한국환경공단_전기차 충전소 정보 OpenAPI 클라이언트 & 코드 매핑
//   Base URL : https://apis.data.go.kr/B552584/EvCharger
//   Operations:
//     - getChargerInfo   : 전기차 충전소(충전기) 기본 정보
//     - getChargerStatus : 전기차 충전기 실시간 상태
// ---------------------------------------------------------------------------

export const EVCHARGER_BASE = 'https://apis.data.go.kr/B552584/EvCharger';

// data.go.kr 에서 발급받은 "일반 인증키(Encoding)" 값(%3D%3D 포함).
// fetch 는 URL 문자열 안의 기존 % 인코딩을 다시 인코딩하지 않으므로
// 반드시 문자열로 직접 조립해서 사용한다. (URLSearchParams 사용 시 이중 인코딩됨)
const DEFAULT_SERVICE_KEY =
  'o3xw7rO4AuoURpGuFYk18iqIMu3HW3OG2y5mWp1ZBH5PKAdrKAlq5IqQAMRTrpcYwQTzUEmr3xHVfKIKkG98uw%3D%3D';

export function getServiceKey(): string {
  return process.env.DATA_GO_KR_SERVICE_KEY || DEFAULT_SERVICE_KEY;
}

// ----- 코드 매핑 -----------------------------------------------------------

// 충전기 타입 (chgerType)
export const CHGER_TYPE: Record<string, string> = {
  '01': 'DC차데모',
  '02': '완속(AC)',
  '03': 'DC차데모+AC3상',
  '04': 'DC콤보',
  '05': 'DC차데모+DC콤보',
  '06': 'DC차데모+AC3상+DC콤보',
  '07': 'AC3상',
  '08': 'DC콤보(완속)',
  '89': '수소',
};

// 완속으로 분류할 충전기 타입
const SLOW_TYPES = new Set(['02', '08']);

// 충전기 상태 (stat)
export interface StatMeta {
  label: string;
  color: string; // 배지 색상
  available?: boolean;
}
export const STAT_META: Record<string, StatMeta> = {
  '1': { label: '통신이상', color: '#9ca3af' },
  '2': { label: '충전대기', color: '#16a34a', available: true },
  '3': { label: '충전중', color: '#2563eb' },
  '4': { label: '운영중지', color: '#dc2626' },
  '5': { label: '점검중', color: '#d97706' },
  '9': { label: '상태미확인', color: '#6b7280' },
};

export function chgerTypeName(code?: string): string {
  if (!code) return '-';
  return CHGER_TYPE[code] ?? code;
}

export function statMeta(code?: string): StatMeta {
  if (!code) return { label: '미확인', color: '#6b7280' };
  return STAT_META[code] ?? { label: `상태(${code})`, color: '#6b7280' };
}

// 급속/완속/수소 분류 — 충전용량(output)이 있으면 40kW 기준, 없으면 타입 기준
export function speedClass(item: ChargerItem): '급속' | '완속' | '수소' {
  if (item.chgerType === '89') return '수소';
  const out = Number(item.output);
  if (!Number.isNaN(out) && out > 0) return out >= 40 ? '급속' : '완속';
  return SLOW_TYPES.has(item.chgerType ?? '') ? '완속' : '급속';
}

// ----- 타입 ---------------------------------------------------------------

export interface ChargerItem {
  statNm?: string; // 충전소명
  statId?: string; // 충전소 ID
  chgerId?: string; // 충전기 ID
  chgerType?: string; // 충전기 타입 코드
  addr?: string; // 주소
  addrDetail?: string; // 상세주소
  location?: string; // 상세위치
  lat?: string;
  lng?: string;
  useTime?: string; // 이용가능시간
  busiId?: string; // 충전사업자 ID
  bnm?: string; // 기관명
  busiNm?: string; // 충전사업자명
  busiCall?: string; // 기관 전화번호
  stat?: string; // 상태 코드
  statUpdDt?: string; // 상태갱신일시
  lastTsdt?: string;
  lastTedt?: string;
  nowTsdt?: string;
  output?: string; // 충전용량(kW)
  method?: string; // 충전방식(단독/동시)
  zcode?: string; // 지역코드
  zscode?: string; // 지역상세코드
  kind?: string; // 충전소 구분(대)
  kindDetail?: string; // 충전소 구분(소)
  parkingFree?: string; // 주차료 무료여부
  note?: string; // 안내
  limitYn?: string; // 이용자제한
  limitDetail?: string;
  delYn?: string; // 삭제여부
  delDetail?: string;
  trafficYn?: string; // 개방여부
}

export interface ChargerResponse {
  resultCode: string;
  resultMsg: string;
  totalCount: number;
  pageNo: number;
  numOfRows: number;
  items: ChargerItem[];
}

// ----- 요청 ---------------------------------------------------------------

export type Operation = 'getChargerInfo' | 'getChargerStatus';

export interface FetchParams {
  op: Operation;
  pageNo?: number;
  numOfRows?: number;
  zcode?: string; // 시도 코드
  zscode?: string; // 시군구 코드
  period?: number; // getChargerStatus 전용 (분, 최대 10)
}

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false, // 값은 문자열 그대로 유지 (앞자리 0 보존 등)
  trimValues: true,
});

function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

export async function fetchChargers(params: FetchParams): Promise<ChargerResponse> {
  const key = getServiceKey();
  const pageNo = params.pageNo ?? 1;
  const numOfRows = params.numOfRows ?? 100;

  let url =
    `${EVCHARGER_BASE}/${params.op}?serviceKey=${key}` +
    `&pageNo=${pageNo}&numOfRows=${numOfRows}&dataType=XML`;
  if (params.zcode) url += `&zcode=${encodeURIComponent(params.zcode)}`;
  if (params.zscode) url += `&zscode=${encodeURIComponent(params.zscode)}`;
  if (params.op === 'getChargerStatus' && params.period) {
    url += `&period=${params.period}`;
  }

  const res = await fetch(url, {
    // 공공데이터 특성상 항상 최신을 받기 위해 캐시 미사용
    cache: 'no-store',
    headers: { Accept: 'application/xml' },
  });

  const text = await res.text();

  if (!res.ok) {
    throw new EvChargerError(
      `공공데이터 API 호출 실패 (HTTP ${res.status})`,
      res.status,
      text.slice(0, 500),
    );
  }

  const xml = parser.parse(text);

  // 정상 응답: <response><header/><body/></response>
  const response = xml?.response;
  if (!response) {
    // 인증 오류 등은 <OpenAPI_ServiceResponse><cmmMsgHeader/> 형태로 옴
    const cmm = xml?.OpenAPI_ServiceResponse?.cmmMsgHeader;
    const msg = cmm?.errMsg || cmm?.returnAuthMsg || '알 수 없는 오류';
    const code = String(cmm?.returnReasonCode ?? 'ERR');
    throw new EvChargerError(`공공데이터 API 오류: ${msg} (코드 ${code})`, 502, text.slice(0, 500));
  }

  const header = response.header ?? {};
  const body = response.body ?? {};
  const resultCode = String(header.resultCode ?? '');
  const resultMsg = String(header.resultMsg ?? '');

  // 00 이 정상. 그 외는 오류로 처리.
  if (resultCode && resultCode !== '00') {
    throw new EvChargerError(
      `공공데이터 API 오류: ${resultMsg} (코드 ${resultCode})`,
      502,
    );
  }

  const rawItems = body?.items?.item;
  const items = toArray<Record<string, unknown>>(
    rawItems as Record<string, unknown> | Record<string, unknown>[] | undefined,
  ).map(normalizeItem);

  return {
    resultCode: resultCode || '00',
    resultMsg: resultMsg || 'NORMAL SERVICE.',
    totalCount: Number(body.totalCount ?? items.length) || 0,
    pageNo: Number(body.pageNo ?? pageNo) || pageNo,
    numOfRows: Number(body.numOfRows ?? numOfRows) || numOfRows,
    items,
  };
}

function normalizeItem(raw: Record<string, unknown>): ChargerItem {
  const s = (v: unknown): string | undefined => {
    if (v === undefined || v === null) return undefined;
    const str = String(v).trim();
    return str === '' ? undefined : str;
  };
  return {
    statNm: s(raw.statNm),
    statId: s(raw.statId),
    chgerId: s(raw.chgerId),
    chgerType: s(raw.chgerType),
    addr: s(raw.addr),
    addrDetail: s(raw.addrDetail),
    location: s(raw.location),
    lat: s(raw.lat),
    lng: s(raw.lng),
    useTime: s(raw.useTime),
    busiId: s(raw.busiId),
    bnm: s(raw.bnm),
    busiNm: s(raw.busiNm),
    busiCall: s(raw.busiCall),
    stat: s(raw.stat),
    statUpdDt: s(raw.statUpdDt),
    lastTsdt: s(raw.lastTsdt),
    lastTedt: s(raw.lastTedt),
    nowTsdt: s(raw.nowTsdt),
    output: s(raw.output),
    method: s(raw.method),
    zcode: s(raw.zcode),
    zscode: s(raw.zscode),
    kind: s(raw.kind),
    kindDetail: s(raw.kindDetail),
    parkingFree: s(raw.parkingFree),
    note: s(raw.note),
    limitYn: s(raw.limitYn),
    limitDetail: s(raw.limitDetail),
    delYn: s(raw.delYn),
    delDetail: s(raw.delDetail),
    trafficYn: s(raw.trafficYn),
  };
}

export class EvChargerError extends Error {
  status: number;
  detail?: string;
  constructor(message: string, status = 500, detail?: string) {
    super(message);
    this.name = 'EvChargerError';
    this.status = status;
    this.detail = detail;
  }
}

// YYYYMMDDHHMMSS -> 사람이 읽는 형식
export function formatKstDate(raw?: string): string {
  if (!raw) return '-';
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?$/);
  if (!m) return raw;
  const [, y, mo, d, h, mi] = m;
  return `${y}-${mo}-${d}${h ? ` ${h}:${mi ?? '00'}` : ''}`;
}
