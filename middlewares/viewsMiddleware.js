const obtenerSeccion = (ruta) => {
    if (ruta === '/') {
        return 'inicio';
    }

    if (ruta.startsWith('/libros/catalogo')) {
        return 'catalogo';
    }

    const primerSegmento = ruta.split('/')[1];

    if (['categorias', 'autores', 'editoriales'].includes(primerSegmento)) {
        return 'catalogos';
    }

    return primerSegmento;
};

const configurarVariablesVista = (req,res, next) => {
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    res.locals.seccion = obtenerSeccion(req.path);
    res.locals.anioActual = new Date().getFullYear();

    next();
}

module.exports = configurarVariablesVista;
