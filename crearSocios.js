
require('dotenv').config();

const pool = require('./config/database');

const socios = [
    ['María', 'González', '20345671', 'maria.gonzalez@email.com', '2964501001'],
    ['Carlos', 'Rodríguez', '21456782', 'carlos.rodriguez@email.com', '2964501002'],
    ['Lucía', 'Fernández', '22567893', 'lucia.fernandez@email.com', '2964501003'],
    ['Martín', 'López', '23678904', 'martin.lopez@email.com', '2964501004'],
    ['Sofía', 'Martínez', '24789015', 'sofia.martinez@email.com', '2964501005'],
    ['Diego', 'Sánchez', '25890126', 'diego.sanchez@email.com', '2964501006'],
    ['Valentina', 'Romero', '26901237', 'valentina.romero@email.com', '2964501007'],
    ['Mateo', 'Álvarez', '27012348', 'mateo.alvarez@email.com', '2964501008'],
    ['Camila', 'Torres', '28123459', 'camila.torres@email.com', '2964501009'],
    ['Nicolás', 'Díaz', '29234560', 'nicolas.diaz@email.com', '2964501010'],
    ['Julieta', 'Ruiz', '30345671', 'julieta.ruiz@email.com', '2964501011'],
    ['Facundo', 'Acosta', '31456782', 'facundo.acosta@email.com', '2964501012'],
    ['Agustina', 'Benítez', '32567893', 'agustina.benitez@email.com', '2964501013'],
    ['Tomás', 'Medina', '33678904', 'tomas.medina@email.com', '2964501014'],
    ['Florencia', 'Herrera', '34789015', 'florencia.herrera@email.com', '2964501015'],
    ['Santiago', 'Castro', '35890126', 'santiago.castro@email.com', '2964501016'],
    ['Micaela', 'Ortiz', '36901237', 'micaela.ortiz@email.com', '2964501017'],
    ['Joaquín', 'Silva', '37012348', 'joaquin.silva@email.com', '2964501018'],
    ['Paula', 'Molina', '38123459', 'paula.molina@email.com', '2964501019'],
    ['Lautaro', 'Rojas', '39234560', 'lautaro.rojas@email.com', '2964501020']
];

const crearSocios = async () => {
    try {
        let insertados = 0;

        for (const [nombre, apellido, dni, email, telefono] of socios) {
            const resultado = await pool.query(
                `INSERT INTO socios
                    (nombre, apellido, dni, email, telefono, estado)
                 VALUES ($1, $2, $3, $4, $5, 'Activo')
                 ON CONFLICT (dni) DO NOTHING`,
                [nombre, apellido, dni, email, telefono]
            );

            insertados += resultado.rowCount;
        }

        console.log(`Socios insertados: ${insertados} de ${socios.length}.`);
    } catch (error) {
        console.error('Error al crear socios:', error.message);
    } finally {
        await pool.end();
    }
};

crearSocios();
