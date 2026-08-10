// 클라이언트/서버 공용 — 자체 등록 충전기 레코드 타입 & 검증 (런타임 의존성 없음)

export interface RegisteredCharger {
  id: string;
  statNm: string; // 충전소명
  addr: string; // 주소
  addrDetail?: string; // 상세위치
  zcode: string; // 시도 코드
  chgerType: string; // 충전기 타입 코드
  output?: string; // 충전용량(kW)
  busiNm?: string; // 운영기관/사업자
  busiCall?: string; // 연락처
  useTime?: string; // 이용가능시간
  parkingFree?: string; // 'Y' | 'N'
  lat?: string;
  lng?: string;
  note?: string;
  createdAt: string; // ISO
}

export type RegisteredChargerInput = Omit<RegisteredCharger, 'id' | 'createdAt'>;

type ValidateResult =
  | { ok: true; value: RegisteredChargerInput }
  | { ok: false; error: string };

export function validateChargerInput(body: unknown): ValidateResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: '잘못된 요청 본문입니다.' };
  }
  const b = body as Record<string, unknown>;
  const str = (v: unknown): string | undefined => {
    const s = v == null ? '' : String(v).trim();
    return s === '' ? undefined : s;
  };

  const statNm = str(b.statNm);
  const addr = str(b.addr);
  if (!statNm) return { ok: false, error: '충전소명은 필수입니다.' };
  if (!addr) return { ok: false, error: '주소는 필수입니다.' };

  const output = str(b.output);
  if (output !== undefined && Number.isNaN(Number(output))) {
    return { ok: false, error: '충전용량(kW)은 숫자여야 합니다.' };
  }

  return {
    ok: true,
    value: {
      statNm,
      addr,
      addrDetail: str(b.addrDetail),
      zcode: str(b.zcode) ?? '11',
      chgerType: str(b.chgerType) ?? '04',
      output,
      busiNm: str(b.busiNm),
      busiCall: str(b.busiCall),
      useTime: str(b.useTime),
      parkingFree: str(b.parkingFree) ?? 'Y',
      lat: str(b.lat),
      lng: str(b.lng),
      note: str(b.note),
    },
  };
}

export function genChargerId(): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `reg-${Date.now().toString(36)}-${rnd}`;
}
