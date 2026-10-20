
require('dotenv').config();

const bcrypt = require('bcryptjs');
const pool = require('./config/database');

const crearUsuario = async () => {
    try {
        const nombre = 'Administrador';
        const apellido = 'Biblioteca';
        // const email = process.env.ADMIN_EMAIL || 'admin@biblioteca.com';
        // const password = process.env.ADMIN_PASSWORD || 'AdminBiblioteca2026!';
        const email = process.env.ADMIN_EMAIL || 'cesar@biblioteca.com';
        const password = process.env.ADMIN_PASSWORD || 'admincesar2026';

        const hash = await bcrypt.hash(password, 10);

        await pool.query(
            `INSERT INTO usuarios
                (nombre, apellido, email, password)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (email) DO NOTHING`,
            [nombre, apellido, email, hash]
        );

        console.log('Proceso de usuario de prueba finalizado.');
    } catch (error) {
        console.error('Error al crear usuario:', error.message);
    } finally {
        await pool.end();
    }
};

crearUsuario();
