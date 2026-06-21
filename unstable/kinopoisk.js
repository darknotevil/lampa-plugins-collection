(function () {
    'use strict';

    // Кнопка «Открыть в КиноПоиске» в карточке фильма.
    // Нажатие  -> открыть фильм в приложении КиноПоиск (deeplink kpatv://film/<id>).
    // Долгое   -> открыть страницу фильма на сайте в браузере (надёжный запасной путь).
    //
    // Примечание: приложение ru.kinopoisk.tv ловит kpatv://film/<id> и
    // https://hd.kinopoisk.ru/film/<id>, но идентификатор там — внутренний HD-id.
    // Классический kinopoisk_id совпадает для фильмов, доступных в КиноПоиск HD;
    // для остальных приложение откроет домашнюю — тогда выручает долгое нажатие (сайт).

    // Достаём kinopoisk_id из разных мест события 'full'.
    function getKpId(e) {
      var srcs = [e && e.data && e.data.movie, e && e.object && e.object.card, e && e.object && e.object.movie, e && e.object];
      for (var i = 0; i < srcs.length; i++) {
        var o = srcs[i];
        if (o && o.kinopoisk_id) return o.kinopoisk_id;
      }
      return null;
    }

    function getTitle(e) {
      var srcs = [e && e.data && e.data.movie, e && e.object && e.object.card, e && e.object && e.object.movie];
      for (var i = 0; i < srcs.length; i++) {
        var o = srcs[i];
        if (o && (o.title || o.name)) return o.title || o.name;
      }
      return '';
    }

    function filmUrl(id) {
      return 'https://www.kinopoisk.ru/film/' + id + '/';
    }

    function searchUrl(title) {
      return 'https://www.kinopoisk.ru/index.php?kp_query=' + encodeURIComponent(title);
    }

    // Открыть URL/схему так, чтобы её перехватила ОС (webview Лампы передаёт
    // неизвестные схемы системе — как с lampa://exit). Для kpatv:// откроется приложение.
    function openScheme(url) {
      try {
        var a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
          if (a.parentNode) a.parentNode.removeChild(a);
        }, 1000);
      } catch (e) {
        if (window.Lampa && Lampa.Android && Lampa.Android.openBrowser) Lampa.Android.openBrowser(url);
      }
    }

    // Открыть веб-страницу в браузере.
    function openSite(url) {
      if (window.Lampa && Lampa.Android && Lampa.Android.openBrowser) Lampa.Android.openBrowser(url);
      else window.open(url, '_blank');
    }

    // Открыть фильм в приложении КиноПоиск.
    function openInApp(id) {
      openScheme('kpatv://film/' + id);
    }

    function buttonHtml() {
      return '<div class="full-start__button selector view--kinopoisk">' +
        '<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<text x="16" y="22" font-family="Arial, sans-serif" font-size="15" font-weight="700" text-anchor="middle" fill="currentColor">КП</text>' +
        '</svg>' +
        '<span>КиноПоиск</span>' +
        '</div>';
    }

    function getContainer(e) {
      if (e && e.object && e.object.activity && typeof e.object.activity.render === 'function') return e.object.activity.render();
      if (e && e.body) return e.body;
      return null;
    }

    function addButton(e) {
      if (e.type !== 'complite') return;

      var container = getContainer(e);
      if (!container) return;

      var root = container.find ? container : $(container);
      var buttons = root.find('.full-start-new__buttons');
      if (!buttons.length) return;
      if (buttons.find('.view--kinopoisk').length) return; // не дублируем

      var id = getKpId(e);
      var title = getTitle(e);
      if (!id && !title) return; // нечего открывать

      var btn = $(buttonHtml());

      // Нажатие — открыть в приложении (если есть id), иначе поиск на сайте.
      btn.on('hover:enter', function () {
        if (id) openInApp(id);
        else openSite(searchUrl(title));
      });

      // Долгое нажатие — открыть страницу фильма на сайте в браузере.
      btn.on('hover:long', function () {
        openSite(id ? filmUrl(id) : searchUrl(title));
      });

      buttons.append(btn);
    }

    function start() {
      Lampa.Listener.follow('full', addButton);
    }

    if (window.appready) start();
    else Lampa.Listener.follow('app', function (e) {
      if (e.type === 'ready') start();
    });

})();
