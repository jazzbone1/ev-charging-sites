// 클라이언트 등록 API — 서버(/api/registrations) 우선, 실패 시 localStorage 폴백.
// 서버 저장소가 사용 가능하면 서버를 원본으로 삼고 로컬에 캐시를 미러링한다.

import {
  genChargerId,
  type RegisteredCharger,
  type RegisteredChargerInput,
} from './charger-record';

export type { RegisteredCharger, RegisteredChargerInput };
export type RegSource = 'server' | 'local';

const STORAGE_KEY = 'ev-registered-chargers-v1';

// ----- localStorage (캐시 & 폴백) -----------------------------------------

export function readLocal(): RegisteredCharger[] {
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

function writeLocal(list: RegisteredCharger[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

// 서버 저장소 사용 가능 여부(501 응답 시 false 로 전환)
let serverAvailable = true;

// ----- 공개 API ------------------------------------------------------------

export async function fetchRegistrations(): Promise<{
  items: RegisteredCharger[];
  source: RegSource;
}> {
  try {
    const res = await fetch('/api/registrations', { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      const items = (json.items ?? []) as RegisteredCharger[];
      serverAvailable = true;
      writeLocal(items); // 로컬 미러
      return { items, source: 'server' };
    }
    if (res.status === 501) serverAvailable = false;
  } catch {
    // 네트워크 오류 → 로컬 폴백
  }
  return { items: readLocal(), source: 'local' };
}

export async function createRegistration(
  input: RegisteredChargerInput,
): Promise<{ item: RegisteredCharger; source: RegSource }> {
  if (serverAvailable) {
    try {
      const res = await fetch('/api/registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (res.ok) {
        const json = await res.json();
        const item = json.item as RegisteredCharger;
        writeLocal([item, ...readLocal().filter((r) => r.id !== item.id)]);
        return { item, source: 'server' };
      }
      if (res.status === 501) {
        serverAvailable = false;
      } else {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `등록 실패 (HTTP ${res.status})`);
      }
    } catch (err) {
      if (err instanceof Error && err.message && !/fetch/i.test(err.message)) throw err;
      // 네트워크 오류는 로컬 폴백
      serverAvailable = false;
    }
  }

  // 로컬 폴백
  const item: RegisteredCharger = {
    ...input,
    id: genChargerId(),
    createdAt: new Date().toISOString(),
  };
  writeLocal([item, ...readLocal()]);
  return { item, source: 'local' };
}

export async function deleteRegistration(id: string): Promise<void> {
  if (serverAvailable) {
    try {
      const res = await fetch(`/api/registrations/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.status === 501) serverAvailable = false;
    } catch {
      serverAvailable = false;
    }
  }
  writeLocal(readLocal().filter((r) => r.id !== id));
}
