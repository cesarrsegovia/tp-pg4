const { construirPaginacion, terminoDeBusqueda } = require('../utils/paginacion');
const ejemplarModel =
    require('../models/ejemplarModel');

const {
    validationResult
} = require('express-validator');

const listar = async (req, res) => {

    try {

        const buscar = terminoDeBusqueda(req);

        const total = await ejemplarModel.contar(buscar);

        const paginacion = construirPaginacion(req, total);

        const ejemplares = await ejemplarModel.obtenerPaginado(
            buscar,
            paginacion.porPagina,
            paginacion.offset
        );

        res.render('ejemplares/lista', {
            ejemplares,
            buscar,
            ...paginacion
        });

    } catch (error) {

        console.error(error);

        req.flash('error', 'No se pudo obtener el listado');

        res.redirect('/');
    }
};

const mostrarFormulario = async (req, res) => {

    try {

        const libros =
            await ejemplarModel.obtenerLibros();

        res.render('ejemplares/nuevo', {
            libros
        });

    } catch (error) {

        console.error(error);

        res.status(500).render('error', {
            titulo: 'Ocurrió un error',
            mensaje: 'Error al cargar el formulario'
        });
    }
};

const crear = async (req, res) => {

    const errores = validationResult(req);

    if (!errores.isEmpty()) {

        try {

            const libros =
                await ejemplarModel.obtenerLibros();

            return res.render('ejemplares/nuevo', {
                errores: errores.array(),
                datos: req.body,
                libros
            });

        } catch (error) {

            console.error(error);

            return res.status(500).render('error', {
            titulo: 'Ocurrió un error',
            mensaje: 'Error al cargar el formulario'
        });
        }
    }

    try {

        const {
            codigo_inventario,
            id_libro,
            estado
        } = req.body;

        await ejemplarModel.crear(
            codigo_inventario,
            id_libro,
            estado
        );

        req.flash(
            'success',
            'Ejemplar creado correctamente'
        );

        res.redirect('/ejemplares');

    } catch (error) {

        console.error(error);

        if (error.code === '23505') {

            req.flash(
                'error',
                'Ya existe un ejemplar con ese código de inventario'
            );

            return res.redirect(
                '/ejemplares/nuevo'
            );
        }

        if (error.code === '23503') {

            req.flash(
                'error',
                'El libro seleccionado no existe'
            );

            return res.redirect(
                '/ejemplares/nuevo'
            );
        }

        req.flash(
            'error',
            'Error al crear el ejemplar'
        );

        res.redirect('/ejemplares/nuevo');
    }
};

const mostrarFormularioEdicion = async (req, res) => {

    try {

        const { id } = req.params;

        const ejemplar =
            await ejemplarModel.obtenerPorId(id);

        if (!ejemplar) {

            return res.status(404).render('error', {
            titulo: 'No encontrado',
            mensaje: 'Ejemplar no encontrado'
        });
        }

        const libros =
            await ejemplarModel.obtenerLibros();

        const librosConSeleccion =
            libros.map(libro => ({
                ...libro,
                seleccionado:
                    libro.id_libro === ejemplar.id_libro
            }));

        res.render('ejemplares/editar', {
            ejemplar,
            libros: librosConSeleccion,

            estadoPrestado: ejemplar.estado === 'Prestado'
        });

    } catch (error) {

        console.error(error);

        res.status(500).render('error', {
            titulo: 'Ocurrió un error',
            mensaje: 'Error al cargar el ejemplar'
        });
    }
};

const actualizar = async (req, res) => {

    const errores = validationResult(req);

    if (!errores.isEmpty()) {
        try {
            const { id } = req.params;

            const ejemplarActual =
                await ejemplarModel.obtenerPorId(id);

            if (!ejemplarActual) {
                return res.status(404).render('error', {
            titulo: 'No encontrado',
            mensaje: 'Ejemplar no encontrado'
        });
            }

            const libros = await ejemplarModel.obtenerLibros();

            const librosConSeleccion = libros.map(libro => ({
                ...libro,
                seleccionado:
                    Number(libro.id_libro) ===
                    Number(req.body.id_libro)
            }));

            return res.status(400).render(
                'ejemplares/editar',
                {
                    errores: errores.array(),

                    ejemplar: {
                        ...ejemplarActual,
                        codigo_inventario:
                            req.body.codigo_inventario,
                        id_libro: Number(req.body.id_libro)
                    },

                    libros: librosConSeleccion
                }
            );
        } catch (error) {
            console.error(error);

            return res.status(500).render('error', {
            titulo: 'Ocurrió un error',
            mensaje: 'Error al cargar el formulario'
        });
        }
    }

    // Camino exitoso: pasamos los 3 argumentos separados tal como los pide ejemplarModel
    try {
        const { id } = req.params;
        const { codigo_inventario, id_libro, estado } = req.body;

        const ejemplarActualizado = await ejemplarModel.actualizar(
            id,
            codigo_inventario,
            id_libro,
            estado
        );

        if (!ejemplarActualizado) {
            return res.status(404).render('error', {
            titulo: 'No encontrado',
            mensaje: 'Ejemplar no encontrado'
        });
        }

        req.flash('success', 'Ejemplar actualizado correctamente');
        return res.redirect('/ejemplares');

    } catch (error) {
        console.error(error);

        if (error.code === '23505') {
            req.flash('error', 'Ya existe un ejemplar con ese código de inventario');
            return res.redirect(`/ejemplares/${req.params.id}/editar`);
        }

        req.flash('error', 'Error al actualizar el ejemplar');
        return res.redirect(`/ejemplares/${req.params.id}/editar`);
    }
};

const eliminar = async (req, res) => {

    try {

        const { id } = req.params;

        const ejemplar =
            await ejemplarModel.eliminar(id);

        if (!ejemplar) {

            req.flash(
                'error',
                'El ejemplar no existe'
            );

            return res.redirect(
                '/ejemplares'
            );
        }

        req.flash(
            'success',
            'Ejemplar eliminado correctamente'
        );

        res.redirect('/ejemplares');

    } catch (error) {

        console.error(error);

        if (error.code === '23503') {

            req.flash(
                'error',
                'No se puede eliminar el ejemplar porque tiene préstamos asociados'
            );

            return res.redirect(
                '/ejemplares'
            );
        }

        req.flash(
            'error',
            'Error al eliminar el ejemplar'
        );

        res.redirect('/ejemplares');
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