
const passport = require('../config/passport');

const mostrarLogin = (req, res) => {
    if (req.isAuthenticated()) {
        return res.redirect('/');
    }

    return res.render('auth/login', {
        titulo: 'Iniciar sesión'
    });
};

const iniciarSesion = (req, res, next) => {
    passport.authenticate('local', (error, usuario, info) => {
        if (error) {
            return next(error);
        }

        if (!usuario) {
            req.flash(
                'error',
                info?.message || 'No se pudo iniciar sesión'
            );

            return res.redirect('/login');
        }

        req.logIn(usuario, (errorLogin) => {
            if (errorLogin) {
                return next(errorLogin);
            }

            req.flash('success', 'Sesión iniciada correctamente');

            return res.redirect('/');
        });
    })(req, res, next);
};

const cerrarSesion = (req, res, next) => {
    req.logout((error) => {
        if (error) {
            return next(error);
        }

        // Se regenera la sesión: la anterior se destruye y el mensaje viaja en la nueva.
        req.session.regenerate((errorSesion) => {
            if (errorSesion) {
                return next(errorSesion);
            }

            req.flash('success', 'Sesión cerrada correctamente');

            return res.redirect('/login');
        });
    });
};

module.exports = {
    mostrarLogin,
    iniciarSesion,
    cerrarSesion
};
