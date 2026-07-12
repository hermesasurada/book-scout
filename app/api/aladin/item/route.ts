import { env } from "cloudflare:workers";
import { lookupAladinDetail } from "../../../../lib/providers";

export async function GET(request: Request) {
  const isbn = new URL(request.url).searchParams.get("isbn")?.trim() ?? "";
  if (!/^\d{13}$/.test(isbn)) return Response.json({ error: "ISBN이 올바르지 않습니다." }, { status: 400 });
  const key = (env as unknown as { ALADIN_TTB_KEY?: string }).ALADIN_TTB_KEY;
  if (!key) return Response.json({ error: "알라딘 TTB Key 설정이 필요합니다.", code: "ALADIN_KEY_MISSING" }, { status: 503 });
  try {
    const detail = await lookupAladinDetail(isbn, key);
    if (!detail) return Response.json({ error: "알라딘에서 도서 정보를 찾지 못했습니다." }, { status: 404 });
    return Response.json({ detail });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "정보를 불러오지 못했습니다." }, { status: 502 });
  }
}
