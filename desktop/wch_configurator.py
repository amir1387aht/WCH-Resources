"""
WCH Configurator - Desktop edition (Windows, Linux and macOS)

Original tool: WCH Configurator, made by Amir1387aht (Another)
Source:        https://github.com/amir1387aht/WCH-Resources

This is a thin native shell around the project's own `index.html`. All
configuration and C-code / VS Code project generation stays in that single
file, so the desktop app always produces exactly the same output as the web
tool. The shell only adds what a browser normally provides:

  * a native window (pywebview: Microsoft Edge WebView2 on Windows, Qt WebEngine or
    WebKitGTK on Linux, WKWebView on macOS),
  * a toolbar with icons: New / Open / Save / Save As project (.wchproj),
    Generate code, Example, Copy code, Save .c, VS Code project, Guide,
    Source / GitHub, About (with keyboard shortcuts),
  * project folders: the .wchproj lives in the VS Code project folder and
    "Generate code" rewrites the generated files there, keeping the code between
    USER CODE BEGIN / USER CODE END (the merge itself is done by index.html),
  * `WCH-Configurator <folder or .wchproj>` opens that project (used by the
    exported project's VS Code task "WCH: Open in Configurator"),
  * native "Save as" dialogs for "Download .c" and "VS Code project (.zip)",
  * opening external links (GitHub, e-mail, WCH sites) in the default browser,
  * a "Source / GitHub" bar and an About dialog with the original credit.

Everything runs offline. Only the exported VS Code project's own Setup task
downloads the WCH EVT later, and that happens inside VS Code, not here.
"""

import base64
import ctypes
import json
import os
import subprocess
import sys
import threading
import webbrowser

import webview

APP_NAME = "WCH Configurator"
APP_VERSION = "1.6.0"
AUTHOR = "Amir1387aht (Another)"
AUTHOR_EMAIL = "amir1387aht@gmail.com"
REPO_URL = "https://github.com/amir1387aht/WCH-Resources"
AUTHOR_URL = "https://github.com/amir1387aht"
PROJECT_TYPES = ("WCH Configurator project (*.wchproj)", "All files (*.*)")
IS_WIN = sys.platform.startswith("win")
IS_MAC = sys.platform == "darwin"


def logo_data_uri(root):
    """App icon (64 px PNG taken from icon.ico) as a data: URI for the page header, or "" if missing."""
    import base64, struct
    for folder in (root, os.path.dirname(os.path.abspath(__file__))):
        path = os.path.join(folder, "icon.ico")
        if not os.path.isfile(path):
            continue
        try:
            data = open(path, "rb").read()
            count = struct.unpack("<HHH", data[:6])[2]
            best = None
            for i in range(count):
                w, _h, _c, _r, _p, _b, size, off = struct.unpack("<BBBBHHII", data[6 + 16 * i:22 + 16 * i])
                w = w or 256
                png = data[off:off + size]
                if png[:4] == b"\x89PNG" and (best is None or abs(w - 64) < abs(best[0] - 64)):
                    best = (w, png)
            if best:
                return "data:image/png;base64," + base64.b64encode(best[1]).decode("ascii")
        except (OSError, struct.error):
            pass
    return ""


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
    """Clipboard write (fallback when navigator.clipboard is unavailable)."""
    if not IS_WIN:
        cmds = (["pbcopy"],) if IS_MAC else (["wl-copy"], ["xclip", "-selection", "clipboard"], ["xsel", "--clipboard", "--input"])
        for cmd in cmds:
            try:
                subprocess.run(cmd, input=(text or "").encode("utf-8"), check=True, timeout=5)
                return True
            except (OSError, subprocess.SubprocessError):
                continue
        return False
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

    # -- file dialogs ---------------------------------------------------------
    def _ask(self, kind, filename="", file_types=()):
        """Native file dialog; returns a path or None. In self-test mode no dialog is shown."""
        selftest_dir = os.environ.get("WCH_SELFTEST_DIR")
        if selftest_dir:
            if kind == "FOLDER":
                d = os.path.join(selftest_dir, "project")
                os.makedirs(d, exist_ok=True)
                return d
            return os.path.join(selftest_dir, os.path.basename(filename or "selftest.wchproj"))
        fd = getattr(webview, "FileDialog", None)
        k = getattr(fd, kind, None) if fd else None
        if k is None:
            k = getattr(webview, kind + "_DIALOG")
        kw = {"file_types": file_types} if file_types else {}
        if kind == "SAVE":
            kw["save_filename"] = filename
        result = self._window.create_file_dialog(k, **kw)
        if not result:
            return None
        return result if isinstance(result, str) else result[0]

    def _title(self, path=None):
        name = os.path.basename(path) + " - " if path else ""
        try:
            self._window.set_title(f"{name}{APP_NAME} - by {AUTHOR}")
        except Exception:
            pass

    def save_file(self, filename, b64data):
        """Download .c / VS Code project (.zip): ask where, then write the bytes."""
        ext = os.path.splitext(filename)[1].lower()
        types = {".c": ("C source (*.c)", "All files (*.*)"),
                 ".zip": ("ZIP archive (*.zip)", "All files (*.*)")}.get(ext, ())
        path = self._ask("SAVE", filename, types)
        if not path:
            return {"ok": False, "cancelled": True}
        try:
            with open(path, "wb") as f:
                f.write(base64.b64decode(b64data))
        except OSError as e:
            return {"ok": False, "error": str(e)}
        return {"ok": True, "path": path}

    # -- project files (.wchproj = JSON of the page's configuration) ----------
    def save_project(self, filename, text, path=None):
        """Save: write to `path` when the project already has one, else ask (Save As)."""
        if not path or not os.path.isdir(os.path.dirname(path)):
            path = self._ask("SAVE", filename, PROJECT_TYPES)
            if not path:
                return {"ok": False, "cancelled": True}
        try:
            with open(path, "w", encoding="utf-8", newline="\n") as f:
                f.write(text)
        except OSError as e:
            return {"ok": False, "error": str(e)}
        self._title(path)
        return {"ok": True, "path": path}

    def open_project(self):
        path = self._ask("OPEN", "", PROJECT_TYPES)
        if not path:
            return {"ok": False, "cancelled": True}
        try:
            if os.path.getsize(path) > 5 * 1024 * 1024:
                return {"ok": False, "error": "file is too large for a project file"}
            with open(path, "r", encoding="utf-8") as f:
                text = f.read()
        except (OSError, UnicodeDecodeError) as e:
            return {"ok": False, "error": str(e)}
        self._title(path)
        return {"ok": True, "path": path, "text": text}

    def new_project(self):
        self._title(None)
        return True

    def open_url(self, url):
        if isinstance(url, str) and url.startswith(("http://", "https://", "mailto:")):
            if IS_WIN:
                os.startfile(url)  # default browser / mail client
            else:
                webbrowser.open(url)
            return True
        return False

    # -- project folders (the VS Code project: CMakeLists.txt, src/, <name>.wchproj) --
    @staticmethod
    def _inside(root, rel):
        """Absolute path of `rel` inside `root`; None when it would leave the folder."""
        if not isinstance(rel, str) or not rel or os.path.isabs(rel) or ":" in rel:
            return None
        root = os.path.realpath(root)
        path = os.path.realpath(os.path.join(root, *rel.replace("\\", "/").split("/")))
        try:
            inside = os.path.commonpath([root, path]) == root
        except ValueError:   # another drive
            return None
        return path if inside and path != root else None

    def _folder_result(self, root):
        root = os.path.realpath(root)
        if not os.path.isdir(root):
            return {"ok": False, "error": "folder not found: " + root}
        self._title(root)
        return {"ok": True, "root": root}

    def project_open(self, path=None):
        """Open a project: a .wchproj file (its folder is the project folder) or the folder itself."""
        if not path:
            path = self._ask("OPEN", "", PROJECT_TYPES)
            if not path:
                return {"ok": False, "cancelled": True}
        if os.path.isdir(path):
            return self._folder_result(path)
        if os.path.isfile(path):
            return self._folder_result(os.path.dirname(os.path.abspath(path)))
        return {"ok": False, "error": "not found: " + str(path)}

    def project_pick_folder(self):
        path = self._ask("FOLDER")
        if not path:
            return {"ok": False, "cancelled": True}
        return self._folder_result(path)

    def project_folder_list(self, root):
        try:
            return sorted(os.listdir(root))
        except OSError:
            return []

    def project_folder_read(self, root, rels):
        out = {}
        for rel in (rels or [])[:5000]:
            path = self._inside(root, rel)
            text = None
            if path and os.path.isfile(path) and os.path.getsize(path) <= 8 * 1024 * 1024:
                try:
                    with open(path, "r", encoding="utf-8", newline="") as f:
                        text = f.read()
                except (OSError, UnicodeDecodeError):
                    text = None
            out[rel] = text
        return out

    def project_folder_write(self, root, writes, removes):
        """Write the generated files (text, as given) and remove the ones that are no longer generated."""
        try:
            for rel, text in (writes or {}).items():
                path = self._inside(root, rel)
                if not path:
                    return {"ok": False, "error": "refused path " + str(rel)}
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "w", encoding="utf-8", newline="") as f:
                    f.write(text if isinstance(text, str) else "")
            for rel in removes or []:
                path = self._inside(root, rel)
                if path and os.path.isfile(path):
                    os.remove(path)
        except OSError as e:
            return {"ok": False, "error": str(e)}
        return {"ok": True}

    def project_save(self, root, filename, text):
        """Save <name>.wchproj into the project folder, or ask where (Save As)."""
        if root and os.path.isdir(root):
            path = os.path.join(root, os.path.basename(filename))
        else:
            path = self._ask("SAVE", filename, PROJECT_TYPES)
            if not path:
                return {"ok": False, "cancelled": True}
        try:
            with open(path, "w", encoding="utf-8", newline="\n") as f:
                f.write(text)
        except OSError as e:
            return {"ok": False, "error": str(e)}
        self._title(os.path.dirname(os.path.abspath(path)))
        return {"ok": True, "path": path, "root": os.path.dirname(os.path.abspath(path))}

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

  // 0) app logo in the page header instead of the generic mark
  const LOGO = '__LOGO__';
  if (LOGO.indexOf('data:image/') === 0) {
    const mk = document.querySelector('.brand .mark');
    if (mk && !mk.querySelector('svg')) {   // newer pages already carry the logo
      mk.textContent = '';
      mk.style.background = 'none';
      mk.style.boxShadow = 'none';
      const img = document.createElement('img');
      img.src = LOGO; img.alt = 'WCH Configurator';
      img.style.cssText = 'width:100%;height:100%;display:block;object-fit:contain';
      mk.appendChild(img);
    }
  }
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

  // 4) project files: the page keeps its whole configuration in the global `state`
  const page = () => (typeof state !== 'undefined') ? state : null;   // eslint-disable-line no-undef
  const $id = id => document.getElementById(id);
  let projectPath = null;

  const wp = () => window.wchProject;   // newer pages: projects, folders and Generate live in index.html
  function projectJson(){
    if (wp()) return wp().json();
    const s = page(); if (!s) throw new Error('this page version has no project state');
    return JSON.stringify({
      app: 'wch-configurator', format: 1,
      credit: 'WCH Configurator by Amir1387aht (Another) - https://github.com/amir1387aht/WCH-Resources',
      family: s.family, variant: s.variant, pkg: s.pkg || null,
      configs: s.configs || [], labels: s.labels || {}, seq: s.seq || 1
    }, null, 2);
  }
  // only plain data from a project file, and no markup in strings
  function clean(v, depth){
    if (depth > 6) return undefined;
    if (typeof v === 'string') return v.replace(/[<>]/g, '').slice(0, 200);
    if (typeof v === 'number' || typeof v === 'boolean' || v === null) return v;
    if (Array.isArray(v)) return v.slice(0, 2000).map(x => clean(x, depth + 1));
    if (typeof v === 'object') { const o = {}; for (const k of Object.keys(v).slice(0, 200)) o[String(k).replace(/[<>]/g, '')] = clean(v[k], depth + 1); return o; }
    return undefined;
  }
  function loadProject(text){
    if (wp()) return wp().load(text);
    const s = page(); if (!s) throw new Error('this page version has no project state');
    let p = JSON.parse(text);
    if (!p || p.app !== 'wch-configurator') throw new Error('not a WCH Configurator project file');
    p = clean(p, 0);
    if (typeof FAMILIES !== 'undefined' && !FAMILIES[p.family]) throw new Error('unknown family ' + p.family);  // eslint-disable-line no-undef
    const fb = [...document.querySelectorAll('.fam-btn')].find(b => b.dataset.fam === p.family);
    if (fb) fb.click();
    const vs = $id('variantSelect');
    if (vs && p.variant && [...vs.options].some(o => o.value === p.variant)) { vs.value = p.variant; vs.dispatchEvent(new Event('change')); }
    const ps = $id('pkgSelect');
    if (ps && p.pkg && !ps.disabled && [...ps.options].some(o => o.value === p.pkg)) { ps.value = p.pkg; ps.dispatchEvent(new Event('change')); }
    s.configs = Array.isArray(p.configs) ? p.configs : [];
    if ('labels' in s || p.labels) s.labels = p.labels || {};
    s.seq = Math.max(p.seq || 1, ...s.configs.map(c => (+c.id || 0) + 1), 1);
    s.editId = null;
    ['renderForm', 'drawChip', 'renderAll'].forEach(fn => { if (typeof window[fn] === 'function') window[fn](); });
    return s.configs.length;
  }
  window.__wchLoadProject = loadProject;
  window.__wchProjectJson = projectJson;
  const projName = () => { const s = page(); return ((s && s.variant) || 'wch').toLowerCase() + '_project.wchproj'; };

  const actions = {
    newProject(){
      const s = page();
      if (s && (s.configs || []).length && !confirm('Start a new project? Unsaved changes are lost.')) return;
      $id('clearBtn') && $id('clearBtn').click();
      if (typeof window.renderAll === 'function') window.renderAll();
      projectPath = null; api().new_project();
    },
    async openProject(){
      if (wp()) return wp().open();
      const r = await api().open_project();
      if (!r || !r.ok) { if (r && r.error) toast('Could not open: ' + r.error, true); return; }
      try { const n = loadProject(r.text); projectPath = r.path; toast('Opened ' + r.path + ' (' + n + ' items)'); }
      catch (e) { toast('Could not open: ' + e.message, true); }
    },
    async saveProject(asNew){
      if (wp()) return wp().save(asNew);
      let text; try { text = projectJson(); } catch (e) { toast(e.message, true); return; }
      const r = await api().save_project(projName(), text, asNew ? null : projectPath);
      if (r && r.ok) { projectPath = r.path; toast('Saved: ' + r.path); }
      else if (r && r.error) toast('Could not save: ' + r.error, true);
    },
    generate(){ wp() && wp().generate(); },
    example(){ $id('exampleBtn') && $id('exampleBtn').click(); },
    copy(){ $id('copyBtn') && $id('copyBtn').click(); },
    saveC(){ $id('downloadBtn') && $id('downloadBtn').click(); },
    exportVsc(){ $id('vscodeBtn') && $id('vscodeBtn').click(); },
    guide(){ $id('vscodeHelpBtn') && $id('vscodeHelpBtn').click(); },
    github(){ api().open_url('https://github.com/amir1387aht/WCH-Resources'); },
    about(){ $id('wch-about').showModal(); },
  };
  window.__wchDesktopActions = actions;

  // 5) toolbar with icons (inline SVG, no network)
  const I = {
    file:   '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 11v6M9 14h6"/>',
    open:   '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H7.5a2 2 0 0 0-1.9 1.4L3 19z"/><path d="M3 19l2.6-7.6A2 2 0 0 1 7.5 10H22l-2.7 8a2 2 0 0 1-1.9 1.4H3"/>',
    save:   '<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8V3M7 21v-7h10v7"/>',
    saveas: '<path d="M5 3h11l5 5v4M12 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2"/><path d="M7 3v5h8V3M7 21v-7h5"/><path d="M19.5 14.5l2 2-5 5H14.5v-2z"/>',
    gen:    '<path d="M4 4h7v7H4zM13 13h7v7h-7z"/><path d="M11 7.5h4.5a2 2 0 0 1 2 2V13M13 16.5H8.5a2 2 0 0 1-2-2V11"/>',
    spark:  '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    copy:   '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    code:   '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M10 12l-2 2 2 2M14 12l2 2-2 2"/>',
    pkg:    '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    help:   '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/>',
    gh:     '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
    info:   '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  };
  const svg = p => '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
  const B = [
    ['new',    'file',   'New',            'New project (Ctrl+N)',                       actions.newProject],
    ['open',   'open',   'Open',           'Open project file (Ctrl+O)',                 actions.openProject],
    ['save',   'save',   'Save',           'Save project (Ctrl+S)',                      () => actions.saveProject(false)],
    ['saveas', 'saveas', 'Save As',        'Save project as a new file (Ctrl+Shift+S)',  () => actions.saveProject(true)],
    ['gen',    'gen',    'Generate code',  'Write the code into the project folder, keeping USER CODE sections (Ctrl+G)', actions.generate, 'projGenBtn'],
    '|',
    ['example','spark',  'Example',        'Load an example configuration',             actions.example, 'exampleBtn'],
    '|',
    ['copy',   'copy',   'Copy code',      'Copy the generated C code (Ctrl+Shift+C)',   actions.copy, 'copyBtn'],
    ['savec',  'code',   'Save .c',        'Save the generated C file (Ctrl+Shift+E)',   actions.saveC, 'downloadBtn'],
    ['vsc',    'pkg',    'VS Code project','Export a ready-to-build VS Code project (.zip) (Ctrl+E)', actions.exportVsc, 'vscodeBtn'],
    ['guide',  'help',   'Guide',          'How to use the exported project (F1)',       actions.guide, 'vscodeHelpBtn'],
  ];
  const css = document.createElement('style');
  css.textContent = `
    #wch-desktop-bar{position:sticky;top:0;z-index:9000;display:flex;align-items:center;gap:2px;padding:5px 10px;
      background:linear-gradient(#10293d,#0b1f2f);border-bottom:1px solid #1d3c52;color:#cfe3f1;
      font:12.5px Inter,'Segoe UI',sans-serif;user-select:none;flex-wrap:wrap}
    #wch-desktop-bar .tb{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 9px;border:1px solid transparent;
      border-radius:6px;background:transparent;color:inherit;font:inherit;cursor:pointer;white-space:nowrap}
    #wch-desktop-bar .tb:hover{background:#173a55;border-color:#2b5675;color:#fff}
    #wch-desktop-bar .tb:active{background:#1e4a6b}
    #wch-desktop-bar .tb svg{color:#f0b24a;flex:none}
    #wch-desktop-bar .sep{width:1px;height:20px;background:#244a66;margin:0 6px}
    #wch-desktop-bar .credit{margin-left:auto;display:flex;align-items:center;gap:4px;padding-left:10px}
    #wch-desktop-bar .credit span{opacity:.85;margin-right:4px}
    #wch-desktop-bar .credit a{color:#7cc4ff;text-decoration:none}
    @media (max-width:1180px){#wch-desktop-bar .tb .lbl{display:none}}`;
  document.head.appendChild(css);

  const REPO = 'https://github.com/amir1387aht/WCH-Resources';
  const bar = document.createElement('div');
  bar.id = 'wch-desktop-bar';
  bar.setAttribute('role', 'toolbar');
  for (const b of B) {
    if (b === '|') { const s = document.createElement('span'); s.className = 'sep'; bar.appendChild(s); continue; }
    const [id, icon, label, tip, fn, needs] = b;
    if (needs && !$id(needs)) continue;                       // hide tools this page version lacks
    if (['save', 'saveas', 'open'].includes(id) && !page()) continue;
    const el = document.createElement('button');
    el.className = 'tb'; el.id = 'wch-tb-' + id; el.title = tip; el.type = 'button';
    el.innerHTML = svg(I[icon]) + '<span class="lbl">' + label + '</span>';
    el.addEventListener('click', fn);
    bar.appendChild(el);
  }
  const credit = document.createElement('div');
  credit.className = 'credit';
  credit.innerHTML = '<span>Made by <b>Amir1387aht</b> (Another)</span>'
    + '<button class="tb" id="wch-tb-github" title="Source / GitHub: ' + REPO + '">' + svg(I.gh) + '<span class="lbl">Source / GitHub</span></button>'
    + '<button class="tb" id="wch-about-btn" title="About">' + svg(I.info) + '<span class="lbl">About</span></button>';
  bar.appendChild(credit);
  document.body.insertBefore(bar, document.body.firstChild);
  $id('wch-tb-github').addEventListener('click', actions.github);

  // keyboard shortcuts
  document.addEventListener('keydown', e => {
    const k = e.key.toLowerCase(), c = e.ctrlKey || e.metaKey;
    let f = null;
    if (c && !e.shiftKey && k === 'n') f = actions.newProject;
    else if (c && !e.shiftKey && k === 'o') f = page() && actions.openProject;
    else if (c && e.shiftKey && k === 's') f = page() && (() => actions.saveProject(true));
    else if (c && k === 's') f = page() && (() => actions.saveProject(false));
    else if (c && !e.shiftKey && k === 'g') f = wp() && actions.generate;
    else if (c && !e.shiftKey && k === 'e') f = actions.exportVsc;
    else if (c && e.shiftKey && k === 'e') f = actions.saveC;
    else if (c && e.shiftKey && k === 'c') f = actions.copy;
    else if (k === 'f1') f = actions.guide;
    if (f) { e.preventDefault(); f(); }
  }, true);

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
    + '<p style="margin:0 0 4px;opacity:.8;font-size:12.5px">Desktop edition for Windows, Linux and macOS: zamanimahdi</p>'
    + '<p style="margin:10px 0;opacity:.8;font-size:12.5px">Any usage of this work without crediting the author\'s name '
    + '(Amir1387aht) is forbidden. Runs fully offline; the generated code is produced locally by the same '
    + 'generator as the web version.</p>'
    + '<div style="text-align:right"><button id="wch-about-close" style="cursor:pointer;border:1px solid #3a6380;'
    + 'background:#173247;color:#e6edf3;border-radius:6px;padding:5px 14px;font:inherit">Close</button></div>';
  document.body.appendChild(dlg);
  document.getElementById('wch-about-btn').onclick = actions.about;
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
    window.evaluate_js("document.getElementById('wch-tb-savec').click()")
    window.evaluate_js("document.getElementById('wch-tb-vsc').click()")
    # project round trip: save, clear, load the saved file back, compare
    window.evaluate_js("document.getElementById('wch-tb-saveas').click()")
    time.sleep(1.5)
    before = window.evaluate_js("JSON.stringify(state.configs)")
    proj = [f for f in os.listdir(out) if f.endswith(".wchproj")]
    roundtrip = False
    if proj:
        with open(os.path.join(out, proj[0]), encoding="utf-8") as f:
            text = f.read()
        window.evaluate_js("document.getElementById('clearBtn').click()")
        window.evaluate_js("window.__wchLoadProject(%s)" % json.dumps(text))
        time.sleep(1)
        roundtrip = window.evaluate_js("JSON.stringify(state.configs)") == before
    # project folder: Generate, user code, Generate again (the folder dialog returns <out>/project)
    gen_ok = False
    if window.evaluate_js("!!window.wchProject"):
        window.evaluate_js("document.getElementById('wch-tb-gen').click()")
        time.sleep(3)
        main_c = os.path.join(window.evaluate_js("window.wchProject.folder()") or os.path.join(out, "project"), "src", "main.c")
        if os.path.isfile(main_c):
            with open(main_c, encoding="utf-8", newline="") as f:
                text = f.read()
            with open(main_c, "w", encoding="utf-8", newline="") as f:
                f.write(text.replace("/* USER CODE BEGIN 2 */", "/* USER CODE BEGIN 2 */\n    selftest_user_code();", 1))
            window.evaluate_js("document.getElementById('wch-tb-gen').click()")
            time.sleep(3)
            with open(main_c, encoding="utf-8", newline="") as f:
                gen_ok = "selftest_user_code();" in f.read()
    state = window.evaluate_js(
        "JSON.stringify({bar: !!document.getElementById('wch-desktop-bar'),"
        " tools: [...document.querySelectorAll('#wch-desktop-bar .tb')].map(b => b.id.replace('wch-tb-','')),"
        " credit: document.body.innerText.includes('Amir1387aht'),"
        " repo: document.body.innerHTML.includes('github.com/amir1387aht/WCH-Resources')})")
    state = state[:-1] + ', "project_roundtrip": %s, "generate_keeps_user_code": %s, "platform": %s}' % (
        json.dumps(roundtrip), json.dumps(gen_ok), json.dumps(sys.platform))
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
    inject_js = INJECT_JS.replace("__LOGO__", logo_data_uri(root))

    start_path = next((a for a in sys.argv[1:] if not a.startswith("-")), None)

    def inject():
        window.evaluate_js(inject_js)
        if start_path:   # WCH-Configurator <project folder | file.wchproj>
            import time
            for _ in range(50):   # the page's API bridge (window.pywebview.api) comes up a little later
                if window.evaluate_js("!!(window.wchProject && window.pywebview && window.pywebview.api)"):
                    break
                time.sleep(0.2)
            window.evaluate_js("window.wchProject && window.wchProject.openPath(%s)" % json.dumps(os.path.abspath(start_path)))

    def on_loaded():
        # run off the GUI thread; evaluate_js blocks until the page answers
        threading.Thread(target=inject, daemon=True).start()
        if os.environ.get("WCH_SELFTEST_DIR"):
            threading.Thread(target=_selftest, args=(window,), daemon=True).start()

    window.events.loaded += on_loaded

    if IS_WIN:
        storage = os.path.join(os.environ.get("LOCALAPPDATA", root), "WCH-Configurator")
        gui = "edgechromium"
    elif IS_MAC:
        storage = os.path.join(os.path.expanduser("~/Library/Application Support"), "WCH-Configurator")
        gui = os.environ.get("WCH_GUI") or None   # pywebview uses Cocoa (WKWebView) on macOS
    else:
        storage = os.path.join(os.environ.get("XDG_DATA_HOME", os.path.expanduser("~/.local/share")), "WCH-Configurator")
        gui = os.environ.get("WCH_GUI") or None   # pywebview picks Qt (bundled in the Linux build) or GTK
    webview.start(gui=gui, http_server=True, private_mode=False,
                  storage_path=storage, debug="--debug" in sys.argv)


if __name__ == "__main__":
    main()
