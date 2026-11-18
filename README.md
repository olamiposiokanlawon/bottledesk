# BottleDesk: Plastic Bottle Business Manager

Inventory, buying, selling, payments and profit for a plastic bottle business (₦ and kg).
It comes in three parts that work together:

| Part                                                              | What it is                                                                                          |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **App screens** (`src/`)                                          | The app people use: Dashboard, Buy, Sell, Inventory, Suppliers, Buyers, Expenses, Reports, Settings |
| **Web host** (`server/`)                                          | Optional Node server that serves the web version; Supabase provides accounts and cloud backup       |
| **Android app** (`capacitor.config.json`, `scripts/`, `.github/`) | Turns the same app into an installable **APK** for phones                                           |

The app **works fully offline** and keeps all records on the phone. When there is signal and the person is signed in, changes are copied to Supabase automatically. No signal, no problem: it catches up later.

---

## 1. Try it on your computer (2 minutes)

Install **Node.js** (free, "LTS" version) from https://nodejs.org, once. Then:

- **Windows:** unzip, double-click **`start.bat`**
- **Mac / Linux:** unzip, open a terminal in the folder, run `sh start.sh`

The first run downloads what it needs (internet required). Your browser opens at **http://localhost:3000**.
The black window also prints an address for phones on the same Wi-Fi (like `http://192.168.1.5:3000`).

By hand: `npm install`, then `npm run app`.

Click **Settings → Load sample data** to explore with made-up records. **Delete everything** clears it before real use.

---

## 2. Configure Supabase cloud backup

Cloud accounts and backups use Supabase; the BottleDesk Node server is not required for authentication or sync. In your Supabase project:

1. Enable **Authentication → Providers → Email** and choose whether email confirmation is required.
2. Ensure `public.business_data` exists with its existing `user_id` and `data` columns, a unique/primary-key constraint on `user_id`, and RLS enabled.
3. Ensure its RLS policies allow authenticated users to select, insert, and update only rows where `user_id = auth.uid()`. The app uses the signed-in user's ID and relies on these policies; it never uses a service-role key.
4. Copy the project URL and publishable key into local build variables (`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`). These client values are embedded in the app; never use a service-role/secret key here.

The app remains local-first and offline-capable. On first sign-in, existing local/cloud data conflict handling determines which copy to keep. Download a Settings backup before switching accounts if the local records matter.

---

## 3. Build the Android app (APK)

I could not build the APK for you here (it needs the Android tools), so these are the two ways you can. The app itself is complete and tested.

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the build. For local builds, copy `.env.example` to `.env.local` and fill in those two values. Keep `.env.local` and `.env` out of Git; `.env.example` intentionally contains blanks only.

### Way 1: build in the cloud, nothing to install (easiest)

1. Make a free account at github.com and create a new **private** repository.
2. Upload this whole folder to it (GitHub's "Add file → Upload files" works; don't upload `node_modules`).
3. In the repository: **Settings → Secrets and variables → Actions → Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` with your Supabase project URL and publishable key. Do not add a service-role key.
4. Go to the **Actions** tab → **Build Android APK** → **Run workflow**.
5. After about 5 to 10 minutes, open the finished run and download **BottleDesk-apk** at the bottom. Unzip it to get `app-debug.apk`.

### Way 2: build on your own computer

Install **Android Studio** (https://developer.android.com/studio), open it once so it downloads the Android SDK, and set the `ANDROID_HOME` environment variable to the SDK folder (on Windows usually `C:\Users\YOU\AppData\Local\Android\Sdk`). Then in this folder:

```bash
npm install
npm run apk
```

It produces **`BottleDesk.apk`** in this folder. (Behind the scenes: build the screens, add the Android project, add the icon, build.)

### Installing the APK on a phone

1. Send the `.apk` file to the phone (WhatsApp, Bluetooth, USB, Google Drive).
2. Tap it. Android asks to allow installs from that source: allow it, then install.
3. Open **BottleDesk**. Go to **Settings → Cloud backup → Create account** (first time) or **Sign in** (other phones).

This is a "debug" APK: perfect for your own phones and staff. Publishing on Google Play needs a signed release build and a Google developer account; that is a separate step.

---

## How it behaves on the phone

- **Offline first.** Everything is saved on the phone instantly. The small chip at the top shows **Backed up**, **Syncing…**, **Offline**, or **Not backed up**.
- **Two phones, one business.** Sign in with the same account on both. Changes show up on the other phone within about 30 seconds (or when you reopen the app).
- **If both phones changed things while apart**, the app asks which copy to keep, so nothing is overwritten silently.
- **Uninstalling the app or clearing its data erases the phone's copy**, so sign in first: your records come back from Supabase.
- The app checks that your books add up: it blocks selling more than you have, paying more than is owed, and deleting a purchase whose bottles were already sold.
- Settings also has **Download backup** (a `.json` file) for an extra copy.

### How the numbers are worked out

- **Total** = weight × price per kg (the usual buying price is ₦200/kg and can be changed per deal).
- **Stock** = bought − sold − written off, per bottle type (Clear, Coloured, Mixed, or your own types).
- **Cost of bottles sold** uses your _average buying cost_. Buy 100 kg at ₦200 and 100 kg at ₦220, sell 100 kg at ₦300: average cost ₦210/kg, profit ₦9,000.
- **Net profit** = sales − cost of bottles sold − expenses − cost of stock written off.
- **Cash on hand** = opening cash + money received − money paid out. Later payments are matched to the oldest unpaid deals first.

---

## Security notes

- Supabase Auth handles passwords and sessions. The app uses only the Supabase publishable key; never put a service-role key in the client or APK.
- Row-level security must be enabled on `public.business_data`; its policies must restrict select/insert/update to rows where `user_id = auth.uid()`.
- Use Supabase Auth settings to control email confirmation and account creation.

## If something goes wrong

- **Cloud backup unavailable**: check the `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` build values and verify the table's RLS policies in Supabase.
- **`npm install` fails**: check your internet; Node must be version 18 or newer (`node -v`).
- **APK build fails**: use Way 1 (cloud), which has the right Java and Android tools ready. For Way 2, you need Java 17 (Android Studio includes one) and `ANDROID_HOME` set.
- **Can't install the APK**: allow "install unknown apps" for the app you opened the file from.

## Commands

```bash
npm run app        # build the screens and start the server (http://localhost:3000)
npm run dev        # screens with live reload (run "npm run server" in a second window)
npm run server     # just the server
npm test           # automated checks of calculations and the optional Node server
npm run apk        # build BottleDesk.apk on your computer
```

## Project layout

```
plastic-bottle-business/
├── start.bat / start.sh     one-click start on a computer
├── Dockerfile               optional Node web server container
├── capacitor.config.json    Android app settings
├── .env.example             blank Supabase build-variable template
├── .github/workflows/       cloud APK build
├── scripts/build-apk.mjs    one-command APK build
├── assets/                  app icon sources
├── public/                  favicon, home-screen icons
├── server/                  optional Node web server (not used for Supabase auth/sync)
│   ├── index.js             web server + legacy API
│   └── db.js                file-based storage
├── src/                     the app screens
│   ├── lib/                 calculations, storage, formats, sample data
│   ├── hooks/               data store, page routing, cloud sync
│   ├── components/ forms/ pages/
└── tests/                   automated checks
```

# bottledesk
