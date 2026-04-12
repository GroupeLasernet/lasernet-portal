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
