#!/bin/sh
# ¿Vercel construye este commit? (vercel.json → ignoreCommand, que admite
# solo 256 caracteres). Salir con 0 = NO construir; con 1 = construir.
#
# Solo `main` construye (26-09: 45 de 179 builds eran de ramas de prueba que
# nadie abría). Una rama se construye si se llama vista-previa/… o si el
# commit lleva «[vista-previa]».
case "$VERCEL_GIT_COMMIT_REF" in
  main|vista-previa/*) ;;
  *) echo "$VERCEL_GIT_COMMIT_MESSAGE" | grep -q '\[vista-previa\]' || exit 0 ;;
esac

# Un push de muchos commits se compara contra el último desplegado, no solo
# contra el anterior (31-08). Sin ese commit a mano, se construye.
ANTES=${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}
git cat-file -e "$ANTES" 2>/dev/null || exit 1

# Lo que no cambia la aplicación: documentación, scripts de datos y
# migraciones (se aplican aparte, por la API de Supabase).
git diff --quiet "$ANTES" HEAD -- . ':(exclude)docs' ':(exclude)*.md' ':(exclude)scripts' ':(exclude)supabase'
