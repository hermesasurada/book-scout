#!/bin/sh
set -eu

# 일일 점검을 실행하고, 전일 대비 새로 재고/대출가능해진 책이 있으면 그 목록을
# 기존 hermes 발송기(`hermes send`)로 텔레그램(기본 대상: 내 DM)에 보낸다.
# 별도 크론 잡·토큰 없이 이 일일 갱신 안에서 알림까지 처리한다.

HERMES="${HERMES_BIN:-$HOME/.hermes/hermes-agent/venv/bin/hermes}"

resp=$(curl -fsS --max-time 1800 -X POST \
  -H 'content-type: application/json' \
  -d '{"notify":true}' \
  http://100.109.86.85:3000/api/checks)

msg=$(printf '%s' "$resp" | python3 -c 'import sys, json
print((json.load(sys.stdin).get("message") or "").strip())
')

# 신규 항목이 있을 때만 발송 (없으면 조용)
if [ -n "$msg" ]; then
  printf '%s\n' "$msg" | "$HERMES" send --to telegram --file -
fi
