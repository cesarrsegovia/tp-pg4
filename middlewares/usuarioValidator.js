
const { body } = require('express-validator');

const validarUsuario = [
    body('nombre')
        .trim()
        .notEmpty()
        .withMessage('El nombre es obligatorio')
        .isLength({ max: 100 })
        .withMessage('El nombre no puede superar los 100 caracteres'),

    body('apellido')
        .trim()
        .notEmpty()
        .withMessage('El apellido es obligatorio')
        .isLength({ max: 100 })
        .withMessage('El apellido no puede superar los 100 caracteres'),

    body('email')
        .trim()
        .notEmpty()
        .withMessage('El email es obligatorio')
        .isEmail()
        .withMessage('Debe ingresar un email válido')
        .isLength({ max: 150 })
        .withMessage('El email no puede superar los 150 caracteres'),

    body('password')
        .isString()
        .withMessage('La contraseña no es válida')
        .isLength({ min: 12, max: 72 })
        .withMessage('La contraseña debe tener entre 12 y 72 caracteres')
];

module.exports = { validarUsuario };
