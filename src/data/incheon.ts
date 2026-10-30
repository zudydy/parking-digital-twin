export const AIRPORT_URL = "https://www.airport.kr/ap_ko/964/subview.do";
export const FLOOR_IDS = ["ground", "b1", "b2"] as const;
export type FloorId = (typeof FLOOR_IDS)[number];
export interface AirportFloor {
  id: FloorId;
  name: string;
  available: number;
  occupancyPercent: number;
}
export interface AirportSnapshot {
  schemaVersion: 1;
  sourceUrl: string;
  sourceName: string;
  updatedAt: string;
  fetchedAt: string;
  floors: AirportFloor[];
}
export function parseAirportHtml(
  html: string,
  fetchedAt = new Date().toISOString(),
): AirportSnapshot {
  const date = html.match(
    /마지막 업데이트\s*:\s*(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}:\d{2}:\d{2})/,
  );
  if (!date) throw new Error("공식 페이지에서 갱신 시각을 찾지 못했습니다.");
  const matches = [
    ...html.matchAll(
      /class="num-txt"[\s\S]*?<span>([^<]+)<\/span>[\s\S]*?<strong[^>]*>([\s\S]*?)<\/strong>[\s\S]*?class="num-line[^>]*>[\s\S]*?width:\s*([\d.]+)%/g,
    ),
  ];
  const floors = FLOOR_IDS.map((id, index) => {
    const match = matches[index];
    if (!match) throw new Error("공식 주차 현황 형식이 변경되었습니다.");
    const text = match[2]!.replace(/\s+/g, " ").trim();
    const count = text.match(/([\d,]+)대\s*가능/);
    if (!count && !text.includes("만차"))
      throw new Error("잔여 주차 대수를 확인할 수 없습니다.");
    return {
      id,
      name: match[1]!.trim(),
      available: count ? Number(count[1]!.replaceAll(",", "")) : 0,
      occupancyPercent: Number(match[3]),
    };
  });
  return validateSnapshot({
    schemaVersion: 1,
    sourceUrl: AIRPORT_URL,
    sourceName: "인천국제공항공사 공식 주차장 혼잡도",
    updatedAt: `${date[1]}-${date[2]}-${date[3]}T${date[4]}+09:00`,
    fetchedAt,
    floors,
  });
}
export function validateSnapshot(value: unknown): AirportSnapshot {
  const s = value as AirportSnapshot;
  if (
    !s ||
    s.schemaVersion !== 1 ||
    s.sourceUrl !== AIRPORT_URL ||
    !Number.isFinite(Date.parse(s.updatedAt)) ||
    !Number.isFinite(Date.parse(s.fetchedAt)) ||
    !Array.isArray(s.floors) ||
    s.floors.length !== 3
  )
    throw new Error("인천공항 데이터 형식이 유효하지 않습니다.");
  for (const id of FLOOR_IDS) {
    const f = s.floors.find((f) => f.id === id);
    if (
      !f ||
      !Number.isSafeInteger(f.available) ||
      f.available < 0 ||
      !Number.isFinite(f.occupancyPercent) ||
      f.occupancyPercent < 0 ||
      f.occupancyPercent > 100
    )
      throw new Error("인천공항 층별 수치를 확인하세요.");
  }
  return s;
}
