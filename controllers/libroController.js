const { construirPaginacion, terminoDeBusqueda } = require('../utils/paginacion');
const libroModel = require('../models/libroModel');

const { validationResult } = require('express-validator');

const listar = async (req, res) => {

    try {

        const buscar = terminoDeBusqueda(req);

        const total = await libroModel.contarLibros(buscar);

        const paginacion = construirPaginacion(req, total);

        const libros = await libroModel.obtenerPaginado(
            buscar,
            paginacion.pagina,
            paginacion.porPagina
        );

        res.render('libros/lista', {
            libros,
            buscar,
            ...paginacion
        });

    } catch (error) {

        console.error(error);

        req.flash(
            'error',
            'No se pudieron obtener los libros'
        );

        res.redirect('/');
    }
};

const mostrarFormulario = async (req, res) => {

    try {

        const autores =
            await libroModel.obtenerAutores();

        const categorias =
            await libroModel.obtenerCategorias();

        const editoriales =
            await libroModel.obtenerEditoriales();

        res.render('libros/nuevo', {
            autores,
            categorias,
            editoriales
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

            const autores =
                await libroModel.obtenerAutores();

            const categorias =
                await libroModel.obtenerCategorias();

            const editoriales =
                await libroModel.obtenerEditoriales();

            return res.status(400).render('libros/nuevo', {
                errores: errores.array(),
                datos: req.body,
                autores,
                categorias,
                editoriales
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
            isbn,
            titulo,
            anio_publicacion,
            id_autor,
            id_categoria,
            id_editorial
        } = req.body;

        await libroModel.crear(
            isbn,
            titulo,
            anio_publicacion,
            id_autor,
            id_categoria,
            id_editorial
        );

        req.flash(
            'success',
            'Libro creado correctamente'
        );

        res.redirect('/libros');

    } catch (error) {

        console.error(error);

        if (error.code === '23505') {

            req.flash(
                'error',
                'Ya existe un libro con ese ISBN'
            );

            return res.redirect('/libros/nuevo');
        }

        if (error.code === '23503') {

            req.flash(
                'error',
                'Alguna de las relaciones seleccionadas no es válida'
            );

            return res.redirect('/libros/nuevo');
        }

        req.flash(
            'error',
            'Error al crear el libro'
        );

        res.redirect('/libros/nuevo');
    }
};

const actualizar = async (req, res) => {

    const errores = validationResult(req);

    if (!errores.isEmpty()) {

        try {

            const autores =
                await libroModel.obtenerAutores();

            const categorias =
                await libroModel.obtenerCategorias();

            const editoriales =
                await libroModel.obtenerEditoriales();

            return res.status(400).render('libros/editar', {
                errores: errores.array(),

                libro: {
                    id_libro: req.params.id,
                    isbn: req.body.isbn,
                    titulo: req.body.titulo,
                    anio_publicacion:
                        req.body.anio_publicacion,
                    id_autor:
                        Number(req.body.id_autor),
                    id_categoria:
                        Number(req.body.id_categoria),
                    id_editorial:
                        Number(req.body.id_editorial)
                },

                autores,
                categorias,
                editoriales
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

        const { id } = req.params;

        const {
            isbn,
            titulo,
            anio_publicacion,
            id_autor,
            id_categoria,
            id_editorial
        } = req.body;

        const libro =
            await libroModel.actualizar(
                id,
                isbn,
                titulo,
                anio_publicacion,
                id_autor,
                id_categoria,
                id_editorial
            );

        if (!libro) {

            req.flash(
                'error',
                'El libro no existe'
            );

            return res.redirect('/libros');
        }

        req.flash(
            'success',
            'Libro actualizado correctamente'
        );

        res.redirect('/libros');

    } catch (error) {

        console.error(error);

        if (error.code === '23505') {

            req.flash(
                'error',
                'Ya existe un libro con ese ISBN'
            );

            return res.redirect(
                `/libros/${req.params.id}/editar`
            );
        }

        if (error.code === '23503') {

            req.flash(
                'error',
                'Alguna de las relaciones seleccionadas no es válida'
            );

            return res.redirect(
                `/libros/${req.params.id}/editar`
            );
        }

        req.flash(
            'error',
            'Error al actualizar el libro'
        );

        res.redirect(
            `/libros/${req.params.id}/editar`
        );
    }
};

const mostrarFormularioEdicion = async (req, res) => {

    try {

        const { id } = req.params;

        const libro =
            await libroModel.obtenerPorId(id);

        if (!libro) {
            return res.status(404).render('error', {
            titulo: 'No encontrado',
            mensaje: 'Libro no encontrado'
        });
        }

        const autores =
            await libroModel.obtenerAutores();

        const categorias =
            await libroModel.obtenerCategorias();

        const editoriales =
            await libroModel.obtenerEditoriales();

        const autoresConSeleccion =
            autores.map(autor => ({
                ...autor,
                seleccionado:
                    autor.id_autor === libro.id_autor
            }));

        const categoriasConSeleccion =
            categorias.map(categoria => ({
                ...categoria,
                seleccionada:
                    categoria.id_categoria ===
                    libro.id_categoria
            }));

        const editorialesConSeleccion =
            editoriales.map(editorial => ({
                ...editorial,
                seleccionada:
                    editorial.id_editorial ===
                    libro.id_editorial
            }));

        res.render('libros/editar', {

            libro,

            autores:
                autoresConSeleccion,

            categorias:
                categoriasConSeleccion,

            editoriales:
                editorialesConSeleccion
        });

    } catch (error) {

        console.error(error);

        res.status(500).render('error', {
            titulo: 'Ocurrió un error',
            mensaje: 'Error al cargar el libro'
        });
    }
};

const eliminar = async (req, res) => {

    try {

        const { id } = req.params;

        const libro =
            await libroModel.eliminar(id);

        if (!libro) {

            req.flash(
                'error',
                'El libro no existe'
            );

            return res.redirect('/libros');
        }

        req.flash(
            'success',
            'Libro eliminado correctamente'
        );

        res.redirect('/libros');

    } catch (error) {

        console.error(error);

        if (error.code === '23503') {

            req.flash(
                'error',
                'No se puede eliminar el libro porque tiene ejemplares asociados'
            );

            return res.redirect('/libros');
        }

        req.flash(
            'error',
            'Error al eliminar el libro'
        );

        res.redirect('/libros');
    }
};

const catalogo = async (req, res) => {

    try {

        const libros =
            await libroModel.obtenerDisponibilidad();

        res.render(
            'libros/catalogo',
            {
                libros
            }
        );

    } catch (error) {

        console.error(error);

        res.status(500).render('error', {
            titulo: 'Ocurrió un error',
            mensaje: 'Error al obtener el catálogo'
        });
    }
};

const detalle = async (req, res) => {

    try {

        const { id } = req.params;

        if (!Number.isInteger(Number(id))) {
            req.flash('error', 'El libro no existe');
            return res.redirect('/libros');
        }

        const libro = await libroModel.obtenerDetalle(id);

        if (!libro) {
            req.flash('error', 'El libro no existe');
            return res.redirect('/libros');
        }

        const ejemplares =
            await libroModel.obtenerEjemplaresDeLibro(id);

        const disponibles = ejemplares.filter(
            (ejemplar) => ejemplar.estado === 'Disponible'
        ).length;

        res.render('libros/detalle', {
            libro,
            ejemplares,
            totalEjemplares: ejemplares.length,
            disponibles
        });

    } catch (error) {

        console.error(error);

        req.flash('error', 'No se pudo obtener el detalle del libro');

        res.redirect('/libros');
    }
};

module.exports = {
    detalle,
    listar,
    mostrarFormulario,
    crear,
    mostrarFormularioEdicion,
    actualizar,
    eliminar,
    catalogo
};