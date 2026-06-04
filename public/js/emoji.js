(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const Emoji = {
    categories: [
      { name: 'smileys', icon: '😀', emojis: '😀😃😄😁😆😅🤣😂🙂🙃😉😊😇🥰😍🤩😘😗😚😙😋😛😜🤪😝🤑🤗🤭🤫🤔🤐🤨😐😑😶😏😒🙄😬🤥😌😔😪🤤😴😷🤒🤕🤢🤮🤧🥵🥶🥴😵🤯🤠🥳😎🤓🧐😕😟🙁☹️😮😯😲😳🥺😦😧😨😰😥😢😭😱😖😣😞😓😩😫🥱😤😡😠🤬😈👿💀☠️💩🤡👹👺👻👽👾🤖😺😸😹😻😼😽🙀😿😾' },
      { name: 'gestures', icon: '👋', emojis: '👋🤚🖐️✋🖖👌🤌🤏✌️🤞🤟🤘🤙👈👉👆🖕👇☝️👍👎✊👊🤛🤜👏🙌👐🤲🤝🙏✍️💅🤳💪🦾🦿🦵🦶👂🦻👃🧠🫀🫁🦷🦴👀👁️👅👄💋🩸' },
      { name: 'people', icon: '👶', emojis: '👶🧒👦👧🧑👨👩🧓👴👵🙅🙆💁🙋🧏🙇🤦🤷💆💇🚶🏃💃🕺🧎🧑‍🦯🧑‍🦼🧑‍🦽🧑‍🦽‍➡️🧖🧗🤺🏇⛷️🏂🏌️🏄🚣🏊🤽🚴🚵🎪🎭🩰🎨🎬🎤🎧🎼🎵🎶🎹🥁🎷🎺🎸🪕🎻🎲♟️🎯🎳🎮🎰🧩' },
      { name: 'animals', icon: '🐶', emojis: '🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐽🐸🐵🙈🙉🙊🐒🐔🐧🐦🐤🐣🐥🦆🦅🦉🦇🐺🐗🐴🦄🐝🪱🐛🦋🐌🐞🐜🪰🪲🪳🦟🦗🕷️🕸️🦂🐢🐍🦎🦖🦕🐙🦑🦐🦞🦀🐡🐠🐟🐬🐳🐋🦈🐊🐅🐆🦓🦍🦧🐘🦛🦏🐪🐫🦒🦘🐃🐂🐄🐎🐖🐏🐑🦙🐐🦌🐕🐩🦮🐕‍🦺🐈🐈‍⬛🪶🐓🦃🦚🦜🦢🦩🕊️🐇🦝🦨🦡🦦🦥🐁🐀🐿️🦔🐲🐉' },
      { name: 'food', icon: '🍎', emojis: '🍎🍐🍊🍋🍌🍉🍇🍓🫐🍈🍒🍑🥭🍍🥥🥝🍅🍆🥑🥦🥬🥒🌶️🫑🌽🥕🫒🧄🧅🥔🍠🥐🥯🍞🥖🥨🧀🥚🍳🧈🥞🧇🥓🥩🍗🍖🦴🌭🍔🍟🍕🥪🥙🧆🌮🌯🫔🥗🥘🫕🥫🍝🍜🍲🍛🍣🍱🥟🦪🍤🍙🍚🍘🍥🥠🥮🍢🍡🍧🍨🍦🥧🧁🍰🎂🍮🍭🍬🍫🍿🍩🍪🌰🥜🫘🍯🥛🫗🥤☕🫖🍵🧃🥤🥢🍽️🍴🥄🔪🧂' },
      { name: 'travel', icon: '🚗', emojis: '🚗🚕🚙🚌🚎🏎️🚓🚑🚒🚐🛻🚚🚛🚜🦯🦽🦼🛴🚲🛵🏍️🛺🚨🚔🚍🚘🚖🚡🚠🚟🚃🚋🚞🚝🚄🚅🚈🚂🚆🚇🚊🚉✈️🛫🛬🛩️💺🛰️🚀🛸🚁🛶⛵🚤🛥️🛳️⛴️🚢⚓🚧⛽🚏🚦🚥🗺️🗿🗽🗼🏰🏯🏟️🎡🎢🎠⛲🏖️🏝️🏜️🌋⛰️🏔️🗻🏕️⛺🏠🏡🏘️🏚️🏗️🏭🏢🏬🏣🏤🏥🏦🏨🏪🏫🏩💒🏛️⛪🕌🕍🛕🕋⛩️🛤️🛣️🗾🎑🏞️🌅🌄🌠🎇🎆🌇🌆🏙️🌃🌌🌉🌁' },
      { name: 'activities', icon: '⚽', emojis: '⚽🏀🏈⚾🥎🎾🏐🏉🥏🎱🪀🏓🏸🏒🏑🥍🏏🪃🥅⛳🪁🏹🎣🤿🥊🥋🎽🛹🛼🛷⛸️🥌🎿⛷️🏂🪂🏋️🤼🤸🤺🤾🏇🧘🏄🏊🤽🚣🚴🚵🤹🎪🎭🩰🎨🎬🎤🎧🎼🎵🎶🎹🥁🎷🎺🎸🪕🎻🎲♟️🎯🎳🎮🎰🧩🪅🪆🎖️🏆🏅🥇🥈🥉🎗️🎟️🎫' },
      { name: 'objects', icon: '💡', emojis: '⌚📱💻⌨️🖥️🖨️🖱️🖲️🕹️🗜️💽💾💿📀📷📸📹🎥📽️🎞️📞☎️📟📠📺📻🎙️🎚️🎛️🧭⏱️⏲️⏰🕰️⌛⏳📡🔋🔌💡🔦🕯️🪔🧯🛢️💸💵💴💶💷💰💳💎⚖️🪜🧰🪛🔧🔨⚒️🛠️⛏️🪚🔩⚙️🪤🧱⛓️🧲🔫💣🧨🪓🔪🗡️⚔️🛡️🚬⚰️⚱️🏺🔮📿🧿💈⚗️🔭🔬🕳️🩹🩺💊💉🩸🧬🦠🧫🧪🌡️🧹🪠🧺🧻🚽🚰🚿🛁🛀🧼🪥🧽🪒🧴🧷🧸🪆🖼️🎨🧵🪡🧶🪢' },
      { name: 'symbols', icon: '❤️', emojis: '❤️🧡💛💚💙💜🖤🤍🤎💔❣️💕💞💓💗💖💘💝💟☮️✝️☪️🕉️☸️✡️🔯🕎🔮♈♉♊♋♌♍♎♏♐♑♒♓⛎🔴🟠🟡🟢🔵🟣⚫⚪🟤🔶🔷🔸🔹🔺🔻💠🔘🔳🔲▪️▫️◾◽◼️◻️🟥🟧🟨🟩🟦🟪🟫⬛⬜🟰💯💢💥💫💦💨🕳️💬🗨️🗯️💭💤👋🏻👋🏼👋🏽👋🏾👋🏿' },
      { name: 'flags', icon: '🏁', emojis: '🏁🚩🎌🏴🏳️🏳️‍🌈🏳️‍⚧️🏴‍☠️🇷🇺🇺🇸🇬🇧🇩🇪🇫🇷🇪🇸🇮🇹🇺🇦🇧🇾🇰🇿🇨🇳🇯🇵🇰🇷🇹🇷🇮🇳🇧🇷🇨🇦🇦🇺🇮🇩🇲🇽🇵🇱🇳🇱🇧🇪🇸🇪🇫🇮🇳🇴🇦🇷🇨🇭🇦🇹🇮🇱🇸🇦🇦🇪🇪🇬🇿🇦🇳🇬🇪🇹🇰🇮🇻🇳🇹🇭🇻🇳🇵🇭🇲🇾' }
    ],
    currentCategory: 0,

    init() {
      const cats = document.getElementById('emojiCategories');
      if (cats) {
        cats.innerHTML = this.categories.map((c, i) => `<button class="emoji-cat ${i === 0 ? 'active' : ''}" data-cat="${i}" onclick="QWAS.Emoji.selectCat(${i})">${c.icon}</button>`).join('');
      }
      this.populate();
    },

    selectCat(i) {
      this.currentCategory = i;
      document.querySelectorAll('.emoji-cat').forEach(c => c.classList.toggle('active', parseInt(c.dataset.cat) === i));
      this.populate();
    },

    populate() {
      const grid = document.getElementById('emojiGrid');
      if (!grid) return;
      const cat = this.categories[this.currentCategory] || this.categories[0];
      const emojis = Array.from(cat.emojis);
      grid.innerHTML = emojis.map(e => `<button class="emoji-item" onclick="QWAS.Emoji.insert('${e}')">${e}</button>`).join('');
    },

    insert(emoji) {
      const ta = document.getElementById('msgInput');
      if (!ta) return;
      const start = ta.selectionStart || 0;
      const end = ta.selectionEnd || 0;
      const before = ta.value.substring(0, start);
      const after = ta.value.substring(end);
      ta.value = before + emoji + after;
      ta.focus();
      const newPos = start + emoji.length;
      ta.setSelectionRange(newPos, newPos);
      QWAS.Composer.updateSendButton();
      QWAS.Composer.autoresize();
    }
  };

  QWAS.Emoji = Emoji;
})();
