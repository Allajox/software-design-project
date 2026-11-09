import { TODOS_LOS_ROLES } from '../config/roles.config';
import { CuentaPublica } from './usuarios.models';
import { crearAlmacenInicial, adminDemo } from './semilla';
import {
  FILTRO_CUENTAS_VACIO, administradoresActivos, filtrarCuentas, garantizarAdministrador, generarContrasena,
  matrizPermisos, motivoNoCambiarRol, motivoNoDesactivar, motivoNoEliminar, normalizarCorreo, normalizarNombre,
  ordenarCuentas, requisitosContrasena, resumirCuentas, sanitizarAlmacen, validarContrasena, validarCorreo,
  validarFormulario, validarNombre,
} from './usuarios';

const AHORA = '2026-11-05T12:00:00.000Z';
const cuenta = (p: Partial<CuentaPublica> & { id: number }): CuentaPublica => ({
  nombre: `Persona ${p.id}`, correo: `p${p.id}@sivcr.go.cr`, rol: 'CONSULTOR_PUBLICO', activo: true,
  creadoEn: AHORA, ultimoAcceso: null, ...p,
});

describe('Gestión de usuarios (RF-9)', () => {
  describe('normalizar', () => {
    it('el nombre pierde espacios dobles, de los bordes y caracteres de control', () => {
      expect(normalizarNombre('  Ana   María \n Pérez\u0007 ')).toBe('Ana María Pérez');
    });
    it('el correo se guarda en minúsculas y sin espacios', () => {
      expect(normalizarCorreo('  ANA@Sivcr.GO.cr ')).toBe('ana@sivcr.go.cr');
    });
  });

  describe('validarNombre', () => {
    it('acepta nombres reales, con tildes y ñ', () => {
      for (const n of ['Ana', 'José Núñez', 'María de los Ángeles Chaves']) expect(validarNombre(n)).toBeNull();
    });
    it('rechaza vacío, muy corto, muy largo y sin letras', () => {
      expect(validarNombre('   ')).toMatch(/obligatorio/);
      expect(validarNombre('Al')).toMatch(/al menos 3/);
      expect(validarNombre('x'.repeat(61))).toMatch(/60/);
      expect(validarNombre('12345')).toMatch(/letras/);
    });
  });

  describe('validarCorreo', () => {
    const existentes = [cuenta({ id: 1, correo: 'ana@sivcr.go.cr' }), cuenta({ id: 2, correo: 'luis@sivcr.go.cr' })];

    it('acepta un correo normal', () => {
      expect(validarCorreo('nuevo@institucion.go.cr', existentes)).toBeNull();
    });
    it('rechaza lo que no parece un correo', () => {
      for (const malo of ['', 'sin-arroba', 'a@b', 'a@@b.cr', 'con espacio@x.cr', '@x.cr', 'a@.cr']) {
        expect(validarCorreo(malo, existentes), malo).not.toBeNull();
      }
    });
    it('detecta repetidos sin importar mayúsculas ni espacios', () => {
      expect(validarCorreo('  ANA@sivcr.go.cr ', existentes)).toMatch(/Ya existe/);
    });
    it('al editar, el correo de la propia cuenta no cuenta como repetido, el de otra sí', () => {
      expect(validarCorreo('ana@sivcr.go.cr', existentes, 1)).toBeNull();
      expect(validarCorreo('luis@sivcr.go.cr', existentes, 1)).toMatch(/Ya existe/);
    });
    it('rechaza correos de más de 100 caracteres', () => {
      expect(validarCorreo('a'.repeat(95) + '@x.cr', existentes)).toBeNull(); // 100 justos: se permite
      expect(validarCorreo('a'.repeat(96) + '@x.cr', existentes)).toMatch(/100/); // 101: no
    });
  });

  describe('contraseña', () => {
    it('acepta una que cumple todo, incluidas las de demostración', () => {
      for (const c of ['Admin123', 'Analista123', 'Consulta123', 'Ñandú2026x']) expect(validarContrasena(c), c).toBeNull();
    });
    it('rechaza las que no cumplen y dice qué falta', () => {
      expect(validarContrasena('')).toMatch(/obligatoria/);
      for (const mala of ['Ab1', 'abcdefgh1', 'ABCDEFGH1', 'Abcdefghi']) expect(validarContrasena(mala), mala).toMatch(/al menos 8/);
      expect(validarContrasena('Aa1' + 'x'.repeat(70))).toMatch(/64/);
    });
    it('requisitosContrasena marca cada condición por separado', () => {
      const estado = (c: string) => Object.fromEntries(requisitosContrasena(c).map((r) => [r.id, r.cumple]));
      expect(estado('')).toEqual({ largo: false, mayuscula: false, minuscula: false, numero: false });
      expect(estado('abc')).toEqual({ largo: false, mayuscula: false, minuscula: true, numero: false });
      expect(estado('Abcdefg1')).toEqual({ largo: true, mayuscula: true, minuscula: true, numero: true });
    });
  });

  describe('validarFormulario', () => {
    const cuentas = [cuenta({ id: 1, correo: 'ana@sivcr.go.cr' })];
    const valido = { nombre: 'Nueva Persona', correo: 'nueva@sivcr.go.cr', rol: 'ANALISTA_TRANSITO' as const, contrasena: 'Clave1234' };

    it('un formulario correcto no tiene errores', () => {
      expect(validarFormulario(valido, { cuentas })).toEqual({});
    });
    it('al crear la contraseña es obligatoria', () => {
      expect(validarFormulario({ ...valido, contrasena: '' }, { cuentas }).contrasena).toMatch(/obligatoria/);
    });
    it('al editar, la contraseña vacía significa «no cambiarla», pero si se escribe debe cumplir', () => {
      expect(validarFormulario({ ...valido, contrasena: '' }, { cuentas, idEditando: 1 })).toEqual({});
      expect(validarFormulario({ ...valido, contrasena: 'corta' }, { cuentas, idEditando: 1 }).contrasena).toBeDefined();
    });
    it('reúne todos los errores a la vez', () => {
      const e = validarFormulario({ nombre: '', correo: 'x', rol: 'SUPERUSUARIO' as never, contrasena: '' }, { cuentas });
      expect(Object.keys(e).sort()).toEqual(['contrasena', 'correo', 'nombre', 'rol']);
    });
  });

  describe('generarContrasena', () => {
    /** Generador repetible para la prueba */
    const semilla = (s: number) => () => {
      let x = s;
      return (max: number) => {
        x = (x * 1103515245 + 12345) % 2147483648;
        return x % max;
      };
    };

    it('siempre cumple la política, con 200 secuencias distintas', () => {
      for (let s = 1; s <= 200; s++) {
        const c = generarContrasena(semilla(s)());
        expect(validarContrasena(c), c).toBeNull();
        expect(c).toHaveLength(12);
      }
    });
    it('no usa caracteres que se confunden al dictarlos (0, O, 1, l, I)', () => {
      for (let s = 1; s <= 200; s++) expect(generarContrasena(semilla(s)())).not.toMatch(/[0O1lI]/);
    });
    it('respeta el largo pedido pero nunca baja del mínimo de la política', () => {
      expect(generarContrasena(semilla(7)(), 16)).toHaveLength(16);
      expect(generarContrasena(semilla(7)(), 3)).toHaveLength(8);
    });
    it('con otra secuencia da otra contraseña', () => {
      expect(generarContrasena(semilla(1)())).not.toBe(generarContrasena(semilla(2)()));
    });
  });

  describe('proteger al último administrador', () => {
    const admin1 = cuenta({ id: 1, rol: 'ADMIN' });
    const admin2 = cuenta({ id: 2, rol: 'ADMIN' });
    const analista = cuenta({ id: 3, rol: 'ANALISTA_TRANSITO' });

    it('administradoresActivos ignora desactivados y otros roles', () => {
      const lista = [admin1, { ...admin2, activo: false }, analista];
      expect(administradoresActivos(lista).map((c) => c.id)).toEqual([1]);
    });

    describe('desactivar', () => {
      it('nadie puede desactivarse a sí mismo', () => {
        expect(motivoNoDesactivar(1, [admin1, admin2], 1)).toMatch(/propia cuenta/);
      });
      it('no se puede desactivar a la única persona administradora activa', () => {
        expect(motivoNoDesactivar(1, [admin1, analista], 3)).toMatch(/única persona administradora/);
      });
      it('sí se puede si queda otra persona administradora activa', () => {
        expect(motivoNoDesactivar(1, [admin1, admin2], 2)).toBeNull();
      });
      it('una segunda administradora ya desactivada no cuenta como respaldo', () => {
        expect(motivoNoDesactivar(1, [admin1, { ...admin2, activo: false }], 3)).toMatch(/única/);
      });
      it('desactivar a quien no es administrador siempre se puede', () => {
        expect(motivoNoDesactivar(3, [admin1, analista], 1)).toBeNull();
      });
      it('una cuenta que no existe o que ya está desactivada no es un problema', () => {
        expect(motivoNoDesactivar(99, [admin1], 1)).toBeNull();
        expect(motivoNoDesactivar(3, [admin1, { ...analista, activo: false }], 1)).toBeNull();
      });
    });

    describe('eliminar', () => {
      it('nadie puede eliminarse a sí mismo', () => {
        expect(motivoNoEliminar(1, [admin1, admin2], 1)).toMatch(/propia cuenta/);
      });
      it('no se puede eliminar a la única persona administradora activa', () => {
        expect(motivoNoEliminar(1, [admin1, analista], 3)).toMatch(/única/);
      });
      it('sí se puede eliminar a una administradora si queda otra activa', () => {
        expect(motivoNoEliminar(2, [admin1, admin2], 1)).toBeNull();
      });
      it('se puede eliminar a una administradora ya desactivada aunque sea la «única» administradora', () => {
        expect(motivoNoEliminar(2, [admin1, { ...admin2, activo: false }], 1)).toBeNull();
      });
      it('eliminar a un analista siempre se puede', () => {
        expect(motivoNoEliminar(3, [admin1, analista], 1)).toBeNull();
      });
    });

    describe('cambiar rol', () => {
      it('nadie puede cambiarse su propio rol', () => {
        expect(motivoNoCambiarRol(1, 'ANALISTA_TRANSITO', [admin1, admin2], 1)).toMatch(/propio rol/);
      });
      it('no se puede quitar el rol a la única persona administradora activa', () => {
        expect(motivoNoCambiarRol(1, 'ANALISTA_TRANSITO', [admin1, analista], 3)).toMatch(/única/);
      });
      it('sí se puede si queda otra administradora activa', () => {
        expect(motivoNoCambiarRol(1, 'CONSULTOR_PUBLICO', [admin1, admin2], 2)).toBeNull();
      });
      it('ascender a alguien a administrador siempre se puede', () => {
        expect(motivoNoCambiarRol(3, 'ADMIN', [admin1, analista], 1)).toBeNull();
      });
      it('«cambiar» al mismo rol no es un cambio', () => {
        expect(motivoNoCambiarRol(1, 'ADMIN', [admin1], 1)).toBeNull();
      });
    });

    it('en cualquier secuencia permitida siempre queda al menos una administradora activa', () => {
      // Se intentan todas las operaciones sobre un conjunto pequeño; solo se aplican las permitidas
      let lista: CuentaPublica[] = [admin1, admin2, analista, cuenta({ id: 4, rol: 'ADMIN', activo: false })];
      const actual = 1;
      for (let paso = 0; paso < 40; paso++) {
        const id = 1 + (paso % 4);
        const op = paso % 3;
        if (op === 0 && !motivoNoDesactivar(id, lista, actual)) lista = lista.map((c) => (c.id === id ? { ...c, activo: !c.activo } : c));
        if (op === 1 && !motivoNoCambiarRol(id, 'CONSULTOR_PUBLICO', lista, actual)) lista = lista.map((c) => (c.id === id ? { ...c, rol: 'CONSULTOR_PUBLICO' } : c));
        if (op === 2 && !motivoNoEliminar(id, lista, actual)) lista = lista.filter((c) => c.id !== id);
        expect(administradoresActivos(lista).length).toBeGreaterThan(0);
      }
    });
  });

  describe('buscar, ordenar y resumir', () => {
    const lista = [
      cuenta({ id: 1, nombre: 'José Núñez', correo: 'jose@sivcr.go.cr', rol: 'ADMIN' }),
      cuenta({ id: 2, nombre: 'Ana Zúñiga', correo: 'ana@otra.cr', rol: 'ANALISTA_TRANSITO' }),
      cuenta({ id: 3, nombre: 'Beatriz Mora', correo: 'bea@sivcr.go.cr', activo: false }),
    ];

    it('sin filtros devuelve todo', () => {
      expect(filtrarCuentas(lista, FILTRO_CUENTAS_VACIO)).toHaveLength(3);
    });
    it('el texto busca en nombre y correo, sin importar tildes ni mayúsculas', () => {
      expect(filtrarCuentas(lista, { ...FILTRO_CUENTAS_VACIO, texto: 'JOSE' }).map((c) => c.id)).toEqual([1]);
      expect(filtrarCuentas(lista, { ...FILTRO_CUENTAS_VACIO, texto: 'zuniga' }).map((c) => c.id)).toEqual([2]);
      expect(filtrarCuentas(lista, { ...FILTRO_CUENTAS_VACIO, texto: '@otra' }).map((c) => c.id)).toEqual([2]);
      expect(filtrarCuentas(lista, { ...FILTRO_CUENTAS_VACIO, texto: 'xyz' })).toEqual([]);
    });
    it('filtra por rol y por estado, y combina todo con «y»', () => {
      expect(filtrarCuentas(lista, { ...FILTRO_CUENTAS_VACIO, rol: 'ADMIN' }).map((c) => c.id)).toEqual([1]);
      expect(filtrarCuentas(lista, { ...FILTRO_CUENTAS_VACIO, estado: 'desactivados' }).map((c) => c.id)).toEqual([3]);
      expect(filtrarCuentas(lista, { ...FILTRO_CUENTAS_VACIO, estado: 'activos' }).map((c) => c.id)).toEqual([1, 2]);
      expect(filtrarCuentas(lista, { texto: 'sivcr', rol: 'CONSULTOR_PUBLICO', estado: 'activos' })).toEqual([]);
    });
    it('ordena por nombre en español (Ángel antes que Beatriz) sin cambiar la lista original', () => {
      const orig = [cuenta({ id: 1, nombre: 'Beatriz' }), cuenta({ id: 2, nombre: 'Ángel' }), cuenta({ id: 3, nombre: 'Carlos' })];
      expect(ordenarCuentas(orig).map((c) => c.nombre)).toEqual(['Ángel', 'Beatriz', 'Carlos']);
      expect(orig[0].nombre).toBe('Beatriz');
    });
    it('el resumen cuenta activas por rol y desactivadas aparte', () => {
      expect(resumirCuentas(lista)).toEqual({
        total: 3, activas: 2, desactivadas: 1,
        activasPorRol: { ADMIN: 1, ANALISTA_TRANSITO: 1, CONSULTOR_PUBLICO: 0 },
      });
      expect(resumirCuentas([]).total).toBe(0);
    });
  });

  describe('matrizPermisos', () => {
    const menu = [
      { titulo: 'Análisis', items: [
        { ruta: 'dashboard', etiqueta: 'Dashboard', roles: TODOS_LOS_ROLES },
        { ruta: 'ingesta', etiqueta: 'Carga', roles: ['ADMIN', 'ANALISTA_TRANSITO'] as const },
      ] },
      { titulo: 'Administración', items: [{ ruta: 'usuarios', etiqueta: 'Usuarios', roles: ['ADMIN'] as const }] },
    ];

    it('una fila por pantalla, con sí/no para cada rol', () => {
      const m = matrizPermisos(menu);
      expect(m.map((f) => f.ruta)).toEqual(['dashboard', 'ingesta', 'usuarios']);
      expect(m[0].porRol).toEqual({ ADMIN: true, ANALISTA_TRANSITO: true, CONSULTOR_PUBLICO: true });
      expect(m[1].porRol).toEqual({ ADMIN: true, ANALISTA_TRANSITO: true, CONSULTOR_PUBLICO: false });
      expect(m[2].porRol).toEqual({ ADMIN: true, ANALISTA_TRANSITO: false, CONSULTOR_PUBLICO: false });
      expect(m[2].seccion).toBe('Administración');
    });
  });

  describe('sanitizarAlmacen (lo guardado nunca es de fiar)', () => {
    const buena = crearAlmacenInicial(AHORA).cuentas[0];

    it('devuelve un almacén vacío y válido si lo guardado no es un objeto', () => {
      for (const basura of [null, undefined, 42, 'x', [], true]) {
        expect(sanitizarAlmacen(basura, AHORA)).toEqual({ version: 1, proximoId: 1, cuentas: [] });
      }
    });
    it('conserva una cuenta correcta tal cual', () => {
      const a = sanitizarAlmacen({ proximoId: 10, cuentas: [buena] }, AHORA);
      expect(a.cuentas).toEqual([buena]);
      expect(a.proximoId).toBe(10);
    });
    it('descarta cuentas con rol desconocido, hash inválido, id inválido o correo inválido', () => {
      const a = sanitizarAlmacen({
        cuentas: [
          { ...buena, id: 2, correo: 'a@x.cr', rol: 'SUPERUSUARIO' },
          { ...buena, id: 3, correo: 'b@x.cr', clave: 'Admin123' },
          { ...buena, id: -4, correo: 'c@x.cr' },
          { ...buena, id: 5.5, correo: 'd@x.cr' },
          { ...buena, id: 6, correo: 'sin-arroba' },
          { ...buena, id: 7, correo: 'e@x.cr', nombre: '' },
          null, 7, 'x',
          buena,
        ],
      }, AHORA);
      expect(a.cuentas.map((c) => c.id)).toEqual([1]);
    });
    it('descarta ids y correos repetidos (gana la primera)', () => {
      const a = sanitizarAlmacen({
        cuentas: [buena, { ...buena, correo: 'otro@x.cr' }, { ...buena, id: 9, correo: buena.correo.toUpperCase() }],
      }, AHORA);
      expect(a.cuentas).toHaveLength(1);
    });
    it('«activo» solo es verdadero si está guardado exactamente como true', () => {
      const a = sanitizarAlmacen({ cuentas: [{ ...buena, activo: 'true' }] }, AHORA);
      expect(a.cuentas[0].activo).toBe(false);
    });
    it('el próximo id nunca queda por debajo de los ya usados, ni baja aunque se borre al último', () => {
      expect(sanitizarAlmacen({ proximoId: 1, cuentas: [{ ...buena, id: 8 }] }, AHORA).proximoId).toBe(9);
      expect(sanitizarAlmacen({ proximoId: 20, cuentas: [{ ...buena, id: 8 }] }, AHORA).proximoId).toBe(20);
    });
    it('limpia fechas inválidas y limita los textos', () => {
      const a = sanitizarAlmacen({
        cuentas: [{ ...buena, creadoEn: 'ayer', ultimoAcceso: 'nunca', nombre: 'A'.repeat(500) }],
      }, AHORA);
      expect(a.cuentas[0].creadoEn).toBe(AHORA);
      expect(a.cuentas[0].ultimoAcceso).toBeNull();
      expect(a.cuentas[0].nombre.length).toBeLessThanOrEqual(60);
    });
  });

  describe('garantizarAdministrador', () => {
    const demo = adminDemo(AHORA);
    const base = crearAlmacenInicial(AHORA);

    it('si ya hay una administradora activa, no toca nada', () => {
      const r = garantizarAdministrador(base, demo);
      expect(r.restaurada).toBe(false);
      expect(r.almacen).toBe(base);
    });
    it('si no queda ninguna activa, reactiva la cuenta de demostración', () => {
      const sinAdmin = { ...base, cuentas: base.cuentas.map((c) => (c.rol === 'ADMIN' ? { ...c, activo: false } : c)) };
      const r = garantizarAdministrador(sinAdmin, demo);
      expect(r.restaurada).toBe(true);
      expect(administradoresActivos(r.almacen.cuentas)).toHaveLength(1);
      expect(r.almacen.cuentas.filter((c) => c.correo === demo.correo)).toHaveLength(1);
    });
    it('si el almacén quedó sin cuentas, agrega la de demostración y avanza el próximo id', () => {
      const r = garantizarAdministrador({ version: 1, proximoId: 1, cuentas: [] }, demo);
      expect(r.restaurada).toBe(true);
      expect(r.almacen.cuentas).toEqual([demo]);
      expect(r.almacen.proximoId).toBeGreaterThan(demo.id);
    });
  });
});
