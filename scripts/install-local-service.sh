#!/bin/zsh
set -eu

# 서버(상시 구동)만 launchd로 등록한다. 일일 점검은 hermes 크론이 담당한다
# (~/.hermes/scripts/book_scout_daily.sh shim → scripts/check-daily.sh).
# 크론 등록/변경은 hermes 게이트웨이(텔레그램 봇)로만 한다. 자세한 건 README 참고.

LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
mkdir -p "$LAUNCH_AGENTS"
cp /Users/yhandhs/projects/book-scout/ops/com.bookscout.server.plist "$LAUNCH_AGENTS/"

launchctl bootout "gui/$UID/com.bookscout.server" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$LAUNCH_AGENTS/com.bookscout.server.plist"

echo "책갈피 서버를 등록했습니다. 일일 점검·알림은 hermes 크론(book_scout_daily.sh)으로 등록하세요."
