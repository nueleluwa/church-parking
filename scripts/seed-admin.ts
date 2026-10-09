// Creates or updates the first admin account from environment variables.
// Run with: pnpm db:seed-admin   (reads .env.local)
import { hash } from "@node-rs/argon2";
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PHONE, ADMIN_PASSWORD } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ADMIN_PHONE || !ADMIN_PASSWORD) {
  console.error(
    "Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PHONE and ADMIN_PASSWORD in .env.local first.",
  );
  process.exit(1);
}
if (!/^\+\d{10,15}$/.test(ADMIN_PHONE)) {
  console.error("ADMIN_PHONE must be in international format, like +2348031234567.");
  process.exit(1);
}
if (ADMIN_PASSWORD.length < 10) {
  console.error("ADMIN_PASSWORD must be at least 10 characters.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// argon2id is the default algorithm in @node-rs/argon2
const password_hash = await hash(ADMIN_PASSWORD);

const { error } = await supabase
  .from("staff")
  .upsert(
    { full_name: "Parking Lead", phone: ADMIN_PHONE, password_hash, role: "admin", active: true },
    { onConflict: "phone" },
  );

if (error) {
  console.error("Could not create the admin account:", error.message);
  process.exit(1);
}
console.log("Admin account is ready.");
