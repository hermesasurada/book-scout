#!/bin/sh
set -eu

# 매일 08:00 (launchd com.bookscout.daily-check)
# 1. DB 백업
# 2. Gmail의 알라딘 구매 메일 동기화 — 새로 산 책은 관심도서에서 빠지므로 점검 전에 한다
# 3. 관심도서 재고·대출 점검
# 새 구매·새 재고/대출가능이 있으면 기존 hermes 발송기(`hermes send`)로 텔레그램에 보낸다.

HERMES="${HERMES_BIN:-$HOME/.hermes/hermes-agent/venv/bin/hermes}"
BASE=http://100.109.86.85:3000

# 점검이 DB를 바꾸기 전에 백업한다. 백업 실패는 점검을 막지 않는다.
"$(dirname "$0")/backup-db.sh" || echo "DB 백업 실패 — 점검은 계속 진행" >&2

message_of() {
  python3 -c 'import sys, json
try:
    print((json.load(sys.stdin).get("message") or "").strip())
except Exception:
    print("")
'
}

# Gmail 연동 전(412)이나 일시 오류여도 재고·대출 점검은 계속한다.
mail=$(curl -sS --max-time 600 -X POST -H 'content-type: application/json' -d '{"days":14}' "$BASE/api/import/gmail" | message_of) || mail=""

resp=$(curl -fsS --max-time 1800 -X POST \
  -H 'content-type: application/json' \
  -d '{"notify":true}' \
  "$BASE/api/checks")
checks=$(printf '%s' "$resp" | message_of)

msg=$(printf '%s\n\n%s' "$mail" "$checks" | sed -e '/./,$!d')
if [ -n "$(printf '%s' "$msg" | tr -d '[:space:]')" ]; then
  printf '%s\n' "$msg" | "$HERMES" send --to telegram --file -
fi
