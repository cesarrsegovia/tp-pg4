
const express = require('express');
const router = express.Router();

const usuarioController = require('../controllers/usuarioController');
const { validarUsuario } = require('../middlewares/usuarioValidator');

router.get('/nuevo', usuarioController.mostrarFormulario);

router.post(
    '/nuevo',
    validarUsuario,
    usuarioController.crear
);

module.exports = router;
