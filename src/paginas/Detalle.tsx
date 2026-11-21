// Detalle de una factura: cabecera y líneas editables + validación humana
import { useEffect, useState } from "react";
import { obtenerFactura, guardarFactura, borrarFactura } from "../db";
import type { Factura, Impuesto, Linea } from "../types";
import { calcularDesglose, mismoDesglose, redondear, totalBases, totalCuotas } from "../impuestos";

export default function Detalle({ id }: { id: number }) {
  const [f, setF] = useState<Factura | null>(null);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    obtenerFactura(id).then((x) => setF(x ?? null));
  }, [id]);

  if (!f) return <p>Factura no encontrada. <a href="#/">Volver al listado</a></p>;

  // Cambia un campo de la cabecera
  const cambiar = <K extends keyof Factura>(campo: K, valor: Factura[K]) => setF({ ...f, [campo]: valor });

  // Cambia un campo de una línea y recalcula su importe
  const cambiarLinea = (i: number, campo: keyof Linea, valor: string) => {
    const lineas = f.lineas.map((l, j) => {
      if (j !== i) return l;
      const nueva = { ...l, [campo]: campo === "concepto" ? valor : Number(valor) || 0 } as Linea;
      if (campo !== "concepto" && campo !== "importe" && campo !== "tipoIva") {
        nueva.importe = redondear(nueva.cantidad * nueva.precioUnitario * (1 - nueva.descuento / 100));
      }
      return nueva;
    });
    setF({ ...f, lineas });
  };

  const anadirLinea = () =>
    setF({ ...f, lineas: [...f.lineas, { concepto: "", cantidad: 1, precioUnitario: 0, descuento: 0, importe: 0, tipoIva: 21 }] });
  const quitarLinea = (i: number) => setF({ ...f, lineas: f.lineas.filter((_, j) => j !== i) });

  // Recalcula el desglose, la base, el IVA y el total a partir de las líneas.
  // Cada línea usa su propio tipo de IVA, así que se calcula cada tipo por separado.
  const recalcular = () => {
    const desglose = calcularDesglose(f.lineas);
    const base = redondear(f.lineas.reduce((s, l) => s + l.importe, 0));
    const iva = totalCuotas(desglose);
    setF({ ...f, desglose, baseImponible: base, impuestos: iva, total: redondear(base + iva) });
  };

  // Cambia una fila del desglose de impuestos y actualiza los totales de la cabecera
  const cambiarDesglose = (i: number, campo: keyof Impuesto, valor: string) => {
    const desglose = f.desglose.map((d, j) => (j === i ? { ...d, [campo]: Number(valor) || 0 } : d));
    actualizarDesglose(desglose);
  };
  const actualizarDesglose = (desglose: Impuesto[]) => {
    const base = totalBases(desglose);
    const iva = totalCuotas(desglose);
    setF({ ...f, desglose, baseImponible: base, impuestos: iva, total: redondear(base + iva) });
  };
  const anadirImpuesto = () => actualizarDesglose([...f.desglose, { tipo: 21, base: 0, cuota: 0 }]);
  const quitarImpuesto = (i: number) => actualizarDesglose(f.desglose.filter((_, j) => j !== i));

  // Aviso si el desglose guardado no coincide con lo que salen de sumar las líneas
  const hayDiferencia = f.lineas.length > 0 && !mismoDesglose(f.desglose, calcularDesglose(f.lineas));

  const guardar = async (estado: Factura["estado"]) => {
    await guardarFactura({ ...f, estado });
    setF({ ...f, estado });
    setAviso(estado === "validada" ? "Factura validada y guardada." : "Cambios guardados.");
  };

  const borrar = async () => {
    if (confirm("¿Borrar esta factura?")) {
      await borrarFactura(id);
      window.location.hash = "#/";
    }
  };

  const texto = (etiqueta: string, campo: keyof Factura, tipo = "text") => (
    <label className="campo">
      <span>{etiqueta}</span>
      <input type={tipo} value={String(f[campo] ?? "")} onChange={(e) => cambiar(campo, e.target.value as never)} />
    </label>
  );
  const importe = (etiqueta: string, campo: "baseImponible" | "impuestos" | "total") => (
    <label className="campo">
      <span>{etiqueta} (€)</span>
      <input type="number" step="0.01" value={f[campo]} onChange={(e) => cambiar(campo, Number(e.target.value))} />
    </label>
  );

  return (
    <section>
      <a href="#/" className="volver">← Volver al listado</a>
      <div className="titulo-fila">
        <h1>Factura {f.numero || "sin número"}</h1>
        <span className={`etiqueta ${f.estado}`}>{f.estado}</span>
      </div>
      <p className="ayuda">Archivo: {f.archivo} · Recibida de {f.remitente || "—"} el {f.fechaRecepcion}</p>

      <div className="caja">
        <h2>Cabecera</h2>
        <div className="rejilla">
          {texto("Número de factura", "numero")}
          {texto("Proveedor / emisor", "proveedor")}
          {texto("NIF del proveedor", "proveedorNif")}
          {texto("Cliente / receptor", "cliente")}
          {texto("NIF del cliente", "clienteNif")}
          {texto("Fecha de emisión", "fechaEmision", "date")}
          {texto("Fecha de vencimiento", "fechaVencimiento", "date")}
          {importe("Base imponible", "baseImponible")}
          {importe("Impuestos (IVA)", "impuestos")}
          {importe("Total", "total")}
        </div>
      </div>

      <div className="caja">
        <h2>Líneas de la factura</h2>
        <div className="tabla-scroll">
          <table className="lineas">
            <thead>
              <tr>
                <th>Concepto</th>
                <th>Cantidad</th>
                <th>Precio</th>
                <th>Dto. %</th>
                <th>IVA %</th>
                <th>Importe</th>
                <th><span className="solo-lector">Quitar</span></th>
              </tr>
            </thead>
            <tbody>
              {f.lineas.map((l, i) => (
                <tr key={i}>
                  <td data-etiqueta="Concepto">
                    <input aria-label="Concepto" value={l.concepto} onChange={(e) => cambiarLinea(i, "concepto", e.target.value)} />
                  </td>
                  <td data-etiqueta="Cantidad">
                    <input aria-label="Cantidad" type="number" value={l.cantidad} onChange={(e) => cambiarLinea(i, "cantidad", e.target.value)} />
                  </td>
                  <td data-etiqueta="Precio">
                    <input aria-label="Precio unitario" type="number" step="0.01" value={l.precioUnitario} onChange={(e) => cambiarLinea(i, "precioUnitario", e.target.value)} />
                  </td>
                  <td data-etiqueta="Dto. %">
                    <input aria-label="Descuento" type="number" value={l.descuento} onChange={(e) => cambiarLinea(i, "descuento", e.target.value)} />
                  </td>
                  <td data-etiqueta="IVA %">
                    <input aria-label="Tipo de IVA" type="number" step="0.5" value={l.tipoIva} onChange={(e) => cambiarLinea(i, "tipoIva", e.target.value)} />
                  </td>
                  <td data-etiqueta="Importe">
                    <input aria-label="Importe" type="number" step="0.01" value={l.importe} onChange={(e) => cambiarLinea(i, "importe", e.target.value)} />
                  </td>
                  <td>
                    <button className="boton peligro pequeno" onClick={() => quitarLinea(i)} aria-label="Quitar línea">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="botones">
          <button className="boton secundario" onClick={anadirLinea}>+ Añadir línea</button>
          <button className="boton secundario" onClick={recalcular}>Recalcular totales</button>
        </div>
      </div>

      <div className="caja">
        <h2>Desglose de impuestos</h2>
        <p className="ayuda">Cada tipo de IVA va por separado. Los tipos que lee el programa de la factura se conservan.</p>
        <div className="tabla-scroll">
          <table className="lineas">
            <thead>
              <tr>
                <th>Tipo de IVA %</th>
                <th>Base (€)</th>
                <th>Cuota (€)</th>
                <th><span className="solo-lector">Quitar</span></th>
              </tr>
            </thead>
            <tbody>
              {f.desglose.map((d, i) => (
                <tr key={i}>
                  <td data-etiqueta="Tipo %">
                    <input aria-label="Tipo de IVA" type="number" step="0.5" value={d.tipo} onChange={(e) => cambiarDesglose(i, "tipo", e.target.value)} />
                  </td>
                  <td data-etiqueta="Base">
                    <input aria-label="Base del tipo" type="number" step="0.01" value={d.base} onChange={(e) => cambiarDesglose(i, "base", e.target.value)} />
                  </td>
                  <td data-etiqueta="Cuota">
                    <input aria-label="Cuota del tipo" type="number" step="0.01" value={d.cuota} onChange={(e) => cambiarDesglose(i, "cuota", e.target.value)} />
                  </td>
                  <td>
                    <button className="boton peligro pequeno" onClick={() => quitarImpuesto(i)} aria-label="Quitar impuesto">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {hayDiferencia && (
          <p className="ayuda">
            Ojo: el desglose no coincide con el IVA de cada línea. Revisa la columna "IVA %" y pulsa "Recalcular totales" si quieres que se calcule con las líneas.
          </p>
        )}
        <div className="botones">
          <button className="boton secundario" onClick={anadirImpuesto}>+ Añadir tipo de IVA</button>
        </div>
      </div>

      {aviso && <p className="exito" role="status">{aviso}</p>}
      <div className="botones">
        <button className="boton" onClick={() => guardar(f.estado)}>Guardar cambios</button>
        <button className="boton oro" onClick={() => guardar("validada")}>Validar factura</button>
        <button className="boton peligro" onClick={borrar}>Borrar</button>
      </div>
    </section>
  );
}
