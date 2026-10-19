// Prueba de aceptación de Editorial, Categoría y Autor:
// registrar, listado, buscador, paginación, modificar, eliminar y no duplicados.
require('../node_modules/dotenv').config({ quiet: true });

const pool = require('../config/database');
const L = require('./lib');

const catalogos = [
    {
        nombre: 'Editorial',
        base: '/editoriales',
        nuevo: '/editoriales/nueva',
        tabla: 'editoriales',
        pk: 'id_editorial',
        maximo: 150,
        campos: (n) => ({ nombre: n }),
        campoLargo: (largo) => ({ nombre: largo }),
        etiqueta: (n) => n
    },
    {
        nombre: 'Categoría',
        base: '/categorias',
        nuevo: '/categorias/nueva',
        tabla: 'categorias',
        pk: 'id_categoria',
        maximo: 100,
        campos: (n) => ({ nombre: n, descripcion: 'Descripción de prueba' }),
        campoLargo: (largo) => ({ nombre: largo }),
        etiqueta: (n) => n
    },
    {
        nombre: 'Autor',
        base: '/autores',
        nuevo: '/autores/nuevo',
        tabla: 'autores',
        pk: 'id_autor',
        maximo: 100,
        campos: (n) => ({ nombre: 'ZZTest', apellido: n }),
        campoLargo: (largo) => ({ nombre: 'ZZTest', apellido: largo }),
        etiqueta: (n) => `ZZTest ${n}`
    }
];

const contarEnLista = async (c, termino) => {
    const pagina = await L.obtener(`${c.base}?buscar=${encodeURIComponent(termino)}`);
    return { pagina, filas: L.filas(pagina.html) };
};

const idDeFila = (c, fila) => {
    const m = fila.match(new RegExp(`${c.base}/(\\d+)/editar`));
    return m ? Number(m[1]) : null;
};

const probar = async (c) => {
    const unico = `ZZPrueba${Date.now() % 100000}A`;
    const renombrado = `ZZPrueba${Date.now() % 100000}B`;
    const etiqueta = c.etiqueta(unico);

    // ---------------- Registrar ----------------
    L.seccion(`${c.nombre} - Registrar`);

    const formulario = await L.obtener(c.nuevo);
    L.verificar(formulario.estado === 200 && formulario.html.includes('name="nombre"'), 'el formulario de alta se muestra');

    const alta = await L.enviar(c.base, c.campos(unico), c.nuevo);
    const trasAlta = await L.seguir(alta);
    L.verificar(alta.estado === 302 && alta.destino.endsWith(c.base), 'el alta redirige al listado', `${alta.estado} ${alta.destino}`);
    L.verificar(trasAlta.alertas.some((a) => a.tipo === 'success'), 'muestra mensaje de éxito', JSON.stringify(trasAlta.alertas));

    const enDb = await pool.query(`SELECT ${c.pk} AS id FROM ${c.tabla} WHERE ${c.tabla === 'autores' ? "apellido" : 'nombre'} = $1`, [unico]);
    L.verificar(enDb.rowCount === 1, 'el registro quedó guardado en la base');
    const idNuevo = enDb.rows[0] && enDb.rows[0].id;

    // sin nombre / nombre vacío
    const vacio = await L.enviar(c.base, c.campos('   '), c.nuevo);
    L.verificar(vacio.estado === 200 && /Revisá los siguientes errores/.test(vacio.html), 'rechaza un nombre vacío con mensaje de error', `${vacio.estado}`);

    const largo = await L.enviar(c.base, c.campoLargo('x'.repeat(c.maximo + 1)), c.nuevo);
    L.verificar(largo.estado === 200 && /Revisá los siguientes errores/.test(largo.html), `rechaza un nombre de más de ${c.maximo} caracteres`, `${largo.estado}`);

    // ---------------- Listado ----------------
    L.seccion(`${c.nombre} - Listado`);

    const lista = await L.obtener(c.base);
    const filasLista = L.filas(lista.html);
    L.verificar(lista.estado === 200, 'el listado responde 200');
    L.verificar(filasLista.length > 0 && filasLista.length <= 10, `el listado muestra entre 1 y 10 filas (${filasLista.length})`);
    L.verificar(/<th[^>]*>Acciones<\/th>/.test(lista.html), 'tiene columna de acciones');
    L.verificar(lista.html.includes(`${c.nuevo}"`), 'tiene botón para registrar uno nuevo');

    const encontrado = await contarEnLista(c, etiqueta);
    L.verificar(encontrado.filas.length === 1 && L.textoFila(encontrado.filas[0]).includes(unico), 'el registro nuevo aparece en el listado');

    // ---------------- Buscador ----------------
    L.seccion(`${c.nombre} - Buscador`);

    const parcial = await contarEnLista(c, unico.toLowerCase().slice(0, 6));
    L.verificar(parcial.filas.some((f) => L.textoFila(f).includes(unico)), 'encuentra por texto parcial sin distinguir mayúsculas');

    const exacto = await contarEnLista(c, etiqueta);
    L.verificar(exacto.filas.length === 1, 'encuentra por texto exacto');

    const nada = await L.obtener(`${c.base}?buscar=${encodeURIComponent('zzzz_no_existe_999')}`);
    L.verificar(/No se encontraron resultados/.test(nada.html) && L.filas(nada.html).length === 0, 'avisa cuando no hay resultados');

    const comodin = await L.obtener(`${c.base}?buscar=${encodeURIComponent('%')}`);
    L.verificar(L.filas(comodin.html).length === 0 || !/Página 1 de [2-9]/.test(comodin.html), 'el signo % se busca literalmente (no devuelve todo)');

    const campoBusqueda = lista.html.match(/<input[^>]*name="buscar"[^>]*>/);
    L.verificar(Boolean(campoBusqueda), 'hay un campo de búsqueda en el listado');

    const conTermino = await L.obtener(`${c.base}?buscar=${encodeURIComponent(etiqueta)}`);
    L.verificar(conTermino.html.includes(`value="${etiqueta}"`) || conTermino.html.includes(`value="${etiqueta.replace(/ /g, ' ')}"`), 'el campo conserva el término buscado');
    L.verificar(/Limpiar/.test(conTermino.html), 'con búsqueda activa aparece el botón Limpiar');

    // ---------------- Paginación ----------------
    L.seccion(`${c.nombre} - Paginación`);

    const p1 = await L.obtener(c.base);
    const totales = p1.html.match(/Página (\d+) de (\d+)/);
    const totalPaginas = totales ? Number(totales[2]) : 0;
    L.verificar(totalPaginas >= 2, `hay más de una página (${totalPaginas})`);

    if (totalPaginas >= 2) {
        const numeros = [...p1.html.matchAll(/class="page-link" href="[^"]*pagina[^"]*">(\d+)<\/a>|class="page-item active"[^>]*>\s*<span class="page-link">(\d+)</g)];
        L.verificar(numeros.length >= Math.min(totalPaginas, 3), 'muestra los números de página', `${numeros.length}`);
        L.verificar(/page-item disabled">\s*<span class="page-link"><i class="bi bi-chevron-left"><\/i> Anterior/.test(p1.html), 'en la primera página "Anterior" está deshabilitado');

        const p2 = await L.obtener(`${c.base}?pagina=2`);
        const f1 = L.filas(p1.html).map(L.textoFila);
        const f2 = L.filas(p2.html).map(L.textoFila);
        L.verificar(f2.length > 0 && f1[0] !== f2[0], 'la página 2 muestra otros registros');
        L.verificar(f1.every((x) => !f2.includes(x)), 'no se repiten registros entre páginas');
        L.verificar(/Página 2 de/.test(p2.html), 'indica "Página 2"');

        const ultima = await L.obtener(`${c.base}?pagina=${totalPaginas}`);
        L.verificar(L.filas(ultima.html).length >= 1 && L.filas(ultima.html).length <= 10, 'la última página tiene entre 1 y 10 filas');
        L.verificar(/page-item disabled">\s*<span class="page-link">Siguiente/.test(ultima.html), 'en la última página "Siguiente" está deshabilitado');

        const fuera = await L.obtener(`${c.base}?pagina=9999`);
        L.verificar(fuera.estado === 200 && new RegExp(`Página ${totalPaginas} de ${totalPaginas}`).test(fuera.html), 'una página inexistente muestra la última');

        const negativa = await L.obtener(`${c.base}?pagina=-4`);
        L.verificar(negativa.estado === 200 && /Página 1 de/.test(negativa.html), 'una página negativa muestra la primera');

        const basura = await L.obtener(`${c.base}?pagina=abc`);
        L.verificar(basura.estado === 200 && /Página 1 de/.test(basura.html), 'una página no numérica muestra la primera');

        const sig = p1.html.match(/href="([^"]*)">\s*Siguiente/);
        L.verificar(Boolean(sig) && L.decodificar(sig[1]).includes('pagina=2'), 'el enlace "Siguiente" apunta a la página 2');

        // la paginación mantiene la búsqueda
        const busq = await L.obtener(`${c.base}?buscar=a`);
        const totBusq = busq.html.match(/Página (\d+) de (\d+)/);

        if (totBusq && Number(totBusq[2]) >= 2) {
            const enlace = busq.html.match(/href="([^"]*pagina(?:=|&#x3D;)2[^"]*)"/);
            L.verificar(Boolean(enlace) && L.decodificar(enlace[1]).includes('buscar=a'), 'la paginación conserva el término de búsqueda');
        }
    }

    // ---------------- Modificar ----------------
    L.seccion(`${c.nombre} - Modificar`);

    const edicion = await L.obtener(`${c.base}/${idNuevo}/editar`);
    L.verificar(edicion.estado === 200 && edicion.html.includes(unico), 'el formulario de edición viene cargado con los datos');

    const mod = await L.enviar(`${c.base}/${idNuevo}`, c.campos(renombrado), `${c.base}/${idNuevo}/editar`);
    const trasMod = await L.seguir(mod);
    L.verificar(mod.estado === 302, 'la modificación redirige', `${mod.estado}`);
    L.verificar(trasMod.alertas.some((a) => a.tipo === 'success'), 'muestra mensaje de éxito al modificar', JSON.stringify(trasMod.alertas));

    const viejo = await contarEnLista(c, c.etiqueta(unico));
    const nuevo = await contarEnLista(c, c.etiqueta(renombrado));
    L.verificar(viejo.filas.length === 0, 'el nombre anterior ya no aparece');
    L.verificar(nuevo.filas.length === 1, 'el nombre nuevo aparece en el listado');

    const modVacio = await L.enviar(`${c.base}/${idNuevo}`, c.campos(' '), `${c.base}/${idNuevo}/editar`);
    L.verificar(modVacio.estado === 200 && /Revisá los siguientes errores/.test(modVacio.html), 'al modificar rechaza un nombre vacío');

    const inexistente = await L.obtener(`${c.base}/99999999/editar`);
    L.verificar([404, 302].includes(inexistente.estado), 'editar un registro inexistente no rompe la aplicación', `${inexistente.estado}`);

    // ---------------- No duplicados ----------------
    L.seccion(`${c.nombre} - No duplicados`);

    const copia = await L.enviar(c.base, c.campos(renombrado), c.nuevo);
    const trasCopia = await L.seguir(copia);
    L.verificar(trasCopia.alertas.some((a) => a.tipo === 'danger' && /Ya existe/.test(a.texto)), 'rechaza un nombre idéntico con mensaje', JSON.stringify(trasCopia.alertas));

    const mayus = c.campos(renombrado.toUpperCase());
    if (c.tabla === 'autores') mayus.nombre = 'ZZTEST';
    const copiaMayus = await L.enviar(c.base, mayus, c.nuevo);
    const trasMayus = await L.seguir(copiaMayus);
    L.verificar(trasMayus.alertas.some((a) => a.tipo === 'danger' && /Ya existe/.test(a.texto)), 'rechaza el mismo nombre en MAYÚSCULAS', JSON.stringify(trasMayus.alertas));

    const espacios = c.campos(`  ${renombrado}  `);
    const copiaEspacios = await L.enviar(c.base, espacios, c.nuevo);
    const trasEspacios = await L.seguir(copiaEspacios);
    L.verificar(trasEspacios.alertas.some((a) => a.tipo === 'danger'), 'rechaza el mismo nombre con espacios alrededor', JSON.stringify(trasEspacios.alertas));

    const cuantos = await pool.query(`SELECT COUNT(*) AS n FROM ${c.tabla} WHERE lower(${c.tabla === 'autores' ? 'apellido' : 'nombre'}) = lower($1)`, [renombrado]);
    L.verificar(Number(cuantos.rows[0].n) === 1, 'en la base sigue habiendo un solo registro con ese nombre', `${cuantos.rows[0].n}`);

    // renombrar otro registro a un nombre ya existente
    const otro = await pool.query(`SELECT ${c.pk} AS id, ${c.tabla === 'autores' ? 'nombre, apellido' : 'nombre'} FROM ${c.tabla} WHERE ${c.pk} <> $1 ORDER BY ${c.pk} LIMIT 1`, [idNuevo]);
    const o = otro.rows[0];
    const camposOtro = c.tabla === 'autores' ? { nombre: o.nombre, apellido: o.apellido } : c.campos(o.nombre);
    if (c.tabla === 'categorias') camposOtro.descripcion = '';
    const choque = await L.enviar(`${c.base}/${idNuevo}`, camposOtro, `${c.base}/${idNuevo}/editar`);
    const trasChoque = await L.seguir(choque);
    L.verificar(trasChoque.alertas.some((a) => a.tipo === 'danger' && /Ya existe/.test(a.texto)), 'al modificar, rechaza un nombre que ya usa otro registro', JSON.stringify(trasChoque.alertas));

    // ---------------- Eliminar ----------------
    L.seccion(`${c.nombre} - Eliminar`);

    const enUso = await pool.query(`SELECT t.${c.pk} AS id FROM ${c.tabla} t WHERE EXISTS (SELECT 1 FROM libros l WHERE l.${c.pk} = t.${c.pk}) ORDER BY t.${c.pk} LIMIT 1`);

    if (enUso.rowCount) {
        const idUso = enUso.rows[0].id;
        const bloqueado = await L.enviar(`${c.base}/${idUso}/eliminar`, {}, c.base);
        const trasBloqueo = await L.seguir(bloqueado);
        const sigue = await pool.query(`SELECT 1 FROM ${c.tabla} WHERE ${c.pk} = $1`, [idUso]);
        L.verificar(trasBloqueo.alertas.some((a) => a.tipo === 'danger' && /No se puede eliminar/.test(a.texto)), 'no deja eliminar uno que tiene libros asociados (mensaje claro)', JSON.stringify(trasBloqueo.alertas));
        L.verificar(sigue.rowCount === 1, 'el registro asociado a libros sigue existiendo');
    } else {
        L.verificar(false, 'no hay un registro asociado a libros para probar la restricción');
    }

    const baja = await L.enviar(`${c.base}/${idNuevo}/eliminar`, {}, c.base);
    const trasBaja = await L.seguir(baja);
    const borrado = await pool.query(`SELECT 1 FROM ${c.tabla} WHERE ${c.pk} = $1`, [idNuevo]);
    L.verificar(trasBaja.alertas.some((a) => a.tipo === 'success'), 'eliminar uno sin dependencias muestra mensaje de éxito', JSON.stringify(trasBaja.alertas));
    L.verificar(borrado.rowCount === 0, 'el registro eliminado ya no está en la base');

    const otraVez = await L.enviar(`${c.base}/${idNuevo}/eliminar`, {}, c.base);
    const trasOtra = await L.seguir(otraVez);
    L.verificar(trasOtra.alertas.some((a) => a.tipo === 'danger'), 'eliminar uno que ya no existe avisa con un error', JSON.stringify(trasOtra.alertas));

    const confirmacion = lista.html.includes('data-confirmar=');
    L.verificar(confirmacion, 'el botón Eliminar pide confirmación antes de borrar');

    const sinToken = await L.pedir('POST', `${c.base}/${idNuevo}/eliminar`, {});
    L.verificar(sinToken.estado === 403, 'eliminar sin token CSRF es rechazado (403)', `${sinToken.estado}`);
};

(async () => {
    try {
        const login = await L.iniciarSesion('admin@biblioteca.com', 'AdminBiblioteca2026!');
        L.seccion('Acceso');
        L.verificar(login.estado === 302, 'inicia sesión con el usuario administrador', `${login.estado}`);

        for (const c of catalogos) {
            await probar(c);
        }
    } catch (error) {
        console.error('ERROR en la prueba:', error);
        process.exitCode = 1;
    } finally {
        // solo se borran los registros creados por esta prueba (prefijo exclusivo)
        await pool.query("DELETE FROM autores WHERE nombre = 'ZZTest' AND apellido LIKE 'ZZPrueba%'");
        await pool.query("DELETE FROM categorias WHERE nombre LIKE 'ZZPrueba%'");
        await pool.query("DELETE FROM editoriales WHERE nombre LIKE 'ZZPrueba%'");
        await pool.end();
        process.exitCode = L.resumen() ? 1 : process.exitCode;
    }
})();
