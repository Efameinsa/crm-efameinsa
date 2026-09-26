# Consumo de recursos: Vercel y Supabase (diagnóstico 26-09-2026)

Pedido de Santos (26-09): «analices si esta versión del crm está más optimizada
a nivel de consumo… para saber si vercel nos va a ir holgados o no… con el
tráfico web de las otras webs y aplicaciones».

## Lo que se midió

Facturación de Vercel del 18-09 al 25-09 (8 días, API `/v1/billing/charges`),
proyectada a 30 días a precio de lista:

| Concepto | 30 días | Quién |
|---|---|---|
| Minutos de build | ~$19 | CRM: 179 despliegues en 8,4 días (45 de ramas de prueba, 27 fallidos o cancelados) |
| Observability Plus (eventos) | ~$7,6 | 1,64 M de eventos del CRM en 8 días; crece con las funciones |
| CPU activa | ~$5,9 | 95 % CRM |
| Memoria | ~$2,1 | CRM |
| Invocaciones | ~$1,7 | 759 k del CRM en 8 días (~95 k/día); web 3,5 k, tienda 6,4 k, Educanet 45 k, admin 1 k |
| **Total** | **~$37,6** | El plan Pro incluye $20: sobraban ~$17,6 al mes |

Las otras webs no pesan: efameinsa-web, tienda, admin y Educanet juntas no
llegan al 8 % del uso. El CRM es casi todo.

Región: las funciones del CRM corren en `gru1` (São Paulo), al lado de la base
(`sa-east-1`). Es más caro por unidad que Virginia, pero cada consulta a la
base cuesta ~5 ms en vez de ~130: se queda.

Supabase (plan gratuito): base 120 MB de 500, archivos 262 MB de 1 GB.
Pedidos: ~60-90 k/día a Auth y ~120 k/día a la API. El tráfico saliente (5 GB
en el plan gratuito) no se puede leer por la API: mirarlo en el panel
(Organization → Usage).

## De dónde salían las funciones

Abrir una pantalla con la sesión de gerencia y quedarse 20 s:

| Pantalla | Pedidos al servidor antes | Después |
|---|---|---|
| /nuevo | 33 prefetch | 0 |
| /nuevo/clientes | 13 | 0 |
| /nuevo/ventas | 41 | 0 |
| /gerencia/supervision | 32 | 0 |
| /whatsapp | 25 | 0 |

Cada prefetch era una función que además verificaba la sesión contra Supabase
Auth (getUser en el proxy), leía el perfil y el comunicado. Por eso Auth
recibía tantos pedidos como Vercel funciones.

El chat de WhatsApp abierto llamaba a una acción del servidor cada 4 s: 900
funciones por hora por pestaña, con la conversación entera y la firma de
todos sus adjuntos cada vez.

## Lo que cambió (rama `optimizacion-recursos`)

1. `src/components/enlace.tsx`: todos los enlaces del CRM (menú incluido) ya no
   piden la pantalla al aparecer; la piden cuando el mouse se queda encima
   120 ms o el dedo la toca. El clic sigue siendo rápido.
2. `src/proxy.ts`: `getClaims()` en vez de `getUser()`. La firma del token se
   comprueba ahí mismo con la clave pública ES256, sin ir a Supabase Auth.
3. `src/lib/whatsapp-repaso-navegador.ts`: el chat se repasa desde el
   navegador, directo a la base y con las mismas reglas de seguridad. Primero
   pide solo id y estado; trae completos y firma solo los mensajes nuevos. Se
   pausa con la pestaña oculta. Cero funciones de Vercel.
4. `vercel.json`: solo `main` construye. Una rama se construye si se llama
   `vista-previa/…` o si el commit dice `[vista-previa]`. Tampoco construyen
   los commits que solo tocan `scripts/` o `supabase/`, además de docs.

## Pendiente de decidir

- **Observability Plus**: ~$7,6/mes. Si nadie mira los paneles de Vercel,
  apagarlo (Settings → Observability). Con menos funciones igual baja.
- **Despliegues**: los builds son el concepto más caro. La regla de las
  ventanas de 1 pm y 6 pm, cumplida, lo baja a la mitad.
- Mirar el tráfico saliente de Supabase en el panel antes de fin de mes.
