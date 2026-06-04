// Эмодзи-панель: 10 категорий, поиск, recent, skin tones
(function() {
  'use strict';
  window.QWAS = window.QWAS || {};

  const EMOJI_DATA = [
    { name: 'recent', icon: '🕘', emojis: '' },
    { name: 'smileys', icon: '😀', emojis: '😀😃😄😁😆😅🤣😂🙂🙃😉😊😇🥰😍🤩😘😗😚😙😋😛😜🤪😝🤑🤗🤭🤫🤔🤐🤨😐😑😶😏😒🙄😬🤥😌😔😪🤤😴😷🤒🤕🤢🤮🤧🥵🥶🥴😵🤯🤠🥳😎🤓🧐😕😟🙁☹️😮😯😲😳🥺😦😧😨😰😥😢😭😱😖😣😞😓😩😫🥱😤😡😠🤬😈👿💀☠️💩🤡👹👺👻👽👾🤖😺😸😹😻😼😽🙀😿😾' },
    { name: 'gestures', icon: '👋', emojis: '👋🤚🖐️✋🖖👌🤌🤏✌️🤞🤟🤘🤙👈👉👆🖕👇☝️👍👎✊👊🤛🤜👏🙌👐🤲🤝🙏✍️💅🤳💪🦾🦿🦵🦶👂🦻👃🧠🫀🫁🦷🦴👀👁️👅👄💋🩸' },
    { name: 'people', icon: '👶', emojis: '👶🧒👦👧🧑👨👩🧓👴👵🙅🙆💁🙋🧏🙇🤦🤷💆💇🚶🏃💃🕺🧎🧑‍🦯🧑‍🦼🧑‍🦽🧑‍🦽‍➡️🧖🧗🤺🏇⛷️🏂🏌️🏄🚣🏊🤽🚴🚵🎪🎭🩰🎨🎬🎤🎧🎼🎵🎶🎹🥁🎷🎺🎸🪕🎻🎲♟️🎯🎳🎮🎰🧩' },
    { name: 'animals', icon: '🐶', emojis: '🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐽🐸🐵🙈🙉🙊🐒🐔🐧🐦🐤🐣🐥🦆🦅🦉🦇🐺🐗🐴🦄🐝🪱🐛🦋🐌🐞🐜🪰🪲🪳🦟🦗🕷️🕸️🦂🐢🐍🦎🦖🦕🐙🦑🦐🦞🦀🐡🐠🐟🐬🐳🐋🦈🐊🐅🐆🦓🦍🦧🐘🦛🦏🐪🐫🦒🦘🐃🐂🐄🐎🐖🐏🐑🦙🐐🦌🐕🐩🦮🐕‍🦺🐈🐈‍⬛🪶🐓🦃🦚🦜🦢🦩🕊️🐇🦝🦨🦡🦦🦥🐁🐀🐿️🦔🐲🐉' },
    { name: 'food', icon: '🍎', emojis: '🍎🍐🍊🍋🍌🍉🍇🍓🫐🍈🍒🍑🥭🍍🥥🥝🍅🍆🥑🥦🥬🥒🌶️🫑🌽🥕🫒🧄🧅🥔🍠🥐🥯🍞🥖🥨🧀🥚🍳🧈🥞🧇🥓🥩🍗🍖🦴🌭🍔🍟🍕🥪🥙🧆🌮🌯🫔🥗🥘🫕🥫🍝🍜🍲🍛🍣🍱🥟🦪🍤🍙🍚🍘🍥🥠🥮🍢🍡🍧🍨🍦🥧🧁🍰🎂🍮🍭🍬🍫🍿🍩🍪🌰🥜🫘🍯🥛🫗🥤☕🫖🍵🧃🥢🍽️🍴🥄🔪🧂' },
    { name: 'travel', icon: '🚗', emojis: '🚗🚕🚙🚌🚎🏎️🚓🚑🚒🚐🛻🚚🚛🚜🦯🦽🦼🛴🚲🛵🏍️🛺🚨🚔🚍🚘🚖🚡🚠🚟🚃🚋🚞🚝🚄🚅🚈🚂🚆🚇🚊🚉✈️🛫🛬🛩️💺🛰️🚀🛸🚁🛶⛵🚤🛥️🛳️⛴️🚢⚓🚧⛽🚏🚦🚥🗺️🗿🗽🗼🏰🏯🏟️🎡🎢🎠⛲🏖️🏝️🏜️🌋⛰️🏔️🗻🏕️⛺🏠🏡🏘️🏚️🏗️🏭🏢🏬🏣🏤🏥🏦🏨🏪🏫🏩💒🏛️⛪🕌🕍🛕🕋⛩️🛤️🛣️🗾🎑🏞️🌅🌄🌠🎇🎆🌇🌆🏙️🌃🌌🌉🌁' },
    { name: 'activities', icon: '⚽', emojis: '⚽🏀🏈⚾🥎🎾🏐🏉🥏🎱🪀🏓🏸🏒🏑🥍🏏🪃🥅⛳🪁🏹🎣🤿🥊🥋🎽🛹🛼🛷⛸️🥌🎿⛷️🏂🪂🏋️🤼🤸🤺🤾🏇🧘🏄🏊🤽🚣🚴🚵🤹🎪🎭🩰🎨🎬🎤🎧🎼🎵🎶🎹🥁🎷🎺🎸🪕🎻🎲♟️🎯🎳🎮🎰🧩🪅🪆🎖️🏆🏅🥇🥈🥉🎗️🎟️🎫' },
    { name: 'objects', icon: '💡', emojis: '⌚📱💻⌨️🖥️🖨️🖱️🖲️🕹️🗜️💽💾💿📀📷📸📹🎥📽️🎞️📞☎️📟📠📺📻🎙️🎚️🎛️🧭⏱️⏲️⏰🕰️⌛⏳📡🔋🔌💡🔦🕯️🪔🧯🛢️💸💵💴💶💷💰💎⚖️🪜🧰🪛🔧🔨⚒️🛠️⛏️🪚🔩⚙️🪤🧱⛓️🧲🔫💣🧨🪓🔪🗡️⚔️🛡️🚬⚰️⚱️🏺🔮📿🧿💈⚗️🔭🔬🕳️🩹🩺💊💉🩸🧬🦠🧫🧪🌡️🧹🪠🧺🧻🚽🚰🚿🛁🛀🧼🪥🧽🪒🧴🧷🧸🪆🖼️🎨🧵🪡🧶🪢' },
    { name: 'symbols', icon: '❤️', emojis: '❤️🧡💛💚💙💜🖤🤍🤎💔❣️💕💞💓💗💖💘💝💟☮️✝️☪️🕉️☸️✡️🔯🕎🔮♈♉♊♋♌♍♎♏♐♑♒♓⛎🔴🟠🟡🟢🔵🟣⚫⚪🟤🔶🔷🔸🔹🔺🔻💠🔘🔳🔲▪️▫️◾◽◼️◻️🟥🟧🟨🟩🟦🟪🟫⬛⬜🟰💯💢💥💫💦💨🕳️💬🗨️🗯️💭💤' },
    { name: 'flags', icon: '🏁', emojis: '🏁🚩🎌🏴🏳️🏳️‍🌈🏳️‍⚧️🏴‍☠️🇷🇺🇺🇸🇬🇧🇩🇪🇫🇷🇪🇸🇮🇹🇺🇦🇧🇾🇰🇿🇨🇳🇯🇵🇰🇷🇹🇷🇮🇳🇧🇷🇨🇦🇦🇺🇮🇩🇲🇽🇵🇱🇳🇱🇧🇪🇸🇪🇫🇮🇳🇴🇦🇷🇨🇭🇦🇹🇮🇱🇸🇦🇦🇪🇪🇬🇿🇦🇳🇬🇪🇹🇰🇮🇻🇳🇹🇭🇻🇳🇵🇭🇲🇾' }
  ];

  const SKIN_TONES = ['\u{1F3FB}', '\u{1F3FC}', '\u{1F3FD}', '\u{1F3FE}', '\u{1F3FF}'];

  const EMOJI_KEYWORDS = {
    '😀': 'улыбка смех радость smile happy', '😂': 'смех слезы радость laugh cry',
    '❤️': 'любовь сердце love heart', '👍': 'палец лайк хорошо ok yes like',
    '👎': 'палец дизлайк плохо no dislike', '🙏': 'молитва спасибо пожалуйста pray thanks',
    '🔥': 'огонь пожар fire', '⭐': 'звезда star', '🎉': 'праздник салют party congrats',
    '😢': 'грусть слезы sad cry', '😡': 'злость angry', '🥺': 'просьба пожалуйста please',
    '👀': 'глаза смотрю', '💩': 'какашка poop', '😎': 'крутой cool'
  };

  const Emoji = {
    categories: EMOJI_DATA,
    currentCategory: 0,
    recent: [],
    currentSkinTone: '',
    searchQuery: '',
    searchInput: null,

    init() {
      this.recent = this.loadRecent();
      this.renderCategories();
      this.renderSkinTone();
      this.bindSearch();
      this.populate();
    },

    loadRecent() {
      try { return JSON.parse(localStorage.getItem('qwas_recent_emoji') || '[]'); }
      catch { return []; }
    },

    saveRecent() {
      try { localStorage.setItem('qwas_recent_emoji', JSON.stringify(this.recent.slice(0, 32))); } catch {}
    },

    pushRecent(emoji) {
      const base = this.withoutSkinTone(emoji);
      this.recent = [base, ...this.recent.filter(e => this.withoutSkinTone(e) !== base)].slice(0, 32);
      this.saveRecent();
    },

    withoutSkinTone(e) {
      for (const t of SKIN_TONES) {
        if (e.includes(t)) return e.replace(new RegExp(t, 'g'), '');
      }
      return e;
    },

    renderCategories() {
      const cats = document.getElementById('emojiCategories');
      if (!cats) return;
      const visibleCats = this.categories.filter(c => c.name !== 'recent' || (this.recent && this.recent.length));
      cats.innerHTML = visibleCats.map((c) => {
        const idx = this.categories.indexOf(c);
        return `<button class="emoji-cat ${idx === this.currentCategory ? 'active' : ''}" data-cat="${idx}" title="${c.name}">${c.icon}</button>`;
      }).join('');
      cats.querySelectorAll('.emoji-cat').forEach(btn => {
        btn.addEventListener('click', () => this.selectCat(parseInt(btn.dataset.cat)));
      });
    },

    renderSkinTone() {
      const tones = document.getElementById('emojiSkinTones');
      if (!tones) return;
      tones.innerHTML = ['', ...SKIN_TONES].map((t, i) =>
        `<button class="skin-tone ${this.currentSkinTone === t ? 'active' : ''}" data-tone="${t}">${i === 0 ? '✋' : '👋' + t}</button>`
      ).join('');
      tones.querySelectorAll('.skin-tone').forEach(btn => {
        btn.addEventListener('click', () => this.setSkinTone(btn.dataset.tone || ''));
      });
    },

    setSkinTone(tone) {
      this.currentSkinTone = tone;
      this.renderSkinTone();
      this.populate();
    },

    bindSearch() {
      const search = document.getElementById('emojiSearch');
      if (!search) return;
      this.searchInput = search;
      search.addEventListener('input', (e) => this.search(e.target.value));
    },

    selectCat(i) {
      this.currentCategory = i;
      this.searchQuery = '';
      if (this.searchInput) this.searchInput.value = '';
      this.renderCategories();
      this.populate();
    },

    search(q) {
      this.searchQuery = (q || '').toLowerCase().trim();
      this.currentCategory = -1;
      this.renderCategories();
      this.populate();
    },

    getAllEmojis() {
      const all = [];
      for (const cat of this.categories) {
        if (cat.name === 'recent') continue;
        for (const e of Array.from(cat.emojis)) all.push(e);
      }
      return [...new Set(all)];
    },

    populate() {
      const grid = document.getElementById('emojiGrid');
      if (!grid) return;
      let emojis;
      if (this.searchQuery) {
        const q = this.searchQuery;
        emojis = this.getAllEmojis().filter(e => {
          if (e.includes(q)) return true;
          for (const [emoji, kw] of Object.entries(EMOJI_KEYWORDS)) {
            if (emoji === e && kw.toLowerCase().includes(q)) return true;
          }
          return false;
        });
        if (emojis.length === 0) {
          grid.innerHTML = '<div class="emoji-empty">Ничего не найдено</div>';
          return;
        }
      } else if (this.currentCategory === 0 && this.recent.length) {
        emojis = this.recent;
      } else {
        const cat = this.categories[this.currentCategory] || this.categories[1];
        emojis = Array.from(cat.emojis);
      }

      grid.innerHTML = emojis.map(e => {
        const withTone = (this.currentSkinTone && EMOJI_KEYWORDS[this.withoutSkinTone(e)])
          ? this.withoutSkinTone(e) + this.currentSkinTone
          : e;
        return `<button class="emoji-item">${this._safeEmoji(withTone)}</button>`;
      }).join('');

      // Делегирование клика
      grid.querySelectorAll('.emoji-item').forEach((btn, i) => {
        btn.addEventListener('click', () => this.insert(emojis[i]));
      });
    },

    _safeEmoji(s) {
      // Эмодзи не нуждаются в HTML-escape, но защищаемся от потенциально опасных символов
      return String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
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
      // Учитываем ZWJ и суррогатные пары
      const codePointLen = Array.from(emoji).length;
      const newPos = start + codePointLen;
      ta.setSelectionRange(newPos, newPos);
      this.pushRecent(emoji);
      if (QWAS.Composer) {
        QWAS.Composer.updateSendButton();
        QWAS.Composer.autoresize();
      }
    }
  };

  window.QWAS.Emoji = Emoji;
})();
