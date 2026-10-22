
const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');
const usuarioModel = require('../models/usuarioModel');

// El alta de usuarios se usa desde dos lugares: la pantalla interna (con sesión)
// y el registro público desde el login. Cambian la vista y a dónde se vuelve al terminar.
const PANTALLA_INTERNA = {
    vista: 'usuarios/nuevo',
    exito: '/usuarios/nuevo',
    errorGeneral: '/usuarios/nuevo',
    mensajeExito: 'Usuario creado correctamente'
};

const PANTALLA_PUBLICA = {
    vista: 'auth/registro',
    exito: '/login',
    errorGeneral: '/registro',
    mensajeExito: 'Cuenta creada correctamente. Ya podés iniciar sesión.'
};

const fabricarMostrar = ({ vista }) => (req, res) => {
    res.render(vista, {
        titulo: 'Nuevo usuario'
    });
};

const fabricarCrear = ({ vista, exito, errorGeneral, mensajeExito }) => async (req, res) => {
    const errores = validationResult(req);

    if (!errores.isEmpty()) {
        return res.status(400).render(vista, {
            titulo: 'Nuevo usuario',
            errores: errores.array(),
            datos: {
                nombre: req.body.nombre,
                apellido: req.body.apellido,
                email: req.body.email
            }
        });
    }

    try {
        const nombre = req.body.nombre.trim();
        const apellido = req.body.apellido.trim();
        const email = req.body.email.trim().toLowerCase();
        const password = req.body.password;

        const usuarioExistente =
            await usuarioModel.buscarPorEmail(email);

        if (usuarioExistente) {
            return res.status(409).render(vista, {
                titulo: 'Nuevo usuario',
                errores: [
                    { msg: 'Ya existe un usuario con ese email' }
                ],
                datos: { nombre, apellido, email }
            });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        await usuarioModel.crear({
            nombre,
            apellido,
            email,
            password: passwordHash
        });

        req.flash('success', mensajeExito);

        return res.redirect(exito);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).render(vista, {
                titulo: 'Nuevo usuario',
                errores: [
                    { msg: 'Ya existe un usuario con ese email' }
                ],
                datos: {
                    nombre: req.body.nombre,
                    apellido: req.body.apellido,
                    email: req.body.email
                }
            });
        }

        console.error(error);

        req.flash('error', 'No se pudo crear el usuario');
        return res.redirect(errorGeneral);
    }
};

module.exports = {
    mostrarFormulario: fabricarMostrar(PANTALLA_INTERNA),
    crear: fabricarCrear(PANTALLA_INTERNA),
    mostrarRegistro: fabricarMostrar(PANTALLA_PUBLICA),
    registrar: fabricarCrear(PANTALLA_PUBLICA)
};
