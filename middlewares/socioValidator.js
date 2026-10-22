
const { body } = require('express-validator');

const validarSocio = [
    body('nombre')
        .trim()
        .customSanitizer((valor) => String(valor).replace(/\s+/g, ' '))
        .notEmpty()
        .withMessage('El nombre es obligatorio')
        .isLength({ max: 100 })
        .withMessage('El nombre no puede superar los 100 caracteres'),

    body('apellido')
        .trim()
        .customSanitizer((valor) => String(valor).replace(/\s+/g, ' '))
        .notEmpty()
        .withMessage('El apellido es obligatorio')
        .isLength({ max: 100 })
        .withMessage('El apellido no puede superar los 100 caracteres'),

    body('dni')
        .trim()
        .customSanitizer((valor) => String(valor).replace(/[.\s]/g, ''))
        .notEmpty()
        .withMessage('El DNI es obligatorio')
        .isLength({ max: 20 })
        .withMessage('El DNI no puede superar los 20 caracteres')
        .bail()
        .matches(/^\d{6,10}$/)
        .withMessage('El DNI debe contener solo números (entre 6 y 10 dígitos)'),

    body('email')
        .trim()
        .notEmpty()
        .withMessage('El email es obligatorio')
        .isEmail()
        .withMessage('Debe ingresar un email válido')
        .isLength({ max: 150 })
        .withMessage('El email no puede superar los 150 caracteres'),

    body('telefono')
        .optional({ values: 'falsy' })
        .trim()
        .isLength({ max: 30 })
        .withMessage('El teléfono no puede superar los 30 caracteres')
        .bail()
        .matches(/^[0-9+()\-.\s]+$/)
        .withMessage('El teléfono solo puede contener números, espacios y los símbolos + ( ) - .'),

    body('estado')
        .notEmpty()
        .withMessage('Debe seleccionar un estado')
        .isIn(['Activo', 'Inactivo'])
        .withMessage('El estado seleccionado no es válido')
];

module.exports = {
    validarSocio
};
