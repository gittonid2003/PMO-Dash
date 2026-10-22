const fs = require('fs');
const path = require('path');

exports.up = (pgm) => {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  pgm.sql(schema);
};

exports.down = () => {
  throw new Error('The initial schema migration cannot be rolled back automatically.');
};