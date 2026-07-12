import { env } from "cloudflare:workers";
import { searchAladin } from "../../../../lib/providers";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return Response.json({ error: "검색어를 2자 이상 입력해주세요." }, { status: 400 });
  const key = (env as unknown as { ALADIN_TTB_KEY?: string }).ALADIN_TTB_KEY;
  if (!key) return Response.json({ error: "알라딘 TTB Key 설정이 필요합니다.", code: "ALADIN_KEY_MISSING" }, { status: 503 });
  try {
    return Response.json({ books: await searchAladin(query, key) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "검색 중 오류가 발생했습니다." }, { status: 502 });
  }
}
