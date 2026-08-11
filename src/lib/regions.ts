// 한국환경공단 EvCharger API 의 시도 코드(zcode) 매핑
export interface Region {
  code: string;
  name: string;
}

export const REGIONS: Region[] = [
  { code: '11', name: '서울특별시' },
  { code: '26', name: '부산광역시' },
  { code: '27', name: '대구광역시' },
  { code: '28', name: '인천광역시' },
  { code: '29', name: '광주광역시' },
  { code: '30', name: '대전광역시' },
  { code: '31', name: '울산광역시' },
  { code: '36', name: '세종특별자치시' },
  { code: '41', name: '경기도' },
  { code: '42', name: '강원특별자치도' },
  { code: '43', name: '충청북도' },
  { code: '44', name: '충청남도' },
  { code: '45', name: '전라북도' },
  { code: '46', name: '전라남도' },
  { code: '47', name: '경상북도' },
  { code: '48', name: '경상남도' },
  { code: '50', name: '제주특별자치도' },
];

export const REGION_MAP: Record<string, string> = Object.fromEntries(
  REGIONS.map((r) => [r.code, r.name]),
);

export function regionName(code?: string): string {
  if (!code) return '전체';
  return REGION_MAP[code] ?? code;
}
