-- Migración 004: el email de un socio no puede repetirse (sin distinguir mayúsculas).
-- Si ya hay socios con el mismo email, el índice NO se crea y se avisa: hay que corregir
-- esos socios primero (cambiar el email o eliminar el duplicado) y volver a ejecutar este script.
-- Mientras tanto, la aplicación igualmente impide registrar o modificar un socio con un email ya usado.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM socios GROUP BY lower(email) HAVING COUNT(*) > 1
    ) THEN
        RAISE NOTICE 'Hay socios con el mismo email: no se creó el índice socios_email_lower_key.';
    ELSE
        CREATE UNIQUE INDEX IF NOT EXISTS socios_email_lower_key ON socios (lower(email));
    END IF;
END
$$;
