#!/usr/bin/env bash
set -euo pipefail

: "${PUID:=99}"
: "${PGID:=100}"
: "${TZ:=UTC}"
: "${UMASK:=022}"
: "${VEIL_DATA_DIR:=/config}"
: "${APP_BIND_ADDR:=:3847}"
: "${COOKIE_SECURE:=false}"

if [[ -z "${DATABASE_PATH:-}" ]]; then
  export DATABASE_PATH="${VEIL_DATA_DIR%/}/veil.db"
fi

# Best-effort timezone setup.
if [[ -f "/usr/share/zoneinfo/${TZ}" ]]; then
  ln -snf "/usr/share/zoneinfo/${TZ}" /etc/localtime
  echo "${TZ}" > /etc/timezone
fi

mkdir -p "${VEIL_DATA_DIR}" "$(dirname "${DATABASE_PATH}")"

touch "${DATABASE_PATH}"
chown -R "${PUID}:${PGID}" "${VEIL_DATA_DIR}" "$(dirname "${DATABASE_PATH}")"

umask "${UMASK}"

exec gosu "${PUID}:${PGID}" /usr/local/bin/veil-server
