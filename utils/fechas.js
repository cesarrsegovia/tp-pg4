// Fecha más antigua que se acepta al registrar un préstamo manualmente.
const FECHA_MINIMA = '2000-01-01';

// Fecha con formato AAAA-MM-DD que existe en el calendario (rechaza 2026-02-30).
const esFechaValida = (texto) => {
    if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
        return false;
    }

    const fecha = new Date(`${texto}T00:00:00Z`);

    return !Number.isNaN(fecha.getTime()) &&
        fecha.toISOString().slice(0, 10) === texto;
};

module.exports = {
    FECHA_MINIMA,
    esFechaValida
};
