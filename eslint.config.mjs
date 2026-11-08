import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "react/no-unescaped-entities": "off",
    },
  },
  {
    // UI must never bypass application services with the RLS-bypassing service-role client.
    files: ["src/components/**", "src/features/**/components/**", "src/app/**/page.tsx", "src/app/**/layout.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "@/server/supabase/admin", message: "Service-role client is restricted to internal services (matching, queue, storage signing)." },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "supabase/**", "playwright-report/**", "test-results/**"]),
]);

export default eslintConfig;
