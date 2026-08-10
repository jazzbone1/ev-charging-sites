'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { REGIONS, regionName } from '@/lib/regions';
import { CHGER_TYPE, chgerTypeName, formatKstDate } from '@/lib/evcharger';
import {
  addRegistration,
  loadRegistrations,
  removeRegistration,
  type RegisteredCharger,
} from '@/lib/registrations';

interface FormState {
  statNm: string;
  addr: string;
  addrDetail: string;
  zcode: string;
  chgerType: string;
  output: string;
  busiNm: string;
  busiCall: string;
  useTime: string;
  parkingFree: string;
  lat: string;
  lng: string;
  note: string;
}

const EMPTY: FormState = {
  statNm: '',
  addr: '',
  addrDetail: '',
  zcode: '11',
  chgerType: '04',
  output: '',
  busiNm: '',
  busiCall: '',
  useTime: '24시간 이용가능',
  parkingFree: 'Y',
  lat: '',
  lng: '',
  note: '',
};

export default function RegisterPage() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [list, setList] = useState<RegisteredCharger[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  useEffect(() => {
    setList(loadRegistrations());
  }, []);

  const set = (key: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.statNm.trim()) next.statNm = '충전소명을 입력하세요.';
    if (!form.addr.trim()) next.addr = '주소를 입력하세요.';
    if (form.output && Number.isNaN(Number(form.output)))
      next.output = '숫자(kW)만 입력하세요.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const next = addRegistration({
      statNm: form.statNm.trim(),
      addr: form.addr.trim(),
      addrDetail: form.addrDetail.trim() || undefined,
      zcode: form.zcode,
      chgerType: form.chgerType,
      output: form.output.trim() || undefined,
      busiNm: form.busiNm.trim() || undefined,
      busiCall: form.busiCall.trim() || undefined,
      useTime: form.useTime.trim() || undefined,
      parkingFree: form.parkingFree,
      lat: form.lat.trim() || undefined,
      lng: form.lng.trim() || undefined,
      note: form.note.trim() || undefined,
    });
    setList(next);
    setForm({ ...EMPTY, zcode: form.zcode });
    setErrors({});
    setFlash(`"${next[0].statNm}" 충전기가 등록되었습니다.`);
    window.setTimeout(() => setFlash(null), 3500);
  };

  const onDelete = (id: string) => {
    setList(removeRegistration(id));
  };

  const typeOptions = useMemo(() => Object.entries(CHGER_TYPE), []);

  return (
    <>
      <div className="page-head">
        <h1>충전기 등록</h1>
        <p>
          신규 충전기 정보를 등록하면 설치현황 대시보드에 함께 표시됩니다. 등록 정보는 이
          브라우저에 저장됩니다.
        </p>
      </div>

      {flash && (
        <div className="alert alert-info" style={{ marginBottom: 18 }}>
          ✅ {flash}
        </div>
      )}

      <div className="card card-pad" style={{ marginBottom: 28 }}>
        <form onSubmit={onSubmit} noValidate>
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="statNm">
                충전소명<span className="req">*</span>
              </label>
              <input
                id="statNm"
                type="text"
                value={form.statNm}
                onChange={set('statNm')}
                placeholder="예) 유니커넥트 본사 지하주차장"
              />
              {errors.statNm && <span className="field-hint" style={{ color: 'var(--danger)' }}>{errors.statNm}</span>}
            </div>

            <div className="field">
              <label htmlFor="zcode">시·도</label>
              <select id="zcode" value={form.zcode} onChange={set('zcode')}>
                {REGIONS.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="chgerType">충전기 타입</label>
              <select id="chgerType" value={form.chgerType} onChange={set('chgerType')}>
                {typeOptions.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name} ({code})
                  </option>
                ))}
              </select>
            </div>

            <div className="field full">
              <label htmlFor="addr">
                주소<span className="req">*</span>
              </label>
              <input
                id="addr"
                type="text"
                value={form.addr}
                onChange={set('addr')}
                placeholder="예) 서울특별시 강남구 테헤란로 123"
              />
              {errors.addr && <span className="field-hint" style={{ color: 'var(--danger)' }}>{errors.addr}</span>}
            </div>

            <div className="field full">
              <label htmlFor="addrDetail">상세위치</label>
              <input
                id="addrDetail"
                type="text"
                value={form.addrDetail}
                onChange={set('addrDetail')}
                placeholder="예) 지하 2층 B구역 3번"
              />
            </div>

            <div className="field">
              <label htmlFor="output">충전용량 (kW)</label>
              <input
                id="output"
                type="number"
                value={form.output}
                onChange={set('output')}
                placeholder="예) 100"
                min="0"
              />
              {errors.output && <span className="field-hint" style={{ color: 'var(--danger)' }}>{errors.output}</span>}
            </div>
            <div className="field">
              <label htmlFor="parkingFree">주차료</label>
              <select id="parkingFree" value={form.parkingFree} onChange={set('parkingFree')}>
                <option value="Y">무료</option>
                <option value="N">유료</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="busiNm">운영기관</label>
              <input
                id="busiNm"
                type="text"
                value={form.busiNm}
                onChange={set('busiNm')}
                placeholder="예) 유니커넥트"
              />
            </div>
            <div className="field">
              <label htmlFor="busiCall">연락처</label>
              <input
                id="busiCall"
                type="tel"
                value={form.busiCall}
                onChange={set('busiCall')}
                placeholder="예) 1600-0000"
              />
            </div>

            <div className="field">
              <label htmlFor="useTime">이용가능시간</label>
              <input id="useTime" type="text" value={form.useTime} onChange={set('useTime')} />
            </div>
            <div className="field">
              <label htmlFor="latlng">위도 / 경도</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="latlng"
                  type="text"
                  value={form.lat}
                  onChange={set('lat')}
                  placeholder="위도"
                />
                <input type="text" value={form.lng} onChange={set('lng')} placeholder="경도" />
              </div>
            </div>

            <div className="field full">
              <label htmlFor="note">안내사항</label>
              <textarea
                id="note"
                value={form.note}
                onChange={set('note')}
                placeholder="예) 방문 전 예약 필요, 완속 2기 / 급속 1기 운영"
              />
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              충전기 등록
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setForm(EMPTY);
                setErrors({});
              }}
            >
              초기화
            </button>
          </div>
        </form>
      </div>

      <div className="section-title">
        <h2>등록한 충전기 ({list.length})</h2>
        <Link className="btn btn-ghost" href="/">
          설치현황 보기 →
        </Link>
      </div>

      <div className="card">
        {list.length === 0 ? (
          <div className="empty">
            <div className="emoji">📝</div>
            <p>아직 등록한 충전기가 없습니다. 위 양식으로 첫 충전기를 등록해 보세요.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>충전소 / 주소</th>
                  <th>지역</th>
                  <th>타입</th>
                  <th>용량</th>
                  <th>운영기관</th>
                  <th>등록일</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="cell-name">{r.statNm}</div>
                      <div className="cell-sub">
                        {[r.addr, r.addrDetail].filter(Boolean).join(' ')}
                      </div>
                    </td>
                    <td>{regionName(r.zcode)}</td>
                    <td>{chgerTypeName(r.chgerType)}</td>
                    <td>{r.output ? `${r.output}kW` : '-'}</td>
                    <td>{r.busiNm ?? '-'}</td>
                    <td className="cell-sub">{formatKstDate(r.createdAt.replace(/[-:T]/g, '').slice(0, 14))}</td>
                    <td>
                      <button className="btn btn-danger" onClick={() => onDelete(r.id)}>
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
