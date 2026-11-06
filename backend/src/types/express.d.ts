import type { Permission } from "../app/constants/permissions";
import type { PlatformRole, TenantRole } from "../app/constants/roles";
import type { CompanyDoc } from "../app/modules/company/company.model";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: TenantRole;
        company: string;
        permissions: Permission[];
        zones: string[];
      };
      company?: CompanyDoc;
      platformUser?: { id: string; role: PlatformRole };
    }
  }
}

export {};
