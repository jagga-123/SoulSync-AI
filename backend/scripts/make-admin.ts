/**
 * Promotes (or demotes) an account.
 *
 *   npm run make-admin -- you@example.com
 *   npm run make-admin -- you@example.com --demote
 */
import mongoose from "mongoose";
import { connectDB } from "../src/config/db";
import { User } from "../src/models/User.model";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const demote = process.argv.includes("--demote");
  if (!email || email.startsWith("--")) {
    console.error("Usage: npm run make-admin -- <email> [--demote]");
    process.exit(1);
  }

  await connectDB();
  const user = await User.findOne({ email });
  if (!user) {
    console.error(`No account found for ${email}. Register it first, then run this again.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  user.role = demote ? "user" : "admin";
  await user.save();
  console.log(`${email} is now ${user.role === "admin" ? "an admin" : "a regular user"}.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
