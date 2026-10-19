const pool = require('../config/database');

const MAX_PRESTAMOS_ACTIVOS = 3;
const MAX_EJEMPLARES_POR_PRESTAMO = 3;
const MULTA_POR_DIA = 500;

const ESTADOS_DEVOLUCION = ['Disponible', 'Dañado', 'En mantenimiento'];

const obtenerSociosActivos = async () => {
    const resultado = await pool.query(
        `SELECT
            id_socio,
            nombre,
            apellido,
            dni
        FROM socios
        WHERE estado = 'Activo'
        ORDER BY apellido, nombre`
    );
    return resultado.rows;
};

const obtenerEjemplaresDisponibles = async () => {
    const resultado = await pool.query(
        `SELECT
            ejemplares.id_ejemplar,
            ejemplares.codigo_inventario,
            libros.titulo
        FROM ejemplares
        JOIN libros
            ON ejemplares.id_libro = libros.id_libro
        WHERE ejemplares.estado = 'Disponible'
        ORDER BY libros.titulo,
                ejemplares.codigo_inventario`
    );
    return resultado.rows;
};

const crearPrestamo = async (
    id_socio,
    ejemplares
) => {

    const client = await pool.connect();

    try {

        await client.query('BEGIN');

        //1-verificar socio
        const resultadoSocio = await client.query(
            `SELECT
                id_socio,
                estado
            FROM socios
            WHERE id_socio = $1
            FOR UPDATE`,
            [id_socio]
        );
        if (resultadoSocio.rows.length === 0) {

            throw new Error(
                'El socio no existe'
            );
        }
        const socio = resultadoSocio.rows[0];

        if (socio.estado !== 'Activo') {

            throw new Error(
                'El socio no está activo'
            );
        }


        //verificar limite de ejemplares por préstamo
        if (ejemplares.length === 0) {

            throw new Error(
                'Debe seleccionar al menos un ejemplar'
            );
        }

        if (ejemplares.length > MAX_EJEMPLARES_POR_PRESTAMO) {

            throw new Error(
                'Un préstamo no puede tener más de 3 ejemplares'
            );
        }

        //verificar limite de préstamos activos del socio
        //(un préstamo vencido sigue abierto, por eso también cuenta)
        const resultadoPrestamosActivos =
            await client.query(
                `SELECT COUNT(*) AS cantidad
                FROM prestamos
                WHERE id_socio = $1
                AND estado IN ('Activo', 'Vencido')`,
                [id_socio]
            );

        const prestamosAbiertos =
            Number(resultadoPrestamosActivos.rows[0].cantidad);

        if (prestamosAbiertos >= MAX_PRESTAMOS_ACTIVOS) {

            throw new Error(
                'El socio ya tiene 3 préstamos activos y no puede registrar otro'
            );
        }

        //2-verificar ejemplares
        for (const idEjemplar of ejemplares) {

            const resultadoEjemplar =
                await client.query(
                    `SELECT
                        id_ejemplar,
                        estado
                    FROM ejemplares
                    WHERE id_ejemplar = $1
                    FOR UPDATE`,
                    [idEjemplar]
                );

            if (
                resultadoEjemplar.rows.length === 0
            ) {

                throw new Error(
                    'Uno de los ejemplares no existe'
                );
            }

            const ejemplar =
                resultadoEjemplar.rows[0];

            if (ejemplar.estado !== 'Disponible') {

                throw new Error(
                    'Uno de los ejemplares no está disponible'
                );
            }
        };

        //3-crear prestamo
        const resultadoPrestamo = await client.query(
            `INSERT INTO prestamos (
                id_socio,
                fecha_prestamo,
                fecha_vencimiento,
                estado
            )
            VALUES (
                $1,
                CURRENT_DATE,
                CURRENT_DATE + 7,
                'Activo'
            )
            RETURNING *`,
            [id_socio]
        );

        const prestamo = resultadoPrestamo.rows[0];

        //4-crear detalles
        for (const idEjemplar of ejemplares) {

            try {

                await client.query(
                    `INSERT INTO detalle_prestamo (
                        id_prestamo,
                        id_ejemplar
                    )
                    VALUES ($1, $2)`,
                    [
                        prestamo.id_prestamo,
                        idEjemplar
                    ]
                );

            } catch (error) {

                if (error.code === '23505') {

                    throw new Error(
                        'Uno de los ejemplares ya está incluido en un préstamo activo'
                    );
                }

                throw error;
            }
        }

        //5-cambiar estado del ejemplar
        for (const idEjemplar of ejemplares) {

            await client.query(
                `UPDATE ejemplares
                    SET estado = 'Prestado'
                    WHERE id_ejemplar = $1`,
                [idEjemplar]
            );
        }

        //6-confirmar transaccion
        await client.query('COMMIT');

        return prestamo;

    } catch (error) {

        await client.query('ROLLBACK');

        throw error;

    } finally {

        client.release();
    }
};

const obtenerTodos = async () => {

    const resultado = await pool.query(
        `SELECT
            prestamos.id_prestamo,
            prestamos.fecha_prestamo,
            prestamos.fecha_vencimiento,
            prestamos.fecha_devolucion,
            prestamos.estado,
            socios.nombre,
            socios.apellido,
            socios.dni,
            COUNT(detalle_prestamo.id_detalle)
                AS cantidad_ejemplares
         FROM prestamos
         JOIN socios
            ON prestamos.id_socio =
               socios.id_socio
         LEFT JOIN detalle_prestamo
            ON prestamos.id_prestamo =
               detalle_prestamo.id_prestamo
         GROUP BY
            prestamos.id_prestamo,
            socios.id_socio
         ORDER BY
            prestamos.fecha_prestamo DESC`
    );

    return resultado.rows;
};

const obtenerPorId = async (id) => {

    const resultado = await pool.query(
        `SELECT
            prestamos.id_prestamo,
            prestamos.id_socio,
            prestamos.fecha_prestamo,
            prestamos.fecha_vencimiento,
            prestamos.fecha_devolucion,
            prestamos.estado,
            socios.nombre,
            socios.apellido,
            socios.dni
         FROM prestamos
         JOIN socios
            ON prestamos.id_socio =
               socios.id_socio
         WHERE prestamos.id_prestamo = $1`,
        [id]
    );

    return resultado.rows[0];
};

const obtenerDetalles = async (idPrestamo) => {

    const resultado = await pool.query(
        `SELECT
            detalle_prestamo.id_detalle,
            detalle_prestamo.id_ejemplar,
            detalle_prestamo.dias_atraso,
            detalle_prestamo.multa,
            ejemplares.codigo_inventario,
            ejemplares.estado,
            libros.titulo
         FROM detalle_prestamo
         JOIN ejemplares
            ON detalle_prestamo.id_ejemplar =
               ejemplares.id_ejemplar
         JOIN libros
            ON ejemplares.id_libro =
               libros.id_libro
         WHERE detalle_prestamo.id_prestamo = $1
         ORDER BY detalle_prestamo.id_detalle`,
        [idPrestamo]
    );

    return resultado.rows;
};

// estadosEjemplares: { [id_ejemplar]: 'Disponible' | 'Dañado' | 'En mantenimiento' }
const devolverPrestamo = async (idPrestamo, estadosEjemplares = {}) => {

    const client = await pool.connect();

    try {

        await client.query('BEGIN');

        // 1. Obtener y bloquear el préstamo
        const resultadoPrestamo =
            await client.query(
                `SELECT
                    id_prestamo,
                    fecha_vencimiento,
                    estado,
                    CURRENT_DATE AS hoy,
                    GREATEST(
                        CURRENT_DATE - fecha_vencimiento,
                        0
                    ) AS dias_atraso
                 FROM prestamos
                 WHERE id_prestamo = $1
                 FOR UPDATE`,
                [idPrestamo]
            );

        if (resultadoPrestamo.rows.length === 0) {
            throw new Error('El préstamo no existe');
        }

        const prestamo = resultadoPrestamo.rows[0];

        // 2. Impedir una segunda devolución
        if (prestamo.estado !== 'Activo' && prestamo.estado !== 'Vencido') {
            throw new Error('El préstamo ya fue devuelto');
        }

        // 3. Obtener detalles
        const resultadoDetalles =
            await client.query(
                `SELECT
                    detalle_prestamo.id_detalle,
                    detalle_prestamo.id_ejemplar,
                    ejemplares.codigo_inventario,
                    libros.titulo
                 FROM detalle_prestamo
                 JOIN ejemplares
                    ON detalle_prestamo.id_ejemplar = ejemplares.id_ejemplar
                 JOIN libros
                    ON ejemplares.id_libro = libros.id_libro
                 WHERE detalle_prestamo.id_prestamo = $1
                 ORDER BY detalle_prestamo.id_detalle
                 FOR UPDATE OF detalle_prestamo`,
                [idPrestamo]
            );

        const diasAtraso = Number(prestamo.dias_atraso);
        const multaPorEjemplar = diasAtraso * MULTA_POR_DIA;

        const ejemplaresDevueltos = [];
        let totalMulta = 0;

        for (const detalle of resultadoDetalles.rows) {

            // 4. Estado final del ejemplar (por defecto vuelve Disponible)
            const solicitado = estadosEjemplares[detalle.id_ejemplar];

            const estadoFinal =
                ESTADOS_DEVOLUCION.includes(solicitado)
                    ? solicitado
                    : 'Disponible';

            // 5. Días de atraso y multa del detalle; el detalle deja de estar activo
            await client.query(
                `UPDATE detalle_prestamo
                 SET
                    dias_atraso = $1,
                    multa = $2,
                    prestamo_activo = FALSE
                 WHERE id_detalle = $3`,
                [diasAtraso, multaPorEjemplar, detalle.id_detalle]
            );

            // 6. Actualizar el ejemplar
            await client.query(
                `UPDATE ejemplares
                 SET estado = $1
                 WHERE id_ejemplar = $2`,
                [estadoFinal, detalle.id_ejemplar]
            );

            totalMulta += multaPorEjemplar;

            ejemplaresDevueltos.push({
                codigo_inventario: detalle.codigo_inventario,
                titulo: detalle.titulo,
                estado_final: estadoFinal,
                dias_atraso: diasAtraso,
                multa: multaPorEjemplar
            });
        }

        // 7. Cerrar el préstamo
        await client.query(
            `UPDATE prestamos
             SET
                fecha_devolucion = CURRENT_DATE,
                estado = 'Devuelto'
             WHERE id_prestamo = $1`,
            [idPrestamo]
        );

        await client.query('COMMIT');

        return {
            fechaDevolucion: prestamo.hoy,
            fechaVencimiento: prestamo.fecha_vencimiento,
            diasAtraso,
            totalMulta,
            ejemplares: ejemplaresDevueltos
        };

    } catch (error) {

        await client.query('ROLLBACK');

        throw error;

    } finally {

        client.release();
    }
};

const obtenerDetalleCompleto = async (id) => {

    const resultado = await pool.query(
        `SELECT
            prestamos.id_prestamo,
            prestamos.fecha_prestamo,
            prestamos.fecha_vencimiento,
            prestamos.fecha_devolucion,
            prestamos.estado,

            socios.nombre AS socio_nombre,
            socios.apellido AS socio_apellido,
            socios.dni,

            ejemplares.id_ejemplar,
            ejemplares.codigo_inventario,

            libros.titulo,
            (autores.nombre || ' ' || autores.apellido) AS autor,
            categorias.nombre AS categoria,

            detalle_prestamo.dias_atraso,
            detalle_prestamo.multa

         FROM prestamos

         JOIN socios
            ON prestamos.id_socio =
               socios.id_socio

         JOIN detalle_prestamo
            ON prestamos.id_prestamo =
               detalle_prestamo.id_prestamo

         JOIN ejemplares
            ON detalle_prestamo.id_ejemplar =
               ejemplares.id_ejemplar

         JOIN libros
            ON ejemplares.id_libro =
               libros.id_libro

         JOIN autores
            ON libros.id_autor =
               autores.id_autor

         JOIN categorias
            ON libros.id_categoria =
               categorias.id_categoria

         WHERE prestamos.id_prestamo = $1

         ORDER BY
            detalle_prestamo.id_detalle`,
        [id]
    );

    return resultado.rows;
};

const obtenerActivos = async () => {

    const resultado = await pool.query(
        `SELECT
            prestamos.id_prestamo,
            prestamos.fecha_prestamo,
            prestamos.fecha_vencimiento,

            socios.nombre,
            socios.apellido,
            socios.dni

         FROM prestamos

         JOIN socios
            ON prestamos.id_socio =
               socios.id_socio

         WHERE prestamos.estado = 'Activo'

         ORDER BY
            prestamos.fecha_vencimiento`
    );

    return resultado.rows;
};

const obtenerVencidos = async () => {

    const resultado = await pool.query(
        `SELECT
            prestamos.id_prestamo,
            prestamos.fecha_prestamo,
            prestamos.fecha_vencimiento,

            socios.nombre,
            socios.apellido,
            socios.dni

         FROM prestamos

         JOIN socios
            ON prestamos.id_socio =
               socios.id_socio

         WHERE prestamos.estado = 'Activo'
           AND prestamos.fecha_vencimiento < CURRENT_DATE

         ORDER BY
            prestamos.fecha_vencimiento`
    );

    return resultado.rows;
};

const actualizarVencidos = async () => {

    await pool.query(
        `UPDATE prestamos
         SET estado = 'Vencido'
         WHERE estado = 'Activo'
           AND fecha_vencimiento < CURRENT_DATE`
    );
};

const obtenerHistorialSocio = async (idSocio) => {

    const resultado = await pool.query(
        `SELECT
            prestamos.id_prestamo,
            prestamos.fecha_prestamo,
            prestamos.fecha_vencimiento,
            prestamos.fecha_devolucion,
            prestamos.estado,

            ejemplares.codigo_inventario,

            libros.titulo,
            (autores.nombre || ' ' || autores.apellido) AS autor,
            categorias.nombre AS categoria,

            detalle_prestamo.dias_atraso,
            detalle_prestamo.multa

         FROM prestamos

         JOIN detalle_prestamo
            ON prestamos.id_prestamo =
               detalle_prestamo.id_prestamo

         JOIN ejemplares
            ON detalle_prestamo.id_ejemplar =
               ejemplares.id_ejemplar

         JOIN libros
            ON ejemplares.id_libro =
               libros.id_libro

         JOIN autores
            ON libros.id_autor =
               autores.id_autor

         JOIN categorias
            ON libros.id_categoria =
               categorias.id_categoria

         WHERE prestamos.id_socio = $1

         ORDER BY
            prestamos.fecha_prestamo DESC,
            prestamos.id_prestamo DESC`,
        [idSocio]
    );

    return resultado.rows;
};

const obtenerHistorialEjemplar = async (idEjemplar) => {

    const resultado = await pool.query(
        `SELECT
            prestamos.id_prestamo,
            prestamos.fecha_prestamo,
            prestamos.fecha_vencimiento,
            prestamos.fecha_devolucion,
            prestamos.estado,

            socios.nombre,
            socios.apellido,
            socios.dni,

            ejemplares.codigo_inventario,

            libros.titulo,
            (autores.nombre || ' ' || autores.apellido) AS autor,
            categorias.nombre AS categoria,

            detalle_prestamo.dias_atraso,
            detalle_prestamo.multa

         FROM detalle_prestamo

         JOIN prestamos
            ON detalle_prestamo.id_prestamo =
               prestamos.id_prestamo

         JOIN socios
            ON prestamos.id_socio =
               socios.id_socio

         JOIN ejemplares
            ON detalle_prestamo.id_ejemplar =
               ejemplares.id_ejemplar

         JOIN libros
            ON ejemplares.id_libro =
               libros.id_libro

         JOIN autores
            ON libros.id_autor =
               autores.id_autor

         JOIN categorias
            ON libros.id_categoria =
               categorias.id_categoria

         WHERE detalle_prestamo.id_ejemplar = $1

         ORDER BY
            prestamos.fecha_prestamo DESC,
            prestamos.id_prestamo DESC`,
        [idEjemplar]
    );

    return resultado.rows;
};

const obtenerDisponibilidadLibros = async () => {

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

const obtenerPorEstado = async (estado) => {

    const resultado = await pool.query(
        `SELECT
            prestamos.id_prestamo,
            prestamos.fecha_prestamo,
            prestamos.fecha_vencimiento,
            prestamos.fecha_devolucion,
            prestamos.estado,

            socios.nombre,
            socios.apellido,
            socios.dni,

            COUNT(
                detalle_prestamo.id_detalle
            ) AS cantidad_ejemplares

         FROM prestamos

         JOIN socios
            ON prestamos.id_socio =
               socios.id_socio

         LEFT JOIN detalle_prestamo
            ON prestamos.id_prestamo =
               detalle_prestamo.id_prestamo

         WHERE prestamos.estado = $1

         GROUP BY
            prestamos.id_prestamo,
            socios.id_socio

         ORDER BY
            prestamos.fecha_prestamo DESC`,
        [estado]
    );

    return resultado.rows;
};

const obtenerConFiltros = async ({
    estado,
    idSocio,
    fechaDesde,
    fechaHasta,
    pagina = 1,
    porPagina = 10
}) => {

    const { condiciones, valores } = construirFiltros({
        estado,
        idSocio,
        fechaDesde,
        fechaHasta
    });

    let sql = `
        SELECT
            prestamos.id_prestamo,
            prestamos.fecha_prestamo,
            prestamos.fecha_vencimiento,
            prestamos.fecha_devolucion,
            prestamos.estado,
            socios.nombre,
            socios.apellido,
            socios.dni,
            COUNT(detalle_prestamo.id_detalle) AS cantidad_ejemplares,
            STRING_AGG(
                libros.titulo || ' (' || autores.nombre || ' ' || autores.apellido || ')',
                ', '
                ORDER BY detalle_prestamo.id_detalle
            ) AS libros

        FROM prestamos

        JOIN socios
            ON prestamos.id_socio = socios.id_socio

        LEFT JOIN detalle_prestamo
            ON prestamos.id_prestamo = detalle_prestamo.id_prestamo

        LEFT JOIN ejemplares
            ON detalle_prestamo.id_ejemplar = ejemplares.id_ejemplar

        LEFT JOIN libros
            ON ejemplares.id_libro = libros.id_libro

        LEFT JOIN autores
            ON libros.id_autor = autores.id_autor
    `;

    if (condiciones.length > 0) {
        sql += `
            WHERE ${condiciones.join(' AND ')}
        `;
    }

    const offset = (pagina - 1) * porPagina;

    const parametroLimit = valores.length + 1;
    const parametroOffset = valores.length + 2;

    valores.push(porPagina);
    valores.push(offset);

    sql += `
        GROUP BY prestamos.id_prestamo, socios.id_socio

        ORDER BY prestamos.fecha_prestamo DESC

        LIMIT $${parametroLimit}
        OFFSET $${parametroOffset}
    `;

    const resultado = await pool.query(sql, valores);

    return resultado.rows;
};

const obtenerTodosLosSocios = async () => {

    const resultado = await pool.query(`
        SELECT
            id_socio,
            nombre,
            apellido,
            dni
        FROM socios
        ORDER BY apellido, nombre
    `);

    return resultado.rows;
};

const obtenerResumen = async () => {

    const resultado = await pool.query(`
        SELECT

            (SELECT COUNT(*)
             FROM socios
             WHERE estado = 'Activo') AS socios_activos,

            (SELECT COUNT(*)
             FROM libros) AS libros,

            (SELECT COUNT(*)
             FROM ejemplares
             WHERE estado = 'Disponible') AS ejemplares_disponibles,

            (SELECT COUNT(*)
             FROM prestamos
             WHERE estado = 'Activo') AS prestamos_activos,

            (SELECT COUNT(*)
             FROM prestamos
             WHERE estado = 'Vencido') AS prestamos_vencidos
    `);

    return resultado.rows[0];
};

const obtenerPrestamosVencidos = async () => {

    const resultado = await pool.query(`
        SELECT
            prestamos.id_prestamo,
            prestamos.fecha_prestamo,
            prestamos.fecha_vencimiento,
            socios.nombre,
            socios.apellido,
            socios.dni
        FROM prestamos
        JOIN socios
            ON prestamos.id_socio = socios.id_socio
        WHERE prestamos.estado = 'Vencido'
        ORDER BY prestamos.fecha_vencimiento ASC
    `);

    return resultado.rows;
};

const construirFiltros = ({
    estado,
    idSocio,
    fechaDesde,
    fechaHasta
}) => {

    const condiciones = [];
    const valores = [];

    if (estado) {
        valores.push(estado);
        condiciones.push(
            `prestamos.estado = $${valores.length}`
        );
    }

    if (idSocio) {
        valores.push(idSocio);
        condiciones.push(
            `prestamos.id_socio = $${valores.length}`
        );
    }

    if (fechaDesde) {
        valores.push(fechaDesde);
        condiciones.push(
            `prestamos.fecha_prestamo >= $${valores.length}`
        );
    }

    if (fechaHasta) {
        valores.push(fechaHasta);
        condiciones.push(
            `prestamos.fecha_prestamo <= $${valores.length}`
        );
    }

    return {
        condiciones,
        valores
    };
};

const contarConFiltros = async ({
    estado,
    idSocio,
    fechaDesde,
    fechaHasta
}) => {

    const { condiciones, valores } = construirFiltros({
        estado,
        idSocio,
        fechaDesde,
        fechaHasta
    });

    let sql = `
        SELECT COUNT(*) AS total
        FROM prestamos
    `;

    if (condiciones.length > 0) {
        sql += `
            WHERE ${condiciones.join(' AND ')}
        `;
    }

    const resultado = await pool.query(sql, valores);

    return Number(resultado.rows[0].total);
};

module.exports = {
    obtenerSociosActivos,
    obtenerEjemplaresDisponibles,
    crearPrestamo,
    obtenerTodos,
    obtenerPorId,
    obtenerDetalles,
    devolverPrestamo,
    obtenerDetalleCompleto,
    obtenerActivos,
    obtenerVencidos,
    actualizarVencidos,
    obtenerHistorialSocio,
    obtenerHistorialEjemplar,
    obtenerDisponibilidadLibros,
    obtenerPorEstado,
    obtenerConFiltros,
    obtenerTodosLosSocios,
    obtenerResumen,
    obtenerPrestamosVencidos,
    construirFiltros,
    contarConFiltros
}