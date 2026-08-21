import { Request, Response } from 'express';
import { searchService } from '../services/search.service';
import { globalSearchQuerySchema } from '../schemas/search.schema';
import { HttpError } from '../utils/httpError';

function requireActingUser(req: Request) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  return req.user;
}

export const searchController = {
  async global(req: Request, res: Response) {
    const { q } = globalSearchQuerySchema.parse(req.query);
    const results = await searchService.globalSearch(requireActingUser(req), q);
    res.json(results);
  },
};
