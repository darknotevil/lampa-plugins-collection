(function () {
    'use strict';

    // Кнопки «КиноПоиск» и «Okko» в карточке фильма/сериала.
    // Нажатие  -> открыть фильм прямо в Android TV приложении (диплинк).
    // Долгое   -> открыть страницу/поиск на сайте в браузере.
    //
    // Как это работает (разобрано по APK ru.kinopoisk.tv 2.265 и tv.okko.androidtv 3.188):
    // - КиноПоиск: kpatv://film?filmId=<contentId>, где contentId — 32-hex uuid КП HD
    //   (НЕ числовой kinopoisk_id и НЕ kpatv://film/<id> — путь приложение игнорирует).
    //   contentId берём из GraphQL КП: whitelisted-запрос SearchTVSuggest из самого APK
    //   (сервер пускает только запросы с точным текстом), ищет только то, что есть в КП HD.
    // - Okko: okko://movie?uid=<uuid>&type=MOVIE|SERIAL. API Okko закрыт антиботом, поэтому
    //   uid берём из JustWatch (оферы Okko содержат готовый android-диплинк).
    // - Запуск: AndroidJS.openBrowser(url) = Intent ACTION_VIEW с любой схемой.
    //   Нельзя кликать <a href="okko://..."> — WebView Лампы сам уйдёт на эту страницу
    //   (ERR_UNKNOWN_URL_SCHEME) и Лампа «сломается».

    if (window.plugin_kinopoisk_okko) return;
    window.plugin_kinopoisk_okko = true;

    var KP_GRAPHQL = 'https://graphql.kinopoisk.ru/graphql/?operationName=SearchTVSuggest';
    var JW_GRAPHQL = 'https://apis.justwatch.com/graphql';

    // Точная копия запроса из APK КиноПоиска — менять нельзя, иначе "the query is not allowed".
    var KP_SEARCH_QUERY = "query SearchTVSuggest($keyword: String!, $groupLimit: Int!, $includePersons: Boolean!, $includeMovieTops: Boolean!, $includeMovieRating: Boolean!, $includeMovieRightholderForPoster: Boolean!, $includeAvailabilityOptions: Boolean!, $includeSeriesSeasonsCount: Boolean!, $includeFilmDuration: Boolean!, $includeMovieHorizontalCover: Boolean!, $includeMovieHorizontalLogo: Boolean!, $includeMovieUserVote: Boolean!, $includeMovieUserPlannedToWatch: Boolean!, $includeMovieUserFolders: Boolean!, $includeMovieUserWatched: Boolean!, $includeMovieUserNotInterested: Boolean!, $includeMovieContentFeatures: Boolean!, $includeMovieOnlyClientSupportedContentFeatures: Boolean, $includeMovieViewOption: Boolean!, $includeMovieTop250: Boolean!, $includePlannedToWatchRating: Boolean! = false , $purchaseOptionsContext: BillingFeatureClientContextInput!, $includeMoviePurchaseOptions: Boolean!, $onlyAvailableMeMovies: Boolean!, $includeTrialCutInfo: Boolean!, $includeTicketOption: Boolean! = false , $includeMovieReleaseDate: Boolean!) { suggest(keyword: $keyword) { movies(offset: 0, limit: $groupLimit, isOnline: true, onlySearchable: false, onlyAvailableMe: $onlyAvailableMeMovies) { limit total items { movie { __typename ...movieSummaryFragment } } } persons(offset: 0, limit: $groupLimit, onlyWithOnlines: true) @include(if: $includePersons) { limit total items { person { __typename ...personSummaryFragment } } } } }  fragment movieYearsFragment on Movie { __typename ... on VideoInterface { productionYear(override: OTT_WHEN_EXISTS) } ... on Series { fallbackYear: productionYear releaseYears { start end } } }  fragment movieTopsFragment on Movie { ratingLists { top10 { position movieListSlug } top250 @include(if: $includeMovieTop250) { position movieListSlug } } }  fragment imageFragment on Image { avatarsUrl fallbackUrl }  fragment baseMoviePostersFragment on MoviePosters { vertical(override: OTT_WHEN_EXISTS) { __typename ...imageFragment } verticalWithRightholderLogo { __typename ...imageFragment } horizontal { __typename ...imageFragment } horizontalWithRightholderLogo { __typename ...imageFragment } }  fragment movieIntroPostersFragment on MoviePosters { verticalIntro { __typename ...imageFragment } verticalIntroWithRightholderLogo { __typename ...imageFragment } horizontalIntro { __typename ...imageFragment } horizontalIntroWithRightholderLogo { __typename ...imageFragment } }  fragment moviePostersFragment on MoviePosters { __typename ...baseMoviePostersFragment ...movieIntroPostersFragment }  fragment imageWithSizeFragment on Image { __typename ...imageFragment origSize { width height } }  fragment titleFragment on Title { localized original }  fragment genreFragment on Genre { id name }  fragment countryFragment on Country { id name }  fragment ratingValueFragment on RatingValue { isActive count value(precision: 1) }  fragment ratingFragment on Rating { kinopoisk { __typename ...ratingValueFragment } plannedToWatch @include(if: $includePlannedToWatchRating) { __typename ...ratingValueFragment } }  fragment movieViewOptionPurchasedSubscriptionFragment on ViewOption { purchasedSubscriptionTextId purchasedSubscriptionName }  fragment availabilityAnnounceFragment on AvailabilityAnnounce { announcePromise availabilityDate type }  fragment movieContentPackageFragment on ContentPackage { billingFeatureName }  fragment currencyFragment on Currency { symbol currencyCode }  fragment moneyAmountFragment on MoneyAmount { amount currency { __typename ...currencyFragment } }  fragment movieViewOptionTrialCutInfoFragment on TrialCutInfo { texts { title subTitle buttonText } token type }  fragment movieViewOptionSummaryFragment on ViewOption { __typename type purchasabilityStatus isWatchableOnDeviceInCurrentRegion: isWatchable(filter: { anyDevice: false anyRegion: false } ) buttonText ...movieViewOptionPurchasedSubscriptionFragment availabilityAnnounce { __typename ...availabilityAnnounceFragment } contentPackageToBuy { __typename ...movieContentPackageFragment } contentPackageToUnfreeze { __typename ...movieContentPackageFragment } transactionalPrice { __typename ...moneyAmountFragment } transactionalMinimumPrice { __typename ...moneyAmountFragment } priceWithTotalDiscount { __typename ...moneyAmountFragment } optionMonetizationModels watchabilityStatus watchabilityExpirationTime promotionActionType downloadabilityStatus purchaseOptions(clientContext: $purchaseOptionsContext) @include(if: $includeMoviePurchaseOptions) { billingFeatureNames target } trialCutInfo @include(if: $includeTrialCutInfo) { __typename ...movieViewOptionTrialCutInfoFragment } purchaseOptionCustomProperties @include(if: $includeMoviePurchaseOptions) }  fragment movieAvailabilityOptionsFragment on AvailabilityOptions { options { __typename ... on PreOrderOption { details { __typename ... on PreOrderPurchasableDetails { availabilityDate price { __typename ...moneyAmountFragment } originalPrice { __typename ...moneyAmountFragment } discount { percent } purchaseItemId } ... on PreOrderPurchasedDetails { availabilityDate } } } } }  fragment restrictionFragment on Restriction { age mpaa }  fragment incompleteDateFragment on IncompleteDate { date accuracy }  fragment voteFragment on Vote { value }  fragment movieUserVoteFragment on MovieUserData { voting { __typename ...voteFragment } }  fragment movieFolderFragment on Folder { id name public }  fragment movieUserFoldersFragment on MovieUserData { userFolders { items { __typename ...movieFolderFragment } total } }  fragment movieUserWatchedFragment on MovieUserData { watchStatuses { watched { value } } }  fragment movieUserNotInterestedFragment on MovieUserData { watchStatuses { notInterested { value } } }  fragment movieContentFeaturesFragment on Ott { preview { features(filter: { layout: OTT_TITLE_CARD onlyClientSupported: $includeMovieOnlyClientSupportedContentFeatures } ) { group alias displayName } } }  fragment payOfferFragment on PayOffer { button { badge { text icon { __typename ...imageFragment } } disclaimer { text link } } selectorLink }  fragment movieTicketOptionFragment on Movie { ticketOption { purchasable releaseAnnounce { available releaseDate { __typename ...incompleteDateFragment } } payOffer { __typename ...payOfferFragment } } }  fragment movieDurationFragment on Movie { ott { preview { __typename ... on OttPreview_AbstractVideo { duration } } } }  fragment movieSummaryFragment on Movie { __typename id contentId url ...movieYearsFragment ...movieTopsFragment @include(if: $includeMovieTops) gallery { posters { __typename ...moviePostersFragment } logos @include(if: $includeMovieRightholderForPoster) { rightholderForPoster { __typename ...imageFragment } } logos @include(if: $includeMovieHorizontalLogo) { horizontal { __typename ...imageWithSizeFragment } } covers @include(if: $includeMovieHorizontalCover) { horizontal { __typename ...imageFragment } } } title { __typename ...titleFragment } genres { __typename ...genreFragment } countries { __typename ...countryFragment } rating @include(if: $includeMovieRating) { __typename ...ratingFragment } viewOption @include(if: $includeMovieViewOption) { __typename ...movieViewOptionSummaryFragment } availabilityOptions @include(if: $includeAvailabilityOptions) { __typename ...movieAvailabilityOptionsFragment } restriction { __typename ...restrictionFragment } distribution @include(if: $includeMovieReleaseDate) { worldPremiere { incompleteDate { __typename ...incompleteDateFragment } } releases(limit: 1) { items { date { __typename ...incompleteDateFragment } } } } movieUserVote: userData @include(if: $includeMovieUserVote) { __typename ...movieUserVoteFragment } movieUserPlannedToWatch: userData @include(if: $includeMovieUserPlannedToWatch) { isPlannedToWatch } movieUserFolders: userData @include(if: $includeMovieUserFolders) { __typename ...movieUserFoldersFragment } movieUserWatched: userData @include(if: $includeMovieUserWatched) { __typename ...movieUserWatchedFragment } movieUserNotInterested: userData @include(if: $includeMovieUserNotInterested) { __typename ...movieUserNotInterestedFragment } movieContentFeatures: ott @include(if: $includeMovieContentFeatures) { __typename ...movieContentFeaturesFragment } ... on Series @include(if: $includeSeriesSeasonsCount) { seasonsCount: seasons(offset: 0, limit: 0) { total } } ...movieTicketOptionFragment @include(if: $includeTicketOption) ...movieDurationFragment @include(if: $includeFilmDuration) }  fragment personNameFragment on Person { name originalName }  fragment personSummaryFragment on Person { __typename id ...personNameFragment gender poster { __typename ...imageFragment } age height dateOfBirth { __typename ...incompleteDateFragment } dateOfDeath { __typename ...incompleteDateFragment } published }";

    var JW_QUERY = 'query($q:String!){popularTitles(country:RU,first:10,filter:{searchQuery:$q,packages:["okk","kpk"]})' +
        '{edges{node{objectType content(country:RU,language:"ru"){externalIds{imdbId tmdbId}}' +
        ' offers(country:RU,platform:WEB){standardWebURL deeplinkURL(platform:ANDROID_TV) package{shortName}}}}}}';

    var cache = {};

    // ---------- данные карточки ----------

    function getMovie(e) {
        return (e && e.data && e.data.movie) || (e && e.object && e.object.card) || {};
    }

    function cardInfo(e) {
        var m = getMovie(e);
        var isTv = !!(m.name || m.first_air_date || (e.object && e.object.method === 'tv'));
        var date = m.release_date || m.first_air_date || '';
        return {
            id: m.id,
            kpId: m.kinopoisk_id || m.kp_id || null,
            imdbId: m.imdb_id || (m.external_ids && m.external_ids.imdb_id) || null,
            title: m.title || m.name || '',
            original: m.original_title || m.original_name || '',
            year: parseInt(date.slice(0, 4), 10) || 0,
            isTv: isTv
        };
    }

    function norm(s) {
        return (s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '');
    }

    // ---------- сеть ----------

    // На Android native() идёт через AndroidJS.httpReq (без CORS), иначе — обычный ajax.
    function postJson(url, body, headers, ok, fail) {
        var net = new Lampa.Reguest();
        net.timeout(15000);
        net.native(url, function (d) {
            if (typeof d === 'string') {
                try { d = JSON.parse(d); } catch (e) { return fail(); }
            }
            ok(d);
        }, fail, JSON.stringify(body), {headers: headers, dataType: 'json'});
    }

    // Последовательно пробует ключевые слова (русское, затем оригинальное название).
    function searchSeq(keywords, search, done) {
        var i = 0;
        (function next() {
            if (i >= keywords.length) return done(null);
            search(keywords[i++], function (res) {
                if (res) done(res);
                else next();
            });
        })();
    }

    function keywords(info) {
        var k = [info.title];
        if (info.original && norm(info.original) !== norm(info.title)) k.push(info.original);
        return k.filter(Boolean);
    }

    // ---------- КиноПоиск ----------

    function kpVariables(keyword) {
        var vars = {keyword: keyword, groupLimit: 10, purchaseOptionsContext: {}};
        KP_SEARCH_QUERY.slice(0, KP_SEARCH_QUERY.indexOf('{')).replace(/\$(\w+): Boolean/g, function (_, name) {
            vars[name] = false;
        });
        return vars;
    }

    function kpYear(m) {
        if (m.productionYear) return m.productionYear;
        if (m.releaseYears && m.releaseYears[0]) return m.releaseYears[0].start;
        return 0;
    }

    function kpMatch(info, items) {
        var i, m;
        if (info.kpId) {
            for (i = 0; i < items.length; i++) {
                m = items[i].movie;
                if (m && String(m.id) === String(info.kpId)) return m;
            }
        }
        var wantType = info.isTv ? /Series/ : /Film/;
        for (i = 0; i < items.length; i++) {
            m = items[i].movie;
            if (!m || !m.contentId || !wantType.test(m.__typename)) continue;
            var t = m.title || {};
            var sameTitle = (norm(t.localized) && norm(t.localized) === norm(info.title)) ||
                (norm(t.original) && norm(t.original) === norm(info.original));
            var y = kpYear(m);
            if (sameTitle && (!info.year || !y || Math.abs(y - info.year) <= 1)) return m;
        }
        return null;
    }

    function kpSearch(info, keyword, done) {
        postJson(KP_GRAPHQL, {operationName: 'SearchTVSuggest', query: KP_SEARCH_QUERY, variables: kpVariables(keyword)},
            {'Content-Type': 'application/json', 'Service-Id': '25'},
            function (d) {
                var items = d && d.data && d.data.suggest && d.data.suggest.movies && d.data.suggest.movies.items || [];
                var m = kpMatch(info, items);
                done(m ? {contentId: m.contentId, kpId: m.id} : null);
            },
            function () { done(null); });
    }

    // ---------- JustWatch (Okko + запасной источник для КП) ----------

    function jwSearch(info, keyword, done) {
        postJson(JW_GRAPHQL, {query: JW_QUERY, variables: {q: keyword}}, {'Content-Type': 'application/json'},
            function (d) {
                var edges = d && d.data && d.data.popularTitles && d.data.popularTitles.edges || [];
                var wantType = info.isTv ? 'SHOW' : 'MOVIE';
                for (var i = 0; i < edges.length; i++) {
                    var n = edges[i].node;
                    var ids = n.content && n.content.externalIds || {};
                    var byTmdb = info.id && ids.tmdbId && String(ids.tmdbId) === String(info.id);
                    var byImdb = info.imdbId && ids.imdbId === info.imdbId;
                    if (n.objectType === wantType && (byTmdb || byImdb)) return done(jwOffers(n.offers || []));
                }
                done(null);
            },
            function () { done(null); });
    }

    function jwOffers(offers) {
        var res = {};
        offers.forEach(function (o) {
            var pkg = o.package && o.package.shortName;
            if (pkg === 'okk' && !res.okko) {
                // intent://movie?uid=..&type=MOVIE#Intent;...;scheme=okko;end -> okko://movie?uid=..&type=MOVIE
                var m = /^intent:\/\/([^#]+)#Intent;.*scheme=okko;/.exec(o.deeplinkURL || '');
                if (m) res.okko = {app: 'okko://' + m[1], web: o.standardWebURL};
            }
            if (pkg === 'kpk' && !res.kpContentId) {
                var k = /hd\.kinopoisk\.ru\/film\/([0-9a-f]{32})/.exec(o.standardWebURL || '');
                if (k) res.kpContentId = k[1];
            }
        });
        return res;
    }

    // ---------- резолв с кэшем ----------

    // Один раз на карточку: { kp: {contentId, kpId} | null, okko: {app, web} | null }
    function resolve(info, done) {
        var key = (info.isTv ? 'tv' : 'movie') + ':' + (info.id || info.title);
        var entry = cache[key];
        if (entry && entry.result) return done(entry.result);
        if (entry) return entry.waiters.push(done);

        entry = cache[key] = {waiters: [done], result: null};
        var kw = keywords(info);
        var kp = null, jw = null, pending = 2;

        function finish() {
            if (--pending) return;
            var result = {kp: kp, okko: jw && jw.okko || null};
            if (!result.kp && jw && jw.kpContentId) result.kp = {contentId: jw.kpContentId, kpId: info.kpId};
            entry.result = result;
            entry.waiters.forEach(function (fn) { fn(result); });
            entry.waiters = [];
        }

        searchSeq(kw, function (k, cb) { kpSearch(info, k, cb); }, function (r) { kp = r; finish(); });
        searchSeq(kw, function (k, cb) { jwSearch(info, k, cb); }, function (r) { jw = r; finish(); });
    }

    // ---------- открытие ----------

    function canLaunchApps() {
        return !!(window.AndroidJS && typeof AndroidJS.openBrowser === 'function');
    }

    function launch(url) {
        if (canLaunchApps()) AndroidJS.openBrowser(url);
        else window.open(url, '_blank');
    }

    function kpSite(info, kp) {
        var id = (kp && kp.kpId) || info.kpId;
        if (id) return 'https://www.kinopoisk.ru/film/' + id + '/';
        return 'https://www.kinopoisk.ru/index.php?kp_query=' + encodeURIComponent(info.title);
    }

    function kpOpen(info, kp) {
        if (!kp) return Lampa.Noty.show('Не найдено в КиноПоиске');
        launch(canLaunchApps() ? 'kpatv://film?filmId=' + kp.contentId : 'https://hd.kinopoisk.ru/film/' + kp.contentId);
    }

    function okkoSite(info, okko) {
        return okko && okko.web || 'https://okko.tv/search/' + encodeURIComponent(info.title);
    }

    function okkoOpen(info, okko) {
        if (!okko) return Lampa.Noty.show('Не найдено в Okko');
        launch(canLaunchApps() ? okko.app : okko.web);
    }

    // ---------- кнопки ----------

    var ICON_KP = '<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">' +
        '<text x="16" y="22" font-family="Arial, sans-serif" font-size="15" font-weight="700" text-anchor="middle" fill="currentColor">КП</text></svg>';
    var ICON_OKKO = '<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">' +
        '<text x="16" y="21" font-family="Arial, sans-serif" font-size="11" font-weight="700" text-anchor="middle" fill="currentColor">OKKO</text></svg>';

    function makeButton(cls, icon, label) {
        return $('<div class="full-start__button selector ' + cls + '">' + icon + '<span>' + label + '</span></div>');
    }

    // Пока идёт поиск — кнопка полупрозрачная; не нашли — остаётся такой же.
    function setState(btn, found) {
        btn.css('opacity', found ? '' : '0.5');
    }

    function bind(btn, info, pick, open, site) {
        var busy = false;
        btn.on('hover:enter', function () {
            if (busy) return;
            busy = true;
            resolve(info, function (r) {
                busy = false;
                open(info, pick(r));
            });
        });
        btn.on('hover:long', function () {
            resolve(info, function (r) { launch(site(info, pick(r))); });
        });
    }

    function addButtons(e) {
        if (e.type !== 'complite') return;

        var render = e.object && e.object.activity && e.object.activity.render ? e.object.activity.render() : e.body;
        if (!render) return;
        var buttons = $(render).find('.full-start-new__buttons');
        if (!buttons.length || buttons.find('.view--kinopoisk').length) return;

        var info = cardInfo(e);
        if (!info.title) return;

        var kpBtn = makeButton('view--kinopoisk', ICON_KP, 'КиноПоиск');
        var okkoBtn = makeButton('view--okko', ICON_OKKO, 'Okko');

        bind(kpBtn, info, function (r) { return r.kp; }, kpOpen, kpSite);
        bind(okkoBtn, info, function (r) { return r.okko; }, okkoOpen, okkoSite);

        // Синхронно, чтобы lme-slim успел учесть кнопки в своей раскладке.
        buttons.append(kpBtn).append(okkoBtn);

        setState(kpBtn, false);
        setState(okkoBtn, false);
        resolve(info, function (r) {
            setState(kpBtn, !!r.kp);
            setState(okkoBtn, !!r.okko);
        });
    }

    function start() {
        Lampa.Listener.follow('full', addButtons);
    }

    if (window.appready) start();
    else Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') start();
    });

})();
