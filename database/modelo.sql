-- Modelo de base de datos (PostgreSQL) - Lamia Derouach
-- Es el mismo modelo que usa la app en el navegador (IndexedDB).

CREATE TABLE proveedores (
  id     SERIAL PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL UNIQUE,
  nif    VARCHAR(20)
);

CREATE TABLE clientes (
  id     SERIAL PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL UNIQUE,
  nif    VARCHAR(20)
);

CREATE TABLE facturas (
  id                SERIAL PRIMARY KEY,
  numero            VARCHAR(50) NOT NULL,
  proveedor_id      INTEGER NOT NULL REFERENCES proveedores(id),
  cliente_id        INTEGER REFERENCES clientes(id),
  fecha_emision     DATE,
  fecha_vencimiento DATE,
  base_imponible    NUMERIC(12,2) NOT NULL DEFAULT 0,
  impuestos         NUMERIC(12,2) NOT NULL DEFAULT 0,
  total             NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado            VARCHAR(10) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','validada')),
  archivo           VARCHAR(255),
  remitente         VARCHAR(255),
  fecha_recepcion   DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (proveedor_id, numero)
);

CREATE TABLE lineas (
  id              SERIAL PRIMARY KEY,
  factura_id      INTEGER NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
  concepto        VARCHAR(255) NOT NULL,
  cantidad        NUMERIC(12,2) NOT NULL DEFAULT 1,
  precio_unitario NUMERIC(12,2) NOT NULL DEFAULT 0,
  descuento       NUMERIC(5,2)  NOT NULL DEFAULT 0,
  importe         NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE INDEX idx_facturas_recepcion ON facturas(fecha_recepcion);
CREATE INDEX idx_facturas_estado ON facturas(estado);
CREATE INDEX idx_lineas_factura ON lineas(factura_id);
