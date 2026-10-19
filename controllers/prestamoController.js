const prestamoModel = require('../models/prestamoModel');
const { validationResult } = require('express-validator');
const { construirListaPaginas } = require('../utils/paginacion');

const mostrarFormulario = async (req, res) => {
    try {
        await prestamoModel.actualizarVencidos();

        const socios = await prestamoModel.obtenerSociosActivos();

        const ejemplares = await prestamoModel.obtenerEjemplaresDisponibles();

        res.render('prestamos/nuevo', {
            socios,
            ejemplares
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

        const {
            id_socio,
            id_ejemplar_1,
            id_ejemplar_2,
            id_ejemplar_3
        } = req.body;

        const ejemplares = [
            id_ejemplar_1,
            id_ejemplar_2,
            id_ejemplar_3
        ].filter(id => id);

        if (ejemplares.length > 3) {

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
            ejemplares
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
            error.message
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

        let pagina = Number(req.query.pagina) || 1;

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
            !Number.isInteger(Number(id_socio))
        ) {

            req.flash(
                'error',
                'El socio seleccionado no es válido'
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

        if (
            totalPaginas > 0 &&
            pagina > totalPaginas
        ) {
            pagina = totalPaginas;
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

        res.render('prestamos/devolver', {
            prestamo,
            detalles
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
                estadosEjemplares
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
            error.message
        );

        res.redirect('/prestamos');
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

        const totalMulta =
            resultados.reduce(
                (total, detalle) => {
                    return total +
                        Number(detalle.multa || 0);
                },
                0
            );

        res.render(
            'prestamos/detalle',
            {
                prestamo: primerResultado,
                detalles: resultados,
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