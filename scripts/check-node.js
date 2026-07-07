const major = parseInt(process.version.slice(1).split('.')[0], 10);

if (major < 22) {
  console.error(
    `\n❌ Wrong Node version: ${process.version} (this repo requires >=22.12.0, .nvmrc pins 24.18.0).\n   Run: nvm use\n`,
  );
  process.exit(1);
}
