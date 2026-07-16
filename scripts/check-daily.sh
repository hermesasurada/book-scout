#!/bin/sh
set -eu

# notify:true → 전일 대비 새로 재고/대출가능해진 책을 텔레그램으로 알림
curl -fsS -X POST \
  -H 'content-type: application/json' \
  -d '{"notify":true}' \
  http://100.109.86.85:3000/api/checks
