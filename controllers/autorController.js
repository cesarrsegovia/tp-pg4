const { construirPaginacion, terminoDeBusqueda } = require('../utils/paginacion');
const autorModel = require('../models/autorModel');
const { validationResult } = require('express-validator');

const listar = async (req, res) => {

    try {

        const buscar = terminoDeBusqueda(req);

        const total = await autorModel.contar(buscar);

        const paginacion = construirPaginacion(req, total);

        const autores = await autorModel.obtenerPaginado(
            buscar,
            paginacion.porPagina,
            paginacion.offset
        );

        res.render('autores/lista', {
            autores,
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
    res.render('autores/nuevo');
};

const crear = async (req, res) => {

    const errores = validationResult(req);

    if (!errores.isEmpty()) {

        return res.status(400).render('autores/nuevo', {
            errores: errores.array(),
            datos: req.body
        });
    }

    try {

        const { nombre, apellido } = req.body;

        await autorModel.crear(nombre, apellido);

        req.flash(
            'success',
            'Autor creado correctamente'
        );

        res.redirect('/autores');

    } catch (error) {

        console.error(error);

        if (error.code === '23505') {

            req.flash(
                'error',
                'Ya existe un autor con ese nombre y apellido'
            );

            return res.redirect('/autores/nuevo');
        }

        req.flash(
            'error',
            'Error al crear el autor'
        );

        res.redirect('/autores/nuevo');
    }
};

const mostrarFormularioEdicion = async (req, res) => {

    try {

        const { id } = req.params;

        const autor = await autorModel.obtenerPorId(id);

        if (!autor) {
            return res.status(404).render('error', {
            titulo: 'No encontrado',
            mensaje: 'Autor no encontrado'
        });
        }

        res.render('autores/editar', {
            autor
        });

    } catch (error) {

        console.error(error);

        res.status(500).render('error', {
            titulo: 'Ocurrió un error',
            mensaje: 'Error al obtener el autor'
        });
    }
};

const actualizar = async (req, res) => {

    const errores = validationResult(req);

    if (!errores.isEmpty()) {

        return res.status(400).render('autores/editar', {
            errores: errores.array(),

            autor: {
                id_autor: req.params.id,
                nombre: req.body.nombre,
                apellido: req.body.apellido
            }
        });
    }

    try {

        const { id } = req.params;
        const { nombre, apellido } = req.body;

        const autor = await autorModel.actualizar(
            id,
            nombre,
            apellido
        );

        if (!autor) {

            req.flash(
                'error',
                'El autor no existe'
            );

            return res.redirect('/autores');
        }

        req.flash(
            'success',
            'Autor actualizado correctamente'
        );

        res.redirect('/autores');

    } catch (error) {

        console.error(error);

        if (error.code === '23505') {

            req.flash(
                'error',
                'Ya existe un autor con ese nombre y apellido'
            );

            return res.redirect(
                `/autores/${req.params.id}/editar`
            );
        }

        req.flash(
            'error',
            'Error al actualizar el autor'
        );

        res.redirect(
            `/autores/${req.params.id}/editar`
        );
    }
};

const eliminar = async (req, res) => {

    try {

        const { id } = req.params;

        const autor = await autorModel.eliminar(id);

        if (!autor) {

            req.flash(
                'error',
                'El autor no existe'
            );

            return res.redirect('/autores');
        }

        req.flash(
            'success',
            'Autor eliminado correctamente'
        );

        res.redirect('/autores');

    } catch (error) {

        console.error(error);

        if (error.code === '23503') {

            req.flash(
                'error',
                'No se puede eliminar el autor porque está siendo utilizado por uno o más libros'
            );

            return res.redirect('/autores');
        }

        req.flash(
            'error',
            'Error al eliminar el autor'
        );

        res.redirect('/autores');
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