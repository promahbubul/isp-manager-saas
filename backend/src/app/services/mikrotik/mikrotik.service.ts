import AppError from "../../errors/AppError";
import { decrypt } from "../../utils/encryption";
import { RouterDriver, RouterOsDriver } from "./router.driver";
import { RosError, RosOptions } from "./routeros.client";

export type RouterConnection = {
  name: string;
  host: string;
  port: number;
  username: string;
  /** encrypted */
  password: string;
  useSSL: boolean;
};

type DriverFactory = (opts: RosOptions) => Promise<RouterDriver>;

const defaultFactory: DriverFactory = (opts) => RouterOsDriver.connect(opts);
let factory: DriverFactory = defaultFactory;

/** Tests swap in a fake router. */
export function setRouterDriverFactory(f?: DriverFactory) {
  factory = f ?? defaultFactory;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Open a connection, run `fn`, always close.
 * Connection/protocol failures become 502 errors with a readable message.
 */
export async function withRouter<T>(router: RouterConnection, fn: (driver: RouterDriver) => Promise<T>): Promise<T> {
  let driver: RouterDriver;
  try {
    driver = await factory({
      host: router.host,
      port: router.port,
      user: router.username,
      password: decrypt(router.password),
      tls: router.useSSL,
      timeout: 10_000,
    });
  } catch (err) {
    throw new AppError(502, `Router "${router.name}" is unreachable: ${message(err)}`);
  }
  try {
    return await fn(driver);
  } catch (err) {
    if (err instanceof RosError) throw new AppError(502, `Router "${router.name}" error: ${err.message}`);
    throw err;
  } finally {
    driver.close();
  }
}
