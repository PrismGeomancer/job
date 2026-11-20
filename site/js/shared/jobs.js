// The three jobs. This list is the only source of valid job ids, for the site and the server.
export const JOBS = Object.freeze(["cleaner", "payroll", "builder"]);

export function isJob(value) {
  return typeof value === "string" && JOBS.includes(value);
}
