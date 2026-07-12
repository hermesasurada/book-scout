#!/bin/zsh
set -eu

cd /Users/yhandhs/projects/book-scout
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
exec npm run dev -- --hostname 100.109.86.85
