const { body } = require('express-validator');

const validarEditorial = [
    body('nombre')
        .trim()
        .customSanitizer((valor) => String(valor).replace(/\s+/g, ' '))
        .notEmpty()
        .withMessage('El nombre de la editorial es obligatorio')
        .isLength({ max: 150 })
        .withMessage(
            'El nombre no puede superar los 150 caracteres'
        )
];

module.exports = {
    validarEditorial
};