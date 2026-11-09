import { enteroAleatorio, esHashValido, hashearContrasena, verificarContrasena } from './credenciales';
import { crearAlmacenInicial } from './semilla';

// Pocas iteraciones para que las pruebas sean rápidas; el formato y la lógica son los mismos
const RAPIDO = 2_000;

describe('Credenciales (contraseñas con hash)', () => {
  it('el hash no contiene la contraseña y tiene el formato esperado', async () => {
    const h = await hashearContrasena('Secreta123', RAPIDO);
    expect(h).not.toContain('Secreta123');
    expect(h.startsWith('pbkdf2-sha256$2000$')).toBe(true);
    expect(esHashValido(h)).toBe(true);
  });

  it('la misma contraseña da hashes distintos (sal aleatoria) pero ambos la verifican', async () => {
    const a = await hashearContrasena('Secreta123', RAPIDO);
    const b = await hashearContrasena('Secreta123', RAPIDO);
    expect(a).not.toBe(b);
    expect(await verificarContrasena('Secreta123', a)).toBe(true);
    expect(await verificarContrasena('Secreta123', b)).toBe(true);
  });

  it('rechaza una contraseña incorrecta, incluso una que solo difiere en mayúsculas o en un espacio', async () => {
    const h = await hashearContrasena('Secreta123', RAPIDO);
    expect(await verificarContrasena('secreta123', h)).toBe(false);
    expect(await verificarContrasena('Secreta123 ', h)).toBe(false);
    expect(await verificarContrasena('', h)).toBe(false);
  });

  it('funciona con tildes, ñ y emojis', async () => {
    const h = await hashearContrasena('Contraseña-ñandú-🔒1', RAPIDO);
    expect(await verificarContrasena('Contraseña-ñandú-🔒1', h)).toBe(true);
    expect(await verificarContrasena('Contrasena-nandu-🔒1', h)).toBe(false);
  });

  it('un hash mal formado nunca coincide (ni lanza error)', async () => {
    for (const basura of ['', 'texto', 'pbkdf2-sha256$x$y$z', 'Admin123', 'pbkdf2-sha256$120000$AAAA$BBBB']) {
      expect(await verificarContrasena('Admin123', basura)).toBe(false);
    }
  });

  it('no acepta un hash con iteraciones absurdas (una cuenta manipulada no puede congelar la pestaña)', async () => {
    const h = await hashearContrasena('Secreta123', RAPIDO);
    const enorme = h.replace('$2000$', '$900000000$');
    const ninguna = h.replace('$2000$', '$1$');
    expect(esHashValido(enorme)).toBe(false);
    expect(esHashValido(ninguna)).toBe(false);
    expect(await verificarContrasena('Secreta123', enorme)).toBe(false);
  });

  it('esHashValido rechaza lo que no es texto', () => {
    for (const v of [null, undefined, 42, {}, [], true]) expect(esHashValido(v)).toBe(false);
  });

  it('las cuentas de demostración guardan hashes válidos que corresponden a las contraseñas del login', async () => {
    const [admin, analista, consultor] = crearAlmacenInicial('2026-01-01T00:00:00.000Z').cuentas;
    expect(esHashValido(admin.clave)).toBe(true);
    expect(await verificarContrasena('Admin123', admin.clave)).toBe(true);
    expect(await verificarContrasena('Analista123', analista.clave)).toBe(true);
    expect(await verificarContrasena('Consulta123', consultor.clave)).toBe(true);
    expect(await verificarContrasena('Admin123', analista.clave)).toBe(false);
  });

  describe('enteroAleatorio', () => {
    it('siempre cae en [0, max) y alcanza todos los valores', () => {
      const vistos = new Set<number>();
      for (let i = 0; i < 500; i++) {
        const n = enteroAleatorio(6);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThan(6);
        vistos.add(n);
      }
      expect(vistos.size).toBe(6);
    });

    it('con max = 1 solo puede dar 0', () => {
      expect(enteroAleatorio(1)).toBe(0);
    });
  });
});
