
require('dotenv').config();

const pool = require('./config/database');

// [titulo, autor, categoria, anio]
const libros = [
    ['Don Quijote de la Mancha', 'Miguel de Cervantes', 'Novela', 1605],
    ['Las aventuras de Tom Sawyer', 'Mark Twain', 'Aventuras', 1876],
    ['Rayuela', 'Julio Cortázar', 'Novela', 1963],
    ['El viejo y el mar', 'Ernest Hemingway', 'Novela', 1952],
    ['La casa de los espíritus', 'Isabel Allende', 'Novela', 1982],
    ['Beloved', 'Toni Morrison', 'Novela', 1987],
    ['La ciudad y los perros', 'Mario Vargas Llosa', 'Novela', 1963],
    ['It', 'Stephen King', 'Terror', 1986],
    ['Veinte poemas de amor y una canción desesperada', 'Pablo Neruda', 'Poesía', 1924],
    ['Los desposeídos', 'Ursula K. Le Guin', 'Ciencia Ficción', 1974],
    ['El laberinto de la soledad', 'Octavio Paz', 'Ensayo', 1950],
    ['La región más transparente', 'Carlos Fuentes', 'Novela', 1958],
    ['Pedro Páramo', 'Juan Rulfo', 'Literatura Latinoamericana', 1955],
    ['El túnel', 'Ernesto Sabato', 'Novela', 1948],
    ['La invención de Morel', 'Adolfo Bioy Casares', 'Ciencia Ficción', 1940],
    ['Los siete locos', 'Roberto Arlt', 'Novela', 1929],
    ['Árbol de Diana', 'Alejandra Pizarnik', 'Poesía', 1962],
    ['Cuentos de amor, de locura y de muerte', 'Horacio Quiroga', 'Cuento', 1917],
    ['Operación Masacre', 'Rodolfo Walsh', 'Historia Argentina', 1957],
    ['La furia y otros cuentos', 'Silvina Ocampo', 'Cuento', 1959],
    ['El beso de la mujer araña', 'Manuel Puig', 'Novela', 1976],
    ['Las venas abiertas de América Latina', 'Eduardo Galeano', 'Historia', 1971],
    ['La tregua', 'Mario Benedetti', 'Novela', 1960],
    ['Los detectives salvajes', 'Roberto Bolaño', 'Literatura Latinoamericana', 1998],
    ['La hora de la estrella', 'Clarice Lispector', 'Novela', 1977],
    ['Gabriela, clavo y canela', 'Jorge Amado', 'Romance', 1958],
    ['El alquimista', 'Paulo Coelho', 'Espiritualidad', 1988],
    ['Desolación', 'Gabriela Mistral', 'Poesía', 1922],
    ['Ensayo sobre la ceguera', 'José Saramago', 'Novela', 1995],
    ['Libro del desasosiego', 'Fernando Pessoa', 'Filosofía', 1982],
    ['El nombre de la rosa', 'Umberto Eco', 'Misterio', 1980],
    ['Las ciudades invisibles', 'Italo Calvino', 'Fantasía', 1972],
    ['La amiga estupenda', 'Elena Ferrante', 'Novela', 2011],
    ['Los miserables', 'Victor Hugo', 'Clásicos', 1862],
    ['El extranjero', 'Albert Camus', 'Filosofía', 1942],
    ['El segundo sexo', 'Simone de Beauvoir', 'Sociología', 1949],
    ['Veinte mil leguas de viaje submarino', 'Jules Verne', 'Aventuras', 1870],
    ['La metamorfosis', 'Franz Kafka', 'Literatura Europea', 1915],
    ['La montaña mágica', 'Thomas Mann', 'Literatura Europea', 1924],
    ['Siddhartha', 'Hermann Hesse', 'Espiritualidad', 1922],
    ['Crimen y castigo', 'Fiódor Dostoievski', 'Clásicos', 1866],
    ['Ana Karénina', 'León Tolstói', 'Romance', 1877],
    ['La gaviota', 'Antón Chéjov', 'Teatro', 1896],
    ['Orgullo y prejuicio', 'Jane Austen', 'Romance', 1813],
    ['Grandes esperanzas', 'Charles Dickens', 'Clásicos', 1861],
    ['1984', 'George Orwell', 'Ciencia Ficción', 1949],
    ['Una habitación propia', 'Virginia Woolf', 'Ensayo', 1929],
    ['Asesinato en el Orient Express', 'Agatha Christie', 'Novela Negra', 1934],
    ['El hobbit', 'J. R. R. Tolkien', 'Fantasía', 1937],
    ['Narraciones extraordinarias', 'Edgar Allan Poe', 'Terror', 1840]
];

// ISBN-13 con dígito verificador válido (978 + 9 dígitos), inventado.
const generarIsbn = (n) => {
    const base = `978${String(950000000 + n * 7919).padStart(9, '0')}`;
    const suma = [...base].reduce(
        (acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3),
        0
    );
    return base + ((10 - (suma % 10)) % 10);
};

const aleatorio = (min, max) =>
    Math.floor(Math.random() * (max - min + 1)) + min;

const crearLibrosEjemplares = async () => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const idPorNombre = async (tabla, columnaId) => {
            const r = await client.query(`SELECT ${columnaId} AS id, nombre FROM ${tabla}`);
            return new Map(r.rows.map((f) => [f.nombre, f.id]));
        };

        const autores = new Map(
            (await client.query(
                "SELECT id_autor, nombre || ' ' || apellido AS nombre FROM autores"
            )).rows.map((f) => [f.nombre, f.id_autor])
        );
        const categorias = await idPorNombre('categorias', 'id_categoria');
        const editoriales = (
            await client.query('SELECT id_editorial FROM editoriales ORDER BY id_editorial')
        ).rows.map((f) => f.id_editorial);

        const max = await client.query(
            `SELECT COALESCE(MAX(SUBSTRING(codigo_inventario FROM '[0-9]+$')::int), 0) AS n
             FROM ejemplares
             WHERE codigo_inventario ~ '^INV-[0-9]+$'`
        );
        let correlativo = max.rows[0].n;

        let totalLibros = 0;
        let totalEjemplares = 0;

        for (const [i, [titulo, autor, categoria, anio]] of libros.entries()) {
            const idAutor = autores.get(autor);
            const idCategoria = categorias.get(categoria);

            if (!idAutor || !idCategoria) {
                throw new Error(`No se encontró autor o categoría para "${titulo}"`);
            }

            // reparto parejo de las editoriales entre los libros
            const idEditorial = editoriales[i % editoriales.length];

            const libro = await client.query(
                `INSERT INTO libros
                    (isbn, titulo, anio_publicacion, id_autor, id_categoria, id_editorial)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (isbn) DO NOTHING
                 RETURNING id_libro`,
                [generarIsbn(i + 1), titulo, anio, idAutor, idCategoria, idEditorial]
            );

            if (libro.rowCount === 0) {
                continue;
            }

            totalLibros++;
            const cantidad = aleatorio(1, 5);

            for (let e = 0; e < cantidad; e++) {
                correlativo++;
                await client.query(
                    `INSERT INTO ejemplares (codigo_inventario, id_libro, estado)
                     VALUES ($1, $2, 'Disponible')`,
                    [`INV-${String(correlativo).padStart(4, '0')}`, libro.rows[0].id_libro]
                );
                totalEjemplares++;
            }
        }

        await client.query('COMMIT');
        console.log(`Libros insertados: ${totalLibros}. Ejemplares insertados: ${totalEjemplares}.`);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error al cargar libros y ejemplares:', error.message);
    } finally {
        client.release();
        await pool.end();
    }
};

crearLibrosEjemplares();
