const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function initializeDatabase() {
  const schemaPath = path.resolve(__dirname, '../../schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(schema);
  console.log('Database schema is ready');
}

module.exports = { initializeDatabase };

