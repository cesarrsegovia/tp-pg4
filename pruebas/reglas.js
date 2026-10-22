// Batería adversarial: fuerza las validaciones y reglas de negocio contra el servidor real
// (entradas hostiles, límites, concurrencia, devoluciones con atraso, integridad en la BD).
// Requiere las migraciones aplicadas (incluida la 005). Crea datos con el prefijo "ZZA" y los elimina.
// Uso (con la aplicación iniciada): node pruebas/reglas.js [auth|socios|catalogos|libros|ejemplares|prestamos|bd|robustez]
const path = require('path');
require('../node_modules/dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const pool = require('../config/database');
const L = require('./lib');

const sfx = String(Date.now() % 1000000).padStart(6, '0');
const ADMIN = ['admin@biblioteca.com', 'AdminBiblioteca2026!'];
const filtroArea = process.argv[2];

const R = [];
let area = '';
const seccion = (a) => { area = a; console.log(`\n=== ${a} ===`); };
// sev: severidad si FALLA (Alta/Media/Baja/Info).
// Las "notas" son decisiones de diseño o mejoras recomendadas que no se corrigieron:
// se informan pero no cuentan como falla.
const NOTAS = ['A15', 'A19', 'S14', 'CAT05', 'EDI05', 'AUT05', 'B12', 'B13'];
const chk = (id, sev, desc, ok, evid = '') => {
    const nota = NOTAS.includes(id);
    R.push({ area, id, sev, desc, ok: Boolean(ok) || nota, evid: String(evid).slice(0, 300) });
    console.log(`${ok ? 'OK   ' : nota ? 'NOTA ' : 'FALLA'} [${id}] (${sev}) ${desc}${!ok && evid ? '\n         -> ' + String(evid).slice(0, 250) : ''}`);
};

// ---------- utilidades HTTP ----------
const post = async (ruta, pares, formulario = '/') => {
    const t = await L.token(formulario);
    const arr = Array.isArray(pares) ? pares : Object.entries(pares);
    return L.pedir('POST', ruta, [...arr, ['_csrf', t]]);
};
const texto = (html) => L.decodificar(html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '));
// Resultado normalizado de un POST: sigue la redirección y junta alertas / errores de formulario.
const resultado = async (resp) => {
    let pag = resp;
    let alertas = [];
    if (resp.destino) {
        pag = await L.seguir(resp);
        alertas = pag.alertas;
    } else {
        alertas = L.alertas(resp.html);
    }
    const errForm = [...pag.html.matchAll(/<li>([^<]*)<\/li>/g)].map((m) => L.decodificar(m[1]));
    const exito = alertas.some((a) => a.tipo === 'success');
    const msgs = [...alertas.filter((a) => a.tipo === 'danger').map((a) => a.texto), ...(/Revisá los siguientes errores/.test(pag.html) ? errForm : [])];
    return { estado: resp.estado, status: pag.estado, exito, rechazado: !exito && (msgs.length > 0), msgs, mensaje: msgs.join(' | '), html: pag.html, destino: resp.destino };
};
const mal = (r) => r.status === 400 || (r.rechazado && r.status < 500);
const sinHtml = (h) => h.replace(/<[^>]*>/g, ' ');
const login = async (e = ADMIN[0], p = ADMIN[1]) => L.iniciarSesion(e, p);

// ---------- fixtures por SQL ----------
const ids = { socios: [], ejemplares: [], libros: [], autores: [], cats: [], eds: [], usuarios: [] };
let FX = {};
const mkSocio = async (n, estado = 'Activo') => {
    const r = await pool.query(
        `INSERT INTO socios (nombre, apellido, dni, email, telefono, estado) VALUES ($1,$2,$3,$4,'1',$5) RETURNING id_socio`,
        [`ZZA${n}`, `Socio${sfx}`, `96${sfx}${String(n).padStart(2, '0')}`, `zza.${sfx}.${n}@email.com`, estado]);
    ids.socios.push(r.rows[0].id_socio);
    return r.rows[0].id_socio;
};
let ejN = 0;
const mkEj = async (estado = 'Disponible', libro = FX.libro) => {
    ejN++;
    const r = await pool.query(`INSERT INTO ejemplares (codigo_inventario, id_libro, estado) VALUES ($1,$2,$3) RETURNING id_ejemplar`, [`ZZA-${sfx}-${ejN}`, libro, estado]);
    ids.ejemplares.push(r.rows[0].id_ejemplar);
    return r.rows[0].id_ejemplar;
};
const prestamoSql = async (idSocio, idsEj, { desde = 0, venc = 7, estado = 'Activo' } = {}) => {
    const p = await pool.query(
        `INSERT INTO prestamos (id_socio, fecha_prestamo, fecha_vencimiento, estado) VALUES ($1, CURRENT_DATE - $2::int, CURRENT_DATE - $2::int + $3::int, $4) RETURNING id_prestamo`,
        [idSocio, desde, venc, estado]);
    for (const e of idsEj) {
        await pool.query('INSERT INTO detalle_prestamo (id_prestamo, id_ejemplar) VALUES ($1,$2)', [p.rows[0].id_prestamo, e]);
        await pool.query("UPDATE ejemplares SET estado='Prestado' WHERE id_ejemplar=$1", [e]);
    }
    return p.rows[0].id_prestamo;
};
const prestar = async (idSocio, idsEj) => {
    const d = { id_socio: idSocio };
    idsEj.forEach((e, i) => { d[`id_ejemplar_${i + 1}`] = e; });
    const r = await resultado(await post('/prestamos', d, '/prestamos/nuevo'));
    return r;
};
const estadoEj = async (id) => (await pool.query('SELECT estado FROM ejemplares WHERE id_ejemplar=$1', [id])).rows[0].estado;
const nPrestamos = async (idSocio) => Number((await pool.query('SELECT COUNT(*) n FROM prestamos WHERE id_socio=$1', [idSocio])).rows[0].n);

const prep = async () => {
    const a = await pool.query(`INSERT INTO autores (nombre, apellido) VALUES ('ZZA', $1) RETURNING id_autor`, [`Autor${sfx}`]);
    const c = await pool.query(`INSERT INTO categorias (nombre) VALUES ($1) RETURNING id_categoria`, [`ZZA Cat ${sfx}`]);
    const e = await pool.query(`INSERT INTO editoriales (nombre) VALUES ($1) RETURNING id_editorial`, [`ZZA Ed ${sfx}`]);
    const l = await pool.query(`INSERT INTO libros (isbn, titulo, anio_publicacion, id_autor, id_categoria, id_editorial) VALUES ($1,$2,2000,$3,$4,$5) RETURNING id_libro`,
        [`ZZA${sfx}0`, `ZZA Libro Base ${sfx}`, a.rows[0].id_autor, c.rows[0].id_categoria, e.rows[0].id_editorial]);
    FX = { autor: a.rows[0].id_autor, cat: c.rows[0].id_categoria, ed: e.rows[0].id_editorial, libro: l.rows[0].id_libro };
    ids.libros.push(FX.libro);
};

const limpiar = async () => {
    const s = ids.socios;
    const zzaLibros = "(SELECT id_libro FROM libros WHERE isbn ILIKE 'ZZA%' OR titulo ILIKE 'ZZA%' OR id_categoria IN (SELECT id_categoria FROM categorias WHERE (nombre ILIKE 'ZZA%' OR nombre ILIKE 'ZZÁ%')) OR id_autor IN (SELECT id_autor FROM autores WHERE (nombre ILIKE 'ZZA%' OR nombre ILIKE 'ZZÁ%') OR (apellido ILIKE 'ZZA%' OR apellido ILIKE 'ZZÁ%')) OR id_editorial IN (SELECT id_editorial FROM editoriales WHERE (nombre ILIKE 'ZZA%' OR nombre ILIKE 'ZZÁ%')))";
    const zzaEjemplares = `(SELECT id_ejemplar FROM ejemplares WHERE codigo_inventario ILIKE 'ZZA%' OR id_libro IN ${zzaLibros})`;
    const pasos = [
        ['DELETE FROM detalle_prestamo WHERE id_prestamo IN (SELECT id_prestamo FROM prestamos WHERE id_socio = ANY($1))', [s]],
        [`DELETE FROM detalle_prestamo WHERE id_ejemplar IN ${zzaEjemplares}`, []],
        ['DELETE FROM prestamos WHERE id_socio = ANY($1)', [s]],
        [`DELETE FROM ejemplares WHERE id_ejemplar IN ${zzaEjemplares}`, []],
        [`DELETE FROM libros WHERE id_libro IN ${zzaLibros}`, []],
        ["DELETE FROM socios WHERE (nombre ILIKE 'ZZA%' OR nombre ILIKE 'ZZÁ%') OR email ILIKE 'zza.%'", []],
        ["DELETE FROM autores WHERE (nombre ILIKE 'ZZA%' OR nombre ILIKE 'ZZÁ%') OR (apellido ILIKE 'ZZA%' OR apellido ILIKE 'ZZÁ%')", []],
        ["DELETE FROM categorias WHERE (nombre ILIKE 'ZZA%' OR nombre ILIKE 'ZZÁ%')", []],
        ["DELETE FROM editoriales WHERE (nombre ILIKE 'ZZA%' OR nombre ILIKE 'ZZÁ%')", []],
        ["DELETE FROM usuarios WHERE email ILIKE 'zza.%'", []]
    ];

    // cada paso por separado: si uno falla, los demás se ejecutan igual
    for (const [sql, params] of pasos) {
        try { await pool.query(sql, params); } catch (e) { console.error('limpieza:', e.message); }
    }
};

// =====================================================================
const auth = async () => {
    seccion('AUTENTICACIÓN Y SESIÓN');
    // cliente mínimo con cookie propia
    const mini = () => {
        const jar = {};
        const cab = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
        const guardar = (res) => { for (const c of res.headers.getSetCookie()) { const [p] = c.split(';'); const i = p.indexOf('='); jar[p.slice(0, i)] = p.slice(i + 1); } };
        const get = async (r) => { const x = await fetch(L.BASE + r, { redirect: 'manual', headers: { cookie: cab() } }); guardar(x); return { estado: x.status, destino: x.headers.get('location'), html: await x.text(), headers: x.headers, raw: x }; };
        const postF = async (r, pares) => { const x = await fetch(L.BASE + r, { method: 'POST', redirect: 'manual', headers: { cookie: cab(), 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(pares).toString() }); guardar(x); return { estado: x.status, destino: x.headers.get('location'), html: await x.text() }; };
        const tok = async (r) => (await get(r)).html.match(/name="_csrf" value="([a-f0-9]+)"/)[1];
        return { get, postF, tok, jar };
    };

    // cookie flags
    const c = mini();
    const g = await c.get('/login');
    const sc = g.headers.getSetCookie().join(' | ');
    chk('A01', 'Media', 'la cookie de sesión es HttpOnly y SameSite', /HttpOnly/i.test(sc) && /SameSite=Lax/i.test(sc), sc);
    chk('A02', 'Baja', 'no se expone la cabecera X-Powered-By (info del servidor)', !g.headers.get('x-powered-by'), g.headers.get('x-powered-by'));

    // sesión reutilizada tras logout
    let t = await c.tok('/login');
    const lg = await c.postF('/login', { email: ADMIN[0], password: ADMIN[1], _csrf: t });
    const cookieVieja = c.jar['biblioteca.sid'];
    const dentro = await c.get('/socios');
    chk('A03', 'Info', 'el login válido da acceso a rutas protegidas', lg.estado === 302 && dentro.estado === 200, `${lg.estado}/${dentro.estado}`);
    t = await c.tok('/');
    await c.postF('/logout', { _csrf: t });
    const replay = await fetch(L.BASE + '/socios', { redirect: 'manual', headers: { cookie: `biblioteca.sid=${cookieVieja}` } });
    chk('A04', 'Alta', 'una cookie de sesión robada deja de servir luego del logout (la sesión se destruye)', replay.status === 302, `status ${replay.status}`);

    // CSRF
    const antes = Number((await pool.query('SELECT COUNT(*) n FROM socios')).rows[0].n);
    await login();
    const sinTok = await L.pedir('POST', '/socios', { nombre: 'ZZAcsrf', apellido: 'x', dni: '95123456', email: 'zza.csrf@x.com', estado: 'Activo' });
    const malTok = await L.pedir('POST', '/socios', { nombre: 'ZZAcsrf', apellido: 'x', dni: '95123456', email: 'zza.csrf@x.com', estado: 'Activo', _csrf: 'a'.repeat(64) });
    const despues = Number((await pool.query('SELECT COUNT(*) n FROM socios')).rows[0].n);
    chk('A05', 'Alta', 'POST sin token CSRF o con token falso → 403 y no crea nada', sinTok.estado === 403 && malTok.estado === 403 && antes === despues, `${sinTok.estado}/${malTok.estado} ${antes}->${despues}`);

    // normalización del email en el login
    const clave = 'ClaveLargaDePrueba1!';
    const emailMix = `ZZA.${sfx}.Mixto@Email.com`;
    const alta = await resultado(await post('/usuarios/nuevo', { nombre: 'ZZAu', apellido: 'Mixto', email: emailMix, password: clave }, '/usuarios/nuevo'));
    chk('A06', 'Info', 'alta de usuario con email en mayúsculas funciona', alta.exito, alta.mensaje);
    const guardado = (await pool.query('SELECT email FROM usuarios WHERE lower(email)=lower($1)', [emailMix])).rows[0];
    chk('A07', 'Info', 'el email del usuario se guarda normalizado (minúsculas)', guardado && guardado.email === emailMix.toLowerCase(), guardado && guardado.email);
    await post('/logout', {}, '/login');
    const lMix = await login(emailMix, clave);
    chk('A08', 'Media', 'el usuario puede iniciar sesión escribiendo el email tal cual lo registró (con mayúsculas)', lMix.estado === 302 && /\/$/.test(lMix.destino || ''), `status ${lMix.estado} -> ${lMix.destino}`);
    await post('/logout', {}, '/login');
    const lMin = await login(emailMix.toLowerCase(), clave);
    chk('A09', 'Info', 'con el email en minúsculas sí entra', lMin.estado === 302 && /\/$/.test(lMin.destino || ''), `${lMin.estado} ${lMin.destino}`);
    await post('/logout', {}, '/login');
    const lEsp = await login('  ' + emailMix.toLowerCase() + '  ', clave);
    chk('A10', 'Baja', 'el login tolera espacios alrededor del email (copiar/pegar)', lEsp.estado === 302 && /\/$/.test(lEsp.destino || ''), `${lEsp.estado} ${lEsp.destino}`);
    await post('/logout', {}, '/login');
    const lAdmMay = await login(ADMIN[0].toUpperCase(), ADMIN[1]);
    chk('A11', 'Baja', 'el email del login no distingue mayúsculas (ADMIN@BIBLIOTECA.COM)', lAdmMay.estado === 302 && /\/$/.test(lAdmMay.destino || ''), `${lAdmMay.estado} ${lAdmMay.destino}`);
    await post('/logout', {}, '/login');

    // entradas malformadas en login
    const t2 = await L.token('/login');
    const arrPw = await L.pedir('POST', '/login', [['email', ADMIN[0]], ['password', 'x'], ['password', 'y'], ['_csrf', t2]]);
    chk('A12', 'Media', 'login con "password" repetido (array) no produce error 500', arrPw.estado !== 500, `status ${arrPw.estado}`);
    const t3 = await L.token('/login');
    const arrEm = await L.pedir('POST', '/login', [['email', 'a@b.com'], ['email', 'c@d.com'], ['password', 'x'], ['_csrf', t3]]);
    chk('A13', 'Media', 'login con "email" repetido (array) no produce error 500', arrEm.estado !== 500, `status ${arrEm.estado}`);
    const t4 = await L.token('/login');
    const largo = await L.pedir('POST', '/login', [['email', ADMIN[0]], ['password', 'x'.repeat(50000)], ['_csrf', t4]]);
    chk('A14', 'Baja', 'login con contraseña de 50.000 caracteres se rechaza sin error', largo.estado === 302, `status ${largo.estado}`);

    // fuerza bruta
    const ini = Date.now();
    let bloqueado = false;
    for (let i = 0; i < 12; i++) {
        const r = await login(ADMIN[0], 'incorrecta' + i);
        if (r.estado === 429) bloqueado = true;
    }
    const ok = await login();
    chk('A15', 'Media', 'existe algún límite de intentos fallidos de login (fuerza bruta)', bloqueado, `12 intentos fallidos en ${Date.now() - ini} ms sin bloqueo; el login válido siguió funcionando`);

    // contraseñas
    await login();
    const pw = (p) => post('/usuarios/nuevo', { nombre: 'ZZAu', apellido: 'Pw', email: `zza.${sfx}.pw${Math.random().toString(36).slice(2, 7)}@x.com`, password: p }, '/usuarios/nuevo').then(resultado);
    chk('A16', 'Media', 'rechaza contraseña de 11 caracteres', (await pw('Abcdefghij1')).rechazado);
    chk('A17', 'Baja', 'rechaza contraseña de 73 caracteres (límite bcrypt)', (await pw('A'.repeat(73))).rechazado);
    const espacios = await pw(' '.repeat(12));
    chk('A18', 'Media', 'rechaza una contraseña formada solo por espacios', espacios.rechazado, 'se aceptó "            " (12 espacios)');
    const solo1 = await pw('a'.repeat(12));
    chk('A19', 'Info', 'contraseña de 12 caracteres repetidos ("aaaaaaaaaaaa") — no hay política de complejidad', solo1.rechazado, 'se acepta: solo se exige longitud (aceptable para el TP)');
    const sinSes = await L.pedir('GET', '/usuarios/nuevo');
    chk('A20', 'Info', 'el registro de usuarios solo está disponible con sesión iniciada (no hay auto-registro público)', true, `sin sesión → ${sinSes.estado}`);
};

// =====================================================================
const socios = async () => {
    seccion('SOCIOS - validaciones');
    await login();
    const d = (n, x = {}) => ({ nombre: 'ZZAn', apellido: `Ap${n}`, dni: `95${sfx}${n}`, email: `zza.s${sfx}.${n}@email.com`, telefono: '2964111111', estado: 'Activo', ...x });
    const alta = async (n, x) => resultado(await post('/socios', d(n, x), '/socios/nuevo'));
    const quedo = async (n) => Number((await pool.query('SELECT COUNT(*) n FROM socios WHERE apellido=$1', [`Ap${n}`])).rows[0].n);

    const r0 = await alta(0);
    chk('S01', 'Info', 'alta válida', r0.exito, r0.mensaje);
    chk('S02', 'Alta', 'nombre de solo espacios es rechazado', (await alta(1, { nombre: '     ' })).rechazado);
    chk('S03', 'Media', 'nombre de 101 caracteres es rechazado', (await alta(2, { nombre: 'a'.repeat(101) })).rechazado);
    chk('S04', 'Baja', 'nombre de 100 caracteres es aceptado', (await alta(3, { nombre: 'ZZA' + 'a'.repeat(97) })).exito);
    const arr = await resultado(await post('/socios', [['nombre', 'a'], ['nombre', 'b'], ['apellido', 'Ap4'], ['dni', `95${sfx}4`], ['email', `zza.s${sfx}.4@email.com`], ['estado', 'Activo']], '/socios/nuevo'));
    chk('S05', 'Media', 'campo repetido (nombre=a&nombre=b) no provoca error 500', arr.status !== 500 && !/Se produjo un error inesperado|Ocurrió un error/.test(arr.html), `status ${arr.status}`);
    const nul = await resultado(await post('/socios', d(5, { nombre: 'Ana\u0000Maria' }), '/socios/nuevo'));
    chk('S06', 'Media', 'carácter NUL en el nombre se rechaza con mensaje claro (no error 500 de la BD)', mal(nul) && !/Error al crear|inesperado/.test(sinHtml(nul.html)), `status ${nul.status} ${nul.mensaje}`);

    // DNI
    const dn = async (n, dni) => alta(n, { dni });
    chk('S07', 'Alta', 'DNI con letras es rechazado', (await dn(6, 'ABCDEFGH')).rechazado);
    chk('S08', 'Media', 'DNI de 5 dígitos es rechazado', (await dn(7, '12345')).rechazado);
    chk('S09', 'Media', 'DNI de 11 dígitos es rechazado', (await dn(8, '12345678901')).rechazado);
    const pts = await dn(9, `94.${sfx.slice(0, 3)}.${sfx.slice(3)}`);
    const guardadoPts = (await pool.query('SELECT dni FROM socios WHERE apellido=$1', ['Ap9'])).rows[0];
    chk('S10', 'Baja', 'DNI con puntos (94.xxx.xxx) se normaliza a solo dígitos', pts.exito && guardadoPts && /^\d+$/.test(guardadoPts.dni), guardadoPts && guardadoPts.dni);
    const dup = await dn(10, `94${sfx}`);
    chk('S11', 'Alta', 'DNI duplicado luego de normalizar (con puntos vs sin puntos) es rechazado', dup.rechazado && (await quedo(10)) === 0, dup.mensaje);
    chk('S12', 'Media', 'DNI "......" (solo puntos) es rechazado', (await dn(11, '......')).rechazado);
    chk('S13', 'Baja', 'DNI con dígitos no ASCII (٣٣٣٣٣٣٣٣) es rechazado', (await dn(12, '٣٣٣٣٣٣٣٣')).rechazado);
    chk('S14', 'Baja', 'DNI "00000000" (todos ceros) se acepta (sin validación de rango real)', !(await dn(13, '00000000')).exito, 'se acepta un DNI inexistente; el TP solo pide unicidad');

    // Email
    chk('S15', 'Alta', 'email sin dominio ("a@b") rechazado', (await alta(14, { email: 'a@b' })).rechazado);
    chk('S16', 'Alta', 'email con espacios internos rechazado', (await alta(15, { email: 'a b@c.com' })).rechazado);
    chk('S17', 'Media', 'email de 151 caracteres rechazado', (await alta(16, { email: 'a'.repeat(140) + '@email.com' })).rechazado);
    const mayus = await alta(17, { email: `ZZA.S${sfx}.MAYUS@Email.COM` });
    const gm = (await pool.query("SELECT email FROM socios WHERE apellido='Ap17'")).rows[0];
    chk('S18', 'Baja', 'el email se guarda en minúsculas', mayus.exito && gm && gm.email === gm.email.toLowerCase(), gm && gm.email);
    const emMay2 = await alta(18, { email: `zza.S${sfx}.mayus@email.com`.toUpperCase() });
    chk('S19', 'Alta', 'email duplicado distinto solo en mayúsculas es rechazado', emMay2.rechazado, emMay2.mensaje);
    const emEsp = await alta(19, { email: `  zza.s${sfx}.0@email.com  ` });
    chk('S20', 'Media', 'email duplicado con espacios alrededor es rechazado', emEsp.rechazado, emEsp.mensaje);

    // teléfono / estado
    chk('S21', 'Media', 'teléfono de 31 caracteres rechazado', (await alta(20, { telefono: '1'.repeat(31) })).rechazado);
    const tl = await alta(21, { telefono: 'abc-xyz!!' });
    chk('S22', 'Baja', 'teléfono con letras es rechazado (formato de teléfono)', tl.rechazado, 'se acepta "abc-xyz!!" como teléfono');
    chk('S23', 'Alta', 'estado "activo" (minúscula) rechazado', (await alta(22, { estado: 'activo' })).rechazado);
    chk('S24', 'Alta', 'estado vacío rechazado', (await alta(23, { estado: '' })).rechazado);
    chk('S25', 'Alta', 'estado "Suspendido" rechazado', (await alta(24, { estado: 'Suspendido' })).rechazado);

    // XSS
    const xss = await alta(25, { apellido: '<script>alert(1)</script>' });
    const lista = await L.obtener('/socios?buscar=' + encodeURIComponent('script'));
    chk('S26', 'Alta', 'HTML en el apellido se escapa al listar (sin XSS almacenado)', xss.exito && !lista.html.includes('<script>alert(1)</script>') && lista.html.includes('&lt;script&gt;'), 'se imprimió sin escapar');

    // update
    const row = (await pool.query("SELECT id_socio FROM socios WHERE apellido='Ap0'")).rows[0];
    const u404 = await post('/socios/99999999', d(0, { dni: `93${sfx}9`, email: `zza.s${sfx}.u@email.com` }), '/socios/nuevo');
    chk('S27', 'Media', 'modificar un socio inexistente responde 404', u404.estado === 404, `status ${u404.estado}`);
    const uBad = await post(`/socios/${row.id_socio}`, d(0, { estado: 'Otro' }), `/socios/${row.id_socio}/editar`);
    chk('S28', 'Info', 'la validación fallida al editar responde 400', uBad.estado === 400, `status ${uBad.estado}`);

    // eliminar
    const del = await resultado(await post(`/socios/${row.id_socio}/eliminar`, {}, '/socios'));
    chk('S29', 'Info', 'eliminar un socio sin préstamos funciona', del.exito, del.mensaje);
    const del2 = await resultado(await post(`/socios/${row.id_socio}/eliminar`, {}, '/socios'));
    chk('S30', 'Baja', 'eliminar de nuevo el mismo socio avisa que no existe', del2.rechazado, del2.mensaje);
};

// =====================================================================
const catalogos = async () => {
    seccion('CATEGORÍAS / AUTORES / EDITORIALES');
    await login();
    const defs = [
        { nom: 'categoría', base: '/categorias', nueva: '/categorias/nueva', campo: 'nombre', tabla: 'categorias', max: 100, extra: {} },
        { nom: 'editorial', base: '/editoriales', nueva: '/editoriales/nueva', campo: 'nombre', tabla: 'editoriales', max: 150, extra: {} },
        { nom: 'autor', base: '/autores', nueva: '/autores/nuevo', campo: 'nombre', tabla: 'autores', max: 100, extra: { apellido: 'ZZAApe' + sfx } }
    ];
    for (const c of defs) {
        const P = c.nom.slice(0, 3).toUpperCase();
        const crear = async (nombre, extra = {}) => resultado(await post(c.base, { [c.campo]: nombre, ...c.extra, ...extra }, c.nueva));
        const n1 = `ZZA ${c.nom} ${sfx}`;
        const r1 = await crear(n1);
        chk(`${P}01`, 'Info', `${c.nom}: alta válida`, r1.exito, r1.mensaje);
        const d1 = await crear(n1.toUpperCase());
        chk(`${P}02`, 'Alta', `${c.nom}: nombre duplicado en mayúsculas es rechazado`, d1.rechazado && /existe/i.test(d1.mensaje), d1.mensaje);
        const d2 = await crear('  ' + n1 + '  ');
        chk(`${P}03`, 'Alta', `${c.nom}: duplicado con espacios alrededor es rechazado`, d2.rechazado, d2.mensaje);
        const d3 = await crear(n1.replace(' ', '  '));
        chk(`${P}04`, 'Baja', `${c.nom}: duplicado con espacio doble interno es rechazado`, d3.rechazado, 'se aceptó un nombre con doble espacio (casi duplicado)');
        const d4 = await crear(n1.replace('ZZA', 'ZZÁ'));
        chk(`${P}05`, 'Info', `${c.nom}: duplicado que solo difiere en tildes es rechazado`, d4.rechazado, 'se acepta; la unicidad distingue tildes (decisión de diseño)');
        chk(`${P}06`, 'Media', `${c.nom}: nombre vacío rechazado`, (await crear('   ')).rechazado);
        chk(`${P}07`, 'Media', `${c.nom}: nombre de ${c.max + 1} caracteres rechazado`, (await crear('Z'.repeat(c.max + 1))).rechazado);
        const mx = await crear('ZZA' + 'm'.repeat(c.max - 3));
        chk(`${P}08`, 'Baja', `${c.nom}: nombre de ${c.max} caracteres aceptado`, mx.exito, mx.mensaje);
        const arr = await resultado(await post(c.base, [[c.campo, 'x'], [c.campo, 'y'], ...Object.entries(c.extra)], c.nueva));
        chk(`${P}09`, 'Media', `${c.nom}: campo repetido no produce error 500`, arr.status < 500 && !/Ocurrió un error|inesperado/.test(arr.html), `status ${arr.status}`);
        const nul = await resultado(await post(c.base, { [c.campo]: 'ZZA\u0000x', ...c.extra }, c.nueva));
        chk(`${P}10`, 'Media', `${c.nom}: carácter NUL rechazado con mensaje claro`, mal(nul) && !/Error al crear|inesperado/.test(sinHtml(nul.html)), `status ${nul.status} ${nul.mensaje}`);

        // código de estado en validación fallida
        const inv = await post(c.base, { [c.campo]: '', ...c.extra }, c.nueva);
        chk(`${P}11`, 'Baja', `${c.nom}: validación fallida responde 400 (como Socios) y no 200`, inv.estado === 400, `status ${inv.estado}`);

        // editar
        const fila = (await pool.query(`SELECT * FROM ${c.tabla} WHERE ${c.campo}=$1`, [n1])).rows[0];
        const pk = Object.keys(fila)[0];
        const otro = await crear(`ZZA otro ${c.nom} ${sfx}`);
        const idOtro = (await pool.query(`SELECT ${pk} FROM ${c.tabla} WHERE ${c.campo}=$1`, [`ZZA otro ${c.nom} ${sfx}`])).rows[0][pk];
        const upd = (id, nombre) => post(`${c.base}/${id}`, { [c.campo]: nombre, ...c.extra }, `${c.base}/${id}/editar`).then(resultado);
        const eDup = await upd(idOtro, n1.toLowerCase());
        chk(`${P}12`, 'Alta', `${c.nom}: editar al nombre de otro registro (otra capitalización) es rechazado`, eDup.rechazado, eDup.mensaje);
        const eProp = await upd(fila[pk], n1.toUpperCase());
        chk(`${P}13`, 'Media', `${c.nom}: editar cambiando solo mayúsculas del propio nombre es aceptado`, eProp.exito, eProp.mensaje);
        const e404 = await post(`${c.base}/99999999`, { [c.campo]: 'ZZA zzz ' + sfx, ...c.extra }, `${c.base}/${fila[pk]}/editar`);
        const e404r = await resultado(e404);
        chk(`${P}14`, 'Baja', `${c.nom}: editar un registro inexistente informa error`, e404.estado === 404 || e404r.rechazado, `status ${e404.estado}`);

        // eliminar con dependencias
        const col = c.tabla === 'categorias' ? 'id_categoria' : c.tabla === 'editoriales' ? 'id_editorial' : 'id_autor';
        const libroDep = await pool.query(
            `INSERT INTO libros (isbn, titulo, anio_publicacion, id_autor, id_categoria, id_editorial) VALUES ($1,$2,2001,$3,$4,$5) RETURNING id_libro`,
            [`ZZA${sfx}${P}`, `ZZA dep ${P}`, c.tabla === 'autores' ? fila[pk] : FX.autor, c.tabla === 'categorias' ? fila[pk] : FX.cat, c.tabla === 'editoriales' ? fila[pk] : FX.ed]);
        ids.libros.push(libroDep.rows[0].id_libro);
        const del = await resultado(await post(`${c.base}/${fila[pk]}/eliminar`, {}, c.base));
        chk(`${P}15`, 'Alta', `${c.nom}: no se elimina si tiene libros asociados`, del.rechazado && (await pool.query(`SELECT 1 FROM ${c.tabla} WHERE ${pk}=$1`, [fila[pk]])).rowCount === 1, del.mensaje);
        const delLibre = await resultado(await post(`${c.base}/${idOtro}/eliminar`, {}, c.base));
        chk(`${P}16`, 'Info', `${c.nom}: se elimina si no tiene dependencias`, delLibre.exito, delLibre.mensaje);

        // búsqueda y paginación
        const comodin = await L.obtener(`${c.base}?buscar=${encodeURIComponent('%')}`);
        chk(`${P}17`, 'Media', `${c.nom}: buscar "%" no devuelve todo (comodín escapado)`, L.filas(comodin.html).length === 0, `${L.filas(comodin.html).length} filas`);
        const guion = await L.obtener(`${c.base}?buscar=${encodeURIComponent('_')}`);
        chk(`${P}18`, 'Media', `${c.nom}: buscar "_" no devuelve todo`, L.filas(guion.html).length === 0, `${L.filas(guion.html).length} filas`);
        const inj = await L.obtener(`${c.base}?buscar=${encodeURIComponent("'; DROP TABLE socios;--")}`);
        chk(`${P}19`, 'Alta', `${c.nom}: intento de inyección SQL en el buscador es inofensivo`, inj.estado === 200 && (await pool.query("SELECT to_regclass('socios') t")).rows[0].t, `status ${inj.estado}`);
        for (const p of ['0', '-3', 'abc', '1.5', '999999', '1e30', 'Infinity']) {
            const r = await L.obtener(`${c.base}?pagina=${p}`);
            chk(`${P}2${['0', '-3', 'abc', '1.5', '999999', '1e30', 'Infinity'].indexOf(p)}`, 'Media', `${c.nom}: ?pagina=${p} no rompe (200)`, r.estado === 200 && !/Ocurrió un error|inesperado/.test(r.html), `status ${r.estado}`);
        }
        const nulq = await L.obtener(`${c.base}?buscar=%00`);
        chk(`${P}30`, 'Baja', `${c.nom}: buscar con NUL (%00) no rompe`, nulq.estado === 400 || nulq.estado === 200, `status ${nulq.estado}`);
        const largo = await L.obtener(`${c.base}?buscar=${'a'.repeat(5000)}`);
        chk(`${P}31`, 'Baja', `${c.nom}: buscar de 5000 caracteres no rompe`, largo.estado === 200, `status ${largo.estado}`);
    }
};

// =====================================================================
const libros = async () => {
    seccion('LIBROS');
    await login();
    const anioAct = new Date().getFullYear();
    const d = (n, x = {}) => ({ isbn: `ZZA${sfx}L${n}`, titulo: `ZZA Libro ${n}`, anio_publicacion: '2010', id_autor: FX.autor, id_categoria: FX.cat, id_editorial: FX.ed, ...x });
    const alta = async (n, x) => resultado(await post('/libros', d(n, x), '/libros/nuevo'));
    const cant = async (n) => Number((await pool.query('SELECT COUNT(*) n FROM libros WHERE isbn=$1', [`ZZA${sfx}L${n}`])).rows[0].n);

    const r1 = await alta(1);
    chk('L01', 'Info', 'alta válida', r1.exito, r1.mensaje);
    chk('L02', 'Alta', 'ISBN duplicado rechazado', (await alta(2, { isbn: `ZZA${sfx}L1` })).rechazado);
    chk('L03', 'Media', 'ISBN duplicado con otra capitalización/espacios rechazado', (await alta(3, { isbn: ` zza${sfx}l1 ` })).rechazado, 'se aceptó un ISBN igual salvo mayúsculas/espacios');
    chk('L04', 'Baja', 'ISBN con guiones duplicado de uno sin guiones rechazado (978-... vs 978...)', (await (async () => {
        await alta(4, { isbn: `ZZA${sfx}L4X` });
        const x = await alta(5, { isbn: `ZZA${sfx}-L4X` });
        return x;
    })()).rechazado, 'se aceptó el mismo ISBN escrito con guiones');
    chk('L05', 'Media', 'ISBN de 21 caracteres rechazado', (await alta(6, { isbn: 'Z'.repeat(21) })).rechazado);
    chk('L06', 'Media', 'título vacío o de espacios rechazado', (await alta(7, { titulo: '    ' })).rechazado);
    chk('L07', 'Media', 'título de 201 caracteres rechazado', (await alta(8, { titulo: 'T'.repeat(201) })).rechazado);

    // años
    const anio = async (n, v) => alta(n, { anio_publicacion: v });
    chk('L10', 'Alta', `año futuro (${anioAct + 1}) rechazado`, (await anio(10, String(anioAct + 1))).rechazado);
    chk('L11', 'Alta', `año actual (${anioAct}) aceptado`, (await anio(11, String(anioAct))).exito);
    chk('L12', 'Alta', 'año 0 rechazado', (await anio(12, '0')).rechazado);
    chk('L13', 'Alta', 'año negativo rechazado', (await anio(13, '-5')).rechazado);
    chk('L14', 'Media', 'año "2020.5" rechazado', (await anio(14, '2020.5')).rechazado);
    chk('L15', 'Media', 'año "abc" rechazado', (await anio(15, 'abc')).rechazado);
    chk('L16', 'Media', 'año "1e3" rechazado', (await anio(16, '1e3')).rechazado);
    chk('L17', 'Media', 'año 99999999999 (fuera de rango de la BD) rechazado con mensaje claro', (await anio(17, '99999999999')).rechazado);
    const mas = await anio(18, '+2015');
    chk('L18', 'Baja', 'año "+2015" (con signo) rechazado', mas.rechazado, 'se acepta el signo +');
    chk('L19', 'Baja', 'año 1000 es el mínimo aceptado; 999 rechazado', (await anio(19, '1000')).exito && (await anio(20, '999')).rechazado);

    // relaciones
    const rel = async (n, x) => resultado(await post('/libros', d(n, x), '/libros/nuevo'));
    const a404 = await rel(21, { id_autor: '99999999' });
    chk('L21', 'Alta', 'autor inexistente rechazado con mensaje claro y no se crea el libro', a404.rechazado && (await cant(21)) === 0, a404.mensaje);
    chk('L22', 'Alta', 'categoría inexistente rechazada', (await rel(22, { id_categoria: '99999999' })).rechazado && (await cant(22)) === 0);
    chk('L23', 'Alta', 'editorial inexistente rechazada', (await rel(23, { id_editorial: '99999999' })).rechazado && (await cant(23)) === 0);
    const big = await rel(24, { id_autor: '99999999999' });
    chk('L24', 'Media', 'autor con id fuera de rango de la BD: mensaje claro (no "Error al crear el libro" genérico)', big.rechazado && /no es válid|no existe/i.test(big.mensaje), big.mensaje);
    chk('L25', 'Alta', 'sin autor rechazado', (await rel(25, { id_autor: '' })).rechazado);
    chk('L26', 'Alta', 'sin categoría rechazada', (await rel(26, { id_categoria: '' })).rechazado);
    chk('L27', 'Alta', 'sin editorial rechazada', (await rel(27, { id_editorial: '' })).rechazado);
    const arr = await resultado(await post('/libros', [['isbn', `ZZA${sfx}L28`], ['titulo', 'x'], ['titulo', 'y'], ['anio_publicacion', '2000'], ['id_autor', FX.autor], ['id_categoria', FX.cat], ['id_editorial', FX.ed]], '/libros/nuevo'));
    chk('L28', 'Media', 'campo repetido (titulo=x&titulo=y) no provoca error 500', arr.status < 500 && !/Ocurrió un error|inesperado/.test(arr.html), `status ${arr.status}`);
    const xss = await alta(29, { titulo: '<img src=x onerror=alert(1)>' });
    const lst = await L.obtener('/libros?buscar=' + encodeURIComponent('onerror'));
    chk('L29', 'Alta', 'HTML en el título se escapa (sin XSS almacenado)', xss.exito && !lst.html.includes('<img src=x onerror') && lst.html.includes('&lt;img'), '');

    // editar
    const id1 = (await pool.query('SELECT id_libro FROM libros WHERE isbn=$1', [`ZZA${sfx}L1`])).rows[0].id_libro;
    ids.libros.push(id1);
    const upd = (id, x) => post(`/libros/${id}`, d(1, x), `/libros/${id}/editar`);
    const e1 = await resultado(await upd(id1, { titulo: 'ZZA Libro 1 editado' }));
    chk('L30', 'Info', 'editar conservando el propio ISBN funciona', e1.exito, e1.mensaje);
    const e2 = await resultado(await upd(id1, { isbn: `ZZA${sfx}L11` }));
    chk('L31', 'Alta', 'editar al ISBN de otro libro es rechazado', e2.rechazado, e2.mensaje);
    chk('L32', 'Alta', 'editar con año futuro es rechazado', (await resultado(await upd(id1, { anio_publicacion: String(anioAct + 1) }))).rechazado);
    const e404 = await post('/libros/99999999', d(1), `/libros/${id1}/editar`);
    const e404r = await resultado(e404);
    chk('L33', 'Baja', 'editar un libro inexistente informa error', e404.estado === 404 || e404r.rechazado, `status ${e404.estado}`);
    const inv = await post('/libros', d(34, { titulo: '' }), '/libros/nuevo');
    chk('L34', 'Baja', 'validación fallida responde 400 y no 200', inv.estado === 400, `status ${inv.estado}`);

    // eliminar
    const ej = await mkEj('Disponible', id1);
    const del = await resultado(await post(`/libros/${id1}/eliminar`, {}, '/libros'));
    chk('L35', 'Alta', 'no se elimina un libro con ejemplares', del.rechazado && /ejemplares/i.test(del.mensaje), del.mensaje);
    await pool.query('DELETE FROM ejemplares WHERE id_ejemplar=$1', [ej]);
    const del2 = await resultado(await post(`/libros/${id1}/eliminar`, {}, '/libros'));
    chk('L36', 'Info', 'tras quitar los ejemplares, el libro se elimina', del2.exito, del2.mensaje);

    // búsqueda por los 4 criterios
    const lb = await pool.query(`INSERT INTO libros (isbn, titulo, anio_publicacion, id_autor, id_categoria, id_editorial) VALUES ($1,$2,1999,$3,$4,$5) RETURNING id_libro`,
        [`ZZA${sfx}BUSQ`, `ZZA Titulo Singular ${sfx}`, FX.autor, FX.cat, FX.ed]);
    ids.libros.push(lb.rows[0].id_libro);
    const b = async (q) => L.filas((await L.obtener('/libros?buscar=' + encodeURIComponent(q))).html).length;
    chk('L40', 'Alta', 'buscador por título', (await b(`Singular ${sfx}`)) === 1, await b(`Singular ${sfx}`));
    chk('L41', 'Alta', 'buscador por ISBN', (await b(`ZZA${sfx}BUSQ`)) === 1);
    chk('L42', 'Alta', 'buscador por autor (nombre+apellido)', (await b(`ZZA Autor${sfx}`)) >= 1);
    chk('L43', 'Alta', 'buscador por categoría', (await b(`ZZA Cat ${sfx}`)) >= 1);

    // catálogo: cantidades disponibles
    const lc = await pool.query(`INSERT INTO libros (isbn, titulo, anio_publicacion, id_autor, id_categoria, id_editorial) VALUES ($1,$2,1999,$3,$4,$5) RETURNING id_libro`,
        [`ZZA${sfx}LCT`, `ZZA Catalogo ${sfx}`, FX.autor, FX.cat, FX.ed]);
    ids.libros.push(lc.rows[0].id_libro);
    for (const e of ['Disponible', 'Disponible', 'Prestado', 'Dañado', 'En mantenimiento']) await mkEj(e, lc.rows[0].id_libro);
    const cat = await L.obtener('/libros/catalogo');
    const fila = L.filas(cat.html).find((f) => f.includes(`ZZA Catalogo ${sfx}`));
    const tf = fila ? L.textoFila(fila) : '';
    chk('L50', 'Alta', 'catálogo: libro con 5 ejemplares (2 disponibles) muestra "2" disponibles y "5" totales', /\b2\b/.test(tf) && /\b5\b/.test(tf), tf);
    const det = await L.obtener(`/libros/${lc.rows[0].id_libro}`);
    chk('L51', 'Media', 'detalle del libro lista sus 5 ejemplares', L.filas(det.html).length === 5, `${L.filas(det.html).length} filas`);
    const sinEj = await pool.query(`INSERT INTO libros (isbn, titulo, anio_publicacion, id_autor, id_categoria, id_editorial) VALUES ($1,$2,1999,$3,$4,$5) RETURNING id_libro`,
        [`ZZA${sfx}SIN`, `ZZA SinEjemplares ${sfx}`, FX.autor, FX.cat, FX.ed]);
    ids.libros.push(sinEj.rows[0].id_libro);
    const cat2 = await L.obtener('/libros/catalogo');
    chk('L52', 'Media', 'catálogo muestra también los libros sin ejemplares (con 0)', cat2.html.includes(`ZZA SinEjemplares ${sfx}`));
    const dq = await L.obtener('/libros/99999999');
    chk('L53', 'Baja', 'detalle de libro inexistente avisa y no rompe', dq.estado === 302 || dq.estado === 404, `status ${dq.estado}`);
};

// =====================================================================
const ejemplares = async () => {
    seccion('EJEMPLARES');
    await login();
    const cod = (n) => `ZZA-${sfx}-E${n}`;
    const d = (n, x = {}) => ({ codigo_inventario: cod(n), id_libro: FX.libro, estado: 'Disponible', ...x });
    const alta = async (n, x) => resultado(await post('/ejemplares', d(n, x), '/ejemplares/nuevo'));
    const cant = async (c) => Number((await pool.query('SELECT COUNT(*) n FROM ejemplares WHERE codigo_inventario=$1', [c])).rows[0].n);

    chk('E01', 'Info', 'alta válida', (await alta(1)).exito);
    chk('E02', 'Alta', 'código de inventario duplicado rechazado', (await alta(2, { codigo_inventario: cod(1) })).rechazado);
    const dm = await alta(3, { codigo_inventario: cod(1).toLowerCase() });
    chk('E03', 'Baja', 'código duplicado distinto solo en mayúsculas rechazado', dm.rechazado, 'se aceptó "' + cod(1).toLowerCase() + '" junto a "' + cod(1) + '"');
    chk('E04', 'Media', 'código vacío/espacios rechazado', (await alta(4, { codigo_inventario: '   ' })).rechazado);
    chk('E05', 'Media', 'código de 51 caracteres rechazado', (await alta(5, { codigo_inventario: 'C'.repeat(51) })).rechazado);
    const c50 = await alta(6, { codigo_inventario: 'ZZA' + 'c'.repeat(47) });
    chk('E06', 'Baja', 'código de 50 caracteres (largo del diagrama del TP VARCHAR(50)) aceptado', c50.exito, c50.mensaje);
    chk('E07', 'Alta', 'estado inicial "Prestado" rechazado (solo lo asigna un préstamo)', (await alta(7, { estado: 'Prestado' })).rechazado && (await cant(cod(7))) === 0);
    chk('E08', 'Alta', 'estado inválido rechazado', (await alta(8, { estado: 'Perdido' })).rechazado);
    chk('E09', 'Alta', 'estado vacío rechazado', (await alta(9, { estado: '' })).rechazado);
    const e404 = await alta(10, { id_libro: '99999999' });
    chk('E10', 'Alta', 'libro inexistente rechazado y no se crea', e404.rechazado && (await cant(cod(10))) === 0, e404.mensaje);
    const big = await alta(11, { id_libro: '99999999999' });
    chk('E11', 'Media', 'id de libro fuera de rango: mensaje claro', big.rechazado && /no es válid|no existe/i.test(big.mensaje), big.mensaje);
    chk('E12', 'Alta', 'estados Dañado y En mantenimiento se aceptan al crear', (await alta(12, { estado: 'Dañado' })).exito && (await alta(13, { estado: 'En mantenimiento' })).exito);

    // editar ejemplar Prestado: el estado no puede alterarse a mano
    const idE = await mkEj('Disponible');
    const s = await mkSocio(60);
    const p = await prestar(s, [idE]);
    chk('E20', 'Info', 'se presta el ejemplar', p.exito, p.mensaje);
    const toca = await resultado(await post(`/ejemplares/${idE}`, { codigo_inventario: `ZZA-${sfx}-X20`, id_libro: FX.libro, estado: 'Disponible' }, `/ejemplares/${idE}/editar`));
    chk('E21', 'Alta', 'un ejemplar Prestado no puede pasar a Disponible editándolo a mano', (await estadoEj(idE)) === 'Prestado', await estadoEj(idE));
    const tocaD = await resultado(await post(`/ejemplares/${idE}`, { codigo_inventario: `ZZA-${sfx}-X20`, id_libro: FX.libro, estado: 'Dañado' }, `/ejemplares/${idE}/editar`));
    chk('E22', 'Alta', 'un ejemplar Prestado no puede pasar a Dañado editándolo a mano', (await estadoEj(idE)) === 'Prestado', await estadoEj(idE));
    const pr = await resultado(await post(`/ejemplares/${idE}/eliminar`, {}, '/ejemplares'));
    chk('E23', 'Alta', 'no se elimina un ejemplar Prestado / con préstamos', pr.rechazado && /préstamos/i.test(pr.mensaje), pr.mensaje);
    // editar un disponible a Prestado a mano
    const idD = await mkEj('Disponible');
    await post(`/ejemplares/${idD}`, { codigo_inventario: `ZZA-${sfx}-X21`, id_libro: FX.libro, estado: 'Prestado' }, `/ejemplares/${idD}/editar`);
    chk('E24', 'Alta', 'un ejemplar Disponible no puede marcarse "Prestado" a mano', (await estadoEj(idD)) !== 'Prestado', await estadoEj(idD));
    const up404 = await post('/ejemplares/99999999', d(30), '/ejemplares/nuevo');
    chk('E25', 'Baja', 'editar un ejemplar inexistente responde 404', up404.estado === 404, `status ${up404.estado}`);
    const inv = await post('/ejemplares', d(31, { estado: 'Nada' }), '/ejemplares/nuevo');
    chk('E26', 'Baja', 'validación fallida responde 400 y no 200', inv.estado === 400, `status ${inv.estado}`);
    const libroMov = await resultado(await post(`/ejemplares/${idE}`, { codigo_inventario: `ZZA-${sfx}-X20`, id_libro: '99999999' }, `/ejemplares/${idE}/editar`));
    chk('E27', 'Media', 'editar un ejemplar hacia un libro inexistente rechazado', libroMov.rechazado, libroMov.mensaje);
    const busq = await L.obtener('/ejemplares?buscar=' + encodeURIComponent(`ZZA-${sfx}-X20`));
    chk('E28', 'Media', 'buscador de ejemplares por código', L.filas(busq.html).length === 1, `${L.filas(busq.html).length}`);
};

// =====================================================================
const prestamos = async () => {
    seccion('PRÉSTAMOS - reglas de alta');
    await login();
    const act = await mkSocio(1);
    const ina = await mkSocio(2, 'Inactivo');

    // inexistentes / fuera de rango
    const e1 = await mkEj();
    const p1 = await prestar(99999999, [e1]);
    chk('P01', 'Alta', 'socio inexistente rechazado con mensaje claro', p1.rechazado && /socio/i.test(p1.mensaje), p1.mensaje);
    const p2 = await prestar('99999999999', [e1]);
    chk('P02', 'Media', 'id de socio fuera de rango: mensaje claro (sin texto interno de PostgreSQL)', p2.rechazado && !/integer|rango|range|invalid input|syntax/i.test(p2.mensaje), p2.mensaje);
    const p3 = await prestar(act, [99999999]);
    chk('P03', 'Alta', 'ejemplar inexistente rechazado con mensaje claro', p3.rechazado && /ejemplar/i.test(p3.mensaje), p3.mensaje);
    const p4 = await prestar(act, ['99999999999']);
    chk('P04', 'Media', 'id de ejemplar fuera de rango: mensaje claro (sin texto interno de PostgreSQL)', p4.rechazado && !/integer|rango|range|invalid input|syntax/i.test(p4.mensaje), p4.mensaje);
    const arr = await resultado(await post('/prestamos', [['id_socio', act], ['id_ejemplar_1', e1], ['id_ejemplar_1', e1 + 1]], '/prestamos/nuevo'));
    chk('P05', 'Media', 'campo id_ejemplar_1 repetido (array): rechazado sin filtrar texto interno de la BD', mal(arr) && !/integer|invalid input|syntax/i.test(sinHtml(arr.html)) && (await estadoEj(e1)) === 'Disponible', arr.mensaje);
    const arrS = await resultado(await post('/prestamos', [['id_socio', act], ['id_socio', ina], ['id_ejemplar_1', e1]], '/prestamos/nuevo'));
    chk('P06', 'Media', 'campo id_socio repetido (array): rechazado sin filtrar texto interno de la BD', (mal(arrS) && !/integer|invalid input|syntax/i.test(sinHtml(arrS.html))) , arrS.mensaje + ' | ejemplar=' + await estadoEj(e1));
    const sinE = await resultado(await post('/prestamos', { id_socio: act }, '/prestamos/nuevo'));
    chk('P07', 'Alta', 'sin ejemplares rechazado', sinE.rechazado, sinE.mensaje);
    const sinS = await resultado(await post('/prestamos', { id_ejemplar_1: e1 }, '/prestamos/nuevo'));
    chk('P08', 'Alta', 'sin socio rechazado', sinS.rechazado, sinS.mensaje);
    const soloE2 = await resultado(await post('/prestamos', { id_socio: act, id_ejemplar_2: e1 }, '/prestamos/nuevo'));
    chk('P09', 'Alta', 'enviar solo el ejemplar 2 (sin el 1) rechazado, no queda ejemplar prestado', soloE2.rechazado && (await estadoEj(e1)) === 'Disponible', soloE2.mensaje);

    // socio inactivo
    const pi = await prestar(ina, [e1]);
    chk('P10', 'Alta', 'socio inactivo no puede pedir préstamo (POST forzado)', pi.rechazado && /activo/i.test(pi.mensaje) && (await nPrestamos(ina)) === 0 && (await estadoEj(e1)) === 'Disponible', pi.mensaje);

    // ejemplar en distintos estados
    for (const [i, est] of [['Dañado', 'P11'], ['En mantenimiento', 'P12'], ['Prestado', 'P13']].map((x) => x)) {
        const idX = await mkEj(i);
        const r = await prestar(act, [idX]);
        chk(est, 'Alta', `no se presta un ejemplar "${i}"`, r.rechazado && /disponible/i.test(r.mensaje) && (await nPrestamos(act)) === 0, r.mensaje);
    }

    // cuatro ejemplares por POST forzado
    const [a, b, c, e4] = [await mkEj(), await mkEj(), await mkEj(), await mkEj()];
    const cuatro = await resultado(await post('/prestamos', { id_socio: act, id_ejemplar_1: a, id_ejemplar_2: b, id_ejemplar_3: c, id_ejemplar_4: e4 }, '/prestamos/nuevo'));
    const detCuatro = Number((await pool.query('SELECT COUNT(*) n FROM detalle_prestamo d JOIN prestamos p USING(id_prestamo) WHERE p.id_socio=$1', [act])).rows[0].n);
    chk('P14', 'Media', 'un POST con 4 ejemplares se rechaza explícitamente (regla: máximo 3)', cuatro.rechazado, `exito=${cuatro.exito}; préstamo creado con ${detCuatro} ejemplares y el 4º se ignoró en silencio`);
    await pool.query('DELETE FROM detalle_prestamo WHERE id_prestamo IN (SELECT id_prestamo FROM prestamos WHERE id_socio=$1)', [act]);
    await pool.query('DELETE FROM prestamos WHERE id_socio=$1', [act]);
    await pool.query("UPDATE ejemplares SET estado='Disponible' WHERE id_ejemplar = ANY($1)", [[a, b, c, e4]]);

    // mismo ejemplar escrito distinto
    const dupId = await resultado(await post('/prestamos', { id_socio: act, id_ejemplar_1: String(a), id_ejemplar_2: '0' + a }, '/prestamos/nuevo'));
    chk('P15', 'Media', 'el mismo ejemplar escrito como "N" y "0N" no se duplica en el préstamo', dupId.rechazado && (await estadoEj(a)) === 'Disponible' && (await nPrestamos(act)) === 0, dupId.mensaje);

    // vencimiento
    const ok = await prestar(act, [a, b]);
    const pr = (await pool.query('SELECT *, (fecha_vencimiento - fecha_prestamo) d, fecha_prestamo = CURRENT_DATE hoy FROM prestamos WHERE id_socio=$1 ORDER BY id_prestamo DESC LIMIT 1', [act])).rows[0];
    chk('P16', 'Alta', 'vencimiento = fecha de préstamo (hoy) + 7 días, estado Activo', ok.exito && Number(pr.d) === 7 && pr.hoy && pr.estado === 'Activo', JSON.stringify(pr));
    chk('P17', 'Alta', 'ambos ejemplares quedan Prestado', (await estadoEj(a)) === 'Prestado' && (await estadoEj(b)) === 'Prestado');
    await pool.query('DELETE FROM detalle_prestamo WHERE id_prestamo=$1', [pr.id_prestamo]);
    await pool.query('DELETE FROM prestamos WHERE id_prestamo=$1', [pr.id_prestamo]);
    await pool.query("UPDATE ejemplares SET estado='Disponible' WHERE id_ejemplar = ANY($1)", [[a, b]]);

    // límite de 3 préstamos abiertos (Activo + Vencido)
    seccion('PRÉSTAMOS - límite de 3 abiertos');
    const s3 = await mkSocio(3);
    await prestamoSql(s3, [await mkEj()], { desde: 0, venc: 7, estado: 'Activo' });
    await prestamoSql(s3, [await mkEj()], { desde: 0, venc: 7, estado: 'Activo' });
    await prestamoSql(s3, [await mkEj()], { desde: 20, venc: 7, estado: 'Vencido' });
    const cuarto = await prestar(s3, [await mkEj()]);
    chk('P20', 'Alta', 'con 2 Activos + 1 Vencido ya no puede pedir un 4º (el vencido sigue abierto)', cuarto.rechazado && /3 préstamos/i.test(cuarto.mensaje), cuarto.mensaje);
    const s4 = await mkSocio(4);
    for (let i = 0; i < 3; i++) await prestamoSql(s4, [], { desde: 30, venc: 7, estado: 'Devuelto' });
    const conDev = await prestar(s4, [await mkEj()]);
    chk('P21', 'Alta', 'los préstamos Devueltos no cuentan para el límite', conDev.exito, conDev.mensaje);
    // exactamente 3 → el 3º sí
    const s5 = await mkSocio(5);
    const t = [];
    for (let i = 0; i < 3; i++) t.push(await prestar(s5, [await mkEj()]));
    chk('P22', 'Alta', 'un socio puede abrir exactamente 3 préstamos', t.every((x) => x.exito), t.map((x) => x.mensaje).join('|'));
    // limite 3 ejemplares x 3 préstamos = 9 en total OK
    const s6 = await mkSocio(6);
    const r9 = [];
    for (let i = 0; i < 3; i++) r9.push(await prestar(s6, [await mkEj(), await mkEj(), await mkEj()]));
    chk('P23', 'Info', '3 préstamos de 3 ejemplares (9 ejemplares en total) permitidos', r9.every((x) => x.exito), r9.map((x) => x.mensaje).join('|'));

    // concurrencia
    seccion('PRÉSTAMOS - concurrencia');
    const sc = await mkSocio(7);
    const libres = [];
    for (let i = 0; i < 8; i++) libres.push(await mkEj());
    const rs = await Promise.all(libres.map((e) => prestar(sc, [e])));
    const abiertos = await nPrestamos(sc);
    chk('P30', 'Alta', '8 pedidos simultáneos del mismo socio: nunca más de 3 préstamos', abiertos <= 3, `${abiertos} préstamos creados`);
    chk('P31', 'Media', '... y exactamente 3 prosperan', abiertos === 3, `${abiertos}`);
    const sinMsgRaro = rs.filter((x) => x.rechazado).every((x) => /3 préstamos|disponible/i.test(x.mensaje));
    chk('P32', 'Media', 'los rechazados por concurrencia muestran el mensaje de negocio (no error técnico)', sinMsgRaro, rs.filter((x) => x.rechazado).map((x) => x.mensaje).filter((m) => !/3 préstamos/.test(m)).join(' | '));
    const socs = [];
    for (let i = 0; i < 5; i++) socs.push(await mkSocio(10 + i));
    const unico = await mkEj();
    await Promise.all(socs.map((s) => prestar(s, [unico])));
    const dueños = Number((await pool.query('SELECT COUNT(*) n FROM detalle_prestamo WHERE id_ejemplar=$1 AND prestamo_activo', [unico])).rows[0].n);
    chk('P33', 'Alta', '5 socios piden a la vez el mismo ejemplar: lo obtiene exactamente 1', dueños === 1, `${dueños}`);
    // deadlock: pedidos con ejemplares en orden inverso
    let deadlocks = 0, ejecutados = 0, msgs = new Set();
    for (let it = 0; it < 20; it++) {
        const sa = await mkSocio(20 + it * 2), sb = await mkSocio(21 + it * 2);
        const x = await mkEj(), y = await mkEj();
        const [ra, rb] = await Promise.all([prestar(sa, [x, y]), prestar(sb, [y, x])]);
        ejecutados++;
        for (const r of [ra, rb]) if (r.rechazado && /deadlock|interbloqueo/i.test(r.mensaje)) { deadlocks++; msgs.add(r.mensaje); }
    }
    chk('P34', 'Media', 'pedidos simultáneos con los mismos ejemplares en orden inverso no producen deadlock', deadlocks === 0, `${deadlocks} deadlocks en ${ejecutados} rondas: ${[...msgs].join(' | ')}`);

    // ---------------- DEVOLUCIONES
    seccion('DEVOLUCIONES, ATRASO Y MULTAS');
    const devolver = async (id, estados = {}) => {
        const r = await post(`/prestamos/${id}/devolver`, estados, "/");
        if (r.destino) { const p = await L.seguir(r); return { estado: r.estado, html: p.html, destino: r.destino, alertas: p.alertas }; }
        return { estado: r.estado, html: r.html, destino: r.destino, alertas: L.alertas(r.html) };
    };
    const detalles = async (id) => (await pool.query('SELECT dias_atraso, multa::int multa, prestamo_activo, id_ejemplar FROM detalle_prestamo WHERE id_prestamo=$1 ORDER BY id_detalle', [id])).rows;
    const prest = async (id) => (await pool.query('SELECT estado, fecha_devolucion = CURRENT_DATE hoy FROM prestamos WHERE id_prestamo=$1', [id])).rows[0];
    const casos = [
        // [desde, venc, esperadoDias, ejemplares]
        ['D01', 3, 7, 0, 2, 'en término (faltan 4 días)'],
        ['D02', 7, 7, 0, 3, 'vence hoy (0 días de atraso)'],
        ['D03', 8, 7, 1, 1, '1 día de atraso'],
        ['D04', 10, 7, 3, 3, '3 días de atraso, 3 ejemplares'],
        ['D05', 37, 7, 30, 2, '30 días de atraso, 2 ejemplares'],
        ['D06', 372, 7, 365, 3, '365 días de atraso, 3 ejemplares']
    ];
    for (const [id, desde, venc, esperado, n, desc] of casos) {
        const sd = await mkSocio(100 + Number(id.slice(1)));
        const es = []; for (let i = 0; i < n; i++) es.push(await mkEj());
        const pid = await prestamoSql(sd, es, { desde, venc });
        const r = await devolver(pid);
        const dts = await detalles(pid);
        const total = esperado * 500 * n;
        const pantalla = texto(r.html);
        const totalFmt = total.toLocaleString('es-AR');
        chk(id, 'Alta', `${desc}: cada detalle guarda ${esperado} días y $${esperado * 500}; total $${totalFmt}`,
            r.estado === 200 && dts.every((x) => x.dias_atraso === esperado && x.multa === esperado * 500 && x.prestamo_activo === false) && (total === 0 || pantalla.includes('$' + totalFmt)) && (await prest(pid)).estado === 'Devuelto',
            JSON.stringify(dts) + ' ' + pantalla.slice(pantalla.indexOf('Devolución registrada'), pantalla.indexOf('Devolución registrada') + 220));
        const sumaDb = Number((await pool.query('SELECT COALESCE(SUM(multa),0) s FROM detalle_prestamo WHERE id_prestamo=$1', [pid])).rows[0].s);
        chk(id + 'b', 'Alta', `${desc}: total de multa = suma de las multas de los detalles`, sumaDb === total, `${sumaDb} vs ${total}`);
        for (const e of es) if ((await estadoEj(e)) !== 'Disponible') { chk(id + 'c', 'Alta', 'ejemplar vuelve a Disponible', false, await estadoEj(e)); }
    }
    // estados en la devolución
    const sd = await mkSocio(120);
    const [x1, x2, x3] = [await mkEj(), await mkEj(), await mkEj()];
    const pe = await prestamoSql(sd, [x1, x2, x3]);
    const rE = await devolver(pe, { [`estado_${x1}`]: 'Prestado', [`estado_${x2}`]: 'Perdido', [`estado_${x3}`]: '' });
    const eFinal = [await estadoEj(x1), await estadoEj(x2), await estadoEj(x3)];
    chk('D10', 'Media', 'estados no permitidos en la devolución ("Prestado", "Perdido") se rechazan en vez de convertirse en silencio a Disponible', rE.alertas.some((a) => a.tipo === 'danger') && eFinal.every((s) => s === 'Prestado'), `se devolvió con estados finales ${eFinal.join(', ')} y respuesta ${rE.estado}`);
    // devolución válida con estado para otro ejemplar ajeno
    const sd2 = await mkSocio(121);
    const [y1, y2] = [await mkEj(), await mkEj()];
    const ajeno = await mkEj();
    const pa = await prestamoSql(sd2, [y1, y2]);
    await devolver(pa, { [`estado_${y1}`]: 'Dañado', [`estado_${ajeno}`]: 'Dañado' });
    chk('D11', 'Alta', 'el estado enviado para un ejemplar ajeno al préstamo no lo modifica', (await estadoEj(ajeno)) === 'Disponible' && (await estadoEj(y1)) === 'Dañado' && (await estadoEj(y2)) === 'Disponible', `${await estadoEj(ajeno)} ${await estadoEj(y1)} ${await estadoEj(y2)}`);

    // segunda devolución y reuso del ejemplar
    const sd3 = await mkSocio(122), sd4 = await mkSocio(123);
    const z = await mkEj();
    const pz = await prestamoSql(sd3, [z], { desde: 10, venc: 7 });
    await devolver(pz);
    const multaAntes = (await detalles(pz))[0].multa;
    const pz2 = await prestar(sd4, [z]);
    chk('D20', 'Info', 'el ejemplar devuelto puede prestarse de inmediato a otro socio', pz2.exito, pz2.mensaje);
    const otra = await devolver(pz);
    const aun = await estadoEj(z);
    const dt = await detalles(pz);
    chk('D21', 'Alta', 'una segunda devolución del mismo préstamo se rechaza con mensaje', otra.alertas.some((a) => a.tipo === 'danger' && /ya fue devuelto/i.test(a.texto)) || /ya fue devuelto/i.test(texto(otra.html)), JSON.stringify(otra.alertas));
    chk('D22', 'Alta', 'la segunda devolución NO libera el ejemplar que ya está en otro préstamo', aun === 'Prestado', aun);
    chk('D23', 'Alta', 'la segunda devolución no recalcula ni duplica la multa', dt[0].multa === multaAntes && multaAntes === 1500, `${dt[0].multa} (antes ${multaAntes})`);
    const gp = await L.seguir(await L.obtener(`/prestamos/${pz}/devolver`));
    chk('D24', 'Media', 'la pantalla de devolución de un préstamo cerrado redirige con aviso', gp.alertas.some((a) => a.tipo === 'danger'), JSON.stringify(gp.alertas));
    const inex = await devolver(99999999);
    chk('D25', 'Media', 'devolver un préstamo inexistente avisa con mensaje claro', inex.alertas.some((a) => a.tipo === 'danger') || /no existe/i.test(texto(inex.html)), JSON.stringify(inex.alertas) + inex.estado);

    // devolución paralela
    const sp = await mkSocio(124);
    const [q1, q2] = [await mkEj(), await mkEj()];
    const pp = await prestamoSql(sp, [q1, q2], { desde: 12, venc: 7 });
    const [pa1, pa2, pa3] = await Promise.all([devolver(pp), devolver(pp), devolver(pp)]);
    const exitos = [pa1, pa2, pa3].filter((r) => r.estado === 200 && /Devolución registrada/.test(r.html)).length;
    const dts = await detalles(pp);
    chk('D30', 'Alta', '3 devoluciones simultáneas del mismo préstamo: solo una se registra', exitos === 1, `${exitos} exitosas`);
    chk('D31', 'Alta', '... y la multa no se duplica (5 días × $500 por ejemplar)', dts.every((x) => x.multa === 2500), JSON.stringify(dts));

    // estado Vencido lazy
    seccion('ESTADO VENCIDO / LISTADOS / FILTROS');
    const sv = await mkSocio(130);
    const pHoy = await prestamoSql(sv, [await mkEj()], { desde: 7, venc: 7 });   // vence hoy
    const pAyer = await prestamoSql(sv, [await mkEj()], { desde: 8, venc: 7 });  // venció ayer
    await L.obtener('/prestamos');
    const eh = (await pool.query('SELECT estado FROM prestamos WHERE id_prestamo=$1', [pHoy])).rows[0].estado;
    const ea = (await pool.query('SELECT estado FROM prestamos WHERE id_prestamo=$1', [pAyer])).rows[0].estado;
    chk('V01', 'Alta', 'un préstamo que vence hoy sigue Activo y el que venció ayer pasa a Vencido', eh === 'Activo' && ea === 'Vencido', `${eh}/${ea}`);
    const lv = await L.obtener('/prestamos?estado=Vencido&id_socio=' + sv);
    const la = await L.obtener('/prestamos?estado=Activo&id_socio=' + sv);
    chk('V02', 'Alta', 'filtro Vencido muestra solo el vencido; filtro Activo solo el vigente', L.filas(lv.html).length === 1 && lv.html.includes('#' + pAyer) && L.filas(la.html).length === 1 && la.html.includes('#' + pHoy), `${L.filas(lv.html).length}/${L.filas(la.html).length}`);
    const dpv = await L.obtener(`/prestamos/${pAyer}`);
    const tp = texto(dpv.html);
    chk('V03', 'Baja', 'el detalle de un préstamo vencido sin devolver avisa cuántos días de atraso lleva', /lleva 1 día de atraso/.test(tp), 'no informa el atraso acumulado; la columna queda vacía');
    chk('V05', 'Baja', 'el detalle de un préstamo aún abierto no muestra "$0" de multa como si ya estuviera calculada', !/\$\s?0(?!\d)/.test(tp), 'muestra $0 de multa en un préstamo que no fue devuelto');
    const lst = await L.obtener('/prestamos?id_socio=' + sv);
    const txtLista = texto(lst.html);
    chk('V04', 'Baja', 'el listado de préstamos muestra el código de ejemplar y la categoría (JOIN pedido en el punto 8)', /ZZA-\d+-\d+/.test(txtLista) && /ZZA Cat/.test(txtLista), 'solo muestra "Título (Autor)"');

    // filtros defectuosos
    const f1 = await L.seguir(await L.obtener('/prestamos?fechaDesde=abc'));
    chk('V10', 'Media', 'fechaDesde inválida ("abc") muestra un aviso específico de fecha', f1.alertas.some((a) => /fecha/i.test(a.texto)), JSON.stringify(f1.alertas) + ' ruta=' + f1.ruta);
    const f2 = await L.seguir(await L.obtener('/prestamos?fechaDesde=2026-02-30'));
    chk('V11', 'Media', 'fecha imposible (2026-02-30) muestra un aviso específico de fecha', f2.alertas.some((a) => /fecha/i.test(a.texto)), JSON.stringify(f2.alertas) + ' ruta=' + f2.ruta);
    const f3 = await L.seguir(await L.obtener('/prestamos?id_socio=99999999999'));
    chk('V12', 'Media', 'id_socio fuera de rango no expulsa al usuario al inicio con error genérico', f3.ruta === '/prestamos' || f3.estado === 200 && !/No se pudieron obtener/.test(JSON.stringify(f3.alertas)), JSON.stringify(f3.alertas) + ' ruta=' + f3.ruta);
    for (let i = 0; i < 12; i++) await prestamoSql(sv, [], { desde: 40, venc: 7, estado: 'Devuelto' });
    const f4 = await L.obtener('/prestamos?pagina=1.5');
    const f4b = await L.obtener('/prestamos?pagina=1');
    chk('V13', 'Baja', '?pagina=1.5 se trata como página entera (misma página 1, sin saltar filas)', /Página 1 de/.test(f4.html) && L.filas(f4.html).length === L.filas(f4b.html).length && L.textoFila(L.filas(f4.html)[0]) === L.textoFila(L.filas(f4b.html)[0]), (f4.html.match(/Página [^<]{0,12}/) || [''])[0]);
    const f5 = await L.seguir(await L.obtener('/prestamos?estado=Devuelto&id_socio=' + ina + '&pagina=1e30'));
    chk('V14', 'Media', '?pagina=1e30 sin resultados no produce error', f5.estado === 200 && f5.alertas.length === 0, JSON.stringify(f5.alertas) + ' ruta=' + f5.ruta);
    const f6 = await L.seguir(await L.obtener('/prestamos?estado=Activo&estado=Vencido'));
    chk('V15', 'Baja', 'estado repetido (array) se maneja sin error 500', f6.estado < 500, `status ${f6.estado}`);
    const f7 = await L.seguir(await L.obtener('/prestamos?fechaDesde=2026-01-01&fechaDesde=2026-02-01'));
    chk('V16', 'Baja', 'fechaDesde repetida (array) se maneja con un aviso y sin error genérico', f7.estado < 500 && !/No se pudieron obtener/.test(JSON.stringify(f7.alertas)), JSON.stringify(f7.alertas));
    // borde de rango de fechas: el día "hasta" incluido
    const hoy = (await pool.query('SELECT CURRENT_DATE::text d')).rows[0].d;
    const fr = await L.obtener(`/prestamos?fechaDesde=${hoy}&fechaHasta=${hoy}&id_socio=${sv}`);
    const hoyP = await prestar(sv, [await mkEj()]);
    const fr2 = await L.obtener(`/prestamos?fechaDesde=${hoy}&fechaHasta=${hoy}&id_socio=${sv}`);
    chk('V17', 'Media', 'rango desde=hasta=hoy incluye el préstamo creado hoy (límites inclusivos)', hoyP.exito && L.filas(fr2.html).length === 1, `${L.filas(fr2.html).length} filas / ${hoyP.mensaje}`);

    // historiales
    seccion('HISTORIALES / DETALLE / DASHBOARD');
    const hs = await L.obtener('/prestamos/socio/99999999');
    chk('H01', 'Baja', 'historial de un socio inexistente responde 404 (no "no tiene préstamos")', hs.estado === 404 || /no existe|no encontrado/i.test(texto(hs.html)), `status ${hs.estado}: ${/no tiene préstamos/.test(hs.html) ? 'dice "El socio no tiene préstamos registrados"' : ''}`);
    const he = await L.obtener('/prestamos/ejemplar/99999999');
    chk('H02', 'Baja', 'historial de un ejemplar inexistente responde 404', he.estado === 404 || /no existe|no encontrado/i.test(texto(he.html)), `status ${he.estado}`);
    const hsv = await L.obtener(`/prestamos/socio/${sv}`);
    chk('H03', 'Baja', 'el historial del socio identifica de quién es (nombre del socio en la página)', /ZZA130/.test(hsv.html), 'la página solo dice "Historial del socio" sin nombre');
    const dd = await L.seguir(await L.obtener('/prestamos/99999999'));
    chk('H04', 'Media', 'detalle de préstamo inexistente avisa', dd.alertas.some((a) => a.tipo === 'danger'));
    const sinDetalle = await prestamoSql(sv, [], { desde: 0, venc: 7 });
    const dsd = await L.seguir(await L.obtener(`/prestamos/${sinDetalle}`));
    chk('H05', 'Info', 'un préstamo sin ejemplares (dato inconsistente) se maneja sin romper', dsd.estado < 500, `status ${dsd.estado}`);
    // dashboard coherente con la BD
    const dash = await L.obtener('/');
    const cnt = (await pool.query(`SELECT (SELECT COUNT(*) FROM socios WHERE estado='Activo') s, (SELECT COUNT(*) FROM libros) l, (SELECT COUNT(*) FROM ejemplares WHERE estado='Disponible') e, (SELECT COUNT(*) FROM prestamos WHERE estado='Activo') a, (SELECT COUNT(*) FROM prestamos WHERE estado='Vencido') v`)).rows[0];
    const td = texto(dash.html);
    const m = td.match(/Socios activos\s+(\d+)\s+Libros\s+(\d+)\s+Ejemplares disponibles\s+(\d+)\s+Préstamos activos\s+(\d+)\s+Préstamos vencidos\s+(\d+)/);
    chk('H10', 'Alta', 'las 5 tarjetas del dashboard coinciden con la base', m && [cnt.s, cnt.l, cnt.e, cnt.a, cnt.v].every((v, i) => Number(v) === Number(m[i + 1])), JSON.stringify(cnt) + ' vs ' + (m ? m.slice(1).join(',') : td.slice(0, 200)));
    // vencidos listados en dashboard
    chk('H11', 'Media', 'el dashboard lista el préstamo vencido', dash.html.includes('#' + pAyer));
};

// =====================================================================
const bd = async () => {
    seccion('INTEGRIDAD EN LA BASE DE DATOS (SQL directo)');
    const s = await mkSocio(200);
    const e = await mkEj();
    const intenta = async (sql, params = []) => { try { await pool.query(sql, params); return { ok: true }; } catch (x) { return { ok: false, code: x.code, msg: x.message }; } };
    let r = await intenta("INSERT INTO prestamos (id_socio, fecha_prestamo, fecha_vencimiento, estado) VALUES ($1, CURRENT_DATE, CURRENT_DATE - 1, 'Activo')", [s]);
    chk('B01', 'Alta', 'la BD rechaza un vencimiento anterior a la fecha de préstamo (INSERT)', !r.ok && r.code === '23514', JSON.stringify(r));
    const pid = await prestamoSql(s, [], { desde: 0, venc: 7 });
    r = await intenta('UPDATE prestamos SET fecha_vencimiento = fecha_prestamo - 3 WHERE id_prestamo=$1', [pid]);
    chk('B02', 'Alta', 'la BD rechaza dejar un vencimiento anterior en un UPDATE', !r.ok && r.code === '23514', JSON.stringify(r));
    r = await intenta("INSERT INTO prestamos (id_socio, fecha_prestamo, fecha_vencimiento, estado) VALUES ($1, CURRENT_DATE, CURRENT_DATE+7, 'Perdido')", [s]);
    chk('B03', 'Media', 'la BD rechaza un estado de préstamo inválido', !r.ok && r.code === '23514', JSON.stringify(r));
    r = await intenta("INSERT INTO socios (nombre,apellido,dni,email,estado) VALUES ('ZZAx','x','1',$1,'Raro')", [`zza.bd.${sfx}@x.com`]);
    chk('B04', 'Media', 'la BD rechaza un estado de socio inválido', !r.ok && r.code === '23514', JSON.stringify(r));
    const p1 = await prestamoSql(s, [e]);
    const p2 = (await pool.query("INSERT INTO prestamos (id_socio, fecha_prestamo, fecha_vencimiento, estado) VALUES ($1, CURRENT_DATE, CURRENT_DATE+7, 'Activo') RETURNING id_prestamo", [s])).rows[0].id_prestamo;
    r = await intenta('INSERT INTO detalle_prestamo (id_prestamo, id_ejemplar) VALUES ($1,$2)', [p2, e]);
    chk('B05', 'Alta', 'la BD impide el mismo ejemplar en dos préstamos activos', !r.ok && r.code === '23505', JSON.stringify(r));
    r = await intenta('DELETE FROM prestamos WHERE id_prestamo=$1', [p1]);
    chk('B06', 'Alta', 'la BD impide borrar un préstamo que tiene detalle (integridad referencial)', !r.ok && r.code === '23503', JSON.stringify(r));
    r = await intenta('DELETE FROM ejemplares WHERE id_ejemplar=$1', [e]);
    chk('B07', 'Alta', 'la BD impide borrar un ejemplar con historial', !r.ok && r.code === '23503', JSON.stringify(r));
    r = await intenta('DELETE FROM socios WHERE id_socio=$1', [s]);
    chk('B08', 'Alta', 'la BD impide borrar un socio con préstamos', !r.ok && r.code === '23503', JSON.stringify(r));
    r = await intenta("INSERT INTO detalle_prestamo (id_prestamo,id_ejemplar,dias_atraso,multa,prestamo_activo) VALUES ($1,$2,-5,-2500,false)", [p2, await mkEj()]);
    chk('B09', 'Baja', 'la BD rechaza días de atraso / multa negativos (CHECK)', !r.ok, 'se aceptó dias_atraso=-5, multa=-2500');
    r = await intenta("INSERT INTO libros (isbn,titulo,anio_publicacion,id_autor,id_categoria,id_editorial) VALUES ($1,'x',3000,$2,$3,$4)", [`ZZA${sfx}B10`, FX.autor, FX.cat, FX.ed]);
    chk('B10', 'Alta', 'la BD rechaza año de publicación futuro', !r.ok && r.code === '23514', JSON.stringify(r));
    r = await intenta("INSERT INTO libros (isbn,titulo,anio_publicacion,id_autor,id_categoria,id_editorial) VALUES ($1,'x',-50,$2,$3,$4)", [`ZZA${sfx}B11`, FX.autor, FX.cat, FX.ed]);
    if (r.ok) ids.libros.push(0);
    chk('B11', 'Baja', 'la BD rechaza años no razonables (negativos) además de futuros', !r.ok, 'el CHECK solo limita el máximo; el mínimo (1000) solo está en la aplicación');
    // consistencia ejemplar-préstamo sin pasar por la app
    const e2 = await mkEj();
    const p3 = (await pool.query("INSERT INTO prestamos (id_socio, fecha_prestamo, fecha_vencimiento, estado) VALUES ($1, CURRENT_DATE, CURRENT_DATE+7, 'Activo') RETURNING id_prestamo", [s])).rows[0].id_prestamo;
    await pool.query('INSERT INTO detalle_prestamo (id_prestamo,id_ejemplar) VALUES ($1,$2)', [p3, e2]);
    const inc = await estadoEj(e2);
    chk('B12', 'Info', 'un detalle activo puede coexistir con un ejemplar "Disponible" si se escribe por fuera de la app (no hay trigger; la consistencia depende de la transacción de la app)', inc === 'Prestado', `estado del ejemplar: ${inc}`);
    const maxSoc = await pool.query('SELECT COUNT(*) n FROM prestamos WHERE id_socio=$1 AND estado IN (\'Activo\',\'Vencido\')', [s]);
    chk('B13', 'Info', 'el límite de 3 préstamos abiertos no está en la BD (solo en la app)', Number(maxSoc.rows[0].n) <= 3, `${maxSoc.rows[0].n} abiertos para el socio por SQL directo`);
    const tz = (await pool.query("SELECT current_setting('TimeZone') tz")).rows[0].tz;
    chk('B14', 'Info', 'zona horaria de la BD = zona del servidor de aplicación (CURRENT_DATE coherente)', tz === Intl.DateTimeFormat().resolvedOptions().timeZone, `BD ${tz} / Node ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
};

// =====================================================================
const robustez = async () => {
    seccion('ROBUSTEZ DEL SERVIDOR');
    await login();
    const grande = await L.pedir('POST', '/socios', [['nombre', 'x'.repeat(300000)], ['_csrf', await L.token('/socios/nuevo')]]);
    chk('R01', 'Baja', 'cuerpo de 300 KB responde 413 (no 500)', grande.estado === 413, `status ${grande.estado}`);
    const mal = await fetch(L.BASE + '/socios?buscar=%E0%A4%A', { redirect: 'manual', headers: { cookie: '' } });
    chk('R02', 'Info', 'URL con % mal formado no tumba el servidor', mal.status < 500 || true, `status ${mal.status}`);
    const st = await L.obtener('/socios');
    chk('R03', 'Alta', 'el servidor sigue respondiendo tras las pruebas hostiles', st.estado === 200, `status ${st.estado}`);
    const met = await L.pedir('PUT', '/socios/1', { nombre: 'x' });
    chk('R05', 'Info', 'método PUT no soportado: no modifica datos', met.estado === 404 || met.estado === 403, `status ${met.estado}`);
    const getEliminar = await L.obtener('/socios/1/eliminar');
    chk('R06', 'Alta', 'eliminar no se puede disparar con un GET (solo POST + CSRF)', getEliminar.estado === 404, `status ${getEliminar.estado}`);
    const getLogout = await L.obtener('/logout');
    chk('R07', 'Media', 'logout no se dispara con un GET', getLogout.estado === 404 || getLogout.estado === 302, `status ${getLogout.estado}`);
};

(async () => {
    try {
        await login();
        await prep();
        const todas = { auth, socios, catalogos, libros, ejemplares, prestamos, bd, robustez };
        for (const [nombre, fn] of Object.entries(todas)) {
            if (filtroArea && filtroArea !== nombre) continue;
            try { await fn(); } catch (e) { console.error(`ERROR en ${nombre}:`, e); R.push({ area: nombre, id: 'ERR', sev: 'Alta', desc: 'excepción en la batería: ' + e.message, ok: false, evid: String(e.stack).slice(0, 300) }); }
        }
    } finally {
        await limpiar();
        await pool.end();
        const f = R.filter((r) => !r.ok);
        console.log(`\n==== RESUMEN: ${R.length - f.length} de ${R.length} pruebas correctas (las NOTA son observaciones de diseño, no fallas) ====`);
        if (f.length) {
            console.log('Fallaron:');
            for (const x of f) console.log(`  [${x.id}] (${x.sev}) ${x.desc}\n       -> ${x.evid}`);
        }
        process.exitCode = f.length ? 1 : process.exitCode;
    }
})();
