-- Mejora de impuestos y guardado directo desde n8n - Lamia Derouach
-- Se pega entera en Supabase > SQL Editor y se pulsa "Run". Se puede ejecutar más de una vez.
-- No borra ninguna factura.

-- 1. Cada línea guarda su tipo de IVA
ALTER TABLE lineas ADD COLUMN IF NOT EXISTS tipo_iva NUMERIC(5,2) NOT NULL DEFAULT 21;

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

-- 2. Las facturas que ya existían reciben un desglose deducido de su base e impuestos
INSERT INTO desglose_iva (factura_id, tipo, base, cuota)
SELECT f.id,
       CASE WHEN f.base_imponible > 0 THEN round((f.impuestos / f.base_imponible * 100) * 2) / 2 ELSE 0 END,
       f.base_imponible, f.impuestos
FROM facturas f
WHERE (f.base_imponible > 0 OR f.impuestos > 0)
  AND NOT EXISTS (SELECT 1 FROM desglose_iva d WHERE d.factura_id = f.id);

-- 3. Sus líneas usan ese mismo tipo (solo si la factura tiene un único tipo de IVA)
UPDATE lineas l SET tipo_iva = d.tipo
FROM desglose_iva d
WHERE d.factura_id = l.factura_id
  AND (SELECT count(*) FROM desglose_iva x WHERE x.factura_id = l.factura_id) = 1;

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