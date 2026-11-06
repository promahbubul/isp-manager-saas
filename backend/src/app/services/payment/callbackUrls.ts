import config from "../../config";

/** Public URLs the gateways call back. All routes live under /api/v1/pg. */
export const pgUrl = (path: string) => `${config.apiPublicUrl}/api/v1/pg${path}`;
