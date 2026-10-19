const POR_PAGINA = 10;

// Escapa los comodines de LIKE para que el término se busque literalmente.
const patronBusqueda = (termino = '') =>
    `%${String(termino).trim().replace(/[\\%_]/g, '\\$&')}%`;

// Lista de números de página para mostrar: todas si son pocas; si no,
// la primera, la última y las cercanas a la actual, separadas por "…".
const construirListaPaginas = (pagina, totalPaginas, construirUrl, vecinas = 1) => {

    const numeros = new Set([1, totalPaginas]);

    for (let n = pagina - vecinas; n <= pagina + vecinas; n++) {
        if (n >= 1 && n <= totalPaginas) {
            numeros.add(n);
        }
    }

    // Con pocas páginas se muestran todas.
    if (totalPaginas <= 7) {
        for (let n = 1; n <= totalPaginas; n++) {
            numeros.add(n);
        }
    }

    const ordenados = [...numeros].sort((a, b) => a - b);
    const lista = [];

    ordenados.forEach((numero, indice) => {

        if (indice > 0 && numero - ordenados[indice - 1] > 1) {
            lista.push({ puntos: true });
        }

        lista.push({
            numero,
            url: construirUrl(numero),
            activa: numero === pagina
        });
    });

    return lista;
};

// Calcula los datos de paginación y arma las URLs conservando los filtros de la consulta.
const construirPaginacion = (req, total, porPagina = POR_PAGINA) => {

    let pagina = parseInt(req.query.pagina, 10) || 1;

    if (pagina < 1) {
        pagina = 1;
    }

    const totalPaginas = Math.ceil(total / porPagina);

    if (totalPaginas > 0 && pagina > totalPaginas) {
        pagina = totalPaginas;
    }

    const construirUrl = (numeroPagina) => {

        const parametros = new URLSearchParams();

        for (const [clave, valor] of Object.entries(req.query)) {

            if (clave !== 'pagina' && typeof valor === 'string' && valor !== '') {
                parametros.set(clave, valor);
            }
        }

        parametros.set('pagina', numeroPagina);

        const ruta = req.path === '/' ? '' : req.path;

        return `${req.baseUrl}${ruta}?${parametros.toString()}`;
    };

    return {
        total,
        pagina,
        porPagina,
        offset: (pagina - 1) * porPagina,
        totalPaginas,
        paginas: construirListaPaginas(pagina, totalPaginas, construirUrl),
        puedeIrAnterior: pagina > 1,
        puedeIrSiguiente: pagina < totalPaginas,
        urlPaginaAnterior: construirUrl(pagina - 1),
        urlPaginaSiguiente: construirUrl(pagina + 1)
    };
};

const terminoDeBusqueda = (req) =>
    typeof req.query.buscar === 'string' ? req.query.buscar.trim() : '';

module.exports = {
    POR_PAGINA,
    construirListaPaginas,
    patronBusqueda,
    construirPaginacion,
    terminoDeBusqueda
};
