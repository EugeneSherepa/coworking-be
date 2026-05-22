import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { location, type, date } = req.query;

  const where: Record<string, unknown> = { status: 'AVAILABLE' };
  if (location) where.location = String(location).toUpperCase();
  if (type) where.type = String(type).toUpperCase();

  const workspaces = await prisma.workspace.findMany({
    where,
    include: {
      bookings: date
        ? {
            where: {
              status: { in: ['PENDING', 'CONFIRMED'] },
              startDate: { lte: new Date(String(date)) },
              endDate: { gte: new Date(String(date)) },
            },
          }
        : false,
    },
    orderBy: [{ location: 'asc' }, { type: 'asc' }, { number: 'asc' }],
  });

  const result = workspaces.map((w) => ({
    ...w,
    isBooked: date ? (w.bookings as unknown[]).length > 0 : false,
    bookings: undefined,
  }));

  res.json(result);
});

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const workspace = await prisma.workspace.findUnique({
    where: { id: req.params.id },
  });
  if (!workspace) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  res.json(workspace);
});

const createWorkspaceSchema = z.object({
  number: z.string(),
  name: z.string().optional(),
  type: z.enum(['OPEN_SPACE', 'FIXED_DESK', 'MEETING_ROOM']),
  location: z.enum(['PODIL', 'PECHERSK', 'OSOKORKY']),
  mapX: z.number(),
  mapY: z.number(),
  hourlyRate: z.number().positive().optional(),
  dailyRate: z.number().positive().optional(),
  weeklyRate: z.number().positive().optional(),
  monthlyRate: z.number().positive().optional(),
  description: z.string().optional(),
});

router.post(
  '/',
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const result = createWorkspaceSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.errors[0].message });
      return;
    }
    const workspace = await prisma.workspace.create({ data: result.data });
    res.status(201).json(workspace);
  }
);

router.patch(
  '/:id/status',
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { status } = req.body;
    if (!['AVAILABLE', 'UNAVAILABLE'].includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }
    const workspace = await prisma.workspace.update({
      where: { id: req.params.id },
      data: { status },
    });
    res.json(workspace);
  }
);

export default router;
