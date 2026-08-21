import type { Role, DataScope } from '../generated/prisma/enums';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        role: Role | null;
        managerId: number | null;
        permissions: string[];
        // Phase 15 addendum — null means "use the pre-addendum role-based default",
        // not "no access." See utils/dataScope.ts.
        customerDataScope: DataScope | null;
        orderDataScope: DataScope | null;
      };
    }
  }
}

export {};
