import { NextRequest, NextResponse } from 'next/server';
import { validateChargerInput } from '@/lib/charger-record';
import { createStored, listStored, StoreUnavailableError } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/registrations — 자체 등록 충전기 목록
export async function GET() {
  try {
    const items = await listStored();
    return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    if (err instanceof StoreUnavailableError) {
      return NextResponse.json({ error: err.message, code: 'STORE_UNAVAILABLE' }, { status: 501 });
    }
    return NextResponse.json({ error: '목록을 불러오지 못했습니다.' }, { status: 500 });
  }
}

// POST /api/registrations — 신규 충전기 등록
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '유효한 JSON 본문이 필요합니다.' }, { status: 400 });
  }

  const result = validateChargerInput(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  try {
    const item = await createStored(result.value);
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    if (err instanceof StoreUnavailableError) {
      return NextResponse.json({ error: err.message, code: 'STORE_UNAVAILABLE' }, { status: 501 });
    }
    return NextResponse.json({ error: '등록에 실패했습니다.' }, { status: 500 });
  }
}
