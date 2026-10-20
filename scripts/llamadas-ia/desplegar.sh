#!/usr/bin/env bash
# Copia el servicio de transcripción a la VM y lo reinicia. Correr desde la raíz del repo.
set -euo pipefail
VM="${VM:-santos@archivo-crm}"
LLAVE="${LLAVE:-$HOME/.ssh/archivo-crm_ed25519}"
APP=/opt/llamadas-ia/app
ssh -i "$LLAVE" "$VM" "mkdir -p $APP/scripts/llamadas-ia $APP/src/lib && ln -sfn /opt/crm-app/node_modules $APP/node_modules"
scp -i "$LLAVE" scripts/llamadas-ia/servicio.mts scripts/llamadas-ia/transcribir.py "$VM:$APP/scripts/llamadas-ia/"
scp -i "$LLAVE" src/lib/llamadas.ts "$VM:$APP/src/lib/"
ssh -i "$LLAVE" "$VM" "sudo sed -i 's#ExecStart=.*#ExecStart=/usr/bin/node $APP/scripts/llamadas-ia/servicio.mts#; s#WorkingDirectory=.*#WorkingDirectory=$APP#' /etc/systemd/system/llamadas-ia.service && sudo systemctl daemon-reload && sudo systemctl restart llamadas-ia && sleep 3 && systemctl is-active llamadas-ia && journalctl -u llamadas-ia -n 2 --no-pager"
