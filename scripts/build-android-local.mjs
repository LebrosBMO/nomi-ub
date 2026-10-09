// Builds the Android release APK on this laptop, skipping the EAS queue, and installs it on a plugged-in phone with --install.
//
//   node scripts/build-android-local.mjs [--install]
//
// Signing: with credentials.json (EAS's local credentials) in the project, or ~/.nomi-signing/signing.properties, the APK is signed with Nomi's own key (the one EAS builds use), so it
// updates the installed app and keeps its data. Without it the debug key is used: Android then refuses to update the EAS-built app,
// which would have to be uninstalled first (its data goes with it). The properties file holds, one per line:
//   NOMI_RELEASE_STORE_FILE=C:/Users/<you>/.nomi-signing/<keystore>.jks
//   NOMI_RELEASE_STORE_PASSWORD=…   NOMI_RELEASE_KEY_ALIAS=…   NOMI_RELEASE_KEY_PASSWORD=…
// Get those from `npx eas-cli credentials` → Android → the build profile → Keystore → "Download existing keystore". Never commit
// them; the folder is outside the project on purpose.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
// Java 17, the version React Native builds with. Android Studio's own Java is 25 (2026-10-07), too new: it prints "A restricted
// method in java.lang.System has been called" when the native-library step (configureCMake) runs, and that step fails on any
// warning. Gradle has already downloaded a Java 17 for its compiler; Android Studio's is the fallback.
const gradleJdks = path.join(os.homedir(), '.gradle', 'jdks');
const jdk17 = fs.existsSync(gradleJdks) ? fs.readdirSync(gradleJdks).find((d) => /-17-/.test(d) && fs.existsSync(path.join(gradleJdks, d, 'bin', 'java.exe'))) : undefined;
const env = {
  ...process.env,
  JAVA_HOME: process.env.JAVA_HOME || (jdk17 ? path.join(gradleJdks, jdk17) : 'C:/Program Files/Android/Android Studio/jbr'),
  ANDROID_HOME: process.env.ANDROID_HOME || path.join(os.homedir(), 'AppData/Local/Android/Sdk'),
};
const signing = path.join(os.homedir(), '.nomi-signing', 'signing.properties');
// EAS's own local-credentials file, written by `npx eas-cli credentials` → Android → credentials.json → Download. Preferred: no
// copying by hand. The gradle build reads it; this script never prints what is in it.
const credentialsJson = path.join(root, 'credentials.json');
const hasKey = () => fs.existsSync(credentialsJson) || fs.existsSync(signing);
const adb = path.join(env.ANDROID_HOME, 'platform-tools', 'adb.exe');

// 1. The native project, generated from app.json once; again with --prebuild after a change to app.json or the native packages.
// Prebuild clears the folder first, which throws away the compiled native code, so it is not run on every build. It also rewrites
// the "android"/"ios" scripts; this project keeps its own.
const pkgPath = path.join(root, 'package.json');
if (!fs.existsSync(path.join(root, 'android')) || process.argv.includes('--prebuild')) {
  const pkg = fs.readFileSync(pkgPath, 'utf8');
  const prebuild = spawnSync('npx', ['expo', 'prebuild', '-p', 'android', '--no-install'], { cwd: root, env, stdio: 'inherit', shell: true });
  fs.writeFileSync(pkgPath, pkg);
  if (prebuild.status !== 0) process.exit(prebuild.status ?? 1);
}

// 2. Release signing from credentials.json or the private properties file, whichever exists.
const gradlePath = path.join(root, 'android', 'app', 'build.gradle');
let gradle = fs.readFileSync(gradlePath, 'utf8');
// An earlier version of this script read only signing.properties: take its block back out before patching afresh.
if (gradle.includes('nomiSigning') && !gradle.includes('nomiCreds')) {
  gradle = gradle
    .replace(/(signingConfigs \{\n)(\s+)release \{\n\s+def nomiSigning[\s\S]*?\n\2\}\n/, '$1')
    .replace(
      "signingConfig new File(System.getProperty('user.home'), '.nomi-signing/signing.properties').exists() ? signingConfigs.release : signingConfigs.debug",
      'signingConfig signingConfigs.debug'
    );
}
// Groovy reads `signingConfig (a || b) ? x : y` as signingConfig(a || b), a Boolean: an earlier version wrote that. One call, in brackets.
gradle = gradle.replace("signingConfig (new File(rootProject.projectDir.parentFile, 'credentials.json').exists() || new File(System.getProperty('user.home'), '.nomi-signing/signing.properties').exists()) ? signingConfigs.release : signingConfigs.debug", "signingConfig((new File(rootProject.projectDir.parentFile, 'credentials.json').exists() || new File(System.getProperty('user.home'), '.nomi-signing/signing.properties').exists()) ? signingConfigs.release : signingConfigs.debug)");
if (!gradle.includes('nomiSigning')) {
  gradle = gradle.replace(
    /signingConfigs \{\n(\s+)debug \{/,
    (m, indent) =>
      `signingConfigs {\n${indent}release {\n${indent}    def nomiCreds = new File(rootProject.projectDir.parentFile, 'credentials.json')\n${indent}    def nomiSigning = new File(System.getProperty('user.home'), '.nomi-signing/signing.properties')\n${indent}    if (nomiCreds.exists()) {\n${indent}        def c = new groovy.json.JsonSlurper().parse(nomiCreds).android.keystore\n${indent}        storeFile new File(rootProject.projectDir.parentFile, c.keystorePath)\n${indent}        storePassword c.keystorePassword\n${indent}        keyAlias c.keyAlias\n${indent}        keyPassword c.keyPassword\n${indent}    } else if (nomiSigning.exists()) {\n${indent}        def p = new Properties()\n${indent}        nomiSigning.withInputStream { p.load(it) }\n${indent}        storeFile file(p['NOMI_RELEASE_STORE_FILE'])\n${indent}        storePassword p['NOMI_RELEASE_STORE_PASSWORD']\n${indent}        keyAlias p['NOMI_RELEASE_KEY_ALIAS']\n${indent}        keyPassword p['NOMI_RELEASE_KEY_PASSWORD']\n${indent}    }\n${indent}}\n${indent}debug {`
  );
  gradle = gradle.replace(
    /(release \{[^}]*?)signingConfig signingConfigs\.debug/,
    `$1signingConfig((new File(rootProject.projectDir.parentFile, 'credentials.json').exists() || new File(System.getProperty('user.home'), '.nomi-signing/signing.properties').exists()) ? signingConfigs.release : signingConfigs.debug)`
  );
  if (!gradle.includes('nomiSigning')) throw new Error('build.gradle no longer has the shape this script patches');
  fs.writeFileSync(gradlePath, gradle);
}
console.log(hasKey() ? 'Signing with Nomi\'s own key: the APK updates the installed app.' : 'No credentials.json or ~/.nomi-signing/signing.properties: signing with the DEBUG key. It cannot update the EAS-built app on a phone.');

// 3. The release build.
const gradlew = spawnSync(path.join(root, 'android', 'gradlew.bat'), ['assembleRelease'], { cwd: path.join(root, 'android'), env, stdio: 'inherit', shell: true });
if (gradlew.status !== 0) process.exit(gradlew.status ?? 1);
const apk = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
console.log(`APK: ${apk} (${(fs.statSync(apk).size / 1e6).toFixed(1)} MB)`);

// 4. Optional install over USB.
if (process.argv.includes('--install')) {
  if (!hasKey()) {
    console.log('Not installing: a debug-signed APK cannot replace the installed app without deleting its data.');
    process.exit(1);
  }
  console.log(execFileSync(adb, ['install', '-r', apk], { encoding: 'utf8' }).trim());
}
