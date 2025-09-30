import { Express } from 'express';
import postRoutes from './posts';
import categoryRoutes from './categories';

export const setupRoutes = (app: Express): void => {
  app.use('/api/v1/posts', postRoutes);
  app.use('/api/v1/categories', categoryRoutes);

  app.use('*', (req, res) => {
    res.status(404).json({
      success: false,
      error: `Route ${req.method} ${req.originalUrl} not found`
    });
  });
};