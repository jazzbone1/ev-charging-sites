import { NextRequest, NextResponse } from 'next/server';
import {
  fetchChargers,
  fetchAllChargers,
  EvChargerError,
  type ChargerItem,
  type Operation,
} from '@/lib/evcharger';
import { getRegionMaster, listSyncedRegions } from '@/lib/master-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/chargers?op=info|status&zcode=11&pageNo=1&numOfRows=100
//   cache=1 : 서버 마스터 캐시에서 즉시 서빙 (동기화된 데이터)
//   all=1   : 모든 페이지를 실시간 수집(상한 EVCHARGER_MAX_ALL)
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const opParam = sp.get('op') ?? 'info';
  const op: Operation = opParam === 'status' ? 'getChargerStatus' : 'getChargerInfo';

  const zcode = sp.get('zcode') || undefined;
  const zscode = sp.get('zscode') || undefined;
  const cache = sp.get('cache') === '1' || sp.get('cache') === 'true';
  const all = sp.get('all') === '1' || sp.get('all') === 'true';
  const period = op === 'getChargerStatus' ? clampInt(sp.get('period'), 5, 1, 10) : undefined;

  try {
    if (cache) {
      const data = await serveFromCache(zcode);
      return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (all) {
      const { items, totalCount, truncated } = await fetchAllChargers({
        op,
        zcode,
        zscode,
        period,
      });
      return NextResponse.json(
        {
          resultCode: '00',
          resultMsg: 'NORMAL SERVICE.',
          totalCount,
          pageNo: 1,
          numOfRows: items.length,
          fetched: items.length,
          truncated,
          all: true,
          items,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const pageNo = clampInt(sp.get('pageNo'), 1, 1, 100000);
    const numOfRows = clampInt(sp.get('numOfRows'), 100, 1, 1000);
    const data = await fetchChargers({ op, zcode, zscode, pageNo, numOfRows, period });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    if (err instanceof EvChargerError) {
      return NextResponse.json({ error: err.message, detail: err.detail }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function serveFromCache(zcode?: string) {
  if (zcode) {
    const m = await getRegionMaster(zcode);
    if (!m) {
      return { items: [], cached: true, needsSync: true, lastSyncAt: null, totalCount: 0 };
    }
    return {
      items: m.chargers,
      cached: true,
      needsSync: false,
      lastSyncAt: m.lastSyncAt,
      totalCount: m.chargers.length,
    };
  }

  // 전체 = 동기화된 전 지역을 합산
  const regions = await listSyncedRegions();
  if (regions.length === 0) {
    return { items: [], cached: true, needsSync: true, lastSyncAt: null, totalCount: 0 };
  }
  const items: ChargerItem[] = [];
  let lastSyncAt: string | null = null;
  for (const r of regions) {
    const m = await getRegionMaster(r.zcode);
    if (!m) continue;
    items.push(...m.chargers);
    if (!lastSyncAt || m.lastSyncAt < lastSyncAt) lastSyncAt = m.lastSyncAt; // 가장 오래된 동기화 시각
  }
  return {
    items,
    cached: true,
    needsSync: false,
    lastSyncAt,
    syncedRegions: regions.length,
    totalCount: items.length,
  };
}

function clampInt(v: string | null, fallback: number, min: number, max: number): number {
  const n = v == null ? NaN : parseInt(v, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
