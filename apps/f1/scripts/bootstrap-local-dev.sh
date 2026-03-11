#!/usr/bin/env bash

set -euo pipefail

TARGET_DIR="${F1_LOCAL_SHARED_DIR:-$HOME/Code/Calcutta-App-local/f1}"
TARGET_ENV="${F1_SHARED_ENV_PATH:-$TARGET_DIR/f1.local.env}"
TARGET_DB="${F1_SHARED_DB_PATH:-$TARGET_DIR/f1-calcutta-local-dev.db}"

SOURCE_ENV="${SOURCE_ENV:-$HOME/Code/Calcutta-App/.env}"
SOURCE_DB="${SOURCE_DB:-$HOME/Code/Calcutta-App/apps/f1/server/f1-calcutta-local-dev.db}"

mkdir -p "$TARGET_DIR"

sanitize_env_file() {
  local input_path="$1"
  local output_path="$2"

  awk '
    /^[[:space:]]*(F1_PORT|PORT|DB_PATH|F1_SHARED_ENV_PATH|F1_SHARED_DB_PATH|F1_LOCAL_SHARED_DIR)=/ { next }
    { print }
  ' "$input_path" > "$output_path"
}

if [[ -f "$SOURCE_ENV" && ! -f "$TARGET_ENV" ]]; then
  cp "$SOURCE_ENV" "$TARGET_ENV"
  echo "Seeded shared env: $TARGET_ENV"
fi

if [[ -f "$TARGET_ENV" ]]; then
  tmp_env="$(mktemp)"
  sanitize_env_file "$TARGET_ENV" "$tmp_env"
  mv "$tmp_env" "$TARGET_ENV"
elif [[ -f "$SOURCE_ENV" ]]; then
  tmp_env="$(mktemp)"
  sanitize_env_file "$SOURCE_ENV" "$tmp_env"
  mv "$tmp_env" "$TARGET_ENV"
  echo "Seeded shared env: $TARGET_ENV"
fi

if [[ -f "$SOURCE_DB" && ! -f "$TARGET_DB" ]]; then
  cp "$SOURCE_DB" "$TARGET_DB"
  [[ -f "${SOURCE_DB}-shm" ]] && cp "${SOURCE_DB}-shm" "${TARGET_DB}-shm"
  [[ -f "${SOURCE_DB}-wal" ]] && cp "${SOURCE_DB}-wal" "${TARGET_DB}-wal"
  echo "Seeded shared DB: $TARGET_DB"
fi

echo "Shared local F1 dir: $TARGET_DIR"
echo "Shared env path: $TARGET_ENV"
echo "Shared DB path: $TARGET_DB"
