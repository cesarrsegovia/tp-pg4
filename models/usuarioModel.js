
const pool = require('../config/database');

const buscarPorEmail = async (email) => {
    const resultado = await pool.query(
        `SELECT
            id_usuario,
            nombre,
            apellido,
            email,
            password
         FROM usuarios
         WHERE email = $1`,
        [email]
    );

    return resultado.rows[0] || null;
};

const buscarPorId = async (id) => {
    const resultado = await pool.query(
        `SELECT
            id_usuario,
            nombre,
            apellido,
            email
         FROM usuarios
         WHERE id_usuario = $1`,
        [id]
    );

    return resultado.rows[0] || null;
};


const crear = async ({ nombre, apellido, email, password }) => {
    const resultado = await pool.query(
        `INSERT INTO usuarios
            (nombre, apellido, email, password)
         VALUES ($1, $2, $3, $4)
         RETURNING id_usuario, nombre, apellido, email`,
        [nombre, apellido, email, password]
    );

    return resultado.rows[0];
};


module.exports = {
    buscarPorEmail,
    buscarPorId,
    crear
};
