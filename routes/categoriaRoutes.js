const express = require('express');
const { validarCategoria } = require('../middlewares/categoriaValidator');

const validarId = require('../middlewares/validarId');

const router = express.Router();

router.param('id', validarId);

const categoriaController = require('../controllers/categoriaController');

router.get('/', categoriaController.listar);
router.get('/nueva', categoriaController.mostrarFormulario);
router.get('/:id/editar', categoriaController.mostrarFormularioEdicion);
router.post('/', validarCategoria, categoriaController.crear);
router.post('/:id', validarCategoria, categoriaController.actualizar);
router.post('/:id/eliminar', categoriaController.eliminar);

module.exports = router;