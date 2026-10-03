import path from 'node:path';
import express from 'express';
import { requireSession } from './auth.js';

export function newArgumentPage(dbFile, siteDir) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(requireSession(dbFile, {
    loginRedirect: '/user/?next=%2Fargument%2Fnew%2F',
  }));
  router.use(express.static(path.join(siteDir, 'new')));
  return router;
}
