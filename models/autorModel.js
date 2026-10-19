const pool = require('../config/database');
const { patronBusqueda } = require('../utils/paginacion');

const obtenerTodos = async () => {
    const resultado = await pool.query(
        'SELECT * FROM autores ORDER BY apellido, nombre'
    );

    return resultado.rows;
};

const obtenerPorId = async (id) => {
    const resultado = await pool.query(
        'SELECT * FROM autores WHERE id_autor = $1',
        [id]
    );

    return resultado.rows[0];
};

const crear = async (nombre, apellido) => {
    const resultado = await pool.query(
        'INSERT INTO autores (nombre, apellido) VALUES ($1, $2) RETURNING *',
        [nombre, apellido]
    );

    return resultado.rows[0];
};

const actualizar = async (id, nombre, apellido) => {
    const resultado = await pool.query(
        `UPDATE autores
         SET nombre = $1,
             apellido = $2
         WHERE id_autor = $3
         RETURNING *`,
        [nombre, apellido, id]
    );

    return resultado.rows[0];
};

const eliminar = async (id) => {
    const resultado = await pool.query(
        `DELETE FROM autores
         WHERE id_autor = $1
         RETURNING *`,
        [id]
    );

    return resultado.rows[0];
};

const contar = async (termino = '') => {

    const resultado = await pool.query(
        `SELECT COUNT(*) AS total
         FROM autores
         WHERE sin_tildes((nombre || ' ' || apellido)) LIKE sin_tildes($1)`,
        [patronBusqueda(termino)]
    );

    return Number(resultado.rows[0].total);
};

const obtenerPaginado = async (termino = '', limite = 10, offset = 0) => {

    const resultado = await pool.query(
        `SELECT *
         FROM autores
         WHERE sin_tildes((nombre || ' ' || apellido)) LIKE sin_tildes($1)
         ORDER BY apellido, nombre
         LIMIT $2 OFFSET $3`,
        [patronBusqueda(termino), limite, offset]
    );

    return resultado.rows;
};

module.exports = {
    contar,
    obtenerPaginado,
    obtenerTodos,
    obtenerPorId,
    crear,
    actualizar,
    eliminar
};