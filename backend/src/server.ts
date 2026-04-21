import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import express, { type Request, type Response } from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { verifySupabaseJwt } from './middleware/auth.js';
import { exportRouter } from './routes/export.js';
import { sectionsRouter } from './routes/sections.js';
import { sessionsListRouter } from './routes/sessions-list.js';
import { uploadRouter } from './routes/upload.js';

const app = express();
const port = Number(process.env.PORT ?? 3001);
const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';

app.use(
  cors({
    origin: frontendUrl,
  }),
);
app.use(express.json());

app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
    },
  });
});

app.use('/api', verifySupabaseJwt);
app.use('/api', exportRouter);
app.use('/api', uploadRouter);
app.use('/api', sectionsRouter);
app.use('/api', sessionsListRouter);

app.listen(port, () => {
  console.warn(`Backend listening on http://localhost:${port}`);
});
