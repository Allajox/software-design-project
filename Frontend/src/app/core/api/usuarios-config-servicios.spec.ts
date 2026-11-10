import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_CONFIG } from '../config/api.config';
import { ConfiguracionApi } from './configuracion-api';
import { ConfiguracionApiService } from './configuracion-api.service';
import { UsuarioApi } from './usuarios-api';
import { UsuariosApiService } from './usuarios-api.service';

const unaCuenta = (sobre: Partial<UsuarioApi> = {}): UsuarioApi => ({
  id: 1, nombre: 'Ana Admin', correo: 'ana@sivcr.go.cr', rol: 'ADMIN', activo: true, creadoEn: '2026-11-01T08:00:00Z', ...sobre,
});
const datos = (sobre: Partial<{ nombre: string; correo: string; rol: 'ADMIN' | 'ANALISTA_TRANSITO' | 'CONSULTOR_PUBLICO'; contrasena: string }> = {}) => ({
  nombre: 'Luis Pérez', correo: 'luis@sivcr.go.cr', rol: 'ANALISTA_TRANSITO' as const, contrasena: 'Clave1234', ...sobre,
});
/** Deja pasar las promesas (las peticiones se esperan con firstValueFrom) */
const turno = () => new Promise((r) => setTimeout(r));

describe('UsuariosApiService (/api/users)', () => {
  let http: HttpTestingController;
  let servicio: UsuariosApiService;
  const url = `${API_CONFIG.baseUrl}/users`;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    servicio = TestBed.inject(UsuariosApiService);
    const carga = servicio.cargar();
    http.expectOne(url).flush([unaCuenta(), unaCuenta({ id: 2, nombre: 'Carla Consulta', correo: 'carla@sivcr.go.cr', rol: 'CONSULTOR_PUBLICO' })]);
    await carga;
  });
  afterEach(() => http.verify());

  it('carga la lista con GET y la deja en la señal, lista para mostrar', () => {
    expect(servicio.listo()).toBe(true);
    expect(servicio.cuentas().map((c) => c.correo)).toEqual(['ana@sivcr.go.cr', 'carla@sivcr.go.cr']);
    expect(servicio.resumen().activasPorRol.ADMIN).toBe(1);
  });

  it('si no se puede leer la lista, guarda la frase de error y no inventa cuentas', async () => {
    const otro = TestBed.inject(UsuariosApiService);
    const recarga = otro.cargar();
    http.expectOne(url).flush({ mensaje: 'x' }, { status: 403, statusText: 'Forbidden' });
    await recarga;
    expect(otro.error()).toContain('no tiene permiso');
    expect(otro.cuentas()).toHaveLength(2); // conserva lo último que sí llegó
    expect(otro.cargando()).toBe(false);
  });

  it('crea con POST (nombre y correo normalizados), agrega la cuenta devuelta y no guarda contraseña', async () => {
    const promesa = servicio.crear(datos({ nombre: '  Luis   Pérez ', correo: 'LUIS@sivcr.go.cr' }));
    const r = http.expectOne(url);
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({ nombre: 'Luis Pérez', correo: 'luis@sivcr.go.cr', rol: 'ANALISTA_TRANSITO', contrasena: 'Clave1234' });
    r.flush(unaCuenta({ id: 3, nombre: 'Luis Pérez', correo: 'luis@sivcr.go.cr', rol: 'ANALISTA_TRANSITO' }), { status: 201, statusText: 'Created' });
    const res = await promesa;
    expect(res.ok).toBe(true);
    expect(servicio.cuentas().map((c) => c.id)).toEqual([1, 2, 3]);
    expect(JSON.stringify(servicio.cuentas())).not.toContain('Clave1234');
  });

  it('antes de viajar revisa lo que puede: datos inválidos o correo repetido no llegan al servidor', async () => {
    const r1 = await servicio.crear(datos({ nombre: '', contrasena: 'corta' }));
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(Object.keys(r1.errores).sort()).toEqual(['contrasena', 'nombre']);
    const r2 = await servicio.crear(datos({ correo: 'ANA@sivcr.go.cr' }));
    expect(r2).toMatchObject({ ok: false, errores: { correo: 'Ya existe una cuenta con ese correo.' } });
    http.expectNone(url);
  });

  it('si el servidor responde 409 (otro administrador creó ese correo antes), lo muestra junto al campo correo', async () => {
    const promesa = servicio.crear(datos());
    http.expectOne(url).flush({ mensaje: 'Ya existe una cuenta con ese correo.' }, { status: 409, statusText: 'Conflict' });
    expect(await promesa).toEqual({ ok: false, errores: { correo: 'Ya existe una cuenta con ese correo.' } });
    expect(servicio.cuentas()).toHaveLength(2);
  });

  it('edita con PUT /users/{id} y reemplaza la cuenta; una contraseña vacía viaja vacía', async () => {
    const promesa = servicio.actualizar(2, datos({ nombre: 'Carla Consultora', correo: 'carla@sivcr.go.cr', rol: 'CONSULTOR_PUBLICO', contrasena: '' }), 1);
    const r = http.expectOne(`${url}/2`);
    expect(r.request.method).toBe('PUT');
    expect(r.request.body.contrasena).toBe('');
    r.flush(unaCuenta({ id: 2, nombre: 'Carla Consultora', correo: 'carla@sivcr.go.cr', rol: 'CONSULTOR_PUBLICO' }));
    expect((await promesa).ok).toBe(true);
    expect(servicio.cuentaPorId(2)?.nombre).toBe('Carla Consultora');
    expect(servicio.cuentas()).toHaveLength(2);
  });

  it('nadie cambia su propio rol: se avisa sin llamar al servidor', async () => {
    const r = await servicio.actualizar(1, datos({ nombre: 'Ana Admin', correo: 'ana@sivcr.go.cr', rol: 'ANALISTA_TRANSITO', contrasena: '' }), 1);
    expect(r).toMatchObject({ ok: false, errores: { rol: expect.stringContaining('propio rol') } });
    http.expectNone(`${url}/1`);
  });

  it('editar una cuenta que ya no está en la lista pide actualizarla', async () => {
    const r = await servicio.actualizar(99, datos(), 1);
    expect(r).toMatchObject({ ok: false, general: expect.stringContaining('ya no existe') });
    http.expectNone(`${url}/99`);
  });

  it('activa o desactiva con PUT /users/{id}/active {activo} y refleja lo que devuelve el servidor', async () => {
    const promesa = servicio.cambiarActivo(2, false);
    const r = http.expectOne(`${url}/2/active`);
    expect(r.request.method).toBe('PUT');
    expect(r.request.body).toEqual({ activo: false });
    r.flush(unaCuenta({ id: 2, rol: 'CONSULTOR_PUBLICO', activo: false }));
    expect((await promesa).ok).toBe(true);
    expect(servicio.cuentaPorId(2)?.activo).toBe(false);
    expect(servicio.resumen().desactivadas).toBe(1);
  });

  it('si el servidor no deja desactivar (última administradora), devuelve su motivo y no cambia la lista', async () => {
    const promesa = servicio.cambiarActivo(1, false);
    http.expectOne(`${url}/1/active`).flush(
      { mensaje: 'Es la única persona administradora activa. El sistema debe conservar al menos una.' },
      { status: 400, statusText: 'Bad Request' },
    );
    expect(await promesa).toEqual({ ok: false, mensaje: 'Es la única persona administradora activa. El sistema debe conservar al menos una.' });
    expect(servicio.cuentaPorId(1)?.activo).toBe(true);
  });
});

describe('ConfiguracionApiService (/api/config)', () => {
  let http: HttpTestingController;
  let servicio: ConfiguracionApiService;
  const url = `${API_CONFIG.baseUrl}/config`;
  const config: ConfiguracionApi = { wFallecido: 10, wHeridoGrave: 5, wHeridoLeve: 1, climaAdverso: ['LLUVIA'], calzadaAdversa: [] };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    servicio = TestBed.inject(ConfiguracionApiService);
  });
  afterEach(() => http.verify());

  it('carga con GET y deja la configuración vigente', async () => {
    const carga = servicio.cargar();
    expect(servicio.cargando()).toBe(true);
    const r = http.expectOne(url);
    expect(r.request.method).toBe('GET');
    r.flush(config);
    await carga;
    expect(servicio.vigente()).toEqual(config);
    expect(servicio.cargando()).toBe(false);
    expect(servicio.error()).toBeNull();
  });

  it('si no responde, deja la frase de error y ninguna configuración inventada', async () => {
    const carga = servicio.cargar();
    http.expectOne(url).error(new ProgressEvent('error'), { status: 0 });
    await carga;
    expect(servicio.vigente()).toBeNull();
    expect(servicio.error()).toContain('No se pudo conectar con el servidor');
  });

  it('guarda con PUT de la configuración completa y deja vigente lo que el servidor devolvió', async () => {
    const nueva: ConfiguracionApi = { ...config, wFallecido: 12.5, climaAdverso: ['LLUVIA', 'NEBLINA'] };
    const promesa = servicio.guardar(nueva);
    const r = http.expectOne(url);
    expect(r.request.method).toBe('PUT');
    expect(r.request.body).toEqual(nueva);
    r.flush({ ...nueva, climaAdverso: ['LLUVIA', 'NEBLINA'] });
    expect(await promesa).toEqual({ ok: true, config: nueva });
    expect(servicio.vigente()).toEqual(nueva);
  });

  it('si el servidor rechaza (400), devuelve su motivo y conserva la configuración anterior', async () => {
    const carga = servicio.cargar();
    http.expectOne(url).flush(config);
    await carga;
    const promesa = servicio.guardar({ ...config, wFallecido: 0, wHeridoGrave: 0, wHeridoLeve: 0 });
    http.expectOne(url).flush({ mensaje: 'Al menos un peso debe ser mayor que cero.' }, { status: 400, statusText: 'Bad Request' });
    expect(await promesa).toEqual({ ok: false, mensaje: 'Al menos un peso debe ser mayor que cero.' });
    expect(servicio.vigente()).toEqual(config);
  });

  it('un 403 (quien no es administrador) se explica sin datos técnicos', async () => {
    const promesa = servicio.guardar(config);
    http.expectOne(url).flush({}, { status: 403, statusText: 'Forbidden' });
    expect(await promesa).toEqual({ ok: false, mensaje: 'Su rol no tiene permiso para esta operación en el servidor.' });
  });
});
