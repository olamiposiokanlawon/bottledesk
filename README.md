# BottleDesk: Plastic Bottle Business Manager

Inventory, buying, selling, payments and profit for a plastic bottle business (₦ and kg).
It comes in three parts that work together:

| Part | What it is |
|------|------------|
| **App screens** (`src/`) | The app people use: Dashboard, Buy, Sell, Inventory, Suppliers, Buyers, Expenses, Reports, Settings |
| **Server** (`server/`) | Accounts + cloud backup, so records are safe and can be shared between phones. Also serves the web version |
| **Android app** (`capacitor.config.json`, `scripts/`, `.github/`) | Turns the same app into an installable **APK** for phones |

The app **works fully offline** and keeps all records on the phone. When there is signal and the person is signed in, changes are copied to the server automatically. No signal, no problem: it catches up later.

---

## 1. Try it on your computer (2 minutes)

Install **Node.js** (free, "LTS" version) from https://nodejs.org, once. Then:

* **Windows:** unzip, double-click **`start.bat`**
* **Mac / Linux:** unzip, open a terminal in the folder, run `sh start.sh`

The first run downloads what it needs (internet required). Your browser opens at **http://localhost:3000**.
The black window also prints an address for phones on the same Wi-Fi (like `http://192.168.1.5:3000`).

By hand: `npm install`, then `npm run app`.

Click **Settings → Load sample data** to explore with made-up records. **Delete everything** clears it before real use.

---

## 2. Put the server online (so phones can back up from anywhere)

The server needs a place to run 24/7 **with a disk that is not wiped** (the records live in a folder). Pick one:

**A. Easiest, on your own computer (same Wi-Fi only).** Run `start.bat`. Phones enter `http://YOUR-PC-ADDRESS:3000` as the server address. The PC must be on, and Windows may ask to allow network access: choose Allow. Good for trying it; not for daily business.

**B. A small cloud server (recommended).** Any host that gives you a persistent disk works: a cheap VPS, or Railway / Render / Fly.io with a volume attached. On a VPS with Docker:

```bash
docker build -t bottledesk .
docker run -d --restart=always -p 3000:3000 -v bottledesk-data:/data \
  -e ALLOW_REGISTRATION=true bottledesk
```

Then put HTTPS in front (so passwords are not sent in the open). Caddy does it automatically. `Caddyfile`:

```
bottles.yourdomain.com {
    reverse_proxy localhost:3000
}
```

and add `-e TRUST_PROXY=1` to the docker command. **Free hosting tiers that erase files on restart will lose your data. Don't use those without a disk.**

Server settings (environment variables): `PORT` (3000), `DATA_DIR` (where records are kept), `ALLOW_REGISTRATION` (set to `false` after you and your staff have made your accounts, so strangers can't), `TRUST_PROXY` (1 behind Caddy/nginx).

**Back up the data folder** (`server-data/`, or the `/data` volume) now and then. It holds `users.json`, `sessions.json` and one file per account (plus a `.bak` of the previous save).

---

## 3. Build the Android app (APK)

I could not build the APK for you here (it needs the Android tools), so these are the two ways you can. The app itself is complete and tested.

First, tell the app where your server is, so nobody has to type it: copy `.env.example` to `.env` and put your address in it, e.g. `VITE_API_URL=https://bottles.yourdomain.com`. (If you skip this, people type the address once in Settings.)

### Way 1: build in the cloud, nothing to install (easiest)

1. Make a free account at github.com and create a new **private** repository.
2. Upload this whole folder to it (GitHub's "Add file → Upload files" works; don't upload `node_modules`).
3. In the repository: **Settings → Secrets and variables → Actions → Variables → New variable**: name `API_URL`, value your server address.
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

* **Offline first.** Everything is saved on the phone instantly. The small chip at the top shows **Backed up**, **Syncing…**, **Offline**, or **Not backed up**.
* **Two phones, one business.** Sign in with the same account on both. Changes show up on the other phone within about 30 seconds (or when you reopen the app).
* **If both phones changed things while apart**, the app asks which copy to keep, so nothing is overwritten silently.
* **Uninstalling the app or clearing its data erases the phone's copy**, so sign in first: your records come back from the server.
* The app checks that your books add up: it blocks selling more than you have, paying more than is owed, and deleting a purchase whose bottles were already sold. The server checks the same rules.
* Settings also has **Download backup** (a `.json` file) for an extra copy.

### How the numbers are worked out

* **Total** = weight × price per kg (the usual buying price is ₦200/kg and can be changed per deal).
* **Stock** = bought − sold − written off, per bottle type (Clear, Coloured, Mixed, or your own types).
* **Cost of bottles sold** uses your *average buying cost*. Buy 100 kg at ₦200 and 100 kg at ₦220, sell 100 kg at ₦300: average cost ₦210/kg, profit ₦9,000.
* **Net profit** = sales − cost of bottles sold − expenses − cost of stock written off.
* **Cash on hand** = opening cash + money received − money paid out. Later payments are matched to the oldest unpaid deals first.

---

## Security notes

* Passwords are stored only as salted hashes. Sign-in tokens last 90 days and can be revoked (Sign out, or change password signs out other phones).
* Five wrong passwords lock that username and connection for 15 minutes.
* Use **HTTPS** for any server on the internet. The app allows plain `http://` only so that same-Wi-Fi testing works.
* After your accounts exist, set `ALLOW_REGISTRATION=false`.

## If something goes wrong

* **"Can't reach the server"**: check the address (Settings → Cloud backup → *Test connection*), that the server is running, and that the phone has internet. On the same Wi-Fi, use the address the black window printed.
* **`npm install` fails**: check your internet; Node must be version 18 or newer (`node -v`).
* **APK build fails**: use Way 1 (cloud), which has the right Java and Android tools ready. For Way 2, you need Java 17 (Android Studio includes one) and `ANDROID_HOME` set.
* **Can't install the APK**: allow "install unknown apps" for the app you opened the file from.

## Commands

```bash
npm run app        # build the screens and start the server (http://localhost:3000)
npm run dev        # screens with live reload (run "npm run server" in a second window)
npm run server     # just the server
npm test           # automated checks of the calculations and the server
npm run apk        # build BottleDesk.apk on your computer
```

## Project layout

```
plastic-bottle-business/
├── start.bat / start.sh     one-click start on a computer
├── Dockerfile               run the server on a hosting machine
├── capacitor.config.json    Android app settings
├── .env.example             where your server address goes
├── .github/workflows/       cloud APK build
├── scripts/build-apk.mjs    one-command APK build
├── assets/                  app icon sources
├── public/                  favicon, home-screen icons
├── server/                  the backend (accounts, cloud copy). No extra packages needed
│   ├── index.js             web server + API
│   └── db.js                file-based storage
├── src/                     the app screens
│   ├── lib/                 calculations, storage, formats, sample data
│   ├── hooks/               data store, page routing, cloud sync
│   ├── components/ forms/ pages/
└── tests/                   automated checks
```
# bottledesk
