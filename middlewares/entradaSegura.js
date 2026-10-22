// Rechaza datos con una forma que ningún formulario del sistema envía:
//  - campos repetidos o anidados (nombre=a&nombre=b, nombre[x]=y), que llegan como arreglos u objetos;
//  - el carácter NUL (\u0000), que PostgreSQL no acepta en un texto.
// Se evita así que los controladores fallen con un error 500 ante una solicitud armada a mano.
const esValorSimple = (valor) => {
    if (typeof valor !== 'string') {
        return false;
    }

    return !valor.includes('\u0000');
};

const todosSimples = (datos) =>
    Object.values(datos || {}).every(esValorSimple);

const entradaSegura = (req, res, next) => {

    if (todosSimples(req.body) && todosSimples(req.query)) {
        return next();
    }

    return res.status(400).render('error', {
        titulo: 'Solicitud no válida',
        mensaje: 'Los datos enviados no tienen un formato válido.'
    });
};

module.exports = entradaSegura;
