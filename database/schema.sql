-- Esquema de la base de datos del sistema de biblioteca (PostgreSQL).
-- Generado con pg_dump --schema-only. Ejecutar con: npm run db:schema

--
-- PostgreSQL database dump
--


-- Dumped from database version 18.0
-- Dumped by pg_dump version 18.0

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: sin_tildes(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sin_tildes(texto text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
    SELECT translate(
        lower(texto),
        'áéíóúüàèìòùâêîôû',
        'aeiouuaeiouaeiou'
    )
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: autores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.autores (
    id_autor integer NOT NULL,
    nombre character varying(100) NOT NULL,
    apellido character varying(100) NOT NULL
);


--
-- Name: autores_id_autor_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.autores ALTER COLUMN id_autor ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.autores_id_autor_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: categorias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categorias (
    id_categoria integer NOT NULL,
    nombre character varying(100) NOT NULL,
    descripcion character varying(255)
);


--
-- Name: categorias_id_categoria_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.categorias ALTER COLUMN id_categoria ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.categorias_id_categoria_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: detalle_prestamo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.detalle_prestamo (
    id_detalle integer NOT NULL,
    id_prestamo integer NOT NULL,
    id_ejemplar integer NOT NULL,
    dias_atraso integer,
    multa numeric(10,2),
    prestamo_activo boolean DEFAULT true NOT NULL
);


--
-- Name: detalle_prestamo_id_detalle_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.detalle_prestamo ALTER COLUMN id_detalle ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.detalle_prestamo_id_detalle_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: editoriales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.editoriales (
    id_editorial integer NOT NULL,
    nombre character varying(150) NOT NULL
);


--
-- Name: editoriales_id_editorial_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.editoriales ALTER COLUMN id_editorial ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.editoriales_id_editorial_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ejemplares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ejemplares (
    id_ejemplar integer NOT NULL,
    codigo_inventario character varying(50) NOT NULL,
    id_libro integer NOT NULL,
    estado character varying(20) NOT NULL,
    CONSTRAINT ejemplares_estado_check CHECK (((estado)::text = ANY ((ARRAY['Disponible'::character varying, 'Prestado'::character varying, 'Dañado'::character varying, 'En mantenimiento'::character varying])::text[])))
);


--
-- Name: ejemplares_id_ejemplar_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.ejemplares ALTER COLUMN id_ejemplar ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.ejemplares_id_ejemplar_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: libros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.libros (
    id_libro integer NOT NULL,
    isbn character varying(20) NOT NULL,
    titulo character varying(200) NOT NULL,
    anio_publicacion integer NOT NULL,
    id_autor integer NOT NULL,
    id_categoria integer NOT NULL,
    id_editorial integer NOT NULL,
    CONSTRAINT libros_anio_publicacion_check CHECK (((anio_publicacion)::numeric <= EXTRACT(year FROM CURRENT_DATE)))
);


--
-- Name: libros_id_libro_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.libros ALTER COLUMN id_libro ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.libros_id_libro_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: prestamos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prestamos (
    id_prestamo integer NOT NULL,
    id_socio integer NOT NULL,
    fecha_prestamo date NOT NULL,
    fecha_vencimiento date NOT NULL,
    fecha_devolucion date,
    estado character varying(20) NOT NULL,
    CONSTRAINT prestamos_estado_check CHECK (((estado)::text = ANY ((ARRAY['Activo'::character varying, 'Devuelto'::character varying, 'Vencido'::character varying])::text[])))
);


--
-- Name: prestamos_id_prestamo_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.prestamos ALTER COLUMN id_prestamo ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.prestamos_id_prestamo_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: socios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.socios (
    id_socio integer NOT NULL,
    nombre character varying(100) NOT NULL,
    apellido character varying(100) NOT NULL,
    dni character varying(20) NOT NULL,
    email character varying(150) NOT NULL,
    telefono character varying(30),
    estado character varying(20) NOT NULL,
    CONSTRAINT socios_estado_check CHECK (((estado)::text = ANY ((ARRAY['Activo'::character varying, 'Inactivo'::character varying])::text[])))
);


--
-- Name: socios_id_socio_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.socios ALTER COLUMN id_socio ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.socios_id_socio_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id_usuario integer NOT NULL,
    nombre character varying(100) NOT NULL,
    apellido character varying(100) NOT NULL,
    email character varying(150) NOT NULL,
    password character varying(255) NOT NULL
);


--
-- Name: usuarios_id_usuario_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.usuarios ALTER COLUMN id_usuario ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.usuarios_id_usuario_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: autores autores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.autores
    ADD CONSTRAINT autores_pkey PRIMARY KEY (id_autor);


--
-- Name: categorias categorias_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_nombre_key UNIQUE (nombre);


--
-- Name: categorias categorias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_pkey PRIMARY KEY (id_categoria);


--
-- Name: detalle_prestamo detalle_prestamo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalle_prestamo
    ADD CONSTRAINT detalle_prestamo_pkey PRIMARY KEY (id_detalle);


--
-- Name: editoriales editoriales_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.editoriales
    ADD CONSTRAINT editoriales_nombre_key UNIQUE (nombre);


--
-- Name: editoriales editoriales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.editoriales
    ADD CONSTRAINT editoriales_pkey PRIMARY KEY (id_editorial);


--
-- Name: ejemplares ejemplares_codigo_inventario_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ejemplares
    ADD CONSTRAINT ejemplares_codigo_inventario_key UNIQUE (codigo_inventario);


--
-- Name: ejemplares ejemplares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ejemplares
    ADD CONSTRAINT ejemplares_pkey PRIMARY KEY (id_ejemplar);


--
-- Name: libros libros_isbn_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.libros
    ADD CONSTRAINT libros_isbn_key UNIQUE (isbn);


--
-- Name: libros libros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.libros
    ADD CONSTRAINT libros_pkey PRIMARY KEY (id_libro);


--
-- Name: prestamos prestamos_fechas_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.prestamos
    ADD CONSTRAINT prestamos_fechas_check CHECK ((fecha_vencimiento >= fecha_prestamo)) NOT VALID;


--
-- Name: prestamos prestamos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestamos
    ADD CONSTRAINT prestamos_pkey PRIMARY KEY (id_prestamo);


--
-- Name: socios socios_dni_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.socios
    ADD CONSTRAINT socios_dni_key UNIQUE (dni);


--
-- Name: socios socios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.socios
    ADD CONSTRAINT socios_pkey PRIMARY KEY (id_socio);


--
-- Name: usuarios usuarios_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id_usuario);


--
-- Name: autores_nombre_apellido_lower_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX autores_nombre_apellido_lower_key ON public.autores USING btree (lower((nombre)::text), lower((apellido)::text));


--
-- Name: categorias_nombre_lower_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX categorias_nombre_lower_key ON public.categorias USING btree (lower((nombre)::text));


--
-- Name: detalle_prestamo_ejemplar_activo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX detalle_prestamo_ejemplar_activo_key ON public.detalle_prestamo USING btree (id_ejemplar) WHERE prestamo_activo;


--
-- Name: editoriales_nombre_lower_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX editoriales_nombre_lower_key ON public.editoriales USING btree (lower((nombre)::text));


--
-- Name: detalle_prestamo detalle_prestamo_id_ejemplar_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalle_prestamo
    ADD CONSTRAINT detalle_prestamo_id_ejemplar_fkey FOREIGN KEY (id_ejemplar) REFERENCES public.ejemplares(id_ejemplar);


--
-- Name: detalle_prestamo detalle_prestamo_id_prestamo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalle_prestamo
    ADD CONSTRAINT detalle_prestamo_id_prestamo_fkey FOREIGN KEY (id_prestamo) REFERENCES public.prestamos(id_prestamo);


--
-- Name: ejemplares ejemplares_id_libro_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ejemplares
    ADD CONSTRAINT ejemplares_id_libro_fkey FOREIGN KEY (id_libro) REFERENCES public.libros(id_libro);


--
-- Name: libros libros_id_autor_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.libros
    ADD CONSTRAINT libros_id_autor_fkey FOREIGN KEY (id_autor) REFERENCES public.autores(id_autor);


--
-- Name: libros libros_id_categoria_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.libros
    ADD CONSTRAINT libros_id_categoria_fkey FOREIGN KEY (id_categoria) REFERENCES public.categorias(id_categoria);


--
-- Name: libros libros_id_editorial_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.libros
    ADD CONSTRAINT libros_id_editorial_fkey FOREIGN KEY (id_editorial) REFERENCES public.editoriales(id_editorial);


--
-- Name: prestamos prestamos_id_socio_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestamos
    ADD CONSTRAINT prestamos_id_socio_fkey FOREIGN KEY (id_socio) REFERENCES public.socios(id_socio);


--
-- PostgreSQL database dump complete
--


