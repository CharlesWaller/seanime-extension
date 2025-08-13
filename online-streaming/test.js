videojs.options.flash.swf = "/videojs/swf/video-js.swf";

var videojsPlayer = videojs(
  'video_html5_wrapper',
  {
    language: "ru",
    controls: true,
    autoplay: false,
    preload: "none",
    loop: false,
    width: "100%",
    height: "100%",
    poster: "//st.sibnet.ru/upload/cover/video_5956567_0.jpg",
    hls: {
      withCredentials: false
    },
    controlBar: {
      liveDisplay: false
    },
    techOrder: ["html5", "flash", "hls"]
  },
  function () {
    var player = this;
    var counterPlay = true;

    player.progressTips({
      preview: "//st.sibnet.ru/upload/preview/preview/56/10/00/video_5610009_"
    });

    player.on('play', function () {
      if (counterPlay) {
        counterPlay = false;
        $.get('/c.php?videoid=5956567');
      }
    });

    player.sharesibnet({
      url: "http://video.sibnet.ru/video5956567",
      embed: "http://video.sibnet.ru/shell.php?videoid=5956567",
      username: "A.%20Sama",
      name: "LOM_01_VOSTFR"
    });

    player.relatedCarousel({
      url: "/export/playlist_xml.php?videoid=5956567&k=902c23b5c2e7fb3680effd1235a8c07d&d=1755068400&format=json"
    });

    player.hotkeysPlugin({});

    player.countersibnet({
      videoid: '5956567',
      banner: '2',
      tags: '1349',
      cliptime: '2087',
      referrer: '',
      server: '25'
    });

    player.postvideosibnet({
      url: "/export/playnext_xml.php?videoid=5956567&shell=1&format=json"
    });

    var postRollEndedFunc = function () {
      console.log('js: postroll internal trigger emitted');
      player.trigger('postrollended');
    };

    player.on('ended', postRollEndedFunc);

    player.on('disablepostrollended', function () {
      player.off('ended', postRollEndedFunc);
      player.on('vast.postrollEnd', postRollEndedFunc);
      console.log('js: postrollended trigger disabled');
    });

    player.logobrand({
      destination: "/video5956567?utm_source=player&utm_medium=video&utm_campaign=EMBED"
    });

    player.src([
      {
        src: "/v/dc803dfe368ad427e636244b51437849/5956567.mp4",
        type: "video/mp4"
      }
    ]);

    player.persistvolume({
      namespace: "Sibnet-Volume"
    });

    player.overlayclip({
      image: "",
      destination: ""
    });

    var vastAd = player.vastClient({
      adTagUrl: "//advast.sibnet.ru/getcode.php?embed=1&siteurl=&autoplay=0&adult=0&tag_id=1349&tag=rugoe&duration=2087&uploadtime=1751912199&videoid=5956567&videoname=LOM_01_VOSTFR&userid=1488878",
      playAdAlways: true,
      adCancelTimeout: 10000,
      responseTimeout: 20000,
      adsEnabled: true,
      vpaidFlashLoaderPath: "/videojs/swf/VPAIDFlash.swf",
      preferredTech: "html5"
    });
  }
);
