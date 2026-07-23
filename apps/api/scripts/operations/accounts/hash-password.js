// Standalone account-operation helper; it never writes to the database.
const bcrypt = require('bcrypt');

const password = process.env.IMS_PASSWORD_TO_HASH;

if (!password) {
    console.error('Set IMS_PASSWORD_TO_HASH before running this command.');
    process.exit(1);
}

bcrypt.hash(password, 12).then(console.log).catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
});
