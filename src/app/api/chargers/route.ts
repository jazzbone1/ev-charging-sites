import { NextRequest, NextResponse } from 'next/server';
import { fetchChargers, EvChargerError, type Operation } from '@/lib/evcharger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/chargers?op=info|status&zcode=11&pageNo=1&numOfRows=100
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const opParam = sp.get('op') ?? 'info';
  const op: Operation = opParam === 'status' ? 'getChargerStatus' : 'getChargerInfo';

  const zcode = sp.get('zcode') || undefined;
  const zscode = sp.get('zscode') || undefined;
  const pageNo = clampInt(sp.get('pageNo'), 1, 1, 100000);
  const numOfRows = clampInt(sp.get('numOfRows'), 100, 1, 1000);
  const period = op === 'getChargerStatus' ? clampInt(sp.get('period'), 5, 1, 10) : undefined;

  try {
    const data = await fetchChargers({ op, zcode, zscode, pageNo, numOfRows, period });
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    if (err instanceof EvChargerError) {
      return NextResponse.json(
        { error: err.message, detail: err.detail },
        { status: err.status },
      );
    }
    const message = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function clampInt(v: string | null, fallback: number, min: number, max: number): number {
  const n = v == null ? NaN : parseInt(v, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
