# 책갈피 (book-scout)

개인용 독서 관리 사이트. 독서 기록·문장 수집·보유 도서(알라딘 구매 메일
자동 등록)·독서 패턴 통계를 관리하고, 관심도서의 알라딘 중고매장 재고·도서관 대출 가능 여부를 매일
확인한다. 운영 원칙은 [AGENTS.md](AGENTS.md).

## 구성

- 런타임: [vinext](https://github.com/cloudflare/vinext) (Next.js App Router on Workers) + Cloudflare D1(로컬 sqlite) + Drizzle
- 서비스: launchd `com.bookscout.server`(상시), `com.bookscout.daily-check`(매일 08:00) — `scripts/install-local-service.sh`
- 접속: Tailscale `http://yhandhs-macmini.tailb55988.ts.net:3000` 또는 `http://100.109.86.85:3000` (localhost에는 바인딩하지 않음)

## 데이터

- DB 파일: `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite`
- 스키마는 `db/index.ts`의 마이그레이션 목록이 서버 기동 시 한 번씩 적용한다.
  `drizzle/`는 타입 생성용 기록이며 런타임에 적용되지 않는다.
- 백업: 일일 점검 직전에 `scripts/backup-db.sh`가 iCloud Drive `book-scout-backups/`에 날짜별 사본을 남긴다.
  수동 실행은 `npm run db:backup`. 전체 데이터 JSON은 `GET /api/export`.

## 명령

- `npm run dev` — 개발 서버
- `npm run lint` / `npm test` (`npm run test:unit` — 파서·통계 단위 테스트)
- `npm run check:daily` — 일일 점검 수동 실행
- `npm run db:backup` — DB 백업
- `npm run db:generate` — 스키마 변경 후 Drizzle 기록 생성
- `node scripts/gmail-auth.mjs` — Gmail 읽기 전용 연동(최초 1회, `.dev.vars.example` 참고)
