import { PrismaPg } from "@prisma/adapter-pg";
import { hashToStorage } from "../../src/auth/password.js";
import { PrismaClient } from "../../src/generated/prisma/client.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Seeded credentials (plaintext for local use). Stored as `salt:hash` via the
// same helper the auth flow uses, so the seeded admin can actually log in.
const ADMIN_PASSWORD = hashToStorage("Admin123!");
const PLAYER_PASSWORD = hashToStorage("Player123!");

async function main() {
  console.log("🌱 Starting seed...");

  // Create default roles
  const adminRole = await prisma.role.upsert({
    where: { name: "admin" },
    update: {},
    create: {
      name: "admin",
    },
  });

  const userRole = await prisma.role.upsert({
    where: { name: "user" },
    update: {},
    create: {
      name: "user",
    },
  });

  const playerRole = await prisma.role.upsert({
    where: { name: "player" },
    update: {},
    create: {
      name: "player",
    },
  });

  console.log("✅ Roles created:", { adminRole, userRole, playerRole });

  // Create admin user
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@gonnaplay.com" },
    update: { password: ADMIN_PASSWORD },
    create: {
      email: "admin@gonnaplay.com",
      password: ADMIN_PASSWORD,
      name: "Admin User",
      birthDate: "1990-01-01",
      isActive: true,
      isEmailVerified: true,
    },
  });

  // Create player user
  const playerUser = await prisma.user.upsert({
    where: { email: "player1@gonnaplay.com" },
    update: { password: PLAYER_PASSWORD },
    create: {
      email: "player1@gonnaplay.com",
      password: PLAYER_PASSWORD,
      name: "John Striker",
      birthDate: "1995-05-15",
      city: "New York",
      country: "USA",
      gender: "male",
      isActive: true,
      isEmailVerified: true,
    },
  });

  // Create user roles
  const existingAdminRole = await prisma.userRole.findFirst({
    where: {
      userId: adminUser.id,
      roleId: adminRole.id,
    },
  });

  if (!existingAdminRole) {
    await prisma.userRole.create({
      data: {
        userId: adminUser.id,
        roleId: adminRole.id,
      },
    });
  }

  const existingPlayerUserRole = await prisma.userRole.findFirst({
    where: {
      userId: playerUser.id,
      roleId: userRole.id,
    },
  });

  if (!existingPlayerUserRole) {
    await prisma.userRole.create({
      data: {
        userId: playerUser.id,
        roleId: userRole.id,
      },
    });
  }

  // Create player profile
  const player = await prisma.player.upsert({
    where: { userId: playerUser.id },
    update: {},
    create: {
      name: playerUser.name || "Unknown Player",
      level: "MIDDLE",
      position: "FORWARD",
      status: "ACTIVE",
      userId: playerUser.id,
    },
  });

  console.log(`✅ Admin user created: ${adminUser.email}`);
  console.log(`✅ Player user created: ${playerUser.email}`);
  console.log(`✅ Player profile created: ${player.name}`);
  console.log("🎉 Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
