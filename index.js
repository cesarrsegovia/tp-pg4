const express = require('express');
require('dotenv').config();
const { engine } = require('express-handlebars');
const configurarVariablesVista = require('./middlewares/viewsMiddleware');
const categoriaRoutes = require('./routes/categoriaRoutes');
const autorRoutes = require('./routes/autorRoutes');
const editorialRoutes = require('./routes/editorialRoutes');
const libroRoutes = require('./routes/libroRoutes');
const ejemplarRoutes = require('./routes/ejemplarRoutes');
const prestamoRoutes = require('./routes/prestamoRoutes');
const prestamoController = require('./controllers/prestamoController');
const authRoutes = require('./routes/authRoutes');
const usuarioRoutes = require('./routes/usuarioRoutes');
const socioRoutes = require('./routes/socioRoutes');
const requiereAutenticacion = require('./middlewares/requiereAutenticacion');
const proteccionCsrf = require('./middlewares/csrf');
const entradaSegura = require('./middlewares/entradaSegura');



const pool = require('./config/database');

const app = express();

// No revelar qué tecnología usa el servidor.
app.disable('x-powered-by');

const session = require('express-session');
const flash = require('connect-flash');
const passport = require('./config/passport');

app.use(
    session({
        name: 'biblioteca.sid',
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 1000 * 60 * 60
        }
    })
);

app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
    res.locals.usuario = req.user || null;
    next();
});

app.use(flash());
app.use(configurarVariablesVista);

app.use(express.urlencoded({ extended: true }));
app.use(proteccionCsrf);
app.use(entradaSegura);

app.engine('hbs', engine({
    extname: '.hbs',
    helpers: {
        eq: (a, b) => String(a) === String(b),
        fecha: (valor) => {
            if (!valor) {
                return '—';
            }

            const fecha = new Date(valor);

            if (Number.isNaN(fecha.getTime())) {
                return valor;
            }

            const dia = String(fecha.getDate()).padStart(2, '0');
            const mes = String(fecha.getMonth() + 1).padStart(2, '0');

            return `${dia}/${mes}/${fecha.getFullYear()}`;
        },
        moneda: (valor) => {
            const numero = Number(valor);

            return Number.isNaN(numero)
                ? valor
                : '$' + numero.toLocaleString('es-AR', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2
                });
        },
        activo: (seccion, nombre) => (seccion === nombre ? 'active' : ''),
        claseEstado: (estado) => {
            const clases = {
                Disponible: 'success',
                Prestado: 'warning',
                'Dañado': 'danger',
                'En mantenimiento': 'secondary',
                Activo: 'success',
                Inactivo: 'secondary',
                Vencido: 'danger',
                Devuelto: 'success'
            };

            return clases[estado] || 'secondary';
        }
    }
}));

app.set('view engine', 'hbs');
app.set('views', './views');

app.use('/', authRoutes);

app.use('/categorias', requiereAutenticacion, categoriaRoutes);
app.use('/autores', requiereAutenticacion, autorRoutes);
app.use('/editoriales', requiereAutenticacion, editorialRoutes);
app.use('/socios', requiereAutenticacion, socioRoutes);
app.use('/libros', requiereAutenticacion, libroRoutes);
app.use('/ejemplares', requiereAutenticacion, ejemplarRoutes);
app.use('/prestamos', requiereAutenticacion, prestamoRoutes);
app.use(
    '/usuarios',
    requiereAutenticacion,
    usuarioRoutes
);

const PORT = process.env.PORT || 3000;

app.get(
    '/',
    requiereAutenticacion,
    prestamoController.dashboard
);

// Manejo de rutas inexistentes
app.use((req, res) => {
    res.status(404).render('error', {
        titulo: 'Página no encontrada',
        mensaje: 'La dirección que buscás no existe.'
    });
});

// Manejo de errores no controlados
app.use((error, req, res, next) => {
    console.error(error);

    if (res.headersSent) {
        return next(error);
    }

    // Errores del cliente detectados por Express (cuerpo demasiado grande, JSON/URL malformados).
    if (error.status === 413) {
        return res.status(413).render('error', {
            titulo: 'Solicitud demasiado grande',
            mensaje: 'Los datos enviados superan el tamaño permitido.'
        });
    }

    if (error.status >= 400 && error.status < 500) {
        return res.status(error.status).render('error', {
            titulo: 'Solicitud no válida',
            mensaje: 'No se pudo procesar la solicitud.'
        });
    }

    res.status(500).render('error', {
        titulo: 'Ocurrió un error',
        mensaje: 'Se produjo un error inesperado. Intentá nuevamente.'
    });
});

app.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
});
