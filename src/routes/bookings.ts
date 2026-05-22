import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();

const createBookingSchema = z.object({
  workspaceId: z.string().cuid(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  plan: z.enum(["HOUR", "DAY", "WEEK", "MONTH"]),
});

router.post(
  "/",
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const result = createBookingSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.errors[0].message });
      return;
    }

    const { workspaceId, startDate, endDate, plan } = result.data;
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start >= end) {
      res.status(400).json({ error: "End date must be after start date" });
      return;
    }

    try {
      const booking = await prisma.$transaction(async (tx) => {
        const workspace = await tx.workspace.findUnique({
          where: { id: workspaceId },
        });
        if (!workspace || workspace.status === "UNAVAILABLE") {
          throw new Error("UNAVAILABLE");
        }

        if (workspace.type === "MEETING_ROOM" && plan !== "HOUR") {
          throw new Error("MEETING_ROOM_HOURLY_ONLY");
        }
        if (workspace.type !== "MEETING_ROOM" && plan === "HOUR") {
          throw new Error("HOURLY_MEETING_ROOMS_ONLY");
        }

        // Open space is a shared area — multiple passes can overlap
        if (workspace.type !== "OPEN_SPACE") {
          const conflict = await tx.booking.findFirst({
            where: {
              workspaceId,
              status: { in: ["PENDING", "CONFIRMED"] },
              AND: [{ startDate: { lt: end } }, { endDate: { gt: start } }],
            },
          });
          if (conflict) {
            throw new Error("CONFLICT");
          }
        }

        let totalAmount: number;
        if (plan === "HOUR") {
          const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
          totalAmount = Math.round(workspace.hourlyRate! * hours * 100) / 100;
        } else if (plan === "DAY") {
          totalAmount = workspace.dailyRate!;
        } else if (plan === "WEEK") {
          totalAmount = workspace.weeklyRate!;
        } else {
          totalAmount = workspace.monthlyRate!;
        }

        return tx.booking.create({
          data: {
            userId: req.user!.id,
            workspaceId,
            startDate: start,
            endDate: end,
            plan,
            status: "CONFIRMED",
            totalAmount,
          },
          include: {
            workspace: { select: { number: true, type: true, location: true } },
            user: { select: { name: true, email: true } },
          },
        });
      });

      res.status(201).json(booking);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message === "CONFLICT") {
        res
          .status(409)
          .json({
            error: "This workspace is already booked for the selected period",
          });
      } else if (message === "UNAVAILABLE") {
        res.status(409).json({ error: "This workspace is not available" });
      } else if (message === "MEETING_ROOM_HOURLY_ONLY") {
        res
          .status(400)
          .json({ error: "Meeting rooms can only be booked by the hour" });
      } else if (message === "HOURLY_MEETING_ROOMS_ONLY") {
        res
          .status(400)
          .json({
            error: "Hourly booking is only available for meeting rooms",
          });
      } else {
        res.status(500).json({ error: "Failed to create booking" });
      }
    }
  },
);

router.get(
  "/my",
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const bookings = await prisma.booking.findMany({
      where: { userId: req.user!.id },
      include: {
        workspace: {
          select: { number: true, name: true, type: true, location: true, dailyRate: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(bookings);
  },
);

router.patch(
  "/:id/cancel",
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
    });

    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    if (booking.userId !== req.user!.id && req.user!.role !== "ADMIN") {
      res.status(403).json({ error: "Not authorized" });
      return;
    }

    if (booking.status === "CANCELLED") {
      res.status(400).json({ error: "Booking is already cancelled" });
      return;
    }

    const updated = await prisma.booking.update({
      where: { id: req.params.id },
      data: { status: "CANCELLED" },
    });

    res.json(updated);
  },
);

router.get(
  "/admin/all",
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    if (req.user!.role !== "ADMIN") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const { status, location } = req.query;
    const where: Record<string, unknown> = {};
    if (status) where.status = String(status).toUpperCase();

    const bookings = await prisma.booking.findMany({
      where,
      include: {
        workspace: { select: { number: true, type: true, location: true } },
        user: { select: { name: true, email: true, phone: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const filtered = location
      ? bookings.filter(
          (b) => b.workspace.location === String(location).toUpperCase(),
        )
      : bookings;

    res.json(filtered);
  },
);

export default router;
