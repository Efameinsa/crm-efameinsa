# Migración a crm.efameinsa.com

**Estado al 24-08-2026, 08:50.** El CNAME ya está creado y correcto:

```
crm.efameinsa.com  CNAME  cname.vercel-dns.com  →  66.33.60.130 / 76.76.21.61
```

Pero el dominio **todavía no está añadido al proyecto en Vercel**: por HTTPS no
responde (no hay certificado) y por HTTP el edge de Vercel devuelve 404, que es
lo que pasa cuando un hostname llega a Vercel sin proyecto asociado.

## La buena noticia: el sistema es casi todo agnóstico del dominio

Se auditó entero antes de tocar nada. **No hace falta cambiar nada** en:

| Pieza | Por qué no se entera del cambio |
|---|---|
| Proxy de autenticación (`src/proxy.ts`) | Redirige con `request.nextUrl.clone()` — siempre relativo al host que entró |
| Service worker / push (`public/sw.js`) | Usa `self.location.origin` y URLs relativas |
| PDFs del archivo (R2) | El servidor firma la URL y hace de intermediario; el navegador nunca habla con R2, así que no hay CORS que ajustar |
| Adjuntos (Supabase Storage) | Mismo patrón: URL firmada desde el servidor |
| Supabase Auth | **El login es por contraseña.** No hay magic link, ni "olvidé mi clave", ni invitación por correo en la app — o sea que las *Redirect URLs* y el *Site URL* de Supabase no intervienen en nada que usen los comerciales |
| Cotizaciones e informes en PDF | Rutas relativas + assets del repo |
| Cron de Vercel (`vercel.json`) | Invoca por ruta, no por dominio |

Lo único que necesitaba una URL absoluta eran **los enlaces dentro de los correos
que n8n manda a Central** ("ver la bandeja"). Estaban quemados como
`https://crm-efameinsa.vercel.app/central` en dos archivos. Ahora salen de
`src/lib/url-app.ts`, que resuelve en este orden:

1. `APP_URL` (si algún día hace falta forzarla)
2. `VERCEL_PROJECT_PRODUCTION_URL` — **la pone Vercel sola** y apunta al dominio
   de producción del proyecto
3. `https://crm.efameinsa.com`

Es decir: **en cuanto crm.efameinsa.com quede como dominio principal en Vercel,
los enlaces de los correos migran solos, sin tocar código ni variables.**

---

## 1. Lo que tienes que hacer tú (Vercel) — 2 minutos

No lo puedo hacer yo: la cuenta de Vercel conectada acá es tu cuenta personal
(`dsva97`) y el CRM vive en la corporativa (`corporacionefameinsa.sa@gmail.com`),
donde el proyecto `crm-efameinsa` no aparece.

1. Entrar a Vercel con **corporacionefameinsa.sa@gmail.com**
2. Proyecto `crm-efameinsa` → **Settings → Domains → Add**
3. Escribir `crm.efameinsa.com` y confirmar. Vercel detecta el CNAME ya puesto y
   emite el certificado solo (suele tardar menos de un minuto)
4. **Marcarlo como dominio de producción** (el menú `⋯` del dominio → *Set as
   Production Domain*). Este paso es el que hace que los enlaces de los correos
   migren solos — sin él el sistema funciona igual, pero los correos seguirían
   enlazando al `.vercel.app`
5. Opcional: dejar `crm-efameinsa.vercel.app` **redirigiendo** a
   `crm.efameinsa.com`, para que quien tenga el enlace viejo guardado acabe en
   el nuevo

**No hay que tocar variables de entorno en Vercel.** Ninguna guarda el dominio.

> **24-08:** este paso se hizo y Vercel respondió *Verification Required*. Seguir en 1b.

## 1b. Si Vercel dice «Verification Required» (es lo que pasó el 24-08)

Añadir el dominio devolvió **Verification Required**. Comprobado por DNS: **no
existe ningún TXT** en `_vercel.crm.efameinsa.com` ni en `_vercel.efameinsa.com`.

**Qué significa:** el dominio ya está reclamado en **otra cuenta de Vercel**, y
Vercel exige demostrar que es nuestro antes de dejarlo usar. No es un error de
configuración del CNAME — ese está bien.

Se descartó que sea la cuenta personal de Darwin (`dsva97`): sus 32 proyectos no
incluyen ninguno de Efameinsa. Lo más probable es que lo tenga quien montó la web
antes; el dominio principal sigue apuntando al hosting viejo
(`207.58.172.236`, `cloud1000.im-global.net`).

**Vercel pide DOS registros, no uno.** El texto completo del panel (24-08):

> This domain is linked to another Vercel account. To use it with this project,
> add a TXT record at `_vercel.efameinsa.com` to verify ownership.

| Tipo | Nombre | Valor |
|---|---|---|
| CNAME | `crm` | `c3c215f42848dc6d.vercel-dns-017.com.` |
| TXT | `_vercel` | `vc-domain-verify=crm.efameinsa.com,82a11dac39233ba31d6d` |

⚠️ **El CNAME que ya está puesto NO es el que Vercel pide.** Hoy resuelve a
`cname.vercel-dns.com` (76.76.21.164 / 66.33.60.34), el destino genérico y
antiguo; el panel pide uno específico de este proyecto
(`c3c215f42848dc6d.vercel-dns-017.com` → 216.198.79.65 / 64.29.17.65). El
genérico sigue resolviendo, así que puede que funcionara igual — pero el panel
valida contra el suyo, y con este hosting no conviene apostar: **pedir los dos
cambios en el mismo mensaje** y cerrar el tema de una vez.

### Lo demás está limpio (auditado el 24-08, para no volver a molestarlos)

| Comprobación | Resultado |
|---|---|
| CAA en `efameinsa.com` | **ninguno** — nada impide emitir el certificado |
| DNSSEC | no está firmado — sin riesgo de fallo de validación |
| A / AAAA en `crm` | ninguno propio — no hay conflicto con el CNAME |
| `_vercel.efameinsa.com` | vacío — falta crearlo |

Con esos dos registros **no hace falta nada más del hosting**.

### Correo para el hosting (listo para enviar)

> **Asunto:** Dos registros DNS para terminar de habilitar crm.efameinsa.com
>
> Buen día,
>
> Gracias por crear el subdominio `crm.efameinsa.com`. Al conectarlo con el
> proveedor nos pide dos ajustes para poder emitir el certificado. Son estos, y
> con ellos queda terminado:
>
> **1) Modificar el CNAME que ya existe** (cambia solo el valor):
>
> | Campo | Valor |
> |---|---|
> | Tipo | CNAME |
> | Nombre / Host | `crm` |
> | Valor **nuevo** | `c3c215f42848dc6d.vercel-dns-017.com.` |
>
> _(hoy apunta a `cname.vercel-dns.com`; es el mismo proveedor, pero necesitamos
> el destino específico de nuestro proyecto)_
>
> **2) Crear un registro TXT nuevo:**
>
> | Campo | Valor |
> |---|---|
> | Tipo | TXT |
> | Nombre / Host | `_vercel` |
> | Valor | `vc-domain-verify=crm.efameinsa.com,82a11dac39233ba31d6d` |
> | TTL | el mínimo disponible |
>
> El valor del TXT va completo **en un solo campo, incluida la coma**.
>
> Ninguno de los dos afecta al correo ni a la web actual: el CNAME es del
> subdominio `crm` únicamente, y el TXT es solo de verificación.
>
> Quedamos atentos para confirmar. Gracias.

*(Por teléfono: "en la zona de efameinsa.com necesito cambiar el valor del CNAME
`crm` a `c3c215f42848dc6d.vercel-dns-017.com` y crear un TXT `_vercel` con el
valor que les paso; no toca el correo ni la web".)*

**Camino alternativo:** que la otra cuenta de Vercel que tiene el dominio lo
libere. Más limpio, pero exige saber quién la controla y que responda — los dos
registros no dependen de nadie más que del hosting.

### Cómo saber cuándo quedó

```
node --env-file=.env.local scripts/migrar-dominio.mjs
```

Lo primero que imprime es si el TXT ya existe y qué valor tiene. Consulta por
DNS-over-HTTPS contra Cloudflare, así que no depende de la caché del equipo.
Cuando aparezca, Vercel lo valida solo en unos minutos y emite el certificado.

---

## 2. Después, corre esto

```
node --env-file=.env.local scripts/migrar-dominio.mjs
```

Comprueba, sobre el dominio nuevo y con una sesión real de Katerine: que sirva
el CRM y no otro proyecto, que el proxy proteja las rutas internas, que carguen
Mi día / Kanban / Mi agenda, que un PDF del archivo (R2) se abra, y que el
`.vercel.app` siga vivo para no romper enlaces guardados.

Cuando todo esté en verde:

```
node --env-file=.env.local scripts/migrar-dominio.mjs --aplicar
```

Eso reapunta el único workflow de n8n que llama al CRM
(**"CRM · SLA leads esperando"**, que cada cierto tiempo consulta
`/api/alertas/leads-esperando`). Los otros dos workflows del CRM
—"Timbre de lead nuevo" y "Lead derivado a comercial"— reciben webhooks, no
llaman al CRM, así que no se enteran del cambio.

---

## 3. Lo que puede esperar (y por qué no urge)

**El `.vercel.app` no deja de funcionar** al añadir un dominio propio. Los dos
siguen sirviendo el mismo despliegue, así que no hay ventana en la que algo
quede apuntando a un sitio muerto. Eso permite migrar sin prisa:

- **Webhook de Google Ads Lead Forms.** Está registrado en la consola de Google
  Ads apuntando a `crm-efameinsa.vercel.app/api/webhooks/google-leads`. Cambiarlo
  a mano es sano por prolijidad, pero **no lo toques el mismo día que empieza el
  equipo**: si se escribe mal, se pierden leads reales sin que nadie se entere
  hasta que Central pregunte. Mejor un día tranquilo y verificando con un lead
  de prueba.
- **Notificaciones push.** Las suscripciones son por origen. Las que ya existen
  (creadas en el `.vercel.app`) siguen entregando avisos, pero al hacer clic
  abren el dominio viejo. Cuando los comerciales entren por
  `crm.efameinsa.com` y activen las notificaciones ahí, se crea la suscripción
  nueva. No se pierde nada; puede que durante unos días alguien reciba el aviso
  duplicado. Si molesta, se limpian las viejas de `push_suscripciones`.
- **Sesiones abiertas.** Las cookies son por dominio: quien esté logueado en el
  `.vercel.app` tendrá que **volver a entrar** en `crm.efameinsa.com`. Con la
  capacitación de hoy 9:30 conviene decidir con qué URL se les enseña, para no
  hacerles escribir la contraseña dos veces.

## 4. Lo que NO se toca

- **Supabase**: nada. Ni Site URL, ni Redirect URLs, ni CORS. Ya explicado
  arriba — el login es por contraseña y todo lo demás se firma desde el
  servidor. (Se puede actualizar el *Site URL* por prolijidad, pero no cambia
  ningún comportamiento hoy.)
- **R2 / Cloudflare**: nada. El bucket es privado y solo lo lee el servidor.
- **Variables de entorno**: ninguna guarda el dominio.
