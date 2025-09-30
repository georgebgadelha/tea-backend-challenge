import fs from 'fs';
import path from 'path';
import specs from '../config/swagger';

const outPath = path.resolve(process.cwd(), 'swagger.json');

fs.writeFileSync(outPath, JSON.stringify(specs, null, 2), 'utf8');
console.log(`Wrote OpenAPI spec to ${outPath}`);
