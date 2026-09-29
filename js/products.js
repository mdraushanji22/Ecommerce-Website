/* ==========================================================================
   LUMEN — Catalogue & Seed Data
   js/products.js
   --------------------------------------------------------------------------
   Pure data + read helpers. Loaded before app.js on every page.
   Nothing here touches the DOM or localStorage directly — persistence is
   handled by app.js (LUMEN.store) so this file stays declarative.
   ========================================================================== */

(function (global) {
  'use strict';

  /* --------------------------------------------------------------------
     Categories
     ------------------------------------------------------------------ */
  const CATEGORIES = [
    { slug: 'smartphones',  name: 'Smartphones',  blurb: 'Titanium frames, all-day battery, cameras that just work.', image: 'smartphone-titanium.svg' },
    { slug: 'laptops',      name: 'Laptops',      blurb: 'Silent performance for work, film and everything between.',    image: 'laptop-silver.svg' },
    { slug: 'headphones',   name: 'Headphones',   blurb: 'Adaptive noise cancellation and detail you can feel.',          image: 'headphone-champagne.svg' },
    { slug: 'smartwatches', name: 'Smartwatches', blurb: 'Health, recovery and readiness — on your wrist.',               image: 'watch-titanium.svg' },
    { slug: 'cameras',      name: 'Cameras',      blurb: 'Full-frame sensors in bodies you will actually carry.',         image: 'camera-black.svg' },
    { slug: 'accessories',  name: 'Accessories',  blurb: 'Charging, audio and desk essentials that earn their space.',     image: 'charger.svg' }
  ];

  /* Secondary imagery reused to build a believable product gallery. */
  const GALLERY_BY_CATEGORY = {
    smartphones:  ['smartphone-midnight.svg', 'smartphone-graphite.svg'],
    laptops:      ['laptop-graphite.svg', 'laptop-champagne.svg'],
    headphones:   ['headphone-graphite.svg', 'earbuds-white.svg'],
    smartwatches: ['watch-black.svg', 'watch-graphite.svg'],
    cameras:      ['camera-silver.svg', 'camera-charcoal.svg'],
    accessories:  ['powerbank.svg', 'speaker.svg']
  };

  const SHARED_SHOTS = [
    'detail-macro.svg',
    'detail-angles.svg',
    'detail-inuse.svg',
    'detail-packaging.svg'
  ];

  const IMG_DIR = 'assets/images/';

  /* --------------------------------------------------------------------
     Colours, sizes & storage options
     ------------------------------------------------------------------ */
  const SWATCHES = {
    'Space Black': '#2b2b30',
    'Titanium Natural': '#c8c2b4',
    'Midnight Blue': '#2c3e5c',
    'Champagne Gold': '#d9c096',
    'Deep Graphite': '#3a3a42',
    'Silver Mist': '#d8d9dd',
    'Arctic White': '#f2f3f5',
    'Sunset Coral': '#f0947f',
    'Ocean Teal': '#2f8f9b',
    'Obsidian': '#17171b'
  };

  const STORAGE = ['128 GB', '256 GB', '512 GB', '1 TB'];

  /* --------------------------------------------------------------------
     Product catalogue
     ------------------------------------------------------------------ */
  const SEED_PRODUCTS = [
    /* ---------------- Smartphones ---------------- */
    {
      id: 'LUM-1001',
      name: 'Aurora X1 Pro',
      category: 'smartphones',
      brand: 'Lumen',
      price: 79999,
      discount: 18,
      rating: 4.8,
      reviews: 2841,
      stock: 24,
      image: 'smartphone-titanium.svg',
      badge: 'flagship',
      isNew: true,
      featured: true,
      colors: ['Titanium Natural', 'Deep Graphite', 'Midnight Blue'],
      sizes: ['256 GB', '512 GB', '1 TB'],
      tagline: 'The most complete camera system we have ever shipped.',
      description: 'Aurora X1 Pro pairs a 6.7-inch LTPO display with an adaptive refresh rate that quietly drops to 1 Hz when you are not scrolling. The titanium unibody keeps it at 199 grams, and the new vapour chamber holds sustained performance through a four-hour flight without throttling a single frame.',
      specs: {
        'Display': '6.7" LTPO Super Retina, 1–120 Hz adaptive',
        'Resolution': '2796 × 1290 at 466 ppi',
        'Chipset': 'Lumen L1 Pro, 3 nm, 6-core CPU',
        'Rear cameras': '48 MP Main · 48 MP Ultra Wide · 12 MP 5x Telephoto',
        'Front camera': '12 MP Centre Stage with autofocus',
        'Video': '4K120 ProRes RAW · Log 2 · HDR',
        'Battery': '4,685 mAh, 45 W wired / 15 W wireless',
        'Storage': '256 GB · 512 GB · 1 TB',
        'Build': 'Grade 5 titanium with ceramic shield front',
        'Water resistance': 'IP68 to 6 metres for 30 minutes',
        'Connectivity': '5G · Wi-Fi 7 · Bluetooth 6 · NFC',
        'In the box': 'Aurora X1 Pro · USB-C braided cable · documentation'
      },
      features: [
        'Periscope telephoto with 3D sensor-shift stabilisation for 5x optical zoom',
        'Action Mode 2 records smooth handheld video without a gimbal',
        'On-device generative editing for clean cut-downs in seconds',
        'Battery health management keeps peak capacity above 80% for four years'
      ]
    },
    {
      id: 'LUM-1002',
      name: 'Aurora X1',
      category: 'smartphones',
      brand: 'Lumen',
      price: 64999,
      discount: 15,
      rating: 4.6,
      reviews: 1922,
      stock: 41,
      image: 'smartphone-midnight.svg',
      badge: 'bestseller',
      isNew: false,
      featured: true,
      colors: ['Midnight Blue', 'Space Black', 'Arctic White'],
      sizes: ['128 GB', '256 GB', '512 GB'],
      tagline: 'Flagship essentials, without the flagship price.',
      description: 'The Aurora X1 keeps everything that matters about the Pro — the display, the main camera, the chip — and trims the rest. It is the phone most people should buy, and it is a better phone than most flagships from two generations ago.',
      specs: {
        'Display': '6.1" Super Retina XDR, 60 Hz',
        'Resolution': '2532 × 1170 at 460 ppi',
        'Chipset': 'Lumen L1, 4 nm, 6-core CPU',
        'Rear cameras': '48 MP Main · 12 MP Ultra Wide',
        'Front camera': '12 MP Centre Stage',
        'Video': '4K60 Dolby Vision · Cinematic mode',
        'Battery': '3,780 mAh, 30 W wired / 15 W wireless',
        'Storage': '128 GB · 256 GB · 512 GB',
        'Build': 'Aluminium with ceramic shield front',
        'Water resistance': 'IP68 to 6 metres for 30 minutes',
        'In the box': 'Aurora X1 · USB-C cable · documentation'
      },
      features: [
        'Same 48 MP main sensor as the X1 Pro at a lighter body weight',
        'Night mode lifts shadow detail without softening texture',
        'Two years of guaranteed OS updates at no cost'
      ]
    },
    {
      id: 'LUM-1003',
      name: 'Nimbus One 5G',
      category: 'smartphones',
      brand: 'Nimbus',
      price: 54999,
      discount: 22,
      rating: 4.4,
      reviews: 1104,
      stock: 33,
      image: 'smartphone-silver.svg',
      badge: 'deal',
      isNew: false,
      featured: true,
      colors: ['Arctic White', 'Space Black', 'Ocean Teal'],
      sizes: ['128 GB', '256 GB'],
      tagline: 'Five bands, one clean Android experience.',
      description: 'Nimbus One 5G is built for Indian networks — five 5G bands, carrier aggregation, and a vapour cooling system that stays calm through recording. The 6.4-inch 120 Hz panel and clean Android build make it the easiest phone to recommend to anyone who asks us for one.',
      specs: {
        'Display': '6.4" AMOLED, 120 Hz',
        'Chipset': 'Nimbus N2, 4 nm',
        'Rear cameras': '50 MP Main OIS · 8 MP Ultra Wide · 2 MP Macro',
        'Front camera': '16 MP',
        'Battery': '5,000 mAh, 67 W wired',
        'Storage': '128 GB · 256 GB',
        'Build': 'Recycled aluminium unibody',
        'Water resistance': 'IP54',
        'Connectivity': '5G (5 bands) · Wi-Fi 6 · Bluetooth 5.3',
        'In the box': 'Nimbus One 5G · 67 W charger · clear case'
      },
      features: [
        'Five 5G bands including n78 for clean indoor coverage',
        '3.5 years of OS updates with quarterly security patches',
        'Stereo speakers tuned with a 0.7% THD target'
      ]
    },
    {
      id: 'LUM-1004',
      name: 'Vertex 14 Pro',
      category: 'smartphones',
      brand: 'Vertex',
      price: 89999,
      discount: 10,
      rating: 4.7,
      reviews: 738,
      stock: 12,
      image: 'smartphone-graphite.svg',
      badge: 'limited',
      isNew: true,
      featured: false,
      colors: ['Obsidian', 'Deep Graphite'],
      sizes: ['512 GB', '1 TB'],
      tagline: 'A creator phone for people who shoot every day.',
      description: 'Vertex 14 Pro is built around a 1-inch main sensor with variable aperture, a 200 MP ultra wide for close focus, and an S-Log colour pipeline that grades cleanly. Twelve terabytes of internal storage is not a typo either.',
      specs: {
        'Display': '6.8" LTPO AMOLED, 1–144 Hz',
        'Chipset': 'Vertex V3, 3 nm',
        'Rear cameras': '50 MP 1" Main f/1.4–4.0 · 200 MP Ultra Wide macro · 50 MP 5x Periscope',
        'Front camera': '32 MP autofocus',
        'Video': '8K30 · 4K120 · S-Log 3',
        'Battery': '5,400 mAh, 100 W wired / 50 W wireless',
        'Storage': '512 GB · 1 TB',
        'Build': 'Grade 5 titanium, sapphire rear glass',
        'Water resistance': 'IP68 to 6 metres',
        'In the box': 'Vertex 14 Pro · 100 W charger · braided cable'
      },
      features: [
        'Variable f/1.4–4.0 aperture for genuine depth control',
        '200 MP ultra wide focuses at 3 cm for macro without a separate lens',
        'Full-resolution ProRAW export straight to Photos'
      ]
    },

    /* ---------------- Laptops ---------------- */
    {
      id: 'LUM-2001',
      name: 'Titanbook Air 14',
      category: 'laptops',
      brand: 'Titan',
      price: 124999,
      discount: 14,
      rating: 4.7,
      reviews: 1456,
      stock: 18,
      image: 'laptop-silver.svg',
      badge: 'bestseller',
      isNew: false,
      featured: true,
      colors: ['Silver Mist', 'Midnight Blue', 'Titanium Natural'],
      sizes: ['16 GB / 512 GB', '16 GB / 1 TB', '24 GB / 1 TB'],
      tagline: 'The quiet one. Twelve hours, zero fan noise.',
      description: 'Titanbook Air 14 runs completely silent under everyday load — there is no fan, and the machine stays under 10 W while you browse, write and compile. The 14-inch mini-LED panel hits 1,600 nits of peak brightness, so HDR video looks like HDR video.',
      specs: {
        'Display': '14.2" mini-LED, 120 Hz, 1600 nits peak',
        'Resolution': '3024 × 1964 at 254 ppi',
        'Chipset': 'Titan M2, 8-core CPU, 10-core GPU',
        'Memory': '16 GB unified · 24 GB unified',
        'Storage': '512 GB SSD · 1 TB SSD',
        'Battery': 'Up to 12 hours video playback, 52 Wh',
        'Weight': '1.24 kg',
        'Ports': '2× Thunderbolt 4 · MagLock · 3.5 mm · SDXC',
        'Webcam': '12 MP Centre Stage with auto framing',
        'In the box': 'Titanbook Air 14 · 35 W USB-C adapter · MagLock'
      },
      features: [
        'Fanless design means zero noise in a quiet room',
        'Supports two external 6K displays while charging',
        'Media engine decodes 8K ProRes without breaking a sweat'
      ]
    },
    {
      id: 'LUM-2002',
      name: 'Titanbook Pro 16',
      category: 'laptops',
      brand: 'Titan',
      price: 189999,
      discount: 9,
      rating: 4.9,
      reviews: 612,
      stock: 9,
      image: 'laptop-graphite.svg',
      badge: 'pro',
      isNew: true,
      featured: true,
      colors: ['Space Black', 'Deep Graphite'],
      sizes: ['32 GB / 1 TB', '64 GB / 2 TB'],
      tagline: 'Desktop-class sustained performance in 2.1 kg.',
      description: 'Titanbook Pro 16 sustains full CPU and GPU load for over an hour before thermal limits, thanks to a dual-vapour-chamber design and a 140 W GaN charger. The 16-inch XDR display, six-speaker array and full-size port selection make it a genuine desktop replacement.',
      specs: {
        'Display': '16" XDR mini-LED, 120 Hz, 1600 nits peak',
        'Resolution': '3456 × 2234 at 254 ppi',
        'Chipset': 'Titan M2 Max, 16-core CPU, 40-core GPU',
        'Memory': '32 GB · 64 GB unified',
        'Storage': '1 TB SSD · 2 TB SSD',
        'Battery': 'Up to 10 hours, 100 Wh',
        'Weight': '2.14 kg',
        'Ports': '3× Thunderbolt 4 · HDMI 2.1 · SDXC · MagLock · 3.5 mm',
        'Audio': 'Six-speaker array with force-cancelling woofers',
        'In the box': 'Titanbook Pro 16 · 140 W GaN charger · MagLock'
      },
      features: [
        'Sustains 4K ProRes editing for over 90 minutes on a single charge',
        'Force-cancelling woofers stop vibration travelling into the chassis',
        'Six-speaker array with true spatial audio and a 3-mic array for calls'
      ]
    },
    {
      id: 'LUM-2003',
      name: 'Atlas Studio 15',
      category: 'laptops',
      brand: 'Atlas',
      price: 149999,
      discount: 12,
      rating: 4.5,
      reviews: 428,
      stock: 14,
      image: 'laptop-champagne.svg',
      badge: '',
      isNew: false,
      featured: false,
      colors: ['Champagne Gold', 'Silver Mist'],
      sizes: ['32 GB / 1 TB', '64 GB / 2 TB'],
      tagline: 'A colour-accurate 15-inch workstation for creatives.',
      description: 'Atlas Studio 15 ships with a factory-calibrated 10-bit panel averaging Delta-E under 1, a hardware colour preset switch, and 128 GB of ECC memory on the top configuration. It is a workstation that happens to be a laptop.',
      specs: {
        'Display': '15.6" OLED, 120 Hz, 100% DCI-P3, Delta-E < 1',
        'Resolution': '2880 × 1800 at 242 ppi',
        'Chipset': 'Atlas A16 Pro, 12-core CPU, 18-core GPU',
        'Memory': '32 GB ECC · 64 GB ECC',
        'Storage': '1 TB SSD · 2 TB SSD',
        'Battery': 'Up to 11 hours, 84 Wh',
        'Weight': '1.89 kg',
        'Ports': '3× Thunderbolt 4 · HDMI 2.1 · SDXC · Ethernet · 3.5 mm',
        'Calibration': 'Factory calibrated, 10-bit, hardware preset switch',
        'In the box': 'Atlas Studio 15 · 96 W charger · colour report'
      },
      features: [
        'Factory calibration report included in the box',
        'Hardware colour preset switch for instant gamma 2.2 / DCI-P3 / HDR',
        'ECC memory catches bit errors before they corrupt a render'
      ]
    },
    {
      id: 'LUM-2004',
      name: 'Nova Air 13',
      category: 'laptops',
      brand: 'Nova',
      price: 74999,
      discount: 20,
      rating: 4.3,
      reviews: 1867,
      stock: 27,
      image: 'laptop-blue.svg',
      badge: 'deal',
      isNew: false,
      featured: true,
      colors: ['Midnight Blue', 'Arctic White'],
      sizes: ['16 GB / 512 GB', '16 GB / 1 TB'],
      tagline: 'A genuinely light laptop with no obvious compromise.',
      description: 'Nova Air 13 is 1.07 kg, has all-day battery life, and does not flex when you press the keyboard. The 13.6-inch 500-nit panel is bright enough for a sunny window seat, and the port selection includes two USB-C ports you can actually charge from.',
      specs: {
        'Display': '13.6" IPS, 2560 × 1664, 500 nits',
        'Chipset': 'Nova N2, 8-core CPU, 10-core GPU',
        'Memory': '16 GB unified',
        'Storage': '512 GB SSD · 1 TB SSD',
        'Battery': 'Up to 13 hours, 52.6 Wh',
        'Weight': '1.07 kg',
        'Ports': '2× Thunderbolt 4 · 3.5 mm · MagLock',
        'Webcam': '12 MP Centre Stage',
        'In the box': 'Nova Air 13 · 30 W adapter · MagLock'
      },
      features: [
        '1.07 kg chassis with a rigid aluminium keyboard deck',
        '13 hours of real-world battery in mixed use',
        'Fanless under normal load, whisper-quiet when it spins up'
      ]
    },

    /* ---------------- Headphones ---------------- */
    {
      id: 'LUM-3001',
      name: 'Halo Pro Studio',
      category: 'headphones',
      brand: 'Halo',
      price: 34999,
      discount: 16,
      rating: 4.9,
      reviews: 3412,
      stock: 32,
      image: 'headphone-champagne.svg',
      badge: 'flagship',
      isNew: false,
      featured: true,
      colors: ['Champagne Gold', 'Space Black', 'Arctic White'],
      sizes: ['Standard'],
      tagline: 'Reference tuning, adaptive silence, 40-hour battery.',
      description: 'Halo Pro Studio is tuned flat against a Harman target with a gentle low shelf, so it sounds right on an aeroplane and in a bedroom. Eight microphones drive adaptive noise cancellation that adjusts to your surroundings rather than guessing, and the memory-foam pads hold a seal for a full workday.',
      specs: {
        'Driver': '40 mm bio-cellulose, 5–40,000 Hz',
        'Noise cancellation': 'Adaptive, 8 microphones, up to 32 dB',
        'Battery': '40 hours ANC on · 60 hours off · 5 min = 3 hours',
        'Charging': 'USB-C, full charge in 90 minutes',
        'Codecs': 'AAC · SBC · LDAC · aptX Adaptive',
        'Multipoint': 'Two devices simultaneously',
        'Weight': '384 g',
        'In the box': 'Halo Pro Studio · hard case · USB-C cable · 3.5 mm cable'
      },
      features: [
        'Adaptive ANC measures the environment 48,000 times per second',
        'Memory-foam ear pads with a replaceable magnetic attachment',
        'Transparency mode that keeps voices natural rather than hollow'
      ]
    },
    {
      id: 'LUM-3002',
      name: 'Halo Over-Ear ANC',
      category: 'headphones',
      brand: 'Halo',
      price: 19999,
      discount: 25,
      rating: 4.5,
      reviews: 5208,
      stock: 46,
      image: 'headphone-graphite.svg',
      badge: 'deal',
      isNew: false,
      featured: true,
      colors: ['Deep Graphite', 'Arctic White', 'Midnight Blue'],
      sizes: ['Standard'],
      tagline: 'Most of the cancellation, at a much better price.',
      description: 'The Halo Over-Ear ANC brings the same eight-microphone array as the Studio at roughly half the price. Battery life is 35 hours with cancellation on, multipoint is included, and the tuning is a little warmer — which most people prefer for long listening sessions.',
      specs: {
        'Driver': '40 mm dynamic, 20 Hz–20 kHz',
        'Noise cancellation': 'Hybrid active, 6 microphones, up to 28 dB',
        'Battery': '35 hours ANC on · 50 hours off',
        'Charging': 'USB-C, full charge in 100 minutes',
        'Codecs': 'AAC · SBC',
        'Multipoint': 'Two devices simultaneously',
        'Weight': '262 g',
        'In the box': 'Halo Over-Ear ANC · travel pouch · USB-C cable'
      },
      features: [
        'Hybrid ANC with a 28 dB reduction across the commute frequency band',
        'Folds flat into the included travel pouch',
        'On-device volume and playback control on the right cup'
      ]
    },
    {
      id: 'LUM-3003',
      name: 'Pulse Buds 3',
      category: 'headphones',
      brand: 'Pulse',
      price: 12999,
      discount: 19,
      rating: 4.4,
      reviews: 6412,
      stock: 58,
      image: 'earbuds-white.svg',
      badge: 'bestseller',
      isNew: true,
      featured: true,
      colors: ['Arctic White', 'Space Black', 'Ocean Teal'],
      sizes: ['Standard'],
      tagline: 'Adaptive Audio, transparency, and a genuinely small case.',
      description: 'Pulse Buds 3 add Adaptive Audio, which quietly lowers the volume in a loud station concourse and raises it in a quiet library. The case is 15% smaller than the previous generation and charges from a 5 W brick, which is genuinely useful when you are travelling.',
      specs: {
        'Driver': '11 mm custom dynamic',
        'Noise cancellation': 'Adaptive, up to 26 dB, 6 microphones',
        'Battery': '8 hours per charge · 32 hours with case',
        'Charging': 'USB-C · Qi wireless · 5 W reverse wireless',
        'Codecs': 'AAC · SBC · aptX Adaptive',
        'Water resistance': 'IP57 buds · IPX4 case',
        'Weight': '4.3 g per bud',
        'In the box': 'Pulse Buds 3 · four tip sizes · USB-C cable'
      },
      features: [
        'Adaptive Audio responds to your environment without app control',
        '5 W reverse wireless charging turns the case into a power bank',
        'Conversation Awareness ducks audio when you start speaking'
      ]
    },
    {
      id: 'LUM-3004',
      name: 'Echo Buds Lite',
      category: 'headphones',
      brand: 'Echo',
      price: 6999,
      discount: 30,
      rating: 4.2,
      reviews: 8934,
      stock: 74,
      image: 'earbuds-sand.svg',
      badge: 'value',
      isNew: false,
      featured: false,
      colors: ['Arctic White', 'Champagne Gold', 'Sunset Coral'],
      sizes: ['Standard'],
      tagline: 'The essentials, honestly built.',
      description: 'Echo Buds Lite do the five things that matter — secure fit, clear calls, decent sound, USB-C and a case that fits in a coin pocket — and nothing else. If your previous earbuds have died, these are the sensible answer.',
      specs: {
        'Driver': '10 mm dynamic',
        'Noise cancellation': 'Passive isolation with ENC for calls',
        'Battery': '6 hours per charge · 24 hours with case',
        'Charging': 'USB-C',
        'Water resistance': 'IPX4',
        'Weight': '3.9 g per bud',
        'In the box': 'Echo Buds Lite · three tip sizes · USB-C cable'
      },
      features: [
        'ENC keeps your voice clear on calls in traffic',
        'Four tip sizes for a seal that survives a run',
        'Case is under 40 g and fits a shirt pocket'
      ]
    },
    {
      id: 'LUM-3005',
      name: 'Horizon Sport Buds',
      category: 'headphones',
      brand: 'Horizon',
      price: 9999,
      discount: 17,
      rating: 4.3,
      reviews: 2271,
      stock: 38,
      image: 'earbuds-coral.svg',
      badge: 'new',
      isNew: true,
      featured: true,
      colors: ['Sunset Coral', 'Ocean Teal', 'Obsidian'],
      sizes: ['Standard'],
      tagline: 'Hooks, IP68, and a secure fit for every rep.',
      description: 'Horizon Sport Buds use an over-ear hook rather than a stem, which keeps them in place through burpees and box jumps. They are IP68 rated — they survive sweat, rain and being rinsed under a tap — and the case doubles as a 500 mAh power bank.',
      specs: {
        'Driver': '12 mm titanium-coated dynamic',
        'Noise cancellation': 'Aware transparency for training cues',
        'Battery': '9 hours per charge · 36 hours with case',
        'Charging': 'USB-C · Qi wireless',
        'Water resistance': 'IP68 buds · IPX4 case',
        'Weight': '8.1 g per bud with hook',
        'In the box': 'Horizon Sport Buds · four tip sizes · ear hooks · USB-C cable'
      },
      features: [
        'Over-ear hooks stay put through high-impact training',
        'IP68 rating survives sweat, rain and a rinse under the tap',
        'Case provides 36 hours total and works as a 500 mAh power bank'
      ]
    },

    /* ---------------- Smartwatches ---------------- */
    {
      id: 'LUM-4001',
      name: 'Orbit Watch Ultra',
      category: 'smartwatches',
      brand: 'Orbit',
      price: 54999,
      discount: 12,
      rating: 4.7,
      reviews: 1583,
      stock: 21,
      image: 'watch-black.svg',
      badge: 'flagship',
      isNew: true,
      featured: true,
      colors: ['Obsidian', 'Titanium Natural', 'Ocean Teal'],
      sizes: ['42 mm', '46 mm'],
      tagline: 'Titanium case, dive-rated, 21-day battery.',
      description: 'Orbit Watch Ultra is built for people who dive, trail run and travel. The titanium case is EN13319 dive-rated to 100 metres, the flat sapphire crystal shrugs off scratches, and the low-power mode still tracks a full day of hiking. Most owners will charge it once a week.',
      specs: {
        'Case': '49 mm grade 5 titanium with flat sapphire crystal',
        'Display': '2000-nit LTPO AMOLED, always-on, 1 Hz minimum',
        'Battery': 'Up to 21 days in low-power mode · 3 days in smart mode',
        'Sensors': 'ECG · blood oxygen · skin temperature · depth gauge to 40 m',
        'Water resistance': 'EN13319 dive rated to 100 m',
        'Positioning': 'Dual-band GPS with L1 + L5',
        'Connectivity': '5G optional · Wi-Fi · Bluetooth 5.4',
        'In the box': 'Orbit Watch Ultra · woven band · charging puck'
      },
      features: [
        'Dive-rated to 100 metres with a working depth gauge',
        'Dual-band L1 + L5 GPS locks onto a position in dense cities',
        '21-day low-power mode that still counts steps and sleep'
      ]
    },
    {
      id: 'LUM-4002',
      name: 'Orbit Watch Series 6',
      category: 'smartwatches',
      brand: 'Orbit',
      price: 39999,
      discount: 15,
      rating: 4.6,
      reviews: 2741,
      stock: 35,
      image: 'watch-titanium.svg',
      badge: 'bestseller',
      isNew: false,
      featured: true,
      colors: ['Titanium Natural', 'Midnight Blue', 'Arctic White'],
      sizes: ['42 mm', '46 mm'],
      tagline: 'Sleep, recovery and every notification, elegantly.',
      description: 'Orbit Watch Series 6 is the watch most people should buy. It tracks sleep stages, recovery and respiratory rate with unusual accuracy, runs three weeks on a charge in low-power mode, and its always-on display stays readable in direct afternoon sun.',
      specs: {
        'Case': '45 mm aluminium with Ion-X front glass',
        'Display': '2,000-nit LTPO AMOLED, always-on',
        'Battery': 'Up to 18 days low-power · 36 hours smart mode',
        'Sensors': 'Optical HR · ECG · blood oxygen · skin temperature',
        'Water resistance': '50 m',
        'Positioning': 'Dual-band GPS with L1 + L5',
        'Connectivity': 'Wi-Fi · Bluetooth 5.4 · NFC payments',
        'In the box': 'Orbit Watch Series 6 · sport band · charging puck'
      },
      features: [
        'Sleep staging matched against polysomnography in clinical trials',
        'On-wrist ECG with atrial fibrillation notifications',
        'Works as a UPI and contactless payment card in India'
      ]
    },
    {
      id: 'LUM-4003',
      name: 'Orbit Watch Active 2',
      category: 'smartwatches',
      brand: 'Orbit',
      price: 22999,
      discount: 21,
      rating: 4.4,
      reviews: 3205,
      stock: 44,
      image: 'watch-graphite.svg',
      badge: 'deal',
      isNew: false,
      featured: false,
      colors: ['Deep Graphite', 'Sunset Coral', 'Ocean Teal'],
      sizes: ['40 mm', '44 mm'],
      tagline: 'Everyday fitness tracking for less than a dinner.',
      description: 'Orbit Watch Active 2 covers the 90% of smartwatches people actually use: steps, heart rate, sleep, and phone notifications. It is 30% lighter than the Series 6, lasts two weeks, and costs less than a month of a streaming subscription.',
      specs: {
        'Case': '44 mm aluminium',
        'Display': '1,000-nit AMOLED, always-on',
        'Battery': 'Up to 14 days',
        'Sensors': 'Optical HR · accelerometer · gyroscope',
        'Water resistance': '50 m',
        'Positioning': 'GPS + GLONASS + Galileo',
        'Connectivity': 'Bluetooth 5.3',
        'In the box': 'Orbit Watch Active 2 · sport band · charging cable'
      },
      features: [
        'Two-week battery in smart mode',
        'Over 120 workout types including open-water swim',
        'Weighs 30 g lighter than the Series 6'
      ]
    },
    {
      id: 'LUM-4004',
      name: 'Pulse Band Fit',
      category: 'smartwatches',
      brand: 'Pulse',
      price: 4999,
      discount: 28,
      rating: 4.1,
      reviews: 9124,
      stock: 86,
      image: 'band-pink.svg',
      badge: 'value',
      isNew: false,
      featured: false,
      colors: ['Sunset Coral', 'Obsidian', 'Arctic White', 'Ocean Teal'],
      sizes: ['One size (S–L)'],
      tagline: 'A 14-day step tracker that does one job perfectly.',
      description: 'Pulse Band Fit tracks steps, distance, calories, heart rate and sleep, then stops. There is no app store, no subscription and no notification treadmill. Fourteen days per charge, and a band that costs less than two takeaway meals to replace.',
      specs: {
        'Display': '1.1" AMOLED, always-on',
        'Battery': 'Up to 14 days',
        'Sensors': '24-hour optical HR · accelerometer · gyroscope',
        'Water resistance': '5 ATM',
        'Weight': '22 g',
        'Connectivity': 'Bluetooth 5.2',
        'In the box': 'Pulse Band Fit · two wrist sizes · charging dock'
      },
      features: [
        'Fourteen days of battery with the display always on',
        'No subscription and no in-app purchases, ever',
        'Swappable 22 mm bands in seven finishes'
      ]
    },

    /* ---------------- Cameras ---------------- */
    {
      id: 'LUM-5001',
      name: 'Vista X Mirrorless',
      category: 'cameras',
      brand: 'Vista',
      price: 149999,
      discount: 8,
      rating: 4.9,
      reviews: 892,
      stock: 11,
      image: 'camera-black.svg',
      badge: 'pro',
      isNew: false,
      featured: true,
      colors: ['Obsidian', 'Silver Mist'],
      sizes: ['Body only', 'Body + 24-70 mm'],
      tagline: 'A 33 MP full-frame body with 8-stop stabilisation.',
      description: 'Vista X is the camera we recommend to anyone stepping up from a phone. The 33 MP back-illuminated sensor is 8 stops of stabilisation behind it, autofocus lands on the eye at f/1.2 in dim light, and the body is weather-sealed at every port.',
      specs: {
        'Sensor': '33 MP full-frame BSI, 14-bit readout',
        'Processor': 'Vista V2, 8-stop IBIS',
        'Autofocus': '1,050 phase-detect points, 92% coverage, −6.5 EV',
        'Burst': '10 fps mechanical · 30 fps electronic',
        'Video': '6K30 10-bit · 4K120 · Log 3',
        'Stabilisation': '8 stops in-body, pixel-shift for 200 MP composites',
        'Storage': 'Dual CFexpress B + SD UHS-II',
        'Weather sealing': 'IP53 at every port and door',
        'Weight': '742 g with battery',
        'In the box': 'Vista X body · battery · dual charger · strap'
      },
      features: [
        '1,050 phase-detect points covering 92% of the frame',
        'Pixel-shift 200 MP mode for architecture and still-life work',
        'Subject recognition for people, animals, vehicles and now insects'
      ]
    },
    {
      id: 'LUM-5002',
      name: 'Vista X Compact',
      category: 'cameras',
      brand: 'Vista',
      price: 109999,
      discount: 10,
      rating: 4.7,
      reviews: 634,
      stock: 16,
      image: 'camera-silver.svg',
      badge: '',
      isNew: true,
      featured: true,
      colors: ['Silver Mist', 'Obsidian'],
      sizes: ['Body only', 'Body + 27 mm'],
      tagline: 'A full-frame camera you will actually carry.',
      description: 'Vista X Compact is 38% smaller than the X and 214 grams lighter, with almost nothing given up. Same 33 MP sensor, same autofocus system, same 6K video. This is the one to buy unless you need the pro body.',
      specs: {
        'Sensor': '33 MP full-frame BSI, 14-bit readout',
        'Processor': 'Vista V2, 7 stops IBIS',
        'Autofocus': '1,050 phase-detect points, 92% coverage, −6.5 EV',
        'Burst': '9 fps mechanical · 30 fps electronic',
        'Video': '6K30 10-bit · 4K120 · Log 3',
        'Storage': 'Single CFexpress B + SD UHS-II',
        'Weather sealing': 'IP53',
        'Weight': '528 g with battery',
        'In the box': 'Vista X Compact · battery · charger · strap'
      },
      features: [
        '214 g lighter than the full-size X with the same sensor',
        'Predictive autofocus uses a decade of action footage as training data',
        'Seamless 4K60 external RAW over HDMI to any recorder'
      ]
    },
    {
      id: 'LUM-5003',
      name: 'Vista Prime 50mm',
      category: 'cameras',
      brand: 'Vista',
      price: 89999,
      discount: 12,
      rating: 4.8,
      reviews: 1104,
      stock: 19,
      image: 'camera-charcoal.svg',
      badge: 'bestseller',
      isNew: false,
      featured: false,
      colors: ['Charcoal', 'Silver Mist'],
      sizes: ['Body only', 'Body + 50 mm'],
      tagline: 'Fast, sharp, and gloriously simple. One prime, one body.',
      description: 'Vista Prime pairs a weather-sealed APS-C body with a 50 mm f/1.2 that resolves detail on the sensor with room to spare. Autofocus is near-instant, colour is neutral without any profile, and the whole kit weighs under 700 grams.',
      specs: {
        'Sensor': '26 MP APS-C BSI',
        'Autofocus': '759 phase-detect points, −5.5 EV',
        'Burst': '11 fps mechanical · 30 fps electronic',
        'Video': '4K60 10-bit · 1080p240',
        'Lens': 'Vista Prime 50 mm f/1.2 ED',
        'Stabilisation': '7 stops in-body',
        'Weather sealing': 'IP53',
        'Weight': '682 g body and lens combined',
        'In the box': 'Body · 50 mm f/1.2 · battery · strap'
      },
      features: [
        '50 mm f/1.2 with ED glass and a 9-blade rounded aperture',
        '11 fps mechanical burst with full autofocus tracking',
        'In-body stabilisation rated at 7 stops'
      ]
    },
    {
      id: 'LUM-5004',
      name: 'Vista Scout Action Cam',
      category: 'cameras',
      brand: 'Vista',
      price: 24999,
      discount: 15,
      rating: 4.4,
      reviews: 2455,
      stock: 33,
      image: 'camera-blue.svg',
      badge: 'new',
      isNew: true,
      featured: false,
      colors: ['Ocean Teal', 'Obsidian', 'Arctic White'],
      sizes: ['Standard'],
      tagline: '5.3K with Horizon Lock that holds through a crash.',
      description: 'Vista Scout records 5.3K at 60 fps with a genuinely useful stabilisation stack, and Horizon Lock keeps the horizon level even when you do not. It is waterproof to 12 metres without a case, and the replaceable lens cover costs a few hundred rupees rather than a few thousand.',
      specs: {
        'Sensor': '1/1.9" CMOS, 1.2 µm pixels',
        'Video': '5.3K60 · 4K120 · 1080p240',
        'Stabilisation': 'Horizon Lock + flowstate gimbal',
        'Water resistance': '12 m without a case',
        'Field of view': '154° standard, 166° wide',
        'Battery': 'Up to 90 minutes at 5.3K60',
        'Connectivity': 'Wi-Fi 6 · Bluetooth 5.3',
        'In the box': 'Scout · two batteries · mount set · replacement lens cover'
      },
      features: [
        'Horizon Lock keeps level through the most aggressive footage',
        'Replaceable lens cover — no new camera for a scratched front element',
        '12 m waterproof without a housing and freeze-rated to −20 °C'
      ]
    },

    /* ---------------- Accessories ---------------- */
    {
      id: 'LUM-6001',
      name: 'ChargeCore 20K Power Bank',
      category: 'accessories',
      brand: 'ChargeCore',
      price: 3499,
      discount: 20,
      rating: 4.6,
      reviews: 6890,
      stock: 112,
      image: 'powerbank.svg',
      badge: 'bestseller',
      isNew: false,
      featured: true,
      colors: ['Deep Graphite', 'Arctic White'],
      sizes: ['Standard'],
      tagline: '20,000 mAh, 65 W USB-C, and a digital capacity readout.',
      description: 'ChargeCore 20K charges a 16-inch laptop at full speed from a single USB-C port, and the small OLED readout tells you the real remaining capacity rather than four vague LEDs. It can charge a phone three times and still have charge left.',
      specs: {
        'Capacity': '20,000 mAh (74 Wh)',
        'Output': '65 W USB-C PD 3.0 · 18 W USB-A',
        'Input': '45 W USB-C, full charge in 2.4 hours',
        'Display': 'OLED percentage and wattage readout',
        'Cells': 'Li-polymer, 5,000-cycle rated',
        'Safety': 'Over-current, over-heat, short-circuit, over-charge',
        'Weight': '356 g',
        'In the box': 'ChargeCore 20K · USB-C cable · carry sleeve'
      },
      features: [
        '65 W USB-C PD 3.0 output charges a 16-inch laptop',
        'OLED readout shows real remaining capacity and live wattage',
        '5,000-cycle rated cells that still hold 80% after three years'
      ]
    },
    {
      id: 'LUM-6002',
      name: 'Terra 65W GaN Charger',
      category: 'accessories',
      brand: 'Terra',
      price: 2999,
      discount: 24,
      rating: 4.5,
      reviews: 4127,
      stock: 148,
      image: 'charger.svg',
      badge: 'value',
      isNew: false,
      featured: true,
      colors: ['Arctic White', 'Deep Graphite'],
      sizes: ['Standard'],
      tagline: 'Four ports, laptop-class power, half the size.',
      description: 'Terra 65W uses gallium nitride to fit 65 W of laptop-capable output plus two USB-A ports into a body smaller than a matchbox. It is the one charger that replaces everything else in a travel bag.',
      specs: {
        'Total output': '65 W shared across four ports',
        'Ports': '2× USB-C PD 3.0 · 2× USB-A QC 3.0',
        'Input': '100–240 V AC, 50/60 Hz — works in India and abroad',
        'Technology': 'GaN II, foldable pins',
        'Safety': 'Over-current, over-voltage, thermal, surge',
        'Weight': '112 g',
        'In the box': 'Terra 65W · travel pouch'
      },
      features: [
        'GaN II silicon for 40% less volume than silicon chargers',
        'Universal 100–240 V input with foldable pins',
        'Four ports means one bag, not three'
      ]
    },
    {
      id: 'LUM-6003',
      name: 'GlideFlex 75 Mechanical',
      category: 'accessories',
      brand: 'GlideFlex',
      price: 8999,
      discount: 18,
      rating: 4.7,
      reviews: 1583,
      stock: 27,
      image: 'keyboard.svg',
      badge: '',
      isNew: true,
      featured: true,
      colors: ['Deep Graphite', 'Arctic White'],
      sizes: ['75% layout', 'TKL layout'],
      tagline: 'Gasket-mounted, hot-swappable, quietly thocky.',
      description: 'GlideFlex 75 uses a gasket mount with two layers of foam, so it sounds deeper and softer than a tray-mount board at a fraction of the price. Switches are hot-swappable in five seconds, and the knob is genuinely programmable in three apps.',
      specs: {
        'Layout': '75% · 82 keys · rotary knob',
        'Mount': 'Gasket with plate foam and case foam',
        'Switches': 'Hot-swappable, 3-pin and 5-pin',
        'Keycaps': 'Double-shot PBT, side printed',
        'Connection': 'USB-C · 2.4 GHz · Bluetooth 5.2, three devices',
        'Battery': '4,000 mAh, ~110 hours backlight off',
        'Backlight': 'South-facing per-key RGB, 20 presets',
        'Weight': '890 g',
        'In the box': 'GlideFlex 75 · keycap puller · switch puller · cable'
      },
      features: [
        'Gasket mount plus dual foam for a deeper, quieter sound',
        'Hot-swap switches in about five seconds per key',
        'Rotary knob remaps to volume, scroll, or media per app'
      ]
    },
    {
      id: 'LUM-6004',
      name: 'AuraSound Mini',
      category: 'accessories',
      brand: 'AuraSound',
      price: 5999,
      discount: 23,
      rating: 4.5,
      reviews: 3362,
      stock: 64,
      image: 'speaker.svg',
      badge: 'deal',
      isNew: false,
      featured: true,
      colors: ['Arctic White', 'Deep Graphite', 'Ocean Teal'],
      sizes: ['Standard'],
      tagline: 'Room-filling sound from a 22 cm cylinder.',
      description: 'AuraSound Mini punches far above its size thanks to a passive radiator on each end and a downward-firing driver. It is IP67 rated, pairs two units into true stereo, and lasts 20 hours on a charge.',
      specs: {
        'Drivers': '48 mm full-range downward-firing · twin passive radiators',
        'Output': '30 W RMS',
        'Battery': 'Up to 20 hours at 50% volume',
        'Water resistance': 'IP67 — survives dust, sand and full submersion',
        'Codecs': 'AAC · SBC · LDAC',
        'Pairing': 'Two units into true stereo',
        'Weight': '695 g',
        'In the box': 'AuraSound Mini · USB-C cable · carry loop'
      },
      features: [
        'Twin passive radiators deliver bass from a 22 cm body',
        'IP67 — survives dust, sand and accidental submersion',
        'Pair two units for true stereo separation'
      ]
    }
  ];

  /* --------------------------------------------------------------------
     Coupons
     ------------------------------------------------------------------ */
  const COUPON_SEED = [
    { id: 'CPN-1', code: 'WELCOME10', type: 'percent', value: 10, minOrder: 999,    maxDiscount: 500,  expiry: '2026-12-31', status: 'active',   usageCount: 1284 },
    { id: 'CPN-2', code: 'SAVE20',    type: 'percent', value: 20, minOrder: 4999,   maxDiscount: 3000, expiry: '2026-12-31', status: 'active',   usageCount: 642 },
    { id: 'CPN-3', code: 'NEWUSER15', type: 'percent', value: 15, minOrder: 1499,   maxDiscount: 750,  expiry: '2027-03-31', status: 'active',   usageCount: 3180 },
    { id: 'CPN-4', code: 'FLAT250',   type: 'flat',    value: 250, minOrder: 2999,  maxDiscount: 250,  expiry: '2026-11-30', status: 'active',   usageCount: 947 },
    { id: 'CPN-5', code: 'MONSOON8',  type: 'percent', value: 8,  minOrder: 999,    maxDiscount: 400,  expiry: '2026-10-15', status: 'inactive', usageCount: 2104 }
  ];

  /* --------------------------------------------------------------------
     Store settings
     ------------------------------------------------------------------ */
  const SETTINGS_SEED = {
    storeName: 'Lumen',
    tagline: 'Premium technology, chosen carefully and priced honestly',
    legalName: 'Lumen Retail India Pvt. Ltd.',
    // Keys below match the field names on admin/settings.html so the form
    // hydrates from the seed rather than rendering empty inputs.
    supportEmail: 'care@lumen.in',
    supportPhone: '+91 80 4718 2200',
    address: '4th Floor, Prestige Tech Park, Outer Ring Road, Bengaluru 560103',
    gstin: '29AABCL1234M1Z5',
    currency: 'INR',
    freeShippingOver: 999,
    shippingFlat: 79,
    taxRate: 18,
    lowStockAlert: 5,
    orderEmails: true,
    maintenanceMode: false,
    allowSignup: true,
    codEnabled: true,
    upiEnabled: true,
    cardEnabled: true,
    notifyOrders: true,
    notifyLowStock: true,
    notifyNewUsers: false,
    twoFactor: false,
    loginAlerts: true,
    sessionTimeout: 30
  };

  /* --------------------------------------------------------------------
     Derived helpers
     ------------------------------------------------------------------ */
  const ALL_BRANDS = Array.from(new Set(SEED_PRODUCTS.map((p) => p.brand))).sort();

  /** Final selling price after the percentage discount is applied. */
  function salePrice(product) {
    if (!product || !product.discount) return product ? product.price : 0;
    return Math.round((product.price * (100 - product.discount)) / 100);
  }

  /** Full image path for a product's primary image. */
  function imageUrl(file) {
    if (!file) return '';
    if (/^(https?:|\/|data:)/i.test(file)) return file;
    return imgDir() + file;
  }

  /**
   * Directory prefix for catalogue artwork.
   * Pages inside /admin set <body data-root="../"> so the path stays correct.
   */
  function imgDir() {
    const body = document.body;
    const root = body && body.dataset && body.dataset.root ? body.dataset.root : '';
    return root + 'assets/images/';
  }

  /** Ordered gallery for the PDP: primary, category alternates, then detail shots. */
  function galleryFor(product) {
    if (!product) return [];
    const alternates = GALLERY_BY_CATEGORY[product.category] || [];
    const files = [product.image].concat(alternates).concat(SHARED_SHOTS);
    return files.map(imageUrl);
  }

  /** Category record for a slug. */
  function categoryBySlug(slug) {
    return CATEGORIES.find((c) => c.slug === slug) || null;
  }

  /** Human label for a category slug. */
  function categoryName(slug) {
    const found = categoryBySlug(slug);
    return found ? found.name : slug;
  }

  /** All swatch colours used in the catalogue, for the shop filter panel. */
  const SWATCH_LIST = Object.keys(SWATCHES);

  function swatchColor(name) {
    return SWATCHES[name] || '#D2D2D7';
  }

  /* --------------------------------------------------------------------
     Export
     ------------------------------------------------------------------ */
  global.LUMEN = global.LUMEN || {};
  global.LUMEN.data = {
    CATEGORIES,
    SEED_PRODUCTS,
    COUPON_SEED,
    SETTINGS_SEED,
    ALL_BRANDS,
    STORAGE,
    SWATCHES,
    SWATCH_LIST,
    SHARED_SHOTS,
    IMG_DIR,
    salePrice,
    imageUrl,
    galleryFor,
    categoryBySlug,
    categoryName,
    swatchColor
  };
})(window);
