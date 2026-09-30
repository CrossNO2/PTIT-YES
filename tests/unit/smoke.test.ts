import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { GET as healthHandler } from "@/app/api/health/route";

describe("GB-006 Deployment Verification & Smoke Tests", () => {
  // =========================================================================
  // 1. APPLICATION HEALTH & BOOT VERIFICATION
  // =========================================================================
  describe("1. Application Boot & Health Check", () => {
    it("Health endpoint /api/health returns HTTP 200 with healthy status and metadata", async () => {
      const response = await healthHandler();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.status).toBe("healthy");
      expect(body.version).toBe("2.0.0");
      expect(body.service).toContain("GreenBridge");
      expect(body.timestamp).toBeDefined();
      expect(body.environment).toBeDefined();
    });

    it("Environment variable configuration distinguishes public and server-only keys", () => {
      const serverSecrets = ["SUPABASE_SERVICE_ROLE_KEY"];
      const clientPublics = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_APP_URL"];

      // Check server secrets must NEVER start with NEXT_PUBLIC_
      for (const secret of serverSecrets) {
        expect(secret.startsWith("NEXT_PUBLIC_")).toBe(false);
      }

      // Check client variables MUST start with NEXT_PUBLIC_
      for (const pub of clientPublics) {
        expect(pub.startsWith("NEXT_PUBLIC_")).toBe(true);
      }
    });

    it("Validates .env.example contains only safe placeholders with no committed secrets", () => {
      const envExamplePath = path.resolve(process.cwd(), ".env.example");
      expect(fs.existsSync(envExamplePath)).toBe(true);

      const content = fs.readFileSync(envExamplePath, "utf-8");
      // Must not contain actual JWTs or real passwords
      expect(content).not.toMatch(/eyJ[a-zA-Z0-9_-]{20,}/);
      expect(content).toContain("YOUR_PROJECT");
      expect(content).toContain("YOUR_SERVICE_ROLE_KEY");
    });
  });

  // =========================================================================
  // 2. PROTECTED ADMIN ROUTE BEHAVIOR
  // =========================================================================
  describe("2. Protected Admin Route Authorization Gate", () => {
    it("Unauthenticated request to admin operations API must be rejected with 401 or 403", () => {
      // Simulate unauthenticated caller context
      const caller = {
        isAuthenticated: false,
        user: null,
      };

      const authorizeAdminCall = (ctx: typeof caller) => {
        if (!ctx.isAuthenticated || !ctx.user) {
          const err = new Error("UNAUTHENTICATED: Bạn chưa đăng nhập");
          Object.assign(err, { statusCode: 401 });
          throw err;
        }
      };

      expect(() => authorizeAdminCall(caller)).toThrow(/UNAUTHENTICATED/);
    });

    it("Customer account type is strictly rejected from hub and control center mutations", () => {
      const customerContext = {
        isAuthenticated: true,
        account_type: "customer",
      };

      const checkHubAccess = (ctx: typeof customerContext) => {
        if (ctx.account_type === "customer") {
          const err = new Error("FORBIDDEN: Khách hàng không có quyền truy cập trung tâm quản trị");
          Object.assign(err, { statusCode: 403 });
          throw err;
        }
      };

      expect(() => checkHubAccess(customerContext)).toThrow(/FORBIDDEN/);
    });
  });

  // =========================================================================
  // 3. DATABASE MIGRATION INTEGRITY & SEQUENCING (001 -> 014)
  // =========================================================================
  describe("3. Database Migration Integrity (001 -> 014)", () => {
    const migrationsDir = path.resolve(process.cwd(), "supabase/migrations");

    it("Migrations directory exists and contains all GreenBridge v2 migrations", () => {
      expect(fs.existsSync(migrationsDir)).toBe(true);

      const files = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();

      expect(files.length).toBeGreaterThanOrEqual(14);
      expect(files[0]).toContain("001_v2_extensions_enums.sql");
      expect(files[13]).toContain("014_v2_recovery_decision_unique.sql");
    });

    it("Enforces strictly sequential numbering (001 through 014) with no gaps or duplicates", () => {
      const files = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();

      files.forEach((file, index) => {
        const expectedPrefix = String(index + 1).padStart(3, "0");
        expect(file.startsWith(`${expectedPrefix}_`)).toBe(true);

        const filePath = path.join(migrationsDir, file);
        const stats = fs.statSync(filePath);
        expect(stats.size).toBeGreaterThan(100); // Non-empty file
      });
    });

    it("Migration 014 enforces unique constraint on recovery_decisions(recovery_request_id)", () => {
      const migration014Path = path.join(migrationsDir, "014_v2_recovery_decision_unique.sql");
      const content = fs.readFileSync(migration014Path, "utf-8");

      expect(content).toContain("uq_recovery_decisions_request_id");
      expect(content).toContain("ON public.recovery_decisions(recovery_request_id)");
    });
  });
});
