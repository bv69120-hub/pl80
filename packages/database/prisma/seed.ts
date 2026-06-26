import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Admin123!", 12);

  await prisma.user.upsert({
    where: {
      username: "admin",
    },
    update: {
      passwordHash,
      role: "ADMIN",
    },
    create: {
      username: "admin",
      passwordHash,
      role: "ADMIN",
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
