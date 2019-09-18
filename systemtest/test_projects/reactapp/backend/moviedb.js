const { Pool } = require("pg");

const pool = new Pool();

exports.find = async function find(text) {
    const query = `SELECT * FROM movies WHERE LOWER(title) LIKE LOWER($1)`;
    const params = [ `%${text}%` ];
    const result = await pool.query(query, params);
    return result.rows;
}
