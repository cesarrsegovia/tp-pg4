const pool = require('../config/database');
const { patronBusqueda } = require('../utils/paginacion');

const obtenerTodas = async () => {
    const resultado = await pool.query(
        'SELECT * FROM editoriales ORDER BY nombre'
    );
    return resultado.rows;
};

const obtenerPorId = async (id) => {
    const resultado = await pool.query(
        'SELECT * FROM editoriales WHERE id_editorial = $1',
        [id]
    );
    return resultado.rows[0];
}

const crear = async (nombre) => {
    const resultado = await pool.query(
        'INSERT INTO editoriales (nombre) VALUES ($1) RETURNING *',
        [nombre]
    );
    return resultado.rows[0];
};

const actualizar = async (id, nombre) => {
    const resultado = await pool.query(
        `UPDATE editoriales
         SET nombre = $1
         WHERE id_editorial = $2
         RETURNING *`,
        [nombre, id]
    );

    return resultado.rows[0];
};

const eliminar = async (id) => {
    const resultado = await pool.query(
        `DELETE FROM editoriales
         WHERE id_editorial = $1
         RETURNING *`,
        [id]
    );

    return resultado.rows[0];
};

const contar = async (termino = '') => {

    const resultado = await pool.query(
        `SELECT COUNT(*) AS total
         FROM editoriales
         WHERE sin_tildes(nombre) LIKE sin_tildes($1)`,
        [patronBusqueda(termino)]
    );

    return Number(resultado.rows[0].total);
};

const obtenerPaginado = async (termino = '', limite = 10, offset = 0) => {

    const resultado = await pool.query(
        `SELECT *
         FROM editoriales
         WHERE sin_tildes(nombre) LIKE sin_tildes($1)
         ORDER BY nombre
         LIMIT $2 OFFSET $3`,
        [patronBusqueda(termino), limite, offset]
    );

    return resultado.rows;
};

module.exports = {
    contar,
    obtenerPaginado,
    obtenerTodas,
    obtenerPorId,
    crear,
    actualizar,
    eliminar
};