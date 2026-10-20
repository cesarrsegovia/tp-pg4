const pool = require('../config/database');
const { patronBusqueda } = require('../utils/paginacion');

const obtenerTodos = async () => {

    const resultado = await pool.query(
        `SELECT
            ejemplares.id_ejemplar,
            ejemplares.codigo_inventario,
            ejemplares.estado,
            libros.id_libro,
            libros.titulo
         FROM ejemplares
         JOIN libros
            ON ejemplares.id_libro = libros.id_libro
         ORDER BY libros.titulo,
                  ejemplares.codigo_inventario`
    );

    return resultado.rows;
};

const obtenerPorId = async (id) => {

    const resultado = await pool.query(
        `SELECT *
         FROM ejemplares
         WHERE id_ejemplar = $1`,
        [id]
    );

    return resultado.rows[0];
};

const obtenerLibros = async () => {

    const resultado = await pool.query(
        `SELECT
            id_libro,
            titulo
         FROM libros
         ORDER BY titulo`
    );

    return resultado.rows;
};

const crear = async (
    codigo_inventario,
    id_libro,
    estado
) => {

    const resultado = await pool.query(
        `INSERT INTO ejemplares (
            codigo_inventario,
            id_libro,
            estado
        )
        VALUES ($1, $2, $3)
        RETURNING *`,
        [
            codigo_inventario,
            id_libro,
            estado
        ]
    );

    return resultado.rows[0];
};

// Si el ejemplar está Prestado, el estado no se modifica (lo gestiona el préstamo).
const actualizar = async (
    id,
    codigo_inventario,
    id_libro,
    estado
) => {

    const resultado = await pool.query(
        `UPDATE ejemplares
         SET
            codigo_inventario = $1,
            id_libro = $2,
            estado = CASE
                WHEN estado = 'Prestado' THEN estado
                ELSE COALESCE($3, estado)
            END
         WHERE id_ejemplar = $4
         RETURNING *`,
        [
            codigo_inventario,
            id_libro,
            estado || null,
            id
        ]
    );

    return resultado.rows[0];
};

const eliminar = async (id) => {

    const resultado = await pool.query(
        `DELETE FROM ejemplares
         WHERE id_ejemplar = $1
         RETURNING *`,
        [id]
    );

    return resultado.rows[0];
};

const contar = async (termino = '') => {

    const resultado = await pool.query(
        `SELECT COUNT(*) AS total
         FROM ejemplares
         JOIN libros
            ON ejemplares.id_libro = libros.id_libro
         WHERE sin_tildes(COALESCE((ejemplares.codigo_inventario)::text, '') || ' ' || COALESCE((libros.titulo)::text, '') || ' ' || COALESCE((ejemplares.estado)::text, '')) LIKE ALL (SELECT sin_tildes(p) FROM unnest($1::text[]) AS p)`,
        [patronBusqueda(termino)]
    );

    return Number(resultado.rows[0].total);
};

const obtenerPaginado = async (termino = '', limite = 10, offset = 0) => {

    const resultado = await pool.query(
        `SELECT
            ejemplares.id_ejemplar,
            ejemplares.codigo_inventario,
            ejemplares.estado,
            libros.id_libro,
            libros.titulo
         FROM ejemplares
         JOIN libros
            ON ejemplares.id_libro = libros.id_libro
         WHERE sin_tildes(COALESCE((ejemplares.codigo_inventario)::text, '') || ' ' || COALESCE((libros.titulo)::text, '') || ' ' || COALESCE((ejemplares.estado)::text, '')) LIKE ALL (SELECT sin_tildes(p) FROM unnest($1::text[]) AS p)
         ORDER BY libros.titulo, ejemplares.codigo_inventario
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
    obtenerLibros,
    crear,
    actualizar,
    eliminar
};