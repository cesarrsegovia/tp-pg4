const { body } = require('express-validator');

const validarAutor = [
    body('nombre')
        .trim()
        .notEmpty()
        .withMessage('El nombre del autor es obligatorio')
        .isLength({ max: 100 })
        .withMessage('El nombre no puede superar los 100 caracteres'),

    body('apellido')
        .trim()
        .notEmpty()
        .withMessage('El apellido del autor es obligatorio')
        .isLength({ max: 100 })
        .withMessage('El apellido no puede superar los 100 caracteres')
];

module.exports = {
    validarAutor
};