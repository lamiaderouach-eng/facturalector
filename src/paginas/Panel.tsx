// Página principal: listado de facturas procesadas
import { useEffect, useMemo, useState } from "react";
import { listarFacturas } from "../db";
import { cargarEjemplos, vaciarTodo } from "../demo";
import { euros } from "../assistant";
import type { Factura } from "../types";

export default function Panel() {
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("todas");

  const recargar = async () => {
    setFacturas(await listarFacturas());
    setCargando(false);
  };
  useEffect(() => {
    recargar();
  }, []);

  // Filtramos por texto y por estado
  const visibles = useMemo(() => {
    const q = busqueda.toLowerCase();
    return facturas.filter(
      (f) =>
        (estado === "todas" || f.estado === estado) &&
        (f.numero.toLowerCase().includes(q) || f.proveedor.toLowerCase().includes(q)),
    );
  }, [facturas, busqueda, estado]);

  const total = facturas.reduce((s, f) => s + f.total, 0);
  const pendientes = facturas.filter((f) => f.estado === "pendiente").length;

  const ejemplos = async () => {
    await cargarEjemplos();
    recargar();
  };
  const vaciar = async () => {
    // Es una base compartida: para borrar todo hay que escribir una palabra, no basta con aceptar
    const palabra = prompt(`Se borrarán las ${facturas.length} facturas de la base compartida. No se puede deshacer.\nPara confirmar escribe BORRAR:`);
    if (palabra?.trim() === "BORRAR") {
      await vaciarTodo();
      recargar();
    }
  };

  return (
    <section>
      <h1>Facturas recibidas</h1>

      <div className="tarjetas">
        <div className="tarjeta">
          <span>Facturas</span>
          <strong>{facturas.length}</strong>
        </div>
        <div className="tarjeta">
          <span>Importe total</span>
          <strong>{euros(total)}</strong>
        </div>
        <div className="tarjeta aviso">
          <span>Pendientes de revisar</span>
          <strong>{pendientes}</strong>
        </div>
      </div>

      <div className="barra">
        <input
          type="search"
          placeholder="Buscar por número o proveedor…"
          aria-label="Buscar facturas"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <select aria-label="Filtrar por estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="todas">Todas</option>
          <option value="pendiente">Pendientes</option>
          <option value="validada">Validadas</option>
        </select>
      </div>

      {cargando ? (
        <p>Cargando…</p>
      ) : facturas.length === 0 ? (
        <div className="vacio">
          <p>Todavía no hay facturas.</p>
          <div className="botones">
            <a className="boton" href="#/subir">Subir un PDF</a>
            <button className="boton secundario" onClick={ejemplos}>Cargar facturas de ejemplo</button>
          </div>
        </div>
      ) : (
        <>
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Proveedor</th>
                  <th>Emisión</th>
                  <th className="num">Total</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => (
                  <tr key={f.id} onClick={() => (window.location.hash = `#/factura/${f.id}`)}>
                    <td data-etiqueta="Número">
                      <a href={`#/factura/${f.id}`}>{f.numero || "(sin número)"}</a>
                    </td>
                    <td data-etiqueta="Proveedor">{f.proveedor}</td>
                    <td data-etiqueta="Emisión">{f.fechaEmision || "—"}</td>
                    <td data-etiqueta="Total" className="num">{euros(f.total)}</td>
                    <td data-etiqueta="Estado">
                      <span className={`etiqueta ${f.estado}`}>{f.estado}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="botones">
            <button className="boton secundario" onClick={ejemplos}>Añadir facturas de ejemplo</button>
            <button className="boton peligro" onClick={vaciar}>Borrar todas las facturas</button>
          </div>
        </>
      )}
    </section>
  );
}
