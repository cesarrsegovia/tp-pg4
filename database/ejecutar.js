// Uso: node database/ejecutar.js database/archivo.sql
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

const ejecutar = async () => {
    const archivo = process.argv[2];

    if (!archivo) {
        console.error('Indicá el archivo SQL a ejecutar.');
        process.exit(1);
    }

    try {
        const sql = fs.readFileSync(path.resolve(archivo), 'utf8');
        await pool.query(sql);
        console.log(`Ejecutado correctamente: ${archivo}`);
    } catch (error) {
        console.error('Error al ejecutar el script:', error.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
};

ejecutar();
