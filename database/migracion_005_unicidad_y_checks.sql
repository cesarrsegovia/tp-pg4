-- Migración 005: refuerza unicidad y valores válidos en la base de datos.
--  * ISBN único aunque se escriba con otra capitalización, con guiones o con espacios.
--  * Código de inventario único sin distinguir mayúsculas.
--  * Días de atraso y multa nunca negativos.
--  * Año de publicación no menor a 1000 (el máximo ya estaba controlado).
-- Si hay datos que violan una regla, esa regla NO se aplica y se avisa: hay que corregir los
-- registros indicados y volver a ejecutar este script. Es idempotente.

DO $$
BEGIN
    -- ISBN normalizado (sin guiones ni espacios, en mayúsculas)
    IF EXISTS (
        SELECT 1 FROM libros
        GROUP BY upper(replace(replace(isbn, '-', ''), ' ', ''))
        HAVING COUNT(*) > 1
    ) THEN
        RAISE NOTICE 'Hay libros con el mismo ISBN escrito distinto: no se creó libros_isbn_normalizado_key.';
    ELSE
        CREATE UNIQUE INDEX IF NOT EXISTS libros_isbn_normalizado_key
            ON libros (upper(replace(replace(isbn, '-', ''), ' ', '')));
    END IF;

    -- Código de inventario sin distinguir mayúsculas
    IF EXISTS (
        SELECT 1 FROM ejemplares GROUP BY lower(codigo_inventario) HAVING COUNT(*) > 1
    ) THEN
        RAISE NOTICE 'Hay ejemplares con el mismo código en distinta capitalización: no se creó ejemplares_codigo_lower_key.';
    ELSE
        CREATE UNIQUE INDEX IF NOT EXISTS ejemplares_codigo_lower_key
            ON ejemplares (lower(codigo_inventario));
    END IF;

    -- Atraso y multa no negativos
    IF EXISTS (
        SELECT 1 FROM detalle_prestamo WHERE dias_atraso < 0 OR multa < 0
    ) THEN
        RAISE NOTICE 'Hay detalles con atraso o multa negativos: no se creó detalle_prestamo_valores_check.';
    ELSIF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'detalle_prestamo_valores_check'
    ) THEN
        ALTER TABLE detalle_prestamo
            ADD CONSTRAINT detalle_prestamo_valores_check
            CHECK (COALESCE(dias_atraso, 0) >= 0 AND COALESCE(multa, 0) >= 0);
    END IF;

    -- Año de publicación mínimo
    IF EXISTS (SELECT 1 FROM libros WHERE anio_publicacion < 1000) THEN
        RAISE NOTICE 'Hay libros con año menor a 1000: no se creó libros_anio_minimo_check.';
    ELSIF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'libros_anio_minimo_check'
    ) THEN
        ALTER TABLE libros
            ADD CONSTRAINT libros_anio_minimo_check
            CHECK (anio_publicacion >= 1000);
    END IF;
END
$$;
