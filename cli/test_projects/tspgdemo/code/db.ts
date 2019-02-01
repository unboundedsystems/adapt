import { Pool } from "pg";

const pool = new Pool();
export async function getFirstMovieFromDB() {
    const result = await pool.query("SELECT title FROM movies LIMIT 1");
    return result.rows[0].title;
}
