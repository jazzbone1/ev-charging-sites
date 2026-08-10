// 브라우저 localStorage 기반 "자체 등록" 충전기 저장소.
// 공공데이터 API 는 조회 전용이므로, 사용자가 신규 등록하는 충전기는
// 이 앱(브라우저) 안에 보관하고 설치현황에서 함께 볼 수 있게 한다.

export interface RegisteredCharger {
  id: string; // 내부 고유 ID
  statNm: string; // 충전소명
  addr: string; // 주소
  addrDetail?: string; // 상세주소/위치
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

const STORAGE_KEY = 'ev-registered-chargers-v1';

export function loadRegistrations(): RegisteredCharger[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RegisteredCharger[]) : [];
  } catch {
    return [];
  }
}

export function saveRegistrations(list: RegisteredCharger[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function addRegistration(
  input: Omit<RegisteredCharger, 'id' | 'createdAt'>,
): RegisteredCharger[] {
  const list = loadRegistrations();
  const item: RegisteredCharger = {
    ...input,
    id: genId(),
    createdAt: new Date().toISOString(),
  };
  const next = [item, ...list];
  saveRegistrations(next);
  return next;
}

export function removeRegistration(id: string): RegisteredCharger[] {
  const next = loadRegistrations().filter((r) => r.id !== id);
  saveRegistrations(next);
  return next;
}

function genId(): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `reg-${Date.now().toString(36)}-${rnd}`;
}
