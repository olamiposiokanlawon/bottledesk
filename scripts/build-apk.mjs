// One command that builds an installable Android app (APK):  npm run apk
// Needs: Node.js, Java 17, and the Android SDK (installing Android Studio gives you both the SDK and a Java).
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { loadEnv } from 'vite'

const win = process.platform === 'win32'
const run = (cmd, args, opts = {}) => {
  console.log(`\n> ${cmd} ${args.join(' ')}`)
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, ...opts })
  if (r.status !== 0) {
    if (opts.optional) return false
    console.error(`\nThat step failed: ${cmd} ${args.join(' ')}\nRead the message above. The README has a "If the APK build fails" section.`)
    process.exit(r.status || 1)
  }
  return true
}

const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
if (!sdk || !fs.existsSync(sdk)) {
  console.error(
    'The Android SDK was not found.\n' +
      'Install Android Studio (https://developer.android.com/studio), open it once so it downloads the SDK,\n' +
      'then set ANDROID_HOME to the SDK folder (Windows usually: C:\\Users\\YOU\\AppData\\Local\\Android\\Sdk) and run this again.\n' +
      'Or skip all of that: use the "build in the cloud" steps in the README.',
  )
  process.exit(1)
}

const buildEnv = { ...loadEnv('production', process.cwd(), ''), ...process.env }
if (!buildEnv.VITE_SUPABASE_URL || !buildEnv.VITE_SUPABASE_PUBLISHABLE_KEY) {
  console.log('Note: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are not set; the APK will build without cloud backup. See .env.example.')
}

run('npx', ['vite', 'build'])
if (!fs.existsSync('android')) {
  run('npx', ['cap', 'add', 'android'])
  run('npx', ['--yes', '@capacitor/assets', 'generate', '--android'], { optional: true }) // app icon; fine if it fails
}
run('npx', ['cap', 'sync', 'android'])
run(win ? 'gradlew.bat' : './gradlew', ['assembleDebug'], { cwd: 'android' })

const apk = path.join('android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
if (fs.existsSync(apk)) {
  const out = 'BottleDesk.apk'
  fs.copyFileSync(apk, out)
  console.log(`\nDone! Your app is ready: ${path.resolve(out)}\nSend that file to a phone and open it to install.`)
} else {
  console.error('The build finished but the APK file was not found where expected.')
  process.exit(1)
}
