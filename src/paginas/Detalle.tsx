// Detalle de una factura: cabecera y líneas editables + validación humana
import { useEffect, useState } from "react";
import { obtenerFactura, guardarFactura, borrarFactura } from "../db";
import type { Factura, Linea } from "../types";

const redondear = (n: number) => Math.round(n * 100) / 100;

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
      if (campo !== "concepto" && campo !== "importe") {
        nueva.importe = redondear(nueva.cantidad * nueva.precioUnitario * (1 - nueva.descuento / 100));
      }
      return nueva;
    });
    setF({ ...f, lineas });
  };

  const anadirLinea = () =>
    setF({ ...f, lineas: [...f.lineas, { concepto: "", cantidad: 1, precioUnitario: 0, descuento: 0, importe: 0 }] });
  const quitarLinea = (i: number) => setF({ ...f, lineas: f.lineas.filter((_, j) => j !== i) });

  // Recalcula base, IVA (21 %) y total a partir de las líneas
  const recalcular = () => {
    const base = redondear(f.lineas.reduce((s, l) => s + l.importe, 0));
    const iva = redondear(base * 0.21);
    setF({ ...f, baseImponible: base, impuestos: iva, total: redondear(base + iva) });
  };

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

      {aviso && <p className="exito" role="status">{aviso}</p>}
      <div className="botones">
        <button className="boton" onClick={() => guardar(f.estado)}>Guardar cambios</button>
        <button className="boton oro" onClick={() => guardar("validada")}>Validar factura</button>
        <button className="boton peligro" onClick={borrar}>Borrar</button>
      </div>
    </section>
  );
}
