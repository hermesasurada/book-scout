#!/bin/zsh
set -eu

LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
mkdir -p "$LAUNCH_AGENTS"
cp /Users/yhandhs/projects/book-scout/ops/com.bookscout.server.plist "$LAUNCH_AGENTS/"
cp /Users/yhandhs/projects/book-scout/ops/com.bookscout.daily-check.plist "$LAUNCH_AGENTS/"

launchctl bootout "gui/$UID/com.bookscout.server" 2>/dev/null || true
launchctl bootout "gui/$UID/com.bookscout.daily-check" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$LAUNCH_AGENTS/com.bookscout.server.plist"
launchctl bootstrap "gui/$UID" "$LAUNCH_AGENTS/com.bookscout.daily-check.plist"

echo "책갈피 서버와 매일 오전 8시 점검을 등록했습니다."
