#!/bin/sh
set -eu

# D1 로컬 sqlite를 날짜별로 백업한다. 독서 기록·구매 이력은 다시 만들 수 없는
# 데이터라 일일 점검(데이터 변경) 직전에 실행한다.
# - sqlite3 .backup으로 서버 구동 중에도 일관된 사본을 만든다(WAL 포함).
# - 30일이 지난 일일 백업은 지우고, 매월 1일 백업은 계속 보관한다.

ROOT=/Users/yhandhs/projects/book-scout
STATE="$ROOT/.wrangler/state/v3/d1/miniflare-D1DatabaseObject"
ICLOUD="$HOME/Library/Mobile Documents/com~apple~CloudDocs"
DEST="${BOOKSCOUT_BACKUP_DIR:-}"
if [ -z "$DEST" ]; then
  if [ -d "$ICLOUD" ]; then DEST="$ICLOUD/book-scout-backups"; else DEST="$ROOT/backups"; fi
fi
mkdir -p "$DEST"

db=$(find "$STATE" -maxdepth 1 -name '*.sqlite' ! -name 'metadata.sqlite' | head -1)
if [ -z "$db" ]; then
  echo "백업할 DB를 찾지 못했습니다: $STATE" >&2
  exit 1
fi

stamp=$(date +%Y%m%d-%H%M%S)
tmp="$DEST/.book-scout-$stamp.sqlite"
sqlite3 "$db" ".backup '$tmp'"
# 원본의 WAL 모드가 사본에 따라오므로 단일 파일로 되돌린 뒤 검사한다.
sqlite3 "$tmp" 'PRAGMA journal_mode=DELETE;' >/dev/null
if [ "$(sqlite3 "$tmp" 'PRAGMA integrity_check;')" != "ok" ]; then
  rm -f "$tmp"
  echo "백업 무결성 검사 실패" >&2
  exit 1
fi
rm -f "$tmp-shm" "$tmp-wal"
gzip -9 "$tmp"
mv "$tmp.gz" "$DEST/book-scout-$stamp.sqlite.gz"

# 30일 지난 일일 백업 정리 (매월 1일자는 보관)
find "$DEST" -maxdepth 1 -name 'book-scout-*.sqlite.gz' -mtime +30 ! -name 'book-scout-????[0-1][0-9]01-*' -delete

echo "백업 완료: $DEST/book-scout-$stamp.sqlite.gz"
