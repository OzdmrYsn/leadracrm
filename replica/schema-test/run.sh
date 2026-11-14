#!/bin/bash
# Göç dosyalarını (supabase/migrations) geçici bir yerel Postgres kümesine yükler ve denetimleri çalıştırır.
# Kullanım: bash replica/schema-test/run.sh   (Postgres 15+ gerekir: initdb, pg_ctl, psql)
set -u
export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PORT="${PGTEST_PORT:-54391}"
WORK="$(mktemp -d)"
DATA="$WORK/pgdata"
LOG="$WORK/pg.log"

initdb -D "$DATA" -U postgres --auth=trust --encoding=UTF8 --locale=C --locale-provider=libc >/dev/null || { echo "initdb failed"; exit 1; }
pg_ctl -D "$DATA" -l "$LOG" -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -w start >/dev/null || { echo "start failed"; tail -20 "$LOG"; exit 1; }
trap 'pg_ctl -D "$DATA" stop -m immediate >/dev/null 2>&1; rm -rf "$WORK"' EXIT

P="psql -X -h 127.0.0.1 -p $PORT -U postgres -d postgres -v ON_ERROR_STOP=1"
echo "== postgres $($P -Atc 'show server_version')"
$P -q -f "$ROOT/supabase/local/auth-stub.sql" || { echo "STUB FAILED"; exit 1; }
for f in "$ROOT"/supabase/migrations/*.sql; do
  $P -q -f "$f" || { echo "MIGRATION FAILED: $f"; exit 1; }
done
echo "== schema loaded"
$P -f "$HERE/test.sql" || { echo "TESTS FAILED"; exit 1; }
echo "== all tests passed"
