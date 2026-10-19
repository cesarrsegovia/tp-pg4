
const requiereAutenticacion = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }

    req.flash(
        'error',
        'Debés iniciar sesión para acceder al sistema'
    );

    return res.redirect('/login');
};

module.exports = requiereAutenticacion;
