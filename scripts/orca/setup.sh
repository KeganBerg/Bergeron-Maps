#!/usr/bin/env bash
# Starts a desktop with the Orca screen reader for the scripts in this folder (Ubuntu 24.04, as root).
# Then:  . /tmp/orca-desktop/env.sh && node scripts/orca/viewer.mjs   (from the repo root)
set -e
apt-get install -y --no-install-recommends orca at-spi2-core dbus-x11 python3-pyatspi xdotool xvfb >/dev/null
D=/tmp/orca-desktop; mkdir -p $D/run; chmod 700 $D/run
pgrep -x Xvfb >/dev/null || (Xvfb :99 -screen 0 1400x900x24 >$D/xvfb.log 2>&1 &)
sleep 1
dbus-launch --sh-syntax > $D/dbus.env
cat > $D/env.sh <<EOS
export DISPLAY=:99 XDG_RUNTIME_DIR=$D/run GTK_MODULES=gail:atk-bridge ACCESSIBILITY_ENABLED=1
. $D/dbus.env
EOS
. $D/env.sh
gsettings set org.gnome.desktop.interface toolkit-accessibility true
(/usr/libexec/at-spi-bus-launcher --launch-immediately >$D/atspi.log 2>&1 &)
echo "Desktop ready. Also start: npx vite --port 5174; the online app on 5175 (see playwright.config.ts); python3 -m http.server 8099 -d site"
