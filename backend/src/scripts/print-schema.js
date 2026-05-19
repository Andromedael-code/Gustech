import fs from 'node:fs/promises';
import path from 'node:path';

const schemaPath = path.resolve('src/db/schema.sql');
const content = await fs.readFile(schemaPath, 'utf8');
console.log(content);
