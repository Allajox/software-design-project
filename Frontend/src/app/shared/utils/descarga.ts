/** Hace que el navegador descargue un archivo creado en memoria */
export function descargar(contenido: Blob, nombre: string): void {
  const url = URL.createObjectURL(contenido);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  // Se libera después de un momento para no cortar la descarga
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
