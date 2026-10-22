const { body } = require('express-validator');

const validarLibro = [

    body('isbn')
        .trim()
        .notEmpty()
        .withMessage('El ISBN es obligatorio')
        .isLength({ max: 20 })
        .withMessage('El ISBN no puede superar los 20 caracteres'),

    body('titulo')
        .trim()
        .notEmpty()
        .withMessage('El título es obligatorio')
        .isLength({ max: 200 })
        .withMessage('El título no puede superar los 200 caracteres'),

    body('anio_publicacion')
        .notEmpty()
        .withMessage('El año de publicación es obligatorio')
        .matches(/^\d{1,9}$/)
        .withMessage('El año debe ser un número entero de 4 dígitos')
        .bail()
        .custom((valor) => {
            const anio = Number(valor);
            const anioActual = new Date().getFullYear();

            if (anio < 1000 || anio > anioActual) {
                throw new Error(
                    `El año de publicación debe estar entre 1000 y ${anioActual}`
                );
            }

            return true;
        }),

    body('id_autor')
        .notEmpty()
        .withMessage('Debe seleccionar un autor')
        .isInt({ min: 1, max: 2147483647 })
        .withMessage('El autor seleccionado no es válido'),

    body('id_categoria')
        .notEmpty()
        .withMessage('Debe seleccionar una categoría')
        .isInt({ min: 1, max: 2147483647 })
        .withMessage('La categoría seleccionada no es válida'),

    body('id_editorial')
        .notEmpty()
        .withMessage('Debe seleccionar una editorial')
        .isInt({ min: 1, max: 2147483647 })
        .withMessage('La editorial seleccionada no es válida')
];

module.exports = {
    validarLibro
};