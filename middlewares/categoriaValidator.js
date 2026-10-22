const { body } = require('express-validator');

const validarCategoria = [
    body('nombre')
        .trim()
        .customSanitizer((valor) => String(valor).replace(/\s+/g, ' '))
        .notEmpty()
        .withMessage('El nombre de la categoría es obligatorio')
        .isLength({ max: 100 })
        .withMessage('El nombre no puede superar los 100 caracteres'),

    body('descripcion')
        .optional({ values: 'falsy' })
        .trim()
        .isLength({ max: 255 })
        .withMessage('La descripción no puede superar los 255 caracteres')
];

module.exports = {
    validarCategoria
};