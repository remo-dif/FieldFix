import { createServer } from 'node:http';

// Development-only API. It never acknowledges report writes, so local test reports stay queued.
const accountId = 'demo-technician';
const tasks = [
  {
    id: 'demo-task-001',
    title: 'Inspect ventilation unit',
    assetId: 'HVAC-104',
    lastModifiedTimestamp: '2026-09-17T00:00:00.000Z',
  },
];

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

createServer((request, response) => {
  const path = new URL(request.url ?? '/', 'http://127.0.0.1:3000').pathname;
  if (request.method === 'GET' && path === '/api/session') {
    json(response, 200, { accountId });
  } else if (request.method === 'GET' && path === `/api/accounts/${accountId}/tasks`) {
    json(response, 200, tasks);
  } else if (request.method === 'PUT' && path.startsWith(`/api/accounts/${accountId}/reports/`)) {
    json(response, 503, { error: 'The development API does not accept reports; they remain queued.' });
  } else {
    json(response, 404, { error: 'Unknown development API endpoint' });
  }
}).listen(3000, '127.0.0.1', () => {
  console.log('FieldFix development API listening on http://127.0.0.1:3000');
});
