-- Migración 006: las fechas de préstamo y devolución pueden cargarse a mano, así que la base
-- también las controla (la aplicación ya lo hace):
--  * la fecha de préstamo no puede ser posterior a hoy;
--  * la fecha de devolución, si existe, está entre la fecha de préstamo y hoy.
-- Si hay datos que violan una regla, esa regla NO se aplica y se avisa: hay que corregir los
-- registros y volver a ejecutar este script. Es idempotente.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM prestamos WHERE fecha_prestamo > CURRENT_DATE) THEN
        RAISE NOTICE 'Hay préstamos con fecha futura: no se creó prestamos_fecha_prestamo_check.';
    ELSIF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'prestamos_fecha_prestamo_check'
    ) THEN
        ALTER TABLE prestamos
            ADD CONSTRAINT prestamos_fecha_prestamo_check
            CHECK (fecha_prestamo <= CURRENT_DATE);
    END IF;

    IF EXISTS (
        SELECT 1 FROM prestamos
        WHERE fecha_devolucion IS NOT NULL
          AND (fecha_devolucion < fecha_prestamo OR fecha_devolucion > CURRENT_DATE)
    ) THEN
        RAISE NOTICE 'Hay devoluciones fuera de rango: no se creó prestamos_fecha_devolucion_check.';
    ELSIF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'prestamos_fecha_devolucion_check'
    ) THEN
        ALTER TABLE prestamos
            ADD CONSTRAINT prestamos_fecha_devolucion_check
            CHECK (
                fecha_devolucion IS NULL
                OR (fecha_devolucion >= fecha_prestamo AND fecha_devolucion <= CURRENT_DATE)
            );
    END IF;
END
$$;
