import { config } from "dotenv";
import { assertLocalSupabase } from "../support/assert-local-supabase";

config({ path: ".env.local" });
assertLocalSupabase("Integration tests");
