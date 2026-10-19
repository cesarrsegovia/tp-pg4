-- Migración 002: el autor pasa a tener nombre y apellido por separado (según el diagrama del TP).
-- Es idempotente: si la columna "apellido" ya existe, no cambia los datos.

-- Se elimina la unicidad por nombre: al separar, varios autores comparten nombre (hay dos "Roberto").
-- Más abajo se crea la nueva, por nombre + apellido.
ALTER TABLE autores DROP CONSTRAINT IF EXISTS autores_nombre_key;
DROP INDEX IF EXISTS autores_nombre_lower_key;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'autores' AND column_name = 'apellido'
    ) THEN

        ALTER TABLE autores ADD COLUMN apellido VARCHAR(100);

        -- Regla general: el apellido es la última palabra y el nombre, el resto.
        UPDATE autores
        SET apellido = regexp_replace(nombre, '^.* ', ''),
            nombre = regexp_replace(nombre, ' [^ ]*$', '')
        WHERE nombre ~ ' ';

        -- Apellidos compuestos o con partícula.
        UPDATE autores SET nombre = 'Gabriel', apellido = 'Garcia Marquez'
            WHERE nombre = 'Gabriel Garcia' AND apellido = 'Marquez';
        UPDATE autores SET nombre = 'Miguel', apellido = 'de Cervantes'
            WHERE nombre = 'Miguel de' AND apellido = 'Cervantes';
        UPDATE autores SET nombre = 'Mario', apellido = 'Vargas Llosa'
            WHERE nombre = 'Mario Vargas' AND apellido = 'Llosa';
        UPDATE autores SET nombre = 'Adolfo', apellido = 'Bioy Casares'
            WHERE nombre = 'Adolfo Bioy' AND apellido = 'Casares';
        UPDATE autores SET nombre = 'Simone', apellido = 'de Beauvoir'
            WHERE nombre = 'Simone de' AND apellido = 'Beauvoir';
        UPDATE autores SET nombre = 'Ursula K.', apellido = 'Le Guin'
            WHERE nombre = 'Ursula K. Le' AND apellido = 'Guin';

        -- Autores de una sola palabra: se conserva como apellido.
        UPDATE autores SET apellido = nombre, nombre = '' WHERE apellido IS NULL;

        ALTER TABLE autores ALTER COLUMN apellido SET NOT NULL;
        ALTER TABLE autores ALTER COLUMN nombre TYPE VARCHAR(100);
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS autores_nombre_apellido_lower_key
    ON autores (lower(nombre), lower(apellido));
