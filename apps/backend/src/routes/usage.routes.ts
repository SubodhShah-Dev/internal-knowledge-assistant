import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getProviderLimits } from '../services/rateLimits';

export const usageRouter = Router();

/**
 * Reports the provider's rate-limit state for the API key in use (as sent by
 * the provider on its last response). Purely informational: the app never
 * blocks requests based on this.
 */
usageRouter.get('/', requireAuth, (_req, res) => {
  res.json(getProviderLimits());
});
