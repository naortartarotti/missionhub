#!/bin/sh
# N3 (BR-9, PD-074 Q-PM-1): turns `deemed_agreement_enabled` on or off on the LOCAL database only, for development.
# It is false in every environment by default; production stays off until counsel Q-1 and N10 acceptance.
# Usage: scripts/set-deemed-flag.sh on|off
set -eu
case "${1:-}" in on) v=true ;; off) v=false ;; *) echo "usage: $0 on|off" >&2; exit 2 ;; esac
url="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:55322/postgres}"
case "$url" in *@127.0.0.1:*|*@localhost:*) ;; *) echo "refused: not a local database" >&2; exit 2 ;; esac
psql "$url" -v ON_ERROR_STOP=1 -qAt -c "update app.platform_settings set value = '$v'::jsonb where key = 'deemed_agreement_enabled' returning key || ' = ' || value"
