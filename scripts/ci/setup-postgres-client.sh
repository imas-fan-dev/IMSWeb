#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_PATH:?This setup script requires a GitHub Actions runner}"

# The runner's default pg_dump can lag behind our PostgreSQL service image.
# Configure the official PGDG repository, including replacing older PGDG lists.
# https://www.postgresql.org/download/linux/ubuntu/
sudo rm -f /etc/apt/sources.list.d/google-chrome.list /etc/apt/sources.list.d/google-chrome.sources
if [[ ! -x /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh ]]; then
    sudo apt-get update
    sudo apt-get install --yes --no-install-recommends postgresql-common
fi
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
sudo apt-get install --yes --no-install-recommends postgresql-client-18

postgres_bin=/usr/lib/postgresql/18/bin
echo "$postgres_bin" >> "$GITHUB_PATH"
# GITHUB_PATH affects subsequent steps; use the same selection for this probe.
export PATH="$postgres_bin:$PATH"
for tool in pg_dump pg_restore; do
    [[ "$(command -v "$tool")" == "$postgres_bin/$tool" ]]
    "$tool" --version
    "$tool" --version | grep -Eq '\(PostgreSQL\) 18\.'
done
