import { prisma } from './lib/prisma.js';

async function main() {
  await prisma.$connect();
  console.log('Prisma connected successfully.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
