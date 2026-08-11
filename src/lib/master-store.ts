import 'server-only';
import { promises as fs } from 'fs';
import path from 'path';
import type { ChargerItem } from './evcharger';
import { StoreUnavailableError } from './store';

// ---------------------------------------------------------------------------
// 충전소/충전기 "마스터" 캐시 (지역별 파일 + 인메모리).
//   - 느리게 변하는 정보(현장/충전기 제원)를 서버 DB에 저장해 즉시 로드.
//   - 동기화 시 statId+chgerId 로 upsert → 신규 현장 자동 추가, 기존은 갱신.
//   - Railway 볼륨(DATA_DIR)에 저장되어 재배포/재시작 후에도 유지.
//   - 실시간 상태는 클라이언트가 별도로 덧씌운다(상태만 가벼운 조회).
// ---------------------------------------------------------------------------

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), '.data');
const MASTER_DIR = path.join(DATA_DIR, 'master');

export interface MasterCharger extends ChargerItem {
  firstSeen: string; // 최초 수집 시각(ISO)
  lastSeen: string; // 마지막 수집 시각(ISO)
}

export interface RegionMaster {
  zcode: string;
  lastSyncAt: string;
  chargers: MasterCharger[];
}

// 인메모리 캐시 (Railway 단일 인스턴스에서 웜 유지 → 매 요청마다 파일 파싱 안 함)
const mem = new Map<string, RegionMaster>();

function fileFor(zcode: string): string {
  return path.join(MASTER_DIR, `${zcode || 'ALL'}.json`);
}

function keyOf(c: ChargerItem): string {
  return `${c.statId ?? ''}::${c.chgerId ?? ''}`;
}

function isReadonly(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === 'EROFS' || code === 'EACCES' || code === 'ENOSPC' || code === 'EPERM';
}

export async function getRegionMaster(zcode: string): Promise<RegionMaster | null> {
  const cached = mem.get(zcode);
  if (cached) return cached;
  try {
    const raw = await fs.readFile(fileFor(zcode), 'utf8');
    const parsed = JSON.parse(raw) as RegionMaster;
    mem.set(zcode, parsed);
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
    if (err instanceof SyntaxError) return null;
    throw err;
  }
}

export interface SyncedRegion {
  zcode: string;
  lastSyncAt: string;
  count: number;
}

export async function listSyncedRegions(): Promise<SyncedRegion[]> {
  const out: SyncedRegion[] = [];
  let files: string[] = [];
  try {
    files = await fs.readdir(MASTER_DIR);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return [];
    throw err;
  }
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const zcode = f.replace(/\.json$/, '');
    const m = await getRegionMaster(zcode);
    if (m) out.push({ zcode, lastSyncAt: m.lastSyncAt, count: m.chargers.length });
  }
  return out.sort((a, b) => a.zcode.localeCompare(b.zcode));
}

export interface UpsertResult {
  zcode: string;
  added: number;
  updated: number;
  total: number;
  lastSyncAt: string;
}

export async function upsertRegion(
  zcode: string,
  items: ChargerItem[],
): Promise<UpsertResult> {
  const now = new Date().toISOString();
  const existing = (await getRegionMaster(zcode))?.chargers ?? [];
  const byKey = new Map<string, MasterCharger>();
  for (const c of existing) byKey.set(keyOf(c), c);

  let added = 0;
  let updated = 0;
  for (const it of items) {
    if (it.delYn === 'Y') continue; // 삭제된 충전기는 제외
    const k = keyOf(it);
    const prev = byKey.get(k);
    if (prev) {
      byKey.set(k, { ...prev, ...it, firstSeen: prev.firstSeen, lastSeen: now });
      updated += 1;
    } else {
      byKey.set(k, { ...it, firstSeen: now, lastSeen: now });
      added += 1;
    }
  }

  const chargers = [...byKey.values()];
  const master: RegionMaster = { zcode, lastSyncAt: now, chargers };
  mem.set(zcode, master);
  await writeRegion(zcode, master);
  return { zcode, added, updated, total: chargers.length, lastSyncAt: now };
}

// 실시간 상태 델타 반영 (선택) — 캐시에 최신 상태를 저장하고 싶을 때 사용
export async function applyStatusDeltas(
  zcode: string,
  deltas: ChargerItem[],
): Promise<number> {
  const master = await getRegionMaster(zcode);
  if (!master) return 0;
  const byKey = new Map(master.chargers.map((c) => [keyOf(c), c]));
  let updated = 0;
  for (const d of deltas) {
    const c = byKey.get(keyOf(d));
    if (!c) continue;
    if (d.stat) c.stat = d.stat;
    if (d.statUpdDt) c.statUpdDt = d.statUpdDt;
    updated += 1;
  }
  if (updated > 0) await writeRegion(zcode, master);
  return updated;
}

async function writeRegion(zcode: string, master: RegionMaster): Promise<void> {
  try {
    await fs.mkdir(MASTER_DIR, { recursive: true });
    await fs.writeFile(fileFor(zcode), JSON.stringify(master), 'utf8');
  } catch (err) {
    if (isReadonly(err)) throw new StoreUnavailableError('마스터 캐시를 저장할 수 없습니다(읽기 전용 파일시스템).');
    throw err;
  }
}
