#!/bin/sh
set -eu

# 매일 08:00 (launchd com.bookscout.daily-check)
# 1. DB 백업
# 2. Gmail의 알라딘 구매 메일 동기화 — 새로 산 책은 관심도서에서 빠지므로 점검 전에 한다
# 3. 관심도서 재고·대출 점검
# 알림은 보내지 않는다(텔레그램 알림 제거, 사용자 결정).

BASE=http://100.109.86.85:3000

# 점검이 DB를 바꾸기 전에 백업한다. 백업 실패는 점검을 막지 않는다.
"$(dirname "$0")/backup-db.sh" || echo "DB 백업 실패 — 점검은 계속 진행" >&2

# Gmail 연동 전(412)이나 일시 오류여도 재고·대출 점검은 계속한다.
curl -sS --max-time 600 -X POST -H 'content-type: application/json' -d '{"days":14}' "$BASE/api/import/gmail" >/dev/null || true

curl -fsS --max-time 1800 -X POST -H 'content-type: application/json' -d '{}' "$BASE/api/checks" >/dev/null
