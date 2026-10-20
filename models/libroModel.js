const pool = require('../config/database');
const { patronBusqueda } = require('../utils/paginacion');

const obtenerTodos = async () => {

    const resultado = await pool.query(
        `SELECT
            libros.id_libro,
            libros.isbn,
            libros.titulo,
            libros.anio_publicacion,
            (autores.nombre || ' ' || autores.apellido) AS autor,
            categorias.nombre AS categoria,
            editoriales.nombre AS editorial
         FROM libros
         JOIN autores
            ON libros.id_autor = autores.id_autor
         JOIN categorias
            ON libros.id_categoria = categorias.id_categoria
         JOIN editoriales
            ON libros.id_editorial = editoriales.id_editorial
         ORDER BY libros.titulo`
    );

    return resultado.rows;
};

const obtenerPorId = async (id) => {
    const resultado = await pool.query(
        'SELECT * FROM libros WHERE id_libro = $1',
        [id]
    );
    return resultado.rows[0];
}

const crear = async (
    isbn,
    titulo,
    anio_publicacion,
    id_autor,
    id_categoria,
    id_editorial
) => {
    const resultado = await pool.query(
        `INSERT INTO libros (
        isbn,
        titulo,
        anio_publicacion,
        id_autor,
        id_categoria,
        id_editorial
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [isbn, titulo, anio_publicacion, id_autor, id_categoria, id_editorial]
    );
    return resultado.rows[0];
};

const obtenerAutores = async () => {

    const resultado = await pool.query(
        `SELECT id_autor, (apellido || ', ' || nombre) AS nombre
         FROM autores
         ORDER BY apellido, nombre`
    );

    return resultado.rows;
};

const obtenerCategorias = async () => {

    const resultado = await pool.query(
        `SELECT id_categoria, nombre
         FROM categorias
         ORDER BY nombre`
    );

    return resultado.rows;
};

const obtenerEditoriales = async () => {

    const resultado = await pool.query(
        `SELECT id_editorial, nombre
         FROM editoriales
         ORDER BY nombre`
    );

    return resultado.rows;
};

const actualizar = async (
    id,
    isbn,
    titulo,
    anio_publicacion,
    id_autor,
    id_categoria,
    id_editorial
) => {

    const resultado = await pool.query(
        `UPDATE libros
         SET
            isbn = $1,
            titulo = $2,
            anio_publicacion = $3,
            id_autor = $4,
            id_categoria = $5,
            id_editorial = $6
         WHERE id_libro = $7
         RETURNING *`,
        [
            isbn,
            titulo,
            anio_publicacion,
            id_autor,
            id_categoria,
            id_editorial,
            id
        ]
    );

    return resultado.rows[0];
};

const eliminar = async (id) => {

    const resultado = await pool.query(
        `DELETE FROM libros
         WHERE id_libro = $1
         RETURNING *`,
        [id]
    );

    return resultado.rows[0];
};

const obtenerDisponibilidad = async () => {

    const resultado = await pool.query(
        `SELECT
            libros.id_libro,
            libros.titulo,

            (autores.nombre || ' ' || autores.apellido) AS autor,

            categorias.nombre AS categoria,

            COUNT(
                CASE
                    WHEN ejemplares.estado = 'Disponible'
                    THEN ejemplares.id_ejemplar
                END
            ) AS ejemplares_disponibles,

            COUNT(
                ejemplares.id_ejemplar
            ) AS ejemplares_totales

         FROM libros

         JOIN autores
            ON libros.id_autor =
               autores.id_autor

         JOIN categorias
            ON libros.id_categoria =
               categorias.id_categoria

         LEFT JOIN ejemplares
            ON libros.id_libro =
               ejemplares.id_libro

         GROUP BY
            libros.id_libro,
            libros.titulo,
            autores.nombre,
            autores.apellido,
            categorias.nombre

         ORDER BY
            libros.titulo`
    );

    return resultado.rows;
};

const obtenerPaginado = async (termino, pagina = 1, porPagina = 10) => {

    const offset = (pagina - 1) * porPagina;

    const valores = [];
    let where = '';

    if (termino) {

        valores.push(patronBusqueda(termino));

        where = `
            WHERE
                sin_tildes(COALESCE((libros.titulo)::text, '') || ' ' || COALESCE((libros.isbn)::text, '') || ' ' || COALESCE(((autores.nombre || ' ' || autores.apellido))::text, '') || ' ' || COALESCE((categorias.nombre)::text, '')) LIKE ALL (SELECT sin_tildes(p) FROM unnest($1::text[]) AS p)
        `;
    }

    const parametroLimite = valores.length + 1;
    const parametroOffset = valores.length + 2;

    valores.push(porPagina);
    valores.push(offset);

    const resultado = await pool.query(`
        SELECT
            libros.id_libro,
            libros.isbn,
            libros.titulo,
            libros.anio_publicacion,
            (autores.nombre || ' ' || autores.apellido) AS autor,
            categorias.nombre AS categoria,
            editoriales.nombre AS editorial
        FROM libros
        JOIN autores
            ON libros.id_autor = autores.id_autor
        JOIN categorias
            ON libros.id_categoria = categorias.id_categoria
        JOIN editoriales
            ON libros.id_editorial = editoriales.id_editorial

        ${where}

        ORDER BY libros.titulo

        LIMIT $${parametroLimite}
        OFFSET $${parametroOffset}
    `, valores);

    return resultado.rows;
};

const contarLibros = async (termino) => {

    const valores = [];
    let where = '';

    if (termino) {

        valores.push(patronBusqueda(termino));

        where = `
            WHERE
                sin_tildes(COALESCE((libros.titulo)::text, '') || ' ' || COALESCE((libros.isbn)::text, '') || ' ' || COALESCE(((autores.nombre || ' ' || autores.apellido))::text, '') || ' ' || COALESCE((categorias.nombre)::text, '')) LIKE ALL (SELECT sin_tildes(p) FROM unnest($1::text[]) AS p)
        `;
    }

    const resultado = await pool.query(`
        SELECT COUNT(*) AS total
        FROM libros
        JOIN autores
            ON libros.id_autor = autores.id_autor
        JOIN categorias
            ON libros.id_categoria = categorias.id_categoria
        ${where}
    `, valores);

    return Number(resultado.rows[0].total);
};

const obtenerDetalle = async (id) => {

    const resultado = await pool.query(
        `SELECT
            libros.id_libro,
            libros.isbn,
            libros.titulo,
            libros.anio_publicacion,
            (autores.nombre || ' ' || autores.apellido) AS autor,
            categorias.nombre AS categoria,
            editoriales.nombre AS editorial
         FROM libros
         JOIN autores
            ON libros.id_autor = autores.id_autor
         JOIN categorias
            ON libros.id_categoria = categorias.id_categoria
         JOIN editoriales
            ON libros.id_editorial = editoriales.id_editorial
         WHERE libros.id_libro = $1`,
        [id]
    );

    return resultado.rows[0];
};

const obtenerEjemplaresDeLibro = async (idLibro) => {

    const resultado = await pool.query(
        `SELECT
            id_ejemplar,
            codigo_inventario,
            estado
         FROM ejemplares
         WHERE id_libro = $1
         ORDER BY codigo_inventario`,
        [idLibro]
    );

    return resultado.rows;
};

module.exports = {
    obtenerDetalle,
    obtenerEjemplaresDeLibro,
    obtenerTodos,
    obtenerPorId,
    crear,
    obtenerAutores,
    obtenerCategorias,
    obtenerEditoriales,
    actualizar,
    eliminar,
    obtenerDisponibilidad,
    obtenerPaginado,
    contarLibros
}