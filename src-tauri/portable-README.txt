OpenMark 0.1.0 — portable build
===============================

Run `openmark.exe`. Nothing is installed and nothing is written outside this folder.

Portable behaviour
------------------
The application keeps its settings, its recent-file list and its WebView2 user profile in a
`data/` directory created next to `openmark.exe` on first launch. Copy or move the whole
folder and everything travels with it.

The `data/` directory is created automatically; do not delete it while the application is
running.

What is included
----------------
  openmark.exe   the application (a WebView2 host)
  README.txt     this file

Requirements
------------
Windows 10/11 x64 with the Microsoft Edge WebView2 runtime. It ships with Windows 11 and with
current Windows 10 updates; if it is missing, install "Microsoft Edge WebView2 Runtime" from
Microsoft.

Everything renders offline
--------------------------
Formulas, chemistry, diagrams and syntax highlighting are all bundled, including the MathsJax
font data. The application never contacts the network to display a document.

Uninstalling
------------
Delete this folder. To keep your settings, keep `data/`; to remove every trace, delete it too.

Licences
--------
OpenMark is MIT. It bundles third-party components, including two under weak-copyleft
licences that require their texts to travel with the application. The full attribution list
and every licence text ship with the source distribution in `docs/LICENSE_NOTICES.md` and
`THIRD_PARTY_LICENSES/`.
