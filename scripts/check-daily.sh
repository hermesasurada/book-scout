#!/bin/sh
set -eu

curl -fsS -X POST \
  -H 'content-type: application/json' \
  -d '{}' \
  http://100.109.86.85:3000/api/checks
