import { Injectable, inject } from '@angular/core';
import { ROL_ETIQUETA } from '../models/auth.models';
import { Siniestro } from '../models/siniestro.models';
import { descargar } from '../../shared/utils/descarga';
import { AuthService } from './auth.service';
import { aCsv, construirTabla, nombreArchivo } from './exportacion';
import { COLUMNAS } from './tabla-siniestros';

/** El PDF es una hoja imprimible: más de esto lo vuelve inmanejable (para todo está el CSV o el Excel) */
export const MAX_FILAS_PDF = 2000;

const NOMBRE_BASE = 'sivcr-siniestros';

/**
 * Exportación de los registros filtrados (RF-4). Esta clase solo se ocupa de "escribir el archivo
 * y entregarlo al navegador"; qué columnas y valores salen lo decide `exportacion.ts` (sin interfaz).
 * Las bibliotecas de Excel y PDF se cargan solo cuando alguien exporta, para no hacer más lenta
 * la carga inicial de la aplicación.
 */
@Injectable({ providedIn: 'root' })
export class ExportacionService {
  private readonly auth = inject(AuthService);

  exportarCsv(datos: readonly Siniestro[], nombreBase: string = NOMBRE_BASE): void {
    // El BOM (﻿) hace que Excel reconozca las tildes y la ñ
    const blob = new Blob(['﻿', aCsv(construirTabla(datos))], { type: 'text/csv;charset=utf-8' });
    descargar(blob, nombreArchivo(nombreBase, 'csv'));
  }

  async exportarExcel(datos: readonly Siniestro[], filtros: readonly string[]): Promise<void> {
    const { default: escribirXlsx } = await import('write-excel-file/universal');
    const tabla = construirTabla(datos);

    const encabezado = tabla.columnas.map((titulo) => ({
      value: titulo,
      fontWeight: 'bold' as const,
      textColor: '#ffffff',
      backgroundColor: '#0b3d91',
    }));
    const hojaDatos = [encabezado, ...tabla.filas];

    const negrita = (value: string) => ({ value, fontWeight: 'bold' as const });
    const hojaFiltros = [
      [negrita('SIVCR - Registros de siniestros viales')],
      ['Generado', this.fechaHora()],
      ['Generado por', this.quienGenera()],
      ['Total de registros', datos.length],
      [],
      [negrita('Filtros aplicados')],
      ...(filtros.length ? filtros.map((f) => [f]) : [['Sin filtros (todos los registros)']]),
    ];

    const blob = await escribirXlsx([
      { data: hojaDatos, sheet: 'Siniestros', columns: COLUMNAS.map((c) => ({ width: c.ancho })), stickyRowsCount: 1 },
      { data: hojaFiltros, sheet: 'Filtros', columns: [{ width: 30 }, { width: 40 }] },
    ]).toBlob();
    descargar(blob, nombreArchivo(NOMBRE_BASE, 'xlsx'));
  }

  /** @returns cuántas filas entraron al PDF y cuántas había (si hay más que el máximo, se recorta) */
  async exportarPdf(
    datos: readonly Siniestro[],
    filtros: readonly string[],
  ): Promise<{ incluidas: number; total: number }> {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);

    const incluidas = datos.slice(0, MAX_FILAS_PDF);
    const columnas = COLUMNAS.filter((c) => c.enPdf);
    const tabla = construirTabla(incluidas, columnas);

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const ancho = doc.internal.pageSize.getWidth();
    const alto = doc.internal.pageSize.getHeight();

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(11, 61, 145);
    doc.text('SIVCR - Registros de siniestros viales', 10, 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(60, 70, 85);
    const resumenFiltros = filtros.length ? filtros.join('  |  ') : 'Sin filtros (todos los registros)';
    const lineas: string[] = [
      `Generado: ${this.fechaHora()}  |  Por: ${this.quienGenera()}  |  Registros: ${datos.length}`,
      ...doc.splitTextToSize(`Filtros: ${resumenFiltros}`, ancho - 20),
    ];
    if (datos.length > incluidas.length) {
      lineas.push(`Este PDF incluye los primeros ${incluidas.length} de ${datos.length} registros. Para todos, use CSV o Excel.`);
    }
    doc.text(lineas, 10, 18);

    autoTable(doc, {
      head: [tabla.columnas],
      body: tabla.filas.map((fila) => fila.map(String)),
      startY: 18 + lineas.length * 4 + 2,
      margin: { left: 10, right: 10, bottom: 12 },
      styles: { fontSize: 6.5, cellPadding: 1.1, overflow: 'ellipsize' },
      headStyles: { fillColor: [11, 61, 145], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [243, 246, 251] },
      columnStyles: Object.fromEntries(
        columnas.map((c, i) => [i, { halign: c.alinear === 'der' ? 'right' : 'left' }]),
      ),
    });

    const paginas = doc.getNumberOfPages();
    doc.setFontSize(7.5);
    doc.setTextColor(120, 125, 135);
    for (let i = 1; i <= paginas; i++) {
      doc.setPage(i);
      doc.text(`Pagina ${i} de ${paginas}`, ancho - 10, alto - 6, { align: 'right' });
    }

    descargar(doc.output('blob'), nombreArchivo(NOMBRE_BASE, 'pdf'));
    return { incluidas: incluidas.length, total: datos.length };
  }

  private fechaHora(): string {
    return new Date().toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' });
  }

  private quienGenera(): string {
    const u = this.auth.usuario();
    return u ? `${u.nombre} (${ROL_ETIQUETA[u.rol]})` : 'Usuario no identificado';
  }
}
