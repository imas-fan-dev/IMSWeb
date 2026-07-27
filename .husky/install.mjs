if (
  process.env.HUSKY === "0" ||
  process.env.NODE_ENV === "production" ||
  process.env.CI === "true"
) {
  process.exit(0);
}

const husky = (await import("husky")).default;
const output = husky();

if (output) {
  process.stdout.write(`${output}\n`);
}
