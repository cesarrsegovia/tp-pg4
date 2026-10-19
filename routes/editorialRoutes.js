const express = require('express');

const validarId = require('../middlewares/validarId');

const router = express.Router();

router.param('id', validarId);

const editorialController =
    require('../controllers/editorialController');

const {
    validarEditorial
} = require('../middlewares/editorialValidator');

router.get(
    '/',
    editorialController.listar
);

router.get(
    '/nueva',
    editorialController.mostrarFormulario
);

router.get(
    '/:id/editar',
    editorialController.mostrarFormularioEdicion
);

router.post(
    '/',
    validarEditorial,
    editorialController.crear
);

router.post(
    '/:id',
    validarEditorial,
    editorialController.actualizar
);

router.post(
    '/:id/eliminar',
    editorialController.eliminar
);

module.exports = router;