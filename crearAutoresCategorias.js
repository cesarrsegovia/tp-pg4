
require('dotenv').config();

const pool = require('./config/database');

// [nombre, apellido]
const autores = [
    ['Miguel', 'de Cervantes'],
    ['Julio', 'Cortázar'],
    ['Isabel', 'Allende'],
    ['Mario', 'Vargas Llosa'],
    ['Pablo', 'Neruda'],
    ['Octavio', 'Paz'],
    ['Carlos', 'Fuentes'],
    ['Juan', 'Rulfo'],
    ['Ernesto', 'Sabato'],
    ['Adolfo', 'Bioy Casares'],
    ['Roberto', 'Arlt'],
    ['Alejandra', 'Pizarnik'],
    ['Horacio', 'Quiroga'],
    ['Rodolfo', 'Walsh'],
    ['Silvina', 'Ocampo'],
    ['Manuel', 'Puig'],
    ['Eduardo', 'Galeano'],
    ['Mario', 'Benedetti'],
    ['Roberto', 'Bolaño'],
    ['Clarice', 'Lispector'],
    ['Jorge', 'Amado'],
    ['Paulo', 'Coelho'],
    ['Gabriela', 'Mistral'],
    ['José', 'Saramago'],
    ['Fernando', 'Pessoa'],
    ['Umberto', 'Eco'],
    ['Italo', 'Calvino'],
    ['Elena', 'Ferrante'],
    ['Victor', 'Hugo'],
    ['Albert', 'Camus'],
    ['Simone', 'de Beauvoir'],
    ['Jules', 'Verne'],
    ['Franz', 'Kafka'],
    ['Thomas', 'Mann'],
    ['Hermann', 'Hesse'],
    ['Fiódor', 'Dostoievski'],
    ['León', 'Tolstói'],
    ['Antón', 'Chéjov'],
    ['Jane', 'Austen'],
    ['Charles', 'Dickens'],
    ['George', 'Orwell'],
    ['Virginia', 'Woolf'],
    ['Agatha', 'Christie'],
    ['J. R. R.', 'Tolkien'],
    ['Edgar Allan', 'Poe'],
    ['Mark', 'Twain'],
    ['Ernest', 'Hemingway'],
    ['Toni', 'Morrison'],
    ['Stephen', 'King'],
    ['Ursula K.', 'Le Guin']
];

const categorias = [
    'Novela', 'Cuento', 'Poesía', 'Teatro', 'Ensayo', 'Biografía', 'Autobiografía',
    'Memorias', 'Historia', 'Historia Argentina', 'Historia Universal', 'Historia del Arte',
    'Filosofía', 'Psicología', 'Sociología', 'Antropología', 'Política', 'Economía',
    'Derecho', 'Educación', 'Pedagogía', 'Ciencia Ficción', 'Fantasía', 'Terror',
    'Misterio', 'Novela Negra', 'Policial', 'Aventuras', 'Romance', 'Drama',
    'Comedia', 'Humor', 'Clásicos', 'Literatura Latinoamericana', 'Literatura Argentina',
    'Literatura Europea', 'Literatura Infantil', 'Literatura Juvenil', 'Cómics',
    'Novela Gráfica', 'Mitología', 'Religión', 'Espiritualidad', 'Autoayuda',
    'Superación Personal', 'Liderazgo', 'Negocios', 'Marketing', 'Finanzas',
    'Contabilidad', 'Administración', 'Emprendimiento', 'Matemática', 'Física',
    'Química', 'Biología', 'Astronomía', 'Geología', 'Ecología', 'Medicina',
    'Enfermería', 'Nutrición', 'Salud', 'Deportes', 'Fútbol', 'Ajedrez',
    'Cocina', 'Repostería', 'Jardinería', 'Bricolaje', 'Manualidades', 'Moda',
    'Fotografía', 'Cine', 'Música', 'Pintura', 'Escultura', 'Arquitectura',
    'Diseño Gráfico', 'Diseño Web', 'Informática', 'Redes de Computadoras',
    'Sistemas Operativos', 'Inteligencia Artificial', 'Ciberseguridad',
    'Desarrollo Web', 'Desarrollo Móvil', 'Algoritmos', 'Ingeniería de Software',
    'Ingeniería', 'Electrónica', 'Robótica', 'Geografía', 'Viajes', 'Turismo',
    'Idiomas', 'Lingüística', 'Gramática', 'Diccionarios', 'Enciclopedias'
];

const cargar = async (tabla, nombres) => {
    let insertados = 0;

    for (const nombre of nombres) {
        const resultado = await pool.query(
            `INSERT INTO ${tabla} (nombre)
             VALUES ($1)
             ON CONFLICT (nombre) DO NOTHING`,
            [nombre]
        );

        insertados += resultado.rowCount;
    }

    console.log(`${tabla}: ${insertados} insertados de ${nombres.length}.`);
};

const cargarAutores = async () => {
    let insertados = 0;

    for (const [nombre, apellido] of autores) {
        const resultado = await pool.query(
            `INSERT INTO autores (nombre, apellido)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [nombre, apellido]
        );

        insertados += resultado.rowCount;
    }

    console.log(`autores: ${insertados} insertados de ${autores.length}.`);
};

const crearAutoresCategorias = async () => {
    try {
        await cargarAutores();
        await cargar('categorias', categorias);
    } catch (error) {
        console.error('Error al cargar datos:', error.message);
    } finally {
        await pool.end();
    }
};

crearAutoresCategorias();
