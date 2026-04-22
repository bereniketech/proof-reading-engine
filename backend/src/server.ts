import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import express, { type Request, type Response } from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { verifySupabaseJwt } from './middleware/auth.js';
import { exportRouter } from './routes/export.js';
import { insightsRouter } from './routes/insights.js';
import { profileRouter } from './routes/profile.js';
import { sectionsRouter } from './routes/sections.js';
import { sessionsListRouter } from './routes/sessions-list.js';
import { sessionsReviewRouter } from './routes/sessions-review.js';
import { sessionsCompletenessRouter } from './routes/sessions-completeness.js';
import { sessionsToneRouter } from './routes/sessions-tone.js';
import { sessionsDiffRouter } from './routes/sessions-diff.js';
import { sessionsChatRouter } from './routes/sessions-chat.js';
import { sessionsCitationsRouter } from './routes/sessions-citations.js';
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
app.use('/api', insightsRouter);
app.use('/api', profileRouter);
app.use('/api', uploadRouter);
app.use('/api', sectionsRouter);
app.use('/api', sessionsListRouter);
app.use('/api', sessionsReviewRouter);
app.use('/api', sessionsCompletenessRouter);
app.use('/api', sessionsToneRouter);
app.use('/api', sessionsDiffRouter);
app.use('/api', sessionsChatRouter);
app.use('/api', sessionsCitationsRouter);

app.listen(port, () => {
  console.warn(`Backend listening on http://localhost:${port}`);
});
