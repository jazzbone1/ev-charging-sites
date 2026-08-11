import { NextRequest, NextResponse } from 'next/server';
import { fetchAllChargers, EvChargerError } from '@/lib/evcharger';
import { listSyncedRegions, upsertRegion } from '@/lib/master-store';
import { StoreUnavailableError } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// 대량 지역 동기화가 시간이 걸릴 수 있으므로 최대 실행시간 확대
export const maxDuration = 300;

// 동기화 시 지역별 수집 상한 (지역 단위이므로 넉넉하게)
const SYNC_MAX = Number(process.env.EVCHARGER_SYNC_MAX || 200000);

// GET /api/sync — 동기화 현황(지역별 마지막 동기화 시각/건수)
export async function GET() {
  try {
    const regions = await listSyncedRegions();
    const totalChargers = regions.reduce((sum, r) => sum + r.count, 0);
    const lastSyncAt =
      regions.length > 0
        ? regions.map((r) => r.lastSyncAt).sort().slice(-1)[0]
        : null;
    return NextResponse.json(
      { regions, totalChargers, lastSyncAt },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : '동기화 현황을 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/sync?zcode=11 — 해당 지역 전체를 수집해 마스터에 upsert
export async function POST(req: NextRequest) {
  const zcode = req.nextUrl.searchParams.get('zcode');
  if (!zcode) {
    return NextResponse.json(
      { error: 'zcode 파라미터가 필요합니다. (지역별로 동기화하세요)' },
      { status: 400 },
    );
  }

  const startedAt = Date.now();
  try {
    const { items, totalCount, truncated } = await fetchAllChargers(
      { op: 'getChargerInfo', zcode },
      { perPage: 1000, max: SYNC_MAX },
    );
    const result = await upsertRegion(zcode, items);
    return NextResponse.json({
      ...result,
      fetched: items.length,
      apiTotalCount: totalCount,
      truncated,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    if (err instanceof StoreUnavailableError) {
      return NextResponse.json({ error: err.message, code: 'STORE_UNAVAILABLE' }, { status: 501 });
    }
    if (err instanceof EvChargerError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : '동기화에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
