import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  await prisma.booking.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();

  const adminHash = await bcrypt.hash('admin123', 10);
  const userHash = await bcrypt.hash('user1234', 10);

  const admin = await prisma.user.create({
    data: {
      name: 'Admin Spark',
      email: 'admin@spark.co',
      passwordHash: adminHash,
      role: 'ADMIN',
      phone: '+380991234567',
    },
  });

  const resident = await prisma.user.create({
    data: {
      name: 'Olha Kovalenko',
      email: 'olha@example.com',
      passwordHash: userHash,
      role: 'RESIDENT',
      phone: '+380997654321',
    },
  });

  console.log('✅ Users created:', admin.email, resident.email);

  const locations = ['PODIL', 'PECHERSK', 'OSOKORKY'] as const;

  const workspaces = [];

  for (const location of locations) {
    const row = locations.indexOf(location);
    const yBase = row * 200;

    workspaces.push({
      number: 'OS',
      type: 'OPEN_SPACE' as const,
      location,
      mapX: 190,
      mapY: yBase + 100,
      dailyRate: 10,
      weeklyRate: 63,
      monthlyRate: 210,
      description: 'Shared open workspace area — book a day, week, or month pass for flexible access',
    });

    const fixedDesks = [
      { number: 'A1', mapX: 42, mapY: 61 },
      { number: 'A2', mapX: 100, mapY: 61 },
      { number: 'A3', mapX: 174, mapY: 61 },
      { number: 'A4', mapX: 231, mapY: 61 },
      { number: 'A5', mapX: 42, mapY: 125 },
      { number: 'A6', mapX: 100, mapY: 126 },
      { number: 'A7', mapX: 174, mapY: 126 },
      { number: 'A8', mapX: 231, mapY: 126 },
      { number: 'B1', mapX: 369, mapY: 61 },
      { number: 'B2', mapX: 426, mapY: 62 },
      { number: 'B3', mapX: 500, mapY: 62 },
      { number: 'B4', mapX: 557, mapY: 62 },
      { number: 'B5', mapX: 369, mapY: 126 },
      { number: 'B6', mapX: 426, mapY: 127 },
      { number: 'B7', mapX: 500, mapY: 127 },
      { number: 'B8', mapX: 557, mapY: 127 },
      { number: 'O1', mapX: 207, mapY: 226 },
      { number: 'O2', mapX: 264, mapY: 227 },
      { number: 'O3', mapX: 338, mapY: 227 },
      { number: 'O4', mapX: 395, mapY: 227 },
      { number: 'O5', mapX: 207, mapY: 272 },
      { number: 'O6', mapX: 264, mapY: 273 },
      { number: 'O7', mapX: 338, mapY: 273 },
      { number: 'O8', mapX: 395, mapY: 273 },
    ];
    for (const fd of fixedDesks) {
      workspaces.push({
        number: fd.number,
        type: 'FIXED_DESK' as const,
        location,
        mapX: fd.mapX,
        mapY: fd.mapY,
        dailyRate: 15,
        weeklyRate: 95,
        monthlyRate: 350,
        description: 'Dedicated fixed desk with personal storage',
      });
    }

    const meetingRooms = [
      { name: 'The Focus Room', hourlyRate: 15, description: '2–4 people, ideal for calls & focused work' },
      { name: 'The Studio',     hourlyRate: 28, description: '6–8 people, great for workshops & presentations' },
      { name: 'The Boardroom',  hourlyRate: 45, description: 'Up to 16 people, fully equipped for large meetings' },
    ];
    meetingRooms.forEach((room, i) => {
      workspaces.push({
        number: `MR-${String(i + 1).padStart(2, '0')}`,
        name: room.name,
        type: 'MEETING_ROOM' as const,
        location,
        mapX: 60 + i * 140,
        mapY: yBase + 320,
        hourlyRate: room.hourlyRate,
        description: room.description,
      });
    });
  }

  await prisma.workspace.createMany({ data: workspaces });
  console.log(`✅ Created ${workspaces.length} workspaces across 3 locations`);

  const podilOpenSpace = await prisma.workspace.findFirst({
    where: { location: 'PODIL', type: 'OPEN_SPACE' },
  });
  const podilFixedDesk = await prisma.workspace.findFirst({
    where: { location: 'PODIL', type: 'FIXED_DESK' },
  });

  if (podilOpenSpace && podilFixedDesk) {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);

    await prisma.booking.createMany({
      data: [
        {
          userId: resident.id,
          workspaceId: podilOpenSpace.id,
          startDate: tomorrow,
          endDate: new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000),
          plan: 'DAY',
          status: 'CONFIRMED',
          totalAmount: 10,
        },
        {
          userId: resident.id,
          workspaceId: podilFixedDesk.id,
          startDate: nextWeek,
          endDate: new Date(nextWeek.getTime() + 7 * 24 * 60 * 60 * 1000),
          plan: 'WEEK',
          status: 'CONFIRMED',
          totalAmount: 95,
        },
      ],
    });

    console.log('✅ Sample bookings created');
  }

  console.log('\n🎉 Seed complete!');
  console.log('  Admin:    admin@spark.co    / admin123');
  console.log('  Resident: olha@example.com  / user1234');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
