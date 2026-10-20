const { construirPaginacion, terminoDeBusqueda } = require('../utils/paginacion');

const socioModel = require('../models/socioModel');
const { validationResult } = require('express-validator');

const estadosValidos = ['Activo', 'Inactivo'];

const MENSAJE_EMAIL_REPETIDO = 'Ya existe un socio con ese email';

// Mensaje según la restricción única que se violó (DNI o email).
const mensajeDuplicado = (error) =>
    /email/i.test(error.constraint || '')
        ? MENSAJE_EMAIL_REPETIDO
        : 'Ya existe un socio con ese DNI';

// Preparar las opciones de estado para los formularios.
const prepararEstados = (estadoActual) => [
    {
        valor: 'Activo',
        seleccionado: estadoActual === 'Activo'
    },
    {
        valor: 'Inactivo',
        seleccionado: estadoActual === 'Inactivo'
    }
];

// LISTAR SOCIOS

const listar = async (req, res) => {
    try {
        const buscar = terminoDeBusqueda(req);

        const total = await socioModel.contar(buscar);

        const paginacion = construirPaginacion(req, total);

        const socios = await socioModel.obtenerPaginado(
            buscar,
            paginacion.porPagina,
            paginacion.offset
        );

        const sociosConEstado = socios.map(socio => ({
            ...socio,
            esActivo: socio.estado === 'Activo'
        }));

        res.render('socios/lista', {
            socios: sociosConEstado,
            buscar,
            ...paginacion
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'No se pudo obtener el listado de socios');
        res.redirect('/');
    }
};


// MOSTRAR FORMULARIO DE ALTA
const mostrarFormulario = (req, res) => {
    res.render('socios/nuevo', {
        socio: { estado: 'Activo' },
        estados: prepararEstados('Activo')
    });
};

// CREAR SOCIO
const crear = async (req, res) => {
    const errores = validationResult(req);

    const socio = {
        nombre: req.body.nombre?.trim(),
        apellido: req.body.apellido?.trim(),
        dni: req.body.dni?.trim(),
        email: req.body.email?.trim().toLowerCase(),
        telefono: req.body.telefono?.trim() || '',
        estado: req.body.estado
    };

    if (!errores.isEmpty()) {
        return res.status(400).render('socios/nuevo', {
            errores: errores.array(),
            socio,
            estados: prepararEstados(socio.estado)
        });
    }

    try {
        if (await socioModel.existeEmail(socio.email)) {
            return res.status(400).render('socios/nuevo', {
                errores: [{ msg: MENSAJE_EMAIL_REPETIDO }],
                socio,
                estados: prepararEstados(socio.estado)
            });
        }

        await socioModel.crear(socio);

        req.flash('success', 'Socio creado correctamente');
        res.redirect('/socios');
    } catch (error) {
        console.error(error);

        if (error.code === '23505') {
            return res.status(400).render('socios/nuevo', {
                errores: [{
                    msg: mensajeDuplicado(error)
                }],
                socio,
                estados: prepararEstados(socio.estado)
            });
        }

        res.status(500).render('socios/nuevo', {
            errores: [{ msg: 'Error al crear el socio' }],
            socio,
            estados: prepararEstados(socio.estado)
        });
    }
};

// MOSTRAR FORMULARIO DE EDICIÓN
const mostrarFormularioEdicion = async (req, res) => {
    try {
        const socio = await socioModel.obtenerPorId(req.params.id);

        if (!socio) {
            return res.status(404).render('error', {
            titulo: 'No encontrado',
            mensaje: 'Socio no encontrado'
        });
        }

        res.render('socios/editar', {
            socio,
            estados: prepararEstados(socio.estado)
        });
    } catch (error) {
        console.error(error);
        res.status(500).render('error', {
            titulo: 'Ocurrió un error',
            mensaje: 'Error al cargar el socio'
        });
    }
};

// ACTUALIZAR SOCIO
const actualizar = async (req, res) => {
    const errores = validationResult(req);

    const socio = {
        nombre: req.body.nombre?.trim(),
        apellido: req.body.apellido?.trim(),
        dni: req.body.dni?.trim(),
        email: req.body.email?.trim().toLowerCase(),
        telefono: req.body.telefono?.trim() || '',
        estado: req.body.estado
    };

    if (!errores.isEmpty()) {
        return res.status(400).render('socios/editar', {
            errores: errores.array(),
            socio: {
                ...socio,
                id_socio: req.params.id
            },
            estados: prepararEstados(socio.estado)
        });
    }

    try {
        if (await socioModel.existeEmail(socio.email, Number(req.params.id))) {
            return res.status(400).render('socios/editar', {
                errores: [{ msg: MENSAJE_EMAIL_REPETIDO }],
                socio: {
                    ...socio,
                    id_socio: req.params.id
                },
                estados: prepararEstados(socio.estado)
            });
        }

        const actualizado = await socioModel.actualizar(
            req.params.id,
            socio
        );

        if (!actualizado) {
            return res.status(404).render('error', {
            titulo: 'No encontrado',
            mensaje: 'Socio no encontrado'
        });
        }

        req.flash('success', 'Socio actualizado correctamente');
        res.redirect('/socios');
    } catch (error) {
        console.error(error);

        if (error.code === '23505') {
            const socioActual = await socioModel.obtenerPorId(
                req.params.id
            );

            return res.status(400).render('socios/editar', {
                errores: [{
                    msg: mensajeDuplicado(error)
                }],
                socio: {
                    ...socio,
                    id_socio: req.params.id
                },
                estados: prepararEstados(socio.estado)
            });
        }

        if (error.code === '23503') {
            return res.status(400).render('error', {
            titulo: 'Solicitud no válida',
            mensaje: 'No se pudo actualizar el socio por una restricción de integridad'
        });
        }

        res.status(500).render('error', {
            titulo: 'Ocurrió un error',
            mensaje: 'Error al actualizar el socio'
        });
    }
};

// ELIMINAR SOCIO
const eliminar = async (req, res) => {
    try {
        const eliminado = await socioModel.eliminar(req.params.id);

        if (!eliminado) {
            req.flash('error', 'El socio no existe');
            return res.redirect('/socios');
        }

        req.flash('success', 'Socio eliminado correctamente');
        res.redirect('/socios');
    } catch (error) {
        console.error(error);

        if (error.code === '23503') {
            req.flash(
                'error',
                'No se puede eliminar el socio porque tiene préstamos asociados'
            );
            return res.redirect('/socios');
        }

        req.flash('error', 'Error al eliminar el socio');
        res.redirect('/socios');
    }
};

module.exports = {
    listar,
    mostrarFormulario,
    crear,
    mostrarFormularioEdicion,
    actualizar,
    eliminar
};
