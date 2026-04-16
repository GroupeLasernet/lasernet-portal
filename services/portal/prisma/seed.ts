// ============================================================
// DATABASE SEED SCRIPT
// Creates the admin user and any initial data
// Run: npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts
// Or: npx prisma db seed
// ============================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create admin user (Hugo)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@lasernet.ca' },
    update: {},
    create: {
      email: 'admin@lasernet.ca',
      name: 'Hugo Admin',
      password: 'admin123', // Change this in production!
      role: 'admin',
      company: 'LaserNet',
      phone: '514-555-0100',
      status: 'active',
    },
  });

  console.log(`Admin user created: ${admin.email} (id: ${admin.id})`);

  // Create sales user (admin with sales subrole)
  const sales = await prisma.user.upsert({
    where: { email: 'sales@lasernet.ca' },
    update: {},
    create: {
      email: 'sales@lasernet.ca',
      name: 'Sales Dev',
      password: 'sales123', // Change this in production!
      role: 'admin',
      subrole: 'sales',
      company: 'LaserNet',
      phone: '514-555-0101',
      status: 'active',
    },
  });

  console.log(`Sales user created: ${sales.email} (id: ${sales.id})`);

  // Create client user
  const client = await prisma.user.upsert({
    where: { email: 'client@lasernet.ca' },
    update: {},
    create: {
      email: 'client@lasernet.ca',
      name: 'Client Dev',
      password: 'client123', // Change this in production!
      role: 'client',
      company: 'LaserNet',
      phone: '514-555-0102',
      status: 'active',
    },
  });

  console.log(`Client user created: ${client.email} (id: ${client.id})`);

  console.log('Seed complete!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
