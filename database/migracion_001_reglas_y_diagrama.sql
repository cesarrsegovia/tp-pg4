-- Migración 001: refuerzo de reglas de negocio y alineación con el diagrama del TP.
-- Es idempotente: se puede ejecutar más de una vez.

BEGIN;

-- 1. Estado "En mantenimiento" (el enunciado usa ese nombre).
ALTER TABLE ejemplares DROP CONSTRAINT IF EXISTS ejemplares_estado_check;

UPDATE ejemplares
SET estado = 'En mantenimiento'
WHERE estado = 'Mantenimiento';

ALTER TABLE ejemplares
    ADD CONSTRAINT ejemplares_estado_check
    CHECK (estado IN ('Disponible', 'Prestado', 'Dañado', 'En mantenimiento'));

-- 2. Columnas y tamaños según el diagrama.
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS descripcion VARCHAR(255);
ALTER TABLE ejemplares ALTER COLUMN codigo_inventario TYPE VARCHAR(50);
ALTER TABLE detalle_prestamo ALTER COLUMN multa TYPE NUMERIC(10,2);

-- 3. Nombres únicos sin distinguir mayúsculas.
CREATE UNIQUE INDEX IF NOT EXISTS categorias_nombre_lower_key ON categorias (lower(nombre));
CREATE UNIQUE INDEX IF NOT EXISTS autores_nombre_lower_key ON autores (lower(nombre));
CREATE UNIQUE INDEX IF NOT EXISTS editoriales_nombre_lower_key ON editoriales (lower(nombre));

-- 4. La fecha de vencimiento no puede ser anterior a la de préstamo (NOT VALID: rige para registros nuevos).
ALTER TABLE prestamos DROP CONSTRAINT IF EXISTS prestamos_fechas_check;
ALTER TABLE prestamos
    ADD CONSTRAINT prestamos_fechas_check
    CHECK (fecha_vencimiento >= fecha_prestamo) NOT VALID;

-- 5. Un ejemplar no puede estar en dos préstamos activos a la vez.
ALTER TABLE detalle_prestamo
    ADD COLUMN IF NOT EXISTS prestamo_activo BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE detalle_prestamo d
SET prestamo_activo = FALSE
FROM prestamos p
WHERE d.id_prestamo = p.id_prestamo
  AND p.estado = 'Devuelto';

CREATE UNIQUE INDEX IF NOT EXISTS detalle_prestamo_ejemplar_activo_key
    ON detalle_prestamo (id_ejemplar)
    WHERE prestamo_activo;

COMMIT;
