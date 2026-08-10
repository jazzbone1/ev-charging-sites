'use client';

import { useEffect, useRef, useState } from 'react';

export interface MapPoint {
  lat: number;
  lng: number;
  name: string;
  addr?: string;
  statLabel?: string;
  statColor?: string;
  mine?: boolean;
}

interface Props {
  points: MapPoint[];
  height?: number;
}

// Kakao Maps SDK 를 한 번만 로드
let kakaoLoader: Promise<any> | null = null;
function loadKakao(key: string): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  const w = window as any;
  if (w.kakao?.maps) return Promise.resolve(w.kakao);
  if (kakaoLoader) return kakaoLoader;
  kakaoLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false`;
    script.async = true;
    script.onload = () => {
      try {
        w.kakao.maps.load(() => resolve(w.kakao));
      } catch (e) {
        reject(e);
      }
    };
    script.onerror = () => {
      kakaoLoader = null;
      reject(new Error('Kakao Maps SDK 로드 실패'));
    };
    document.head.appendChild(script);
  });
  return kakaoLoader;
}

const MAX_MARKERS = 500;

export default function ChargerMap({ points, height = 460 }: Props) {
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const valid = points.filter(
    (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat !== 0 && p.lng !== 0,
  );
  const shown = valid.slice(0, MAX_MARKERS);

  // 맵 초기화
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    loadKakao(key)
      .then((kakao) => {
        if (cancelled || !containerRef.current) return;
        const center = new kakao.maps.LatLng(36.5, 127.8); // 대한민국 중심 근처
        mapRef.current = new kakao.maps.Map(containerRef.current, {
          center,
          level: 12,
        });
        infoRef.current = new kakao.maps.InfoWindow({ removable: true });
        setReady(true);
      })
      .catch((e) => setError(e instanceof Error ? e.message : '지도를 불러오지 못했습니다.'));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // 마커 갱신
  useEffect(() => {
    if (!ready || !key) return;
    const w = window as any;
    const kakao = w.kakao;
    const map = mapRef.current;
    if (!kakao || !map) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    if (shown.length === 0) return;

    const bounds = new kakao.maps.LatLngBounds();
    shown.forEach((p) => {
      const pos = new kakao.maps.LatLng(p.lat, p.lng);
      const marker = new kakao.maps.Marker({ position: pos, map });
      const badge = p.statLabel
        ? `<span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:11px;color:#fff;background:${
            p.statColor || '#6b7280'
          }">${escapeHtml(p.statLabel)}</span>`
        : '';
      const mineTag = p.mine
        ? '<span style="display:inline-block;padding:1px 6px;border-radius:6px;font-size:11px;color:#2563eb;background:#e0edff;margin-left:4px">자체등록</span>'
        : '';
      const html = `<div style="padding:8px 10px;min-width:160px;max-width:240px;font-size:12px;line-height:1.5;color:#1a2233">
          <div style="font-weight:700;margin-bottom:2px">${escapeHtml(p.name)}${mineTag}</div>
          ${p.addr ? `<div style="color:#5b6675">${escapeHtml(p.addr)}</div>` : ''}
          ${badge ? `<div style="margin-top:4px">${badge}</div>` : ''}
        </div>`;
      kakao.maps.event.addListener(marker, 'click', () => {
        infoRef.current.setContent(html);
        infoRef.current.open(map, marker);
      });
      markersRef.current.push(marker);
      bounds.extend(pos);
    });
    map.setBounds(bounds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key, JSON.stringify(shown.map((p) => [p.lat, p.lng, p.name]))]);

  if (!key) {
    return (
      <div className="map-placeholder" style={{ height }}>
        <div className="emoji">🗺️</div>
        <p style={{ fontWeight: 700, margin: '6px 0' }}>지도를 표시하려면 카카오맵 키가 필요합니다.</p>
        <p className="field-hint" style={{ maxWidth: 460 }}>
          <a
            href="https://developers.kakao.com/"
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--accent)', textDecoration: 'underline' }}
          >
            카카오 개발자 콘솔
          </a>
          에서 JavaScript 앱 키를 발급받아 환경변수{' '}
          <code>NEXT_PUBLIC_KAKAO_MAP_KEY</code> 로 설정하세요. (플랫폼 &gt; Web 사이트 도메인 등록
          필요)
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="map-placeholder" style={{ height }}>
        <div className="emoji">⚠️</div>
        <p style={{ fontWeight: 700 }}>{error}</p>
        <p className="field-hint">카카오 콘솔에 현재 도메인이 등록되어 있는지 확인하세요.</p>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height, borderRadius: 12 }} />
      <div className="map-meta">
        지도 표시 {shown.length.toLocaleString()}개
        {valid.length > MAX_MARKERS ? ` (좌표 보유 ${valid.length.toLocaleString()}개 중 상위 ${MAX_MARKERS})` : ''}
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
