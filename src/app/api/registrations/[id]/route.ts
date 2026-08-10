import { NextResponse } from 'next/server';
import { deleteStored, StoreUnavailableError } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// DELETE /api/registrations/:id — 등록 충전기 삭제
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ok = await deleteStored(params.id);
    if (!ok) {
      return NextResponse.json({ error: '해당 항목을 찾을 수 없습니다.' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof StoreUnavailableError) {
      return NextResponse.json({ error: err.message, code: 'STORE_UNAVAILABLE' }, { status: 501 });
    }
    return NextResponse.json({ error: '삭제에 실패했습니다.' }, { status: 500 });
  }
}
