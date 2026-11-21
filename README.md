# FacturaLector

Aplicación web para leer, revisar y consultar facturas en PDF. Hecha por **Lamia Derouach**.

## Qué hace
- Lee facturas PDF y saca proveedor, cliente, número, fechas, base, impuestos, total y líneas.
- Conserva cada tipo de IVA por separado (21 %, 10 %, 4 %...) en un desglose de impuestos.
- Las guarda en una base de datos PostgreSQL en Supabase (tablas `proveedores`, `clientes`, `facturas`, `lineas` y `desglose_iva`).
- Permite editar cualquier dato y validar la factura.
- Asistente que responde preguntas por texto o por voz usando solo los datos guardados.
- Diseño responsive (móvil, tablet y escritorio).

## Cómo ejecutarla
```
npm install
npm run dev        # desarrollo
npm run build      # versión final en /dist
npm run muestras   # crea PDFs de ejemplo en /muestras
```
En el listado pulsa "Cargar facturas".

## Base de datos (Supabase)
1. Crea un proyecto en Supabase.
2. En **SQL Editor** ejecuta `database/supabase.sql`. Crea las tablas, los permisos y la función `insertar_factura`.
3. Escribe la dirección y la clave pública del proyecto en `src/config.ts`.

Si la base ya existía de antes, ejecuta solo `database/migracion-iva-y-n8n.sql`. No borra datos: añade el IVA por línea, la tabla `desglose_iva` y la función.

## Estructura
- `src/parser.ts`: lee el PDF y interpreta la factura (incluido el IVA por tipos).
- `src/impuestos.ts`: cálculo del desglose de IVA.
- `src/db.ts`: acceso a Supabase con la API REST (`fetch`).
- `src/assistant.ts`: respuestas del asistente.
- `src/paginas/`: pantallas (listado, subir, detalle, asistente).
- `n8n/flujo-facturas.json`: flujo de n8n.
- `database/supabase.sql`: tablas, permisos y función para Supabase.
- `database/modelo.sql`: modelo de datos en PostgreSQL.

## Impuestos
Cada línea de la factura tiene su tipo de IVA. Al pulsar "Recalcular totales", la base y la cuota se calculan por separado para cada tipo y el total de impuestos es la suma. Los tipos que vienen escritos en el PDF se conservan en el desglose. Si la factura solo trae base e IVA, el tipo se deduce de ellos.

## Asistente
No usa IA generativa. Detecta la intención de la pregunta con palabras clave y sinónimos (resumen, pendientes, IVA, importes mayores o menores que una cifra, proveedor, periodo...) y calcula la respuesta con las facturas guardadas en la base de datos. Si una pregunta no se entiende, propone ejemplos de preguntas válidas. Esa es su limitación: una frase muy distinta de las previstas puede no entenderse.

## Flujo completo
Correo -> n8n (filtra PDF, extrae el texto, interpreta, desglosa el IVA) -> n8n llama a la función `insertar_factura` de Supabase -> la factura y sus líneas quedan guardadas -> la app las muestra -> revisión -> asistente.

La función no repite una factura que ya existe (mismo proveedor y mismo número). El nodo 5 del flujo usa la clave pública de Supabase, la misma que la app. Si la app tuviera login, el flujo debería usar una clave privada guardada como credencial de n8n.

Importar el JSON a mano (Subir PDF -> Importar desde n8n) sigue funcionando como alternativa y tampoco repite facturas.

## Notas
- La app no tiene inicio de sesión: quien tenga el enlace puede ver y cambiar las facturas.
- El lector de PDF funciona con facturas que tengan texto, no con fotos escaneadas.
