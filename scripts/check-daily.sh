#!/bin/sh
set -eu

# 일일 점검을 실행하고, 전일 대비 새로 재고/대출가능해진 책 목록을 stdout으로
# 출력한다. hermes 크론이 이 stdout을 받아 텔레그램으로 전송한다 (다른 hermes
# 프로젝트와 동일한 방식). 신규 항목이 없으면 아무것도 출력하지 않는다.
resp=$(curl -fsS -X POST \
  -H 'content-type: application/json' \
  -d '{"notify":true}' \
  http://100.109.86.85:3000/api/checks)

printf '%s' "$resp" | python3 -c 'import sys, json
msg = (json.load(sys.stdin).get("message") or "").strip()
if msg:
    print(msg)
'
