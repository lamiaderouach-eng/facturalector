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
  importe         NUMERIC(12,2) NOT NULL DEFAULT 0,
  tipo_iva        NUMERIC(5,2)  NOT NULL DEFAULT 21
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

-- Desglose de impuestos: una fila por cada tipo de IVA de la factura
CREATE TABLE IF NOT EXISTS desglose_iva (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  factura_id BIGINT NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
  tipo       NUMERIC(5,2)  NOT NULL,
  base       NUMERIC(12,2) NOT NULL DEFAULT 0,
  cuota      NUMERIC(12,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_desglose_factura ON desglose_iva(factura_id);

ALTER TABLE desglose_iva ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS acceso_publico ON desglose_iva;
CREATE POLICY acceso_publico ON desglose_iva FOR ALL TO anon USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON desglose_iva TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
-- Función para guardar una factura completa de una sola vez (la usa n8n).
-- Recibe un JSON con la factura, busca o crea proveedor y cliente, guarda la
-- factura, sus líneas y el desglose de IVA. Si ya existe una factura con el
-- mismo número y proveedor, no la repite y devuelve su id con "duplicada": true.
CREATE OR REPLACE FUNCTION insertar_factura(datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_prov  bigint;
  v_cli   bigint := NULL;
  v_id    bigint;
  v_linea jsonb;
  v_imp   jsonb;
BEGIN
  IF coalesce(trim(datos->>'numero'), '') = '' THEN
    RAISE EXCEPTION 'La factura no tiene número';
  END IF;

  -- Proveedor: se busca por nombre y, si no existe, se crea
  INSERT INTO proveedores (nombre, nif)
  VALUES (coalesce(nullif(trim(datos->>'proveedor'), ''), 'Proveedor desconocido'), nullif(datos->>'proveedorNif', ''))
  ON CONFLICT (nombre) DO UPDATE SET nif = coalesce(EXCLUDED.nif, proveedores.nif)
  RETURNING id INTO v_prov;

  -- Cliente (si aparece en la factura)
  IF coalesce(trim(datos->>'cliente'), '') <> '' THEN
    INSERT INTO clientes (nombre, nif)
    VALUES (trim(datos->>'cliente'), nullif(datos->>'clienteNif', ''))
    ON CONFLICT (nombre) DO UPDATE SET nif = coalesce(EXCLUDED.nif, clientes.nif)
    RETURNING id INTO v_cli;
  END IF;

  -- Evitar facturas repetidas
  SELECT id INTO v_id FROM facturas WHERE proveedor_id = v_prov AND numero = datos->>'numero' LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_id, 'duplicada', true);
  END IF;

  INSERT INTO facturas (numero, proveedor_id, cliente_id, fecha_emision, fecha_vencimiento,
                        base_imponible, impuestos, total, estado, archivo, remitente, fecha_recepcion)
  VALUES (
    datos->>'numero', v_prov, v_cli,
    nullif(datos->>'fechaEmision', '')::date,
    nullif(datos->>'fechaVencimiento', '')::date,
    coalesce((datos->>'baseImponible')::numeric, 0),
    coalesce((datos->>'impuestos')::numeric, 0),
    coalesce((datos->>'total')::numeric, 0),
    'pendiente',
    datos->>'archivo',
    datos->>'remitente',
    coalesce(nullif(datos->>'fechaRecepcion', '')::date, CURRENT_DATE)
  )
  RETURNING id INTO v_id;

  -- Líneas de detalle
  FOR v_linea IN SELECT * FROM jsonb_array_elements(coalesce(datos->'lineas', '[]'::jsonb)) LOOP
    INSERT INTO lineas (factura_id, concepto, cantidad, precio_unitario, descuento, importe, tipo_iva)
    VALUES (
      v_id,
      coalesce(v_linea->>'concepto', ''),
      coalesce((v_linea->>'cantidad')::numeric, 1),
      coalesce((v_linea->>'precioUnitario')::numeric, 0),
      coalesce((v_linea->>'descuento')::numeric, 0),
      coalesce((v_linea->>'importe')::numeric, 0),
      coalesce((v_linea->>'tipoIva')::numeric, 21)
    );
  END LOOP;

  -- Desglose de impuestos (un tipo de IVA por fila)
  FOR v_imp IN SELECT * FROM jsonb_array_elements(coalesce(datos->'desglose', '[]'::jsonb)) LOOP
    INSERT INTO desglose_iva (factura_id, tipo, base, cuota)
    VALUES (
      v_id,
      coalesce((v_imp->>'tipo')::numeric, 0),
      coalesce((v_imp->>'base')::numeric, 0),
      coalesce((v_imp->>'cuota')::numeric, 0)
    );
  END LOOP;

  RETURN jsonb_build_object('id', v_id, 'duplicada', false);
END;
$fn$;

GRANT EXECUTE ON FUNCTION insertar_factura(jsonb) TO anon;