# Informe de auditoría: validaciones y lógica de negocio

Sistema de Gestión de Préstamos de Biblioteca — TP Final Programación IV (UTN FRTDF)
Fecha de la auditoría: 22/10/2026

## 1. Resumen ejecutivo

Se revisó todo el código (modelos, controladores, validadores, rutas, vistas, esquema SQL y pruebas) contra el enunciado y se
**forzó el sistema con 284 pruebas adversariales** sobre el servidor real: datos límite, entradas malformadas, ataques simples,
concurrencia, devoluciones con 0/1/3/30/365 días de atraso e integridad directa en la base.

| | Antes | Después |
|---|---|---|
| Suite original (`catalogos` + `entidades`) | 346/346 (sobre datos de la base de desarrollo) | 346/346 |
| Batería nueva (`pruebas/reglas.js`) | 226/284 (58 fallas) | **284/284** (8 observaciones de diseño informadas como NOTA) |

**Conclusión:** el núcleo de reglas del enunciado ya estaba bien resuelto (límite de 3 préstamos, 7 días, multa $500 por día y
por ejemplar, estados de ejemplar, doble devolución, integridad referencial, transacciones). Los problemas encontrados estaban
en los bordes: **1 bug funcional de login, 1 bug de concurrencia (deadlock), 1 regla del enunciado que se incumplía en silencio
(máximo 3 ejemplares), filtración de mensajes internos de PostgreSQL, y varias validaciones incompletas**. Todo lo corregible
dentro del alcance del TP se corrigió y se verificó.

> **Cómo se probó sin riesgo:** se creó una base aislada `biblioteca_audit` (esquema + semillas) y un servidor en el puerto 3100.
> **Tu base de desarrollo no se tocó** y la migración 005 **no está aplicada en ella** (ver sección 7). La base aislada se eliminó al terminar.

## 2. Cumplimiento del enunciado

| Requisito | Estado | Evidencia |
|---|---|---|
| 1. Usuarios: registro, login por email/contraseña, sesión, logout seguro | Cumple (con 1 bug corregido) | A01–A20 |
| 2. Socios: CRUD, DNI único, email válido, obligatorios, inactivo no presta, máx. 3 | Cumple | S01–S30, P10, P20–P23 |
| 3. Categorías / autores / editoriales: CRUD, sin duplicados, buscador y paginación | Cumple | CAT/EDI/AUT 01–31 |
| 4. Libros: validaciones (ISBN único, año ≤ actual, relaciones), buscador por 4 criterios | Cumple | L01–L53 |
| 5. Ejemplares: código único, 4 estados, Prestado/Disponible automáticos | Cumple | E01–E28, D01–D11 |
| 6. Préstamos: 7 días, 1–3 ejemplares, validaciones | Cumple (1 regla se incumplía en silencio, corregida) | P01–P34 |
| 7. Devoluciones: atraso, multa $500, total = suma de detalles, sin 2.ª devolución | Cumple | D01–D31 |
| 8. Consultas: activos, vencidos, historiales, JOIN completo, filtros, integridad | Cumple (listado sin ejemplar/categoría, corregido) | V01–V17, H01–H11 |
| 9. Catálogo, detalle de libro, detalle de préstamo con atraso y multa | Cumple (detalle de préstamo abierto mostraba "$0", corregido) | L50–L52, V03, V05 |
| Reglas de negocio 1–11 | Cumplen | ver matriz abajo |
| Técnico: validación cliente y servidor, Bootstrap, errores claros | Cumple (cliente reforzado) | ver 4.9 |

Matriz de las 11 reglas de negocio:

| # | Regla | Resultado |
|---|---|---|
| 1 | Sin duplicados en campos únicos | OK (y ahora también ISBN/código con otra capitalización o con guiones) |
| 2 | Sin préstamo a socio inactivo | OK (probado con POST forzado, P10) |
| 3 | Máx. 3 préstamos activos | OK; cuenta Activo + Vencido; 8 pedidos simultáneos → exactamente 3 (P30–P31) |
| 4 | No se presta un ejemplar no Disponible | OK para Prestado, Dañado y En mantenimiento (P11–P13) |
| 5 | Un ejemplar no está en dos préstamos activos | OK: estado + `FOR UPDATE` + índice único parcial; 5 socios simultáneos → 1 (P33, B05) |
| 6 | Vencimiento = préstamo + 7 días | OK (P16) |
| 7 | Atraso y multa al devolver | OK (D01–D06) |
| 8 | $500 por día de atraso y por ejemplar | OK: 0, 1, 3, 30 y 365 días con 1–3 ejemplares |
| 9 | Bajas respetan integridad referencial | OK (CAT/EDI/AUT 15, L35, E23, B06–B08) |
| 10 | Cambios de estado consistentes | OK, transacciones; 3 devoluciones simultáneas del mismo préstamo → 1 sola (D30–D31) |
| 11 | Máx. 3 ejemplares por préstamo | **Se incumplía en silencio** (ver F3); corregido |

## 3. Hallazgos corregidos

Severidad: **Alta** = rompe una regla del enunciado o la integridad; **Media** = falla visible o riesgo real; **Baja** = pulido.

### 3.1 Funcionales y de reglas de negocio

| ID | Sev. | Hallazgo (reproducción) | Corrección | Prueba |
|---|---|---|---|---|
| F1 | Media | **Login sensible a mayúsculas y espacios.** Un usuario se guarda con el email en minúsculas, pero al iniciar sesión se comparaba con `=`: registrar `Juan@X.com` e ingresar `Juan@X.com` daba "Email o contraseña incorrectos"; también fallaba `ADMIN@BIBLIOTECA.COM` y un email pegado con un espacio al final. | `usuarioModel.buscarPorEmail` compara con `lower(email) = lower($1)` y recorta espacios. | A08, A10, A11 |
| F2 | Media | **Deadlock en préstamos simultáneos.** Dos socios pidiendo a la vez los mismos 2 ejemplares en orden inverso (A: e1,e2 / B: e2,e1): en 3 de 12 rondas PostgreSQL abortaba una transacción y el usuario veía "se ha detectado un deadlock". | `crearPrestamo` ordena los ids de forma ascendente antes de bloquear; además traduce los códigos 40P01/40001 a un mensaje claro por si ocurrieran. | P34 (20 rondas, 0 deadlocks) |
| F3 | Media | **Regla 11 incumplida en silencio.** Un envío con `id_ejemplar_4` creaba el préstamo con 3 ejemplares e ignoraba el cuarto sin avisar (y con mensaje de éxito). | El controlador lee todos los campos `id_ejemplar_N` y rechaza si hay más de 3. | P14 |
| F4 | Media | **Estado de devolución inválido convertido en silencio.** `estado_X=Prestado` o `Perdido` devolvía el ejemplar como Disponible. | `devolverPrestamo` rechaza cualquier estado distinto de Disponible / Dañado / En mantenimiento (vacío = Disponible) antes de tocar la base. | D10 |
| F5 | Media | **Mensajes internos de PostgreSQL visibles al usuario** en préstamos: `el valor «99999999999» está fuera de rango para el tipo integer`, `la sintaxis de entrada no es válida para tipo integer: «{"256","257"}»`. | Nueva clase `ErrorNegocio` (`utils/errores.js`): solo sus mensajes se muestran; cualquier otro error se registra y se muestra un texto genérico. Validadores con rango de `INTEGER`. | P02, P04, P05, P06 |
| F6 | Media | **Filtros de préstamos frágiles.** `?fechaDesde=abc`, `2026-02-30`, `?id_socio=99999999999` o `?pagina=1e30` (sin resultados) expulsaban al usuario al inicio con "No se pudieron obtener los préstamos". `?pagina=1.5` mostraba "Página 1.5" y salteaba filas. | Validación de fecha real (AAAA-MM-DD existente), de id con rango y de página entera; avisos específicos y vuelta a `/prestamos`. | V10–V16 |
| F7 | Media | **Error 500 con entradas armadas a mano.** `nombre=a&nombre=b` (campo repetido) o el carácter NUL provocaban 500 ("Error al crear…") en socios, categorías, autores, editoriales, etc. | Middleware `entradaSegura` rechaza con 400 cualquier campo repetido/anidado o con NUL, en cuerpo y query. | S05, S06, CAT/EDI/AUT 09–10 y 30 |
| F8 | Media | **ISBN duplicable cambiando mayúsculas o guiones** (`978-0-00…` junto a `978000…`, `zza…` junto a `ZZA…`). | Migración 005: índice único sobre el ISBN normalizado (sin guiones ni espacios, en mayúsculas). | L03, L04 |
| F9 | Media | **Contraseña de solo espacios aceptada** (12 espacios). | Validador: no puede ser solo espacios. | A18 |
| F10 | Baja | Mensaje de login vacío en inglés (`Missing credentials`). | `badRequestMessage` en español. | verificado manualmente en el navegador |
| F11 | Baja | **Detalle de préstamo abierto/vencido** mostraba "$0" de multa y atraso vacío, como si ya estuviera calculado. | Muestra "—" y, si está vencido, el aviso "lleva N días de atraso; la multa se calcula al devolver" (respeta la regla 7: el cálculo definitivo sigue siendo al devolver). | V03, V05 |
| F12 | Baja | **Listado de préstamos sin ejemplar ni categoría** (el punto 8 pide JOIN con socio, libro, ejemplar, autor y categoría; solo mostraba "Título (Autor)"). | Consulta con `JSON_AGG` y JOIN a categorías; cada fila muestra código · título (autor · categoría). | V04 |
| F13 | Baja | **Historiales** de un socio/ejemplar inexistente respondían 200 ("no tiene préstamos") y no indicaban de quién eran. | 404 si no existe; encabezado con socio (nombre, DNI, estado) o ejemplar (código, libro, autor, categoría, estado). | H01–H03 |
| F14 | Baja | **Año "+2015"** aceptado; **código de inventario** limitado a 30 caracteres aunque el diagrama y la BD admiten 50; **teléfono** aceptaba cualquier texto ("abc-xyz!!"); **nombres con doble espacio** ("Planeta  Editorial") evadían el control de duplicados. | Año solo dígitos; código hasta 50; teléfono solo números y `+ ( ) - .`; espacios internos compactados en socios, autores, categorías y editoriales. | L18, E06, S22, CAT04/EDI04/AUT04 |
| F15 | Baja | **Código de ejemplar** duplicable con otra capitalización (`zza-1` junto a `ZZA-1`). | Migración 005: índice único sobre `lower(codigo_inventario)`. | E03 |
| F16 | Baja | La base aceptaba **atraso/multa negativos** y **años negativos** (solo había tope máximo). | Migración 005: `CHECK` en `detalle_prestamo` y año mínimo 1000 en `libros`. | B09, B11 |
| F17 | Baja | Validación fallida respondía **200** en autores, categorías, editoriales, libros y ejemplares (Socios ya respondía 400). | `res.status(400)` en esos formularios; se actualizaron 3 aserciones de `catalogos.js`. | CAT/EDI/AUT 11, L34, E26 |
| F18 | Baja | Cuerpo de 300 KB devolvía **500** en lugar de 413; se exponía `X-Powered-By: Express`. | El manejador de errores respeta los 4xx de Express; `app.disable('x-powered-by')`. | R01, A02 |

### 3.2 Validación del lado cliente (el enunciado la pide "cuando corresponda")

- **Año de publicación:** el `<input type="number">` no tenía `min`/`max`; ahora `min="1000"` y `max` = año actual.
- **Teléfono:** `pattern` equivalente al del servidor.
- **Código de inventario:** `maxlength="50"`.
- **Nuevo préstamo:** el formulario permitía elegir el mismo ejemplar en dos selectores (solo el servidor lo frenaba); ahora el
  ejemplar elegido se deshabilita en los otros (verificado en el navegador) y se avisa si no hay socios activos o ejemplares disponibles.

## 4. Lo que se probó y se confirmó que funciona

- **Autenticación y sesión:** cookie `HttpOnly` + `SameSite=Lax`; la cookie de una sesión cerrada ya no sirve (A04); POST sin token o
  con token falso → 403 sin efectos (A05); todas las rutas protegidas redirigen al login; logout y eliminar no se disparan por GET.
- **Inyección y XSS:** `'; DROP TABLE socios;--` en el buscador es inofensivo; `<script>` / `<img onerror>` en apellido y título se
  escapan al listar; los comodines `%` y `_` del buscador se escapan.
- **Devoluciones:** 0, 1, 3, 30 y 365 días de atraso con 1–3 ejemplares dan la multa exacta; el total es la suma de los detalles;
  un préstamo que vence hoy no está vencido; una segunda devolución se rechaza y **no libera un ejemplar ya prestado a otro socio**
  ni recalcula la multa; 3 devoluciones simultáneas registran una sola; estados Dañado / En mantenimiento se respetan.
- **Concurrencia:** 8 pedidos del mismo socio → 3; 5 socios por el mismo ejemplar → 1.
- **Un ejemplar Prestado** no puede cambiar de estado ni borrarse a mano; un Disponible no puede marcarse Prestado a mano.
- **Integridad en la BD (SQL directo):** el `CHECK` de fechas, el índice único parcial de ejemplar activo, los estados válidos y todas
  las claves foráneas rechazan lo inválido.
- **Dashboard y catálogo:** las 5 tarjetas y los conteos de ejemplares disponibles coinciden con la base.

## 5. Observaciones y mejoras recomendadas (no corregidas)

Son decisiones de diseño o endurecimiento fuera del alcance del TP. La batería las informa como `NOTA`.

| ID | Sev. | Observación | Recomendación |
|---|---|---|---|
| N1 | Media | **Sin límite de intentos de login** (12 intentos fallidos seguidos sin bloqueo). | `express-rate-limit` en `POST /login` (p. ej. 10 intentos / 15 min por IP + email). |
| N2 | Media | **Credenciales por defecto en el repositorio:** `crearUsuario.js` crea `cesar@biblioteca.com` / `admincesar2026` si faltan `ADMIN_EMAIL`/`ADMIN_PASSWORD`, y las pruebas llevan `admin@biblioteca.com` / `AdminBiblioteca2026!` escritas. | Exigir las variables de entorno (sin valores por defecto) y leer las credenciales de las pruebas del `.env`. |
| N3 | Media | **Registro público (agregado después a pedido):** la pantalla de login tiene el enlace "Registrate" hacia `/registro`. Cualquiera que se registre obtiene acceso completo al sistema (no hay roles). | Si hace falta distinguir, agregar un rol (admin/bibliotecario) o aprobación por un administrador. |
| N4 | Info | El **máximo de 3 préstamos abiertos** y la **coherencia ejemplar ↔ préstamo** viven en la aplicación (transacciones), no en la BD: un `INSERT` por SQL directo puede violarlas. | Opcional: triggers. Para el TP, la transacción con bloqueos es suficiente. |
| N5 | Info | Duplicados que solo difieren en **tildes** ("Cátedra"/"Catedra") se aceptan; el buscador sí ignora tildes. | Decisión de diseño; podría usarse `sin_tildes` en el índice único. |
| N6 | Info | Contraseñas: solo se exige longitud (12–72), sin complejidad. DNI `00000000` se acepta. | Aceptable para el alcance. |
| N7 | Info | `MemoryStore` de sesiones y sin cabeceras de seguridad (helmet). | Para producción: store persistente y `helmet`. |
| N8 | Info | "Préstamos activos" (dashboard y filtro) excluye los Vencidos, que siguen abiertos y cuentan para el límite de 3 (decisión documentada en el README). | Mantener, o rotular "Vigentes". |
| N9 | Info | La **suite original depende de datos de tu base de desarrollo** (socio `juan@email.com`, DNI `12345678`, ISBN `9781234567890`, ≥1 préstamo previo). En una base recién sembrada 5 pruebas fallan por eso (no por la aplicación). | Que las pruebas creen sus propios datos de referencia. `reglas.js` ya es autónoma. |

## 6. Archivos modificados

- **Nuevos:** `middlewares/entradaSegura.js`, `utils/errores.js`, `database/migracion_005_unicidad_y_checks.sql`, `pruebas/reglas.js`.
- **Lógica:** `models/prestamoModel.js`, `models/usuarioModel.js`, `controllers/prestamoController.js`, `controllers/authController.js`,
  `index.js`, `middlewares/viewsMiddleware.js`.
- **Validadores:** `prestamo`, `socio`, `libro`, `ejemplar`, `usuario`, `autor`, `categoria`, `editorial`.
- **Controladores (solo código 400):** autor, categoría, editorial, libro, ejemplar.
- **Vistas:** `prestamos/{nuevo,lista,detalle,historialSocio,historialEjemplar}`, `libros/{nuevo,editar}`, `socios/{nuevo,editar}`, `ejemplares/{nuevo,editar}`.
- **Otros:** `database/schema.sql`, `README.md`, `package.json` (`npm test` ahora corre las 3 suites), `pruebas/catalogos.js` (3 aserciones 200 → 400).

Los cambios están **sin commitear**; `git diff` muestra todo.

## 7. Pasos para aplicar en tu entorno

1. Aplicar la migración (verifica antes que no haya datos que la violen; en tu base no los hay):
   ```bash
   node database/ejecutar.js database/migracion_005_unicidad_y_checks.sql
   ```
2. Reiniciar la aplicación (`npm start`) y correr `npm test` con ella iniciada. La suite `reglas.js` falla en L03/L04/E03/B09/B11
   si la migración 005 no está aplicada.
3. Revisar `git diff` y commitear. No hay dependencias nuevas.

## 8. Cómo repetir la auditoría

```bash
npm start            # en una terminal
npm test             # en otra: catalogos + entidades + reglas
node pruebas/reglas.js prestamos   # una sola área: auth|socios|catalogos|libros|ejemplares|prestamos|bd|robustez
```
