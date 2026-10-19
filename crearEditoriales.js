
require('dotenv').config();

const pool = require('./config/database');

const editoriales = [
    'Editorial Planeta', 'Penguin Random House', 'Alianza Editorial', 'Fondo de Cultura Económica',
    'Editorial Sudamericana', 'Ediciones Siruela', 'Editorial Anagrama', 'Tusquets Editores',
    'Seix Barral', 'Alfaguara', 'Debolsillo', 'Editorial Losada',
    'Ediciones de la Flor', 'Eudeba', 'Siglo XXI Editores', 'Editorial Paidós',
    'Editorial Gredos', 'Ediciones Cátedra', 'Espasa', 'Editorial Acantilado',
    'Editorial Lumen', 'Ediciones B', 'Editorial Santillana', 'Editorial Kapelusz',
    'Editorial Troquel', 'Editorial Estrada', 'Editorial Atlántida', 'Emecé Editores',
    'Editorial Sur', 'Ediciones Corregidor', 'Adriana Hidalgo Editora', 'Editorial Interzona',
    'Ediciones Godot', 'Eterna Cadencia', 'Libros del Zorzal', 'Ediciones Cántaro',
    'Editorial Biblos', 'Editorial Colihue', 'Ediciones Akal', 'Editorial Reverté'
];

const crearEditoriales = async () => {
    try {
        let insertadas = 0;

        for (const nombre of editoriales) {
            const resultado = await pool.query(
                `INSERT INTO editoriales (nombre)
                 VALUES ($1)
                 ON CONFLICT DO NOTHING`,
                [nombre]
            );

            insertadas += resultado.rowCount;
        }

        console.log(`editoriales: ${insertadas} insertadas de ${editoriales.length}.`);
    } catch (error) {
        console.error('Error al crear editoriales:', error.message);
    } finally {
        await pool.end();
    }
};

crearEditoriales();
