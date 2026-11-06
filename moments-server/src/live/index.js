import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env.live') });
const { createLiveApp } = await import('./server.js');
const live = createLiveApp();
const server = live.app.listen(Number(process.env.LIVE_PORT || 3021), process.env.LIVE_HOST || '127.0.0.1', () => console.log(`Moments Live listening on port ${process.env.LIVE_PORT || 3021}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { live.close(); process.exit(0); }));
