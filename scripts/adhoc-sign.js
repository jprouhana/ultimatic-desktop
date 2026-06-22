// macOS ad-hoc code signing.
//
// Without a paid Apple Developer certificate, electron-builder ships the app
// fully unsigned. On Apple Silicon, Gatekeeper reports a fully unsigned app as
// "damaged and can't be opened." An ad-hoc signature (codesign --sign -)
// downgrades that to the ordinary "unidentified developer" prompt, which a
// right-click -> Open clears. (Downloaders still clear the quarantine flag;
// see the README.) Runs only on macOS builds; a no-op elsewhere.
exports.default = async function (context) {
  if (context.electronPlatformName !== "darwin") return;
  const { execFileSync } = require("child_process");
  const app = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`;
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
  console.log(`  • ad-hoc signed ${app}`);
};
