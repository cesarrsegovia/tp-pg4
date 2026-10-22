const { construirPaginacion, terminoDeBusqueda } = require('../utils/paginacion');
const categoriaModel = require('../models/categoriaModel');
const { validationResult } = require('express-validator');

const listar = async (req, res) => {

    try {

        const buscar = terminoDeBusqueda(req);

        const total = await categoriaModel.contar(buscar);

        const paginacion = construirPaginacion(req, total);

        const categorias = await categoriaModel.obtenerPaginado(
            buscar,
            paginacion.porPagina,
            paginacion.offset
        );

        res.render('categorias/lista', {
            categorias,
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
    res.render('categorias/nueva');
};

const crear = async (req, res) => {

    const errores = validationResult(req);

    if (!errores.isEmpty()) {
        return res.status(400).render('categorias/nueva', {
            errores: errores.array(),
            datos: req.body
        });
    }

    try {
        const { nombre, descripcion } = req.body;

        await categoriaModel.crear(nombre, descripcion);

        req.flash(
            'success',
            'Categoría creada correctamente'
        );

        res.redirect('/categorias');

    } catch (error) {
        console.error(error);

        if (error.code === '23505') {
            req.flash(
                'error',
                'Ya existe una categoría con ese nombre'
            );

            return res.redirect('/categorias/nueva');
        }

        req.flash(
            'error',
            'Error al crear la categoría'
        );

        res.redirect('/categorias/nueva');
        }
};

const mostrarFormularioEdicion = async (req,res) =>{
    try{
        const { id } = req.params;

        const categoria = await categoriaModel.obtenerPorId(id);
        
        if(!categoria){
            return res.status(404).render('error', {
            titulo: 'No encontrado',
            mensaje: 'La categoría no existe'
        });
        }

        res.render('categorias/editar', {
            categoria
        });
    } catch(error){
        console.error(error);
        res.status(500).render('error', {
            titulo: 'Ocurrió un error',
            mensaje: 'Error al obtener la categoria'
        });
    }
};

const actualizar = async (req,res) => {
    const errores = validationResult(req);

    if(!errores.isEmpty()){
        return res.status(400).render('categorias/editar', {
            errores: errores.array(),
            categoria: {
                id_categoria: req.params.id,
                nombre: req.body.nombre,
                descripcion: req.body.descripcion
            }
        });
    }
    try {
        const { id } = req.params;
        const { nombre, descripcion } = req.body;

        const categoria = await categoriaModel.actualizar(
            id,
            nombre,
            descripcion
        );

        if (!categoria) {
            return res.status(404).render('error', {
            titulo: 'No encontrado',
            mensaje: 'Categoría no encontrada'
        });
        }

        req.flash(
            'success',
            'Categoría actualizada correctamente'
        );

        res.redirect('/categorias');

    } catch (error) {

        console.error(error);

        if (error.code === '23505') {
            req.flash(
                'error',
                'Ya existe una categoría con ese nombre'
            );

            return res.redirect(
                `/categorias/${req.params.id}/editar`
            );
        }

        req.flash(
            'error',
            'Error al actualizar la categoría'
        );

        res.redirect(
            `/categorias/${req.params.id}/editar`
        );
    }
}

const eliminar = async (req, res) => {

    try {
        const { id } = req.params;

        const categoria = await categoriaModel.eliminar(id);

        if (!categoria) {
            req.flash(
                'error',
                'La categoría no existe'
            );

            return res.redirect('/categorias');
        }

        req.flash(
            'success',
            'Categoría eliminada correctamente'
        );

        res.redirect('/categorias');

    } catch (error) {

        console.error(error);

        if (error.code === '23503') {
            req.flash(
                'error',
                'No se puede eliminar la categoría porque está siendo utilizada por uno o más libros'
            );

            return res.redirect('/categorias');
        }

        req.flash(
            'error',
            'Error al eliminar la categoría'
        );

        res.redirect('/categorias');
    }
};

module.exports = {
    listar,
    mostrarFormulario,
    crear,
    mostrarFormularioEdicion,
    actualizar,
    eliminar
}