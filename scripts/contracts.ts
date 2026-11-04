import { mkdir, writeFile } from 'node:fs/promises';
import { buildApp } from '../apps/api/src/app.js';
import { database, migrate } from '../apps/api/src/db.js';
const db = await database({ memory: true });
await migrate(db);
const app = await buildApp({ db });
await app.ready();
try {
  const spec = app.swagger();
  await mkdir('docs/api', { recursive: true });
  await writeFile('docs/api/openapi.json', JSON.stringify(spec, null, 2));
  const collection = {
    info: {
      name: 'DentalRisk API',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    variable: [
      { key: 'baseUrl', value: 'http://localhost:3000' },
      { key: 'csrf', value: '' },
      { key: 'stationToken', value: '' },
      { key: 'id', value: '' },
      { key: 'from', value: '2026-10-21' },
      { key: 'to', value: '2026-10-21' },
      { key: 'month', value: '2026-10' },
      { key: 'day', value: '2026-10-21' },
    ],
    item: Object.entries(spec.paths ?? {}).flatMap(([path, methods]) =>
      Object.entries(methods ?? {})
        .filter(([m]) => ['get', 'post', 'patch'].includes(m))
        .map(([method, operation]: any) => {
          const body = operation.requestBody?.content?.['application/json']?.schema;
          const requiredQuery = (operation.parameters ?? [])
            .filter((p: any) => p.in === 'query' && p.required)
            .map((p: any) => `${p.name}=${p.name === 'format' ? 'csv' : '{{' + p.name + '}}'}`)
            .join('&');
          return {
            name: `${method.toUpperCase()} ${path}`,
            request: {
              method: method.toUpperCase(),
              header: [
                { key: 'Content-Type', value: 'application/json' },
                { key: 'Origin', value: '{{baseUrl}}' },
                { key: 'x-csrf-token', value: '{{csrf}}' },
                ...(path.endsWith('/rfid/events')
                  ? [{ key: 'Authorization', value: 'Bearer {{stationToken}}' }]
                  : []),
              ],
              description: operation.description ?? '',
              url:
                '{{baseUrl}}' +
                path.replace(/\{([^}]+)\}/g, '{{$1}}') +
                (requiredQuery ? '?' + requiredQuery : ''),
              ...(body ? { body: { mode: 'raw', raw: JSON.stringify(example(body), null, 2) } } : {}),
            },
            ...(path === '/api/v1/sessions' && method === 'post'
              ? {
                  event: [
                    {
                      listen: 'test',
                      script: {
                        type: 'text/javascript',
                        exec: [
                          'if (pm.response.code === 200) { pm.collectionVariables.set("csrf", pm.response.json().csrf); }',
                        ],
                      },
                    },
                  ],
                }
              : {}),
          };
        }),
    ),
  };
  await writeFile('docs/api/postman.json', JSON.stringify(collection, null, 2));
  console.log('OpenAPI y colección Postman generados.');
} finally {
  await app.close();
  await db.close();
}
function example(schema: any): any {
  if (schema.type === 'object')
    return Object.fromEntries(
      Object.entries(schema.properties ?? {})
        .filter(([k]) => schema.required?.includes(k))
        .map(([k, v]) => [k, example(v)]),
    );
  if (schema.enum) return schema.enum[0];
  if (schema.type === 'boolean') return true;
  if (schema.type === 'integer' || schema.type === 'number') return schema.minimum ?? 1;
  if (schema.type === 'array') return [];
  if (schema.format === 'uuid') return '00000000-0000-4000-8000-000000000001';
  if (schema.format === 'email') return 'admin@example.test';
  if (schema.format === 'date-time') return '2026-10-21T17:00:00Z';
  return 'REEMPLAZAR';
}
