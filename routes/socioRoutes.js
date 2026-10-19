
const express = require('express');
const validarId = require('../middlewares/validarId');

const router = express.Router();

router.param('id', validarId);

const socioController = require('../controllers/socioController');

const {
    validarSocio
} = require('../middlewares/socioValidator');

// Listar socios.
router.get('/', socioController.listar);

// Mostrar formulario de alta.
router.get('/nuevo', socioController.mostrarFormulario);

// Crear socio.
router.post('/', validarSocio, socioController.crear);

// Mostrar formulario de edición.
router.get('/:id/editar', socioController.mostrarFormularioEdicion);

// Actualizar socio.
router.post('/:id', validarSocio, socioController.actualizar);

// Eliminar socio.
router.post('/:id/eliminar', socioController.eliminar);

module.exports = router;
