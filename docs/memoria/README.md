# La memoria del proyecto

Estos archivos son la memoria de trabajo de Claude Code: hechos sueltos que no
tienen dónde vivir en el código —quién pidió qué, por qué se decidió algo así,
qué trampa costó una tarde— y que hacen falta para no volver a preguntar lo
mismo ni repetir un error ya cometido.

**Están acá porque la memoria de Claude Code vive en el disco**, bajo
`~/.claude/projects/<ruta-del-proyecto-con-guiones>/memory/`. O sea que no
viaja: se pierde al cambiar de computadora, y ni siquiera sobrevive a abrir el
mismo proyecto desde otra carpeta. El repositorio sí viaja.

## En una máquina nueva

```bash
git clone https://github.com/Efameinsa/crm-efameinsa
cd crm-efameinsa
node scripts/instalar-memoria.mjs
```

Eso los copia al sitio donde Claude Code los lee solo al abrir el proyecto.

## Antes de cambiar de máquina

```bash
node scripts/instalar-memoria.mjs --recoger
git add docs/memoria && git commit -m "..." && git push
```

Trae de vuelta lo que se haya escrito en la memoria local durante el trabajo, para
que no se quede en el disco viejo.

## Qué hay acá

`MEMORY.md` es el índice: una línea por archivo. Los demás son un hecho cada uno.
Los que empiezan con `crm-` son de este sistema; `proyecto-efameinsa.md` es del
otro proyecto (la web en Astro), y los tres restantes son del entorno y de la
marca.

**Esto no reemplaza a `docs/19-estado-y-continuidad.md`**, que es el traspaso
ordenado y se lee primero. La memoria es el detalle suelto que quedó alrededor.
