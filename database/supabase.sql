-- Base de datos compartida en Supabase (PostgreSQL) - Lamia Derouach
-- Se pega entera en Supabase > SQL Editor y se pulsa "Run".

CREATE TABLE IF NOT EXISTS proveedores (
  id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL UNIQUE,
  nif    VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS clientes (
  id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL UNIQUE,
  nif    VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS facturas (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero            VARCHAR(50) NOT NULL,
  proveedor_id      BIGINT NOT NULL REFERENCES proveedores(id),
  cliente_id        BIGINT REFERENCES clientes(id),
  fecha_emision     DATE,
  fecha_vencimiento DATE,
  base_imponible    NUMERIC(12,2) NOT NULL DEFAULT 0,
  impuestos         NUMERIC(12,2) NOT NULL DEFAULT 0,
  total             NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado            VARCHAR(10) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','validada')),
  archivo           VARCHAR(255),
  remitente         VARCHAR(255),
  fecha_recepcion   DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS lineas (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  factura_id      BIGINT NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
  concepto        VARCHAR(255) NOT NULL,
  cantidad        NUMERIC(12,2) NOT NULL DEFAULT 1,
  precio_unitario NUMERIC(12,2) NOT NULL DEFAULT 0,
  descuento       NUMERIC(5,2)  NOT NULL DEFAULT 0,
  importe         NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_facturas_recepcion ON facturas(fecha_recepcion);
CREATE INDEX IF NOT EXISTS idx_facturas_estado ON facturas(estado);
CREATE INDEX IF NOT EXISTS idx_lineas_factura ON lineas(factura_id);

-- Permisos: la app es pública y no tiene login, así que la clave pública
-- (anon) puede leer y escribir en las cuatro tablas.
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE lineas      ENABLE ROW LEVEL SECURITY;

CREATE POLICY acceso_publico ON proveedores FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY acceso_publico ON clientes    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY acceso_publico ON facturas    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY acceso_publico ON lineas      FOR ALL TO anon USING (true) WITH CHECK (true);

-- Permisos de tabla para la clave pública (anon)
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON proveedores, clientes, facturas, lineas TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
