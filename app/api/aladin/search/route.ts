import { searchAladin } from "../../../../lib/providers";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return Response.json({ error: "검색어를 2자 이상 입력해주세요." }, { status: 400 });
  try {
    return Response.json({ books: await searchAladin(query) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "검색 중 오류가 발생했습니다." }, { status: 502 });
  }
}
