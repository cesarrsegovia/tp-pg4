
const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');
const usuarioModel = require('../models/usuarioModel');

const mostrarFormulario = (req, res) => {
    res.render('usuarios/nuevo', {
        titulo: 'Nuevo usuario'
    });
};

const crear = async (req, res) => {
    const errores = validationResult(req);

    if (!errores.isEmpty()) {
        return res.status(400).render('usuarios/nuevo', {
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
            return res.status(409).render('usuarios/nuevo', {
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

        req.flash('success', 'Usuario creado correctamente');

        return res.redirect('/usuarios/nuevo');
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).render('usuarios/nuevo', {
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
        return res.redirect('/usuarios/nuevo');
    }
};

module.exports = {
    mostrarFormulario,
    crear
};
