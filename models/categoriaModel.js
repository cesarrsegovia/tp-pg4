const pool = require('../config/database');
const { patronBusqueda } = require('../utils/paginacion');

const obtenerTodas = async () => {
    const resultado = await pool.query(
        'SELECT * FROM categorias ORDER BY nombre'
    );
    return resultado.rows;
}

const crear = async (nombre, descripcion) => {
    const resultado = await pool.query(
        'INSERT INTO categorias (nombre, descripcion) VALUES ($1, $2) RETURNING *',
        [nombre, descripcion || null]
    );
    return resultado.rows[0];
}

const obtenerPorId = async (id) => {
    const resultado = await pool.query(
        'SELECT * FROM categorias WHERE id_categoria =$1',
        [id]
    );
    return resultado.rows[0];
}

const actualizar = async (id, nombre, descripcion) => {
    const resultado = await pool.query(
        `UPDATE categorias
        SET nombre = $1,
            descripcion = $2
        WHERE id_categoria = $3
        RETURNING *`,
        [nombre, descripcion || null, id]
    );
    return resultado.rows[0];
}

const eliminar = async (id) => {
    const resultado = await pool.query(
        `DELETE FROM categorias
        WHERE id_categoria = $1
        RETURNING *`,
        [id]
    );
    return resultado.rows[0];
}

const contar = async (termino = '') => {

    const resultado = await pool.query(
        `SELECT COUNT(*) AS total
         FROM categorias
         WHERE sin_tildes(COALESCE((nombre)::text, '')) LIKE ALL (SELECT sin_tildes(p) FROM unnest($1::text[]) AS p)`,
        [patronBusqueda(termino)]
    );

    return Number(resultado.rows[0].total);
};

const obtenerPaginado = async (termino = '', limite = 10, offset = 0) => {

    const resultado = await pool.query(
        `SELECT *
         FROM categorias
         WHERE sin_tildes(COALESCE((nombre)::text, '')) LIKE ALL (SELECT sin_tildes(p) FROM unnest($1::text[]) AS p)
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
}