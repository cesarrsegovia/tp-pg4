const { construirPaginacion, terminoDeBusqueda } = require('../utils/paginacion');
const editorialModel =
    require('../models/editorialModel');

const { validationResult } =
    require('express-validator');

const listar = async (req, res) => {

    try {

        const buscar = terminoDeBusqueda(req);

        const total = await editorialModel.contar(buscar);

        const paginacion = construirPaginacion(req, total);

        const editoriales = await editorialModel.obtenerPaginado(
            buscar,
            paginacion.porPagina,
            paginacion.offset
        );

        res.render('editoriales/lista', {
            editoriales,
            buscar,
            ...paginacion
        });

    } catch (error) {

        console.error(error);

        req.flash('error', 'No se pudo obtener el listado');

        res.redirect('/');
    }
};

const mostrarFormulario = (req, res) => {

    res.render('editoriales/nueva');
};

const crear = async (req, res) => {

    const errores = validationResult(req);

    if (!errores.isEmpty()) {

        return res.render('editoriales/nueva', {
            errores: errores.array(),
            datos: req.body
        });
    }

    try {

        const { nombre } = req.body;

        await editorialModel.crear(nombre);

        req.flash(
            'success',
            'Editorial creada correctamente'
        );

        res.redirect('/editoriales');

    } catch (error) {

        console.error(error);

        if (error.code === '23505') {

            req.flash(
                'error',
                'Ya existe una editorial con ese nombre'
            );

            return res.redirect('/editoriales/nueva');
        }

        req.flash(
            'error',
            'Error al crear la editorial'
        );

        res.redirect('/editoriales/nueva');
    }
};

const mostrarFormularioEdicion = async (req, res) => {

    try {

        const { id } = req.params;

        const editorial =
            await editorialModel.obtenerPorId(id);

        if (!editorial) {

            return res.status(404).render('error', {
            titulo: 'No encontrado',
            mensaje: 'Editorial no encontrada'
        });
        }

        res.render('editoriales/editar', {
            editorial
        });

    } catch (error) {

        console.error(error);

        res.status(500).render('error', {
            titulo: 'Ocurrió un error',
            mensaje: 'Error al obtener la editorial'
        });
    }
};

const actualizar = async (req, res) => {

    const errores = validationResult(req);

    if (!errores.isEmpty()) {

        return res.render('editoriales/editar', {

            errores: errores.array(),

            editorial: {
                id_editorial: req.params.id,
                nombre: req.body.nombre
            }
        });
    }

    try {

        const { id } = req.params;
        const { nombre } = req.body;

        const editorial =
            await editorialModel.actualizar(
                id,
                nombre
            );

        if (!editorial) {

            req.flash(
                'error',
                'La editorial no existe'
            );

            return res.redirect('/editoriales');
        }

        req.flash(
            'success',
            'Editorial actualizada correctamente'
        );

        res.redirect('/editoriales');

    } catch (error) {

        console.error(error);

        if (error.code === '23505') {

            req.flash(
                'error',
                'Ya existe una editorial con ese nombre'
            );

            return res.redirect(
                `/editoriales/${req.params.id}/editar`
            );
        }

        req.flash(
            'error',
            'Error al actualizar la editorial'
        );

        res.redirect(
            `/editoriales/${req.params.id}/editar`
        );
    }
};

const eliminar = async (req, res) => {

    try {

        const { id } = req.params;

        const editorial =
            await editorialModel.eliminar(id);

        if (!editorial) {

            req.flash(
                'error',
                'La editorial no existe'
            );

            return res.redirect('/editoriales');
        }

        req.flash(
            'success',
            'Editorial eliminada correctamente'
        );

        res.redirect('/editoriales');

    } catch (error) {

        console.error(error);

        if (error.code === '23503') {

            req.flash(
                'error',
                'No se puede eliminar la editorial porque está siendo utilizada por uno o más libros'
            );

            return res.redirect('/editoriales');
        }

        req.flash(
            'error',
            'Error al eliminar la editorial'
        );

        res.redirect('/editoriales');
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