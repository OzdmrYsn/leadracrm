#!/bin/bash
# Yerel geliştirme veritabanı. Proje klasöründe (.pgdata) kendi Postgres kümesini tutar; sistemdeki
# başka veritabanlarına dokunmaz. Supabase projesi bağlanınca yalnız DATABASE_URL değişir.
#
#   bash scripts/db.sh ensure   .env.local yerel veritabanını gösteriyorsa başlatır; veritabanı yoksa kurar (npm run dev bunu çağırır)
#   bash scripts/db.sh start    kümeyi (yoksa kurup) başlatır
#   bash scripts/db.sh reset    veritabanını silip göçleri ve örnek veriyi baştan yükler
#   bash scripts/db.sh stop     kümeyi durdurur
#   bash scripts/db.sh psql     psql açar
#   bash scripts/db.sh url      bağlantı adresini yazar
set -u
export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$ROOT/.pgdata"
PORT="${YSC_DB_PORT:-54329}"
DB="ysccrm"
P="psql -X -h 127.0.0.1 -p $PORT -U postgres -v ON_ERROR_STOP=1"

running() { pg_ctl -D "$DATA" status >/dev/null 2>&1; }

start() {
  if [ ! -d "$DATA" ]; then
    initdb -D "$DATA" -U postgres --auth=trust --encoding=UTF8 --locale=C --locale-provider=libc >/dev/null || { echo "initdb failed"; exit 1; }
  fi
  if ! running; then
    pg_ctl -D "$DATA" -l "$DATA/server.log" -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -w start >/dev/null \
      || { echo "start failed"; tail -20 "$DATA/server.log"; exit 1; }
  fi
}

case "${1:-}" in
  ensure)
    # Yalnız yerel veritabanı kullanılıyorsa bir şey yapar; Supabase'e bağlı kurulumda sessizce geçer.
    grep -qs "^DATABASE_URL=.*127\.0\.0\.1:$PORT/" "$ROOT/.env.local" || exit 0
    command -v initdb >/dev/null 2>&1 || { echo "Yerel Postgres bulunamadı (initdb). Kurun ya da .env.local içinde DATABASE_URL'i bir Supabase projesine çevirin."; exit 0; }
    start
    if [ "$($P -d postgres -Atc "select 1 from pg_database where datname = '$DB'")" != "1" ]; then
      exec bash "$0" reset
    fi
    ;;
  start)
    start
    echo "postgres $($P -d postgres -Atc 'show server_version') on 127.0.0.1:$PORT"
    ;;
  stop)
    running && pg_ctl -D "$DATA" stop -m fast >/dev/null
    echo "stopped"
    ;;
  reset)
    start
    $P -d postgres -q -c "drop database if exists $DB with (force)" -c "create database $DB" || exit 1
    # Roller küme düzeyindedir; ikinci sıfırlamada zaten vardır.
    $P -d postgres -q -c "drop role if exists authenticated" -c "drop role if exists service_role" 2>/dev/null
    $P -d "$DB" -q -f "$ROOT/supabase/local/auth-stub.sql" || { echo "AUTH STUB FAILED"; exit 1; }
    for f in "$ROOT"/supabase/migrations/*.sql; do
      $P -d "$DB" -q -f "$f" || { echo "MIGRATION FAILED: $f"; exit 1; }
    done
    $P -d "$DB" -q -f "$ROOT/supabase/seed.sql" || { echo "SEED FAILED"; exit 1; }
    echo "database $DB ready: $($P -d "$DB" -Atc "select count(*) || ' leads, ' || (select count(*) from contacts) || ' contacts, ' || (select count(*) from messages) || ' messages' from leads")"
    ;;
  psql)
    start
    shift
    exec psql -X -h 127.0.0.1 -p "$PORT" -U postgres -d "$DB" "$@"
    ;;
  url)
    echo "postgres://postgres@127.0.0.1:$PORT/$DB"
    ;;
  *)
    echo "usage: bash scripts/db.sh ensure|start|reset|stop|psql|url"; exit 1
    ;;
esac
