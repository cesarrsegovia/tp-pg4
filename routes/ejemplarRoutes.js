const express = require('express');

const validarId = require('../middlewares/validarId');

const router = express.Router();

router.param('id', validarId);

const ejemplarController =
    require('../controllers/ejemplarController');

const {
    validarEjemplar,
    validarActualizacionEjemplar
} = require('../middlewares/ejemplarValidator');

router.get(
    '/',
    ejemplarController.listar
);

router.get(
    '/nuevo',
    ejemplarController.mostrarFormulario
);

router.get(
    '/:id/editar',
    ejemplarController.mostrarFormularioEdicion
);

router.post(
    '/',
    validarEjemplar,
    ejemplarController.crear
);

router.post(
    '/:id',
    validarActualizacionEjemplar,
    ejemplarController.actualizar
);

router.post(
    '/:id/eliminar',
    ejemplarController.eliminar
);

module.exports = router;