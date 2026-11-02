// Error pensado para mostrarse al usuario tal cual (regla de negocio incumplida, dato inválido).
// Cualquier otro error (de la base de datos, de programación) se registra en el servidor
// y al usuario se le muestra un mensaje genérico, sin detalles internos.
// Con { reintentable: true } el usuario vuelve al formulario para corregir el dato.
class ErrorNegocio extends Error {
    constructor(mensaje, { reintentable = false } = {}) {
        super(mensaje);
        this.name = 'ErrorNegocio';
        this.reintentable = reintentable;
    }
}

// Valor máximo de un INTEGER de PostgreSQL.
const ID_MAXIMO = 2147483647;

const esIdValido = (valor) => {
    const numero = Number(valor);

    return /^\d+$/.test(String(valor)) &&
        Number.isSafeInteger(numero) &&
        numero > 0 &&
        numero <= ID_MAXIMO;
};

module.exports = {
    ErrorNegocio,
    ID_MAXIMO,
    esIdValido
};
