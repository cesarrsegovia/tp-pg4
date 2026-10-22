
const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const usuarioController = require('../controllers/usuarioController');
const { validarUsuario } = require('../middlewares/usuarioValidator');

router.get('/login', authController.mostrarLogin);
router.post('/login', authController.iniciarSesion);
router.post('/logout', authController.cerrarSesion);

// Registro público: se llega desde el enlace de la pantalla de login.
router.get('/registro', usuarioController.mostrarRegistro);
router.post('/registro', validarUsuario, usuarioController.registrar);

module.exports = router;
