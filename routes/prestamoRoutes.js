const express = require('express');

const validarId = require('../middlewares/validarId');

const router = express.Router();

router.param('id', validarId);

const prestamoController =
    require('../controllers/prestamoController');

const {
    validarPrestamo
} = require('../middlewares/prestamoValidator');

router.get(
    '/',
    prestamoController.listar
);

router.get(
    '/nuevo',
    prestamoController.mostrarFormulario
);

router.get(
    '/socio/:id',
    prestamoController.historialSocio
);

router.get(
    '/ejemplar/:id',
    prestamoController.historialEjemplar
);

router.get(
    '/:id/devolver',
    prestamoController.mostrarDevolucion
);

router.get(
    '/:id',
    prestamoController.detalle
);

router.post(
    '/',
    validarPrestamo,
    prestamoController.crear
);

router.post(
    '/:id/devolver',
    prestamoController.devolver
);



module.exports = router;