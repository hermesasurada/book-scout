#!/bin/bash
# hermes 크론 진입 shim (참조본).
#
# hermes 크론 러너는 ~/.hermes/scripts/ 아래 스크립트만 실행하므로, 이 얇은
# 래퍼를 그 경로에 복사해 둔다:
#
#   cp ops/hermes-cron-shim.sh ~/.hermes/scripts/book_scout_daily.sh
#   chmod +x ~/.hermes/scripts/book_scout_daily.sh
#
# 그런 다음 hermes 게이트웨이(텔레그램 봇)로 "매일 오전 8시 book_scout_daily.sh
# 실행" 크론 잡을 등록한다. 크론 잡의 stdout(신규 재고/대출가능 도서 목록)이
# 텔레그램으로 전달되고, 신규 항목이 없으면 아무것도 보내지 않는다.
exec "$HOME/projects/book-scout/scripts/check-daily.sh"
