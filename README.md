# Ridm 
> **Raid - inspect - download - manage**

Ridm is a powerful, open-source media manager supporting 9 languages. In addition to being a basic download manager, it has the capability to download media content from platforms like YouTube and Instagram individually or in bulk. It utilizes the power of the `yt-dlp` engine under the hood.

## 📱 Screenshots


<p align="center">
  <img src="assets/sc_home.png" width="220" /> 
  <img src="assets/sc_download.png" width="220" /> 
  <img src="assets/sc_settings.png" width="220" />
</p>

## 🌟 Features

* **🌍 Multi-Language Support:** Full support for English, Turkish, Arabic, Chinese, Hindi, Spanish, French, Bengali, and Russian. *(The app launches in English by default for universal use; the language can be changed instantly from the settings).*
* **🚀 Basic Usage & Integration:** You can add up to 10 links at once, separated by pressing Enter. If you tap "Share" on any video in the YouTube app (or others) and select Ridm, the link is automatically analyzed and ready for download.
* **📂 Smart Folders:** When activated, your downloads are automatically sorted into subfolders based on their media type (Video, Audio, etc.).
* **🎞️ Advanced Format Selection:** Selecting "Best Quality" in the format options for Playlist and Channel downloads fetches the highest resolution and quality videos available on the source server. If 2160p (4K) or 1080p is selected and that resolution is unavailable, it skips that file and moves to the next.
* **🎵 Audio & Subtitle Support:** MKV,MP3, M4A, and Opus formats all embed any available subtitles directly into the file.
* **📝 Bulk Subtitle Preference:** The 'Subtitle Preference Order' in the Settings menu saves you the hassle of selecting subtitles for each video individually during bulk downloads. If you enable "Auto Sequence", the system checks for your specified 3 languages in order and automatically embeds the first one it finds.

## ⚠️ Important Warnings

* **Battery Restrictions:** In order for the download process to continue uninterrupted in the background, the app's battery usage must be set to **"Unrestricted"** in Android power options.
* **Download Location:** Upon your first launch, it is mandatory to select a download folder from the Settings menu.

## 🍪 Cookies / Authentication
To download Instagram or age-restricted YouTube content, you must link your account to the application:
1. Install a `"cookies.txt"` extension from the extension store (Chrome, Firefox Browser ADD-ONS, etc.) on your desktop browser or mobile device.
2. Log in to YouTube or Instagram from your browser.
3. Click on the extension icon and use the Download option to save the cookies.txt file to any location on your mobile device.
4. Go to App Settings, click the "Select cookies.txt" button, and link this file to the app.

## ☕ Support & Contact
Ridm is completely free and open-source. You can contact me via the email address below to report bugs, contribute to the development process, or donate to support the project.

**Crypto Donation Addresses:**

| Bitcoin (BTC) | Litecoin (LTC) | Tron (USDT-TRC20) |
| :---: | :---: | :---: |
| <img src="assets/qr_btc.png" width="130"> | <img src="assets/qr_ltc.png" width="130"> | <img src="assets/qr_usdt.png" width="130"> |
| `bc1qa5v5vlppp5nn9kdtt2wz4x9pfuupm92hjpd6eu` | `Lf4HincsmEvEJ1cxwJkomXLN72JH7etWRY` | `TUZksjGTYmSeKaprQJQtomTdPXb4ew9mrp` |

---

*Developed by mremiyum* &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;mremiyum@proton.me

## F-Droid and GitHub builds

Ridm is available from GitHub Releases and from F-Droid. F-Droid builds the
app from source and signs it with its own key, so the two builds have
different signatures and Android cannot update one over the other.

If you want to switch between the two sources, uninstall the app first
(this removes the app's data). The F-Droid build is arm64-v8a only.
