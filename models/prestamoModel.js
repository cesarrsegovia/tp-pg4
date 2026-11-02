const pool = require('../config/database');
const { ErrorNegocio, esIdValido } = require('../utils/errores');
const { FECHA_MINIMA, esFechaValida } = require('../utils/fechas');

const MAX_PRESTAMOS_ACTIVOS = 3;
const MAX_EJEMPLARES_POR_PRESTAMO = 3;
const MULTA_POR_DIA = 500;

const ESTADOS_DEVOLUCION = ['Disponible', 'Dañado', 'En mantenimiento'];

// Si PostgreSQL abortó la transacción por un bloqueo cruzado (deadlock) o un fallo de
// serialización, el usuario recibe un mensaje claro y puede reintentar.
const traducirConflictoDeConcurrencia = (error) =>
    error.code === '40P01' || error.code === '40001'
        ? new ErrorNegocio('Otro usuario está operando sobre los mismos datos. Intentá nuevamente.')
        : error;

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

// fechaPrestamo (AAAA-MM-DD) es opcional: sin ella se usa el día de hoy.
const crearPrestamo = async (
    id_socio,
    ejemplaresSolicitados,
    fechaPrestamo = null
) => {

    if (!esIdValido(id_socio)) {
        throw new ErrorNegocio('El socio seleccionado no es válido');
    }

    if (fechaPrestamo !== null && !esFechaValida(fechaPrestamo)) {
        throw new ErrorNegocio('La fecha de préstamo no es válida', { reintentable: true });
    }

    if (!ejemplaresSolicitados.every(esIdValido)) {
        throw new ErrorNegocio('El ejemplar seleccionado no es válido');
    }

    // Se comparan como números ("7" y "07" son el mismo ejemplar) y se bloquean siempre
    // en el mismo orden: así dos préstamos simultáneos con los mismos ejemplares
    // elegidos en distinto orden no pueden quedar bloqueados entre sí (deadlock).
    const ejemplares = ejemplaresSolicitados
        .map(Number)
        .sort((a, b) => a - b);

    if (new Set(ejemplares).size !== ejemplares.length) {
        throw new ErrorNegocio(
            'No puede seleccionar el mismo ejemplar más de una vez'
        );
    }

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

            throw new ErrorNegocio(
                'El socio no existe'
            );
        }
        const socio = resultadoSocio.rows[0];

        if (socio.estado !== 'Activo') {

            throw new ErrorNegocio(
                'El socio no está activo'
            );
        }

        // La comparación se hace en la base, con su misma noción de "hoy".
        const resultadoFecha = await client.query(
            `SELECT
                COALESCE($1::date, CURRENT_DATE) > CURRENT_DATE AS en_futuro,
                COALESCE($1::date, CURRENT_DATE) < $2::date AS demasiado_antigua`,
            [fechaPrestamo, FECHA_MINIMA]
        );

        if (resultadoFecha.rows[0].en_futuro) {
            throw new ErrorNegocio(
                'La fecha de préstamo no puede ser posterior a hoy',
                { reintentable: true }
            );
        }

        if (resultadoFecha.rows[0].demasiado_antigua) {
            throw new ErrorNegocio(
                'La fecha de préstamo no puede ser anterior al 01/01/2000',
                { reintentable: true }
            );
        }


        //verificar limite de ejemplares por préstamo
        if (ejemplares.length === 0) {

            throw new ErrorNegocio(
                'Debe seleccionar al menos un ejemplar'
            );
        }

        if (ejemplares.length > MAX_EJEMPLARES_POR_PRESTAMO) {

            throw new ErrorNegocio(
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

            throw new ErrorNegocio(
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

                throw new ErrorNegocio(
                    'Uno de los ejemplares no existe'
                );
            }

            const ejemplar =
                resultadoEjemplar.rows[0];

            if (ejemplar.estado !== 'Disponible') {

                throw new ErrorNegocio(
                    'Uno de los ejemplares no está disponible'
                );
            }

            // Línea de tiempo coherente: un ejemplar no puede prestarse con una fecha
            // anterior a la de su última devolución.
            const resultadoUltima = await client.query(
                `SELECT
                    TO_CHAR(MAX(prestamos.fecha_devolucion), 'DD/MM/YYYY') AS ultima,
                    MAX(prestamos.fecha_devolucion) >
                        COALESCE($2::date, CURRENT_DATE) AS posterior
                 FROM detalle_prestamo
                 JOIN prestamos
                    ON detalle_prestamo.id_prestamo = prestamos.id_prestamo
                 WHERE detalle_prestamo.id_ejemplar = $1`,
                [idEjemplar, fechaPrestamo]
            );

            if (resultadoUltima.rows[0].posterior) {
                throw new ErrorNegocio(
                    `El ejemplar fue devuelto el ${resultadoUltima.rows[0].ultima}: ` +
                    'la fecha de préstamo no puede ser anterior',
                    { reintentable: true }
                );
            }
        };

        //3-crear prestamo (con fecha manual o la de hoy; vence 7 días después)
        const resultadoPrestamo = await client.query(
            `INSERT INTO prestamos (
                id_socio,
                fecha_prestamo,
                fecha_vencimiento,
                estado
            )
            VALUES (
                $1,
                COALESCE($2::date, CURRENT_DATE),
                COALESCE($2::date, CURRENT_DATE) + 7,
                CASE
                    WHEN COALESCE($2::date, CURRENT_DATE) + 7 < CURRENT_DATE
                    THEN 'Vencido'
                    ELSE 'Activo'
                END
            )
            RETURNING *`,
            [id_socio, fechaPrestamo]
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

                    throw new ErrorNegocio(
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

        throw traducirConflictoDeConcurrencia(error);

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
            TO_CHAR(prestamos.fecha_prestamo, 'YYYY-MM-DD') AS fecha_prestamo_iso,
            prestamos.fecha_vencimiento,
            TO_CHAR(prestamos.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento_iso,
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

// "Hoy" según la base (AAAA-MM-DD): tope de las fechas de los formularios.
const obtenerFechaActual = async () => {

    const resultado = await pool.query(
        `SELECT TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') AS hoy`
    );

    return resultado.rows[0].hoy;
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
// fechaDevolucion (AAAA-MM-DD) es opcional: sin ella se usa el día de hoy. Debe estar
// entre la fecha de préstamo y hoy; los días de atraso y la multa se calculan con ella.
const devolverPrestamo = async (idPrestamo, estadosEjemplares = {}, fechaDevolucion = null) => {

    if (fechaDevolucion !== null && !esFechaValida(fechaDevolucion)) {
        throw new ErrorNegocio('La fecha de devolución no es válida', { reintentable: true });
    }

    // Un estado que no sea Disponible, Dañado o En mantenimiento no se reemplaza en
    // silencio por Disponible: se rechaza la devolución para que el usuario lo corrija.
    // (Un valor vacío significa "no indicado" y el ejemplar vuelve Disponible.)
    const estadoInvalido = Object.values(estadosEjemplares).some(
        (estado) => estado !== '' && !ESTADOS_DEVOLUCION.includes(estado)
    );

    if (estadoInvalido) {
        throw new ErrorNegocio(
            'El estado indicado para un ejemplar no es válido (Disponible, Dañado o En mantenimiento)'
        );
    }

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
                    COALESCE($2::date, CURRENT_DATE) AS fecha_devolucion,
                    COALESCE($2::date, CURRENT_DATE) > CURRENT_DATE AS en_futuro,
                    COALESCE($2::date, CURRENT_DATE) < fecha_prestamo AS antes_del_prestamo,
                    TO_CHAR(fecha_prestamo, 'DD/MM/YYYY') AS fecha_prestamo_texto,
                    GREATEST(
                        COALESCE($2::date, CURRENT_DATE) - fecha_vencimiento,
                        0
                    ) AS dias_atraso
                 FROM prestamos
                 WHERE id_prestamo = $1
                 FOR UPDATE`,
                [idPrestamo, fechaDevolucion]
            );

        if (resultadoPrestamo.rows.length === 0) {
            throw new ErrorNegocio('El préstamo no existe');
        }

        const prestamo = resultadoPrestamo.rows[0];

        // 2. Impedir una segunda devolución
        if (prestamo.estado !== 'Activo' && prestamo.estado !== 'Vencido') {
            throw new ErrorNegocio('El préstamo ya fue devuelto');
        }

        if (prestamo.en_futuro) {
            throw new ErrorNegocio(
                'La fecha de devolución no puede ser posterior a hoy',
                { reintentable: true }
            );
        }

        if (prestamo.antes_del_prestamo) {
            throw new ErrorNegocio(
                `La fecha de devolución no puede ser anterior a la fecha de préstamo (${prestamo.fecha_prestamo_texto})`,
                { reintentable: true }
            );
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
                fecha_devolucion = COALESCE($2::date, CURRENT_DATE),
                estado = 'Devuelto'
             WHERE id_prestamo = $1`,
            [idPrestamo, fechaDevolucion]
        );

        await client.query('COMMIT');

        return {
            fechaDevolucion: prestamo.fecha_devolucion,
            fechaVencimiento: prestamo.fecha_vencimiento,
            diasAtraso,
            totalMulta,
            ejemplares: ejemplaresDevueltos
        };

    } catch (error) {

        await client.query('ROLLBACK');

        throw traducirConflictoDeConcurrencia(error);

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
            detalle_prestamo.multa,

            GREATEST(
                CURRENT_DATE - prestamos.fecha_vencimiento,
                0
            ) AS dias_vencido

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
            COALESCE(
                JSON_AGG(
                    JSON_BUILD_OBJECT(
                        'codigo', ejemplares.codigo_inventario,
                        'titulo', libros.titulo,
                        'autor', autores.nombre || ' ' || autores.apellido,
                        'categoria', categorias.nombre
                    )
                    ORDER BY detalle_prestamo.id_detalle
                ) FILTER (WHERE detalle_prestamo.id_detalle IS NOT NULL),
                '[]'::json
            ) AS items

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

        LEFT JOIN categorias
            ON libros.id_categoria = categorias.id_categoria
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
    MAX_EJEMPLARES_POR_PRESTAMO,
    MULTA_POR_DIA,
    FECHA_MINIMA,
    obtenerFechaActual,
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