'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { REGIONS, regionName } from '@/lib/regions';
import {
  chgerTypeName,
  formatKstDate,
  speedClass,
  statMeta,
  type ChargerItem,
  type ChargerResponse,
} from '@/lib/evcharger';
import { loadRegistrations, type RegisteredCharger } from '@/lib/registrations';

interface Row extends ChargerItem {
  _mine?: boolean;
}

const TYPE_PALETTE = [
  '#0b7d4f',
  '#2563eb',
  '#d97706',
  '#7c3aed',
  '#db2777',
  '#0891b2',
  '#65a30d',
  '#e11d48',
  '#475569',
];

export default function DashboardPage() {
  const [zcode, setZcode] = useState('11');
  const [numOfRows, setNumOfRows] = useState(200);
  const [pageNo, setPageNo] = useState(1);
  const [includeMine, setIncludeMine] = useState(true);

  const [data, setData] = useState<ChargerResponse | null>(null);
  const [mine, setMine] = useState<RegisteredCharger[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMine(loadRegistrations());
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        op: 'info',
        zcode,
        pageNo: String(pageNo),
        numOfRows: String(numOfRows),
      });
      const res = await fetch(`/api/chargers?${qs.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `요청 실패 (HTTP ${res.status})`);
      setData(json as ChargerResponse);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [zcode, pageNo, numOfRows]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 자체 등록 충전기를 ChargerItem 형태로 변환 (현재 지역과 일치하는 것만)
  const mineRows: Row[] = useMemo(() => {
    if (!includeMine) return [];
    return mine
      .filter((m) => m.zcode === zcode)
      .map((m) => ({
        statNm: m.statNm,
        statId: m.id,
        chgerId: '자체',
        chgerType: m.chgerType,
        addr: m.addr,
        addrDetail: m.addrDetail,
        output: m.output,
        busiNm: m.busiNm,
        busiCall: m.busiCall,
        useTime: m.useTime,
        parkingFree: m.parkingFree,
        stat: '2',
        statUpdDt: m.createdAt.replace(/[-:T]/g, '').slice(0, 14),
        zcode: m.zcode,
        _mine: true,
      }));
  }, [mine, includeMine, zcode]);

  const rows: Row[] = useMemo(() => {
    const apiRows = (data?.items ?? []) as Row[];
    // 자체 등록은 첫 페이지에만 상단 노출
    return pageNo === 1 ? [...mineRows, ...apiRows] : apiRows;
  }, [data, mineRows, pageNo]);

  const agg = useMemo(() => aggregate(rows), [rows]);

  const totalCount = data?.totalCount ?? 0;
  const mineCount = mineRows.length;
  const pageSize = numOfRows;
  const hasNext = pageNo * pageSize < totalCount;

  const onFilterChange = (next: { zcode?: string; numOfRows?: number }) => {
    if (next.zcode !== undefined) setZcode(next.zcode);
    if (next.numOfRows !== undefined) setNumOfRows(next.numOfRows);
    setPageNo(1);
  };

  return (
    <>
      <div className="page-head">
        <h1>전기차 충전기 설치현황</h1>
        <p>
          한국환경공단 전기차 충전소 정보(OpenAPI)를 기반으로 지역별 충전기 설치 및 실시간 상태를
          조회합니다.
        </p>
      </div>

      <div className="card filters">
        <div className="field">
          <label htmlFor="region">시·도</label>
          <select
            id="region"
            value={zcode}
            onChange={(e) => onFilterChange({ zcode: e.target.value })}
          >
            {REGIONS.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="rows">조회 건수</label>
          <select
            id="rows"
            value={numOfRows}
            onChange={(e) => onFilterChange({ numOfRows: Number(e.target.value) })}
          >
            {[100, 200, 500, 1000].map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString()}건
              </option>
            ))}
          </select>
        </div>
        <label className="chk">
          <input
            type="checkbox"
            checked={includeMine}
            onChange={(e) => setIncludeMine(e.target.checked)}
          />
          내가 등록한 충전기 포함
        </label>
        <button className="btn btn-primary" onClick={fetchData} disabled={loading}>
          {loading ? '조회 중…' : '새로고침'}
        </button>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="stat-grid">
        <div className="card stat">
          <div className="stat-label">전체 등록 충전기</div>
          <div className="stat-value">{totalCount.toLocaleString()}</div>
          <div className="stat-sub">
            {regionName(zcode)}
            {includeMine && mineCount > 0 ? ` · 자체등록 +${mineCount}` : ''}
          </div>
        </div>
        <div className="card stat">
          <div className="stat-label">사용 가능(충전대기)</div>
          <div className="stat-value" style={{ color: 'var(--primary)' }}>
            {agg.available.toLocaleString()}
          </div>
          <div className="stat-sub">불러온 {agg.total.toLocaleString()}건 중 {pct(agg.available, agg.total)}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">급속 충전기 비율</div>
          <div className="stat-value">{pct(agg.speed['급속'] ?? 0, agg.total)}</div>
          <div className="stat-sub">
            급속 {(agg.speed['급속'] ?? 0).toLocaleString()} · 완속{' '}
            {(agg.speed['완속'] ?? 0).toLocaleString()}
          </div>
        </div>
        <div className="card stat">
          <div className="stat-label">운영기관 수</div>
          <div className="stat-value">{agg.operators.length.toLocaleString()}</div>
          <div className="stat-sub">불러온 표본 기준</div>
        </div>
      </div>

      {/* Breakdown panels */}
      <div className="panels">
        <div className="card card-pad panel">
          <h3>충전기 타입 분포</h3>
          {agg.types.length === 0 ? (
            <p className="field-hint">데이터 없음</p>
          ) : (
            agg.types.map((t, i) => (
              <BarRow
                key={t.key}
                label={t.key}
                count={t.count}
                total={agg.total}
                color={TYPE_PALETTE[i % TYPE_PALETTE.length]}
              />
            ))
          )}
        </div>
        <div className="card card-pad panel">
          <h3>실시간 상태 분포</h3>
          {agg.statuses.length === 0 ? (
            <p className="field-hint">데이터 없음</p>
          ) : (
            agg.statuses.map((s) => (
              <BarRow
                key={s.key}
                label={s.label}
                count={s.count}
                total={agg.total}
                color={s.color}
              />
            ))
          )}
        </div>
      </div>

      {/* Top operators */}
      {agg.operators.length > 0 && (
        <div className="card card-pad panel" style={{ marginBottom: 20 }}>
          <h3>상위 운영기관 (상위 8)</h3>
          {agg.operators.slice(0, 8).map((o, i) => (
            <BarRow
              key={o.key}
              label={o.key}
              count={o.count}
              total={agg.total}
              color={TYPE_PALETTE[i % TYPE_PALETTE.length]}
            />
          ))}
        </div>
      )}

      {/* List */}
      <div className="section-title">
        <h2>충전기 목록</h2>
        <Link className="btn btn-ghost" href="/register">
          + 충전기 등록
        </Link>
      </div>

      <div className="toolbar">
        <span className="muted">
          {loading
            ? '불러오는 중…'
            : `${regionName(zcode)} · ${totalCount.toLocaleString()}건 중 ${rows.length.toLocaleString()}건 표시 (페이지 ${pageNo})`}
        </span>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading-row">
            <span className="spinner" /> 데이터를 불러오는 중입니다…
          </div>
        ) : rows.length === 0 ? (
          <div className="empty">
            <div className="emoji">🔌</div>
            <p>표시할 충전기가 없습니다. 지역이나 조회 조건을 변경해 보세요.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>충전소 / 주소</th>
                  <th>충전기</th>
                  <th>타입</th>
                  <th>용량</th>
                  <th>운영기관</th>
                  <th>상태</th>
                  <th>갱신</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const sm = statMeta(r.stat);
                  return (
                    <tr key={`${r.statId}-${r.chgerId}-${idx}`}>
                      <td>
                        <div className="cell-name">
                          {r.statNm ?? '-'}{' '}
                          {r._mine && <span className="tag tag-mine">자체등록</span>}
                        </div>
                        <div className="cell-sub">
                          {[r.addr, r.addrDetail].filter(Boolean).join(' ') || '-'}
                        </div>
                      </td>
                      <td>{r.chgerId ?? '-'}</td>
                      <td>
                        <span className="tag">{speedClass(r)}</span>{' '}
                        <span className="cell-sub" style={{ display: 'inline' }}>
                          {chgerTypeName(r.chgerType)}
                        </span>
                      </td>
                      <td>{r.output ? `${r.output}kW` : '-'}</td>
                      <td>{r.busiNm ?? r.bnm ?? '-'}</td>
                      <td>
                        <span className="badge" style={{ background: sm.color }}>
                          {sm.label}
                        </span>
                      </td>
                      <td className="cell-sub">{formatKstDate(r.statUpdDt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalCount > pageSize && (
        <div className="pager">
          <button
            className="btn btn-ghost"
            disabled={pageNo <= 1 || loading}
            onClick={() => setPageNo((p) => Math.max(1, p - 1))}
          >
            ← 이전
          </button>
          <span className="muted">페이지 {pageNo}</span>
          <button
            className="btn btn-ghost"
            disabled={!hasNext || loading}
            onClick={() => setPageNo((p) => p + 1)}
          >
            다음 →
          </button>
        </div>
      )}
    </>
  );
}

// --- 컴포넌트 & 집계 -------------------------------------------------------

function BarRow({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const width = total > 0 ? Math.max(2, (count / total) * 100) : 0;
  return (
    <div className="bar-row">
      <span className="bar-label" title={label}>
        <span className="dot" style={{ background: color }} />
        <span
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {label}
        </span>
      </span>
      <span className="bar-track">
        <span className="bar-fill" style={{ width: `${width}%`, background: color }} />
      </span>
      <span className="bar-count">{count.toLocaleString()}</span>
    </div>
  );
}

interface Agg {
  total: number;
  available: number;
  speed: Record<string, number>;
  types: { key: string; count: number }[];
  statuses: { key: string; label: string; color: string; count: number }[];
  operators: { key: string; count: number }[];
}

function aggregate(rows: Row[]): Agg {
  const speed: Record<string, number> = {};
  const typeMap = new Map<string, number>();
  const statMap = new Map<string, number>();
  const opMap = new Map<string, number>();
  let available = 0;

  for (const r of rows) {
    const sc = speedClass(r);
    speed[sc] = (speed[sc] ?? 0) + 1;

    const tn = chgerTypeName(r.chgerType);
    typeMap.set(tn, (typeMap.get(tn) ?? 0) + 1);

    const stat = r.stat ?? '9';
    statMap.set(stat, (statMap.get(stat) ?? 0) + 1);
    if (stat === '2') available += 1;

    const op = r.busiNm ?? r.bnm;
    if (op) opMap.set(op, (opMap.get(op) ?? 0) + 1);
  }

  const types = [...typeMap.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);

  const statuses = [...statMap.entries()]
    .map(([key, count]) => {
      const m = statMeta(key);
      return { key, label: m.label, color: m.color, count };
    })
    .sort((a, b) => b.count - a.count);

  const operators = [...opMap.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);

  return { total: rows.length, available, speed, types, statuses, operators };
}

function pct(part: number, total: number): string {
  if (!total) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}
