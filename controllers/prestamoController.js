const prestamoModel = require('../models/prestamoModel');
const socioModel = require('../models/socioModel');
const ejemplarModel = require('../models/ejemplarModel');
const libroModel = require('../models/libroModel');
const { validationResult } = require('express-validator');
const { construirListaPaginas } = require('../utils/paginacion');
const { ErrorNegocio, esIdValido } = require('../utils/errores');
const { esFechaValida } = require('../utils/fechas');

// Los mensajes de negocio se muestran tal cual; cualquier otro error se registra
// en el servidor y el usuario ve un texto genérico (sin detalles de la base de datos).
const mensajeParaUsuario = (error, mensajeGenerico) =>
    error instanceof ErrorNegocio ? error.message : mensajeGenerico;

// Días entre el vencimiento y la fecha dada (AAAA-MM-DD); 0 si no hay atraso.
const diasDeAtraso = (vencimiento, fecha) => {
    const aMs = (texto) => {
        const [anio, mes, dia] = texto.split('-').map(Number);
        return Date.UTC(anio, mes - 1, dia);
    };

    return Math.max(0, Math.round((aMs(fecha) - aMs(vencimiento)) / 86400000));
};

// Un campo de fecha vacío significa "usar hoy" (null); cualquier otro valor se valida en el modelo.
const fechaOpcional = (valor) => (valor ? valor : null);

const mostrarFormulario = async (req, res) => {
    try {
        await prestamoModel.actualizarVencidos();

        const socios = await prestamoModel.obtenerSociosActivos();

        const ejemplares = await prestamoModel.obtenerEjemplaresDisponibles();

        res.render('prestamos/nuevo', {
            socios,
            ejemplares,
            hoy: await prestamoModel.obtenerFechaActual(),
            fechaMinima: prestamoModel.FECHA_MINIMA
        });
    } catch (error) {
        console.error(error);
        res.status(500).render('error', {
            titulo: 'Ocurrió un error',
            mensaje: 'Error al cargar el formulario de prestamo'
        });
    }
};

const crear = async (req, res) => {

    const errores = validationResult(req);

    if (!errores.isEmpty()) {

        req.flash(
            'error',
            errores.array()[0].msg
        );

        return res.redirect(
            '/prestamos/nuevo'
        );
    }

    try {

        const { id_socio } = req.body;

        // Se leen todos los campos id_ejemplar_N enviados (no solo los 3 del formulario),
        // así un envío armado a mano con un 4º ejemplar se rechaza en lugar de ignorarse.
        const ejemplares = Object.entries(req.body)
            .filter(([campo, valor]) =>
                /^id_ejemplar_\d+$/.test(campo) && valor !== ''
            )
            .map(([, valor]) => valor);

        if (ejemplares.length > prestamoModel.MAX_EJEMPLARES_POR_PRESTAMO) {

            req.flash(
                'error',
                'Un préstamo no puede tener más de 3 ejemplares'
            );

            return res.redirect(
                '/prestamos/nuevo'
            );
        }

        const ejemplaresUnicos =
            new Set(ejemplares);

        if (
            ejemplaresUnicos.size !==
            ejemplares.length
        ) {

            req.flash(
                'error',
                'No puede seleccionar el mismo ejemplar más de una vez'
            );

            return res.redirect(
                '/prestamos/nuevo'
            );
        }

        await prestamoModel.crearPrestamo(
            id_socio,
            ejemplares,
            fechaOpcional(req.body.fecha_prestamo)
        );

        req.flash(
            'success',
            'Préstamo creado correctamente'
        );

        res.redirect('/prestamos');

    } catch (error) {

        console.error(error);

        req.flash(
            'error',
            mensajeParaUsuario(error, 'No se pudo registrar el préstamo')
        );

        res.redirect(
            '/prestamos/nuevo'
        );
    }
};

const listar = async (req, res) => {

    try {

        await prestamoModel.actualizarVencidos();

        const {
            estado,
            id_socio,
            fechaDesde,
            fechaHasta
        } = req.query;

        // Solo números enteros positivos ("1.5" o "abc" se leen como página 1).
        let pagina = /^\d{1,9}$/.test(req.query.pagina || '')
            ? Number(req.query.pagina)
            : 1;

        if (pagina < 1) {
            pagina = 1;
        }

        const porPagina = 10;

        const estadosPermitidos = [
            'Activo',
            'Vencido',
            'Devuelto'
        ];

        if (
            estado &&
            !estadosPermitidos.includes(estado)
        ) {

            req.flash(
                'error',
                'El estado seleccionado no es válido'
            );

            return res.redirect('/prestamos');
        }

        if (
            id_socio &&
            !esIdValido(id_socio)
        ) {

            req.flash(
                'error',
                'El socio seleccionado no es válido'
            );

            return res.redirect('/prestamos');
        }

        if (fechaDesde && !esFechaValida(fechaDesde)) {

            req.flash(
                'error',
                'La fecha desde no es válida'
            );

            return res.redirect('/prestamos');
        }

        if (fechaHasta && !esFechaValida(fechaHasta)) {

            req.flash(
                'error',
                'La fecha hasta no es válida'
            );

            return res.redirect('/prestamos');
        }

        if (
            fechaDesde &&
            fechaHasta &&
            fechaDesde > fechaHasta
        ) {

            req.flash(
                'error',
                'La fecha desde no puede ser posterior a la fecha hasta'
            );

            return res.redirect('/prestamos');
        }

        const filtros = {
            estado,
            idSocio: id_socio,
            fechaDesde,
            fechaHasta
        };

        const total =
            await prestamoModel.contarConFiltros(filtros);

        const totalPaginas =
            Math.ceil(total / porPagina);

        if (pagina > totalPaginas) {
            pagina = Math.max(totalPaginas, 1);
        }

        const prestamos =
            await prestamoModel.obtenerConFiltros({
                ...filtros,
                pagina,
                porPagina
            });

        const socios =
            await prestamoModel.obtenerTodosLosSocios();

        const estados = [
            {
                valor: 'Activo',
                nombre: 'Activos',
                seleccionado: estado === 'Activo'
            },
            {
                valor: 'Vencido',
                nombre: 'Vencidos',
                seleccionado: estado === 'Vencido'
            },
            {
                valor: 'Devuelto',
                nombre: 'Devueltos',
                seleccionado: estado === 'Devuelto'
            }
        ];

        const sociosFiltro = socios.map(socio => ({
            ...socio,
            seleccionado:
                String(socio.id_socio) ===
                String(id_socio)
        }));

        const prestamosConAcciones =
            prestamos.map(prestamo => ({
                ...prestamo,
                puedeDevolver:
                    prestamo.estado === 'Activo' ||
                    prestamo.estado === 'Vencido'
            }));

        const puedeIrAnterior = pagina > 1;
        const puedeIrSiguiente =
            pagina < totalPaginas;

        const construirUrlPagina = (numeroPagina) => {

            const parametros = new URLSearchParams();

            if (estado) {
                parametros.set('estado', estado);
            }

            if (id_socio) {
                parametros.set('id_socio', id_socio);
            }

            if (fechaDesde) {
                parametros.set('fechaDesde', fechaDesde);
            }

            if (fechaHasta) {
                parametros.set('fechaHasta', fechaHasta);
            }

            parametros.set('pagina', numeroPagina);

            return `/prestamos?${parametros.toString()}`;
        };
        const urlPaginaAnterior =
            construirUrlPagina(pagina - 1);

        const urlPaginaSiguiente =
            construirUrlPagina(pagina + 1);

        const paginas = construirListaPaginas(
            pagina,
            totalPaginas,
            construirUrlPagina
        );

        res.render('prestamos/lista', {
            prestamos: prestamosConAcciones,
            estados,
            sociosFiltro,
            fechaDesde,
            fechaHasta,
            pagina,
            totalPaginas,
            puedeIrAnterior,
            puedeIrSiguiente,
            urlPaginaAnterior,
            urlPaginaSiguiente,
            paginas
        });

    } catch (error) {

        console.error(error);

        req.flash(
            'error',
            'No se pudieron obtener los préstamos'
        );

        res.redirect('/');
    }
};

const mostrarDevolucion = async (req, res) => {

    try {

        await prestamoModel.actualizarVencidos();

        const { id } = req.params;

        const prestamo = Number.isInteger(Number(id))
            ? await prestamoModel.obtenerPorId(id)
            : null;

        if (!prestamo) {

            req.flash('error', 'El préstamo no existe');

            return res.redirect('/prestamos');
        }

        if (prestamo.estado === 'Devuelto') {

            req.flash('error', 'El préstamo ya fue devuelto');

            return res.redirect('/prestamos');
        }

        const detalles =
            await prestamoModel.obtenerDetalles(id);

        const hoy = await prestamoModel.obtenerFechaActual();

        // Atraso y multa si se devolviera hoy (la pantalla los recalcula al cambiar la fecha).
        const diasAtrasoHoy = diasDeAtraso(prestamo.fecha_vencimiento_iso, hoy);
        const multaPorEjemplarHoy = diasAtrasoHoy * prestamoModel.MULTA_POR_DIA;

        res.render('prestamos/devolver', {
            prestamo,
            detalles,
            hoy,
            multaPorDia: prestamoModel.MULTA_POR_DIA,
            cantidadEjemplares: detalles.length,
            diasAtrasoHoy,
            multaPorEjemplarHoy,
            totalMultaHoy: multaPorEjemplarHoy * detalles.length
        });

    } catch (error) {

        console.error(error);

        req.flash(
            'error',
            'No se pudo cargar la devolución'
        );

        res.redirect('/prestamos');
    }
};

const devolver = async (req, res) => {

    try {

        const { id } = req.params;

        // Los selects del formulario se llaman estado_<id_ejemplar>
        const estadosEjemplares = {};

        for (const [campo, valor] of Object.entries(req.body)) {

            const coincidencia = campo.match(/^estado_(\d+)$/);

            if (coincidencia) {
                estadosEjemplares[coincidencia[1]] = valor;
            }
        }

        const resultado =
            await prestamoModel.devolverPrestamo(
                id,
                estadosEjemplares,
                fechaOpcional(req.body.fecha_devolucion)
            );

        res.render(
            'prestamos/devolucion',
            {
                resultado,
                id_prestamo: id
            }
        );

    } catch (error) {

        console.error(error);

        req.flash(
            'error',
            mensajeParaUsuario(error, 'No se pudo registrar la devolución')
        );

        // Un error de fecha devuelve al formulario para corregirla; el resto, al listado.
        res.redirect(
            error.reintentable
                ? `/prestamos/${req.params.id}/devolver`
                : '/prestamos'
        );
    }
};

const detalle = async (req, res) => {

    try {

        await prestamoModel.actualizarVencidos();

        const { id } = req.params;

        const resultados =
            await prestamoModel.obtenerDetalleCompleto(id);

        if (resultados.length === 0) {

            req.flash(
                'error',
                'El préstamo no existe'
            );

            return res.redirect('/prestamos');
        }

        const primerResultado =
            resultados[0];

        const devuelto = primerResultado.estado === 'Devuelto';
        const diasVencido = Number(primerResultado.dias_vencido);

        // Devuelto: valores definitivos guardados al devolver.
        // Abierto: atraso y multa acumulados al día de hoy (se confirman al devolver).
        const detallesFormateados = resultados.map(item => ({
            ...item,
            dias_atraso: devuelto ? item.dias_atraso : diasVencido,
            multa: devuelto
                ? item.multa
                : diasVencido * prestamoModel.MULTA_POR_DIA
        }));

        const totalMulta =
            detallesFormateados.reduce(
                (total, detalle) => total + Number(detalle.multa || 0),
                0
            );

        const avisoAtraso =
            !devuelto && diasVencido > 0
                ? `Préstamo vencido: lleva ${diasVencido} día${diasVencido === 1 ? '' : 's'} de atraso. ` +
                  `Si se devuelve hoy, la multa es $${totalMulta.toLocaleString('es-AR')} ` +
                  `($${prestamoModel.MULTA_POR_DIA} por día y por ejemplar). Se confirma al registrar la devolución.`
                : null;

        res.render(
            'prestamos/detalle',
            {
                prestamo: primerResultado,
                detalles: detallesFormateados,
                devuelto,
                avisoAtraso,
                totalMulta
            }
        );

    } catch (error) {

        console.error(error);

        req.flash(
            'error',
            'Error al obtener el detalle del préstamo'
        );

        res.redirect('/prestamos');
    }
};

const historialSocio = async (req, res) => {

    try {

        await prestamoModel.actualizarVencidos();

        const { id } = req.params;

        const socio = await socioModel.obtenerPorId(id);

        if (!socio) {
            return res.status(404).render('error', {
                titulo: 'No encontrado',
                mensaje: 'El socio no existe'
            });
        }

        const historial =
            await prestamoModel.obtenerHistorialSocio(id);

        const historialFormateado =
            historial.map(item => ({
                ...item,

                dias_atraso:
                    item.dias_atraso ?? '-',

                multa:
                    item.multa !== null
                        ? item.multa
                        : '-'
            }));

        res.render(
            'prestamos/historialSocio',
            {
                socio,
                historial: historialFormateado
            }
        );

    } catch (error) {

        console.error(error);

        req.flash(
            'error',
            'Error al obtener el historial del socio'
        );

        res.redirect('/prestamos');
    }
};

const historialEjemplar = async (req, res) => {

    try {

        await prestamoModel.actualizarVencidos();

        const { id } = req.params;

        const ejemplar = await ejemplarModel.obtenerPorId(id);

        if (!ejemplar) {
            return res.status(404).render('error', {
                titulo: 'No encontrado',
                mensaje: 'El ejemplar no existe'
            });
        }

        const libro = await libroModel.obtenerDetalle(ejemplar.id_libro);

        const historial =
            await prestamoModel.obtenerHistorialEjemplar(id);

        const historialFormateado =
            historial.map(item => ({
                ...item,

                dias_atraso:
                    item.dias_atraso ?? '-',

                multa:
                    item.multa !== null
                        ? item.multa
                        : '-'
            }));

        res.render(
            'prestamos/historialEjemplar',
            {
                ejemplar,
                libro,
                historial: historialFormateado
            }
        );

    } catch (error) {

        console.error(error);

        req.flash(
            'error',
            'Error al obtener el historial del ejemplar'
        );

        res.redirect('/ejemplares');
    }
};

const dashboard = async (req, res) => {

    try {

        await prestamoModel.actualizarVencidos();

        const resumen =
            await prestamoModel.obtenerResumen();

        const prestamosVencidos =
            await prestamoModel.obtenerPrestamosVencidos();

        res.render('home', {
            resumen,
            prestamosVencidos
        });

    } catch (error) {

        console.error(error);

        req.flash(
            'error',
            'No se pudo cargar el dashboard'
        );

        res.redirect('/prestamos');
    }
};

module.exports = {
    mostrarDevolucion,
    mostrarFormulario,
    crear,
    listar,
    devolver,
    detalle,
    historialSocio,
    historialEjemplar,
    dashboard
}