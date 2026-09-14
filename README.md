# Atlas — enciclopedia personal que crece sola

Convierte tus propios textos (apuntes, archivos `.md`, notas sueltas) en una **wikipedia personal**: extrae conceptos, los enlaza automáticamente en un grafo de conocimiento, y genera un artículo para cada uno con sus fuentes, su consenso y sus vecinos. Tú pele un texto dentro y Atlas decide qué es un concepto, cómo se relaciona con los demás y qué merece más atención.

## Qué es

Atlas va más allá de un buscador: **escribe artículos solo**.

- **Ingesta**: cada texto se descompone en frases y términos; un stemmer ligero del español los agrupa (`flores`/`flor`, `informaciones`/`informacion`, `memorias`/`memoria`).
- **Conceptos**: los términos significativos se vuelven conceptos, ordenados por **saliencia** (df × idf). El título usa la superficie más frecuente del corpus.
- **Artículos generados**: cada concepto tiene *definición* (su primera mención), *contexto* (las frases donde aparece, con su fuente), *relacionado con* (co-ocurrencias ponderadas) y *mencionado por* (backlinks).
- **Honestidad**: cada artículo muestra su **consenso** (cuántas fuentes independientes lo mencionan) y una **confianza** derivada. Un concepto visto solo en una fuente se marca como poco confiable: Atlas no inventa nada, solo organiza lo que le das.
- **Grafo de conocimiento**: los conceptos y sus relaciones forman un mapa navegable (clic = ir al artículo).
- **Enlazado automático**: las menciones de conceptos relacionados se convierten en enlaces dentro de los artículos, para que se navegue como en una enciclopedia real.

## Por qué existe

Los wikis mantenidos a mano mueren por falta de mantenimiento. Atlas lo mantiene por ti: no necesitas redactar nada ni decidir qué merece artículo — el corpus lo decide. Es la forma de convertir "miles de notas sueltas" en "una enciclopedia de tu propio dominio" sin tocar un enlace a mano.

## Características

- Núcleo puro testeable: lexer/stemmer español y base de conocimiento (21 pruebas).
- Artículos con definición, contexto, fuentes, consenso y confianza.
- Búsqueda que singulariza (busca "recuerdo", encuentra "recuerdos").
- Grafo de conceptos con navegación espacial.
- Persistencia JSON + exportar/importar.
- CLI y servidor web sin dependencias.
- "Añadir conocimiento manual": pegas texto y la wiki se actualiza al vuelo.

## Instalación

Sin dependencias: requiere Node.js (CLI/servidor/tests) y un navegador.

```bash
git init
```

## Uso

### Servidor + interfaz web

```bash
node server.js
# Abre http://localhost:4747
```

Consejo: ingiere primero el corpus de ejemplo desde el CLI y luego abre la web:

```bash
node cli.js ingerir ejemplos          # 13 textos de ejemplo
node cli.js articulo "rio"            # prueba el artículo en terminal
node cli.js buscar "tren"
```

En la web: pulsa conceptos del lateral, usa el mapa (botón 🗺), busca, o pega texto en *Añadir conocimiento* y observa cómo aparecen conceptos nuevos.

### CLI

```bash
node cli.js ingerir apuntes/ --fuente "mis-notas"
node cli.js articulo "memoria"
node cli.js conceptos 25
node cli.js relacionados "hipocampo"
node cli.js buscar "ferrocarril" 5
node cli.js grafo 40
node cli.js fuentes
node cli.js exportar copia.json
node cli.js importar copia.json
node cli.js estado
```

El conocimiento persiste en `conocimiento.json` (configurable con `ATLAS_FILE`); el puerto con `ATLAS_PORT`.

## Arquitectura

```
js/
  core/
    lexer.js       ← tokenizer, stopwords, stemmer español ligero, frases
    knowledge.js   ← KnowledgeBase: ingestión, saliencia, artículos, related/backlinks, búsqueda, grafo, persistencia
cli.js             ← CLI
server.js          ← http local: API + estáticos
js/web.js          ← interfaz: artículos, búsqueda, mapa de conceptos, ingestión
index.html
tests/
  lexer.test.js    ← 9 pruebas
  knowledge.test.js ← 12 pruebas
ejemplos/          ← 13 fuentes de ejemplo (villa · ferrocarril · memoria)
```

Núcleo puro + interfaz separada, el mismo patrón del laboratorio.

## Ejemplo real

```
$ node cli.js articulo rio
rio
   consenso 3 fuentes · confianza 100% · 4 menciones en 3 textos

Definición: Lavaban la ropa con el agua del río, que movía la piedra del molino.

Contexto:
   · Lavaban la ropa con el agua del río, que movía la piedra del molino.  [lavanderas.md]
   · El molino del río molía trigo para media comarca.  [molino.md]
   · El puente medieval unía las dos orillas del río.  [puente.md]

Relacionado con: molino · puente · piedra · siglos · pan · lavanderas · granjero · agua
Mencionado por:  molino · puente · piedra · lavanderas · pan · siglos
```

El artículo no existía antes de ingerir los textos: Atlas lo escribió.

## Estado

- Núcleo, CLI, servidor y web funcionales (21 pruebas).
- Enlazado automático en artículos, consenso y confianza por fuente, grafo navegable, singularización en búsqueda.
- Pendientes: frases compuestas como conceptos (multi-word), detección de nombres propios, edición manual de artículos, ranking temporal (recencia), versión "printer" de un artículo, ingesta incremental de una carpeta.

## Licencia

MIT