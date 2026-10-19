# Sistema de Gestión de Préstamos de Biblioteca

Trabajo Final de Programación 4
Aplicación web para administrar libros, autores, categorías, editoriales, ejemplares y socios, y para registrar préstamos y devoluciones con cálculo automático de días de atraso y multas.

## Tecnologías

- Node.js + Express 5
- Handlebars (express-handlebars) y Bootstrap 5 / Bootstrap Icons, con modo claro y oscuro
- PostgreSQL (`pg`)
- Passport (estrategia local), `express-session`, `bcryptjs`, `connect-flash`
- `express-validator` para las validaciones del servidor

## Instalación

1. Instalar dependencias:

   ```bash
   npm install
   ```

2. Crear la base de datos en PostgreSQL (por ejemplo `biblioteca`).

3. Copiar `.env.example` como `.env` y completar los valores (conexión, `SESSION_SECRET`, usuario administrador).

4. Crear las tablas:

   ```bash
   npm run db:schema
   ```

5. Cargar datos iniciales (usuario administrador, socios, autores, categorías, editoriales, libros y ejemplares de ejemplo):

   ```bash
   npm run db:seed
   ```

6. Iniciar la aplicación:

   ```bash
   npm start
   ```

   Se abre en <http://localhost:3000>. Iniciá sesión con el usuario definido en `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

> Si ya tenías la base creada con una versión anterior del esquema, aplicá las migraciones en orden:
>
> ```bash
> node database/ejecutar.js database/migracion_001_reglas_y_diagrama.sql
> node database/ejecutar.js database/migracion_002_autor_nombre_apellido.sql
> node database/ejecutar.js database/migracion_003_busqueda_sin_tildes.sql
> ```

## Estructura

```
config/        conexión a la base y estrategia de autenticación
controllers/   lógica de cada módulo
models/        consultas SQL
routes/        rutas de Express
middlewares/   validaciones y control de acceso
utils/         paginación y búsqueda
views/         plantillas Handlebars (layouts, partials y vistas)
database/      schema.sql, migraciones y ejecutor de scripts SQL
```

## Reglas de negocio implementadas

| Regla | Dónde se controla |
|---|---|
| Campos únicos (DNI, ISBN, email, código de inventario, nombres sin distinguir mayúsculas) | Restricciones `UNIQUE` e índices `lower(nombre)` |
| No se presta a un socio inactivo | `prestamoModel.crearPrestamo` |
| Máximo 3 préstamos abiertos (Activo o Vencido) por socio | `prestamoModel.crearPrestamo` |
| Máximo 3 ejemplares por préstamo | Formulario, controlador y modelo |
| Solo se prestan ejemplares Disponibles, y no pueden estar en dos préstamos activos | Estado + bloqueo `FOR UPDATE` + índice único parcial `detalle_prestamo_ejemplar_activo_key` |
| Vencimiento = fecha de préstamo + 7 días | Automático al crear el préstamo |
| Multa de $500 por día de atraso y por ejemplar | `prestamoModel.devolverPrestamo` |
| Al devolver, cada ejemplar vuelve Disponible, Dañado o En mantenimiento según se indique | Pantalla de devolución |
| No se puede devolver dos veces un préstamo | Control de estado en la transacción |
| Préstamo y cambios de estado se registran de forma atómica | Transacciones (`BEGIN` / `COMMIT` / `ROLLBACK`) |
| Las bajas respetan la integridad referencial | Claves foráneas + mensajes claros (código 23503) |
| Año de publicación no superior al actual | Validador y `CHECK` en la base |
| Búsquedas que ignoran tildes y mayúsculas ("catedra" encuentra "Cátedra"; la ñ se respeta) | Función SQL `sin_tildes` |
| Autores con nombre y apellido; no se repite la pareja (sin distinguir mayúsculas) | Índice único `autores_nombre_apellido_lower_key` |
| Protección contra CSRF: todo formulario POST lleva un token de sesión que se verifica en el servidor | `middlewares/csrf.js` y partial `csrf` |

## Pruebas

Con la aplicación iniciada (`npm start`) y la base cargada, en otra terminal:

```bash
npm test
```

Las pruebas recorren, contra el servidor real, el alta, el listado, el buscador, la paginación, la modificación,
la baja y los datos duplicados de cada entidad, además de las reglas de préstamos, devoluciones y multas,
el acceso con sesión y la protección CSRF. Cada una crea sus propios datos (con el prefijo `ZZPrueba`) y los
elimina al terminar, sin tocar los registros existentes. Usan el usuario `admin@biblioteca.com`.

## Notas

- El estado `Vencido` se actualiza al consultar préstamos, el dashboard, el detalle y los historiales.
- Se cambió el nombre del estado de ejemplar a `En mantenimiento`, como indica el enunciado.
- Las migraciones de `database/` son idempotentes: pueden ejecutarse más de una vez.
- Cambiá la contraseña del administrador inicial antes de usar el sistema fuera de un entorno de pruebas.
