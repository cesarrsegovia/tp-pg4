
const pool = require('../config/database');

// El email no distingue mayúsculas ni espacios alrededor (se guarda en minúsculas al registrarse).
const buscarPorEmail = async (email) => {
    const resultado = await pool.query(
        `SELECT
            id_usuario,
            nombre,
            apellido,
            email,
            password
         FROM usuarios
         WHERE lower(email) = lower($1)`,
        [String(email).trim()]
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
