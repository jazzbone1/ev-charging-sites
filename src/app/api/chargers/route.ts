import { NextRequest, NextResponse } from 'next/server';
import {
  fetchChargers,
  EvChargerError,
  type ChargerItem,
  type Operation,
} from '@/lib/evcharger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 전체(all) 수집 시 안전 상한 (브라우저/서버 보호). 환경변수로 조정 가능.
const ALL_PER_PAGE = 1000;
const ALL_MAX = Number(process.env.EVCHARGER_MAX_ALL || 30000);

// GET /api/chargers?op=info|status&zcode=11&pageNo=1&numOfRows=100
//   all=1 이면 모든 페이지를 수집(ALL_MAX 상한)
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const opParam = sp.get('op') ?? 'info';
  const op: Operation = opParam === 'status' ? 'getChargerStatus' : 'getChargerInfo';

  const zcode = sp.get('zcode') || undefined;
  const zscode = sp.get('zscode') || undefined;
  const all = sp.get('all') === '1' || sp.get('all') === 'true';
  const period = op === 'getChargerStatus' ? clampInt(sp.get('period'), 5, 1, 10) : undefined;

  try {
    if (all) {
      const data = await fetchAll({ op, zcode, zscode, period });
      return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
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

async function fetchAll(params: {
  op: Operation;
  zcode?: string;
  zscode?: string;
  period?: number;
}) {
  const items: ChargerItem[] = [];
  let totalCount = 0;
  let page = 1;
  const maxPages = Math.ceil(ALL_MAX / ALL_PER_PAGE);

  while (page <= maxPages) {
    const r = await fetchChargers({
      op: params.op,
      zcode: params.zcode,
      zscode: params.zscode,
      period: params.period,
      pageNo: page,
      numOfRows: ALL_PER_PAGE,
    });
    totalCount = r.totalCount || totalCount;
    items.push(...r.items);
    if (r.items.length < ALL_PER_PAGE) break; // 마지막 페이지
    if (items.length >= ALL_MAX) break; // 상한 도달
    page += 1;
  }

  return {
    resultCode: '00',
    resultMsg: 'NORMAL SERVICE.',
    totalCount,
    pageNo: 1,
    numOfRows: items.length,
    fetched: items.length,
    truncated: items.length < totalCount,
    all: true,
    items,
  };
}

function clampInt(v: string | null, fallback: number, min: number, max: number): number {
  const n = v == null ? NaN : parseInt(v, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
