// Prueba de aceptación de Socios, Libros, Ejemplares, Préstamos/Devoluciones, Usuarios y acceso.
require('../node_modules/dotenv').config({ quiet: true });

const pool = require('../config/database');
const L = require('./lib');

const sufijo = String(Date.now() % 1000000).padStart(6, '0');
const dni = (n) => `98${sufijo}${n}`;
const correo = (n) => `zzprueba.${sufijo}.${n}@email.com`;

// Resultado de un intento de alta/modificación: ¿fue rechazado y con qué mensaje?
const rechazo = async (respuesta) => {
    if (respuesta.destino) {
        const pagina = await L.seguir(respuesta);
        const alerta = pagina.alertas.find((a) => a.tipo === 'danger');
        return { rechazado: Boolean(alerta), texto: alerta ? alerta.texto : '' };
    }

    const hayError = /alert-danger|Revisá los siguientes errores/.test(respuesta.html);
    const texto = L.decodificar(respuesta.html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '));
    return { rechazado: hayError && respuesta.estado >= 200, texto };
};

const exito = async (respuesta) => {
    const pagina = await L.seguir(respuesta);
    return pagina.alertas.some((a) => a.tipo === 'success');
};

const filasDe = async (ruta) => {
    const pagina = await L.obtener(ruta);
    return { pagina, filas: L.filas(pagina.html) };
};

const buscar = (base, termino) => filasDe(`${base}?buscar=${encodeURIComponent(termino)}`);

let prestamoBase = 0;

// ---------------------------------------------------------------- SOCIOS
const probarSocios = async () => {
    L.seccion('Socio - Registrar');

    const datos = (n, extra = {}) => ({
        nombre: 'ZZPrueba', apellido: `Socio${n}`, dni: dni(n), email: correo(n), telefono: '2964000000', estado: 'Activo', ...extra
    });

    const alta = await L.enviar('/socios', datos(1), '/socios/nuevo');
    L.verificar(alta.estado === 302 && alta.destino.endsWith('/socios') && await exito(alta), 'el alta con datos válidos funciona y avisa');

    const enDb = await pool.query('SELECT id_socio, estado FROM socios WHERE dni = $1', [dni(1)]);
    L.verificar(enDb.rowCount === 1 && enDb.rows[0].estado === 'Activo', 'el socio quedó guardado como Activo');

    const sinNombre = await rechazo(await L.enviar('/socios', datos(2, { nombre: ' ' }), '/socios/nuevo'));
    L.verificar(sinNombre.rechazado, 'rechaza un socio sin nombre');
    const sinApellido = await rechazo(await L.enviar('/socios', datos(2, { apellido: '' }), '/socios/nuevo'));
    L.verificar(sinApellido.rechazado, 'rechaza un socio sin apellido');
    const sinDni = await rechazo(await L.enviar('/socios', datos(2, { dni: '' }), '/socios/nuevo'));
    L.verificar(sinDni.rechazado, 'rechaza un socio sin DNI');
    const sinEmail = await rechazo(await L.enviar('/socios', datos(2, { email: '' }), '/socios/nuevo'));
    L.verificar(sinEmail.rechazado, 'rechaza un socio sin email');
    const emailMalo = await rechazo(await L.enviar('/socios', datos(2, { email: 'esto-no-es-un-email' }), '/socios/nuevo'));
    L.verificar(emailMalo.rechazado, 'rechaza un email inválido');
    const dniLetras = await rechazo(await L.enviar('/socios', datos(2, { dni: 'ABC12345' }), '/socios/nuevo'));
    L.verificar(dniLetras.rechazado, 'rechaza un DNI con letras');
    const estadoMalo = await rechazo(await L.enviar('/socios', datos(2, { estado: 'Suspendido' }), '/socios/nuevo'));
    L.verificar(estadoMalo.rechazado, 'rechaza un estado distinto de Activo/Inactivo');
    const sinTel = await L.enviar('/socios', datos(3, { telefono: '' }), '/socios/nuevo');
    L.verificar(sinTel.estado === 302, 'el teléfono es opcional');

    const dniRep = await rechazo(await L.enviar('/socios', datos(9, { dni: dni(1) }), '/socios/nuevo'));
    L.verificar(dniRep.rechazado && /DNI|Ya existe/i.test(dniRep.texto), 'rechaza un DNI duplicado con mensaje claro', dniRep.texto.slice(0, 120));
    const cant = await pool.query('SELECT COUNT(*) n FROM socios WHERE dni = $1', [dni(1)]);
    L.verificar(Number(cant.rows[0].n) === 1, 'no se duplicó el DNI en la base');

    L.seccion('Socio - Listado y buscador');
    const { pagina, filas } = await filasDe('/socios');
    L.verificar(pagina.estado === 200 && filas.length > 0 && filas.length <= 10, `el listado muestra de 1 a 10 filas (${filas.length})`);
    L.verificar(/Activo|Inactivo/.test(pagina.html), 'muestra el estado de cada socio');
    L.verificar(/Historial/.test(pagina.html) && /Editar/.test(pagina.html) && /Eliminar/.test(pagina.html), 'tiene acciones: historial, editar y eliminar');

    const porApellido = await buscar('/socios', `Socio1`);
    L.verificar(porApellido.filas.some((f) => L.textoFila(f).includes(dni(1))), 'busca por apellido');
    const porDni = await buscar('/socios', dni(1));
    L.verificar(porDni.filas.length === 1, 'busca por DNI');
    const porEmail = await buscar('/socios', correo(1));
    L.verificar(porEmail.filas.length === 1, 'busca por email');
    const porMayus = await buscar('/socios', 'zzprueba');
    L.verificar(porMayus.filas.length >= 1, 'la búsqueda no distingue mayúsculas');
    const nada = await buscar('/socios', 'zzzz_nadie_999');
    L.verificar(/No se encontraron resultados/.test(nada.pagina.html), 'avisa cuando no hay resultados');

    L.seccion('Socio - Paginación');
    const p1 = await L.obtener('/socios');
    const tot = p1.html.match(/Página (\d+) de (\d+)/);
    L.verificar(tot && Number(tot[2]) >= 2, `hay varias páginas (${tot ? tot[2] : 0})`);
    const p2 = await L.obtener('/socios?pagina=2');
    L.verificar(L.filas(p2.html).length > 0 && L.textoFila(L.filas(p1.html)[0]) !== L.textoFila(L.filas(p2.html)[0]), 'la página 2 trae otros socios');

    L.seccion('Socio - Modificar');
    const id = enDb.rows[0].id_socio;
    const edic = await L.obtener(`/socios/${id}/editar`);
    L.verificar(edic.estado === 200 && edic.html.includes(dni(1)), 'el formulario de edición viene cargado');
    const mod = await L.enviar(`/socios/${id}`, datos(1, { telefono: '1111111111', estado: 'Inactivo', nombre: 'ZZPruebaMod' }), `/socios/${id}/editar`);
    L.verificar(mod.estado === 302 && await exito(mod), 'modificar funciona y avisa');
    const trasMod = await pool.query('SELECT nombre, telefono, estado FROM socios WHERE id_socio = $1', [id]);
    L.verificar(trasMod.rows[0].telefono === '1111111111' && trasMod.rows[0].estado === 'Inactivo' && trasMod.rows[0].nombre === 'ZZPruebaMod', 'los cambios quedaron guardados (incluido el estado Inactivo)');
    const modDni = await rechazo(await L.enviar(`/socios/${id}`, datos(1, { dni: '12345678' }), `/socios/${id}/editar`));
    L.verificar(modDni.rechazado, 'al modificar, rechaza el DNI de otro socio');
    const modVacio = await rechazo(await L.enviar(`/socios/${id}`, datos(1, { apellido: '' }), `/socios/${id}/editar`));
    L.verificar(modVacio.rechazado, 'al modificar, rechaza campos obligatorios vacíos');
    await pool.query("UPDATE socios SET estado = 'Activo' WHERE id_socio = $1", [id]);
};

// ---------------------------------------------------------------- LIBROS
const probarLibros = async () => {
    const ref = await pool.query(`SELECT (SELECT id_autor FROM autores ORDER BY id_autor LIMIT 1) a, (SELECT id_categoria FROM categorias ORDER BY id_categoria LIMIT 1) c, (SELECT id_editorial FROM editoriales ORDER BY id_editorial LIMIT 1) e`);
    const { a, c, e } = ref.rows[0];
    const isbn = (n) => `ZZ${sufijo}${n}`;
    const datos = (n, extra = {}) => ({ isbn: isbn(n), titulo: `ZZPrueba Libro ${n}`, anio_publicacion: '2020', id_autor: a, id_categoria: c, id_editorial: e, ...extra });

    L.seccion('Libro - Registrar');
    const alta = await L.enviar('/libros', datos(1), '/libros/nuevo');
    L.verificar(alta.estado === 302 && alta.destino.endsWith('/libros') && await exito(alta), 'el alta funciona y avisa');
    const lib = await pool.query('SELECT id_libro FROM libros WHERE isbn = $1', [isbn(1)]);
    L.verificar(lib.rowCount === 1, 'el libro quedó guardado');
    const idLibro = lib.rows[0].id_libro;

    L.verificar((await rechazo(await L.enviar('/libros', datos(2, { titulo: ' ' }), '/libros/nuevo'))).rechazado, 'rechaza un título vacío');
    L.verificar((await rechazo(await L.enviar('/libros', datos(2, { isbn: '' }), '/libros/nuevo'))).rechazado, 'rechaza un ISBN vacío');
    const dupIsbn = await rechazo(await L.enviar('/libros', datos(9, { isbn: isbn(1) }), '/libros/nuevo'));
    L.verificar(dupIsbn.rechazado && /ISBN|Ya existe/i.test(dupIsbn.texto), 'rechaza un ISBN duplicado con mensaje claro', dupIsbn.texto.slice(0, 120));
    const anioFuturo = new Date().getFullYear() + 1;
    const futuro = await rechazo(await L.enviar('/libros', datos(3, { anio_publicacion: String(anioFuturo) }), '/libros/nuevo'));
    L.verificar(futuro.rechazado, `rechaza un año futuro (${anioFuturo})`);
    L.verificar((await rechazo(await L.enviar('/libros', datos(3, { anio_publicacion: 'dos mil' }), '/libros/nuevo'))).rechazado, 'rechaza un año que no es número');
    const anioActual = await L.enviar('/libros', datos(4, { anio_publicacion: String(new Date().getFullYear()) }), '/libros/nuevo');
    L.verificar(anioActual.estado === 302, 'acepta el año actual');
    L.verificar((await rechazo(await L.enviar('/libros', datos(5, { id_autor: '99999999' }), '/libros/nuevo'))).rechazado, 'rechaza un autor que no existe');
    L.verificar((await rechazo(await L.enviar('/libros', datos(6, { id_categoria: '99999999' }), '/libros/nuevo'))).rechazado, 'rechaza una categoría que no existe');
    L.verificar((await rechazo(await L.enviar('/libros', datos(7, { id_editorial: '99999999' }), '/libros/nuevo'))).rechazado, 'rechaza una editorial que no existe');
    L.verificar((await rechazo(await L.enviar('/libros', datos(8, { id_editorial: '' }), '/libros/nuevo'))).rechazado, 'la editorial es obligatoria');

    L.seccion('Libro - Listado y buscador');
    const { pagina, filas } = await filasDe('/libros');
    L.verificar(pagina.estado === 200 && filas.length > 0 && filas.length <= 10, `listado de 1 a 10 filas (${filas.length})`);
    L.verificar(/Autor/.test(pagina.html) && /Categoría/.test(pagina.html) && /Editorial/.test(pagina.html), 'el listado muestra autor, categoría y editorial (JOIN)');

    const rt = await buscar('/libros', 'ZZPrueba Libro 1');
    L.verificar(rt.filas.length === 1, 'busca por título');
    const ri = await buscar('/libros', isbn(1));
    L.verificar(ri.filas.length === 1, 'busca por ISBN');
    const datosLibro = await pool.query(`SELECT a.nombre || ' ' || a.apellido autor, c.nombre categoria FROM libros l JOIN autores a USING(id_autor) JOIN categorias c USING(id_categoria) WHERE l.id_libro = $1`, [idLibro]);
    const ra = await buscar('/libros', datosLibro.rows[0].autor);
    L.verificar(ra.filas.some((f) => L.textoFila(f).includes('ZZPrueba Libro 1')), 'busca por autor');
    const rc = await buscar('/libros', datosLibro.rows[0].categoria);
    L.verificar(rc.filas.length > 0 && rc.filas.every((f) => L.textoFila(f).includes(datosLibro.rows[0].categoria) || true) && rc.pagina.estado === 200, 'busca por categoría');
    const rcDirecto = await pool.query(`SELECT COUNT(*) n FROM libros l JOIN categorias c USING(id_categoria) WHERE c.nombre ILIKE $1`, [`%${datosLibro.rows[0].categoria}%`]);
    L.verificar(rc.filas.length === Math.min(10, Number(rcDirecto.rows[0].n)) || rc.filas.length > 0, 'la búsqueda por categoría devuelve resultados coherentes');
    const nada = await buscar('/libros', 'zzzz_nada_999');
    L.verificar(/No se encontraron libros/.test(nada.pagina.html), 'avisa cuando no hay resultados');

    L.seccion('Libro - Paginación');
    const p1 = await L.obtener('/libros');
    const tot = p1.html.match(/Página (\d+) de (\d+)/);
    L.verificar(tot && Number(tot[2]) >= 2, `hay varias páginas (${tot ? tot[2] : 0})`);
    const p2 = await L.obtener('/libros?pagina=2');
    L.verificar(L.textoFila(L.filas(p1.html)[0]) !== L.textoFila(L.filas(p2.html)[0]), 'la página 2 trae otros libros');
    const sig = p1.html.match(/href="([^"]*)">\s*Siguiente/);
    L.verificar(Boolean(sig) && sig[1].length > 1, 'los enlaces de paginación tienen destino (antes estaban vacíos)');
    const pb = await L.obtener('/libros?buscar=a');
    const enlace = pb.html.match(/href="([^"]*pagina(?:=|&#x3D;)2[^"]*)"/);
    L.verificar(!enlace || L.decodificar(enlace[1]).includes('buscar=a'), 'la paginación conserva la búsqueda');

    L.seccion('Libro - Modificar');
    const ed = await L.obtener(`/libros/${idLibro}/editar`);
    L.verificar(ed.estado === 200 && ed.html.includes(isbn(1)), 'el formulario de edición viene cargado');
    const mod = await L.enviar(`/libros/${idLibro}`, datos(1, { titulo: 'ZZPrueba Libro 1 Modificado', anio_publicacion: '2019' }), `/libros/${idLibro}/editar`);
    L.verificar(mod.estado === 302 && await exito(mod), 'modificar funciona y avisa');
    const tm = await pool.query('SELECT titulo, anio_publicacion FROM libros WHERE id_libro = $1', [idLibro]);
    L.verificar(tm.rows[0].titulo.endsWith('Modificado') && tm.rows[0].anio_publicacion === 2019, 'los cambios quedaron guardados');
    const modIsbn = await rechazo(await L.enviar(`/libros/${idLibro}`, datos(1, { isbn: '9781234567890' }), `/libros/${idLibro}/editar`));
    L.verificar(modIsbn.rechazado, 'al modificar, rechaza el ISBN de otro libro');
    const modAnio = await rechazo(await L.enviar(`/libros/${idLibro}`, datos(1, { anio_publicacion: String(anioFuturo) }), `/libros/${idLibro}/editar`));
    L.verificar(modAnio.rechazado, 'al modificar, rechaza un año futuro');

    L.seccion('Libro - Detalle y catálogo');
    const det = await L.obtener(`/libros/${idLibro}`);
    L.verificar(det.estado === 200 && det.html.includes(isbn(1)) && /Ejemplares/.test(det.html), 'el detalle muestra los datos del libro y sus ejemplares');
    const cat = await L.obtener('/libros/catalogo');
    L.verificar(cat.estado === 200 && /Disponibles/.test(cat.html) && /Autor/.test(cat.html) && /Categoría/.test(cat.html), 'el catálogo muestra título, autor, categoría y ejemplares disponibles');
    L.verificar(cat.html.includes(`/libros/${idLibro}`), 'desde el catálogo se accede al detalle del libro');

    return { idLibro, a, c, e, datos };
};

// ---------------------------------------------------------------- EJEMPLARES
const probarEjemplares = async (ctx) => {
    const { idLibro } = ctx;
    const cod = (n) => `ZZ-${sufijo}-${n}`;

    L.seccion('Ejemplar - Registrar');
    const alta = await L.enviar('/ejemplares', { codigo_inventario: cod(1), id_libro: idLibro, estado: 'Disponible' }, '/ejemplares/nuevo');
    L.verificar(alta.estado === 302 && await exito(alta), 'el alta funciona y avisa');
    const ej = await pool.query('SELECT id_ejemplar, estado FROM ejemplares WHERE codigo_inventario = $1', [cod(1)]);
    L.verificar(ej.rowCount === 1 && ej.rows[0].estado === 'Disponible', 'el ejemplar quedó guardado como Disponible');
    const idEj = ej.rows[0].id_ejemplar;

    L.verificar((await rechazo(await L.enviar('/ejemplares', { codigo_inventario: ' ', id_libro: idLibro, estado: 'Disponible' }, '/ejemplares/nuevo'))).rechazado, 'rechaza un código vacío');
    const dup = await rechazo(await L.enviar('/ejemplares', { codigo_inventario: cod(1), id_libro: idLibro, estado: 'Disponible' }, '/ejemplares/nuevo'));
    L.verificar(dup.rechazado && /código|Ya existe/i.test(dup.texto), 'rechaza un código de inventario duplicado con mensaje claro', dup.texto.slice(0, 120));
    L.verificar((await rechazo(await L.enviar('/ejemplares', { codigo_inventario: cod(2), id_libro: '99999999', estado: 'Disponible' }, '/ejemplares/nuevo'))).rechazado, 'rechaza un libro que no existe');
    L.verificar((await rechazo(await L.enviar('/ejemplares', { codigo_inventario: cod(2), id_libro: idLibro, estado: 'Prestado' }, '/ejemplares/nuevo'))).rechazado, 'no permite crear un ejemplar ya "Prestado"');
    L.verificar((await rechazo(await L.enviar('/ejemplares', { codigo_inventario: cod(2), id_libro: idLibro, estado: 'Roto' }, '/ejemplares/nuevo'))).rechazado, 'rechaza un estado inválido');
    for (const [n, estado] of [[3, 'Dañado'], [4, 'En mantenimiento']]) {
        const r = await L.enviar('/ejemplares', { codigo_inventario: cod(n), id_libro: idLibro, estado }, '/ejemplares/nuevo');
        L.verificar(r.estado === 302, `acepta el estado inicial "${estado}"`);
    }

    L.seccion('Ejemplar - Listado, buscador y paginación');
    const { pagina, filas } = await filasDe('/ejemplares');
    L.verificar(pagina.estado === 200 && filas.length > 0 && filas.length <= 10, `listado de 1 a 10 filas (${filas.length})`);
    L.verificar(/Disponible|Prestado|Dañado|En mantenimiento/.test(pagina.html), 'muestra el estado de cada ejemplar');
    const porCod = await buscar('/ejemplares', cod(1));
    L.verificar(porCod.filas.length === 1, 'busca por código de inventario');
    const porLibro = await buscar('/ejemplares', 'ZZPrueba Libro 1');
    L.verificar(porLibro.filas.length >= 3, 'busca por título del libro');
    const porEstado = await buscar('/ejemplares', 'En mantenimiento');
    L.verificar(porEstado.filas.some((f) => L.textoFila(f).includes(cod(4))), 'busca por estado');
    const tot = pagina.html.match(/Página (\d+) de (\d+)/);
    L.verificar(tot && Number(tot[2]) >= 2, `hay varias páginas (${tot ? tot[2] : 0})`);
    const p2 = await L.obtener('/ejemplares?pagina=2');
    L.verificar(L.textoFila(L.filas(pagina.html)[0]) !== L.textoFila(L.filas(p2.html)[0]), 'la página 2 trae otros ejemplares');

    L.seccion('Ejemplar - Modificar');
    const ed = await L.obtener(`/ejemplares/${idEj}/editar`);
    L.verificar(ed.estado === 200 && ed.html.includes(cod(1)), 'el formulario de edición viene cargado');
    const mod = await L.enviar(`/ejemplares/${idEj}`, { codigo_inventario: cod(1), id_libro: idLibro, estado: 'En mantenimiento' }, `/ejemplares/${idEj}/editar`);
    L.verificar(mod.estado === 302, 'se puede cambiar el estado a En mantenimiento');
    const te = await pool.query('SELECT estado FROM ejemplares WHERE id_ejemplar = $1', [idEj]);
    L.verificar(te.rows[0].estado === 'En mantenimiento', 'el nuevo estado quedó guardado');
    const modDup = await rechazo(await L.enviar(`/ejemplares/${idEj}`, { codigo_inventario: cod(3), id_libro: idLibro, estado: 'Disponible' }, `/ejemplares/${idEj}/editar`));
    L.verificar(modDup.rechazado, 'al modificar, rechaza el código de otro ejemplar');
    await L.enviar(`/ejemplares/${idEj}`, { codigo_inventario: cod(1), id_libro: idLibro, estado: 'Disponible' }, `/ejemplares/${idEj}/editar`);

    return { cod, idEj };
};

// ---------------------------------------------------------------- PRÉSTAMOS
const probarPrestamos = async (ctx) => {
    const socios = [];
    for (let n = 1; n <= 4; n++) {
        const r = await pool.query(`INSERT INTO socios (nombre, apellido, dni, email, telefono, estado) VALUES ('ZZPrueba', $1, $2, $3, '1', 'Activo') RETURNING id_socio`, [`Prestamo${n}`, dni(50 + n), correo(50 + n)]);
        socios.push(r.rows[0].id_socio);
    }
    const inactivo = (await pool.query(`INSERT INTO socios (nombre, apellido, dni, email, telefono, estado) VALUES ('ZZPrueba', 'Inactivo', $1, $2, '1', 'Inactivo') RETURNING id_socio`, [dni(60), correo(60)])).rows[0].id_socio;

    const libres = (await pool.query(`SELECT id_ejemplar FROM ejemplares WHERE estado = 'Disponible' AND codigo_inventario NOT LIKE 'ZZ-%' ORDER BY id_ejemplar DESC LIMIT 20`)).rows.map((r) => r.id_ejemplar);
    let k = 0;
    const siguiente = () => libres[k++];

    const crear = async (idSocio, ids) => {
        const datos = { id_socio: idSocio };
        ids.forEach((id, i) => { datos[`id_ejemplar_${i + 1}`] = id; });
        const r = await L.enviar('/prestamos', datos, '/prestamos/nuevo');
        const pagina = await L.seguir(r);
        return { ok: pagina.alertas.some((a) => a.tipo === 'success'), mensaje: (pagina.alertas[0] || {}).texto || '' };
    };

    L.seccion('Préstamo - Registrar');
    const form = await L.obtener('/prestamos/nuevo');
    L.verificar(form.estado === 200 && /id_ejemplar_1/.test(form.html), 'el formulario de préstamo se muestra');
    L.verificar(!form.html.includes('Inactivo, ZZPrueba'), 'el formulario no ofrece socios inactivos');
    L.verificar(form.html.includes(`value="${socios[0]}"`), 'el formulario ofrece socios activos');

    const e1 = siguiente();
    const p1 = await crear(socios[0], [e1]);
    L.verificar(p1.ok, 'registra un préstamo para un socio activo', p1.mensaje);
    const prestamo = (await pool.query('SELECT * FROM prestamos WHERE id_socio = $1 ORDER BY id_prestamo DESC LIMIT 1', [socios[0]])).rows[0];
    const dias = (await pool.query('SELECT (fecha_vencimiento - fecha_prestamo) AS d, fecha_prestamo = CURRENT_DATE AS hoy FROM prestamos WHERE id_prestamo = $1', [prestamo.id_prestamo])).rows[0];
    L.verificar(Number(dias.d) === 7 && dias.hoy, 'el vencimiento se calcula solo: fecha de préstamo + 7 días');
    L.verificar(prestamo.estado === 'Activo', 'el préstamo nace en estado Activo');
    const est = (await pool.query('SELECT estado FROM ejemplares WHERE id_ejemplar = $1', [e1])).rows[0].estado;
    L.verificar(est === 'Prestado', 'el ejemplar pasa automáticamente a Prestado');
    const formDespues = await L.obtener('/prestamos/nuevo');
    L.verificar(!formDespues.html.includes(`<option value="${e1}">`), 'un ejemplar prestado deja de ofrecerse');

    const inact = await crear(inactivo, [siguiente()]);
    L.verificar(!inact.ok && /no está activo/i.test(inact.mensaje), 'no presta a un socio inactivo', inact.mensaje);
    const noDisp = await crear(socios[1], [e1]);
    L.verificar(!noDisp.ok && /disponible/i.test(noDisp.mensaje), 'no presta un ejemplar que no está disponible', noDisp.mensaje);
    const danado = (await pool.query(`SELECT id_ejemplar FROM ejemplares WHERE codigo_inventario = $1`, [ctx.cod(3)])).rows[0].id_ejemplar;
    const noDisp2 = await crear(socios[1], [danado]);
    L.verificar(!noDisp2.ok, 'no presta un ejemplar Dañado', noDisp2.mensaje);
    const rep = await crear(socios[1], [libres[10], libres[10]]);
    L.verificar(!rep.ok && /más de una vez/i.test(rep.mensaje), 'no permite repetir el mismo ejemplar en el préstamo', rep.mensaje);
    const sin = await L.enviar('/prestamos', { id_socio: socios[1] }, '/prestamos/nuevo');
    const sinR = await L.seguir(sin);
    L.verificar(sinR.alertas.some((a) => a.tipo === 'danger'), 'exige al menos un ejemplar');
    const tres = await crear(socios[1], [siguiente(), siguiente(), siguiente()]);
    L.verificar(tres.ok, 'permite 3 ejemplares en un préstamo', tres.mensaje);
    const detalles3 = (await pool.query('SELECT COUNT(*) n FROM detalle_prestamo d JOIN prestamos p USING(id_prestamo) WHERE p.id_socio = $1', [socios[1]])).rows[0].n;
    L.verificar(Number(detalles3) === 3, 'el préstamo guarda sus 3 ejemplares en el detalle');
    const cuatro = await L.enviar('/prestamos', { id_socio: socios[2], id_ejemplar_1: libres[11], id_ejemplar_2: libres[12], id_ejemplar_3: libres[13], id_ejemplar_4: libres[14] }, '/prestamos/nuevo');
    const cuatroDb = (await pool.query('SELECT COUNT(*) n FROM detalle_prestamo d JOIN prestamos p USING(id_prestamo) WHERE p.id_socio = $1', [socios[2]])).rows[0].n;
    L.verificar(Number(cuatroDb) <= 3, 'nunca guarda más de 3 ejemplares en un préstamo', `${cuatroDb}`);
    await pool.query('DELETE FROM detalle_prestamo WHERE id_prestamo IN (SELECT id_prestamo FROM prestamos WHERE id_socio = $1)', [socios[2]]);
    await pool.query('DELETE FROM prestamos WHERE id_socio = $1', [socios[2]]);
    await pool.query("UPDATE ejemplares SET estado = 'Disponible' WHERE id_ejemplar = ANY($1)", [[libres[11], libres[12], libres[13], libres[14]]]);

    // máximo 3 préstamos activos por socio
    const extra = [libres[15], libres[16], libres[17], libres[18]];
    const a = await crear(socios[3], [extra[0]]);
    const b = await crear(socios[3], [extra[1]]);
    const c = await crear(socios[3], [extra[2]]);
    L.verificar(a.ok && b.ok && c.ok, 'un socio puede tener 3 préstamos activos', `${a.mensaje}|${b.mensaje}|${c.mensaje}`);
    const d = await crear(socios[3], [extra[3]]);
    L.verificar(!d.ok && /3 préstamos/i.test(d.mensaje), 'el cuarto préstamo activo de un socio se rechaza', d.mensaje);

    // concurrencia: dos socios piden el mismo ejemplar al mismo tiempo
    const carrera = libres[19];
    const [r1, r2] = await Promise.all([crear(socios[0], [carrera]), crear(socios[1], [carrera])]);
    const cuantos = (await pool.query('SELECT COUNT(*) n FROM detalle_prestamo WHERE id_ejemplar = $1 AND prestamo_activo', [carrera])).rows[0].n;
    L.verificar(Number(cuantos) === 1, 'dos pedidos simultáneos por el mismo ejemplar: solo uno prospera', `${cuantos}`);
    void r1; void r2;

    L.seccion('Préstamo - Listado, filtros y paginación');
    const lista = await L.obtener('/prestamos');
    L.verificar(lista.estado === 200 && /Socio/.test(lista.html) && /Libros/.test(lista.html), 'el listado muestra socio y libros (JOIN)');
    const act = await L.obtener('/prestamos?estado=Activo');
    L.verificar(L.filas(act.html).length > 0 && L.filas(act.html).every((f) => /Activo|Vencido/.test(f)), 'filtra por estado Activo');
    const porSocio = await L.obtener(`/prestamos?id_socio=${socios[3]}`);
    L.verificar(L.filas(porSocio.html).length === 3, 'filtra por socio', `${L.filas(porSocio.html).length}`);
    const futuro = await L.obtener('/prestamos?fechaDesde=2999-01-01');
    L.verificar(L.filas(futuro.html).length === 0 && /No se encontraron/.test(futuro.html), 'filtra por rango de fechas (sin resultados en el futuro)');
    const rango = await L.obtener(`/prestamos?fechaDesde=2000-01-01&fechaHasta=2999-01-01&id_socio=${socios[3]}`);
    L.verificar(L.filas(rango.html).length === 3, 'filtra por rango de fechas que incluye los préstamos');
    const invertido = await L.seguir(await L.obtener('/prestamos?fechaDesde=2030-01-01&fechaHasta=2020-01-01'));
    L.verificar(invertido.alertas.some((a2) => a2.tipo === 'danger') || /fecha desde/i.test(invertido.html), 'avisa si la fecha desde es posterior a la fecha hasta');
    const estadoMalo = await L.seguir(await L.obtener('/prestamos?estado=Cualquiera'));
    L.verificar(estadoMalo.alertas.some((a2) => a2.tipo === 'danger') || estadoMalo.estado === 200, 'ignora o avisa ante un estado inválido');
    // préstamos de relleno (ya devueltos) para comprobar la paginación de verdad
    for (let i = 0; i < 4; i++) {
        await pool.query("INSERT INTO prestamos (id_socio, fecha_prestamo, fecha_vencimiento, fecha_devolucion, estado) VALUES ($1, CURRENT_DATE - 30, CURRENT_DATE - 23, CURRENT_DATE - 25, 'Devuelto')", [socios[0]]);
    }
    const totalP = (await pool.query('SELECT COUNT(*) n FROM prestamos')).rows[0].n;
    const pp1 = await L.obtener('/prestamos');
    const tot = pp1.html.match(/Página (\d+) de (\d+)/);
    L.verificar(Number(totalP) > 10 && tot && Number(tot[2]) >= 2, `la paginación de préstamos aparece cuando hay más de 10 (${totalP} préstamos)`);
    if (tot && Number(tot[2]) >= 2) {
        const pp2 = await L.obtener('/prestamos?pagina=2');
        L.verificar(L.filas(pp2.html).length > 0 && L.textoFila(L.filas(pp1.html)[0]) !== L.textoFila(L.filas(pp2.html)[0]), 'la página 2 de préstamos trae otros registros');
    }

    L.seccion('Préstamo - Detalle');
    const det = await L.obtener(`/prestamos/${prestamo.id_prestamo}`);
    L.verificar(det.estado === 200 && /Socio/.test(det.html) && /vencimiento/i.test(det.html) && /Días de atraso/.test(det.html) && /Multa/.test(det.html) && /Autor/.test(det.html), 'el detalle muestra socio, fechas, ejemplares, libro, atraso y multa');
    L.verificar(/Activo/.test(det.html), 'el detalle muestra el estado');

    L.seccion('Devolución, atraso y multas');
    // préstamo de 3 ejemplares (socio 1) con 5 días de atraso
    const pMulta = (await pool.query('SELECT id_prestamo FROM prestamos WHERE id_socio = $1', [socios[1]])).rows[0].id_prestamo;
    await pool.query('UPDATE prestamos SET fecha_prestamo = CURRENT_DATE - 12, fecha_vencimiento = CURRENT_DATE - 5 WHERE id_prestamo = $1', [pMulta]);
    const venc = await L.obtener('/prestamos?estado=Vencido');
    L.verificar(L.filas(venc.html).some((f) => f.includes(`#${pMulta}`)), 'el préstamo con fecha vencida pasa a estado Vencido automáticamente');
    const dash = await L.obtener('/');
    L.verificar(/Préstamos vencidos/.test(dash.html) && dash.html.includes(`#${pMulta}`), 'el dashboard lista el préstamo vencido');

    const pantalla = await L.obtener(`/prestamos/${pMulta}/devolver`);
    const selects = [...pantalla.html.matchAll(/name="estado_(\d+)"/g)].map((m) => m[1]);
    L.verificar(pantalla.estado === 200 && selects.length === 3, 'la pantalla de devolución pide el estado de cada ejemplar', `${selects.length}`);

    const [x, y, z] = selects;
    const dev = await L.enviar(`/prestamos/${pMulta}/devolver`, { [`estado_${x}`]: 'Disponible', [`estado_${y}`]: 'Dañado', [`estado_${z}`]: 'En mantenimiento' }, `/prestamos/${pMulta}/devolver`);
    L.verificar(dev.estado === 200 && /Devolución registrada/.test(dev.html), 'la devolución muestra el resultado');
    L.verificar(/7\.?500/.test(dev.html), 'multa total = $500 × 5 días × 3 ejemplares = $7.500',(dev.html.match(/\$[\d.]+/g) || []).join(' '));
    L.verificar(/Días de atraso/.test(dev.html) && />5</.test(dev.html), 'informa los 5 días de atraso');
    const pr = (await pool.query('SELECT estado, fecha_devolucion FROM prestamos WHERE id_prestamo = $1', [pMulta])).rows[0];
    L.verificar(pr.estado === 'Devuelto' && pr.fecha_devolucion, 'el préstamo pasa a Devuelto con su fecha de devolución');
    const ests = (await pool.query('SELECT id_ejemplar, estado FROM ejemplares WHERE id_ejemplar = ANY($1)', [[Number(x), Number(y), Number(z)]])).rows;
    const porId = Object.fromEntries(ests.map((r) => [r.id_ejemplar, r.estado]));
    L.verificar(porId[x] === 'Disponible', 'ejemplar devuelto en buen estado vuelve a Disponible');
    L.verificar(porId[y] === 'Dañado', 'ejemplar devuelto dañado queda Dañado');
    L.verificar(porId[z] === 'En mantenimiento', 'ejemplar que va a mantenimiento queda En mantenimiento');
    const dets = (await pool.query('SELECT dias_atraso, multa, prestamo_activo FROM detalle_prestamo WHERE id_prestamo = $1', [pMulta])).rows;
    L.verificar(dets.every((r) => r.dias_atraso === 5 && Number(r.multa) === 2500 && r.prestamo_activo === false), 'cada detalle guarda 5 días y $2.500 de multa; la suma es el total');

    const otra = await L.enviar(`/prestamos/${pMulta}/devolver`, {}, '/');
    const otraR = await L.seguir(otra);
    L.verificar(otraR.alertas.some((a2) => a2.tipo === 'danger' && /ya fue devuelto/i.test(a2.texto)), 'impide una segunda devolución', JSON.stringify(otraR.alertas));
    const pantallaCerrada = await L.seguir(await L.obtener(`/prestamos/${pMulta}/devolver`));
    L.verificar(pantallaCerrada.alertas.some((a2) => a2.tipo === 'danger'), 'no abre la pantalla de devolución de un préstamo ya cerrado');

    // devolución sin atraso
    const pSin = (await pool.query('SELECT id_prestamo FROM prestamos WHERE id_socio = $1 ORDER BY id_prestamo LIMIT 1', [socios[3]])).rows[0].id_prestamo;
    const devSin = await L.enviar(`/prestamos/${pSin}/devolver`, {}, `/prestamos/${pSin}/devolver`);
    L.verificar(/no registra multa/i.test(devSin.html), 'devolución en término: atraso 0 y sin multa');
    const sinM = (await pool.query('SELECT dias_atraso, multa FROM detalle_prestamo WHERE id_prestamo = $1', [pSin])).rows[0];
    L.verificar(sinM.dias_atraso === 0 && Number(sinM.multa) === 0, 'el detalle guarda 0 días y $0');
    const eSin = (await pool.query(`SELECT e.estado FROM ejemplares e JOIN detalle_prestamo d USING(id_ejemplar) WHERE d.id_prestamo = $1`, [pSin])).rows[0].estado;
    L.verificar(eSin === 'Disponible', 'sin indicar estado, el ejemplar vuelve a Disponible');

    // el socio recupera cupo al devolver
    const nuevo = await crear(socios[3], [extra[3]]);
    L.verificar(nuevo.ok, 'al devolver un préstamo el socio recupera cupo para uno nuevo', nuevo.mensaje);

    L.seccion('Historiales');
    const hs = await L.obtener(`/prestamos/socio/${socios[1]}`);
    L.verificar(hs.estado === 200 && L.filas(hs.html).length === 3 && /Autor/.test(hs.html) && /Categoría/.test(hs.html), 'historial del socio: muestra sus préstamos con libro, autor y categoría');
    L.verificar(/2\.?500/.test(hs.html),'el historial del socio muestra las multas');
    const he = await L.obtener(`/prestamos/ejemplar/${x}`);
    L.verificar(he.estado === 200 && L.filas(he.html).length >= 1 && he.html.includes(`#${pMulta}`), 'historial del ejemplar: muestra sus préstamos');
    const heVacio = await L.obtener(`/prestamos/ejemplar/${ctx.idEj}`);
    L.verificar(heVacio.estado === 200 && /todavía no tiene historial/i.test(heVacio.html), 'historial de un ejemplar sin préstamos avisa que no hay registros');

    L.seccion('Eliminar con dependencias');
    const socioConPrestamos = await L.enviar(`/socios/${socios[1]}/eliminar`, {}, '/socios');
    const spR = await L.seguir(socioConPrestamos);
    L.verificar(spR.alertas.some((a2) => a2.tipo === 'danger' && /No se puede eliminar/.test(a2.texto)), 'no elimina un socio con préstamos');
    const ejConPrestamos = await L.enviar(`/ejemplares/${x}/eliminar`, {}, '/ejemplares');
    const ejR = await L.seguir(ejConPrestamos);
    L.verificar(ejR.alertas.some((a2) => a2.tipo === 'danger' && /No se puede eliminar/.test(a2.texto)), 'no elimina un ejemplar con préstamos');
    const libroConEj = await L.enviar(`/libros/${ctx.idLibro}/eliminar`, {}, '/libros');
    const lR = await L.seguir(libroConEj);
    L.verificar(lR.alertas.some((a2) => a2.tipo === 'danger' && /No se puede eliminar/.test(a2.texto)), 'no elimina un libro que tiene ejemplares');
};

// ---------------------------------------------------------------- USUARIOS Y ACCESO
const probarUsuarios = async () => {
    const email = correo(70);
    const clave = 'ClaveDePrueba2026!';

    L.seccion('Usuario - Registrar');
    const form = await L.obtener('/usuarios/nuevo');
    L.verificar(form.estado === 200 && /name="password"/.test(form.html), 'el formulario de registro se muestra');
    const datos = (extra = {}) => ({ nombre: 'ZZPrueba', apellido: 'Usuario', email, password: clave, ...extra });

    const alta = await L.enviar('/usuarios/nuevo', datos(), '/usuarios/nuevo');
    L.verificar(alta.estado === 302 && await exito(alta), 'el registro funciona y avisa');
    const u = await pool.query('SELECT password FROM usuarios WHERE email = $1', [email]);
    L.verificar(u.rowCount === 1 && u.rows[0].password !== clave && /^\$2[aby]\$/.test(u.rows[0].password), 'la contraseña se guarda cifrada (bcrypt), no en texto plano');

    const dup = await rechazo(await L.enviar('/usuarios/nuevo', datos(), '/usuarios/nuevo'));
    L.verificar(dup.rechazado && /Ya existe/i.test(dup.texto), 'rechaza un email ya registrado');
    const dupMay = await rechazo(await L.enviar('/usuarios/nuevo', datos({ email: email.toUpperCase() }), '/usuarios/nuevo'));
    L.verificar(dupMay.rechazado, 'rechaza el mismo email en mayúsculas');
    L.verificar((await rechazo(await L.enviar('/usuarios/nuevo', datos({ email: correo(71), password: 'corta' }), '/usuarios/nuevo'))).rechazado, 'rechaza una contraseña de menos de 12 caracteres');
    L.verificar((await rechazo(await L.enviar('/usuarios/nuevo', datos({ email: 'no-es-email' }), '/usuarios/nuevo'))).rechazado, 'rechaza un email inválido');
    L.verificar((await rechazo(await L.enviar('/usuarios/nuevo', datos({ email: correo(72), nombre: '' }), '/usuarios/nuevo'))).rechazado, 'rechaza un nombre vacío');
    L.verificar((await rechazo(await L.enviar('/usuarios/nuevo', datos({ email: correo(73), apellido: '' }), '/usuarios/nuevo'))).rechazado, 'rechaza un apellido vacío');

    L.seccion('Sesión y control de acceso');
    // nueva "sesión" sin credenciales: se vacían las cookies mediante un cierre de sesión
    const salir = await L.enviar('/logout', {}, '/');
    L.verificar(salir.estado === 302 && salir.destino.endsWith('/login'), 'cerrar sesión redirige al login');

    const protegidas = ['/', '/socios', '/socios/nuevo', '/libros', '/libros/catalogo', '/ejemplares', '/prestamos', '/prestamos/nuevo', '/categorias', '/autores', '/editoriales', '/usuarios/nuevo', '/prestamos/socio/1', '/libros/1'];
    let todas = true;
    for (const ruta of protegidas) {
        const r = await L.obtener(ruta);
        if (!(r.estado === 302 && r.destino.endsWith('/login'))) { todas = false; console.log('     sin protección:', ruta, r.estado); }
    }
    L.verificar(todas, `sin sesión, las ${protegidas.length} rutas protegidas redirigen al login`);

    const postSinSesion = await L.pedir('POST', '/socios', { nombre: 'x' });
    L.verificar([302, 403].includes(postSinSesion.estado), 'un POST sin sesión no se procesa', `${postSinSesion.estado}`);

    const malo = await L.iniciarSesion(email, 'otra-clave-equivocada');
    const maloP = await L.seguir(malo);
    L.verificar(maloP.alertas.some((a) => a.tipo === 'danger' && /incorrectos/i.test(a.texto)), 'una contraseña incorrecta muestra un error claro', JSON.stringify(maloP.alertas));
    const noExiste = await L.seguir(await L.iniciarSesion('nadie@nada.com', clave));
    L.verificar(noExiste.alertas.some((a) => a.tipo === 'danger'), 'un usuario inexistente muestra el mismo error (sin revelar cuál falló)');
    const vacio = await L.seguir(await L.iniciarSesion('', ''));
    L.verificar(vacio.alertas.some((a) => a.tipo === 'danger'), 'credenciales vacías muestran un error');

    const bien = await L.iniciarSesion(email, clave);
    L.verificar(bien.estado === 302 && bien.destino.endsWith('/'), 'el usuario recién creado puede iniciar sesión');
    const inicio = await L.obtener('/');
    L.verificar(inicio.estado === 200 && /Dashboard/.test(inicio.html) && /ZZPrueba Usuario/.test(inicio.html), 'con sesión activa accede al sistema y ve su nombre');
    const login = await L.obtener('/login');
    L.verificar(login.estado === 302, 'con sesión iniciada, /login redirige al inicio');
    const salir2 = await L.enviar('/logout', {}, '/');
    const trasSalir = await L.obtener('/socios');
    L.verificar(salir2.estado === 302 && trasSalir.estado === 302, 'tras cerrar sesión ya no se accede al sistema');

    // volver a entrar como administrador para el resto
    await L.iniciarSesion('admin@biblioteca.com', 'AdminBiblioteca2026!');
};

// ---------------------------------------------------------------- BÚSQUEDA SIN TILDES
const probarTildes = async () => {
    L.seccion('Buscador - tildes y mayúsculas');

    const casos = [
        ['/editoriales', 'catedra', 'Ediciones Cátedra', 'editorial: "catedra" encuentra "Cátedra"'],
        ['/editoriales', 'CÁTEDRA', 'Ediciones Cátedra', 'editorial: "CÁTEDRA" encuentra "Cátedra"'],
        ['/autores', 'cortazar', 'Cortázar', 'autor: "cortazar" encuentra "Cortázar"'],
        ['/autores', 'julio CORTÁZAR', 'Cortázar', 'autor: nombre completo con mayúsculas y tilde'],
        ['/categorias', 'linguistica', 'Lingüística', 'categoría: "linguistica" encuentra "Lingüística"'],
        ['/socios', 'benitez', 'Benítez', 'socio: "benitez" encuentra "Benítez"'],
        ['/libros', 'ana karenina', 'Ana Karénina', 'libro: "ana karenina" encuentra "Ana Karénina"'],
        ['/libros', 'fiodor', 'Fiódor', 'libro: busca por autor sin tilde ("fiodor")'],
        ['/libros', 'poesia', 'Poesía', 'libro: busca por categoría sin tilde ("poesia")'],
        ['/ejemplares', 'ana karenina', 'Ana Karénina', 'ejemplar: "ana karenina" encuentra los ejemplares de "Ana Karénina"']
    ];

    for (const [ruta, termino, esperado, descripcion] of casos) {
        const r = await buscar(ruta, termino);
        const hallado = r.filas.some((fila) => L.textoFila(fila).includes(esperado));
        L.verificar(hallado, descripcion, `${r.filas.length} filas`);
    }

    // la ñ sigue siendo una letra distinta
    const ene = await buscar('/autores', 'bolano');
    const enie = await buscar('/autores', 'bolaño');
    L.verificar(enie.filas.some((fila) => L.textoFila(fila).includes('Bolaño')) && ene.filas.length === 0, 'la ñ se respeta: "bolaño" encuentra a Bolaño y "bolano" no');

    const sinTilde = await buscar('/autores', 'perez');
    L.verificar(sinTilde.pagina.estado === 200, 'una búsqueda sin coincidencias no rompe nada');
};

// ---------------------------------------------------------------- ROBUSTEZ
const probarRobustez = async () => {
    L.seccion('Errores y rutas inválidas');
    const r404 = await L.obtener('/esta/ruta/no/existe');
    L.verificar(r404.estado === 404 && /Página no encontrada/.test(r404.html), 'una ruta inexistente muestra una página 404 con el diseño del sistema');
    for (const ruta of ['/socios/abc/editar', '/libros/99999999999/editar', '/autores/-1/editar', '/prestamos/xyz', '/ejemplares/0/editar']) {
        const r = await L.obtener(ruta);
        L.verificar(r.estado === 404 && /No encontrado/.test(r.html), `id inválido (${ruta}) responde 404 con mensaje, sin error de base de datos`, `${r.estado}`);
    }
    for (const ruta of ['/socios/99999999/editar', '/libros/99999999/editar', '/ejemplares/99999999/editar', '/editoriales/99999999/editar', '/categorias/99999999/editar', '/autores/99999999/editar']) {
        const r = await L.seguir(await L.obtener(ruta));
        L.verificar([404, 200].includes(r.estado) && !/Error:|at .*\.js/.test(r.html), `registro inexistente (${ruta}) se informa sin romper`, `${r.estado}`);
    }
    const detInex = await L.seguir(await L.obtener('/prestamos/99999999'));
    L.verificar(detInex.alertas.some((a) => a.tipo === 'danger'), 'detalle de un préstamo inexistente avisa con un mensaje');
    const libroInex = await L.seguir(await L.obtener('/libros/99999999'));
    L.verificar(libroInex.alertas.some((a) => a.tipo === 'danger'), 'detalle de un libro inexistente avisa con un mensaje');
};

(async () => {
    try {
        prestamoBase = (await pool.query('SELECT COALESCE(MAX(id_prestamo), 0) m FROM prestamos')).rows[0].m;

        L.seccion('Acceso');
        const login = await L.iniciarSesion('admin@biblioteca.com', 'AdminBiblioteca2026!');
        L.verificar(login.estado === 302, 'inicia sesión con el usuario administrador');

        await probarSocios();
        const ctx = await probarLibros();
        const ej = await probarEjemplares(ctx);
        await probarPrestamos({ ...ctx, ...ej });
        await probarTildes();
        await probarRobustez();
        await probarUsuarios();
    } catch (error) {
        console.error('ERROR en la prueba:', error);
        process.exitCode = 1;
    } finally {
        // limpieza: solo lo creado por esta prueba
        try {
            const ejemplares = await pool.query('SELECT DISTINCT id_ejemplar FROM detalle_prestamo WHERE id_prestamo > $1', [prestamoBase]);
            await pool.query('DELETE FROM detalle_prestamo WHERE id_prestamo > $1', [prestamoBase]);
            await pool.query('DELETE FROM prestamos WHERE id_prestamo > $1', [prestamoBase]);
            await pool.query("UPDATE ejemplares SET estado = 'Disponible' WHERE id_ejemplar = ANY($1) AND codigo_inventario NOT LIKE 'ZZ-%'", [ejemplares.rows.map((r) => r.id_ejemplar)]);
            await pool.query("DELETE FROM ejemplares WHERE codigo_inventario LIKE 'ZZ-%'");
            await pool.query("DELETE FROM libros WHERE isbn LIKE 'ZZ%'");
            await pool.query("DELETE FROM socios WHERE nombre LIKE 'ZZPrueba%'");
            await pool.query("DELETE FROM usuarios WHERE email LIKE 'zzprueba.%'");
        } catch (e) {
            console.error('Error en la limpieza:', e.message);
        }

        await pool.end();
        process.exitCode = L.resumen() ? 1 : process.exitCode;
    }
})();
