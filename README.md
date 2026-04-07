# 📁 Fylix - The Universal File Opener

<div align="center">
  <img src="client/public/logo.png" alt="Fylix Logo" width="150"/>
  <br/>
  <p><b>Instant preview for Code, Office Docs, PDFs, Images, Videos, Archives, and more.</b></p>

  ![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
  ![Capacitor](https://img.shields.io/badge/Capacitor-119EFF?style=for-the-badge&logo=capacitor&logoColor=white)
  ![Android](https://img.shields.io/badge/Android-3DDC84?style=for-the-badge&logo=android&logoColor=white)
  ![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
</div>

---

## ✨ Features

* **Drop it like it's hot:** Seamless drag-and-drop interface for web users.
* **Native Android Integration:** Deeply integrated with Android OS. Set Fylix as your default file handler or use the "Share" menu from any file manager to open files instantly.
* **Smart Processing:**
  * Reads source code and text formats instantly in the browser.
  * Offloads complex Office documents (PPT, DOC) to a dedicated conversion backend.
* **Smart Export:** Save text, tables, and code snippets directly as PDFs, or natively download media and archives.
* **Responsive UI:** Built with Tailwind CSS for a fluid experience across desktop, tablet, and mobile screens.

## 📦 Supported File Formats

Fylix utilizes a hybrid approach to render almost any file you throw at it:

| Category | Formats | Processing |
| :--- | :--- | :--- |
| **Code & Text** | `.c`, `.cpp`, `.py`, `.java`, `.js`, `.json`, `.md`, `.sql`, `.sh`, `.txt`, etc. | Local (Browser) |
| **Office Docs** | `.pptx`, `.ppt`, `.doc`, `.odp` | Backend API |
| **Media** | `.pdf`, `.png`, `.jpg`, `.mp4`, `.mp3` | Local (Browser) |
| **Archives** | `.zip`, `.jar`, `.7z` | Local (Downloadable) |

## 🛠️ Tech Stack

* **Frontend:** React, Tailwind CSS, Lucide React (Icons), React Dropzone
* **Backend API:** Custom rendering engine hosted on Render (`https://universal-file-opener.onrender.com`)
* **Native OS:** Custom Java Bridge for Android `ACTION_VIEW` and `ACTION_SEND` intents.

---

## 🚀 Getting Started

### 1. Web Environment Setup

Clone the repository and install the web dependencies:

```bash
git clone [https://github.com/syedabdulsami2005/universal-file-opener.git]
cd fylix
npm install
npm run dev
