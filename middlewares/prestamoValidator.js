const { body } = require('express-validator');

const validarPrestamo = [

    body('id_socio')
        .notEmpty()
        .withMessage(
            'Debe seleccionar un socio'
        )
        .isInt()
        .withMessage(
            'El socio seleccionado no es válido'
        ),

    body('id_ejemplar_1')
        .notEmpty()
        .withMessage(
            'Debe seleccionar al menos un ejemplar'
        )
        .isInt()
        .withMessage(
            'El ejemplar seleccionado no es válido'
        ),

    body('id_ejemplar_2')
        .optional({ values: 'falsy' })
        .isInt()
        .withMessage(
            'El segundo ejemplar no es válido'
        ),

    body('id_ejemplar_3')
        .optional({ values: 'falsy' })
        .isInt()
        .withMessage(
            'El tercer ejemplar no es válido'
        )
];

module.exports = {
    validarPrestamo
};