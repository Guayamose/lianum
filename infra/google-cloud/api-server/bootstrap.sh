#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y --no-install-recommends caddy ca-certificates python3
id lianum >/dev/null 2>&1 || useradd --system --home-dir /var/lib/lianum-public-wallet --shell /usr/sbin/nologin lianum
install -d -m 0700 -o lianum -g lianum /var/lib/lianum-public-wallet
install -d -m 0755 /opt/lianum/releases
install -d -m 0750 -o root -g lianum /etc/lianum
# Deployment installs an immutable reviewed release and config before starting.
