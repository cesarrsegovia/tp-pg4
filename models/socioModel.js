
const pool = require('../config/database');
const { patronBusqueda } = require('../utils/paginacion');

// Obtener todos los socios para el listado.
const obtenerTodos = async () => {
    const resultado = await pool.query(
        `SELECT
            id_socio,
            nombre,
            apellido,
            dni,
            email,
            telefono,
            estado
         FROM socios
         ORDER BY apellido, nombre`
    );

    return resultado.rows;
};

// Obtener un socio por su identificador.
const obtenerPorId = async (id) => {
    const resultado = await pool.query(
        `SELECT *
         FROM socios
         WHERE id_socio = $1`,
        [id]
    );

    return resultado.rows[0];
};

// Crear un socio nuevo.
const crear = async ({
    nombre,
    apellido,
    dni,
    email,
    telefono,
    estado
}) => {
    const resultado = await pool.query(
        `INSERT INTO socios (
            nombre,
            apellido,
            dni,
            email,
            telefono,
            estado
         )
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [nombre, apellido, dni, email, telefono, estado]
    );

    return resultado.rows[0];
};

// Actualizar los datos de un socio existente.
const actualizar = async (
    id,
    {
        nombre,
        apellido,
        dni,
        email,
        telefono,
        estado
    }
) => {
    const resultado = await pool.query(
        `UPDATE socios
         SET
            nombre = $1,
            apellido = $2,
            dni = $3,
            email = $4,
            telefono = $5,
            estado = $6
         WHERE id_socio = $7
         RETURNING *`,
        [
            nombre,
            apellido,
            dni,
            email,
            telefono,
            estado,
            id
        ]
    );

    return resultado.rows[0];
};

// Eliminar un socio.
const eliminar = async (id) => {
    const resultado = await pool.query(
        `DELETE FROM socios
         WHERE id_socio = $1
         RETURNING *`,
        [id]
    );

    return resultado.rows[0];
};

const contar = async (termino = '') => {

    const resultado = await pool.query(
        `SELECT COUNT(*) AS total
         FROM socios
         WHERE sin_tildes(nombre) LIKE sin_tildes($1)
            OR sin_tildes(apellido) LIKE sin_tildes($1)
            OR sin_tildes(dni) LIKE sin_tildes($1)
            OR sin_tildes(email) LIKE sin_tildes($1)`,
        [patronBusqueda(termino)]
    );

    return Number(resultado.rows[0].total);
};

const obtenerPaginado = async (termino = '', limite = 10, offset = 0) => {

    const resultado = await pool.query(
        `SELECT
            id_socio,
            nombre,
            apellido,
            dni,
            email,
            telefono,
            estado
         FROM socios
         WHERE sin_tildes(nombre) LIKE sin_tildes($1)
            OR sin_tildes(apellido) LIKE sin_tildes($1)
            OR sin_tildes(dni) LIKE sin_tildes($1)
            OR sin_tildes(email) LIKE sin_tildes($1)
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
