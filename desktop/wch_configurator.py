"""
WCH Configurator - Desktop edition (Windows)

Original tool: WCH Configurator, made by Amir1387aht (Another)
Source:        https://github.com/amir1387aht/WCH-Resources

This is a thin native shell around the project's own `index.html`. All
configuration and C-code / VS Code project generation stays in that single
file, so the desktop app always produces exactly the same output as the web
tool. The shell only adds what a browser normally provides:

  * a native window (pywebview on top of Microsoft Edge WebView2),
  * native "Save as" dialogs for "Download .c" and "VS Code project (.zip)",
  * opening external links (GitHub, e-mail, WCH sites) in the default browser,
  * a "Source / GitHub" bar and an About dialog with the original credit.

Everything runs offline. Only the exported VS Code project's own Setup task
downloads the WCH EVT later, and that happens inside VS Code, not here.
"""

import base64
import ctypes
import os
import sys
import threading

import webview

APP_NAME = "WCH Configurator"
APP_VERSION = "1.0.0"
AUTHOR = "Amir1387aht (Another)"
AUTHOR_EMAIL = "amir1387aht@gmail.com"
REPO_URL = "https://github.com/amir1387aht/WCH-Resources"
AUTHOR_URL = "https://github.com/amir1387aht"


def resource_dir():
    """Folder that holds the bundled index.html (frozen) or the repo root (source run)."""
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        here,                                    # Nuitka onefile / bundled next to the script
        getattr(sys, "_MEIPASS", ""),            # PyInstaller onefile
        os.path.dirname(here),                   # running from source: <repo>/desktop/..
    ]
    for c in candidates:
        if c and os.path.isfile(os.path.join(c, "index.html")):
            return c
    raise FileNotFoundError("index.html not found next to the app")


def _copy_to_clipboard(text):
    """Plain Win32 clipboard write (fallback when navigator.clipboard is unavailable)."""
    CF_UNICODETEXT, GMEM_MOVEABLE = 13, 0x0002
    k32, u32 = ctypes.windll.kernel32, ctypes.windll.user32
    k32.GlobalAlloc.restype = ctypes.c_void_p
    k32.GlobalLock.restype = ctypes.c_void_p
    k32.GlobalLock.argtypes = [ctypes.c_void_p]
    k32.GlobalUnlock.argtypes = [ctypes.c_void_p]
    u32.SetClipboardData.argtypes = [ctypes.c_uint, ctypes.c_void_p]
    data = (text or "").encode("utf-16-le") + b"\x00\x00"
    if not u32.OpenClipboard(None):
        return False
    try:
        u32.EmptyClipboard()
        h = k32.GlobalAlloc(GMEM_MOVEABLE, len(data))
        p = k32.GlobalLock(h)
        ctypes.memmove(p, data, len(data))
        k32.GlobalUnlock(h)
        return bool(u32.SetClipboardData(CF_UNICODETEXT, h))
    finally:
        u32.CloseClipboard()


class Api:
    """Functions callable from the page as window.pywebview.api.<name>(...)."""

    def __init__(self):
        self._window = None

    def save_file(self, filename, b64data):
        selftest_dir = os.environ.get("WCH_SELFTEST_DIR")
        if selftest_dir:  # automated smoke test: save without a dialog
            path = os.path.join(selftest_dir, os.path.basename(filename))
            with open(path, "wb") as f:
                f.write(base64.b64decode(b64data))
            return {"ok": True, "path": path}
        save_kind = getattr(getattr(webview, "FileDialog", None), "SAVE", None)
        if save_kind is None:
            save_kind = webview.SAVE_DIALOG
        result = self._window.create_file_dialog(save_kind, save_filename=filename)
        if not result:
            return {"ok": False, "cancelled": True}
        path = result if isinstance(result, str) else result[0]
        try:
            with open(path, "wb") as f:
                f.write(base64.b64decode(b64data))
        except OSError as e:
            return {"ok": False, "error": str(e)}
        return {"ok": True, "path": path}

    def open_url(self, url):
        if isinstance(url, str) and url.startswith(("http://", "https://", "mailto:")):
            os.startfile(url)  # default browser / mail client
            return True
        return False

    def copy_text(self, text):
        return _copy_to_clipboard(text)

    def info(self):
        return {
            "name": APP_NAME, "version": APP_VERSION, "author": AUTHOR,
            "email": AUTHOR_EMAIL, "repo": REPO_URL, "authorUrl": AUTHOR_URL,
        }


# Injected after the page loads. It does not change any generator logic; it only
# routes browser-only features (blob downloads, new-tab links, clipboard) to
# native equivalents and adds the Source/GitHub bar + About dialog.
INJECT_JS = r"""
(function(){
  if (window.__wchDesktop) return; window.__wchDesktop = true;
  const api = () => window.pywebview && window.pywebview.api;

  function toast(msg, bad){
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99999;'
      + 'padding:10px 16px;border-radius:8px;font:13px Inter,Segoe UI,sans-serif;max-width:80vw;'
      + 'box-shadow:0 6px 24px rgba(0,0,0,.35);color:#fff;background:' + (bad ? '#b4232c' : '#1f6f43');
    document.body.appendChild(t); setTimeout(() => t.remove(), 4000);
  }

  // 1) blob downloads (<a download href="blob:...">.click()) -> native Save dialog
  const origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function(){
    const href = this.href || '';
    if (this.hasAttribute('download') && /^(blob:|data:)/.test(href) && api()) {
      const name = this.getAttribute('download') || 'download';
      fetch(href).then(r => r.blob()).then(b => new Promise((ok, err) => {
        const fr = new FileReader();
        fr.onload = () => ok(String(fr.result).split(',')[1] || '');
        fr.onerror = err; fr.readAsDataURL(b);
      })).then(b64 => api().save_file(name, b64)).then(res => {
        if (res && res.ok) toast('Saved: ' + res.path);
        else if (res && res.error) toast('Could not save: ' + res.error, true);
      }).catch(e => toast('Could not save: ' + e, true));
      return;
    }
    return origClick.call(this);
  };

  // 2) external links -> default browser / mail client
  document.addEventListener('click', ev => {
    const a = ev.target && ev.target.closest && ev.target.closest('a[href]');
    if (!a || a.hasAttribute('download')) return;
    const href = a.href || '';
    if (/^(https?:|mailto:)/i.test(href) && !href.startsWith(location.origin) && api()) {
      ev.preventDefault(); api().open_url(href);
    }
  }, true);

  // 3) clipboard fallback
  if (navigator.clipboard && navigator.clipboard.writeText) {
    const orig = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = t => orig(t).catch(() => api().copy_text(t));
  } else {
    try { Object.defineProperty(navigator, 'clipboard', {value: {writeText: t => api().copy_text(t)}}); } catch(e) {}
  }

  // 4) Source / GitHub bar + About dialog (original credit kept intact)
  const REPO = 'https://github.com/amir1387aht/WCH-Resources';
  const bar = document.createElement('div');
  bar.id = 'wch-desktop-bar';
  bar.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;padding:7px 16px;'
    + 'font:12.5px Inter,Segoe UI,sans-serif;background:#0b2233;color:#cfe3f1;border-bottom:1px solid #1d3c52;';
  bar.innerHTML =
      '<b style="color:#fff">WCH Configurator</b><span style="opacity:.7">Desktop edition</span>'
    + '<span style="opacity:.5">|</span>'
    + '<span>Made by <b>Amir1387aht</b> (Another)</span>'
    + '<span style="flex:1"></span>'
    + '<span>Source / GitHub: <a href="' + REPO + '" style="color:#7cc4ff">github.com/amir1387aht/WCH-Resources</a></span>'
    + '<button id="wch-about-btn" style="cursor:pointer;border:1px solid #3a6380;background:transparent;color:#cfe3f1;'
    + 'border-radius:6px;padding:3px 10px;font:inherit">About</button>';
  document.body.insertBefore(bar, document.body.firstChild);

  const dlg = document.createElement('dialog');
  dlg.id = 'wch-about';
  dlg.style.cssText = 'max-width:520px;width:90vw;background:#111a22;color:#e6edf3;border:1px solid #2a3640;'
    + 'border-radius:12px;padding:20px 22px;line-height:1.6;font:14px Inter,Segoe UI,sans-serif';
  dlg.innerHTML =
      '<h3 style="margin:0 0 8px">WCH Configurator <span style="opacity:.6;font-weight:400">Desktop __VER__</span></h3>'
    + '<p style="margin:0 0 10px">Made by <b>Amir1387aht</b> (Another)</p>'
    + '<p style="margin:0 0 4px">Source / GitHub: <a href="' + REPO + '" style="color:#7cc4ff">' + REPO + '</a></p>'
    + '<p style="margin:0 0 4px">Author: <a href="https://github.com/amir1387aht" style="color:#7cc4ff">github.com/amir1387aht</a>'
    + ' &middot; <a href="mailto:amir1387aht@gmail.com" style="color:#7cc4ff">amir1387aht@gmail.com</a></p>'
    + '<p style="margin:10px 0;opacity:.8;font-size:12.5px">Any usage of this work without crediting the author\'s name '
    + '(Amir1387aht) is forbidden. Runs fully offline; the generated code is produced locally by the same '
    + 'generator as the web version.</p>'
    + '<div style="text-align:right"><button id="wch-about-close" style="cursor:pointer;border:1px solid #3a6380;'
    + 'background:#173247;color:#e6edf3;border-radius:6px;padding:5px 14px;font:inherit">Close</button></div>';
  document.body.appendChild(dlg);
  document.getElementById('wch-about-btn').onclick = () => dlg.showModal();
  document.getElementById('wch-about-close').onclick = () => dlg.close();
})();
""".replace("__VER__", APP_VERSION)


def _selftest(window):
    """WCH_SELFTEST_DIR=<folder>: load the example, export .c + .zip into <folder>, then quit."""
    import time
    out = os.environ["WCH_SELFTEST_DIR"]
    time.sleep(2)
    window.evaluate_js("document.getElementById('exampleBtn').click()")
    time.sleep(1)
    window.evaluate_js("document.getElementById('downloadBtn').click()")
    window.evaluate_js("document.getElementById('vscodeBtn').click()")
    state = window.evaluate_js(
        "JSON.stringify({bar: !!document.getElementById('wch-desktop-bar'),"
        " credit: document.body.innerText.includes('Amir1387aht'),"
        " repo: document.body.innerHTML.includes('github.com/amir1387aht/WCH-Resources')})")
    with open(os.path.join(out, "selftest.json"), "w", encoding="utf-8") as f:
        f.write(str(state))
    time.sleep(float(os.environ.get("WCH_SELFTEST_HOLD", "3")))
    window.destroy()


def main():
    root = resource_dir()
    api = Api()
    window = webview.create_window(
        f"{APP_NAME} - by {AUTHOR}",
        url=os.path.join(root, "index.html"),
        js_api=api,
        width=1360, height=880, min_size=(900, 600),
        text_select=True,
    )
    api._window = window

    def on_loaded():
        # run off the GUI thread; evaluate_js blocks until the page answers
        threading.Thread(target=lambda: window.evaluate_js(INJECT_JS), daemon=True).start()
        if os.environ.get("WCH_SELFTEST_DIR"):
            threading.Thread(target=_selftest, args=(window,), daemon=True).start()

    window.events.loaded += on_loaded

    storage = os.path.join(os.environ.get("LOCALAPPDATA", root), "WCH-Configurator")
    webview.start(gui="edgechromium", http_server=True, private_mode=False,
                  storage_path=storage, debug="--debug" in sys.argv)


if __name__ == "__main__":
    main()
