# Plan 26 · Trabajar sin internet: la oficina no se detiene

**Pedido por Santos, 31-08 (noche):** «la intención de usar PWA era para
trabajar bien en local… y cuando haya internet todo se actualice». Aprobó las
tres piezas y fijó: rango holgado porque entran dos vendedores más.

## Las decisiones de diseño (cerradas el 31-08)

1. **La reserva es PREVENTIVA, no reactiva.** Sin internet no se le puede
   pedir nada a Supabase, así que el rango se aparta por adelantado mientras
   SÍ hay internet: el coordinador renueva su despensa cada 5 minutos. Cuando
   el corte llega, los números ya están en la mano. Supabase no «detecta»
   nada: sencillamente salta los números reservados (mecanismo probado — el
   N.º 10 de Ariana, 0124).
2. **Rango: 40 números por serie** (EFAMEINSA y OPEN — «PRO» es el código de prospectos, no una serie de cotización). Cubre ~2 días del
   pico proyectado con 7 comerciales (hoy: promedio 11/día, pico 18 con 5).
3. **Vencimiento: 7 días.** Un número reservado y no usado vuelve solo a la
   nube — no se quema nada.
4. **Nada de Excel editable entre máquinas** (se corrompe y se pisa). El
   coordinador es UN proceso dueño del libro; exporta
   `correlativos-usados.csv` de solo lectura para ver quién usó qué.
5. **Cada usuario sube LO SUYO con SU sesión** al volver internet (la cola
   vive en su equipo). Así la RLS se respeta sola y nadie firma por otro.
6. **Lo que se ve sin conexión se marca**: chapa ámbar «sin subir» (pariente
   de la celeste «servidor»). Una pantalla vieja sin sello es una pantalla
   que miente.

## Las piezas

### Pieza 1 · El coordinador local (servidor de la oficina)
`scripts/coordinador-local.mjs` — hermano del servidor de archivos, mismo
estilo: Node puro, solo lectura del mundo, un secreto compartido.
- Mantiene la despensa: 40 números por serie, renovados vía RPC
  (`renovar_despensa_local`) mientras hay internet.
- `/correlativo` entrega el siguiente número de la serie pedida, atómico
  (un solo proceso = sin carreras), y lo anota en el libro (`.jsonl`) y en
  el CSV legible.
- Al reconectar: confirma usados (`confirmar_uso_local`) y suelta vencidos
  (`liberar_reservas_vencidas`).
- La 0138 parcha `siguiente_correlativo_anual` para que TAMBIÉN salte
  reservas (solo el de informes lo hacía) y crea las tres RPC con secreto.

### Pieza 2 · La cola en cada equipo (outbox)
- `src/lib/outbox-cliente.ts`: IndexedDB, guarda la gestión que no pudo
  llegar a Supabase; reintenta al evento `online` y al abrir la app.
- Primera integración: **registrar gestión/actividad** (lo más frecuente).
- La chapa ámbar «⏳ sin subir» en lo encolado; desaparece al subir.
- **2b (siguiente etapa): cotizar sin internet completo** — pide además el
  catálogo cacheado, el camino «emitir con número ya reservado» en el server
  action, y el PDF diferido («N.º X emitido · PDF al reconectar»).

### Pieza 3 · La app abre sin internet
- El service worker (v2) cachea el cascarón y una página `/offline` honesta:
  «Sin conexión — reintentando…» con reintento automático. Nada de datos de
  Supabase cacheados como si fueran frescos (la regla de siempre).
- Los documentos del servidor ya son 100 % locales: con internet caído
  siguen abriendo.

### Lo que NO cambia
- Emitir en línea sigue igual (el contador de la nube).
- Los documentos numerados emitidos offline usan SOLO números de la despensa.
- El histórico de decisiones del SW se conserva: la regla «no cachear datos
  que mienten» sigue viva; lo que cambió es el objetivo (Santos, 31-08 noche).

## Para el ingeniero de sistemas
El coordinador corre junto al servidor de archivos, con su propio puerto y
`COORDINADOR_SECRETO`. Instrucciones al final de las suyas; mismo patrón.

## Verificación por pieza
1. Reservar rango → el contador de la nube salta esos números → emitir en
   línea convive con emitir de la despensa → vencidos vuelven (transacción).
2. Outbox: gestión encolada sin red aparece con chapa, sube al volver, la
   chapa muere; dos reintentos no duplican (idempotencia por id local).
3. `/offline` responde desde caché con el fetch simulado caído.
