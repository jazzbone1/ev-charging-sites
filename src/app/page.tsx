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
import { fetchRegistrations, type RegisteredCharger } from '@/lib/registrations';
import ChargerMap, { type MapPoint } from '@/components/ChargerMap';

interface Row extends ChargerItem {
  _mine?: boolean;
}

type View = 'list' | 'map';

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
  const [view, setView] = useState<View>('list');
  const [search, setSearch] = useState('');
  const [operator, setOperator] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [renderLimit, setRenderLimit] = useState(300);

  const fetchAll = numOfRows === 0;

  const [data, setData] = useState<ChargerResponse | null>(null);
  const [mine, setMine] = useState<RegisteredCharger[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRegistrations().then(({ items }) => setMine(items));
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ op: 'info' });
      if (zcode) qs.set('zcode', zcode);
      if (numOfRows === 0) {
        qs.set('all', '1');
      } else {
        qs.set('pageNo', String(pageNo));
        qs.set('numOfRows', String(numOfRows));
      }
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
      .filter((m) => zcode === '' || m.zcode === zcode)
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
        lat: m.lat,
        lng: m.lng,
        stat: '2',
        statUpdDt: m.createdAt.replace(/[-:T]/g, '').slice(0, 14),
        zcode: m.zcode,
        _mine: true,
      }));
  }, [mine, includeMine, zcode]);

  const rows: Row[] = useMemo(() => {
    const apiRows = (data?.items ?? []) as Row[];
    // 자체 등록은 첫 페이지(또는 전체수집)에서만 상단 노출
    const showMine = fetchAll || pageNo === 1;
    return showMine ? [...mineRows, ...apiRows] : apiRows;
  }, [data, mineRows, pageNo, fetchAll]);

  const agg = useMemo(() => aggregate(rows), [rows]);

  // 같은 충전소(주소)로 묶은 현장 목록
  const stations = useMemo(() => groupByStation(rows), [rows]);

  // 검색(현장명/주소) + 운영기관 필터
  const filteredStations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stations.filter((s) => {
      if (operator && (s.busiNm ?? '') !== operator) return false;
      if (!q) return true;
      return (
        s.statNm.toLowerCase().includes(q) ||
        s.addr.toLowerCase().includes(q) ||
        (s.addrDetail ?? '').toLowerCase().includes(q)
      );
    });
  }, [stations, search, operator]);

  // 필터/검색 변경 시 목록 렌더 상한 초기화
  useEffect(() => {
    setRenderLimit(300);
    setExpanded(new Set());
  }, [search, operator, zcode, numOfRows, pageNo]);

  // 지도 마커 — 현장 단위 (좌표 보유 현장만)
  const mapPoints: MapPoint[] = useMemo(() => {
    return filteredStations
      .map((s): MapPoint | null => {
        const lat = Number(s.lat);
        const lng = Number(s.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
        return {
          lat,
          lng,
          name: `${s.statNm} (충전기 ${s.total}기)`,
          addr: [s.addr, s.addrDetail].filter(Boolean).join(' ') || undefined,
          statLabel: `사용가능 ${s.available}/${s.total}`,
          statColor: s.available > 0 ? '#16a34a' : '#6b7280',
          mine: s.mine,
        };
      })
      .filter((p): p is MapPoint => p !== null);
  }, [filteredStations]);

  const totalCount = data?.totalCount ?? 0;
  const mineCount = mineRows.length;
  const pageSize = numOfRows;
  const hasNext = pageNo * pageSize < totalCount;

  const onFilterChange = (next: { zcode?: string; numOfRows?: number }) => {
    if (next.zcode !== undefined) setZcode(next.zcode);
    if (next.numOfRows !== undefined) setNumOfRows(next.numOfRows);
    setPageNo(1);
    setExpanded(new Set());
  };

  const toggleStation = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allExpanded = filteredStations.length > 0 && expanded.size >= filteredStations.length;
  const toggleAll = () => {
    if (allExpanded) setExpanded(new Set());
    else setExpanded(new Set(filteredStations.map((s) => s.key)));
  };

  return (
    <>
      <div className="page-head">
        <h1>전기차 충전기 설치현황</h1>
        <p>
          한국환경공단 전기차 충전소 정보(OpenAPI)를 기반으로 지역별 충전소 설치 및 실시간 상태를
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
            <option value="">전체</option>
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
            <option value={0}>전체</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="operator">운영기관</label>
          <select id="operator" value={operator} onChange={(e) => setOperator(e.target.value)}>
            <option value="">전체 ({agg.operators.length})</option>
            {agg.operators.map((o) => (
              <option key={o.key} value={o.key}>
                {o.key} ({o.count})
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1, minWidth: 200 }}>
          <label htmlFor="search">현장명·주소 검색</label>
          <input
            id="search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="예) 국회도서관, 영등포구"
          />
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
          <div className="stat-label">전체 충전소(현장)</div>
          <div className="stat-value">{stations.length.toLocaleString()}</div>
          <div className="stat-sub">
            불러온 충전기 {agg.total.toLocaleString()}기
            {includeMine && mineCount > 0 ? ` · 자체등록 +${mineCount}` : ''}
          </div>
        </div>
        <div className="card stat">
          <div className="stat-label">사용 가능(충전대기)</div>
          <div className="stat-value" style={{ color: 'var(--primary)' }}>
            {agg.available.toLocaleString()}
          </div>
          <div className="stat-sub">
            충전기 {agg.total.toLocaleString()}기 중 {pct(agg.available, agg.total)}
          </div>
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
          <div className="stat-label">해당 지역 전체 충전기</div>
          <div className="stat-value">{totalCount.toLocaleString()}</div>
          <div className="stat-sub">{regionName(zcode)} (API 기준)</div>
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
              <BarRow key={s.key} label={s.label} count={s.count} total={agg.total} color={s.color} />
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

      {/* List / Map */}
      <div className="section-title">
        <h2>충전소 {view === 'map' ? '지도' : '목록'}</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="segmented" role="tablist">
            <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
              목록
            </button>
            <button className={view === 'map' ? 'active' : ''} onClick={() => setView('map')}>
              지도
            </button>
          </div>
          <Link className="btn btn-ghost" href="/register">
            + 충전기 등록
          </Link>
        </div>
      </div>

      <div className="toolbar">
        <span className="muted">
          {loading
            ? '불러오는 중…'
            : view === 'map'
              ? `${regionName(zcode)} · 좌표 보유 ${mapPoints.length.toLocaleString()}개 현장 지도 표시`
              : `${regionName(zcode)} · ${filteredStations.length.toLocaleString()}개 현장` +
                (operator ? ` · ${operator}` : '') +
                (search ? ` · 검색 "${search}"` : fetchAll ? '' : ` · 페이지 ${pageNo}`)}
        </span>
        {view === 'list' && filteredStations.length > 0 && (
          <button className="btn btn-ghost" onClick={toggleAll}>
            {allExpanded ? '모두 접기' : '모두 펼치기'}
          </button>
        )}
      </div>

      {!loading && data?.truncated && (
        <div className="alert alert-info" style={{ marginBottom: 12 }}>
          데이터가 많아 상한({(data.fetched ?? 0).toLocaleString()}건)까지만 불러왔습니다. 지역을
          좁히거나 검색·운영기관 필터로 조회하세요.
        </div>
      )}

      {view === 'map' ? (
        <div className="card card-pad">
          <ChargerMap points={mapPoints} />
        </div>
      ) : (
        <div className="card">
          {loading ? (
            <div className="loading-row">
              <span className="spinner" /> 데이터를 불러오는 중입니다…
            </div>
          ) : filteredStations.length === 0 ? (
            <div className="empty">
              <div className="emoji">🔌</div>
              <p>
                {search
                  ? `"${search}" 검색 결과가 없습니다.`
                  : '표시할 충전소가 없습니다. 지역이나 조회 조건을 변경해 보세요.'}
              </p>
            </div>
          ) : (
            <>
              <div className="station-list">
                {filteredStations.slice(0, renderLimit).map((s) => (
                  <StationRow
                    key={s.key}
                    station={s}
                    open={expanded.has(s.key)}
                    onToggle={() => toggleStation(s.key)}
                  />
                ))}
              </div>
              {filteredStations.length > renderLimit && (
                <div className="pager" style={{ paddingTop: 14 }}>
                  <span className="muted">
                    {renderLimit.toLocaleString()} / {filteredStations.length.toLocaleString()}개
                    현장 표시 중
                  </span>
                  <button
                    className="btn btn-ghost"
                    onClick={() => setRenderLimit((n) => n + 300)}
                  >
                    더 보기 (+300)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {view === 'list' && !fetchAll && !search && !operator && totalCount > pageSize && (
        <div className="pager">
          <button
            className="btn btn-ghost"
            disabled={pageNo <= 1 || loading}
            onClick={() => {
              setPageNo((p) => Math.max(1, p - 1));
              setExpanded(new Set());
            }}
          >
            ← 이전
          </button>
          <span className="muted">페이지 {pageNo}</span>
          <button
            className="btn btn-ghost"
            disabled={!hasNext || loading}
            onClick={() => {
              setPageNo((p) => p + 1);
              setExpanded(new Set());
            }}
          >
            다음 →
          </button>
        </div>
      )}
    </>
  );
}

// --- 현장(충전소) 행 --------------------------------------------------------

function StationRow({
  station,
  open,
  onToggle,
}: {
  station: Station;
  open: boolean;
  onToggle: () => void;
}) {
  const availColor = station.available > 0 ? '#16a34a' : '#6b7280';
  return (
    <div className={`station ${open ? 'open' : ''}`}>
      <button className="station-head" onClick={onToggle} aria-expanded={open}>
        <span className="station-chev">{open ? '▾' : '▸'}</span>
        <div className="station-main">
          <div className="station-name">
            {station.statNm}
            {station.mine && <span className="tag tag-mine">자체등록</span>}
            <span className="muted" style={{ fontWeight: 600 }}>
              충전기 {station.total}기
            </span>
          </div>
          <div className="station-addr">
            {[station.addr, station.addrDetail].filter(Boolean).join(' ') || '-'}
          </div>
        </div>
        <div className="station-meta">
          <span className="badge" style={{ background: availColor }}>
            사용가능 {station.available}/{station.total}
          </span>
          {station.fast > 0 && <span className="tag">급속 {station.fast}</span>}
          {station.slow > 0 && <span className="tag">완속 {station.slow}</span>}
          {station.hydrogen > 0 && <span className="tag">수소 {station.hydrogen}</span>}
          <span className="muted station-op">{station.busiNm ?? '-'}</span>
        </div>
      </button>
      {open && (
        <div className="station-body">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>충전기 ID</th>
                  <th>타입</th>
                  <th>용량</th>
                  <th>상태</th>
                  <th>이용시간</th>
                  <th>갱신</th>
                </tr>
              </thead>
              <tbody>
                {station.chargers.map((c, i) => {
                  const sm = statMeta(c.stat);
                  return (
                    <tr key={`${c.chgerId}-${i}`}>
                      <td className="cell-name">{c.chgerId ?? '-'}</td>
                      <td>
                        <span className="tag">{speedClass(c)}</span>{' '}
                        <span className="cell-sub" style={{ display: 'inline' }}>
                          {chgerTypeName(c.chgerType)}
                        </span>
                      </td>
                      <td>{c.output ? `${c.output}kW` : '-'}</td>
                      <td>
                        <span className="badge" style={{ background: sm.color }}>
                          {sm.label}
                        </span>
                      </td>
                      <td className="cell-sub">{c.useTime ?? '-'}</td>
                      <td className="cell-sub">{formatKstDate(c.statUpdDt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
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
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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

// --- 현장 그룹핑 -----------------------------------------------------------

interface Station {
  key: string;
  statNm: string;
  addr: string;
  addrDetail?: string;
  busiNm?: string;
  lat?: string;
  lng?: string;
  mine?: boolean;
  chargers: Row[];
  total: number;
  available: number;
  fast: number;
  slow: number;
  hydrogen: number;
  latestUpd?: string;
}

function groupByStation(rows: Row[]): Station[] {
  const map = new Map<string, Station>();
  for (const r of rows) {
    const key = r.statId || `${r.statNm ?? ''}|${r.addr ?? ''}`;
    let s = map.get(key);
    if (!s) {
      s = {
        key,
        statNm: r.statNm ?? '이름 없음',
        addr: r.addr ?? '',
        addrDetail: r.addrDetail,
        busiNm: r.busiNm ?? r.bnm,
        lat: r.lat,
        lng: r.lng,
        mine: r._mine,
        chargers: [],
        total: 0,
        available: 0,
        fast: 0,
        slow: 0,
        hydrogen: 0,
      };
      map.set(key, s);
    }
    s.chargers.push(r);
    s.total += 1;
    if (r.stat === '2') s.available += 1;
    const sc = speedClass(r);
    if (sc === '급속') s.fast += 1;
    else if (sc === '완속') s.slow += 1;
    else s.hydrogen += 1;
    if (!s.lat && r.lat) s.lat = r.lat;
    if (!s.lng && r.lng) s.lng = r.lng;
    if (!s.busiNm && (r.busiNm || r.bnm)) s.busiNm = r.busiNm ?? r.bnm;
    if (r._mine) s.mine = true;
    if (r.statUpdDt && (!s.latestUpd || r.statUpdDt > s.latestUpd)) s.latestUpd = r.statUpdDt;
  }
  // 자체등록 → 사용가능 많은 순 → 충전기 많은 순
  return [...map.values()].sort((a, b) => {
    if (a.mine !== b.mine) return a.mine ? -1 : 1;
    if (b.available !== a.available) return b.available - a.available;
    return b.total - a.total;
  });
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
