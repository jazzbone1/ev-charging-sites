import 'server-only';
import { promises as fs } from 'fs';
import path from 'path';
import {
  genChargerId,
  type RegisteredCharger,
  type RegisteredChargerInput,
} from './charger-record';

// ---------------------------------------------------------------------------
// 서버측 영구 저장소 (파일 기반 JSON 스토어).
//   - 로컬 개발 / 자체 호스팅(Docker, VPS, Railway, Render 등)에서 영구 저장됨.
//   - Vercel 등 읽기 전용/휘발성 파일시스템에서는 쓰기가 실패할 수 있으며,
//     이 경우 StoreUnavailableError 를 던져 라우트가 501 로 응답 → 클라이언트가
//     localStorage 로 폴백한다. (README 의 DB 확장 안내 참고)
//
//   외부 DB(Postgres, Vercel KV 등)로 교체하려면 이 파일의 함수 4개만
//   대체하면 된다: listStored / createStored / deleteStored / (readAll)
// ---------------------------------------------------------------------------

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), '.data');
const FILE = path.join(DATA_DIR, 'registrations.json');

export class StoreUnavailableError extends Error {
  constructor(message = '서버 저장소를 사용할 수 없습니다.') {
    super(message);
    this.name = 'StoreUnavailableError';
  }
}

function isReadonlyError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === 'EROFS' || code === 'EACCES' || code === 'ENOSPC' || code === 'EPERM';
}

async function readAll(): Promise<RegisteredCharger[]> {
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RegisteredCharger[]) : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return [];
    // 손상된 JSON 등은 빈 목록으로 처리(쓰기 시 복구)
    if (err instanceof SyntaxError) return [];
    throw err;
  }
}

async function writeAll(list: RegisteredCharger[]): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    if (isReadonlyError(err)) throw new StoreUnavailableError();
    throw err;
  }
}

export async function listStored(): Promise<RegisteredCharger[]> {
  const list = await readAll();
  return list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function createStored(
  input: RegisteredChargerInput,
): Promise<RegisteredCharger> {
  const list = await readAll();
  const item: RegisteredCharger = {
    ...input,
    id: genChargerId(),
    createdAt: new Date().toISOString(),
  };
  await writeAll([item, ...list]);
  return item;
}

export async function deleteStored(id: string): Promise<boolean> {
  const list = await readAll();
  const next = list.filter((r) => r.id !== id);
  if (next.length === list.length) return false;
  await writeAll(next);
  return true;
}
