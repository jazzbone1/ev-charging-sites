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

// 운영기관 표기 기준 — 데이터마다 CPO 브랜드가 bnm/busiNm 중 어디 있을지 달라
// 사용자가 직접 전환해 비교할 수 있게 한다.
type OpField = 'auto' | 'bnm' | 'busiNm';

function resolveOperator(
  item: { bnm?: string; busiNm?: string; busiId?: string },
  field: OpField,
): string {
  if (field === 'bnm') return item.bnm || '미상';
  if (field === 'busiNm') return item.busiNm || '미상';
  return item.bnm || item.busiNm || item.busiId || '미상';
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
  const [view, setView] = useState<View>('list');
  const [search, setSearch] = useState('');
  const [operator, setOperator] = useState('');
  const [opField, setOpField] = useState<OpField>('auto');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [renderLimit, setRenderLimit] = useState(300);

  const fetchAll = numOfRows === 0;

  const [data, setData] = useState<ChargerResponse | null>(null);
  const [mine, setMine] = useState<RegisteredCharger[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 마스터 캐시(DB) 관련
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [needsSync, setNeedsSync] = useState(false);
  const [syncedRegions, setSyncedRegions] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [statusOverlay, setStatusOverlay] = useState<
    Map<string, { stat?: string; statUpdDt?: string }>
  >(new Map());
  const [statusRefreshing, setStatusRefreshing] = useState(false);

  const cached = Boolean(data?.cached);

  useEffect(() => {
    fetchRegistrations().then(({ items }) => setMine(items));
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStatusOverlay(new Map());
    try {
      // 1) 마스터 캐시(DB) 우선 — 즉시 로드
      const cq = new URLSearchParams({ op: 'info', cache: '1' });
      if (zcode) cq.set('zcode', zcode);
      const cres = await fetch(`/api/chargers?${cq.toString()}`, { cache: 'no-store' });
      const cjson = (await cres.json()) as ChargerResponse & { error?: string };
      if (cres.ok && !cjson.needsSync && (cjson.items?.length ?? 0) > 0) {
        setData(cjson);
        setNeedsSync(false);
        setLastSyncAt(cjson.lastSyncAt ?? null);
        setSyncedRegions(cjson.syncedRegions ?? null);
        return;
      }

      // 2) 캐시 없음 → 실시간 조회(동기화 권장)
      setNeedsSync(true);
      setLastSyncAt(cjson?.lastSyncAt ?? null);
      setSyncedRegions(cjson?.syncedRegions ?? null);

      const lq = new URLSearchParams({ op: 'info' });
      if (zcode) lq.set('zcode', zcode);
      if (numOfRows === 0) {
        lq.set('all', '1');
      } else {
        lq.set('pageNo', String(pageNo));
        lq.set('numOfRows', String(numOfRows));
      }
      const lres = await fetch(`/api/chargers?${lq.toString()}`, { cache: 'no-store' });
      const ljson = await lres.json();
      if (!lres.ok) throw new Error(ljson?.error || `요청 실패 (HTTP ${lres.status})`);
      setData(ljson as ChargerResponse);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [zcode, pageNo, numOfRows]);

  // 지역별 DB 동기화 (전체 선택 시 전 지역 순차 동기화)
  const runSync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const targets = zcode ? [{ code: zcode, name: regionName(zcode) }] : REGIONS;
      let added = 0;
      let updated = 0;
      let total = 0;
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        setSyncMsg(
          targets.length > 1
            ? `전체 동기화 ${i + 1}/${targets.length} — ${t.name}…`
            : `${t.name} 동기화 중…`,
        );
        const res = await fetch(`/api/sync?zcode=${t.code}`, { method: 'POST' });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || `동기화 실패 (HTTP ${res.status})`);
        added += json.added ?? 0;
        updated += json.updated ?? 0;
        total = json.total ?? total;
      }
      setSyncMsg(
        `동기화 완료 · 신규 ${added.toLocaleString()} · 갱신 ${updated.toLocaleString()}`,
      );
      await fetchData();
    } catch (e) {
      setSyncMsg(null);
      setError(e instanceof Error ? e.message : '동기화에 실패했습니다.');
    } finally {
      setSyncing(false);
    }
  }, [zcode, fetchData]);

  // 실시간 상태 갱신 — 최근 변경분(period) 델타를 덧씌움
  const refreshStatus = useCallback(async () => {
    setStatusRefreshing(true);
    setError(null);
    try {
      const q = new URLSearchParams({ op: 'status', numOfRows: '1000', period: '10' });
      if (zcode) q.set('zcode', zcode);
      const res = await fetch(`/api/chargers?${q.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || '상태 조회 실패');
      const map = new Map<string, { stat?: string; statUpdDt?: string }>();
      for (const it of (json.items ?? []) as ChargerItem[]) {
        map.set(`${it.statId ?? ''}::${it.chgerId ?? ''}`, {
          stat: it.stat,
          statUpdDt: it.statUpdDt,
        });
      }
      setStatusOverlay(map);
      setSyncMsg(`실시간 상태 ${map.size.toLocaleString()}건 반영(최근 10분 변경분)`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '상태 갱신 실패');
    } finally {
      setStatusRefreshing(false);
    }
  }, [zcode]);

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
    let apiRows = (data?.items ?? []) as Row[];
    // 실시간 상태 델타 덧씌우기
    if (statusOverlay.size > 0) {
      apiRows = apiRows.map((r) => {
        const o = statusOverlay.get(`${r.statId ?? ''}::${r.chgerId ?? ''}`);
        return o ? { ...r, stat: o.stat ?? r.stat, statUpdDt: o.statUpdDt ?? r.statUpdDt } : r;
      });
    }
    // 자체 등록은 첫 페이지(또는 전체수집/캐시)에서 상단 노출
    const showMine = cached || fetchAll || pageNo === 1;
    return showMine ? [...mineRows, ...apiRows] : apiRows;
  }, [data, mineRows, pageNo, fetchAll, cached, statusOverlay]);

  const agg = useMemo(() => aggregate(rows, opField), [rows, opField]);

  // 같은 충전소(주소)로 묶은 현장 목록
  const stations = useMemo(() => groupByStation(rows, opField), [rows, opField]);

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

  // 운영기관 표기 기준이 바뀌면 선택된 운영기관 값이 달라지므로 초기화
  useEffect(() => {
    setOperator('');
  }, [opField]);

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
          <label htmlFor="opField">운영기관 표기</label>
          <select
            id="opField"
            value={opField}
            onChange={(e) => setOpField(e.target.value as OpField)}
          >
            <option value="auto">자동 (bnm→busiNm)</option>
            <option value="bnm">기관명 (bnm)</option>
            <option value="busiNm">사업자명 (busiNm)</option>
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

      <div className="card sync-bar">
        <div className="sync-info">
          {cached ? (
            <>
              <span className="badge badge-outline">🗄️ DB 캐시</span>
              <span className="muted">
                마지막 동기화 {lastSyncAt ? lastSyncAt.replace('T', ' ').slice(0, 16) : '-'}
                {syncedRegions ? ` · ${syncedRegions}개 지역` : ''}
              </span>
            </>
          ) : needsSync ? (
            <>
              <span className="badge" style={{ background: 'var(--warning)' }}>
                동기화 필요
              </span>
              <span className="muted">
                실시간 직접조회(느림) 중 · {zcode ? regionName(zcode) : '전체'} DB 동기화를 권장합니다
              </span>
            </>
          ) : (
            <span className="muted">실시간 조회</span>
          )}
          {syncMsg && <span className="muted">· {syncMsg}</span>}
        </div>
        <div className="sync-actions">
          <button
            className="btn btn-ghost"
            onClick={refreshStatus}
            disabled={statusRefreshing || syncing || loading}
          >
            {statusRefreshing ? '상태 갱신 중…' : '⟳ 실시간 상태 갱신'}
          </button>
          <button
            className="btn btn-primary"
            onClick={runSync}
            disabled={syncing || loading}
            title="공공데이터에서 현장/충전기 정보를 받아 서버 DB에 저장합니다."
          >
            {syncing ? '동기화 중…' : zcode ? `${regionName(zcode)} DB 동기화` : '전체 DB 동기화'}
          </button>
        </div>
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
                (search ? ` · 검색 "${search}"` : fetchAll || cached ? '' : ` · 페이지 ${pageNo}`)}
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
                    opField={opField}
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

      {view === 'list' && !cached && !fetchAll && !search && !operator && totalCount > pageSize && (
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
  opField,
}: {
  station: Station;
  open: boolean;
  onToggle: () => void;
  opField: OpField;
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
          <div className="station-raw">
            <span>
              사업자ID <b>{station.busiId ?? '-'}</b>
            </span>
            <span>
              busiNm(사업자명) <b>{station.rawBusiNm ?? '-'}</b>
            </span>
            <span>
              bnm(기관명) <b>{station.rawBnm ?? '-'}</b>
            </span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>충전기 ID</th>
                  <th>타입</th>
                  <th>용량</th>
                  <th>운영기관</th>
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
                      <td title={`busiNm: ${c.busiNm ?? '-'} / bnm: ${c.bnm ?? '-'}`}>
                        {resolveOperator(c, opField)}
                      </td>
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
  busiNm?: string; // 표시용 운영기관 라벨
  busiId?: string; // 원본 사업자ID
  rawBusiNm?: string; // 원본 busiNm
  rawBnm?: string; // 원본 bnm(기관명)
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

function groupByStation(rows: Row[], field: OpField): Station[] {
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
        busiNm: resolveOperator(r, field),
        busiId: r.busiId,
        rawBusiNm: r.busiNm,
        rawBnm: r.bnm,
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
    if ((s.busiNm === '미상' || !s.busiNm) && resolveOperator(r, field) !== '미상')
      s.busiNm = resolveOperator(r, field);
    if (!s.busiId && r.busiId) s.busiId = r.busiId;
    if (!s.rawBusiNm && r.busiNm) s.rawBusiNm = r.busiNm;
    if (!s.rawBnm && r.bnm) s.rawBnm = r.bnm;
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

function aggregate(rows: Row[], field: OpField): Agg {
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

    const op = resolveOperator(r, field);
    opMap.set(op, (opMap.get(op) ?? 0) + 1);
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
