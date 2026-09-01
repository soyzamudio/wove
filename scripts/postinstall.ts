// macOS strips the ad-hoc signature from esbuild's binary on some installs, which makes
// vite/esbuild die with "The service was stopped". Re-sign it locally (no-op elsewhere).
if (process.platform === "darwin") {
  const bin = `${import.meta.dir}/../node_modules/@esbuild/darwin-arm64/bin/esbuild`;
  if (await Bun.file(bin).exists()) {
    const p = Bun.spawnSync(["codesign", "-f", "-s", "-", bin]);
    if (p.exitCode !== 0) console.warn("postinstall: could not re-sign esbuild:", p.stderr.toString().trim());
  }
}
