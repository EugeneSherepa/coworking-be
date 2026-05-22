import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

function guard(req: AuthRequest, res: Response): boolean {
  if (req.user!.role !== 'ADMIN') {
    res.status(403).json({ error: 'Admin access required' });
    return false;
  }
  return true;
}

router.get('/stats', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!guard(req, res)) return;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalRev, monthlyRev, activeBookings, totalBookings, totalMembers, confirmedWithWs] =
    await Promise.all([
      prisma.booking.aggregate({ where: { status: 'CONFIRMED' }, _sum: { totalAmount: true } }),
      prisma.booking.aggregate({
        where: { status: 'CONFIRMED', createdAt: { gte: startOfMonth } },
        _sum: { totalAmount: true },
      }),
      prisma.booking.count({ where: { status: 'CONFIRMED', endDate: { gte: now } } }),
      prisma.booking.count(),
      prisma.user.count(),
      prisma.booking.findMany({
        where: { status: 'CONFIRMED' },
        include: { workspace: { select: { type: true, location: true } } },
      }),
    ]);

  const bookingsByType: Record<string, number> = {};
  const bookingsByLocation: Record<string, number> = {};
  for (const b of confirmedWithWs) {
    bookingsByType[b.workspace.type] = (bookingsByType[b.workspace.type] ?? 0) + 1;
    bookingsByLocation[b.workspace.location] = (bookingsByLocation[b.workspace.location] ?? 0) + 1;
  }

  res.json({
    totalRevenue: totalRev._sum.totalAmount ?? 0,
    monthlyRevenue: monthlyRev._sum.totalAmount ?? 0,
    activeBookings,
    totalBookings,
    totalMembers,
    bookingsByType,
    bookingsByLocation,
  });
});

router.get('/users', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!guard(req, res)) return;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      createdAt: true,
      _count: { select: { bookings: true } },
      bookings: { where: { status: 'CONFIRMED' }, select: { totalAmount: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(
    users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      phone: u.phone,
      createdAt: u.createdAt,
      totalBookings: u._count.bookings,
      totalSpent: u.bookings.reduce((s, b) => s + b.totalAmount, 0),
    }))
  );
});

router.get('/users/:id/bookings', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!guard(req, res)) return;

  const bookings = await prisma.booking.findMany({
    where: { userId: req.params.id },
    include: {
      workspace: { select: { number: true, name: true, type: true, location: true } },
    },
    orderBy: { startDate: 'desc' },
  });

  res.json(bookings);
});

router.get('/locations/:location', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!guard(req, res)) return;

  const { location } = req.params;
  const now = new Date();

  const workspaces = await prisma.workspace.findMany({
    where: { location: location.toUpperCase() as any },
    include: {
      bookings: {
        where: { status: 'CONFIRMED', endDate: { gte: now } },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
        },
        orderBy: { startDate: 'asc' },
      },
    },
    orderBy: [{ type: 'asc' }, { number: 'asc' }],
  });

  res.json(workspaces);
});

export default router;
