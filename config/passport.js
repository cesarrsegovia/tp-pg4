
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');

const usuarioModel = require('../models/usuarioModel');

passport.use(
    new LocalStrategy(
        {
            usernameField: 'email',
            passwordField: 'password'
        },
        async (email, password, done) => {
            try {
                const usuario =
                    await usuarioModel.buscarPorEmail(email);

                if (!usuario) {
                    return done(null, false, {
                        message: 'Email o contraseña incorrectos'
                    });
                }

                const contrasenaValida = await bcrypt.compare(
                    password,
                    usuario.password
                );

                if (!contrasenaValida) {
                    return done(null, false, {
                        message: 'Email o contraseña incorrectos'
                    });
                }

                return done(null, usuario);
            } catch (error) {
                return done(error);
            }
        }
    )
);

passport.serializeUser((usuario, done) => {
    done(null, usuario.id_usuario);
});

passport.deserializeUser(async (id, done) => {
    try {
        const usuario = await usuarioModel.buscarPorId(id);

        if (!usuario) {
            return done(null, false);
        }

        return done(null, usuario);
    } catch (error) {
        return done(error);
    }
});

module.exports = passport;
