const express = require('express');

const validarId = require('../middlewares/validarId');

const router = express.Router();

router.param('id', validarId);

const autorController = require('../controllers/autorController');

const {
    validarAutor
} = require('../middlewares/autorValidator');

router.get(
    '/',
    autorController.listar
);

router.get(
    '/nuevo',
    autorController.mostrarFormulario
);

router.post(
    '/',
    validarAutor,
    autorController.crear
);

router.get(
    '/:id/editar',
    autorController.mostrarFormularioEdicion
);

router.post(
    '/:id',
    validarAutor,
    autorController.actualizar
);

router.post(
    '/:id/eliminar',
    autorController.eliminar
);

module.exports = router;