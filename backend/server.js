import client from 'prom-client';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import connectDB from './config/db.js';
import { PORT } from './config/utils.js';
import authRouter from './routes/auth.js';
import postsRouter from './routes/posts.js';
import { connectToRedis } from './services/redis.js';
const app = express();
const register = new client.Registry();

client.collectDefaultMetrics({
  register,
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5],
});

register.registerMetric(httpRequestDuration);

app.use((req, res, next) => {
  const start = process.hrtime();

  res.on('finish', () => {
    const diff = process.hrtime(start);
    const duration = diff[0] + diff[1] / 1e9;

    httpRequestDuration.observe(
      {
        method: req.method,
        route: req.route?.path || req.path,
        status_code: res.statusCode,
      },
      duration
    );
  });

  next();
});
const port = PORT || 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(cookieParser());
app.use(compression());

// Connect to database
connectDB();

// Connect to redis
connectToRedis();

// API route
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
  });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
app.use('/api/posts', postsRouter);
app.use('/api/auth', authRouter);

app.get('/', (req, res) => {
  res.send('Yay!! Backend of wanderlust prod app is now accessible');
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on port ${port}`);
});

export default app;
