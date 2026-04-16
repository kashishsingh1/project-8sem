const { Pool } = require('@neondatabase/serverless');
require('dotenv').config();

// Use the connection string with the -pooler suffix from Neon console
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
});

/**
 * Executes a query using the connection pool.
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 */
const query = (text, params) => pool.query(text, params);

module.exports = {
  query,
  pool,
};
