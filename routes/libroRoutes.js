const express = require('express');

const validarId = require('../middlewares/validarId');

const router = express.Router();

router.param('id', validarId);

const libroController =
    require('../controllers/libroController');

const {
    validarLibro
} = require('../middlewares/libroValidator');

router.get(
    '/',
    libroController.listar
);

router.get(
    '/catalogo',
    libroController.catalogo
);


router.get(
    '/nuevo',
    libroController.mostrarFormulario
);

router.post(
    '/',
    validarLibro,
    libroController.crear
);


router.get(
    '/:id/editar',
    libroController.mostrarFormularioEdicion
);

router.post(
    '/:id',
    validarLibro,
    libroController.actualizar
);

router.post(
    '/:id/eliminar',
    libroController.eliminar
);

router.get(
    '/:id',
    libroController.detalle
);

module.exports = router;