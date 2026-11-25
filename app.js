/* ============================================================================
   Turkey City Hunt (81 Provinces + Province Borders + 1P & 2P Conquest/Battle)
   Web GIS GeoGame
   ============================================================================ */

// Chart defaults (dark theme)
if (window.Chart) { Chart.defaults.color = '#9fb0cc'; Chart.defaults.borderColor = 'rgba(160,185,230,0.14)'; }
const rnd = (a, b) => a + Math.random() * (b - a);

// --- 1. WEB AUDIO SYNTHESIZER ---
const soundFX = (() => {
  let ctx = null;
  let muted = false;

  function ensureCtx() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) ctx = new AudioCtx();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function tone(freq, duration, type = 'sine', gainVal = 0.12, delay = 0) {
    if (muted) return;
    ensureCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
    gain.gain.setValueAtTime(gainVal, ctx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + duration);
  }

  return {
    toggleMute() { muted = !muted; return muted; },
    correct() { tone(523.25, 0.12, 'triangle', 0.14, 0); tone(659.25, 0.18, 'triangle', 0.14, 0.09); },
    combo() { tone(523.25, 0.1, 'triangle', 0.15, 0); tone(659.25, 0.1, 'triangle', 0.15, 0.08); tone(783.99, 0.22, 'triangle', 0.16, 0.16); },
    wrong() { tone(190, 0.22, 'sawtooth', 0.1, 0); },
    joker() { tone(440, 0.1, 'sine', 0.1, 0); tone(587.33, 0.14, 'sine', 0.1, 0.08); },
    tick() { tone(880, 0.05, 'square', 0.05, 0); },
    battle() { tone(220, 0.15, 'sawtooth', 0.1, 0); tone(330, 0.15, 'sawtooth', 0.1, 0.16); tone(440, 0.35, 'triangle', 0.14, 0.32); },
    turn() { tone(392, 0.12, 'triangle', 0.13, 0); tone(587.33, 0.2, 'triangle', 0.14, 0.1); },
    clash() { tone(rnd(700, 1500), 0.05, 'square', 0.035, 0); tone(rnd(90, 140), 0.12, 'sine', 0.09, 0); },
    victory() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.28, 'triangle', 0.15, i * 0.14)); },
    gameOver() { tone(392, 0.18, 'triangle', 0.12, 0); tone(329.63, 0.25, 'triangle', 0.12, 0.18); }
  };
})();

// --- 2. CLOSURE: Encapsulated Private Game Engine (Supports 1P & 2P Modes) ---
function createCityHuntEngine() {
  let mode = '1p'; // '1p' | '2p'
  let difficulty = 'medium';
  let isRunning = false;

  // 1P State
  let score = 0;
  let timeLeft = 90;
  let lives = 3;
  let jokersLeft = 3;
  let skipsLeft = 2;
  let streak = 0;
  let maxStreak = 0;
  let roundNumber = 0;
  let wrongBuffer = 0;
  let currentCityPoints = 100;
  let usedJokersThisRound = { region: false, clue: false, eliminate: false };

  // 2P State (Total 10 questions, 60s per question, alternating turns)
  let totalQuestions2P = 10;
  let currentQuestion2P = 0;
  let activePlayerIdx = 0; // 0 = P1, 1 = P2
  let turnAttemptsLeft = 3;
  let players = [
    { name: 'Commander 1', troops: 0, cities: 0, wrong: 0, jokers: 3, streak: 0 },
    { name: 'Commander 2', troops: 0, cities: 0, wrong: 0, jokers: 3, streak: 0 }
  ];

  const REGIONS = ['Marmara', 'Aegean', 'Mediterranean', 'Central Anatolia', 'Black Sea', 'Eastern Anatolia', 'Southeastern Anatolia'];
  let regionStats = {};
  let stats = { correct: 0, wrong: 0, regionJokers: 0, clueJokers: 0, eliminateJokers: 0 };
  let highScore = Number(localStorage.getItem('turkiye_81_v2_highscore')) || 0;

  const DIFFICULTY_RULES = {
    easy:   { label: 'Easy Mode', lives: 3, jokers: Infinity, timePenalty: 3, wrongsPerLife: 3, complexClues: false },
    medium: { label: 'Medium Mode',  lives: 3, jokers: 3,        timePenalty: 5, wrongsPerLife: 2, complexClues: true  },
    hard:   { label: 'Hard Mode',   lives: 3, jokers: 3,        timePenalty: 0, wrongsPerLife: 1, complexClues: true  }
  };

  function resetRegionStats() {
    regionStats = {};
    REGIONS.forEach(r => { regionStats[r] = { correct: 0, attempts: 0 }; });
  }

  return {
    start(selectedMode = '1p', selectedDiff = 'medium', p1Name = 'Commander 1', p2Name = 'Commander 2') {
      mode = selectedMode;
      difficulty = DIFFICULTY_RULES[selectedDiff] ? selectedDiff : 'medium';
      const rule = DIFFICULTY_RULES[difficulty];
      isRunning = true;
      roundNumber = 0;
      currentCityPoints = 100;
      usedJokersThisRound = { region: false, clue: false, eliminate: false };
      stats = { correct: 0, wrong: 0, regionJokers: 0, clueJokers: 0, eliminateJokers: 0 };
      resetRegionStats();

      if (mode === '1p') {
        score = 0;
        timeLeft = 90;
        lives = rule.lives;
        jokersLeft = rule.jokers;
        skipsLeft = 2;
        streak = 0;
        maxStreak = 0;
        wrongBuffer = 0;
      } else {
        currentQuestion2P = 0;
        activePlayerIdx = 0;
        timeLeft = 60;
        turnAttemptsLeft = 3;
        players = [
          { name: p1Name || 'Commander 1', troops: 0, cities: 0, wrong: 0, jokers: rule.jokers, streak: 0 },
          { name: p2Name || 'Commander 2', troops: 0, cities: 0, wrong: 0, jokers: rule.jokers, streak: 0 }
        ];
      }
      return rule;
    },
    nextRound() {
      roundNumber += 1;
      currentCityPoints = 100;
      usedJokersThisRound = { region: false, clue: false, eliminate: false };
      if (mode === '2p') {
        currentQuestion2P += 1;
        if (currentQuestion2P > totalQuestions2P) {
          isRunning = false;
          return false;
        }
        activePlayerIdx = (currentQuestion2P - 1) % 2;
        timeLeft = 60;
        turnAttemptsLeft = 3;
      }
      return true;
    },
    useJoker(type) {
      if (!isRunning || usedJokersThisRound[type]) return false;
      const available = mode === '1p' ? jokersLeft : players[activePlayerIdx].jokers;
      if (available !== Infinity && available <= 0) return false;

      usedJokersThisRound[type] = true;
      if (mode === '1p') {
        if (jokersLeft !== Infinity) jokersLeft -= 1;
      } else {
        if (players[activePlayerIdx].jokers !== Infinity) players[activePlayerIdx].jokers -= 1;
      }
      currentCityPoints = Math.max(20, currentCityPoints - 20);

      if (type === 'region') stats.regionJokers += 1;
      if (type === 'clue') stats.clueJokers += 1;
      if (type === 'eliminate') stats.eliminateJokers += 1;
      return true;
    },
    useSkip() {
      if (mode !== '1p' || !isRunning || skipsLeft <= 0) return false;
      skipsLeft -= 1;
      streak = 0;
      timeLeft = Math.max(0, timeLeft - 5);
      if (timeLeft === 0) isRunning = false;
      return true;
    },
    recordCorrect(regionName) {
      stats.correct += 1;
      if (regionStats[regionName]) {
        regionStats[regionName].correct += 1;
        regionStats[regionName].attempts += 1;
      }

      if (mode === '1p') {
        streak += 1;
        if (streak > maxStreak) maxStreak = streak;
        let comboBonus = 0, timeBonus = 0;
        if (streak > 0 && streak % 3 === 0) {
          comboBonus = 25;
          timeBonus = 5;
          timeLeft += timeBonus;
        }
        const totalGained = currentCityPoints + comboBonus;
        score += totalGained;
        if (score > highScore) {
          highScore = score;
          localStorage.setItem('turkiye_81_v2_highscore', highScore);
        }
        return { gained: totalGained, comboBonus, timeBonus, streak };
      } else {
        const p = players[activePlayerIdx];
        p.cities += 1;
        p.streak += 1;
        const comboBonus = (p.streak >= 2) ? 25 : 0;
        const totalTroops = currentCityPoints + comboBonus;
        p.troops += totalTroops;
        return { gained: totalTroops, comboBonus, timeBonus: 0, streak: p.streak, playerIdx: activePlayerIdx };
      }
    },
    recordWrong(regionName) {
      stats.wrong += 1;
      if (regionStats[regionName]) regionStats[regionName].attempts += 1;

      if (mode === '1p') {
        streak = 0;
        const rule = DIFFICULTY_RULES[difficulty];
        let lostLife = false;
        if (rule.timePenalty > 0) timeLeft = Math.max(0, timeLeft - rule.timePenalty);
        if (rule.wrongsPerLife === 1) {
          lives = Math.max(0, lives - 1);
          lostLife = true;
        } else {
          wrongBuffer += 1;
          if (wrongBuffer >= rule.wrongsPerLife) {
            wrongBuffer = 0;
            lives = Math.max(0, lives - 1);
            lostLife = true;
          }
        }
        if (lives === 0 || timeLeft === 0) isRunning = false;
        return { lostLife, timePenalty: rule.timePenalty, wrongBuffer, wrongsPerLife: rule.wrongsPerLife, turnEnded: false };
      } else {
        const p = players[activePlayerIdx];
        p.wrong += 1;
        p.streak = 0;
        turnAttemptsLeft = Math.max(0, turnAttemptsLeft - 1);
        const turnEnded = turnAttemptsLeft === 0;
        return { lostLife: false, timePenalty: 0, turnAttemptsLeft, turnEnded };
      }
    },
    tick() {
      timeLeft = Math.max(0, timeLeft - 1);
      if (mode === '1p') {
        if (timeLeft === 0) isRunning = false;
        return { turnTimeout: false };
      } else {
        return { turnTimeout: timeLeft === 0 };
      }
    },
    stop() {
      isRunning = false;
    },
    getState() {
      const rule = DIFFICULTY_RULES[difficulty];
      return {
        mode, difficulty, diffLabel: rule.label, isRunning,
        score, timeLeft, lives, jokersLeft, skipsLeft, streak, maxStreak,
        roundNumber, wrongBuffer, wrongsPerLife: rule.wrongsPerLife,
        currentCityPoints, usedJokersThisRound: { ...usedJokersThisRound },
        complexClues: rule.complexClues, stats: { ...stats },
        regionStats: JSON.parse(JSON.stringify(regionStats)),
        highScore,
        // 2P
        totalQuestions2P, currentQuestion2P, activePlayerIdx, turnAttemptsLeft,
        players: players.map(p => ({ ...p }))
      };
    }
  };
}

const engine = createCityHuntEngine();

// --- Embedded Fallback GeoJSON ---
const FALLBACK_CITIES = {"type": "FeatureCollection", "name": "Turkey_81_Provinces_GeoGame", "features": [{"type": "Feature", "properties": {"id": "tr_01", "plate": 1, "name": "Adana", "region": "Mediterranean", "cluesEasy": ["World-famous for its spicy kebab and turnip juice.", "The historic Stone Bridge crosses the Seyhan River.", "Its heart is the fertile cotton fields of the Çukurova plain."], "cluesHard": ["The Varda (German) Bridge lies in this province's Karaisalı district.", "The Sabancı Central Mosque rises on the riverbank.", "The Orange Blossom Carnival is held here every spring."], "extraClue": "Its plate code is 01 and it lies in the Mediterranean Region."}, "geometry": {"type": "Point", "coordinates": [35.3213, 37.0]}}, {"type": "Feature", "properties": {"id": "tr_02", "plate": 2, "name": "Adıyaman", "region": "Southeastern Anatolia", "cluesEasy": ["Mount Nemrut, famous for its giant statues, is here.", "Atatürk Dam Lake forms its southern border.", "Known for its raw meatballs (çiğ köfte) and the harfane tradition."], "cluesHard": ["Home to the grand tumulus of the Commagene Kingdom.", "The Roman-era Cendere Bridge still stands.", "The ancient cities of Arsameia and Perre lie within its borders."], "extraClue": "The mountain best known for its sunrise and sunset views is here."}, "geometry": {"type": "Point", "coordinates": [38.2786, 37.7648]}}, {"type": "Feature", "properties": {"id": "tr_03", "plate": 3, "name": "Afyonkarahisar", "region": "Aegean", "cluesEasy": ["Famous for its clotted cream (kaymak), sausage and Turkish delight.", "One of the capitals of thermal spa tourism.", "Known for the steep castle rising from the middle of the city."], "cluesHard": ["Kocatepe, where the Great Offensive began, lies within this province.", "Recognized worldwide for its marble beds and marble exports.", "Home to key rock monuments of the Phrygian Valley."], "extraClue": "Located in the inner Aegean, at a crossroads of western Anatolian highways."}, "geometry": {"type": "Point", "coordinates": [30.5387, 38.7507]}}, {"type": "Feature", "properties": {"id": "tr_04", "plate": 4, "name": "Ağrı", "region": "Eastern Anatolia", "cluesEasy": ["Turkey's highest mountain lies within this province.", "The İshak Pasha Palace is in the Doğubayazıt district.", "The Gürbulak Border Gate with Iran is here."], "cluesHard": ["A meteor crater and a formation called the Noah's Ark site are here.", "Diyadin hot springs and Lake Balık are important natural assets.", "One of Turkey's coldest provinces in winter."], "extraClue": "Gives its name to the 5,137-metre summit."}, "geometry": {"type": "Point", "coordinates": [43.0503, 39.7191]}}, {"type": "Feature", "properties": {"id": "tr_05", "plate": 5, "name": "Amasya", "region": "Black Sea", "cluesEasy": ["Famous for its Misket apples.", "Known for the Yalıboyu houses along the Yeşilırmak River.", "The Royal Rock Tombs carved into the cliffs are here."], "cluesHard": ["Called the 'City of Princes' in Ottoman history.", "The famed geographer Strabo was born in this ancient city.", "An important circular was issued here on 22 June 1919."], "extraClue": "Set in a narrow river valley in the inland part of the Central Black Sea."}, "geometry": {"type": "Point", "coordinates": [35.8353, 40.6499]}}, {"type": "Feature", "properties": {"id": "tr_06", "plate": 6, "name": "Ankara", "region": "Central Anatolia", "cluesEasy": ["The capital of the Republic of Turkey.", "Anıtkabir and the Grand National Assembly are in this city.", "Known for its Angora goat and Angora cat."], "cluesHard": ["The Museum of Anatolian Civilizations sits at the foot of the historic citadel.", "The ancient city of Gordion and the Midas Mound are in its western district.", "Built on a steppe plateau between the Kızılırmak and Sakarya basins."], "extraClue": "Kızılay Square and Atakule are at this city's heart."}, "geometry": {"type": "Point", "coordinates": [32.8597, 39.9334]}}, {"type": "Feature", "properties": {"id": "tr_07", "plate": 7, "name": "Antalya", "region": "Mediterranean", "cluesEasy": ["Known as the tourism capital of Turkey.", "Düden Waterfalls and Kaleiçi are here.", "The Ancient Theatre of Aspendos lies within this province."], "cluesHard": ["Has a wide gulf stretching between the Taurus Mountains and the Mediterranean.", "The eastern section of the Lycian Way passes through it.", "A leading national centre for greenhouse farming and citrus."], "extraClue": "The districts of Alanya, Kaş and Kemer belong to it."}, "geometry": {"type": "Point", "coordinates": [30.7133, 36.8969]}}, {"type": "Feature", "properties": {"id": "tr_08", "plate": 8, "name": "Artvin", "region": "Black Sea", "cluesEasy": ["Famous for Borçka Karagöl and the Şavşat highlands.", "Giant dams stand on the Çoruh River.", "The Sarp Border Gate with Georgia is in this province."], "cluesHard": ["The Kafkasör Bull Wrestling Festival is held every summer.", "Mençuna Waterfall and Hatila Valley National Park are here.", "A forest-rich province in Turkey's far northeastern corner."], "extraClue": "The easternmost province of the Eastern Black Sea."}, "geometry": {"type": "Point", "coordinates": [41.8183, 41.1828]}}, {"type": "Feature", "properties": {"id": "tr_09", "plate": 9, "name": "Aydın", "region": "Aegean", "cluesEasy": ["Known worldwide for its dried figs.", "The resorts of Kuşadası and Didim are in this province.", "Set on the fertile soils of the Büyük Menderes Plain."], "cluesHard": ["The ancient city of Aphrodisias is a UNESCO World Heritage site.", "The ancient cities of Miletus and Priene lie within its borders.", "One of the deepest-rooted centres of Zeybek and efe culture."], "extraClue": "An Aegean province between İzmir and Muğla."}, "geometry": {"type": "Point", "coordinates": [27.8416, 37.856]}}, {"type": "Feature", "properties": {"id": "tr_10", "plate": 10, "name": "Balıkesir", "region": "Marmara", "cluesEasy": ["Has coastlines on both the Marmara and Aegean seas.", "Ayvalık, Cunda Island and the Kaz Mountains are here.", "Famous for höşmerim dessert and olive oil."], "cluesHard": ["Manyas Bird Paradise National Park lies within this province.", "Travellers stop for its Susurluk ayran and toasted sandwiches.", "The Avşa and Marmara islands belong to it."], "extraClue": "Its plate code is 10."}, "geometry": {"type": "Point", "coordinates": [27.8826, 39.6484]}}, {"type": "Feature", "properties": {"id": "tr_11", "plate": 11, "name": "Bilecik", "region": "Marmara", "cluesEasy": ["The Söğüt district, where the Ottoman State was founded, is here.", "The Tomb of Sheikh Edebali is in the city centre.", "The Bozüyük district is an important industrial and transport hub."], "cluesHard": ["Said to be the only province with land in four different geographic regions of Turkey.", "The Sakarya River passes through a large part of the province.", "Harmankaya Canyon is popular for outdoor sports."], "extraClue": "Located between Bursa, Eskişehir and Sakarya."}, "geometry": {"type": "Point", "coordinates": [29.9799, 40.1451]}}, {"type": "Feature", "properties": {"id": "tr_12", "plate": 12, "name": "Bingöl", "region": "Eastern Anatolia", "cluesEasy": ["Famous for the Floating Islands nature monument.", "Kale Hill, the best spot to watch the sunrise, is here.", "Takes its name from the many glacial lakes around it."], "cluesHard": ["The Murat River and Peri Stream are its major waterways.", "Hesarek Ski Centre serves winter tourism.", "Known in the region for its kavurma and honey."], "extraClue": "Located between Elazığ, Muş and Erzurum."}, "geometry": {"type": "Point", "coordinates": [40.4966, 38.8855]}}, {"type": "Feature", "properties": {"id": "tr_13", "plate": 13, "name": "Bitlis", "region": "Eastern Anatolia", "cluesEasy": ["Lake Nemrut Crater lies within this province.", "The Ahlat Seljuk Cemetery is on UNESCO's tentative list.", "Famous for its büryan kebab and its five minarets."], "cluesHard": ["The Tatvan district on Lake Van's western shore belongs to it.", "El-Aman Inn is one of Anatolia's largest caravanserais.", "Known for heavy snowfall in winter."], "extraClue": "Located southwest of Lake Van."}, "geometry": {"type": "Point", "coordinates": [42.1095, 38.4006]}}, {"type": "Feature", "properties": {"id": "tr_14", "plate": 14, "name": "Bolu", "region": "Black Sea", "cluesEasy": ["Abant and Yedigöller National Park are here.", "The Mengen district is known for its famous chefs.", "Kartalkaya Ski Centre is a favourite for winter tourism."], "cluesHard": ["The Köroğlu Mountains stretch across the south of the province.", "The main highway tunnel between Istanbul and Ankara takes its name from here.", "Gölcük Nature Park is known for its postcard-perfect lake house."], "extraClue": "In the Western Black Sea, northwest of Ankara."}, "geometry": {"type": "Point", "coordinates": [31.6061, 40.735]}}, {"type": "Feature", "properties": {"id": "tr_15", "plate": 15, "name": "Burdur", "region": "Mediterranean", "cluesEasy": ["Lake Salda, called Turkey's Maldives, is here.", "One of the key provinces of the Lakes District.", "Known for walnut paste and şiş köfte."], "cluesHard": ["The ancient cities of Sagalassos and Kibyra lie within its borders.", "İnsuyu Cave is among Turkey's first caves opened to tourism.", "Stands out in cattle farming and dairy production."], "extraClue": "Located between Isparta and Denizli."}, "geometry": {"type": "Point", "coordinates": [30.2908, 37.7203]}}, {"type": "Feature", "properties": {"id": "tr_16", "plate": 16, "name": "Bursa", "region": "Marmara", "cluesEasy": ["Famous for İskender kebab and candied chestnuts.", "The Uludağ winter tourism centre is here.", "One of the first capitals of the Ottoman State."], "cluesHard": ["The Green Tomb and Grand Mosque make up the historic fabric of this province.", "A key stop on the historic silk trade in Anatolia.", "The village of Cumalıkızık is a UNESCO World Heritage site."], "extraClue": "Its plate code is 16 and it lies in the south of Marmara."}, "geometry": {"type": "Point", "coordinates": [29.061, 40.1885]}}, {"type": "Feature", "properties": {"id": "tr_17", "plate": 17, "name": "Çanakkale", "region": "Marmara", "cluesEasy": ["The ancient city of Troy and the Trojan Horse are here.", "The Gallipoli Peninsula and the Martyrs' Memorial are in this province.", "Has land on both the Asian and European continents."], "cluesHard": ["Bozcaada and Gökçeada are within its borders.", "Host to the naval and land battles of 1915 that changed world history.", "The ancient city of Assos and the Temple of Athena are on its southern coast."], "extraClue": "Gives its name to the strait connecting the Marmara and Aegean seas."}, "geometry": {"type": "Point", "coordinates": [26.4142, 40.1553]}}, {"type": "Feature", "properties": {"id": "tr_18", "plate": 18, "name": "Çankırı", "region": "Central Anatolia", "cluesEasy": ["Famous for its giant Salt Cave, thousands of years old.", "The southern slopes of Mount Ilgaz lie within this province.", "Its Yaren culture is on UNESCO's intangible heritage list."], "cluesHard": ["The Stone Mosque (Taş Mescit) is an important Anatolian Seljuk-era work.", "Located just northeast of Ankara.", "Rock salt production plays a major role in its economy."], "extraClue": "Located between Ankara, Kastamonu and Çorum."}, "geometry": {"type": "Point", "coordinates": [33.6134, 40.6013]}}, {"type": "Feature", "properties": {"id": "tr_19", "plate": 19, "name": "Çorum", "region": "Black Sea", "cluesEasy": ["Famous across Turkey for its roasted chickpeas (leblebi).", "Hattusa, capital of the Hittite Empire, is here.", "The Alacahöyük archaeological site is within this province."], "cluesHard": ["İskilip dolması is the most special dish of its traditional cuisine.", "Osmancık rice is grown in the Kızılırmak basin.", "Lies in the transition zone between Central Anatolia and the Central Black Sea."], "extraClue": "Its plate code is 19 and it was the Hittite capital."}, "geometry": {"type": "Point", "coordinates": [34.9556, 40.5506]}}, {"type": "Feature", "properties": {"id": "tr_20", "plate": 20, "name": "Denizli", "region": "Aegean", "cluesEasy": ["Pamukkale, famous for its white travertines, is here.", "Symbolized by its long-crowing rooster.", "Turkey's leader in textile and towel production."], "cluesHard": ["The ancient cities of Hierapolis and Laodicea are in this province.", "Its thermal waters have been used as healing centres since antiquity.", "Located in the inner Aegean, in the corridor leading to the Mediterranean."], "extraClue": "The Pamukkale travertines are 20 km north of this city."}, "geometry": {"type": "Point", "coordinates": [29.0875, 37.7765]}}, {"type": "Feature", "properties": {"id": "tr_21", "plate": 21, "name": "Diyarbakır", "region": "Southeastern Anatolia", "cluesEasy": ["Its historic black basalt walls and Hevsel Gardens are on the UNESCO list.", "Symbolized by its giant watermelons.", "The Ten-Eyed Bridge over the Tigris is here."], "cluesHard": ["Its Grand Mosque is considered one of the oldest in the Islamic world.", "Hasan Pasha Inn and Zerzevan Castle are important historic structures.", "One of Southeastern Anatolia's greatest cultural centres."], "extraClue": "Its plate code is 21."}, "geometry": {"type": "Point", "coordinates": [40.2306, 37.9144]}}, {"type": "Feature", "properties": {"id": "tr_22", "plate": 22, "name": "Edirne", "region": "Marmara", "cluesEasy": ["Selimiye Mosque, Mimar Sinan's masterpiece, is here.", "The Kırkpınar Oil Wrestling Festival is held here every year.", "A border city famous for its fried liver (tava ciğeri)."], "cluesHard": ["The Meriç and Tunca rivers pass through the city centre.", "Has land border gates to Greece and Bulgaria.", "Karaağaç train station is known for its historic architecture."], "extraClue": "A Thracian province at Turkey's far northwestern tip."}, "geometry": {"type": "Point", "coordinates": [26.5557, 41.6771]}}, {"type": "Feature", "properties": {"id": "tr_23", "plate": 23, "name": "Elazığ", "region": "Eastern Anatolia", "cluesEasy": ["The historic Harput Castle stands on a hill overlooking the city.", "Keban Dam Lake and Lake Hazar are in this province.", "Known for the Çayda Çıra folk dance and orcik."], "cluesHard": ["Lies in the Euphrates basin and is nicknamed the 'Land of the Gakgoş'.", "Its cherry-red marble is world famous.", "The Öküzgözü grape is an important crop of this area."], "extraClue": "Located between Malatya, Tunceli and Diyarbakır."}, "geometry": {"type": "Point", "coordinates": [39.2264, 38.681]}}, {"type": "Feature", "properties": {"id": "tr_24", "plate": 24, "name": "Erzincan", "region": "Eastern Anatolia", "cluesEasy": ["Famous for tulum cheese and copperwork.", "Girlevik Waterfall and Dark Canyon are here.", "The Kemaliye district is known for its historic stone houses."], "cluesHard": ["The Karasu (Euphrates) River flows through its fertile plain.", "Ergan Mountain Ski Centre hosts winter sports.", "A planned city lying on the North Anatolian Fault Line."], "extraClue": "Located between Erzurum and Sivas."}, "geometry": {"type": "Point", "coordinates": [39.5, 39.75]}}, {"type": "Feature", "properties": {"id": "tr_25", "plate": 25, "name": "Erzurum", "region": "Eastern Anatolia", "cluesEasy": ["Famous for cağ kebab and kadayıf dolması.", "Palandöken Ski Centre is here.", "The Twin Minaret Madrasa is the city's symbol."], "cluesHard": ["Hosted the historic congress on 23 July 1919.", "Known for Oltu stone prayer beads and jewellery.", "One of Turkey's highest-altitude metropolitan cities."], "extraClue": "Its plate code is 25 and it has hosted winter games."}, "geometry": {"type": "Point", "coordinates": [41.2769, 39.9043]}}, {"type": "Feature", "properties": {"id": "tr_26", "plate": 26, "name": "Eskişehir", "region": "Central Anatolia", "cluesEasy": ["A student city famous for the Porsuk Stream and its gondolas.", "Famous for meerschaum carving and çibörek.", "The colourful historic houses of Odunpazarı are here."], "cluesHard": ["Turkey's first domestic automobile, the Devrim, was built here.", "An important intersection of High-Speed Train lines.", "Stands out for the castle in Sazova Science, Culture and Art Park."], "extraClue": "A province west of Ankara with plate code 26."}, "geometry": {"type": "Point", "coordinates": [30.5206, 39.7767]}}, {"type": "Feature", "properties": {"id": "tr_27", "plate": 27, "name": "Gaziantep", "region": "Southeastern Anatolia", "cluesEasy": ["A world-famous gastronomy city known for baklava and pistachios.", "The Zeugma Mosaic Museum and the 'Gypsy Girl' mosaic are here.", "Earned the title 'Gazi' for its resistance in the War of Independence."], "cluesHard": ["Rumkale rises on a peninsula formed by the Euphrates River.", "The Coppersmiths' Bazaar is a living centre of traditional crafts.", "Beyran soup and katmer are staples of its local cuisine."], "extraClue": "The most populous industrial and commercial city of Southeastern Anatolia."}, "geometry": {"type": "Point", "coordinates": [37.3781, 37.0662]}}, {"type": "Feature", "properties": {"id": "tr_28", "plate": 28, "name": "Giresun", "region": "Black Sea", "cluesEasy": ["Known as the homeland of hazelnuts and cherries.", "The only island in the Black Sea that has ever been settled (Giresun Island) is here.", "Famous for the Kümbet and Kulakkaya highlands."], "cluesHard": ["Blue Lake and Kuzalan Waterfall are among its natural beauties.", "In antiquity, the cherry spread to the world from this city.", "A coastal province between Ordu and Trabzon."], "extraClue": "Its plate code is 28."}, "geometry": {"type": "Point", "coordinates": [38.3895, 40.9128]}}, {"type": "Feature", "properties": {"id": "tr_29", "plate": 29, "name": "Gümüşhane", "region": "Black Sea", "cluesEasy": ["Famous for pestil and köme (fruit leather).", "Karaca Cave is known for its stalactite formations.", "The Zigana Pass lies on its northern border."], "cluesHard": ["The Santa Ruins and Tomara Waterfall are important sights.", "Takes its name from the silver mines worked throughout history.", "Inland in the Eastern Black Sea, south of Trabzon."], "extraClue": "Located between Bayburt and Trabzon."}, "geometry": {"type": "Point", "coordinates": [39.4814, 40.46]}}, {"type": "Feature", "properties": {"id": "tr_30", "plate": 30, "name": "Hakkari", "region": "Eastern Anatolia", "cluesEasy": ["Famous for the glacial lakes of the Cilo and Sat mountains.", "Turkey's southeasternmost province.", "The Zap River flows through deep valleys."], "cluesHard": ["The Yüksekova district is known for its wide high plateau.", "The natural habitat of the inverted tulip (weeping bride).", "A mountainous province bordering Iraq and Iran."], "extraClue": "Its plate code is 30."}, "geometry": {"type": "Point", "coordinates": [43.7408, 37.5744]}}, {"type": "Feature", "properties": {"id": "tr_31", "plate": 31, "name": "Hatay", "region": "Mediterranean", "cluesEasy": ["A UNESCO gastronomy city famed for künefe and a rich cuisine.", "The Asi (Orontes) River flows through the city centre.", "Turkey's southernmost province."], "cluesHard": ["The world's first lit street, Herod (Kurtuluş) Street, is here.", "St. Pierre Church and the Titus Tunnel are important historic structures.", "The Habib-i Neccar Mosque is considered one of Anatolia's oldest."], "extraClue": "Its central district is Antakya and its major port district is İskenderun."}, "geometry": {"type": "Point", "coordinates": [36.1604, 36.2023]}}, {"type": "Feature", "properties": {"id": "tr_32", "plate": 32, "name": "Isparta", "region": "Mediterranean", "cluesEasy": ["World-famous for its rose gardens, rose oil and carpets.", "Lake Eğirdir and Lake Kovada lie within this province.", "The lavender-scented village of Kuyucak is here."], "cluesHard": ["Davraz Ski Centre serves winter tourism.", "Yazılı Canyon and the ancient city of Pisidian Antioch are here.", "Ranks among Turkey's top apple producers."], "extraClue": "In the Lakes District, just north of Antalya."}, "geometry": {"type": "Point", "coordinates": [30.5566, 37.7648]}}, {"type": "Feature", "properties": {"id": "tr_33", "plate": 33, "name": "Mersin", "region": "Mediterranean", "cluesEasy": ["Tantuni and cezerye are this city's signature flavours.", "Kızkalesi, the castle in the middle of the sea, is here.", "Home to one of Turkey's largest container ports."], "cluesHard": ["The Heaven and Hell sinkholes are near Silifke.", "Anamur bananas grow on its western coast.", "Tarsus Waterfall and the Cave of the Seven Sleepers are here."], "extraClue": "A Mediterranean port city formerly named İçel."}, "geometry": {"type": "Point", "coordinates": [34.6415, 36.8121]}}, {"type": "Feature", "properties": {"id": "tr_34", "plate": 34, "name": "İstanbul", "region": "Marmara", "cluesEasy": ["A metropolis linking two continents.", "Hagia Sophia, Topkapı Palace and the Galata Tower are here.", "Turkey's most populous city."], "cluesHard": ["Served as capital to three great empires.", "A natural waterway splits the city into two sides.", "Its Historic Peninsula is a UNESCO World Heritage site."], "extraClue": "The Bosphorus and the Maiden's Tower are among this city's best-known symbols."}, "geometry": {"type": "Point", "coordinates": [28.9784, 41.0082]}}, {"type": "Feature", "properties": {"id": "tr_35", "plate": 35, "name": "İzmir", "region": "Aegean", "cluesEasy": ["Known for the Konak Clock Tower and the Kordon waterfront.", "A coastal city famous for boyoz and kumru.", "The ancient city of Ephesus lies within this province."], "cluesHard": ["An important port city known in antiquity as Smyrna.", "The windsurfing centres of Çeşme and Alaçatı are here.", "Hosts an international fair every year."], "extraClue": "The largest and most populous city of the Aegean Region."}, "geometry": {"type": "Point", "coordinates": [27.1428, 38.4237]}}, {"type": "Feature", "properties": {"id": "tr_36", "plate": 36, "name": "Kars", "region": "Eastern Anatolia", "cluesEasy": ["The final stop of the Eastern Express.", "Famous for kashar cheese, gruyère and goose meat.", "The Ruins of Ani lie within this province."], "cluesHard": ["Lake Çıldır freezes solid in winter, hosting sleigh rides.", "Its Baltic-style stone buildings set it apart from other Anatolian provinces.", "Sarıkamış is a major ski destination with its crystal snow."], "extraClue": "On the Armenian border, in the northeast of Eastern Anatolia."}, "geometry": {"type": "Point", "coordinates": [43.0975, 40.6013]}}, {"type": "Feature", "properties": {"id": "tr_37", "plate": 37, "name": "Kastamonu", "region": "Black Sea", "cluesEasy": ["Famous for Taşköprü garlic and çekme helva.", "Valla Canyon and Ilıca Waterfall are here.", "İnebolu, the starting point of the Independence Road, belongs to it."], "cluesHard": ["The Mahmut Bey Mosque, built without nails, is on the UNESCO list.", "The northern part of Ilgaz Mountain National Park is here.", "A historic province with extensive forests in the Western Black Sea."], "extraClue": "Located between Sinop and Bartın/Karabük."}, "geometry": {"type": "Point", "coordinates": [33.7827, 41.3887]}}, {"type": "Feature", "properties": {"id": "tr_38", "plate": 38, "name": "Kayseri", "region": "Central Anatolia", "cluesEasy": ["World-famous for its pastırma, sucuk and mantı.", "Mount Erciyes and its ski centre rise south of the city.", "One of Central Anatolia's most developed industrial and trade centres."], "cluesHard": ["Kültepe (Kanesh-Karum) hosts some of Anatolia's oldest written tablets.", "The Gevher Nesibe Medical Complex was a medical centre of the Seljuk era.", "Kapuzbaşı Waterfalls lie at the foot of the Aladağlar."], "extraClue": "Its plate code is 38."}, "geometry": {"type": "Point", "coordinates": [35.4787, 38.7312]}}, {"type": "Feature", "properties": {"id": "tr_39", "plate": 39, "name": "Kırklareli", "region": "Marmara", "cluesEasy": ["İğneada Longoz Forests National Park is here.", "Known for hardaliye drink and its meatballs.", "The Dereköy Border Gate with Bulgaria is in this province."], "cluesHard": ["Dupnisa Cave is the only cave in Thrace open to tourism.", "The Yıldız (Strandzha) Mountains cover the north of the province.", "The Lüleburgaz district is an important industrial and cultural centre."], "extraClue": "A Thracian province between Edirne and Tekirdağ/İstanbul."}, "geometry": {"type": "Point", "coordinates": [27.2167, 41.7333]}}, {"type": "Feature", "properties": {"id": "tr_40", "plate": 40, "name": "Kırşehir", "region": "Central Anatolia", "cluesEasy": ["The tomb of Ahi Evran, founder of the Ahi organization, is here.", "The hometown of bozlak master Neşet Ertaş.", "The Cacabey Madrasa served as an astronomical observatory in its day."], "cluesHard": ["Lake Seyfe Bird Paradise lies in the east of the province.", "Kaman walnuts are its best-known farm product.", "Lies within the great bend of the Kızılırmak."], "extraClue": "Located between Ankara, Nevşehir and Yozgat."}, "geometry": {"type": "Point", "coordinates": [34.1709, 39.1425]}}, {"type": "Feature", "properties": {"id": "tr_41", "plate": 41, "name": "Kocaeli", "region": "Marmara", "cluesEasy": ["An industrial capital famous for its pişmaniye.", "The Gulf of İzmit and the Osmangazi Bridge are here.", "Kartepe Ski Centre and Maşukiye are nature tourism spots."], "cluesHard": ["Has coastlines on both the Black Sea and the Marmara Sea.", "The Gebze district is one of Turkey's largest technology and industrial hubs.", "The SEKA Paper Museum and Clock Tower are in the city centre."], "extraClue": "The immediate eastern neighbour of İstanbul."}, "geometry": {"type": "Point", "coordinates": [29.9408, 40.7654]}}, {"type": "Feature", "properties": {"id": "tr_42", "plate": 42, "name": "Konya", "region": "Central Anatolia", "cluesEasy": ["Known for the Mevlana Museum and Sema ceremonies.", "Famous for its etli ekmek.", "Turkey's largest province by area."], "cluesHard": ["Served as capital of the Anatolian Seljuk State for a long time.", "Çatalhöyük, one of the oldest Neolithic settlements, is here.", "With its wide grain plains, it is considered the country's breadbasket."], "extraClue": "Has vast lands south and west of Lake Tuz."}, "geometry": {"type": "Point", "coordinates": [32.4846, 37.8746]}}, {"type": "Feature", "properties": {"id": "tr_43", "plate": 43, "name": "Kütahya", "region": "Aegean", "cluesEasy": ["The centre of Turkey's tile and porcelain art.", "The Temple of Zeus in the ancient city of Aizanoi is here.", "The Dumlupınar Martyrs' Memorial is within this province."], "cluesHard": ["The ancient city said to have hosted the world's first stock exchange is in this province.", "Very rich in boron mineral deposits.", "Stands out in inner Western Anatolia for its thermal springs."], "extraClue": "Neighbours Eskişehir, Afyonkarahisar and Bursa."}, "geometry": {"type": "Point", "coordinates": [29.9833, 39.4167]}}, {"type": "Feature", "properties": {"id": "tr_44", "plate": 44, "name": "Malatya", "region": "Eastern Anatolia", "cluesEasy": ["The world's apricot capital.", "Arslantepe Mound is a UNESCO World Heritage site.", "Günpınar Waterfall in Darende is here."], "cluesHard": ["Tributaries of the Euphrates and Karakaya Dam Lake pass along its east.", "Levent Valley has striking geological rock formations.", "The historic Seljuk Grand Mosque stands in the Battalgazi district."], "extraClue": "Located in the west of Eastern Anatolia, with plate code 44."}, "geometry": {"type": "Point", "coordinates": [38.3095, 38.3552]}}, {"type": "Feature", "properties": {"id": "tr_45", "plate": 45, "name": "Manisa", "region": "Aegean", "cluesEasy": ["The Mesir Paste Festival is held here every year.", "Mount Spil National Park and its wild horses are here.", "The centre of Sultana seedless grapes."], "cluesHard": ["Sardis, capital of the Lydian Kingdom, lies within this province.", "Kula Volcanic Geopark is Turkey's first UNESCO geopark.", "Many Ottoman princes served as governors here."], "extraClue": "The immediate northeastern neighbour of İzmir."}, "geometry": {"type": "Point", "coordinates": [27.4289, 38.6191]}}, {"type": "Feature", "properties": {"id": "tr_46", "plate": 46, "name": "Kahramanmaraş", "region": "Mediterranean", "cluesEasy": ["World-famous for its pounded ice cream and red pepper.", "Earned the title 'Kahraman' for its struggle in the War of Independence.", "Called a city of literature and poets."], "cluesHard": ["The sources of the Ceyhan River and the Menzelet Dam are here.", "Ancient Germanicia mosaics were unearthed in the city centre.", "Lies at the junction of the Mediterranean, Eastern Anatolia and Southeastern Anatolia."], "extraClue": "Its plate code is 46."}, "geometry": {"type": "Point", "coordinates": [36.9371, 37.5858]}}, {"type": "Feature", "properties": {"id": "tr_47", "plate": 47, "name": "Mardin", "region": "Southeastern Anatolia", "cluesEasy": ["Famous for its yellow stone houses overlooking the Mesopotamian plain.", "Known for filigree silverwork and almond candy.", "The Midyat district is famous for its historic mansions."], "cluesHard": ["The Deyrulzafaran and Mor Gabriel monasteries are in this province.", "The giant water cisterns of the ancient city of Dara lie to its east.", "Said to be a promenade by day and a necklace of lights by night."], "extraClue": "A hilltop stone city between Şanlıurfa and Şırnak."}, "geometry": {"type": "Point", "coordinates": [40.735, 37.3122]}}, {"type": "Feature", "properties": {"id": "tr_48", "plate": 48, "name": "Muğla", "region": "Aegean", "cluesEasy": ["The holiday havens of Bodrum, Marmaris and Fethiye are here.", "Ölüdeniz and Butterfly Valley lie in this province.", "The province with Turkey's longest coastline."], "cluesHard": ["Bears traces of the ancient Carian and Lycian civilizations.", "Holds a major share of the world's pine honey production.", "The Datça Peninsula and ancient Knidos are in its southwest."], "extraClue": "The southwestern-corner province where the Aegean meets the Mediterranean."}, "geometry": {"type": "Point", "coordinates": [28.3665, 37.2153]}}, {"type": "Feature", "properties": {"id": "tr_49", "plate": 49, "name": "Muş", "region": "Eastern Anatolia", "cluesEasy": ["The plain where the 1071 Battle of Manzikert was won lies within this province.", "Famous for the tulips that cover the plain in spring.", "The historic Murat Bridge is one of the city's key symbols."], "cluesHard": ["The Murat River flows through its wide, fertile plain.", "Located inland in Eastern Anatolia, west of Lake Van.", "Its plain and headscarf are the subjects of many folk songs."], "extraClue": "Neighbours Bitlis, Bingöl and Erzurum."}, "geometry": {"type": "Point", "coordinates": [41.5064, 38.7432]}}, {"type": "Feature", "properties": {"id": "tr_50", "plate": 50, "name": "Nevşehir", "region": "Central Anatolia", "cluesEasy": ["World-famous for fairy chimneys and hot air balloons.", "The centre of the Cappadocia region.", "The underground cities of Derinkuyu and Kaymaklı are here."], "cluesHard": ["Formed by the erosion of volcanic tuff from Mount Erciyes and Mount Hasan.", "Göreme Open-Air Museum is known for its rock-cut churches.", "In the Avanos district, pottery is made from Kızılırmak clay."], "extraClue": "Ürgüp and Uçhisar are this province's most touristic places."}, "geometry": {"type": "Point", "coordinates": [34.7122, 38.6244]}}, {"type": "Feature", "properties": {"id": "tr_51", "plate": 51, "name": "Niğde", "region": "Central Anatolia", "cluesEasy": ["Aladağlar National Park is a favourite of mountaineers.", "Among Turkey's top producers of potatoes and apples.", "The Gümüşler Monastery and its smiling Virgin Mary fresco are here."], "cluesHard": ["The ancient city of Tyana and the Roman Pool are at Kemerhisar.", "Close to the southern passes linking Central Anatolia to the Mediterranean.", "The Alâeddin Mosque is a rare example of Seljuk stonework."], "extraClue": "Located between Nevşehir, Aksaray and Adana."}, "geometry": {"type": "Point", "coordinates": [34.6833, 37.9667]}}, {"type": "Feature", "properties": {"id": "tr_52", "plate": 52, "name": "Ordu", "region": "Black Sea", "cluesEasy": ["The province that produces the most hazelnuts in Turkey.", "Its cable car up Boztepe offers panoramic views.", "Famous for the meanders on the Perşembe Plateau."], "cluesHard": ["The Yason Cape Peninsula and its historic church are on the coast.", "Ünye and Fatsa are the biggest coastal districts.", "Its airport, built on reclaimed sea, is shared with Giresun."], "extraClue": "A Black Sea province between Samsun and Giresun."}, "geometry": {"type": "Point", "coordinates": [37.8764, 40.9839]}}, {"type": "Feature", "properties": {"id": "tr_53", "plate": 53, "name": "Rize", "region": "Black Sea", "cluesEasy": ["Supplies most of Turkey's tea production.", "Ayder Plateau and the Fırtına Stream are here.", "The province with the highest rainfall in Turkey."], "cluesHard": ["Zilkale is a medieval castle rising above a steep valley.", "Kaçkar Mountains National Park is a favourite of hikers.", "Anzer honey is produced on its high plateaus."], "extraClue": "A lush green Black Sea province between Trabzon and Artvin."}, "geometry": {"type": "Point", "coordinates": [40.5177, 41.0201]}}, {"type": "Feature", "properties": {"id": "tr_54", "plate": 54, "name": "Sakarya", "region": "Marmara", "cluesEasy": ["Lake Sapanca and Acarlar Floodplain Forest are within this province.", "Famous for ıslama köfte and pumpkin dessert.", "Its central settlement is known as Adapazarı."], "cluesHard": ["The Justinian (Beşköprü) Bridge dates from the Byzantine era.", "Karasu beach is among the longest sandy shores on the Black Sea coast.", "An important centre of the automotive and railway-wagon industry."], "extraClue": "Located between Kocaeli and Düzce."}, "geometry": {"type": "Point", "coordinates": [30.3781, 40.7569]}}, {"type": "Feature", "properties": {"id": "tr_55", "plate": 55, "name": "Samsun", "region": "Black Sea", "cluesEasy": ["The city where the War of Independence began on 19 May 1919.", "The Bandırma Steamship Museum is located here.", "The most populous city of the Black Sea Region."], "cluesHard": ["The Kızılırmak and Yeşilırmak deltas lie on its coasts.", "The Bafra and Çarşamba plains are fertile farmland.", "The Monument of Honour rises in the park at the city centre."], "extraClue": "On the Central Black Sea coast, famous for its pide."}, "geometry": {"type": "Point", "coordinates": [36.33, 41.2867]}}, {"type": "Feature", "properties": {"id": "tr_56", "plate": 56, "name": "Siirt", "region": "Southeastern Anatolia", "cluesEasy": ["Famous for büryan kebab, perde pilavı and pistachios.", "The Tillo district and İsmail Fakirullah's 'light phenomenon' are here.", "Botan Valley National Park is known for its deep canyon."], "cluesHard": ["The Tomb of Veysel Karani is in the Baykan district.", "Mohair blankets are a symbol of traditional crafts.", "The Botan Stream, a key tributary of the Tigris, flows through it."], "extraClue": "Located between Batman, Bitlis and Şırnak."}, "geometry": {"type": "Point", "coordinates": [41.95, 37.9333]}}, {"type": "Feature", "properties": {"id": "tr_57", "plate": 57, "name": "Sinop", "region": "Black Sea", "cluesEasy": ["İnceburun, Turkey's northernmost point, is here.", "Known for its Historic Prison Museum and natural harbour.", "Hamsilos Fjord and Erfelek Tatlıca Waterfalls are here."], "cluesHard": ["The city where the ancient philosopher Diogenes was born.", "Known as a calm Black Sea city without traffic lights.", "Famous for its mantı and kotra (wooden boat) model-making."], "extraClue": "On a peninsula jutting into the sea, between Samsun and Kastamonu."}, "geometry": {"type": "Point", "coordinates": [35.1531, 42.0231]}}, {"type": "Feature", "properties": {"id": "tr_58", "plate": 58, "name": "Sivas", "region": "Central Anatolia", "cluesEasy": ["The congress that was a turning point of the National Struggle was held here on 4 September 1919.", "The Divriği Great Mosque and Hospital are on the UNESCO World Heritage list.", "World-famous for the Kangal shepherd dog."], "cluesHard": ["The Kızılırmak rises in this province's İmranlı district.", "The Twin Minaret Madrasa and Blue Madrasa are in the city centre.", "Turkey's second-largest province by area."], "extraClue": "Its plate code is 58."}, "geometry": {"type": "Point", "coordinates": [37.0179, 39.7477]}}, {"type": "Feature", "properties": {"id": "tr_59", "plate": 59, "name": "Tekirdağ", "region": "Marmara", "cluesEasy": ["Famous for its meatballs and sunflower fields.", "A Thracian province on the Marmara Sea coast.", "Şarköy is known for viticulture and grape production."], "cluesHard": ["The city where patriot poet Namık Kemal was born and has a museum.", "The house where Hungarian Prince Rákóczi spent his exile is now a museum.", "Çorlu and Çerkezköy are important industrial districts."], "extraClue": "West of İstanbul, on the Marmara coast."}, "geometry": {"type": "Point", "coordinates": [27.5167, 40.9833]}}, {"type": "Feature", "properties": {"id": "tr_60", "plate": 60, "name": "Tokat", "region": "Black Sea", "cluesEasy": ["Famous for stuffed grape leaves, kebab and hand-printed fabrics.", "Ballıca Cave is one of the world's largest caves.", "Niksar and Zile are known for their historic castles."], "cluesHard": ["Zile, where Julius Caesar is said to have declared 'I came, I saw, I conquered', is here.", "The Taşhan and Blue Madrasa are Anatolian Seljuk and Ottoman heritage.", "Has fertile plains in the Yeşilırmak basin."], "extraClue": "Located between Amasya, Sivas and Ordu."}, "geometry": {"type": "Point", "coordinates": [36.55, 40.3167]}}, {"type": "Feature", "properties": {"id": "tr_61", "plate": 61, "name": "Trabzon", "region": "Black Sea", "cluesEasy": ["Sümela Monastery clings to a steep cliff face.", "The natural wonder of Uzungöl lies within this province.", "Identified with anchovy, kuymak and horon dance culture."], "cluesHard": ["The Atatürk Pavilion sits on the Soğuksu ridges.", "Was one of the busiest Black Sea ports of the historic Silk Road.", "Boztepe offers panoramic views of the city and the sea."], "extraClue": "The largest city of the Eastern Black Sea, with plate code 61."}, "geometry": {"type": "Point", "coordinates": [39.7168, 41.0027]}}, {"type": "Feature", "properties": {"id": "tr_62", "plate": 62, "name": "Tunceli", "region": "Eastern Anatolia", "cluesEasy": ["Famous for Munzur Valley National Park and its springs.", "The Ovacık district is known for its natural highlands and organic farming.", "Pertek Castle stands on an island in Keban Dam Lake."], "cluesHard": ["The province with Turkey's lowest population density.", "Pülümür Valley and the Munzur Stream have rafting routes.", "Its red-spotted trout is an endemic treasure of the region."], "extraClue": "Located between Elazığ, Erzincan and Bingöl."}, "geometry": {"type": "Point", "coordinates": [39.5401, 39.1079]}}, {"type": "Feature", "properties": {"id": "tr_63", "plate": 63, "name": "Şanlıurfa", "region": "Southeastern Anatolia", "cluesEasy": ["Göbeklitepe, the oldest temple in human history, is here.", "Balıklıgöl is the city's best-known visiting spot.", "Famous for çiğ köfte, isot pepper and sıra nights."], "cluesHard": ["The conical-domed mudbrick houses of Harran lie in its southern plain.", "The minaret of Halfeti's submerged mosque rises from the Euphrates.", "Throughout history called the 'City of Prophets'."], "extraClue": "Its plate code is 63 and it lies on the Syrian border."}, "geometry": {"type": "Point", "coordinates": [38.7955, 37.1674]}}, {"type": "Feature", "properties": {"id": "tr_64", "plate": 64, "name": "Uşak", "region": "Aegean", "cluesEasy": ["Ulubey Canyon, the world's second-largest canyon, is here.", "The Karun Treasure is displayed in the Archaeology Museum in this province.", "Famous for tarhana and hand-woven carpets."], "cluesHard": ["One of Turkey's first sugar factories was founded here.", "Clandras Bridge is a historic structure from the Phrygian era.", "In the inner Aegean, on the İzmir–Ankara highway."], "extraClue": "Located between Manisa, Afyonkarahisar and Denizli."}, "geometry": {"type": "Point", "coordinates": [29.4082, 38.6823]}}, {"type": "Feature", "properties": {"id": "tr_65", "plate": 65, "name": "Van", "region": "Eastern Anatolia", "cluesEasy": ["Gives its name to Turkey's largest lake.", "World-famous for its cat with differently coloured eyes.", "Famous for its rich breakfast and herbed cheese."], "cluesHard": ["Akdamar Island and its historic church lie on the lake's south.", "Tushpa, capital of the Urartian Kingdom, was founded here.", "Muradiye Waterfall lies in the province's northeast."], "extraClue": "On the Iranian border, on the eastern shore of a soda lake."}, "geometry": {"type": "Point", "coordinates": [43.38, 38.5012]}}, {"type": "Feature", "properties": {"id": "tr_66", "plate": 66, "name": "Yozgat", "region": "Central Anatolia", "cluesEasy": ["Famous for testi kebab and arabaşı soup.", "Çamlık National Park, Turkey's first national park, is here.", "The historic Clock Tower is a symbol of the city square."], "cluesHard": ["The Roman Bath (Basilica Therma) in Sarıkaya is an ancient thermal complex.", "Set on the Bozok Plateau of Central Anatolia.", "The Çapanoğlu Mosque is an example of Baroque-influenced Ottoman architecture."], "extraClue": "East of Ankara, between Kırıkkale and Sivas."}, "geometry": {"type": "Point", "coordinates": [34.8147, 39.8181]}}, {"type": "Feature", "properties": {"id": "tr_67", "plate": 67, "name": "Zonguldak", "region": "Black Sea", "cluesEasy": ["The capital of Turkey's hard coal mining.", "Gökgöl Cave and Cehennemağzı Caves are here.", "The Ereğli district is known for its iron and steel industry and strawberries."], "cluesHard": ["The Devrek walking stick is a world-famous traditional craft.", "The ancient city of Filyos (Tieion) and a natural gas port are in this province.", "The first settlement made a province after the Republic was proclaimed."], "extraClue": "On the Western Black Sea coast, between Bartın and Düzce."}, "geometry": {"type": "Point", "coordinates": [31.7987, 41.4564]}}, {"type": "Feature", "properties": {"id": "tr_68", "plate": 68, "name": "Aksaray", "region": "Central Anatolia", "cluesEasy": ["Ihlara Valley lies within this province.", "Mount Hasan rises as a majestic volcano south of the city.", "Known for the Malaklı shepherd dog."], "cluesHard": ["Sultanhanı Caravanserai is Anatolia's largest Seljuk inn.", "The Crooked Minaret (Eğri Minare) is the city centre's best-known historic structure.", "Located on the southeastern shore of Lake Tuz."], "extraClue": "Located between Konya and Nevşehir."}, "geometry": {"type": "Point", "coordinates": [34.037, 38.3687]}}, {"type": "Feature", "properties": {"id": "tr_69", "plate": 69, "name": "Bayburt", "region": "Black Sea", "cluesEasy": ["The Baksı Museum blends contemporary art and traditional culture.", "The Çoruh River winds through the city centre.", "One of Turkey's least populated provinces."], "cluesHard": ["The Dede Korkut Culture and Art Festivals are held here every year.", "Known for the Aydıntepe Underground City and its historic castle.", "A pass between Erzurum and Gümüşhane/Trabzon."], "extraClue": "Its plate code is 69."}, "geometry": {"type": "Point", "coordinates": [40.2249, 40.2552]}}, {"type": "Feature", "properties": {"id": "tr_70", "plate": 70, "name": "Karaman", "region": "Central Anatolia", "cluesEasy": ["The city where Karamanoğlu Mehmet Bey declared Turkish the official language.", "A leading Turkish centre for biscuit and wafer production.", "Known for the Taşkale Granaries carved into rock."], "cluesHard": ["The ruins of Binbir Kilise (Thousand and One Churches) lie at the foot of Karadağ.", "Mentioned as one of the places holding the tomb of Yunus Emre.", "South of Konya, at the northern foot of the Taurus Mountains."], "extraClue": "Located between Konya and Mersin."}, "geometry": {"type": "Point", "coordinates": [33.2287, 37.1759]}}, {"type": "Feature", "properties": {"id": "tr_71", "plate": 71, "name": "Kırıkkale", "region": "Central Anatolia", "cluesEasy": ["Known for the defence industry (MKE) and an oil refinery.", "The Kızılırmak River flows west of the city.", "The immediate eastern neighbour of Ankara."], "cluesHard": ["A strategic junction on the road route of 43 provinces.", "The Weapons Industry Museum is in the city centre.", "Çeşnigir Bridge is a historic Seljuk-era bridge."], "extraClue": "Its plate code is 71."}, "geometry": {"type": "Point", "coordinates": [33.5153, 39.8468]}}, {"type": "Feature", "properties": {"id": "tr_72", "plate": 72, "name": "Batman", "region": "Southeastern Anatolia", "cluesEasy": ["The historic settlement of Hasankeyf lies within this province.", "Raman Mountain, where Turkey's first oil was extracted, is here.", "The Tigris River flows through the south of the province."], "cluesHard": ["The eastern end of the Malabadi Bridge borders this province.", "Stands out for its young population and modern urban planning.", "Located between Diyarbakır, Siirt and Mardin."], "extraClue": "A Southeastern province founded around an oil refinery."}, "geometry": {"type": "Point", "coordinates": [41.1351, 37.8812]}}, {"type": "Feature", "properties": {"id": "tr_73", "plate": 73, "name": "Şırnak", "region": "Southeastern Anatolia", "cluesEasy": ["Mount Cudi and the Habur Border Gate lie within this province.", "The Cizre district is a historic centre on the Tigris.", "Borders Iraq and Syria."], "cluesHard": ["The land where the renowned scholar Al-Jazari lived.", "Kasrik Gorge and the Finik archaeological site hold historic ruins.", "One of the easternmost provinces of Southeastern Anatolia."], "extraClue": "Neighbours Mardin, Siirt and Hakkari."}, "geometry": {"type": "Point", "coordinates": [42.4611, 37.5164]}}, {"type": "Feature", "properties": {"id": "tr_74", "plate": 74, "name": "Bartın", "region": "Black Sea", "cluesEasy": ["The Amasra district is world-famous for its castle and salad.", "The Bartın Stream, navigable by ships, is here.", "The western part of Küre Mountains National Park is in this province."], "cluesHard": ["İnkumu Beach is among the longest shores of the Western Black Sea.", "The Güzelcehisar Lava Columns are a natural formation millions of years old.", "Located between Zonguldak and Kastamonu."], "extraClue": "Its plate code is 74."}, "geometry": {"type": "Point", "coordinates": [32.3375, 41.6344]}}, {"type": "Feature", "properties": {"id": "tr_75", "plate": 75, "name": "Ardahan", "region": "Eastern Anatolia", "cluesEasy": ["Most of Lake Çıldır lies within this province.", "Known for kashar cheese, flower honey and the Damal doll.", "The Kura River flows through the city centre."], "cluesHard": ["Şeytan Castle rises on steep cliffs.", "The Türkgözü and Aktaş border gates with Georgia are here.", "A high-plateau province in the far northeast of Eastern Anatolia."], "extraClue": "Located between Kars and Artvin."}, "geometry": {"type": "Point", "coordinates": [42.7022, 41.1105]}}, {"type": "Feature", "properties": {"id": "tr_76", "plate": 76, "name": "Iğdır", "region": "Eastern Anatolia", "cluesEasy": ["Known as the Çukurova of the East; apricots and cotton grow here.", "The city where Mount Ağrı appears clearest and most majestic.", "Borders three countries (Armenia, Nakhchivan/Azerbaijan, Iran)."], "cluesHard": ["Turkey's easternmost point, the Dilucu Border Gate, is in this province.", "The Tuzluca Salt Caves are visited for health tourism.", "Thanks to its microclimate, it is much milder than its surroundings."], "extraClue": "The only province in Turkey bordering 3 different countries."}, "geometry": {"type": "Point", "coordinates": [44.0333, 39.9167]}}, {"type": "Feature", "properties": {"id": "tr_77", "plate": 77, "name": "Yalova", "region": "Marmara", "cluesEasy": ["Thermal springs and Atatürk's Walking Pavilion are here.", "Turkey's smallest province by area.", "On the Marmara Sea coast, very close to İstanbul by ferry."], "cluesHard": ["Sudüşen Waterfall and Karaca Arboretum are important natural areas.", "The Çınarcık district is known for summer-holiday tourism.", "Has land borders with Kocaeli and Bursa."], "extraClue": "Its plate code is 77."}, "geometry": {"type": "Point", "coordinates": [29.2667, 40.65]}}, {"type": "Feature", "properties": {"id": "tr_78", "plate": 78, "name": "Karabük", "region": "Black Sea", "cluesEasy": ["The UNESCO World Heritage Safranbolu houses lie within this province.", "Turkey's first iron and steel factory (KARDEMİR) was founded here.", "Famous for saffron and Turkish delight."], "cluesHard": ["The Crystal Glass Terrace and Tokatlı Canyon are popular sights.", "Yenice Forests have been named a biodiversity 'hot spot'.", "Located inland in the Western Black Sea."], "extraClue": "Neighbours Zonguldak, Bartın and Kastamonu."}, "geometry": {"type": "Point", "coordinates": [32.6204, 41.2061]}}, {"type": "Feature", "properties": {"id": "tr_79", "plate": 79, "name": "Kilis", "region": "Southeastern Anatolia", "cluesEasy": ["Famous for tava dishes, cennet çamuru dessert and olive oil.", "The Öncüpınar Border Gate with Syria is here.", "Located just south of Gaziantep."], "cluesHard": ["Ravanda Castle and Oylum Mound are important archaeological sites.", "Stands out for its historic stone mansions and narrow streets.", "A small-area border province strong in grape and olive production."], "extraClue": "Its plate code is 79."}, "geometry": {"type": "Point", "coordinates": [37.1212, 36.7184]}}, {"type": "Feature", "properties": {"id": "tr_80", "plate": 80, "name": "Osmaniye", "region": "Mediterranean", "cluesEasy": ["Turkey's capital of peanut production.", "Karatepe-Aslantaş Open-Air Museum is here.", "A transition point between Adana and Gaziantep."], "cluesHard": ["The ancient city of Kastabala (Hierapolis) is known for its colonnaded street.", "The Amanos (Nur) Mountains form the province's eastern border.", "Zorkun Plateau is a favourite for cooling off in summer."], "extraClue": "Its plate code is 80."}, "geometry": {"type": "Point", "coordinates": [36.2478, 37.0742]}}, {"type": "Feature", "properties": {"id": "tr_81", "plate": 81, "name": "Düzce", "region": "Black Sea", "cluesEasy": ["The 81st and most recent province of Turkey.", "Akçakoca beach and the Genoese Castle are on the Black Sea coast.", "Lake Efteni and Güzeldere Waterfall are natural wonders."], "cluesHard": ["The Ancient Theatre of Konuralp (Prusias ad Hypium) is here.", "The Melen Stream is popular for rafting.", "On the TEM motorway between İstanbul and Ankara."], "extraClue": "Located between Bolu and Sakarya, with plate code 81."}, "geometry": {"type": "Point", "coordinates": [31.1565, 40.8438]}}]};
// (Region highlighting now uses the province borders themselves, so no separate region polygons are needed.)

// --- Leaderboard Manager ---
const LB_KEY = 'turkiye_81_v2_leaderboard';
function getLeaderboard() {
  try { return JSON.parse(localStorage.getItem(LB_KEY)) || []; }
  catch { return []; }
}
function saveToLeaderboard(name, score, diffLabel) {
  if (score <= 0) return;
  const list = getLeaderboard();
  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
  list.push({ name: name || 'Explorer', score, diffLabel, date: dateStr });
  list.sort((a, b) => b.score - a.score);
  localStorage.setItem(LB_KEY, JSON.stringify(list.slice(0, 5)));
}
function renderLeaderboard() {
  const list = getLeaderboard();
  if (!list.length) {
    leaderboardListEl.innerHTML = '<li class="lb-empty">No scores yet. Set the first record!</li>';
    return;
  }
  leaderboardListEl.innerHTML = list.map((item, idx) => `
    <li class="lb-item">
      <span><strong>#${idx + 1}</strong> ${item.name} <span class="lb-meta">(${item.diffLabel} • ${item.date})</span></span>
      <strong>${item.score} pts</strong>
    </li>
  `).join('');
}

// --- Spatial Helpers ---
function normalizeTr(str) {
  return (str || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/â/g, 'a').replace(/[^a-z]/g, '');
}

function getBearingInfo(lat1, lng1, lat2, lng2) {
  const toRad = d => d * Math.PI / 180;
  const toDeg = r => r * 180 / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  const brng = (toDeg(Math.atan2(y, x)) + 360) % 360;
  const dirs = [
    { label: 'North', arrow: '⬆️' }, { label: 'Northeast', arrow: '↗️' },
    { label: 'East', arrow: '➡️' }, { label: 'Southeast', arrow: '↘️' },
    { label: 'South', arrow: '⬇️' }, { label: 'Southwest', arrow: '↙️' },
    { label: 'West', arrow: '⬅️' }, { label: 'Northwest', arrow: '↖️' }
  ];
  return dirs[Math.round(brng / 45) % 8];
}

function getHotColdInfo(distKm) {
  if (distKm < 160) return { text: 'VERY HOT! 🔥', color: '#dc2626' };
  if (distKm < 340) return { text: 'Hot 🌡️', color: '#ea580c' };
  if (distKm < 580) return { text: 'Warm 🌤️', color: '#d97706' };
  return { text: 'Cold ❄️', color: '#2563eb' };
}

// --- Colour helpers ---
const PALETTE = ['#ef4b52', '#3d8bff', '#22c55e', '#f5b83d', '#a855f7', '#ff7a1a', '#14b8a6', '#ec4899'];
let playerColors = ['#ef4b52', '#3d8bff'];
let soloColor = '#2dd4bf';
try {
  const saved = JSON.parse(localStorage.getItem('sehirAvi_colors') || 'null');
  if (Array.isArray(saved) && saved.length === 2 && saved.every(c => /^#[0-9a-f]{6}$/i.test(c))) playerColors = saved;
  const savedSolo = localStorage.getItem('sehirAvi_soloColor');
  if (savedSolo && /^#[0-9a-f]{6}$/i.test(savedSolo)) soloColor = savedSolo;
} catch {}

const hexToRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgbToHex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mixHex = (a, b, k) => { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A.map((v, i) => v + (B[i] - v) * k)); };
const darken = (h, k) => mixHex(h, '#000000', k);
const lighten = (h, k) => mixHex(h, '#ffffff', k);
const colorDist = (a, b) => { const A = hexToRgb(a), B = hexToRgb(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
function hueOf(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) return 210;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
const escapeHtml = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dotHtml = idx => `<i class="dot p${idx + 1}"></i>`;

function applyPlayerColors() {
  const root = document.documentElement.style;
  playerColors.forEach((c, i) => {
    root.setProperty(`--p${i + 1}`, c);
    // Map base tints to the active commander's colour (via hue-rotate)
    root.setProperty(`--p${i + 1}-tile`, `sepia(1) saturate(2.6) hue-rotate(${Math.round(hueOf(c) - 38)}deg) brightness(1.25)`);
  });
  root.setProperty('--solo', soloColor);
  try {
    localStorage.setItem('sehirAvi_colors', JSON.stringify(playerColors));
    localStorage.setItem('sehirAvi_soloColor', soloColor);
  } catch {}
}
applyPlayerColors();

// Continuous distance colour: near = red, far = blue
const HEAT_STOPS = [[0, '#ff1f3d'], [160, '#ff4d2e'], [340, '#ff9f1a'], [520, '#ffd84a'], [720, '#4fc3f7'], [1000, '#2f6fe0'], [1400, '#1c2f95']];
function heatColor(km) {
  if (km <= HEAT_STOPS[0][0]) return HEAT_STOPS[0][1];
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    if (km <= HEAT_STOPS[i][0]) {
      const [d0, c0] = HEAT_STOPS[i - 1], [d1, c1] = HEAT_STOPS[i];
      return mixHex(c0, c1, (km - d0) / (d1 - d0));
    }
  }
  return HEAT_STOPS[HEAT_STOPS.length - 1][1];
}

// --- DOM References ---
const startScreen = document.getElementById('startScreen');
const gameScreen = document.getElementById('gameScreen');
const open1PBtn = document.getElementById('open1PBtn');
const open2PBtn = document.getElementById('open2PBtn');
const openHowToBtn = document.getElementById('openHowToBtn');
const howToOverlay = document.getElementById('howToOverlay');
const setup1POverlay = document.getElementById('setup1POverlay');
const setup2POverlay = document.getElementById('setup2POverlay');
const difficultyOverlay = document.getElementById('difficultyOverlay');
const startOverlays = [howToOverlay, setup1POverlay, setup2POverlay, difficultyOverlay];
const toDiffFrom1PBtn = document.getElementById('toDiffFrom1PBtn');
const toDiffFrom2PBtn = document.getElementById('toDiffFrom2PBtn');
const backToSetupBtn = document.getElementById('backToSetupBtn');
const diffModeSummary = document.getElementById('diffModeSummary');
const howToTabBtns = document.querySelectorAll('.howto-tab-btn');
const rules1P = document.getElementById('rules1P');
const rules2P = document.getElementById('rules2P');
const diffCards = document.querySelectorAll('.diff-card');
const startHighScoreEl = document.getElementById('startHighScore');
const playerNameInput = document.getElementById('playerNameInput');
const p1NameInput = document.getElementById('p1NameInput');
const p2NameInput = document.getElementById('p2NameInput');
const leaderboardListEl = document.getElementById('leaderboardList');
const launchGameBtn = document.getElementById('launchGameBtn');

const activeDiffLabel = document.getElementById('activeDiffLabel');
const stats1P = document.getElementById('stats1P');
const stats2P = document.getElementById('stats2P');
const scoreEl = document.getElementById('scoreDisplay');
const timerBox = document.getElementById('timerBox');
const timeEl = document.getElementById('timeDisplay');
const livesEl = document.getElementById('livesDisplay');
const streakEl = document.getElementById('streakDisplay');
const jokerEl = document.getElementById('jokerDisplay');
const highScoreEl = document.getElementById('highScoreDisplay');

const p1HudBox = document.getElementById('p1HudBox');
const p2HudBox = document.getElementById('p2HudBox');
const p1HudName = document.getElementById('p1HudName');
const p2HudName = document.getElementById('p2HudName');
const p1TroopsDisplay = document.getElementById('p1TroopsDisplay');
const p2TroopsDisplay = document.getElementById('p2TroopsDisplay');
const timerBox2P = document.getElementById('timerBox2P');
const timeDisplay2P = document.getElementById('timeDisplay2P');
const qProgress2P = document.getElementById('qProgress2P');
const jokerDisplay2P = document.getElementById('jokerDisplay2P');

const turnBanner2P = document.getElementById('turnBanner2P');
const turnPlayerName = document.getElementById('turnPlayerName');
const turnAttemptsLeftEl = document.getElementById('turnAttemptsLeft');
const mapStyleBtn = document.getElementById('mapStyleBtn');
const soundToggleBtn = document.getElementById('soundToggleBtn');
const backToMenuBtn = document.getElementById('backToMenuBtn');
const restartInGameBtn = document.getElementById('restartInGameBtn');

const roundBadge = document.getElementById('roundBadge');
const potentialPointsBadge = document.getElementById('potentialPointsBadge');
const clueListEl = document.getElementById('clueList');
const extraClueBox = document.getElementById('extraClueBox');
const extraClueText = document.getElementById('extraClueText');
const jokerCostHint = document.getElementById('jokerCostHint');
const regionJokerBtn = document.getElementById('regionJokerBtn');
const clueJokerBtn = document.getElementById('clueJokerBtn');
const eliminateJokerBtn = document.getElementById('eliminateJokerBtn');
const skipBtn = document.getElementById('skipBtn');
const skipCountDisplay = document.getElementById('skipCountDisplay');
const mapToast = document.getElementById('mapToast');
const mapToastText = document.getElementById('mapToastText');
const conqueredPill = document.getElementById('conqueredPill');
const missCounterPill = document.getElementById('missCounterPill');
const coordBar = document.getElementById('coordBar');
const timeTrack = document.getElementById('timeTrack');
const timeFill = document.getElementById('timeFill');
const turnSplash = document.getElementById('turnSplash');
const spEmblem = document.getElementById('spEmblem');
const spName = document.getElementById('spName');
let lastTurnKey = null;

const gameOverModal = document.getElementById('gameOverModal');
const endTag = document.getElementById('endTag');
const endTitle = document.getElementById('endTitle');
const summaryCards = document.getElementById('summaryCards');
const tabButtons = document.querySelectorAll('.tab-btn');
const barCanvas = document.getElementById('barStatsChart');
const radarCanvas = document.getElementById('radarStatsChart');
const menuAfterGameBtn = document.getElementById('menuAfterGameBtn');
const playAgainBtn = document.getElementById('playAgainBtn');

const battleModal = document.getElementById('battleModal');
const battleTitle = document.getElementById('battleTitle');
const battleP1Name = document.getElementById('battleP1Name');
const battleP2Name = document.getElementById('battleP2Name');
const battleP1Troops = document.getElementById('battleP1Troops');
const battleP2Troops = document.getElementById('battleP2Troops');
const battleP1Cities = document.getElementById('battleP1Cities');
const battleP2Cities = document.getElementById('battleP2Cities');
const battleBarP1 = document.getElementById('battleBarP1');
const battleBarP2 = document.getElementById('battleBarP2');
const battleResultBanner = document.getElementById('battleResultBanner');
const battleCanvas = document.getElementById('battleStatsChart');
const menuAfterBattleBtn = document.getElementById('menuAfterBattleBtn');
const rematchBtn = document.getElementById('rematchBtn');

// --- Map Setup ---
const TURKEY_CENTER = [39.05, 35.15];
const map = L.map('map', { zoomControl: true, minZoom: 5, maxZoom: 9 }).setView(TURKEY_CENTER, 6);

const lightTileLayer = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  { attribution: 'Tiles &copy; Esri', maxZoom: 16 }
);
const satelliteTileLayer = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  { attribution: 'Tiles &copy; Esri World Imagery', maxZoom: 16 }
);
lightTileLayer.addTo(map);
let isSatellite = false;

// Live Latitude / Longitude Coordinate Bar on Mouse Move
map.on('mousemove', (e) => {
  const lat = e.latlng.lat.toFixed(4);
  const lng = e.latlng.lng.toFixed(4);
  coordBar.textContent = `📍 Lat: ${lat}° N | Lng: ${lng}° E`;
});

// --- Runtime State ---
let selectedMode = '1p';
let selectedDifficulty = 'medium';
let citiesList = [];
let cityByNormName = new Map();
let cityMarkers = new Map();
let provinceLayers = new Map();
const conqueredColor = new Map();   // province id -> colour of the commander who conquered it
const heatColorMap = new Map();     // province id -> hot/cold colour of this round's wrong guess
const BASE_POLY = { fillColor: '#3a5078', fillOpacity: 0.42, weight: 1.1, color: '#7f9bc4', dashArray: null };

function refreshProvince(id) {
  const poly = provinceLayers.get(id);
  const m = cityMarkers.get(id);
  if (conqueredColor.has(id)) {
    const c = conqueredColor.get(id);
    if (poly) poly.setStyle({ fillColor: c, fillOpacity: 0.66, weight: 2.2, color: lighten(c, 0.45), dashArray: null });
    if (m) m.setStyle({ fillColor: c, color: '#ffffff', radius: 7.5, weight: 2 });
  } else if (heatColorMap.has(id)) {
    const c = heatColorMap.get(id);
    if (poly) poly.setStyle({ fillColor: c, fillOpacity: 0.62, weight: 2, color: lighten(c, 0.35), dashArray: '5 4' });
    if (m) m.setStyle({ fillColor: c, color: '#ffffff', radius: 7, weight: 2 });
  } else if (regionHighlightIds.has(id)) {
    if (poly) poly.setStyle({ fillColor: '#f5b83d', fillOpacity: 0.3, weight: 2, color: '#ffd98a', dashArray: null });
    if (m) m.setStyle({ radius: 6, fillColor: '#f5b83d', color: '#ffffff', weight: 2 });
  } else {
    if (poly) poly.setStyle(BASE_POLY);
    if (m) m.setStyle({ radius: 5, fillColor: '#f5b83d', color: '#0a1224', weight: 1.5 });
  }
}

// Region Joker: highlight every province of the region, following the real province borders
function highlightRegion(regionName) {
  clearRegionHighlight();
  citiesList.filter(c => c.region === regionName).forEach(c => {
    regionHighlightIds.add(c.id);
    if (!eliminatedIds.has(c.id)) refreshProvince(c.id);
  });
}
function clearRegionHighlight() {
  const ids = [...regionHighlightIds];
  regionHighlightIds.clear();
  ids.forEach(id => refreshProvince(id));
}

function setTipColor(marker, col) {
  const el = marker.getTooltip() && marker.getTooltip().getElement();
  if (el) el.style.setProperty('--tipcol', col);
}
let conqueredIds = new Set();
let eliminatedIds = new Set();
const regionHighlightIds = new Set();   // provinces highlighted by the Region Joker
let wrongPulseLayer = null;
let remainingCityQueue = [];
let currentTarget = null;
let timerInterval = null;
let barChartInstance = null;
let radarChartInstance = null;
let battleChartInstance = null;

// --- Load Datasets ---
async function loadGeoDatasets() {
  try {
    const cRes = await fetch('./data/turkey_cities.geojson');
    initMapData(await cRes.json());
  } catch {
    initMapData(FALLBACK_CITIES);
  }

  try {
    const borderRes = await fetch('https://raw.githubusercontent.com/cihadturhan/tr-geojson/master/geo/tr-cities-utf8.json');
    if (borderRes.ok) addProvinceBorders(await borderRes.json());
  } catch {}
}

function addProvinceBorders(borderGeo) {
  L.geoJSON(borderGeo, {
    style: () => ({
      color: '#7f9bc4',
      weight: 1.1,
      fillColor: '#3a5078',
      fillOpacity: 0.42
    }),
    onEachFeature: (feature, layer) => {
      const rawName = feature.properties.name || feature.properties.NAME_1 || '';
      const matchedCity = cityByNormName.get(normalizeTr(rawName));
      if (matchedCity) {
        provinceLayers.set(matchedCity.id, layer);
        layer.on('mouseover', () => {
          if (engine.getState().isRunning && !eliminatedIds.has(matchedCity.id) && !conqueredIds.has(matchedCity.id)) {
            layer.setStyle({ fillColor: '#f5b83d', fillOpacity: 0.5, weight: 2, color: '#ffd98a' });
          }
        });
        layer.on('mouseout', () => {
          if (!eliminatedIds.has(matchedCity.id)) {
            refreshProvince(matchedCity.id);
          }
        });
        layer.on('click', () => {
          const m = cityMarkers.get(matchedCity.id);
          if (m) handleCityGuess(matchedCity, m);
        });
      }
    }
  }).addTo(map);
  cityMarkers.forEach(m => m.bringToFront());
}

function initMapData(citiesGeo) {
  citiesList = citiesGeo.features.map(f => ({
    ...f.properties,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0]
  }));

  citiesList.forEach(city => {
    cityByNormName.set(normalizeTr(city.name), city);
    const marker = L.circleMarker([city.lat, city.lng], {
      radius: 5, fillColor: '#f5b83d', color: '#0a1224', weight: 1.5, opacity: 1, fillOpacity: 0.92
    }).addTo(map);

    marker.on('mouseover', () => {
      if (engine.getState().isRunning && !eliminatedIds.has(city.id) && !conqueredIds.has(city.id) && !heatColorMap.has(city.id)) {
        marker.setStyle({ radius: 8.5, fillColor: '#ffffff' });
      }
    });
    marker.on('mouseout', () => {
      if (!eliminatedIds.has(city.id)) refreshProvince(city.id);
    });
    marker.on('click', () => handleCityGuess(city, marker));
    cityMarkers.set(city.id, marker);
  });
}

// --- DOM & Visual Helpers ---
function updateHUD() {
  const s = engine.getState();
  startHighScoreEl.textContent = s.highScore;
  conqueredPill.textContent = `✅ Conquered: ${conqueredIds.size} / 81`;

  if (s.mode === '1p') {
    stats1P.classList.remove('hidden');
    stats2P.classList.add('hidden');
    turnBanner2P.classList.add('hidden');
    skipBtn.classList.remove('hidden');

    activeDiffLabel.textContent = `81 Provinces • Single Player • ${s.diffLabel}`;
    scoreEl.textContent = s.score;
    timeEl.textContent = `${s.timeLeft}s`;
    livesEl.textContent = '❤️'.repeat(s.lives) || '💀';
    streakEl.textContent = `🔥 ${s.streak}`;
    jokerEl.textContent = s.jokersLeft === Infinity ? '∞' : s.jokersLeft;
    highScoreEl.textContent = s.highScore;
    roundBadge.textContent = `CITY #${s.roundNumber || 1}`;
    potentialPointsBadge.textContent = `Reward: +${s.currentCityPoints} pts`;
    jokerCostHint.textContent = 'Each joker costs 20 pts';
    skipCountDisplay.textContent = s.skipsLeft;

    timerBox.classList.toggle('timer-urgent', s.isRunning && s.timeLeft <= 10);
    gameScreen.dataset.turn = 'solo';
    timeFill.style.width = Math.max(0, Math.min(100, (s.timeLeft / 90) * 100)) + '%';
    timeTrack.classList.toggle('urgent', s.isRunning && s.timeLeft <= 10);
    if (s.isRunning && s.wrongsPerLife > 1) {
      missCounterPill.textContent = `Miss Counter: ${s.wrongBuffer} / ${s.wrongsPerLife}`;
      missCounterPill.classList.remove('hidden');
    } else {
      missCounterPill.classList.add('hidden');
    }

    const hasJokers = s.isRunning && (s.jokersLeft === Infinity || s.jokersLeft > 0);
    regionJokerBtn.disabled = !hasJokers || s.usedJokersThisRound.region;
    clueJokerBtn.disabled = !hasJokers || s.usedJokersThisRound.clue;
    eliminateJokerBtn.disabled = !hasJokers || s.usedJokersThisRound.eliminate;
    skipBtn.disabled = !s.isRunning || s.skipsLeft <= 0;
  } else {
    stats1P.classList.add('hidden');
    stats2P.classList.remove('hidden');
    turnBanner2P.classList.remove('hidden');
    skipBtn.classList.add('hidden');
    missCounterPill.classList.add('hidden');

    const p1 = s.players[0];
    const p2 = s.players[1];
    const activeP = s.players[s.activePlayerIdx];

    activeDiffLabel.textContent = `81 Provinces • Two-Player Battle • ${s.diffLabel}`;
    p1HudName.textContent = p1.name;
    p2HudName.textContent = p2.name;
    p1TroopsDisplay.textContent = `🛡️ ${p1.troops}`;
    p2TroopsDisplay.textContent = `🛡️ ${p2.troops}`;
    p1HudBox.classList.toggle('active-turn', s.activePlayerIdx === 0);
    p2HudBox.classList.toggle('active-turn', s.activePlayerIdx === 1);

    timeDisplay2P.textContent = `${s.timeLeft}s`;
    timerBox2P.classList.toggle('timer-urgent', s.isRunning && s.timeLeft <= 10);
    qProgress2P.textContent = `${Math.min(s.currentQuestion2P, s.totalQuestions2P)} / ${s.totalQuestions2P}`;
    jokerDisplay2P.textContent = activeP.jokers === Infinity ? '∞' : activeP.jokers;

    // When the turn changes, the whole screen recolours and a banner sweeps across
    const turnKey = `${s.currentQuestion2P}-${s.activePlayerIdx}`;
    gameScreen.dataset.turn = s.activePlayerIdx === 0 ? 'p1' : 'p2';
    timeFill.style.width = Math.max(0, Math.min(100, (s.timeLeft / 60) * 100)) + '%';
    timeTrack.classList.toggle('urgent', s.isRunning && s.timeLeft <= 10);
    if (s.isRunning && turnKey !== lastTurnKey) {
      lastTurnKey = turnKey;
      showTurnSplash(s.activePlayerIdx, activeP.name);
    }

    turnBanner2P.className = `turn-banner ${s.activePlayerIdx === 0 ? 'p1' : 'p2'}`;
    turnBanner2P.innerHTML = `${dotHtml(s.activePlayerIdx)} Turn: <strong>${escapeHtml(activeP.name)}</strong> • Guesses left: <strong>${s.turnAttemptsLeft}</strong>`;

    roundBadge.textContent = `QUESTION ${s.currentQuestion2P} / ${s.totalQuestions2P}`;
    potentialPointsBadge.textContent = `Reward: +${s.currentCityPoints} troops`;
    jokerCostHint.textContent = 'Each joker costs 20 troops';

    const hasJokers = s.isRunning && (activeP.jokers === Infinity || activeP.jokers > 0);
    regionJokerBtn.disabled = !hasJokers || s.usedJokersThisRound.region;
    clueJokerBtn.disabled = !hasJokers || s.usedJokersThisRound.clue;
    eliminateJokerBtn.disabled = !hasJokers || s.usedJokersThisRound.eliminate;
  }
}

function showTurnSplash(idx, name) {
  turnSplash.className = 'turn-splash ' + (idx === 0 ? 'p1' : 'p2');
  spEmblem.innerHTML = dotHtml(idx);
  spName.textContent = name;
  void turnSplash.offsetWidth;            // restart the animation
  turnSplash.classList.add('show');
  soundFX.turn();
}

// Feedback toast shown on top of the map (always visible)
let toastTimer = null;
function setFeedback(text, type = 'neutral') {
  mapToastText.textContent = text;
  mapToast.className = `map-toast ${type}`;
  void mapToast.offsetWidth;                 // restart the animation
  mapToast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => mapToast.classList.remove('show'), type === 'error' ? 5200 : type === 'success' ? 3000 : 4200);
}

function restoreEliminatedCities() {
  eliminatedIds.forEach(id => {
    const m = cityMarkers.get(id);
    if (m && !map.hasLayer(m)) m.addTo(map);
    refreshProvince(id);
  });
  eliminatedIds.clear();
}

function resetConqueredCities() {
  conqueredIds.clear();
  conqueredColor.clear();
  heatColorMap.clear();
  cityMarkers.forEach((m, id) => {
    if (!map.hasLayer(m)) m.addTo(map);
    m.unbindTooltip();
    refreshProvince(id);
  });
}

function clearHeatColors() {
  const ids = [...heatColorMap.keys()];
  heatColorMap.clear();
  ids.forEach(id => {
    if (!conqueredIds.has(id)) {
      const m = cityMarkers.get(id);
      if (m) m.unbindTooltip();
    }
    refreshProvince(id);
  });
}

function clearRoundOverlays() {
  clearRegionHighlight();
  if (wrongPulseLayer) { map.removeLayer(wrongPulseLayer); wrongPulseLayer = null; }
  extraClueBox.classList.add('hidden');
  clearHeatColors();
  restoreEliminatedCities();
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function loadNextCity() {
  clearRoundOverlays();
  const canContinue = engine.nextRound();
  if (!canContinue) {
    endGame();
    return;
  }

  if (remainingCityQueue.length === 0) {
    remainingCityQueue = shuffleArray(citiesList.filter(c => !conqueredIds.has(c.id)));
    if (remainingCityQueue.length === 0) { endGame(); return; }
  }
  currentTarget = remainingCityQueue.pop();

  const s = engine.getState();
  const clues = s.complexClues ? currentTarget.cluesHard : currentTarget.cluesEasy;
  clueListEl.innerHTML = clues
    .map((c, idx) => `<li class="clue-item"><strong>${idx + 1}.</strong> ${c}</li>`)
    .join('');

  updateHUD();
}

// --- Core Gameplay ---
function handleCityGuess(clickedCity, marker) {
  const s = engine.getState();
  if (!s.isRunning || !currentTarget || eliminatedIds.has(clickedCity.id)) return;

  if (clickedCity.id === currentTarget.id) {
    const res = engine.recordCorrect(currentTarget.region);
    conqueredIds.add(currentTarget.id);

    // Color based on mode & player
    let fillCol = soloColor;
    if (s.mode === '2p') fillCol = playerColors[res.playerIdx];

    heatColorMap.delete(currentTarget.id);
    conqueredColor.set(currentTarget.id, fillCol);
    marker.bindTooltip(currentTarget.name, {
      permanent: true, direction: 'top', offset: [0, -6], className: 'conq-tip'
    }).openTooltip();
    setTipColor(marker, darken(fillCol, 0.2));
    refreshProvince(currentTarget.id);

    if (s.mode === '1p') {
      if (res.comboBonus > 0) {
        soundFX.combo();
        setFeedback(`🔥 ${res.streak}x STREAK! ${currentTarget.name} (+${res.gained} pts & +${res.timeBonus} sec!)`, 'success');
      } else {
        soundFX.correct();
        setFeedback(`✅ Correct! ${currentTarget.name} (+${res.gained} pts)`, 'success');
      }
    } else {
      const pName = s.players[res.playerIdx].name;
      if (res.comboBonus > 0) {
        soundFX.combo();
        setFeedback(`🔥 ${pName} conquered ${currentTarget.name}! (+${res.gained} troops — streak bonus!)`, 'success');
      } else {
        soundFX.correct();
        setFeedback(`🛡️ ${pName} conquered ${currentTarget.name}! (+${res.gained} troops)`, 'success');
      }
    }

    setTimeout(() => {
      if (engine.getState().isRunning) loadNextCity();
    }, 450);
  } else {
    soundFX.wrong();
    const distKm = Math.round(
      map.distance([clickedCity.lat, clickedCity.lng], [currentTarget.lat, currentTarget.lng]) / 1000
    );
    const bearing = getBearingInfo(clickedCity.lat, clickedCity.lng, currentTarget.lat, currentTarget.lng);
    const heat = getHotColdInfo(distKm);

    const hc = heatColor(distKm);
    if (!conqueredIds.has(clickedCity.id)) {
      heatColorMap.set(clickedCity.id, hc);
      marker.bindTooltip(`${clickedCity.name} • ${distKm} km`, {
        permanent: true, direction: 'top', offset: [0, -6], className: 'heat-tip'
      }).openTooltip();
      setTipColor(marker, darken(hc, 0.35));
      refreshProvince(clickedCity.id);
    }

    if (wrongPulseLayer) map.removeLayer(wrongPulseLayer);
    wrongPulseLayer = L.circle([clickedCity.lat, clickedCity.lng], {
      radius: 32000, color: hc, fillColor: hc, fillOpacity: 0.25, weight: 2, interactive: false
    }).addTo(map);

    const res = engine.recordWrong(currentTarget.region);
    if (s.mode === '1p') {
      let penaltyText = (res.timePenalty > 0 && res.wrongsPerLife > 1)
        ? (res.lostLife ? ` (-${res.timePenalty} sec & ${res.wrongsPerLife} misses: -1 ❤️!)` : ` (-${res.timePenalty} sec | Miss ${res.wrongBuffer}/${res.wrongsPerLife})`)
        : ' (-1 ❤️)';
      setFeedback(`❌ Not ${clickedCity.name}! The target is ${bearing.arrow} ${bearing.label}, ${distKm} km away (${heat.text})${penaltyText}`, 'error');
      updateHUD();
      if (!engine.getState().isRunning) endGame();
    } else {
      if (res.turnEnded) {
        setFeedback(`❌ Out of guesses! The answer was ${currentTarget.name}. Passing the turn to the other commander...`, 'error');
        updateHUD();
        setTimeout(() => {
          if (engine.getState().isRunning) loadNextCity();
        }, 1000);
      } else {
        setFeedback(`❌ Not ${clickedCity.name}! The target is ${bearing.arrow} ${bearing.label}, ${distKm} km away (${heat.text}) • Guesses left: ${res.turnAttemptsLeft}`, 'error');
        updateHUD();
      }
    }
  }
}

// --- Jokers & Skip ---
function activateRegionJoker() {
  if (!currentTarget || !engine.useJoker('region')) return;
  soundFX.joker();
  highlightRegion(currentTarget.region);
  const unit = engine.getState().mode === '2p' ? 'troops' : 'pts';
  setFeedback(`🗺️ Region Joker: the target city is in the ${currentTarget.region} Region — its provinces are highlighted! (-20 ${unit})`, 'neutral');
  updateHUD();
}

function activateClueJoker() {
  if (!currentTarget || !engine.useJoker('clue')) return;
  soundFX.joker();
  extraClueText.textContent = currentTarget.extraClue;
  extraClueBox.classList.remove('hidden');
  const unit = engine.getState().mode === '2p' ? 'troops' : 'pts';
  setFeedback(`💡 Extra clue unlocked! (-20 ${unit})`, 'neutral');
  updateHUD();
}

function activateEliminateJoker() {
  if (!currentTarget || !engine.useJoker('eliminate')) return;
  soundFX.joker();
  const wrongCities = citiesList.filter(
    c => c.id !== currentTarget.id && !eliminatedIds.has(c.id) && !conqueredIds.has(c.id) && !heatColorMap.has(c.id)
  );
  const shuffled = shuffleArray(wrongCities);
  const count = Math.floor(shuffled.length * 0.65);

  for (let i = 0; i < count; i++) {
    const city = shuffled[i];
    eliminatedIds.add(city.id);
    const m = cityMarkers.get(city.id);
    if (m && map.hasLayer(m)) map.removeLayer(m);
    const poly = provinceLayers.get(city.id);
    if (poly) poly.setStyle({ fillColor: '#1a2540', fillOpacity: 0.12, weight: 0.5, color: '#3a4a6a' });
  }
  const unit = engine.getState().mode === '2p' ? 'troops' : 'pts';
  setFeedback(`✂️ Eliminate Joker: ${count} wrong cities removed from the map! (-20 ${unit})`, 'neutral');
  updateHUD();
}

function handleSkip() {
  if (!currentTarget || !engine.useSkip()) return;
  soundFX.joker();
  const skippedName = currentTarget.name;
  updateHUD();
  if (!engine.getState().isRunning) { endGame(); return; }
  setFeedback(`⏭️ Skipped! The previous city was ${skippedName} (-5 sec)`, 'neutral');
  loadNextCity();
}

// --- Lifecycle & Modals ---
function showStartScreen() {
  BattleFX.stop();
  mapToast.classList.remove('show');
  clearInterval(timerInterval);
  engine.stop();
  clearRoundOverlays();
  gameOverModal.classList.add('hidden');
  battleModal.classList.add('hidden');
  gameScreen.classList.add('hidden');
  startScreen.classList.remove('hidden');
  closeAllStartOverlays();
  renderLeaderboard();
  updateHUD();
}

function startGame() {
  BattleFX.stop();
  lastTurnKey = null;
  turnSplash.classList.remove('show');
  clearInterval(timerInterval);
  clearRoundOverlays();
  resetConqueredCities();

  startScreen.classList.add('hidden');
  gameOverModal.classList.add('hidden');
  battleModal.classList.add('hidden');
  gameScreen.classList.remove('hidden');

  setTimeout(() => {
    map.invalidateSize();
    map.setView(TURKEY_CENTER, 6);
  }, 60);

  engine.start(
    selectedMode,
    selectedDifficulty,
    p1NameInput.value.trim() || 'Commander 1',
    p2NameInput.value.trim() || 'Commander 2'
  );
  remainingCityQueue = shuffleArray(citiesList);
  setFeedback(
    selectedMode === '2p'
      ? `⚔️ Two-player conquest has begun! ${p1NameInput.value.trim() || 'Commander 1'} goes first — you have 60 seconds!`
      : 'Game on! Read the clues and click the right province on the map.',
    'neutral'
  );
  loadNextCity();

  timerInterval = setInterval(() => {
    const tickRes = engine.tick();
    const s = engine.getState();
    if (s.isRunning && s.timeLeft <= 10 && s.timeLeft > 0) soundFX.tick();
    updateHUD();

    if (s.mode === '1p' && !s.isRunning) {
      endGame();
    } else if (s.mode === '2p' && tickRes.turnTimeout) {
      soundFX.wrong();
      setFeedback(`⏰ Time's up! The answer was ${currentTarget.name}. The turn passes to the other commander!`, 'error');
      loadNextCity();
    }
  }, 1000);
}

function endGame() {
  clearInterval(timerInterval);
  engine.stop();
  updateHUD();

  const s = engine.getState();
  if (s.mode === '2p') {
    showBattleFinale(s);
    return;
  }

  soundFX.gameOver();
  const playerName = playerNameInput.value.trim() || 'Explorer';
  saveToLeaderboard(playerName, s.score, s.diffLabel);
  renderLeaderboard();

  const total = s.stats.correct + s.stats.wrong;
  const accuracy = total > 0 ? Math.round((s.stats.correct / total) * 100) : 0;

  endTag.textContent = s.lives === 0 ? 'OUT OF LIVES' : "TIME'S UP";
  endTitle.textContent = s.stats.correct >= 8 ? '🏆 Impressive Geography Skills!' : '🏁 Tour of Turkey Complete!';

  summaryCards.innerHTML = `
    <div class="summary-card"><span>Total Score</span><strong>${s.score}</strong></div>
    <div class="summary-card"><span>Cities Found</span><strong>${s.stats.correct}</strong></div>
    <div class="summary-card"><span>Best Streak</span><strong>🔥 ${s.maxStreak}</strong></div>
    <div class="summary-card"><span>Accuracy</span><strong>${accuracy}%</strong></div>
  `;

  tabButtons.forEach(b => b.classList.toggle('active', b.dataset.tab === 'bar'));
  barCanvas.classList.remove('hidden');
  radarCanvas.classList.add('hidden');
  gameOverModal.classList.remove('hidden');
  render1PCharts(s.stats, s.regionStats);
}

function showBattleFinale(s) {
  const p1 = s.players[0];
  const p2 = s.players[1];
  const fmt = n => `${Math.round(n)} Troops`;

  battleP1Name.textContent = p1.name;
  battleP2Name.textContent = p2.name;
  battleP1Troops.textContent = fmt(p1.troops);
  battleP2Troops.textContent = fmt(p2.troops);
  battleP1Cities.textContent = `${p1.cities} cities conquered • ${p1.wrong} misses`;
  battleP2Cities.textContent = `${p2.cities} cities conquered • ${p2.wrong} misses`;
  battleBarP1.style.width = '100%';
  battleBarP2.style.width = '100%';
  battleTitle.className = '';
  battleTitle.textContent = 'Armies Face Off!';
  battleResultBanner.classList.remove('hidden');
  battleResultBanner.textContent = '⚔️ The armies take the field...';
  document.getElementById('battleResults').classList.add('hidden');
  document.getElementById('battleSkipBtn').classList.remove('hidden');
  gameOverModal.classList.add('hidden');
  battleModal.classList.remove('hidden');
  soundFX.battle();

  let lastPhase = 'intro';
  BattleFX.start({
    p1: { name: p1.name, troops: p1.troops, color: playerColors[0], dark: darken(playerColors[0], 0.45) },
    p2: { name: p2.name, troops: p2.troops, color: playerColors[1], dark: darken(playerColors[1], 0.45) },
    onClash: () => soundFX.clash(),
    onUpdate: ({ phase, f1, f2 }) => {
      battleP1Troops.textContent = fmt(p1.troops * f1);
      battleP2Troops.textContent = fmt(p2.troops * f2);
      battleBarP1.style.width = (f1 * 100) + '%';
      battleBarP2.style.width = (f2 * 100) + '%';
      if (phase !== lastPhase) {
        lastPhase = phase;
        if (phase === 'clash') {
          battleTitle.textContent = '⚔️ BATTLE!';
          battleResultBanner.textContent = '🔥 The armies clash...';
        } else if (phase === 'end') {
          const w = p1.troops > p2.troops ? p1 : p2.troops > p1.troops ? p2 : null;
          battleTitle.className = 'victory';
          battleTitle.textContent = w ? `🏆 VICTORY: ${w.name}!` : '🤝 DRAW!';
          battleResultBanner.textContent = w
            ? `${w.name}'s army stands with ${Math.abs(p1.troops - p2.troops)} troops left!`
            : 'Both armies were evenly matched — nobody prevailed!';
          soundFX.victory();
        }
      }
    },
    onFinish: (winner) => showBattleResults(s, winner)
  });
}

function showBattleResults(s, winner) {
  const p1 = s.players[0];
  const p2 = s.players[1];
  document.getElementById('battleSkipBtn').classList.add('hidden');
  battleResultBanner.classList.add('hidden');
  const wp = winner === 0 ? p1 : winner === 1 ? p2 : null;
  document.getElementById('battleTrophy').textContent = wp ? '🏆' : '🤝';
  document.getElementById('battleResultTitle').textContent = wp ? `${wp.name} Wins!` : "It's a Draw!";
  document.getElementById('battleResultLine').textContent = wp
    ? `${p1.troops} troops faced ${p2.troops} troops — a margin of ${Math.abs(p1.troops - p2.troops)} decided the battle.`
    : 'Both armies fielded the same number of troops.';
  const col = (pl, cls, win) => `
    <div class="vs-col ${cls} ${win ? 'winner' : ''}">
      <h3>${dotHtml(cls === 'p1' ? 0 : 1)} ${escapeHtml(pl.name)}</h3>
      <div class="big">${pl.troops}</div>
      <small>troops</small>
      <small>${pl.cities} cities • ${pl.wrong} misses</small>
    </div>`;
  document.getElementById('battleVersus').innerHTML =
    col(p1, 'p1', winner === 0) + '<div class="vs-mid">VS</div>' + col(p2, 'p2', winner === 1);
  document.getElementById('battleResults').classList.remove('hidden');

  if (battleChartInstance) battleChartInstance.destroy();
  battleChartInstance = new Chart(battleCanvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['Troops Gathered', 'Cities Conquered (x20)', 'Wrong Guesses (x20)'],
      datasets: [
        { label: p1.name, data: [p1.troops, p1.cities * 20, p1.wrong * 20], backgroundColor: playerColors[0], borderRadius: 6 },
        { label: p2.name, data: [p2.troops, p2.cities * 20, p2.wrong * 20], backgroundColor: playerColors[1], borderRadius: 6 }
      ]
    },
    options: {
      responsive: true,
      scales: { y: { beginAtZero: true, ticks: { color: '#9fb0cc' } }, x: { ticks: { color: '#e6edf9' } } }
    }
  });
}

function render1PCharts(st, regionStats) {
  if (barChartInstance) barChartInstance.destroy();
  if (radarChartInstance) radarChartInstance.destroy();

  barChartInstance = new Chart(barCanvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['Correct', 'Wrong', 'Region Joker', 'Extra Clue', 'Eliminate Joker'],
      datasets: [{
        data: [st.correct, st.wrong, st.regionJokers, st.clueJokers, st.eliminateJokers],
        backgroundColor: ['#2dd4bf', '#ef4b52', '#f5b83d', '#ffcf70', '#8b9cff'],
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1, color: '#9fb0cc' } },
        x: { ticks: { color: '#e6edf9' }, grid: { display: false } }
      },
      plugins: { legend: { display: false } }
    }
  });

  const regLabels = Object.keys(regionStats);
  const regAccuracy = regLabels.map(r => {
    const item = regionStats[r];
    return item.attempts > 0 ? Math.round((item.correct / item.attempts) * 100) : 0;
  });

  radarChartInstance = new Chart(radarCanvas.getContext('2d'), {
    type: 'radar',
    data: {
      labels: regLabels,
      datasets: [{
        label: 'Region Accuracy (%)',
        data: regAccuracy,
        backgroundColor: 'rgba(245, 184, 61, 0.25)',
        borderColor: '#f5b83d',
        pointBackgroundColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      scales: {
        r: {
          beginAtZero: true, max: 100,
          ticks: { stepSize: 25, color: '#9fb0cc', backdropColor: 'transparent' },
          grid: { color: 'rgba(160,185,230,0.14)' }, angleLines: { color: 'rgba(160,185,230,0.14)' },
          pointLabels: { color: '#e6edf9', font: { size: 11, weight: 'bold' } }
        }
      }
    }
  });
}

// --- Commander colour picker ---
const colorWarnEl = document.getElementById('colorWarn');
const swatchBoxes = [document.getElementById('p1Swatches'), document.getElementById('p2Swatches')];
const colorInputs = [document.getElementById('p1ColorInput'), document.getElementById('p2ColorInput')];
const MIN_COLOR_DIST = 110;

function trySetColor(idx, hex) {
  hex = hex.toLowerCase();
  if (colorDist(hex, playerColors[1 - idx]) < MIN_COLOR_DIST) {
    colorWarnEl.classList.remove('hidden');
    colorWarnEl.textContent = '⚠️ That colour is too close to the other commander\'s colour — pick a different one.';
    renderSwatches();
    return;
  }
  colorWarnEl.classList.add('hidden');
  playerColors[idx] = hex;
  applyPlayerColors();
  renderSwatches();
}

function renderSwatches() {
  [0, 1].forEach(idx => {
    const other = playerColors[1 - idx];
    swatchBoxes[idx].innerHTML = '';
    PALETTE.forEach(c => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch' + (c === playerColors[idx] ? ' active' : '');
      b.style.background = c;
      b.title = c;
      const taken = colorDist(c, other) < MIN_COLOR_DIST;
      if (taken) { b.classList.add('taken'); b.disabled = true; }
      b.addEventListener('click', () => trySetColor(idx, c));
      swatchBoxes[idx].appendChild(b);
    });
    colorInputs[idx].value = playerColors[idx];
  });
}
colorInputs.forEach((inp, idx) => inp.addEventListener('change', () => trySetColor(idx, inp.value)));
renderSwatches();

// --- Single-player colour picker ---
const soloSwatchesEl = document.getElementById('soloSwatches');
const soloColorInput = document.getElementById('soloColorInput');

function setSoloColor(hex) {
  soloColor = hex.toLowerCase();
  applyPlayerColors();
  renderSoloSwatches();
}

function renderSoloSwatches() {
  if (!soloSwatchesEl) return;
  soloSwatchesEl.innerHTML = '';
  PALETTE.forEach(c => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch' + (c.toLowerCase() === soloColor.toLowerCase() ? ' active' : '');
    b.style.background = c;
    b.title = c;
    b.addEventListener('click', () => setSoloColor(c));
    soloSwatchesEl.appendChild(b);
  });
  if (soloColorInput) soloColorInput.value = soloColor;
}
if (soloColorInput) soloColorInput.addEventListener('change', () => setSoloColor(soloColorInput.value));
renderSoloSwatches();

// --- Start screen overlay navigation ---
function closeAllStartOverlays() {
  startOverlays.forEach(ov => ov && ov.classList.add('hidden'));
  startScreen.classList.remove('overlay-open');
}

function openStartOverlay(target) {
  startOverlays.forEach(ov => ov && ov.classList.toggle('hidden', ov !== target));
  startScreen.classList.toggle('overlay-open', Boolean(target));
}

function updateDifficultySummary() {
  if (!diffModeSummary) return;
  if (selectedMode === '1p') {
    const name = escapeHtml(playerNameInput.value.trim() || 'Explorer');
    diffModeSummary.innerHTML = `<span class="sum-chip"><i class="dot solo"></i> <strong>${name}</strong></span><span class="sum-meta">🧭 Single Player • 90s Rush</span>`;
  } else {
    const n1 = escapeHtml(p1NameInput.value.trim() || 'Commander 1');
    const n2 = escapeHtml(p2NameInput.value.trim() || 'Commander 2');
    diffModeSummary.innerHTML = `<span class="sum-chip">${dotHtml(0)} <strong>${n1}</strong></span><span class="sum-vs">VS</span><span class="sum-chip">${dotHtml(1)} <strong>${n2}</strong></span>`;
  }
}

// --- 3. EVENT HANDLERS ---
openHowToBtn.addEventListener('click', () => openStartOverlay(howToOverlay));

open1PBtn.addEventListener('click', () => {
  selectedMode = '1p';
  renderLeaderboard();
  renderSoloSwatches();
  openStartOverlay(setup1POverlay);
});

open2PBtn.addEventListener('click', () => {
  selectedMode = '2p';
  renderSwatches();
  openStartOverlay(setup2POverlay);
});

toDiffFrom1PBtn.addEventListener('click', () => {
  selectedMode = '1p';
  updateDifficultySummary();
  openStartOverlay(difficultyOverlay);
});

toDiffFrom2PBtn.addEventListener('click', () => {
  selectedMode = '2p';
  updateDifficultySummary();
  openStartOverlay(difficultyOverlay);
});

backToSetupBtn.addEventListener('click', () => {
  openStartOverlay(selectedMode === '2p' ? setup2POverlay : setup1POverlay);
});

document.querySelectorAll('[data-close-overlay]').forEach(btn => {
  btn.addEventListener('click', closeAllStartOverlays);
});

startOverlays.forEach(ov => {
  if (!ov) return;
  ov.addEventListener('click', (e) => {
    if (e.target === ov) closeAllStartOverlays();
  });
});

howToTabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    howToTabBtns.forEach(b => b.classList.toggle('active', b === btn));
    const is2P = btn.dataset.rules === '2p';
    rules1P.classList.toggle('hidden', is2P);
    rules2P.classList.toggle('hidden', !is2P);
  });
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !startScreen.classList.contains('hidden')) {
    closeAllStartOverlays();
  }
});

diffCards.forEach(card => {
  card.addEventListener('click', () => {
    selectedDifficulty = card.dataset.diff;
    diffCards.forEach(c => c.classList.toggle('active', c === card));
  });
});

mapStyleBtn.addEventListener('click', () => {
  isSatellite = !isSatellite;
  if (isSatellite) {
    map.removeLayer(lightTileLayer);
    satelliteTileLayer.addTo(map);
    mapStyleBtn.textContent = '🗺️ Map';
  } else {
    map.removeLayer(satelliteTileLayer);
    lightTileLayer.addTo(map);
    mapStyleBtn.textContent = '🛰️ Satellite';
  }
});

soundToggleBtn.addEventListener('click', () => {
  const muted = soundFX.toggleMute();
  soundToggleBtn.textContent = muted ? '🔇 Muted' : '🔊 Sound';
});

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.toggle('active', b === btn));
    const showBar = btn.dataset.tab === 'bar';
    barCanvas.classList.toggle('hidden', !showBar);
    radarCanvas.classList.toggle('hidden', showBar);
  });
});

launchGameBtn.addEventListener('click', startGame);
restartInGameBtn.addEventListener('click', startGame);
playAgainBtn.addEventListener('click', startGame);
rematchBtn.addEventListener('click', startGame);
document.getElementById('battleSkipBtn').addEventListener('click', () => BattleFX.skip());
backToMenuBtn.addEventListener('click', showStartScreen);
menuAfterGameBtn.addEventListener('click', showStartScreen);
menuAfterBattleBtn.addEventListener('click', showStartScreen);

regionJokerBtn.addEventListener('click', activateRegionJoker);
clueJokerBtn.addEventListener('click', activateClueJoker);
eliminateJokerBtn.addEventListener('click', activateEliminateJoker);
skipBtn.addEventListener('click', handleSkip);

window.addEventListener('keydown', (e) => {
  if (!engine.getState().isRunning) return;
  if (e.key === '1') activateRegionJoker();
  else if (e.key === '2') activateClueJoker();
  else if (e.key === '3') activateEliminateJoker();
  else if (e.key.toLowerCase() === 'p') handleSkip();
});

// Init
loadGeoDatasets();
renderLeaderboard();
updateHUD();
