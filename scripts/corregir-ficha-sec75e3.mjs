// Reportado por Darwin 26-08: a la SEC75E3 le faltaban el logo y la foto del
// panel en el PDF de cotización, y su ficha tenía el mismo bug ya visto en
// SECU1202/1SECU1701/LAV040 — el extractor original se comía el primer
// subtítulo de "AUTOMATIZACIÓN, SEGURIDAD Y CONTROL" (aquí "PROGRAMADOR DUAL
// DIGITAL") junto con su primera viñeta, y nunca separó "DISEÑO DE
// CONSTRUCCIÓN" del resto. Contenido verificado contra:
// V:\PROYECTO ASIGNADO - JEAN PAUL\FICHAS TECNICAS\UT075\
//   SECU75E. SECADORA UT075-DUAL DIGITAL-DOBLE ROTACIÓN -GALVANIZADO-ELECTRICO-220V.docx
// Logo y panel recortados de las imágenes propias de esa ficha
// (public/productos/sec75e3-{logo,panel}.png), igual mecanismo que las demás.

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: producto, error: errBuscar } = await supabase
  .from('productos')
  .select('id, ficha')
  .eq('sku', 'SEC75E3')
  .single();
if (errBuscar) { console.error('SEC75E3 no encontrado:', errBuscar.message); process.exit(1); }

const idxTambor = producto.ficha.caracteristicas.indexOf('TAMBOR');
if (idxTambor === -1) { console.error('SEC75E3 ya no tiene bloque TAMBOR mezclado, se omite'); process.exit(1); }

const caracteristicas = [
  'PROGRAMADOR DUAL DIGITAL',
  'Programador dual digital en multilenguaje con pantalla LED',
  ...producto.ficha.caracteristicas.slice(0, idxTambor),
];
const disenoConstruccion = producto.ficha.caracteristicas.slice(idxTambor);

const ficha = {
  ...producto.ficha,
  caracteristicas,
  caracteristicasTitulo: 'AUTOMATIZACIÓN, SEGURIDAD Y CONTROL',
  disenoConstruccion,
  dimensionesTitulo: 'ESPECIFICACIONES TÉCNICAS',
  medidasTitulo: 'DIMENSIONES GENERALES',
};

const { error: errUpd } = await supabase.from('productos').update({ ficha }).eq('id', producto.id);
if (errUpd) { console.error('Error actualizando ficha:', errUpd.message); process.exit(1); }
console.log('SEC75E3 -> ficha corregida:', caracteristicas.length, 'items en caracteristicas,', disenoConstruccion.length, 'en disenoConstruccion');
process.exit(0);
