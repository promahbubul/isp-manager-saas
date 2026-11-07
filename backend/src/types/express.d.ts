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
        /** Reseller id for a reseller's login */
        reseller?: string;
        /** set while a super admin is impersonating */
        impersonatedBy?: string;
      };
      company?: CompanyDoc;
      /** customer self-care portal session (mobile number + ISP) */
      portal?: { phone: string; company: string };
      /** public API call authenticated by an ISP API key */
      apiKey?: { id: string; scopes: string[]; actor: { id: string; role: TenantRole; company: string; zones: string[]; reseller?: string }; writable: boolean };
      platformUser?: { id: string; role: PlatformRole };
    }
  }
}

export {};
