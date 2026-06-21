(function () {
    'use strict';

    // superplugin.js — one entry that pulls in every plugin of this repository.
    //
    // Add this single URL in Lampa (Settings → Extensions) and it registers + loads all the
    // sibling plugins from the same directory. Registration goes through Lampa.Plugins so they
    // also appear in the Extensions list and persist across reboots. Re-adding is idempotent:
    // plugins already present in the catalog are skipped.

    if (window.plugin_superplugin) return;
    window.plugin_superplugin = true;

    // Plugins shipped by this repo (this loader itself is intentionally excluded).
    var FILES = [
        'etor',            // enables the torrents button (sets torrents_use)
        'torrents.js',     // custom torrent screen (quality+seeders sort, UX fixes)
        'torr_styles.js',  // extra torrent text replacements / tracker colours
        'collections.js',  // collections section + card management
        'lme-slim.js',     // slim card buttons
        'kinopoisk.js',    // "open in KinoPoisk" button
        'unblock.js'       // lift category restrictions
    ];

    var FALLBACK_BASE = 'https://darknotevil.github.io/lampa-plugins-collection/';

    // Resolve the directory this script was loaded from, so it also works from a mirror/fork.
    function baseUrl() {
        var src = '';

        if (document.currentScript && document.currentScript.src) {
            src = document.currentScript.src;
        } else {
            var scripts = document.getElementsByTagName('script');
            for (var i = scripts.length - 1; i >= 0; i--) {
                if (scripts[i].src && /superplugin\.js(\?|$)/.test(scripts[i].src)) {
                    src = scripts[i].src;
                    break;
                }
            }
        }

        if (!src) return FALLBACK_BASE;

        return src.replace(/[^/]*(\?.*)?$/, '');
    }

    function run() {
        var Lampa = window.Lampa;

        if (!Lampa || !Lampa.Plugins) {
            // Plugin manager not available — fall back to plain <script> injection.
            injectRaw();
            return;
        }

        var base = baseUrl();
        var list = Lampa.Plugins.get ? Lampa.Plugins.get() : [];

        FILES.forEach(function (file) {
            var url = base + file;

            var exists = list.some(function (p) {
                var u = typeof p === 'string' ? p : p.url;
                return u === url;
            });

            if (exists) return;

            var plug = { url: url, name: file.replace(/\.js$/, ''), status: 1 };

            try {
                if (Lampa.Plugins.add) Lampa.Plugins.add(plug);   // persist in catalog
                if (Lampa.Plugins.push) Lampa.Plugins.push(plug); // load now
                else injectOne(url);
            } catch (e) {
                console.error('[superplugin] failed to load ' + url, e);
                injectOne(url);
            }
        });
    }

    function injectOne(url) {
        if (document.querySelector('script[data-superplugin="' + url + '"]')) return;

        var s = document.createElement('script');
        s.src = url;
        s.async = true;
        s.setAttribute('data-superplugin', url);
        document.body.appendChild(s);
    }

    function injectRaw() {
        var base = baseUrl();
        FILES.forEach(function (file) { injectOne(base + file); });
    }

    if (window.appready) run();
    else if (window.Lampa && window.Lampa.Listener) {
        window.Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') run();
        });
    } else {
        // Lampa not present yet at all — best-effort raw injection on DOM ready.
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', injectRaw);
        } else {
            injectRaw();
        }
    }
})();
