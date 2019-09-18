--
-- PostgreSQL database dump
--

-- Dumped from database version 11.1 (Debian 11.1-1.pgdg90+1)
-- Dumped by pg_dump version 11.1 (Debian 11.1-1.pgdg90+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_with_oids = false;

--
-- Name: movies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.movies (
    title character varying(40) NOT NULL,
    released date
);


ALTER TABLE public.movies OWNER TO postgres;

--
-- Data for Name: movies; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.movies (title, released) FROM stdin;
The Incredibles	2004-11-05
V for Vendetta	2006-03-17
The Usual Suspects	1995-08-16
Batman	1989-06-23
Batman Returns	1992-06-19
The Lego Batman Movie	2017-02-10
Batman Begins	2005-06-15
Batman & Robin	1997-06-20
\.


--
-- PostgreSQL database dump complete
--

