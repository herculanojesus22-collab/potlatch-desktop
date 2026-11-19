# Potlatch Club: desktop app (Windows and Mac)

This is a desktop window around your live Potlatch app. Staff names, PINs, schedules and pay stay on your server exactly as now; nothing is copied to the computer.

## Easiest way to get the installers (no coding)
1. Create a free account at github.com and make a new private repository.
2. Upload everything in this folder (keep the `.github` folder).
3. Open the **Actions** tab, choose **Build desktop app**, press **Run workflow**.
4. After a few minutes open the finished run and download:
   - `potlatch-windows-latest`: the Windows installer (.exe)
   - `potlatch-macos-latest`: the Mac disk image (.dmg)

## Or build it yourself
Needs Node.js 20+. Windows installers must be built on Windows, Mac ones on a Mac.
```
npm install
npm start            # try it
npm run build:win    # Windows installer, in dist/
npm run build:mac    # Mac .dmg, in dist/
```

## First launch
The app asks for your website address (the Vercel address you open in the browser). It remembers it. Change it later from the menu: Potlatch, then Change app address.

## Notes
- Windows will warn "unknown publisher" and Macs will say the app is from an unidentified developer, because it is not code-signed. Windows: More info, Run anyway. Mac: right-click the app, Open. Signing needs paid certificates.
- Links to other sites (WhatsApp, email) open in the normal browser. Camera (scanning) works for your site only.
- On a computer there is no phone Share button: use Download picture, then Open WhatsApp.
- Updating the Potlatch app on Vercel updates the desktop app automatically; you only rebuild the installer to change the desktop wrapper itself.
