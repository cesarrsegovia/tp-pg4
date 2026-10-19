// Valida que el parámetro :id de una ruta sea un entero positivo razonable.
// Evita errores de la base de datos con ids como "abc" o números enormes.
const validarId = (req, res, next, id) => {

    if (/^\d{1,9}$/.test(id) && Number(id) > 0) {
        return next();
    }

    return res.status(404).render('error', {
        titulo: 'No encontrado',
        mensaje: 'El registro solicitado no existe.'
    });
};

module.exports = validarId;
