/**
 * Instala la memoria del proyecto en ESTA máquina.
 *
 * POR QUÉ EXISTE. La memoria de Claude Code vive en el disco, bajo una carpeta
 * que depende de dónde se abrió el proyecto:
 *
 *     ~/.claude/projects/<ruta-con-guiones>/memory/
 *
 * O sea que no viaja: ni al cambiar de cuenta —eso sí lo aguanta— ni, sobre
 * todo, al cambiar de computadora. Lo que sí viaja es el repositorio.
 *
 * Entonces la memoria se guarda versionada en `docs/memoria/` y este script la
 * copia al sitio donde Claude Code la va a leer sola. En una máquina nueva:
 *
 *     git clone …  &&  cd crm-efameinsa  &&  node scripts/instalar-memoria.mjs
 *
 * Sin argumentos instala; con `--recoger` hace lo contrario: trae al repositorio
 * lo que se haya escrito en la memoria local, para poder commitearlo.
 *
 * `--proyecto <ruta>` apunta a la carpeta desde la que se abrió Claude Code,
 * que no siempre es la del repositorio:
 *
 *     node scripts/instalar-memoria.mjs --recoger --proyecto "C:\Users\diseno\.local\bin"
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";

const REPO = resolve(import.meta.dirname, "..");
const ORIGEN = join(REPO, "docs", "memoria");

/**
 * La carpeta que usa Claude Code para este proyecto: la ruta absoluta con los
 * separadores y los dos puntos convertidos en guiones. `C:\Users\x\Proyectos\y`
 * queda como `C--Users-x-Proyectos-y`.
 */
function carpetaDeMemoria(rutaProyecto) {
  // El punto también se convierte en guion: `C:\Users\x\.local\bin` queda como
  // `C--Users-x--local-bin`. Sin esa parte, recoger desde una ruta con carpeta
  // oculta apuntaba a un directorio que no existe.
  const clave = rutaProyecto.replace(/[\\/:.]/g, "-");
  return join(homedir(), ".claude", "projects", clave, "memory");
}

/**
 * De qué carpeta se instala o se recoge.
 *
 * Por defecto, la que le corresponde al repositorio. Pero la carpeta depende de
 * DÓNDE se abrió Claude Code, no de dónde está el proyecto: hasta el 29-08 las
 * sesiones se abrieron desde `C:\Users\diseno\.local\bin`, así que la memoria
 * viva era la de esa ruta y un `--recoger` a secas traía la del repo, que
 * estaba vieja. Con `--proyecto <ruta>` se recoge de la que de verdad se usó.
 */
const iProyecto = process.argv.indexOf("--proyecto");
const rutaProyecto = iProyecto !== -1 ? process.argv[iProyecto + 1] : REPO;
const destino = carpetaDeMemoria(rutaProyecto);
const recoger = process.argv.includes("--recoger");

if (recoger) {
  if (!existsSync(destino)) {
    console.log(`No hay memoria local en ${destino}`);
    process.exit(0);
  }
  mkdirSync(ORIGEN, { recursive: true });
  let n = 0;
  for (const archivo of readdirSync(destino).filter((f) => f.endsWith(".md"))) {
    writeFileSync(join(ORIGEN, archivo), readFileSync(join(destino, archivo)));
    n++;
  }
  console.log(`Recogidos ${n} archivos de ${destino}`);
  console.log("Ahora: git add docs/memoria && git commit");
} else {
  if (!existsSync(ORIGEN)) {
    console.log(`No hay nada en ${ORIGEN}`);
    process.exit(1);
  }
  mkdirSync(destino, { recursive: true });
  let n = 0;
  // El README explica el mecanismo, no es un recuerdo: no se instala.
  for (const archivo of readdirSync(ORIGEN).filter((f) => f.endsWith(".md") && f !== "README.md")) {
    writeFileSync(join(destino, archivo), readFileSync(join(ORIGEN, archivo)));
    n++;
  }
  console.log(`Instalados ${n} archivos de memoria en:`);
  console.log(`   ${destino}`);
  console.log("\nClaude Code los va a leer solo al abrir el proyecto desde esta carpeta.");
}
