(function () {
    'use strict';

    // torrents.js — replaces the standard Lampa "torrents" component.
    //
    // Goals (see plan):
    //  - new default sort "quality + seeders": 4K → 1080p → 720p → rest, each group by seeders desc;
    //  - drop the left description panel on the torrent screen;
    //  - fix the empty-result dead-end (keep filter/back reachable, add reset);
    //  - hide the "no watch history" placeholder when there is no history;
    //  - colour highlighting (seeds/bitrate/tracker), zero-seeders in red, quality badge.
    //
    // The whole sort/filter pipeline lives in a private closure of the engine component,
    // so the only way to change ordering globally (correct with pagination) is to replace
    // the component. We ship a faithful copy of lampa-source/src/components/torrents.js with
    // the imports rewired to Lampa.* and the inner modules inlined (TitleParser, voices list,
    // filter_langs, the internal Listener and WatchedHistory — none of them are exposed on
    // window.Lampa). A drift check warns if the engine component changed; on any construction
    // error we fall back to the original component.

    if (window.plugin_torrents_qseed) return;
    window.plugin_torrents_qseed = true;

    function start() {
        var Lampa = window.Lampa;

        if (!Lampa || !Lampa.Component || !Lampa.Listener) return;

        // ── Lampa.* aliases (keep the original bare names so the copied code stays verbatim) ──
        var Lang       = Lampa.Lang,
            Storage    = Lampa.Storage,
            Utils      = Lampa.Utils,
            Arrays     = Lampa.Arrays,
            Template   = Lampa.Template,
            Filter     = Lampa.Filter,
            Scroll     = Lampa.Scroll,
            Activity   = Lampa.Activity,
            Controller = Lampa.Controller,
            Reguest    = Lampa.Reguest,
            Empty      = Lampa.Empty,
            Torrent    = Lampa.Torrent,
            Modal      = Lampa.Modal,
            Background  = Lampa.Background,
            Select     = Lampa.Select,
            Torserver  = Lampa.Torserver,
            Noty       = Lampa.Noty,
            Parser     = Lampa.Parser,
            TMDB       = Lampa.TMDB,
            Explorer   = Lampa.Explorer,
            Layer      = Lampa.Layer,
            Subscribe  = Lampa.Subscribe;

        var LANG = Storage.field('language');

        function L10n(ru, en, uk) {
            return LANG === 'en' ? en : (LANG === 'uk' ? uk : ru);
        }

        // ───────────────────────── inlined: TitleParser (torrents/parser.js) ─────────────────────────
        var TitleParser = (function () {
            function general(title) {
                var result = { season: null, seasons: [], episodes: null, year: null, quality: null, resolution: null };

                if (!title) return result;

                var season_range =
                    title.match(/\[S(\d{1,2})[-–](\d{1,2})\]/i) ||
                    title.match(/(?:сезон|season)\s*(\d{1,2})[-–](\d{1,2})/i) ||
                    title.match(/(\d{1,2})[-–](\d{1,2})\s*(?:сезон|season)/i);

                if (season_range) {
                    result.season = parseInt(season_range[1]) + '-' + parseInt(season_range[2]);
                } else {
                    var season =
                        title.match(/(\d+)\s*(?:сезон|season)/i) ||
                        title.match(/(?:сезон|season):?\s*(\d{1,2})/i) ||
                        title.match(/(\d{1,2})[nd|rd] season/i) ||
                        title.match(/(?:тв|tv)-(\d+)/i) ||
                        title.match(/\b(\d{1,2})x\d{1,2}/i) ||
                        title.match(/\bs(\d{1,2})e/i) ||
                        title.match(/\bs(\d{1,2})\b/i);

                    if (season) result.season = parseInt(season[1]);
                }

                if (!result.season) result.season = 1;

                if (typeof result.season === 'string' && result.season.indexOf('-') !== -1) {
                    var parts = result.season.split('-');
                    var from = parseInt(parts[0]);
                    var to = parseInt(parts[1]);
                    for (var i = from; i <= to; i++) result.seasons.push(i);
                } else {
                    result.seasons = [parseInt(result.season)];
                }

                var ep_nx = title.match(/\d{1,2}x(\d{1,2})[-–](\d{1,2})/i);

                if (ep_nx) {
                    result.episodes = parseInt(ep_nx[1]) + '-' + parseInt(ep_nx[2]);
                } else {
                    var ep_range =
                        title.match(/(\d+)\s*[-–]\s*(\d+)\s*(?:серия|episode)/i) ||
                        title.match(/(\d{1,3})[-–](\d{1,3})\s*серии/i) ||
                        title.match(/[[(](\d{1,3})\s*[-–](\d{1,3})\s*(?:из|з|of)\s*(\d{1,3})/i) ||
                        title.match(/[[(](\d{1,3})\s*[-–]\s*(?:из|з|of)\s*(\d{1,3})/i) ||
                        title.match(/[[(](\d{1,3})\s*(?:из|з|of)\s*(\d{1,3})[\])]/i) ||
                        title.match(/[e](\d{1,3})\s*[-–]\s*(?:(?:из|з|of)\s+)?(\d{1,3})/i) ||
                        title.match(/(?:серии|серія|episodes)\s*(\d{1,3})\s*(?:(?:из|з|of)\s+)?(\d{1,3})/i) ||
                        title.match(/(?:серии|серія|episodes)\s*(\d{1,3})[-–](\d{1,3})\s*(?:(?:из|з|of)\s+)?(\d{1,3})/i) ||
                        title.match(/(?:серии|episodes):\s*(\d+)[-–](\d+)/i);

                    if (ep_range) {
                        var a = parseInt(ep_range[1]);
                        var b = parseInt(ep_range[2]);
                        var looks_like_years = a >= 1900 && b >= 1900;

                        if (!looks_like_years) {
                            result.episodes = a == b ? '1-' + b : a > 1 ? '1-' + a : a + '-' + b;
                        }
                    } else {
                        var ep_single =
                            title.match(/\bs\d{1,2}e(\d+)/i) ||
                            title.match(/\d{1,2}x(\d{1,2})\b/i) ||
                            title.match(/\be(\d{1,2})\b/i) ||
                            title.match(/[[(](\d{1,2})\s+(?:из|з|of)\s+\d{1,2}[\])]/) ||
                            title.match(/(\d{1,2})\s+(?:из|з|of)\s+\d{1,2}/) ||
                            title.match(/(\d+)\s*(?:серия|episode)/i);

                        if (ep_single) result.episodes = '1-' + String(parseInt(ep_single[1]));
                    }
                }

                var year =
                    title.match(/\(((?:19|20)\d{2})[-–](?:19|20)\d{2}\)/) ||
                    title.match(/\(((?:19|20)\d{2})\)/) ||
                    title.match(/\b((?:19|20)\d{2})\b/);

                if (year) result.year = parseInt(year[1]);

                var qualities = [
                    'WEB-DLRip', 'WEB-DL', 'WEBRip', 'WEB',
                    'Blu-Ray', 'BluRay', 'BDRip',
                    'HDRip', 'HDTV',
                    'DVDRip', 'DVD',
                    'CAM', 'TS'
                ];

                for (var qi = 0; qi < qualities.length; qi++) {
                    var q = qualities[qi];
                    var pattern = q.replace(/-/g, '[-]?') + '(?![a-zA-Z])';

                    if (new RegExp(pattern, 'i').test(title)) {
                        result.quality = q;
                        break;
                    }
                }

                var resolution_map = {
                    '4k': '4K', 'uhd': '4K', '2160p': '4K',
                    '1440p': '2K', '1080p': 'FHD', '720p': 'HD',
                    '480p': 'SD', '360p': 'LD'
                };

                var resolution = title.match(/\b(4K|UHD|2160p|1080p|720p|480p|360p)\b/i);

                if (resolution) result.resolution = resolution_map[resolution[1].toLowerCase()] || resolution[1];

                return result;
            }

            function voices(title) {
                if (!title) return [];

                var lower = title.toLowerCase();
                var found = [];

                Voices.forEach(function (voice) {
                    if (found.indexOf(voice) === -1 && lower.indexOf(voice.toLowerCase()) !== -1) {
                        found.push(voice);
                    }
                });

                return found;
            }

            return { general: general, voices: voices };
        })();

        // ───────────────────────── inlined: voices list (torrents/voices.js) ─────────────────────────
        var Voices = ["Анастасия Гайдаржи + Андрей Юрченко","Студии Суверенного Лепрозория","Студия Пиратского Дубляжа","IgVin &amp; Solncekleshka","Gremlin Creative Studio","Alternative Production","HelloMickey Production","Bubble Dubbing Company","Н.Севастьянов seva1988","XDUB Dorama + Колобок","Мобильное телевидение","СПД - Сладкая парочка","Selena International","Black Street Records","Intra Communications","BBC Saint-Petersburg","Melodic Voice Studio","Voice Project Studio","Несмертельное оружие","Петербургский дубляж","Studio Victory Аsia","Asian Miracle Group","True Dubbing Studio","Lizard Cinema Trade","National Geographic","Позитив-Мультимедиа","Премьер Мультимедиа","Уолт Дисней Компани","Parovoz Production","Shadow Dub Project","Zone Vision Studio","Анастасия Гайдаржи","The Kitchen Russia","Малиновский Сергей","Family Fan Edition","Paramount Pictures","Иванова и П. Пашут","Так Треба Продакшн","Хихикающий доктор","Четыре в квадрате","Project Web Mania","Paramount Channel","Back Board Cinema","Zoomvision Studio","Universal Channel","RedDiamond Studio","НеЗупиняйПродакшн","Селена Интернешнл","Студия «Стартрек»","Колодій Трейлерів","Universal Russia","Paramount Comedy","Андрей Питерский","Реальный перевод","MC Entertainment","Екатеринбург Арт","Lucky Production","Cowabunga Studio","Анатолий Ашмарин","Васька Куролесов","Brain Production","Квадрат Малевича","Первый канал ОРТ","Русский Репортаж","Сolumbia Service","Sunshine Studio","GreenРай Studio","New Dream Media","DeadLine Studio","Воробьев Сергей","DeeAFilm Studio","Николай Дроздов","Денис Шадинский","Cartoon Network","Amazing Dubbing","Volume-6 Studio","Антонов Николай","Ульпаней Эльром","Cinema Prestige","AnimeSpace Team","CinemaSET GROUP","XvidClub Studio","З Ранку До Ночі","Максим Логинофф","Студия Горького","Ушастая озвучка","Hamster Studio","Agatha Studdio","SunshineStudio","Kulzvuk Studio","Вартан Дохалов","Viasat History","DIVA Universal","KosharaSerials","Julia Prosenuk","SovetRomantica","Mallorn Studio","TUMBLER Studio","CrazyCatStudio","Syfy Universal","Horizon Studio","Анатолий Гусев","Максим Жолобов","RedRussian1337","Creative Sound","Garsu Pasaulis","visanti-vasaer","GoodTime Media","Кирдин | Stalk","Anything-group","Goodtime Media","Jakob Bellmann","Витя «говорун»","Л. Володарский","Леша Прапорщик","Медиа-Комплекс","Прайд Продакшн","Русский дубляж","Союзмультфильм","Студия Колобок","Red Head Sound","LE-Production","ViruseProject","Victory-Films","Jetvis Studio","Greb&Creative","5-й канал СПб","Dream Records","Filiza Studio","SHIZA Project","Bars MacAdams","Nazel & Freya","Vulpes Vulpes","Храм Дорам ТВ","АРК-ТВ Studio","Film Prestige","Rainbow World","Banyan Studio","Bonsai Studio","Мадлен Дюваль","VO-Production","Voice Project","Flarrow Films","Видеопродакшн","Хоррор Мэйкер","Lizard Cinema","Фортуна-Фильм","VIP Serial HD","Старый Бильбо","Семыкина Юлия","Штамп Дмитрий","Arasi project","ARRU Workshop","Byako Records","FiliZa Studio","Gezell Studio","HamsterStudio","PCB Translate","Renegade Team","Sci-Fi Russia","The Mike Rec.","VO-production","Мика Бондарик","Наталья Гурзо","Премьер Видео","Трамвай-фильм","Кубик в Кубе","Кураж-Бамбей","Первый канал","Trdlo.studio","Студия Райдо","AniLibria.TV","RG.Paravozik","Profix Media","AlphaProject","AnimeReactor","Кармен Видео","Korean Craze","Sony Channel","Train Studio","Фильмэкспорт","Кирилл Сагач","ViP Premiere","Деваль Видео","RussianGuy27","HaseRiLLoPaW","Сергей Дидок","Mystery Film","Psychotronic","КонтентикOFF","Говинда Рага","Horror Maker","Альтера Парс","Видеоимпульс","Мьюзик-трейд","Тоникс Медиа","Элегия фильм","Oneinchnales","Кинопремьера","A. Lazarchuk","Animereactor","BadCatStudio","DreamRecords","General Film","Ivnet Cinema","RG Paravozik","sweet couple","VictoryFilms","VulpesVulpes","Wayland team","Гей Кино Гид","Нурмухаметов","Е. Хрусталёв","К. Поздняков","Н. Золотухин","Новый Дубляж","Р. Янкелевич","С. Кузьмичёв","С. Щегольков","Синема Трейд","Синта Рурони","Точка Zрения","КОМНАТА ДИДИ","FocusStudio","Gears Media","GladiolusTV","RecentFilms","NEON Studio","Володарский","Мастер Тэйп","XDUB Dorama","Sound-Group","Sony Sci-Fi","Good People","JWA Project","Nika Lenina","RiZZ_fisher","New Records","КураСгречей","Неоклассика","CrezaStudio","Видеосервис","BTI Studios","Eurochannel","Варус-Видео","HiWay Grope","Эй Би Видео","Nickelodeon","StudioFilms","Paul Bunyan","Inter Video","Franek Monk","Другое кино","Севастьянов","Lazer Video","Max Nabokov","Завгородний","SnowRecords","Crunchyroll","Gold Cinema","Прямостанов","Огородников","Кенс Матвей","1001 cinema","Cactus Team","Description","DVD Classic","Gala Voices","hungry_inri","Neoclassica","Oghra-Brown","Rebel Voice","Saint Sound","SakuraNight","TF-AniGroup","TrainStudio","Zone Studio","Zone Vision","Варус Видео","Г. Либергал","Г. Румянцев","Е. Гаевский","И. Сафронов","И. Степанов","Лазер Видео","Малиновский","Новый Канал","Петербуржец","С. Визгунов","С. Кузнецов","Студия Трёх","Цікава Ідея","Я. Беллманн","Studio Band","ApofysTeam","Карповский","LevshaFilm","1001cinema","CP Digital","Интерфильм","Комедия ТВ","Ох! Студия","SilverSnow","NewStation","StudioBand","Rain Death","Первый ТВЧ","HiWayGrope","Animegroup","Shachiburi","CactusTeam","Sony Turbo","AXN Sci-Fi","Т.О Друзей","West Video","East Dream","Sound Film","MaxMeister","VoicePower","CoralMedia","VSI Moscow","VGM Studio","Студия NLS","Хуан Рохас","TatamiFilm","диктор CDV","Pazl Voice","Саня Белый","Мост-Видео","AimaksaLTV","Contentica","Инфо-фильм","Электричка","Бусов Глеб","AvePremier","BraveSound","CinemaTone","DniproFilm","ELEKTRI4KA","eraserhead","Fox Russia","Mega-Anime","MifSnaiper","Nice-Media","PiratVoice","Postmodern","Reanimedia","Sky Voices","SkyeFilmTV","Костюкевич","Толстобров","Б. Федоров","Ващенко С.","Глуховский","Держиморда","Е. Гранкин","И. Еремеев","К. Филонов","Мост Видео","Н. Антонов","Н. Дроздов","Новый диск","Переводман","С. Казаков","С. Лебедев","С. Макашов","Союз Видео","ТВ XXI век","Ю. Немахов","Dream Cast","Причудики","NewStudio","Red Media","Синема УС","SDI Media","CasStudio","turok1990","HighHopes","AniLibria","FanStudio","Sedorelli","Flux-Team","Kobayashi","KinoGolos","Fox Crime","Discovery","GREEN TEA","Persona99","3df voice","ShinkaDan","АрхиТеатр","СВ-Студия","FilmsClub","fiendover","Воротилин","LakeFilms","Кириллица","AniPLague","JoyStudio","Формат AB","AveBrasil","Невафильм","OnisFilms","Neo-Sound","Муравский","BeniAffet","Янкелевич","AveDorama","Киномания","CBS Drama","Novamedia","NewComers","Ghostface","Sephiroth","Andre1288","DoubleRec","Astana TV","Останкино","Видеобаза","CLS Media","Seoul Bay","Хрусталев","Золотухин","Videogram","AAA-Sound","Epic Team","GoodVideo","Gramalant","INTERFILM","Kinomania","No-Future","RainDeath","RATTLEBOX","Sawyer888","SmallFilm","SOLDLUCK2","SpaceDust","Timecraft","Total DVD","Video-BIZ","VIZ Media","Васильцев","Григорьев","ААА-sound","Амальгама","Весельчак","Деньщиков","Шадинский","ЕА Синема","Зереницын","И. Клушин","Имидж-Арт","Карапетян","Машинский","Мительман","Рыжий пес","С. Дьяков","Самарский","СВ Студия","Советский","Солодухин","ТО Друзей","Ю. Сербин","Ю. Товбин","AnimeVost","Omskbird","LostFilm","AlexFilm","IdeaFilm","ColdFilm","KinoView","Jimmy J.","Дольский","Гаврилов","Алексеев","Визгунов","Либергал","Кузнецов","Горчаков","Gravi-TV","Murzilka","STEPonee","NovaFilm","Kerems13","Fox Life","AzOnFilm","SorzTeam","Гаевский","СВ-Дубль","GoldTeam","DexterTV","AniMedia","ANIvoice","JeFerSon","RealFake","AniMaunt","TurkStar","Медведев","FilmGate","Логинофф","Loginoff","Animedub","GostFilm","ClubFATE","Hallmark","Тимофеев","Дьяконов","Лексикон","Superbit","VideoBIZ","WestFilm","kubik&ko","Марченко","Журавлев","Карусель","Barin101","Amalgama","Кинолюкс","AB-Video","Пирамида","Нарышкин","Дубровин","Махонько","Хлопушка","АрхиАзия","Ultradox","Мельница","Бессонов","Бахурани","Индия ТВ","AdiSound","ALEKS KV","AuraFilm","DeadLine","Extrabit","Foxlight","GetSmart","ImageArt","Marclail","metalrus","Milirina","MiraiDub","MOYGOLOS","OMSKBIRD","Radamant","RoxMarty","st.Elrom","VashMax2","VendettA","XL Media","Артемьев","Васильев","Савченко","Воронцов","Войсовер","Домашний","Е. Лурье","Е. Рудой","Ист-Вест","ЛанселаП","Ленфильм","Заугаров","Мосфильм","Оверлорд","С. Рябов","Супербит","Толмачев","Ю. Живов","Paradox","BaibaKo","Jaskier","Колобок","Михалев","Дохалов","SoftBox","MUZOBOZ","ZM-Show","Levelin","Немахов","Яроцкий","BadBajo","СВ-Кадр","Позитив","RusFilm","Назаров","Сыендук","Яковлев","Lord32x","Onibaku","Trina_D","Hamster","AniFilm","HDrezka","ShowJet","BukeDub","SomeWax","Anifilm","TVShows","РуФилмс","Пифагор","AniStar","Netflix","Octopus","MixFilm","Рутилов","Elysium","FireDub","AveTurk","Багичев","Дасевич","Twister","Морозов","Sam2007","SesDizi","AnyFilm","Urasiko","Wakanim","Латышев","Ващенко","Сонотек","Никитин","Сонькин","Кипарис","Королёв","RUSCICO","Филонов","Ошурков","Герусов","Пятница","5 канал","Amalgam","Anistar","AniWayt","datynet","DeadSno","Eladiel","ELYSIUM","F-TRAIN","FoxLife","Janetta","Kолобок","LeDoyen","Liga HQ","lord666","Macross","McElroy","NemFilm","OpenDub","PashaUp","SOFTBOX","To4kaTV","TV 1000","VicTeam","ZM-SHOW","Клюквин","Матвеев","Смирнов","Бибиков","Абдулов","Данилов","sf@irat","Королев","Люсьена","Омикрон","Парадиз","Пепелац","Синхрон","Сокуров","Хихидок","AniBaza","Ozz.tv","Сербин","Кравец","SNK-TV","Amedia","Гоблин","Kiitos","Есарев","Санаев","Шварко","Карцев","Кашкин","Мудров","Иванов","Котова","Kansai","ZEE TV","AniDUB","Ancord","Berial","Cuba77","OSLIKt","Tycoon","Курдов","Кошкин","Stevie","Лагута","Кондор","Киреев","FocusX","Пронин","neko64","Shaman","GalVid","D.I.M.","Н-Кино","Товбин","binjak","Акцент","Козлов","Нева-1","Milvus","Готлиб","Zerzia","Дьяков","Вольга","Строев","Alezan","ДиоНиК","Стасюк","TV1000","NewDub","Набиев","Светла","Nastia","Emslie","100 ТВ","4u2ges","Azazel","BD CEE","Boльгa","den904","Elegia","Gemini","Jetvis","JimmyJ","KANSAI","kiitos","L0cDoG","LeXiKC","Lisitz","madrid","Mikail","MrRose","Ozz TV","Prolix","RedDog","Rumble","Satkur","Selena","Suzaku","WiaDUB","WVoice","Zendos","Агапов","Акопян","Шуваев","АБыГДе","Акалит","Альянс","Анубис","Anubis","Арк-ТВ","Бойков","Вихров","Векшин","Гризли","Гундос","Пучков","Живаго","Жучков","Зебуро","Килька","Лапшин","Лизард","Миняев","НЕВА 1","НЛО-TV","Ракурс","Россия","С.Р.И.","KOleso","Гуртом","ТВ СПб","Швецов","OnWave","DZUSKI","Kerob","To4ka","Чадов","Живов","ВГТРК","Elrom","Игмар","Котов","РенТВ","Рыбин","Ozeon","Cmert","Штейн","zamez","Гланц","Белов","Anika","Lupin","Ryc99","ko136","Рябов","Amber","Arisu","DeMon","Велес","Акира","Ворон","Рудой","С.Р.И","Лайко","D2Lab","Jetix","Попов","Хабар","Интер","AniUA","D2lab","erogg","IНТЕР","JetiX","PaDet","RinGo","seqw0","SHIZA","Solod","ssvss","Мишин","АнВад","Бигыч","Рукин","Штамп","Новий","Перец","Райдо","ТВЧ 1","Laci","ETV+","Vano","Jade","RAIM","Andy","Нота","Твин","ИДДК","Voiz","CPIG","Dice","Gits","ICTV","jept","KIHO","Line","SGEV","Tori","Troy","Twix","Чуев","Инис","Ирэн","ТВ-3","ТВИН","ДТВ","FOX","НТВ","СТС","ICG","ТВЦ","2x2","MTV","Oni","JAM","AMS","DDV","AMC","НСТ","IVI","КТК","Че!","MGM","МИР","ТНТ","FDV","ТВ3","LDV","1+1","2+2","2х2","AOS","CDV","MCA","QTV","TB5","VHS","АМС","ГКГ","ИГМ","НТН","РТР","ТВ6","ТРК","UKR","D1","R5","К9"];

        // ───────────────────────── inlined: filter_langs (torrents/lang.js) ─────────────────────────
        var filter_langs = [
            { title: '#{filter_lang_ru}', code: 'ru' }, { title: '#{filter_lang_uk}', code: 'uk' },
            { title: '#{filter_lang_en}', code: 'en' }, { title: '#{filter_lang_be}', code: 'be' },
            { title: '#{filter_lang_zh}', code: 'zh|cn' }, { title: '#{filter_lang_ja}', code: 'ja' },
            { title: '#{filter_lang_ko}', code: 'ko' }, { title: '#{filter_lang_af}', code: 'af' },
            { title: '#{filter_lang_sq}', code: 'sq' }, { title: '#{filter_lang_ar}', code: 'ar' },
            { title: '#{filter_lang_az}', code: 'az' }, { title: '#{filter_lang_hy}', code: 'hy' },
            { title: '#{filter_lang_ba}', code: 'ba' }, { title: '#{filter_lang_bg}', code: 'bg' },
            { title: '#{filter_lang_bn}', code: 'bn' }, { title: '#{filter_lang_bs}', code: 'bs' },
            { title: '#{filter_lang_ca}', code: 'ca' }, { title: '#{filter_lang_ce}', code: 'ce' },
            { title: '#{filter_lang_cs}', code: 'cs' }, { title: '#{filter_lang_da}', code: 'da' },
            { title: '#{filter_lang_ka}', code: 'ka' }, { title: '#{filter_lang_de}', code: 'de' },
            { title: '#{filter_lang_el}', code: 'el' }, { title: '#{filter_lang_es}', code: 'es' },
            { title: '#{filter_lang_et}', code: 'et' }, { title: '#{filter_lang_fa}', code: 'fa' },
            { title: '#{filter_lang_fi}', code: 'fi' }, { title: '#{filter_lang_fr}', code: 'fr' },
            { title: '#{filter_lang_ga}', code: 'ga' }, { title: '#{filter_lang_gl}', code: 'gl' },
            { title: '#{filter_lang_gn}', code: 'gn' }, { title: '#{filter_lang_he}', code: 'he' },
            { title: '#{filter_lang_hi}', code: 'hi' }, { title: '#{filter_lang_hr}', code: 'hr' },
            { title: '#{filter_lang_hu}', code: 'hu' }, { title: '#{filter_lang_id}', code: 'id' },
            { title: '#{filter_lang_is}', code: 'is' }, { title: '#{filter_lang_it}', code: 'it' },
            { title: '#{filter_lang_kk}', code: 'kk' }, { title: '#{filter_lang_ks}', code: 'ks' },
            { title: '#{filter_lang_ku}', code: 'ku' }, { title: '#{filter_lang_ky}', code: 'ky' },
            { title: '#{filter_lang_lt}', code: 'lt' }, { title: '#{filter_lang_lv}', code: 'lv' },
            { title: '#{filter_lang_mi}', code: 'mi' }, { title: '#{filter_lang_mk}', code: 'mk' },
            { title: '#{filter_lang_mn}', code: 'mn' }, { title: '#{filter_lang_mt}', code: 'mt' },
            { title: '#{filter_lang_no}', code: 'no|nb|nn' }, { title: '#{filter_lang_ne}', code: 'ne' },
            { title: '#{filter_lang_nl}', code: 'nl' }, { title: '#{filter_lang_pa}', code: 'pa' },
            { title: '#{filter_lang_pl}', code: 'pl' }, { title: '#{filter_lang_ps}', code: 'ps' },
            { title: '#{filter_lang_pt}', code: 'pt' }, { title: '#{filter_lang_ro}', code: 'ro' },
            { title: '#{filter_lang_si}', code: 'si' }, { title: '#{filter_lang_sk}', code: 'sk' },
            { title: '#{filter_lang_sl}', code: 'sl' }, { title: '#{filter_lang_sm}', code: 'sm' },
            { title: '#{filter_lang_so}', code: 'so' }, { title: '#{filter_lang_sr}', code: 'sr' },
            { title: '#{filter_lang_sv}', code: 'sv' }, { title: '#{filter_lang_sw}', code: 'sw' },
            { title: '#{filter_lang_ta}', code: 'ta' }, { title: '#{filter_lang_tg}', code: 'tg' },
            { title: '#{filter_lang_th}', code: 'th' }, { title: '#{filter_lang_tk}', code: 'tk' },
            { title: '#{filter_lang_tr}', code: 'tr' }, { title: '#{filter_lang_tt}', code: 'tt' },
            { title: '#{filter_lang_ur}', code: 'ur' }, { title: '#{filter_lang_uz}', code: 'uz' },
            { title: '#{filter_lang_vi}', code: 'vi' }, { title: '#{filter_lang_yi}', code: 'yi' }
        ];

        // ───────────────────────── inlined: internal Listener (torrents/listener.js) ─────────────────────────
        function InnerListener(movie) {
            var _self = this;

            function open(e) {
                if (e.type == 'onenter') {
                    var open_movie = e.params.movie || {};
                    if (open_movie.id == movie.id) _self.listener.send('open', e);
                }
            }

            function startL(e) {
                if (e.type == 'list_open') Lampa.Listener.follow('torrent_file', open);
                if (e.type == 'list_close') Lampa.Listener.remove('torrent_file', open);
            }

            this.listener = Subscribe();

            this.destroy = function () {
                Lampa.Listener.remove('torrent_file', startL);
                Lampa.Listener.remove('torrent_file', open);
            };

            Lampa.Listener.follow('torrent_file', startL);
        }

        // ───────────────────────── inlined: WatchedHistory (interaction/watched_history.js) ─────────────────────────
        // Modified: update() does NOT render the "no watch history" placeholder when empty.
        function WatchedHistory(movie) {
            this.file_id = Utils.hash(movie.number_of_seasons ? movie.original_name : movie.original_title);
            this.html = Template.js('watched_history');

            this.get = function () {
                var watched = Storage.cache('online_watched_last', 5000, {});
                return watched[this.file_id];
            };

            this.set = function (set) {
                var watched = Storage.cache('online_watched_last', 5000, {});
                if (!watched[this.file_id]) watched[this.file_id] = {};
                Arrays.extend(watched[this.file_id], set, true);
                Storage.set('online_watched_last', watched);
                this.update();
            };

            this.update = function () {
                var watched = this.get();
                var body = this.html.find('.watched-history__body').empty();

                if (watched) {
                    var line = [];
                    if (watched.balanser_name) line.push(watched.balanser_name);
                    if (watched.voice_name) line.push(watched.voice_name);
                    if (watched.season) line.push(Lang.translate('torrent_serial_season') + ' ' + watched.season);
                    if (watched.episode) line.push(Lang.translate('torrent_serial_episode') + ' ' + watched.episode);

                    line.forEach(function (n) {
                        body.append(Template.elem('span', { text: Utils.clearHtmlTags(n).trim() }));
                    });
                }
                // else: intentionally render nothing (placeholder removed)
            };

            this.render = function (js) {
                return js ? this.html : $(this.html);
            };

            this.update();
        }

        // ───────────────────────── quality ranking helper (new sort) ─────────────────────────
        var RES_RANK = { '4K': 6, '2K': 5, 'FHD': 4, 'HD': 3, 'SD': 2, 'LD': 1 };

        function qualityRank(element) {
            var res = element.general && element.general.resolution;
            if (res && RES_RANK[res]) return RES_RANK[res];

            var q = element.info && element.info.quality ? parseInt(element.info.quality) : 0;
            if (q >= 2160) return 6;
            if (q >= 1440) return 5;
            if (q >= 1080) return 4;
            if (q >= 720) return 3;
            if (q >= 480) return 2;
            if (q >= 360) return 1;
            return 0;
        }

        var SORT_QS = 'quality_seeders';
        var SORT_QS_LABEL = L10n('Качество + раздающие', 'Quality + seeders', 'Якість + сіди');

        // ───────────────────────── component (copy of components/torrents.js + edits) ─────────────────────────
        function component(object) {
            Arrays.extend(object, {
                movie: { title: object.search, original_title: object.search },
                params: { noinfo: object.from_search ? true : false }
            });

            var network = new Reguest();
            var scroll  = new Scroll({ mask: true, over: true });
            var files   = new Explorer(object);
            var history = new WatchedHistory(object.movie);
            var filter;
            var results = [];
            var filtred = [];
            var listener;

            var total_pages = 1;
            var count       = 0;
            var last;
            var last_filter;
            var initialized;

            var filter_items = {
                quality: [Lang.translate('torrent_parser_any_one'), '4k', '1080p', '720p'],
                hdr: [Lang.translate('torrent_parser_no_choice'), Lang.translate('torrent_parser_yes'), Lang.translate('torrent_parser_no')],
                dv: [Lang.translate('torrent_parser_no_choice'), 'Dolby Vision', 'Dolby Vision TV', Lang.translate('torrent_parser_no')],
                sub: [Lang.translate('torrent_parser_no_choice'), Lang.translate('torrent_parser_yes'), Lang.translate('torrent_parser_no')],
                voice: [],
                tracker: [Lang.translate('torrent_parser_any_two')],
                year: [Lang.translate('torrent_parser_any_two')],
                lang: [Lang.translate('torrent_parser_any_two')],
                _3d: [Lang.translate('torrent_parser_no_choice'), Lang.translate('torrent_parser_yes'), Lang.translate('torrent_parser_no')]
            };

            var filter_translate = {
                quality: Lang.translate('torrent_parser_quality'),
                hdr: 'HDR',
                dv: 'Dolby Vision',
                sub: Lang.translate('torrent_parser_subs'),
                voice: Lang.translate('torrent_parser_voice'),
                tracker: Lang.translate('torrent_parser_tracker'),
                year: Lang.translate('torrent_parser_year'),
                season: Lang.translate('torrent_parser_season'),
                lang: Lang.translate('title_language_short'),
                _3d: '3D'
            };

            var filter_multiple = ['quality', 'voice', 'tracker', 'season', 'lang'];

            var sort_translate = {};
            sort_translate[SORT_QS] = SORT_QS_LABEL;
            sort_translate.popular = Lang.translate('title_popular');
            sort_translate.Seeders = Lang.translate('torrent_parser_sort_by_seeders');
            sort_translate.Size = Lang.translate('torrent_parser_sort_by_size');
            sort_translate.Title = Lang.translate('torrent_parser_sort_by_name');
            sort_translate.Tracker = Lang.translate('torrent_parser_sort_by_tracker');
            sort_translate.PublisTime = Lang.translate('torrent_parser_sort_by_date');
            sort_translate.viewed = Lang.translate('torrent_parser_sort_by_viewed');

            var i = 20,
                y = (new Date()).getFullYear();

            while (i--) {
                filter_items.year.push((y - (19 - i)) + '');
            }

            var finded_seasons      = [];
            var finded_seasons_full = [];

            filter_items.lang = filter_items.lang.concat(filter_langs.map(function (a) { return Lang.translate(a.title); }));

            scroll.minus(files.render().find('.explorer__files-head'));

            scroll.body().addClass('torrent-list');

            // EDIT B: mark the explorer so CSS can drop the left description panel
            files.render().addClass('torrents-noinfo');

            if (object.from_search) object.movie.original_title = '';

            this.create = function () {
                return this.render();
            };

            this.initialize = function () {
                this.activity.loader(true);

                if ((object.movie.original_language == 'ja' || object.movie.original_language == 'zh') && object.movie.genres.find(function (g) { return g.id == 16; }) && Storage.field('language') !== 'en') {
                    network.silent(TMDB.api((object.movie.name ? 'tv' : 'movie') + '/' + object.movie.id + '?api_key=' + TMDB.key() + '&language=en'), function (result) {
                        object.search_two = result.name || result.title;
                        this.parse();
                    }.bind(this), this.parse.bind(this));
                } else {
                    this.parse();
                }

                scroll.onEnd = this.next.bind(this);

                listener = new InnerListener(object.movie);

                listener.listener.follow('open', function (e) {
                    if (object.movie.original_name) {
                        history.set({ balanser_name: 'Torrent', season: e.element.season, episode: e.element.episode });
                    } else {
                        history.set({ balanser_name: 'Torrent' });
                    }
                });

                return this.render();
            };

            this.parse = function () {
                filter = new Filter(object);

                Parser.get(object, function (data) {
                    results = data;

                    results.Results.forEach(function (element) {
                        element.general = TitleParser.general(element.Title.toLowerCase());
                    });

                    this.build();

                    Layer.update(scroll.render(true));

                    this.activity.loader(false);

                    this.activity.toggle();
                }.bind(this), function (text) {
                    this.empty(Lang.translate('torrent_error_connect') + ': ' + text);
                }.bind(this));

                filter.onSearch = function (value, extra) {
                    extra = extra || {};
                    Activity.replace({ search: value, clarification: true, global: extra.global });
                };

                filter.onBack = function () {
                    this.start();
                }.bind(this);

                filter.render().find('.selector').on('hover:focus', function (e) {
                    last_filter = e.target;
                });

                filter.addButtonBack();

                files.appendHead(filter.render());
            };

            // EDIT C: keep filter/back reachable on empty result; add a guaranteed exit + reset.
            this.empty = function (descr, add_button) {
                var em_params = { descr: descr };

                em_params.buttons = [];

                if (add_button) {
                    em_params.buttons.push({
                        title: Lang.translate('filter_clarify'),
                        onEnter: function () {
                            filter.render().find('.filter--search').trigger('hover:enter');
                        }
                    });
                }

                // Always offer a guaranteed way out — the original hid the whole head (incl. the
                // back button) here, which is exactly the dead-end the user hit.
                em_params.buttons.push({
                    title: L10n('Назад', 'Back', 'Назад'),
                    onEnter: function () { this.back(); }.bind(this)
                });

                var empty = new Empty(em_params);

                // NOTE: original hid .explorer__files-head here — we keep it visible so the
                // back/search/sort/filter bar stays available.
                files.appendFiles(empty.render(filter.empty()));

                scroll.body().removeClass('torrent-list');

                this.start = empty.start.bind(empty);

                this.activity.loader(false);

                this.activity.toggle();
            };

            this.listEmpty = function () {
                var em = Template.get('empty_filter');
                var bn = $('<div class="simple-button selector"><span>' + Lang.translate('filter_clarify') + '</span></div>');
                var rs = $('<div class="simple-button selector"><span>' + L10n('Сбросить фильтры', 'Reset filters', 'Скинути фільтри') + '</span></div>');

                bn.on('hover:enter', function () {
                    filter.render().find('.filter--filter').trigger('hover:enter');
                });

                rs.on('hover:enter', function () {
                    this.setFilterData({});
                    this.buildFilterd();
                    this.applyFilter();
                    this.start();
                }.bind(this));

                em.find('.empty-filter__subtitle').text(Lang.translate('empty_text'));
                em.find('.empty-filter__title').remove();
                em.find('.empty-filter__buttons').removeClass('hide').append(bn).append(rs);

                scroll.body().removeClass('torrent-list');

                scroll.append(em);
            };

            this.buildSorted = function () {
                var need = Storage.get('torrents_sort', SORT_QS);
                var select = [
                    { title: SORT_QS_LABEL, sort: SORT_QS },
                    { title: Lang.translate('title_popular'), sort: 'popular' },
                    { title: Lang.translate('torrent_parser_sort_by_seeders'), sort: 'Seeders' },
                    { title: Lang.translate('torrent_parser_sort_by_size'), sort: 'Size' },
                    { title: Lang.translate('torrent_parser_sort_by_name'), sort: 'Title' },
                    { title: Lang.translate('torrent_parser_sort_by_tracker'), sort: 'Tracker' },
                    { title: Lang.translate('torrent_parser_sort_by_date'), sort: 'PublisTime' },
                    { title: Lang.translate('torrent_parser_sort_by_viewed'), sort: 'viewed' }
                ];

                select.forEach(function (element) {
                    if (element.sort == need) element.selected = true;
                });

                this.sortResults(need);

                filter.set('sort', select);

                this.selectedSort();
            };

            // EDIT A: new "quality + seeders" ordering.
            this.sortResults = function (need) {
                if (need == SORT_QS) {
                    results.Results.sort(function (a, b) {
                        return qualityRank(b) - qualityRank(a) || b.Seeders - a.Seeders;
                    });
                } else if (object.movie.number_of_seasons && need == 'popular') {
                    results.Results.sort(function (a, b) {
                        var s_a = parseInt(String(a.general.season).split('-').pop());
                        var s_b = parseInt(String(b.general.season).split('-').pop());
                        var e_a = a.general.episodes ? parseInt(String(a.general.episodes).split('-').pop()) : 0;
                        var e_b = b.general.episodes ? parseInt(String(b.general.episodes).split('-').pop()) : 0;

                        return (s_b - s_a || e_b - e_a || b.Seeders - a.Seeders);
                    });
                } else if (need == 'popular') {
                    filter.sort(results.Results, 'Seeders');
                } else {
                    filter.sort(results.Results, need);
                }

                // Viewed-on-top would break the strict quality grouping, so skip it for our sort.
                if (need != SORT_QS) this.sortWithViewed();
            };

            this.sortWithViewed = function () {
                var popular = [];
                var other   = [];

                results.Results.forEach(function (a) {
                    if (a.viewed) popular.push(a);
                    else other.push(a);
                });

                popular.sort(function (a, b) { return b.Seeders - a.Seeders; });

                results.Results = popular.concat(other);
            };

            this.cardID = function () {
                return object.movie.id + ':' + (object.movie.number_of_seasons ? 'tv' : 'movie');
            };

            this.getFilterData = function () {
                var all = Storage.cache('torrents_filter_data', 500, {});
                var cid = this.cardID();

                return all[cid] || Storage.get('torrents_filter', '{}');
            };

            this.setFilterData = function (filter) {
                var all = Storage.cache('torrents_filter_data', 500, {});
                var cid = this.cardID();

                all[cid] = filter;

                Storage.set('torrents_filter_data', all);
                Storage.set('torrents_filter', filter);
            };

            this.buildFilterd = function () {
                var need   = this.getFilterData();
                var select = [];

                var add = function (type, title) {
                    var items    = filter_items[type];
                    var subitems = [];
                    var multiple = filter_multiple.indexOf(type) >= 0;
                    var value    = need[type];

                    if (multiple) value = Arrays.toArray(value);

                    items.forEach(function (name, i) {
                        subitems.push({
                            title: name,
                            checked: multiple && value.indexOf(name) >= 0,
                            checkbox: multiple && i > 0,
                            noselect: true,
                            index: i
                        });
                    });

                    select.push({
                        title: title,
                        subtitle: multiple ? (value.length ? value.join(', ') : items[0]) : (typeof value == 'undefined' ? items[0] : items[value]),
                        items: subitems,
                        noselect: true,
                        stype: type
                    });
                };

                filter_items.voice   = [Lang.translate('torrent_parser_any_two'), Lang.translate('torrent_parser_voice_dubbing'), Lang.translate('torrent_parser_voice_polyphonic'), Lang.translate('torrent_parser_voice_two'), Lang.translate('torrent_parser_voice_amateur')];
                filter_items.tracker = [Lang.translate('torrent_parser_any_two')];
                filter_items.season  = [Lang.translate('torrent_parser_any_two')];

                results.Results.forEach(function (element) {
                    var title = element.Title.toLowerCase(),
                        tracker = element.Tracker;

                    for (var i = 0; i < Voices.length; i++) {
                        var voice = Voices[i].toLowerCase();

                        if (title.indexOf(voice) >= 0) {
                            if (filter_items.voice.indexOf(Voices[i]) == -1) filter_items.voice.push(Voices[i]);
                        }

                        if (!element.info) {
                            element.info = { voices: TitleParser.voices(element.Title) };
                        }

                        if (element.info && element.info.voices) {
                            if (element.info.voices.map(function (v) { return v.toLowerCase(); }).indexOf(voice) >= 0) {
                                if (filter_items.voice.indexOf(Voices[i]) == -1) filter_items.voice.push(Voices[i]);
                            }
                        }
                    }

                    tracker.split(',').forEach(function (t) {
                        if (filter_items.tracker.indexOf(t.trim()) === -1) filter_items.tracker.push(t.trim());
                    });

                    element.general.seasons.forEach(function (season) {
                        var number = season + '';

                        if (finded_seasons.indexOf(number) == -1) {
                            finded_seasons.push(number);
                            finded_seasons_full.push(number);
                        }
                    });
                });

                finded_seasons_full.sort(function (a, b) {
                    var ac = parseInt(a), bc = parseInt(b);
                    if (ac > bc) return 1; else if (ac < bc) return -1; else return 0;
                });

                finded_seasons.sort(function (a, b) {
                    var ac = parseInt(a), bc = parseInt(b);
                    if (ac > bc) return 1; else if (ac < bc) return -1; else return 0;
                });

                if (finded_seasons.length) filter_items.season = filter_items.season.concat(finded_seasons);

                need.voice   = Arrays.removeNoIncludes(Arrays.toArray(need.voice), filter_items.voice);
                need.tracker = Arrays.removeNoIncludes(Arrays.toArray(need.tracker), filter_items.tracker);
                need.season  = Arrays.removeNoIncludes(Arrays.toArray(need.season), filter_items.season);

                this.setFilterData(need);

                select.push({ title: Lang.translate('torrent_parser_reset'), reset: true });

                add('quality', Lang.translate('torrent_parser_quality'));
                add('hdr', 'HDR');
                add('dv', 'Dolby Vision');
                add('sub', Lang.translate('torrent_parser_subs'));
                add('voice', Lang.translate('torrent_parser_voice'));
                add('lang', Lang.translate('title_language_short'));
                add('season', Lang.translate('torrent_parser_season'));
                add('tracker', Lang.translate('torrent_parser_tracker'));
                add('year', Lang.translate('torrent_parser_year'));
                add('_3d', '3D');

                filter.set('filter', select);

                this.selectedFilter();
            };

            this.selectedFilter = function () {
                var need   = this.getFilterData(),
                    select = [];

                for (var i in need) {
                    if (need[i]) {
                        if (Arrays.isArray(need[i])) {
                            if (need[i].length) select.push(filter_translate[i] + ':' + need[i].join(', '));
                        } else {
                            select.push(filter_translate[i] + ': ' + filter_items[i][need[i]]);
                        }
                    }
                }

                filter.chosen('filter', select);
            };

            this.selectedSort = function () {
                var select = Storage.get('torrents_sort', SORT_QS);

                filter.chosen('sort', [sort_translate[select] || SORT_QS_LABEL]);
            };

            this.build = function () {
                this.buildSorted();
                this.buildFilterd();

                this.filtred();

                filter.onSelect = function (type, a, b) {
                    if (type == 'sort') {
                        Storage.set('torrents_sort', a.sort);

                        this.sortResults(a.sort);
                    } else {
                        if (a.reset) {
                            this.setFilterData({});

                            this.buildFilterd();
                        } else {
                            a.items.forEach(function (n) { n.checked = false; });

                            var filter_data = this.getFilterData();

                            filter_data[a.stype] = filter_multiple.indexOf(a.stype) >= 0 ? [] : b.index;

                            a.subtitle = b.title;

                            this.setFilterData(filter_data);
                        }
                    }

                    this.applyFilter();

                    this.start();
                }.bind(this);

                filter.onCheck = function (type, a, b) {
                    var data = this.getFilterData(),
                        need = Arrays.toArray(data[a.stype]);

                    if (b.checked && need.indexOf(b.title)) need.push(b.title);
                    else if (!b.checked) Arrays.remove(need, b.title);

                    data[a.stype] = need;

                    this.setFilterData(data);

                    a.subtitle = need.length ? need.join(', ') : a.items[0].title;

                    this.applyFilter();
                }.bind(this);

                this.showResults();
            };

            this.applyFilter = function () {
                this.filtred();

                this.selectedFilter();

                this.selectedSort();

                this.reset();

                this.showResults();

                last = scroll.render().find('.torrent-item:eq(0)')[0];

                if (last) scroll.update(last);
                else scroll.reset();
            };

            this.filtred = function () {
                var filter_data = this.getFilterData();
                var filter_any  = false;

                for (var i in filter_data) {
                    var filr = filter_data[i];

                    if (filr) {
                        if (Arrays.isArray(filr)) {
                            if (filr.length) filter_any = true;
                        } else filter_any = true;
                    }
                }

                filtred = results.Results.filter(function (element) {
                    if (filter_any) {
                        var passed  = false,
                            nopass  = false,
                            title   = element.Title.toLowerCase(),
                            tracker = element.Tracker;

                        var qua = Arrays.toArray(filter_data.quality),
                            hdr = filter_data.hdr,
                            dv  = filter_data.dv,
                            sub = filter_data.sub,
                            voi = Arrays.toArray(filter_data.voice),
                            tra = Arrays.toArray(filter_data.tracker),
                            ses = Arrays.toArray(filter_data.season),
                            lng = Arrays.toArray(filter_data.lang),
                            yer = filter_data.year,
                            _3d = filter_data._3d;

                        var test = function (search, test_index) {
                            var regex = new RegExp(search);
                            return test_index ? title.indexOf(search) >= 0 : regex.test(title);
                        };

                        var check = function (search, invert) {
                            if (test(search)) {
                                if (invert) nopass = true;
                                else passed = true;
                            } else {
                                if (invert) passed = true;
                                else nopass = true;
                            }
                        };

                        var includes = function (type, arr) {
                            if (!arr.length) return;

                            var any = false;

                            arr.forEach(function (a) {
                                if (type == 'quality') {
                                    if (a == '4k' && test('(4k|uhd)[ |\\]|,|$]|2160[pр]|ultrahd')) any = true;
                                    if (a == '1080p' && test('fullhd|1080[pр]')) any = true;
                                    if (a == '720p' && test('720[pр]')) any = true;
                                }
                                if (type == 'voice') {
                                    var p = filter_items.voice.indexOf(a);
                                    var n = element.info && element.info.voices ? element.info.voices.map(function (v) { return v.toLowerCase(); }) : [];

                                    if (p == 1) {
                                        if (test('дублирован|дубляж|  apple| dub| d[,| |$]|[,|\\s]дб[,|\\s|$]')) any = true;
                                    } else if (p == 2) {
                                        if (test('многоголос| p[,| |$]|[,|\\s](лм|пм)[,|\\s|$]')) any = true;
                                    } else if (p == 3) {
                                        if (test('двухголос|двуголос| l2[,| |$]|[,|\\s](лд|пд)[,|\\s|$]')) any = true;
                                    } else if (p == 4) {
                                        if (test('любитель|авторский| l1[,| |$]|[,|\\s](ло|ап)[,|\\s|$]')) any = true;
                                    } else if (test(a.toLowerCase(), true)) any = true;
                                    else if (n.length && n.indexOf(a.toLowerCase()) >= 0) any = true;
                                }
                                if (type == 'lang') {
                                    var p2 = filter_items.lang.indexOf(a);
                                    var c = filter_langs[p2 - 1];

                                    if (c) {
                                        if (element.languages) {
                                            if (element.languages.find(function (l) { return l.toLowerCase().slice(0, 2) == c.code; })) any = true;
                                        } else if (title.indexOf(c.code) >= 0) any = true;
                                    } else any = true;
                                }
                                if (type == 'tracker') {
                                    if (tracker.split(',').find(function (t) { return t.trim().toLowerCase() == a.toLowerCase(); })) any = true;
                                }

                                if (type == 'season') {
                                    var si = finded_seasons.indexOf(a);
                                    var f = parseInt(finded_seasons_full[si]);

                                    if (element.general.seasons.indexOf(f) >= 0) any = true;
                                }
                            });

                            if (any) passed = true;
                            else nopass = true;
                        };

                        includes('quality', qua);
                        includes('voice', voi);
                        includes('tracker', tra);
                        includes('season', ses);
                        includes('lang', lng);

                        if (hdr) check('[\\[| ]hdr[10| |\\]|,|$]', hdr !== 1);

                        if (dv == 0) {
                            check(filter_items.dv[dv], dv !== 1);
                        } else if (dv == 1) {
                            check('dolby vision');
                        } else if (dv == 2) {
                            check('dolby vision tv');
                        } else if (dv == 3) {
                            check('dolby vision', dv !== 0);
                        }

                        if (sub) check(' sub|[,|\\s]ст[,|\\s|$]', sub !== 1);

                        if (yer) {
                            check(filter_items.year[yer]);
                        }

                        if (_3d) check(' стереопара|interlace|anaglyph|анаглиф|bd3d|over\\-?under|side\\-?by\\-?side|[\\-\\[\\(| ]((half|h)?ou|(half|h)?sbs|lrq?|abq?|ba|rl|3d[\\- ]video)([ |\\]\\),]|$)', _3d !== 1);

                        return nopass ? false : passed;
                    } else return true;
                });
            };

            this.showResults = function () {
                total_pages = Math.ceil(filtred.length / 20);

                if (filtred.length) {
                    scroll.body().addClass('torrent-list');

                    // EDIT D: only show the history line when there actually is history.
                    if (history.get()) scroll.append(history.render(true));

                    this.append(filtred.slice(0, 20));
                } else {
                    if (results.Results.length) this.listEmpty();
                    else this.empty(Lang.translate('search_nofound'), true);
                }

                files.appendFiles(scroll.render());
            };

            this.reset = function () {
                last = false;

                scroll.clear();
            };

            this.next = function () {
                if (object.page < 15 && object.page < total_pages) {
                    object.page++;

                    var offset = (object.page - 1) * 20;

                    this.append(filtred.slice(offset, offset + 20), true);
                }
            };

            this.mark = function (element, item, add) {
                var viewed = Storage.cache('torrents_view', 5000, []);

                if (add) {
                    if (viewed.indexOf(element.hash) == -1) {
                        viewed.push(element.hash);
                        item.append('<div class="torrent-item__viewed">' + Template.get('icon_viewed', {}, true) + '</div>');
                    }
                } else {
                    element.viewed = true;
                    Arrays.remove(viewed, element.hash);
                    item.find('.torrent-item__viewed').remove();
                }

                element.viewed = add;

                Storage.set('torrents_view', viewed);

                if (!add) Storage.remove('torrents_view', element.hash);
            };

            this.addToBase = function (element) {
                Torserver.add({
                    poster: object.movie.img,
                    title: object.movie.title + ' / ' + object.movie.original_title,
                    link: element.MagnetUri || element.Link,
                    data: { lampa: true, movie: object.movie }
                }, function () {
                    Noty.show(object.movie.title + ' - ' + Lang.translate('torrent_parser_added_to_mytorrents'));
                });
            };

            // EDIT E: colour highlighting + quality badge (added at the end, before scroll.append).
            this.decorate = function (element, item) {
                var seeds = parseInt(element.Seeders) || 0;
                var seedSpan = item.find('.torrent-item__seeds span');

                if (seeds === 0) seedSpan.addClass('seeds-zero');
                else if (seeds > 19) seedSpan.addClass('high-seeds');

                var brSpan = item.find('.torrent-item__bitrate span');
                if ((parseFloat(brSpan.text()) || 0) > 50) brSpan.addClass('high-bitrate');

                var tname = (element.Tracker || '').toLowerCase();
                var trk = item.find('.torrent-item__tracker');
                ['kinozal', 'toloka', 'rutracker', 'rutor', 'torrentby', 'nnmclub', 'megapeer', 'bitru'].forEach(function (n) {
                    if (tname.indexOf(n) >= 0) trk.addClass(n);
                });

                var resEl = item.find('.torrent-item__ffprobe .m-resolution');
                if (resEl.length) {
                    resEl.addClass('q-badge q-' + resEl.text().replace(/\s/g, ''));
                }
            };

            this.append = function (items, append) {
                items.forEach(function (element) {
                    count++;

                    var date = Utils.parseTime(element.PublishDate);
                    var bitrate = object.movie.runtime ? Utils.calcBitrate(element.Size, object.movie.runtime) : 0;

                    Arrays.extend(element, {
                        title: element.Title,
                        date: date.full,
                        tracker: element.Tracker,
                        bitrate: bitrate,
                        size: !isNaN(parseInt(element.Size)) ? Utils.bytesToSize(element.Size) : element.size,
                        seeds: element.Seeders,
                        grabs: element.Peers
                    });

                    var item = Template.get('torrent', element);
                    var need_remove_ffprobe = false;

                    if (!element.ffprobe) {
                        element.ffprobe = [];
                        need_remove_ffprobe = true;
                    }

                    if (element.ffprobe) {
                        var ffprobe_elem = item.find('.torrent-item__ffprobe');
                        var ffprobe_tags = [];
                        var general      = element.general || {};
                        var quality      = element.info && element.info.quality ? Utils.qualityToText(element.info.quality + 'p') : general.resolution;

                        if (object.movie.number_of_seasons && general.season) {
                            ffprobe_elem.append('<div class="m-general"><div>S' + general.season + '</div>' + (general.episodes ? '<div>' + general.episodes + '</div>' : '') + '</div>');
                        }

                        if (quality) ffprobe_tags.push({ media: 'resolution', value: quality });

                        var video = element.ffprobe.find(function (a) { return a.codec_type == 'video'; });
                        var audio = element.ffprobe.filter(function (a) { return a.codec_type == 'audio' && a.tags; });
                        var subs  = element.ffprobe.filter(function (a) { return a.codec_type == 'subtitle' && a.tags; });
                        var voice = Arrays.clone(element.info && element.info.voices ? element.info.voices : []);

                        if (video) ffprobe_tags.push({ media: 'video', value: video.width + 'x' + video.height });

                        var is_71 = element.ffprobe.find(function (a) { return a.codec_type == 'audio' && a.channels == 8; });
                        var is_51 = element.ffprobe.find(function (a) { return a.codec_type == 'audio' && a.channels == 6; });

                        if (is_71) ffprobe_tags.push({ media: 'channels', value: '7.1' });
                        if (is_51) ffprobe_tags.push({ media: 'channels', value: '5.1' });

                        audio.forEach(function (a) {
                            var line = [];
                            var lang = (a.tags.language || '').toUpperCase();
                            var name = a.tags.title || a.tags.handler_name || '';
                            var short = Voices.find(function (v) { return name.toLowerCase().indexOf(v.toLowerCase()) >= 0; });

                            if (short) name = short;

                            var find = voice.find(function (v) { return name.toLowerCase().indexOf(v.toLowerCase()) >= 0; });

                            if (find) Arrays.remove(voice, find);

                            if (lang) line.push(lang);
                            if (name && lang !== 'ENG') {
                                name = find || name;

                                if (name.toLowerCase().indexOf('dub') >= 0 || name.toLowerCase() == 'd') name = Lang.translate('torrent_parser_voice_dubbing');

                                line.push(Utils.shortText(Utils.capitalizeFirstLetter(name), 20));
                            }

                            if (line.length) ffprobe_tags.push({ media: 'audio', value: line.join(' - ') });
                        });

                        voice.forEach(function (v) {
                            ffprobe_tags.push({ media: 'audio', value: v });
                        });

                        var find_subtitles = [];

                        subs.forEach(function (a) {
                            var lang = (a.tags.language || '').toUpperCase();
                            if (lang) find_subtitles.push(lang);
                        });

                        find_subtitles = find_subtitles.filter(function (el, pos) { return find_subtitles.indexOf(el) == pos; });

                        find_subtitles.slice(0, 4).forEach(function (a) {
                            ffprobe_tags.push({ media: 'subtitle', value: a });
                        });

                        if (find_subtitles.length > 4) ffprobe_tags.push({ media: 'subtitle', value: '+' + (find_subtitles.length - 4) });

                        ffprobe_tags = ffprobe_tags.filter(function (el, pos) {
                            return ffprobe_tags.map(function (a) { return a.value + a.media; }).indexOf(el.value + el.media) == pos;
                        });

                        ffprobe_tags.forEach(function (tag) {
                            ffprobe_elem.append('<div class="m-' + tag.media + '">' + tag.value + '</div>');
                        });

                        if ($('> div', ffprobe_elem).length) ffprobe_elem.removeClass('hide');

                        if (need_remove_ffprobe) delete element.ffprobe;
                    }

                    if (!bitrate) item.find('.bitrate').remove();

                    if (element.viewed) item.append('<div class="torrent-item__viewed">' + Template.get('icon_viewed', {}, true) + '</div>');

                    if (!element.size || parseInt(element.size) == 0) item.find('.torrent-item__size').remove();

                    item.on('hover:focus', function (e) {
                        last = e.target;
                        scroll.update($(e.target), true);
                    }).on('hover:hover hover:touch', function (e) {
                        last = e.target;
                        Navigator.focused(last);
                    }).on('hover:enter', function (e) {
                        last = e.target;

                        Torrent.opened(function () {
                            this.mark(element, item, true);
                        }.bind(this));

                        element.poster = object.movie.img;

                        this.start();

                        Torrent.start(element, object.movie);

                        Lampa.Listener.send('torrent', { type: 'onenter', element: element, item: item });
                    }.bind(this)).on('hover:long', function () {
                        var enabled = Controller.enabled().name;
                        var menu = [
                            { title: Lang.translate('torrent_parser_add_to_mytorrents'), tomy: true },
                            { title: Lang.translate('torrent_parser_label_title'), subtitle: Lang.translate('torrent_parser_label_descr'), mark: true },
                            { title: Lang.translate('torrent_parser_label_cancel_title'), subtitle: Lang.translate('torrent_parser_label_cancel_descr'), unmark: true }
                        ];

                        Lampa.Listener.send('torrent', { type: 'onlong', element: element, item: item, menu: menu });

                        Select.show({
                            title: Lang.translate('title_action'),
                            items: menu,
                            onBack: function () {
                                Controller.toggle(enabled);
                            },
                            onSelect: function (a) {
                                if (a.tomy) this.addToBase(element);
                                else if (a.mark) this.mark(element, item, true);
                                else if (a.unmark) this.mark(element, item, false);

                                Controller.toggle(enabled);
                            }.bind(this)
                        });
                    }.bind(this));

                    this.decorate(element, item);

                    Lampa.Listener.send('torrent', { type: 'render', element: element, item: item });

                    scroll.append(item);

                    if (append) Controller.collectionAppend(item);
                }.bind(this));
            };

            this.back = function () {
                Activity.backward();
            };

            this.start = function () {
                if (!initialized) {
                    initialized = true;
                    this.initialize();
                }

                Background.immediately(Utils.cardImgBackgroundBlur(object.movie));

                Controller.add('content', {
                    toggle: function () {
                        Controller.collectionSet(scroll.render(), files.render(true));
                        Controller.collectionFocus(last || false, scroll.render(true));

                        Navigator.remove(files.render().find('.explorer-card__head-img')[0]);
                    },
                    update: function () {},
                    up: function () {
                        if (Navigator.canmove('up')) {
                            Navigator.move('up');
                        } else Controller.toggle('head');
                    },
                    down: function () {
                        Navigator.move('down');
                    },
                    right: function () {
                        if (Navigator.canmove('right')) Navigator.move('right');
                        else filter.render().find('.filter--filter').trigger('hover:enter');
                    },
                    // EDIT B: left no longer focuses the (hidden) description panel.
                    left: function () {
                        if (Navigator.canmove('left')) Navigator.move('left');
                        else Controller.toggle('menu');
                    },
                    back: this.back
                });

                Controller.toggle('content');
            };

            this.pause = function () {
                listener && listener.destroy();
            };

            this.stop = function () {};

            this.render = function () {
                return files.render();
            };

            this.destroy = function () {
                network.clear();
                Parser.clear();

                files.destroy();

                scroll.destroy();

                listener && listener.destroy();

                results = null;
                network = null;
            };
        }

        // ───────────────────────── drift check + fallback registration ─────────────────────────
        var Original = Lampa.Component.get ? Lampa.Component.get('torrents') : null;

        try {
            if (Original) {
                var src = Original.toString();
                var markers = ['torrents_sort', 'torrent_parser_sort_by_seeders', 'empty_filter', 'explorer__files-head'];
                var missing = markers.filter(function (m) { return src.indexOf(m) === -1; });

                if (missing.length) {
                    console.warn('[torrents-qseed] engine torrents component changed (missing: ' + missing.join(', ') + '); plugin copy may be stale.');
                }
            }
        } catch (e) { /* ignore */ }

        function wrapped(object) {
            try {
                component.call(this, object);
            } catch (e) {
                console.error('[torrents-qseed] component failed, falling back to original', e);
                if (Original) return Original.call(this, object);
                throw e;
            }
        }

        addStyles();

        Lampa.Component.add('torrents', wrapped);

        function addStyles() {
            if (document.getElementById('torrents-qseed-style')) return;

            var css = [
                /* drop the left description panel on the torrent screen */
                '.torrents-noinfo .explorer__left{display:none !important}',
                '.torrents-noinfo .explorer__files{width:100% !important}',
                /* seeders / bitrate highlighting */
                '.torrent-item__seeds span.high-seeds{color:#3fde6a;font-weight:bold}',
                '.torrent-item__seeds span.seeds-zero{color:#ff4d4d}',
                '.torrent-item__bitrate span.high-bitrate{color:#ff8c00;font-weight:bold}',
                /* tracker accent */
                '.torrent-item__tracker.kinozal,.torrent-item__tracker.toloka,.torrent-item__tracker.rutracker,.torrent-item__tracker.rutor,.torrent-item__tracker.torrentby,.torrent-item__tracker.nnmclub,.torrent-item__tracker.megapeer,.torrent-item__tracker.bitru{color:#b487c9;font-weight:bold}',
                /* quality badge */
                '.torrent-item__ffprobe .m-resolution.q-badge{font-weight:bold;border-radius:0.3em}',
                '.torrent-item__ffprobe .m-resolution.q-4K{background:#c0392b;color:#fff}',
                '.torrent-item__ffprobe .m-resolution.q-2K{background:#8e44ad;color:#fff}',
                '.torrent-item__ffprobe .m-resolution.q-FHD{background:#2980b9;color:#fff}',
                '.torrent-item__ffprobe .m-resolution.q-HD{background:#16a085;color:#fff}',
                '.torrent-item__ffprobe .m-resolution.q-SD,.torrent-item__ffprobe .m-resolution.q-LD{background:#7f8c8d;color:#fff}'
            ].join('');

            var style = document.createElement('style');
            style.id = 'torrents-qseed-style';
            style.innerHTML = css;
            document.head.appendChild(style);
        }
    }

    if (window.appready) start();
    else window.Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') start();
    });
})();
