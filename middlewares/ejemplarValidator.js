
const { body } = require('express-validator');

// "Prestado" solo se asigna mediante un préstamo.
const ESTADOS_EDITABLES = ['Disponible', 'Dañado', 'En mantenimiento'];

// Validaciones compartidas por la creación y la edición.
const validarDatosEjemplar = [
    body('codigo_inventario')
        .trim()
        .notEmpty()
        .withMessage('El código de inventario es obligatorio')
        .isLength({ max: 50 })
        .withMessage(
            'El código no puede superar los 50 caracteres'
        ),

    body('id_libro')
        .notEmpty()
        .withMessage('Debe seleccionar un libro')
        .isInt({ min: 1, max: 2147483647 })
        .withMessage('El libro seleccionado no es válido')
];

// Al crear, el usuario debe indicar también el estado inicial.
const validarEjemplar = [
    ...validarDatosEjemplar,

    body('estado')
        .notEmpty()
        .withMessage('Debe seleccionar un estado')
        .isIn(ESTADOS_EDITABLES)
        .withMessage(
            'El estado inicial debe ser Disponible, Dañado o En mantenimiento'
        )
];

// Al editar, el estado es opcional: no se envía cuando el ejemplar está prestado.
const validarActualizacionEjemplar = [
    ...validarDatosEjemplar,

    body('estado')
        .optional({ values: 'falsy' })
        .isIn(ESTADOS_EDITABLES)
        .withMessage(
            'El estado debe ser Disponible, Dañado o En mantenimiento'
        )
];

module.exports = {
    validarEjemplar,
    validarActualizacionEjemplar
};
