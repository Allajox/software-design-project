import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ConfiguracionApi } from '../../core/api/configuracion-api';
import { UsuarioApi } from '../../core/api/usuarios-api';
import { API_CONFIG } from '../../core/config/api.config';
import { AvisosService } from '../../core/services/avisos.service';
import { imitarDialogoNativo } from '../../shared/testing/dialogo-jsdom';
import { UsuariosApiComponent } from './usuarios-api.component';

const config: ConfiguracionApi = {
  wFallecido: 10, wHeridoGrave: 5, wHeridoLeve: 1, climaAdverso: ['LLUVIA'], calzadaAdversa: ['MOJADA'],
};
const ana: UsuarioApi = { id: 1, nombre: 'Ana Admin', correo: 'ana@sivcr.go.cr', rol: 'ADMIN', activo: true, creadoEn: '2026-11-01T12:00:00Z' };
const luis: UsuarioApi = { id: 2, nombre: 'Luis Analista', correo: 'luis@sivcr.go.cr', rol: 'ANALISTA_TRANSITO', activo: true, creadoEn: '2026-11-02T12:00:00Z' };
const carla: UsuarioApi = { id: 3, nombre: 'Carla Consultora', correo: 'carla@sivcr.go.cr', rol: 'CONSULTOR_PUBLICO', activo: false, creadoEn: '2026-11-03T12:00:00Z' };

describe('UsuariosApiComponent (Usuarios y Configuración)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<UsuariosApiComponent>;
  const useMockOriginal = API_CONFIG.useMock;
  const url = (ruta: string) => `${API_CONFIG.baseUrl}${ruta}`;
  const html = () => fixture.nativeElement as HTMLElement;
  /** Deja pasar las promesas (las peticiones se esperan con firstValueFrom) y refresca la vista */
  const estable = async () => { await fixture.whenStable(); await new Promise((r) => setTimeout(r)); fixture.detectChanges(); };
  const texto = () => (html().textContent ?? '').replace(/\s+/g, ' ');
  const filaDe = (correo: string) => html().querySelector<HTMLElement>(`tr[data-correo="${correo}"]`)!;
  const boton = (contenedor: ParentNode, nombre: RegExp) =>
    Array.from(contenedor.querySelectorAll<HTMLButtonElement>('button')).find((b) => nombre.test(b.textContent ?? ''))!;
  const peso = (clave: string) => html().querySelector<HTMLInputElement>('#peso-' + clave)!;
  const escribir = (el: HTMLInputElement, valor: string) => {
    el.value = valor;
    el.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const marcador = (valor: string) => html().querySelector<HTMLInputElement>(`input[type=checkbox][value="${valor}"]`)!;
  const guardarPesos = () => boton(html(), /Guardar Pesos|Guardando/);
  const guardarDefinicion = () => boton(html(), /Guardar definición|Guardando/);
  const columna = (id: string) => html().querySelector<HTMLElement>(id)!.closest('section')!;
  const campo = (id: string) => html().querySelector<HTMLInputElement>('#' + id)!;
  const marcar = (valor: string, marcado: boolean) => {
    marcador(valor).checked = marcado;
    marcador(valor).dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  const avisos = () => TestBed.inject(AvisosService).avisos().map((a) => `${a.tipo}: ${a.texto}`);

  /** Crea la pantalla y responde lo que pide al abrir (configuración y cuentas) */
  const abrir = async (cuentas: UsuarioApi[] = [ana, luis, carla], cfg: ConfiguracionApi = config) => {
    localStorage.setItem('sivcr_session', JSON.stringify({ token: 't', usuario: { id: 1, nombre: 'Ana Admin', correo: 'ana@sivcr.go.cr', rol: 'ADMIN' } }));
    await TestBed.configureTestingModule({
      imports: [UsuariosApiComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(UsuariosApiComponent);
    fixture.detectChanges();
    http.expectOne(url('/config')).flush(cfg);
    http.expectOne(url('/users')).flush(cuentas);
    await estable();
  };

  beforeEach(() => {
    API_CONFIG.useMock = false;
    localStorage.clear();
    imitarDialogoNativo();
  });
  afterEach(() => {
    http.verify();
    API_CONFIG.useMock = useMockOriginal;
    localStorage.clear();
  });

  describe('Peso del ISS y Condiciones Adversas', () => {
    it('muestra las tres columnas del Figma y lo que tiene el servidor', async () => {
      await abrir();
      expect(html().querySelector('h1')?.textContent).toBe('Usuarios y Configuración');
      expect(Array.from(html().querySelectorAll('.columna h2')).map((h) => h.textContent)).toEqual(
        ['Crear Usuario', 'Peso del ISS', 'Condiciones Adversas']);
      expect(columna('#titulo-pesos').textContent).toContain('Peso: fallecidos');
      expect(columna('#titulo-pesos').textContent).toContain('Peso: heridos graves');
      expect(columna('#titulo-pesos').textContent).toContain('Peso: heridos leves');
      expect(peso('wFallecido').value).toBe('10');
      expect(peso('wHeridoGrave').value).toBe('5');
      expect(peso('wHeridoLeve').value).toBe('1');
      expect(marcador('LLUVIA').checked).toBe(true);
      expect(marcador('NEBLINA').checked).toBe(false);
      expect(marcador('MOJADA').checked).toBe(true);
      expect(marcador('RESBALADIZA').checked).toBe(false);
      expect(texto()).toContain('ISS = (10·fallecidos + 5·heridos graves + 1·heridos leves) ÷ total de siniestros');
    });

    it('el servidor solo tiene tres pesos: no hay un peso para «solo daños materiales»', async () => {
      await abrir();
      expect(html().querySelectorAll('#titulo-pesos ~ form input[type=text]')).toHaveLength(3);
      expect(texto().toLowerCase()).not.toContain('daños materiales');
    });

    it('cada botón se enciende solo con los cambios de su columna', async () => {
      await abrir();
      expect(guardarPesos().disabled).toBe(true);
      expect(guardarDefinicion().disabled).toBe(true);

      escribir(peso('wFallecido'), '12,5');
      expect(guardarPesos().disabled).toBe(false);
      expect(guardarDefinicion().disabled).toBe(true);
      expect(texto()).toContain('12,5·fallecidos'); // la fórmula sigue lo escrito

      marcar('NEBLINA', true);
      expect(guardarDefinicion().disabled).toBe(false);
      expect(texto()).toContain('Hay cambios sin guardar.');
    });

    it('«Guardar Pesos» envía los pesos como número y las condiciones que ya estaban guardadas, no las que se estén marcando', async () => {
      await abrir();
      escribir(peso('wFallecido'), '12,5');
      marcar('NEBLINA', true); // sin guardar todavía

      guardarPesos().click();
      const r: TestRequest = http.expectOne(url('/config'));
      expect(r.request.method).toBe('PUT');
      expect(r.request.body).toEqual({ wFallecido: 12.5, wHeridoGrave: 5, wHeridoLeve: 1, climaAdverso: ['LLUVIA'], calzadaAdversa: ['MOJADA'] });
      r.flush({ wFallecido: 12.5, wHeridoGrave: 5, wHeridoLeve: 1, climaAdverso: ['LLUVIA'], calzadaAdversa: ['MOJADA'] });
      await estable();

      expect(avisos().some((a) => a.startsWith('exito: Pesos guardados'))).toBe(true);
      expect(guardarPesos().disabled).toBe(true); // ya no hay pesos pendientes
      expect(peso('wFallecido').value).toBe('12,5');
      expect(marcador('NEBLINA').checked).toBe(true); // lo marcado en la otra columna sigue ahí
      expect(guardarDefinicion().disabled).toBe(false);
    });

    it('«Guardar definición» envía el clima y la calzada marcados y los pesos que ya estaban guardados', async () => {
      await abrir();
      marcar('NEBLINA', true);
      marcar('MOJADA', false);
      escribir(peso('wFallecido'), '99'); // sin guardar todavía

      guardarDefinicion().click();
      const r: TestRequest = http.expectOne(url('/config'));
      expect(r.request.method).toBe('PUT');
      expect(r.request.body.wFallecido).toBe(10);
      expect(r.request.body.wHeridoGrave).toBe(5);
      expect(r.request.body.wHeridoLeve).toBe(1);
      expect([...r.request.body.climaAdverso].sort()).toEqual(['LLUVIA', 'NEBLINA']);
      expect(r.request.body.calzadaAdversa).toEqual([]);
      r.flush({ wFallecido: 10, wHeridoGrave: 5, wHeridoLeve: 1, climaAdverso: ['LLUVIA', 'NEBLINA'], calzadaAdversa: [] });
      await estable();

      expect(avisos().some((a) => a.startsWith('exito: Definición guardada'))).toBe(true);
      expect(guardarDefinicion().disabled).toBe(true);
      expect(peso('wFallecido').value).toBe('99'); // el peso escrito sigue pendiente
      expect(guardarPesos().disabled).toBe(false);
    });

    it('mientras uno de los dos guarda, el otro botón espera (el servidor reemplaza toda la configuración)', async () => {
      await abrir();
      escribir(peso('wFallecido'), '12');
      marcar('NEBLINA', true);
      guardarPesos().click();
      fixture.detectChanges();
      expect(guardarDefinicion().disabled).toBe(true);
      http.expectOne(url('/config')).flush({ wFallecido: 12, wHeridoGrave: 5, wHeridoLeve: 1, climaAdverso: ['LLUVIA'], calzadaAdversa: ['MOJADA'] });
      await estable();
      expect(guardarDefinicion().disabled).toBe(false);
    });

    it('un peso inválido se señala junto a su campo y no se envía nada', async () => {
      await abrir();
      escribir(peso('wHeridoGrave'), 'abc');
      guardarPesos().click();
      await estable();
      http.expectNone(url('/config'));
      expect(html().querySelector('#ayuda-wHeridoGrave .error')?.textContent).toContain('Escriba un número');
      expect(peso('wHeridoGrave').getAttribute('aria-invalid')).toBe('true');
      escribir(peso('wHeridoGrave'), '4'); // al corregir, el aviso desaparece
      expect(html().querySelector('#ayuda-wHeridoGrave .error')).toBeNull();
    });

    it('con los tres pesos en cero lo explica y no se envía', async () => {
      await abrir();
      escribir(peso('wFallecido'), '0');
      escribir(peso('wHeridoGrave'), '0');
      escribir(peso('wHeridoLeve'), '0');
      guardarPesos().click();
      await estable();
      http.expectNone(url('/config'));
      expect(texto()).toContain('Al menos un peso debe ser mayor que cero');
    });

    it('si el servidor rechaza los pesos, muestra su motivo y conserva lo escrito para corregirlo', async () => {
      await abrir();
      escribir(peso('wFallecido'), '20');
      guardarPesos().click();
      http.expectOne(url('/config')).flush({ mensaje: 'El peso wFallecido no puede pasar de 999999.99.' }, { status: 400, statusText: 'Bad Request' });
      await estable();
      expect(columna('#titulo-pesos').querySelector('.error.general')?.textContent).toContain('no puede pasar de 999999.99');
      expect(peso('wFallecido').value).toBe('20');
      expect(guardarPesos().disabled).toBe(false);
    });

    it('si el servidor rechaza la definición, el motivo sale en su columna y las marcas se conservan', async () => {
      await abrir();
      marcar('NEBLINA', true);
      guardarDefinicion().click();
      http.expectOne(url('/config')).flush({ mensaje: 'No tiene permiso para esta acción.' }, { status: 403, statusText: 'Forbidden' });
      await estable();
      expect(columna('#titulo-adversas').querySelector('.error.general')?.textContent).toContain('Su rol no tiene permiso');
      expect(columna('#titulo-pesos').querySelector('.error.general')).toBeNull();
      expect(marcador('NEBLINA').checked).toBe(true);
    });

    it('un valor adverso que la pantalla no conoce (nuevo en el servidor) se muestra marcado para poder quitarlo', async () => {
      await abrir([ana], { ...config, climaAdverso: ['LLUVIA', 'GRANIZO'] });
      expect(marcador('GRANIZO').checked).toBe(true);
    });

    it('si no se puede leer la configuración, lo dice y permite reintentar', async () => {
      localStorage.setItem('sivcr_session', JSON.stringify({ token: 't', usuario: { id: 1, nombre: 'Ana Admin', correo: 'ana@sivcr.go.cr', rol: 'ADMIN' } }));
      await TestBed.configureTestingModule({
        imports: [UsuariosApiComponent],
        providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
      }).compileComponents();
      http = TestBed.inject(HttpTestingController);
      fixture = TestBed.createComponent(UsuariosApiComponent);
      fixture.detectChanges();
      http.expectOne(url('/config')).error(new ProgressEvent('error'), { status: 0 });
      http.expectOne(url('/users')).flush([ana]);
      await estable();
      expect(texto()).toContain('No se pudo conectar con el servidor');
      expect(peso('wFallecido')).toBeNull();

      boton(html(), /Reintentar/).click();
      http.expectOne(url('/config')).flush(config);
      await estable();
      expect(peso('wFallecido').value).toBe('10');
      expect(marcador('LLUVIA').checked).toBe(true);
    });
  });

  describe('Crear Usuario', () => {
    const crear = () => boton(columna('#titulo-crear'), /Crear Usuario|Creando/);

    it('valida en la pantalla: los errores salen junto a los campos y no se llama al servidor', async () => {
      await abrir();
      crear().click();
      await estable();
      http.expectNone(url('/users'));
      expect(columna('#titulo-crear').textContent).toContain('El nombre es obligatorio.');
      expect(campo('nuevo-nombre').getAttribute('aria-invalid')).toBe('true');
      escribir(campo('nuevo-nombre'), 'Marta Ruiz'); // al corregir, su error desaparece
      expect(columna('#titulo-crear').textContent).not.toContain('El nombre es obligatorio.');
    });

    it('envía POST /users con el correo normalizado, agrega la cuenta a la lista y limpia el formulario', async () => {
      await abrir();
      escribir(campo('nuevo-nombre'), 'Marta Ruiz');
      escribir(campo('nuevo-correo'), 'Marta@SIVCR.go.cr');
      escribir(campo('nuevo-contrasena'), 'Clave1234');
      expect(campo('nuevo-rol').value).toBe('CONSULTOR_PUBLICO'); // sin permisos de más por omisión
      crear().click();
      const r = http.expectOne(url('/users'));
      expect(r.request.method).toBe('POST');
      expect(r.request.body).toEqual({ nombre: 'Marta Ruiz', correo: 'marta@sivcr.go.cr', rol: 'CONSULTOR_PUBLICO', contrasena: 'Clave1234' });
      r.flush({ id: 9, nombre: 'Marta Ruiz', correo: 'marta@sivcr.go.cr', rol: 'CONSULTOR_PUBLICO', activo: true, creadoEn: '2026-11-09T20:00:00Z' }, { status: 201, statusText: 'Created' });
      await estable();

      expect(filaDe('marta@sivcr.go.cr')).toBeTruthy();
      expect(avisos().some((a) => a.includes('Cuenta de Marta Ruiz creada'))).toBe(true);
      expect(campo('nuevo-nombre').value).toBe('');
      expect(campo('nuevo-contrasena').value).toBe('');
    });

    it('se puede elegir el rol de la cuenta nueva', async () => {
      await abrir();
      escribir(campo('nuevo-nombre'), 'Pedro Mora');
      escribir(campo('nuevo-correo'), 'pedro@sivcr.go.cr');
      escribir(campo('nuevo-contrasena'), 'Clave1234');
      const rol = campo('nuevo-rol') as unknown as HTMLSelectElement;
      rol.value = 'ANALISTA_TRANSITO';
      rol.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      crear().click();
      const r = http.expectOne(url('/users'));
      expect(r.request.body.rol).toBe('ANALISTA_TRANSITO');
      r.flush({ id: 10, nombre: 'Pedro Mora', correo: 'pedro@sivcr.go.cr', rol: 'ANALISTA_TRANSITO', activo: true, creadoEn: '2026-11-09T20:00:00Z' }, { status: 201, statusText: 'Created' });
      await estable();
    });

    it('«Generar contraseña temporal» llena la contraseña con una que cumple la política y la deja visible', async () => {
      await abrir();
      boton(columna('#titulo-crear'), /Generar contraseña temporal/).click();
      fixture.detectChanges();
      const clave = campo('nuevo-contrasena');
      expect(clave.type).toBe('text');
      expect(clave.value).toMatch(/^(?=.*\p{Lu})(?=.*\p{Ll})(?=.*\d).{8,}$/u);
    });

    it('un correo que ya existe en el servidor se avisa en el campo correo y se conserva lo escrito', async () => {
      await abrir();
      escribir(campo('nuevo-nombre'), 'Otra Persona');
      escribir(campo('nuevo-correo'), 'otra@sivcr.go.cr');
      escribir(campo('nuevo-contrasena'), 'Clave1234');
      crear().click();
      http.expectOne(url('/users')).flush({ mensaje: 'Ya existe una cuenta con ese correo.' }, { status: 409, statusText: 'Conflict' });
      await estable();
      expect(columna('#titulo-crear').textContent).toContain('Ya existe una cuenta con ese correo.');
      expect(campo('nuevo-nombre').value).toBe('Otra Persona');
    });

    it('un error del servidor distinto se muestra arriba del formulario', async () => {
      await abrir();
      escribir(campo('nuevo-nombre'), 'Otra Persona');
      escribir(campo('nuevo-correo'), 'otra@sivcr.go.cr');
      escribir(campo('nuevo-contrasena'), 'Clave1234');
      crear().click();
      http.expectOne(url('/users')).flush({}, { status: 500, statusText: 'Server Error' });
      await estable();
      expect(columna('#titulo-crear').querySelector('.error.general')?.textContent).toContain('El servidor tuvo un error interno');
    });
  });

  describe('cuentas', () => {
    it('lista las cuentas del servidor con rol y estado, marca la propia y no ofrece eliminar', async () => {
      await abrir();
      expect(html().querySelectorAll('tbody tr')).toHaveLength(3);
      expect(filaDe('ana@sivcr.go.cr').textContent).toContain('Usted');
      expect(filaDe('luis@sivcr.go.cr').textContent).toContain('Analista de Tránsito');
      expect(filaDe('carla@sivcr.go.cr').textContent).toContain('Desactivada');
      expect(Array.from(html().querySelectorAll('button')).some((b) => /Eliminar/.test(b.textContent ?? ''))).toBe(false);
      expect(texto()).not.toContain('Nunca ha entrado'); // el servidor no registra el último acceso
      expect(html().querySelector('.resumen')?.textContent).toContain('de 3 cuentas en total');
    });

    it('busca por nombre o correo sin tildes', async () => {
      await abrir();
      const buscar = html().querySelector<HTMLInputElement>('#f-texto')!;
      escribir(buscar, 'CONSULTORA');
      expect(html().querySelectorAll('tbody tr')).toHaveLength(1);
      expect(texto()).toContain('Mostrando 1 de 3 cuentas');
    });

    it('no deja desactivar a la propia cuenta: explica el motivo en vez de llamar al servidor', async () => {
      await abrir();
      const alternar = boton(filaDe('ana@sivcr.go.cr'), /Desactivar/);
      expect(alternar.getAttribute('aria-disabled')).toBe('true');
      alternar.click();
      fixture.detectChanges();
      expect(avisos().some((a) => a.includes('No puede desactivar su propia cuenta'))).toBe(true);
      http.expectNone(url('/users/1/active'));
    });

    it('desactivar pide confirmación y avisa que se cierran sus sesiones; al confirmar manda PUT /users/{id}/active', async () => {
      await abrir();
      boton(filaDe('luis@sivcr.go.cr'), /Desactivar/).click();
      fixture.detectChanges();
      const modal = html().querySelector('dialog[open]')!;
      expect(modal.textContent).toContain('se cierran las sesiones');
      http.expectNone(url('/users/2/active')); // todavía no

      boton(modal, /Desactivar cuenta/).click();
      const r = http.expectOne(url('/users/2/active'));
      expect(r.request.method).toBe('PUT');
      expect(r.request.body).toEqual({ activo: false });
      r.flush({ ...luis, activo: false });
      await estable();
      expect(filaDe('luis@sivcr.go.cr').textContent).toContain('Desactivada');
      expect(avisos().some((a) => a.includes('Cuenta de Luis Analista desactivada'))).toBe(true);
    });

    it('cancelar la confirmación no cambia nada', async () => {
      await abrir();
      boton(filaDe('luis@sivcr.go.cr'), /Desactivar/).click();
      fixture.detectChanges();
      boton(html().querySelector('dialog[open]')!, /Cancelar/).click();
      fixture.detectChanges();
      http.expectNone(url('/users/2/active'));
      expect(filaDe('luis@sivcr.go.cr').textContent).toContain('Activa');
    });

    it('reactivar no pide confirmación', async () => {
      await abrir();
      boton(filaDe('carla@sivcr.go.cr'), /Reactivar/).click();
      const r = http.expectOne(url('/users/3/active'));
      expect(r.request.body).toEqual({ activo: true });
      r.flush({ ...carla, activo: true });
      await estable();
      expect(filaDe('carla@sivcr.go.cr').textContent).toContain('Activa');
    });

    it('si el servidor no permite el cambio, muestra su motivo y la fila queda igual', async () => {
      await abrir();
      boton(filaDe('carla@sivcr.go.cr'), /Reactivar/).click();
      http.expectOne(url('/users/3/active')).flush({ mensaje: 'La cuenta ya no existe.' }, { status: 404, statusText: 'Not Found' });
      await estable();
      expect(avisos().some((a) => a.startsWith('error: La cuenta ya no existe.'))).toBe(true);
      expect(filaDe('carla@sivcr.go.cr').textContent).toContain('Desactivada');
    });

    it('editar la propia cuenta actualiza el nombre de la sesión; el rol propio no se puede cambiar', async () => {
      await abrir();
      boton(filaDe('ana@sivcr.go.cr'), /Editar/).click();
      fixture.detectChanges();
      const dialogo = html().querySelector('app-dialogo-usuario dialog[open]')!;
      const radios = Array.from(dialogo.querySelectorAll<HTMLInputElement>('input[type=radio]'));
      expect(radios.filter((r) => r.disabled)).toHaveLength(2); // solo queda marcado el rol actual
      expect(dialogo.textContent).toContain('No puede cambiar su propio rol');

      const nombre = dialogo.querySelector<HTMLInputElement>('input[type=text]')!;
      escribir(nombre, 'Ana María Admin');
      boton(dialogo, /Guardar cambios/).click();
      const r = http.expectOne(url('/users/1'));
      expect(r.request.method).toBe('PUT');
      expect(r.request.body).toMatchObject({ nombre: 'Ana María Admin', rol: 'ADMIN', contrasena: '' });
      r.flush({ ...ana, nombre: 'Ana María Admin' });
      await estable();
      expect(filaDe('ana@sivcr.go.cr').textContent).toContain('Ana María Admin');
      expect(JSON.parse(localStorage.getItem('sivcr_session')!).usuario.nombre).toBe('Ana María Admin');
    });

    it('si no se pueden leer las cuentas, lo dice y permite reintentar', async () => {
      localStorage.setItem('sivcr_session', JSON.stringify({ token: 't', usuario: { id: 1, nombre: 'Ana Admin', correo: 'ana@sivcr.go.cr', rol: 'ADMIN' } }));
      await TestBed.configureTestingModule({
        imports: [UsuariosApiComponent],
        providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
      }).compileComponents();
      http = TestBed.inject(HttpTestingController);
      fixture = TestBed.createComponent(UsuariosApiComponent);
      fixture.detectChanges();
      http.expectOne(url('/config')).flush(config);
      http.expectOne(url('/users')).flush({}, { status: 500, statusText: 'Server Error' });
      await estable();
      expect(texto()).toContain('El servidor tuvo un error interno');

      boton(html().querySelector('.cuentas')!, /Reintentar/).click();
      http.expectOne(url('/users')).flush([ana]);
      await estable();
      expect(html().querySelectorAll('tbody tr')).toHaveLength(1);
    });
  });
});
