# FacturaLector

Aplicación web para leer, revisar y consultar facturas en PDF. Hecha por **Lamia Derouach**.

## Qué hace
- Lee facturas PDF y saca proveedor, cliente, número, fechas, base, IVA, total y líneas.
- Las guarda en una base de datos (tablas `proveedores`, `clientes`, `facturas`, `lineas`).
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
En el listado pulsa "Cargar facturas de ejemplo".

## Estructura
- `src/parser.ts`: lee el PDF y interpreta la factura.
- `src/db.ts`: base de datos (Dexie / IndexedDB).
- `src/assistant.ts`: respuestas del asistente.
- `src/paginas/`: pantallas (listado, subir, detalle, asistente).
- `n8n/flujo-facturas.json`: flujo de n8n (correo, solo PDF, texto, interpretar, JSON).
- `database/modelo.sql`: modelo de datos en PostgreSQL.

## Flujo completo
Correo -> n8n (filtra PDF, interpreta) -> archivo JSON -> la app lo importa (Subir PDF -> Importar desde n8n) -> base de datos -> revisión -> asistente.

## Nota
La versión pública guarda los datos en el navegador de cada persona. Para una base compartida se usa `database/modelo.sql` con un nodo Postgres en n8n.
