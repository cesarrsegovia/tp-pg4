// Utilidades compartidas por las pruebas de aceptación (cliente HTTP con sesión, CSRF y chequeos).
const BASE = process.env.BASE_URL || 'http://localhost:3000';

const cookies = {};

const guardarCookies = (res) => {
    for (const cookie of res.headers.getSetCookie()) {
        const [par] = cookie.split(';');
        const igual = par.indexOf('=');
        cookies[par.slice(0, igual)] = par.slice(igual + 1);
    }
};

const cabeceraCookies = () =>
    Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');

const pedir = async (metodo, ruta, cuerpo) => {
    const res = await fetch(BASE + ruta, {
        method: metodo,
        redirect: 'manual',
        headers: {
            cookie: cabeceraCookies(),
            'content-type': 'application/x-www-form-urlencoded'
        },
        body: cuerpo ? new URLSearchParams(cuerpo).toString() : undefined
    });

    guardarCookies(res);

    return {
        estado: res.status,
        destino: res.headers.get('location'),
        html: await res.text()
    };
};

const decodificar = (texto) =>
    texto
        .replace(/&#x27;/g, "'")
        .replace(/&#x3D;/g, '=')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');

const obtener = (ruta) => pedir('GET', ruta);

const token = async (ruta) => {
    const { html } = await obtener(ruta);
    const coincidencia = html.match(/name="_csrf" value="([a-f0-9]+)"/);

    if (!coincidencia) {
        throw new Error(`No hay token CSRF en ${ruta}`);
    }

    return coincidencia[1];
};

// POST con token tomado del formulario indicado (por defecto, la misma ruta de origen).
const enviar = async (ruta, datos, formulario) => {
    const _csrf = await token(formulario || '/');
    return pedir('POST', ruta, { ...datos, _csrf });
};

// Mensajes de alerta (éxito o error) de una página.
const alertas = (html) =>
    [...html.matchAll(/alert alert-(success|danger)[^>]*>\s*<i[^>]*><\/i>([^<]*)/g)].map(
        (m) => ({ tipo: m[1], texto: decodificar(m[2].trim()) })
    );

// Sigue una redirección y devuelve la página destino con sus alertas.
const seguir = async (respuesta) => {
    if (!respuesta.destino) {
        return { ...respuesta, alertas: alertas(respuesta.html) };
    }

    const ruta = respuesta.destino.replace(BASE, '');
    const pagina = await obtener(ruta);

    return { ...pagina, ruta, alertas: alertas(pagina.html) };
};

const filas = (html) =>
    [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
        .map((m) => m[1])
        .filter((fila) => fila.includes('<td'));

const textoFila = (fila) => decodificar(fila.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());

const iniciarSesion = async (email, password) => {
    const _csrf = await token('/login');
    return pedir('POST', '/login', { email, password, _csrf });
};

// ---- registro de resultados ----
const resultados = [];
let seccionActual = '';

const seccion = (nombre) => {
    seccionActual = nombre;
    console.log(`\n=== ${nombre} ===`);
};

const verificar = (condicion, descripcion, detalle = '') => {
    resultados.push({ seccion: seccionActual, ok: Boolean(condicion), descripcion });
    console.log(`${condicion ? '  OK    ' : '  FALLA '} ${descripcion}${!condicion && detalle ? '  -> ' + detalle : ''}`);
};

const resumen = () => {
    const fallas = resultados.filter((r) => !r.ok);
    console.log(`\n==== RESUMEN: ${resultados.length - fallas.length} de ${resultados.length} pruebas correctas ====`);

    if (fallas.length) {
        console.log('Fallaron:');
        fallas.forEach((f) => console.log(`  [${f.seccion}] ${f.descripcion}`));
    }

    return fallas.length;
};

module.exports = {
    BASE,
    obtener,
    pedir,
    token,
    enviar,
    alertas,
    seguir,
    filas,
    textoFila,
    decodificar,
    iniciarSesion,
    seccion,
    verificar,
    resumen
};
