#!/bin/zsh
set -eu

# 서버(상시 구동)와 매일 오전 8시 일일 점검을 launchd로 등록한다.
# 일일 점검(check-daily.sh)은 갱신 후 신규 재고/대출가능 도서를 `hermes send`로
# 텔레그램에 알린다 — 별도 크론 잡이나 토큰 없이 이 갱신 안에서 처리한다.

LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
mkdir -p "$LAUNCH_AGENTS"
cp /Users/yhandhs/projects/book-scout/ops/com.bookscout.server.plist "$LAUNCH_AGENTS/"
cp /Users/yhandhs/projects/book-scout/ops/com.bookscout.daily-check.plist "$LAUNCH_AGENTS/"

launchctl bootout "gui/$UID/com.bookscout.server" 2>/dev/null || true
launchctl bootout "gui/$UID/com.bookscout.daily-check" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$LAUNCH_AGENTS/com.bookscout.server.plist"
launchctl bootstrap "gui/$UID" "$LAUNCH_AGENTS/com.bookscout.daily-check.plist"

echo "책갈피 서버와 매일 오전 8시 점검(+텔레그램 알림)을 등록했습니다."
