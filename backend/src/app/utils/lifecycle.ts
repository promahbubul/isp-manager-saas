/** Set while the process drains connections before exit (readiness then reports 503). */
let shuttingDown = false;
export const isShuttingDown = () => shuttingDown;
export const markShuttingDown = () => {
  shuttingDown = true;
};
