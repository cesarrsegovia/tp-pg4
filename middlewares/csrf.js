const crypto = require('crypto');

const METODOS_SEGUROS = ['GET', 'HEAD', 'OPTIONS'];

const generarToken = () => crypto.randomBytes(32).toString('hex');

const sonIguales = (a, b) => {
    const bufferA = Buffer.from(String(a));
    const bufferB = Buffer.from(String(b));

    return (
        bufferA.length === bufferB.length &&
        crypto.timingSafeEqual(bufferA, bufferB)
    );
};

// Protección CSRF con un token por sesión.
// Cada formulario POST incluye el campo oculto "_csrf" (partial "csrf").
// Debe montarse después de express-session y de express.urlencoded.
const proteccionCsrf = (req, res, next) => {

    if (!req.session) {
        return next(new Error('La sesión no está disponible'));
    }

    if (!req.session.csrfToken) {
        req.session.csrfToken = generarToken();
    }

    res.locals.csrfToken = req.session.csrfToken;

    if (METODOS_SEGUROS.includes(req.method)) {
        return next();
    }

    const tokenEnviado = req.body && req.body._csrf;

    if (tokenEnviado && sonIguales(tokenEnviado, req.session.csrfToken)) {
        return next();
    }

    return res.status(403).render('error', {
        titulo: 'Solicitud no válida',
        mensaje:
            'No se pudo verificar el formulario. Volvé a la página anterior, recargala e intentá nuevamente.'
    });
};

module.exports = proteccionCsrf;
