-- Migración 003: búsquedas que ignoran tildes y mayúsculas.
-- Función SQL pura (no requiere extensiones): "Cátedra" y "catedra" se consideran iguales.
-- La ñ se conserva como letra distinta (no es lo mismo "año" que "ano").

CREATE OR REPLACE FUNCTION sin_tildes(texto TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
STRICT
AS $$
    SELECT translate(
        lower(texto),
        'áéíóúüàèìòùâêîôû',
        'aeiouuaeiouaeiou'
    )
$$;
