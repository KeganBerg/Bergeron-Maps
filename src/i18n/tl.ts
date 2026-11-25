import type { Messages } from './en';
import { SYMBOLS } from './symbols/tl';
import { joinWith } from '../model/words';
import { SUPPORT_EMAIL } from '../support';

/**
 * Tagalog. Machine-drafted: a native speaker should review it before it's
 * promised to customers (see docs/LANGUAGES.md). Everyday Filipino keeps some
 * English words (elevator, escalator, valet), as people say them at work.
 */

const WAY = { up: 'paakyat', down: 'pababa', across: 'patawid' };
const span = (a: string, b: string) => (a === b ? a : `${a} hanggang ${b}`);

export const tl: Messages = {
  words: {
    space: (label) => `Puwesto ${label}`,
    noNumber: '(walang numero)',
    spot: 'ang lugar na pinili mo',
    symbol: (key) => SYMBOLS[key],
    place: 'Lugar',
    accessible: 'Para sa may kapansanan',
    goesTo: (floors) => `Papunta sa ${floors}`,
    walkTo: (place) => `Maglakad papunta sa ${place}`,
    goInside: (b) => `Pumasok sa ${b}`,
    leave: (b) => `Lumabas ng ${b}`,
    // "Gamitin" (use) fits elevators, stairs and ramps alike; you can't ride stairs.
    take: (name) => `Gamitin ang ${name}`,
    takeTo: (name, way, floor) => `Gamitin ang ${name} ${WAY[way]} sa ${floor}`,
    wayTo: (way, floor) => `${WAY[way][0].toUpperCase()}${WAY[way].slice(1)} sa ${floor}`,
    places: 'Mga lugar',
    row: (a, b) => `Hanay: puwesto ${span(a, b)}`,
    parts: joinWith(', '),
    list: joinWith(', '),
    otherSpaces: (a, b) => `Iba pang puwesto: ${span(a, b)}`,
  },
  language: 'Wika',

  loading: 'Naglo-load…',
  loadingMap: 'Nilo-load ang mapa…',
  tryAgain: 'Subukan ulit',
  allMaps: 'Lahat ng mapa',
  mapGone: 'Hindi mabuksan ang mapang ito. Maaaring nabura na ito.',
  notPublished: 'Hindi pa naka-publish ang mapang ito, o inalis na ito. Pakisabihan ang iyong manager na i-publish ito.',
  loadFailed: 'Hindi ma-load ang pinakabagong bersyon ng mapang ito. Tingnan ang iyong koneksyon at subukan ulit.',
  mapUpdated: 'Na-update ang mapa sa pinakabagong naka-publish na bersyon.',

  previewBanner: 'Preview: ito ang nakikita ng mga empleyado.',
  backToEditing: 'Bumalik sa pag-edit',
  backToEditor: 'Bumalik sa editor',
  draftWhen: (floor, when) => `${floor}, draft noong ${when}`,
  updatedWhen: (floor, when) => `${floor}, na-update noong ${when}`,
  listButton: 'Listahan ng mga puwesto at lugar',
  listButtonTitle: 'Listahan ng mga puwesto at lugar sa palapag na ito',
  refresh: 'I-refresh ang mapa',
  refreshTitle: 'Kunin ang pinakabagong bersyon',

  mapOf: (floor) => `Mapa ng ${floor}. Gamitin ang search box para maghanap ng puwesto o lugar.`,
  showWholeFloor: 'Ipakita ang buong palapag',
  youAreHere: 'Narito ka',
  floorShown: (floor) => `Ipinapakita ang ${floor}.`,
  floorShownWithRoute: (floor) => `Ipinapakita ang ${floor}, kasama ang ruta.`,

  searchPlaceholder: 'Maghanap ng puwesto, hal. B16',
  searchLabel: 'Maghanap ng parking',
  searchResults: 'Mga resulta',
  noMatchFor: (q) => `Walang puwesto o lugar na “${q}” sa mapang ito. Tingnan ang numero at subukan ulit.`,
  noMatches: 'Walang resulta',
  manyResults: (n) => `${n} na resulta ang ipinapakita. Mag-type pa para paliitin ang paghahanap.`,
  results: (n) => `${n} ${n === 1 ? 'resulta' : 'na resulta'}`,

  close: 'Isara',
  goInside: 'Pumasok',
  directions: 'Direksyon',
  linkCopied: 'Nakopya ang link',
  shareLinkTo: (name) => `Ibahagi ang link sa ${name}`,
  shareThis: 'Ibahagi ang link nito',
  accessibleSpace: 'Puwesto para sa may kapansanan',
  object: 'Item',

  floors: 'Mga palapag',
  outside: 'Labas',
  backOutsideTo: (floor) => `Bumalik sa labas, sa ${floor}`,
  allFloors: 'Lahat ng palapag',
  allFloorsLabel: 'Tanaw sa gilid ng lahat ng palapag',
  allFloorsTitle: 'Tingnan ang lahat ng palapag na magkakapatong, mula sa gilid',

  listOf: (floor) => `Mga puwesto at lugar sa ${floor}`,
  listCount: (n) => `${n} ${n === 1 ? 'item' : 'na item'}. Pumili ng isa para makita ito sa mapa.`,
  listEmpty: 'Wala pang may pangalan sa palapag na ito.',
  closeList: 'Isara ang listahan',

  sideView: 'Tanaw sa gilid',
  sideViewOf: (building) => `${building}, tanaw sa gilid`,
  tapAFloor: 'Pindutin ang palapag para buksan ito.',
  closeSideView: 'Isara ang tanaw sa gilid',
  ramp: 'Rampa',
  stairs: 'Hagdan',
  escalator: 'Escalator',
  elevator: 'Elevator',
  yourRoute: 'Ang ruta mo',
  noConnections: 'Wala pang rampa, hagdan o elevator na nagdurugtong sa mga palapag na ito sa mapa.',
  shownNow: 'ipinapakita ngayon',
  spaceCount: (n) => `${n} ${n === 1 ? 'puwesto' : 'na puwesto'}`,
  open: (floor) => `Buksan ang ${floor}`,

  directionsTo: (place) => `Direksyon papunta sa ${place}`,
  whereFrom: 'Saan ka manggagaling?',
  tapOnMap: 'Pindutin sa mapa kung nasaan ka',
  tapNow: 'Pindutin kung nasaan ka ngayon',
  cancel: 'Kanselahin',
  to: (place) => `Papunta sa ${place}`,
  finding: 'Hinahanap ang daan…',
  alreadyThere: 'Nandito ka na.',
  noWay: (from, noStairs) =>
    `Wala kaming nakitang daan papunta roon mula sa ${from}${noStairs ? ' nang hindi gumagamit ng hagdan' : ''}. Maaaring kulang sa mapa ang isang pinto, daanan o koneksyon ng palapag. Pakisabihan ang iyong manager na suriin ito.`,
  changeStart: 'Palitan ang simula',
  allowStairs: 'Payagan ang hagdan',
  avoidStairs: 'Iwasan ang hagdan',
  closeDirections: 'Isara ang direksyon',
  routeSummary: (feet, minutes, from) => `${feet} ft, mga ${minutes} min mula sa ${from}`,
  walkLength: (floor, feet) => `${floor}, ${feet} ft`,
  squeezed: 'Walang daanang nakaguhit dito, kaya dadaan ang rutang ito sa pagitan ng mga nakaparadang sasakyan. Mag-ingat.',

  sayPick: (place) => `Direksyon papunta sa ${place}. Saan ka manggagaling?`,
  sayTap: 'Pindutin sa mapa kung nasaan ka, o piliin ang Kanselahin para pumili sa listahan.',
  sayNoWay: (place, from) => `Walang nakitang daan papunta sa ${place} mula sa ${from}.`,
  sayRoute: (place, feet, minutes, steps) => `Direksyon papunta sa ${place}: ${feet} talampakan, mga ${minutes} minuto, ${steps} ${steps === 1 ? 'tagubilin' : 'na tagubilin'}.`,
  saySideView: (n) => `Tanaw sa gilid ng ${n} na palapag. Pumili ng palapag para buksan ito.`,
  sayList: (floor) => `Listahan ng mga puwesto at lugar sa ${floor}.`,

  publicFailed: 'Hindi ma-load ang mapang ito. Tingnan ang iyong koneksyon at subukan ulit.',
  publicNone: 'Walang pampublikong mapa sa link na ito. Baka inalis na ito, o nagbago ang link.',

  finishTitle: 'Tapusin ang pag-sign in',
  finishText: 'Mag-sign in sa Bergeron Maps sa device na ito.',
  signingIn: 'Nagsa-sign in…',
  checkEmail: 'Tingnan ang iyong email',
  sentTo: ['Nagpadala kami ng link at code para mag-sign in sa ', '.'],
  code: 'Code',
  signIn: 'Mag-sign in',
  differentEmail: 'Gumamit ng ibang email',
  notInInbox: 'Wala sa inbox mo? Tingnan ang spam. Mag-e-expire ang link at code sa loob ng isang oras.',
  signInToSite: 'Mag-sign in para buksan ang iyong site',
  noPassword: 'Padadalhan ka namin ng link sa email para mag-sign in. Hindi kailangan ng password.',
  workEmail: 'Email sa trabaho',
  sending: 'Ipinapadala…',
  emailMeLink: 'I-email sa akin ang link para mag-sign in',
  tryWithoutAccount: 'Subukan nang walang account',
  enterEmail: 'Ilagay ang iyong email sa trabaho.',
  enterCode: 'Ilagay ang code mula sa email. Ito ay may 6 na numero.',
  emailExample: 'name@company.com',
  signInProblem: (p) => {
    switch (p.kind) {
      case 'link': return 'Hindi gumana ang link para mag-sign in. Maaaring nag-expire na ito o nagamit na (may mga email system sa trabaho na nagbubukas ng mga link para i-scan ang mga ito). Ilagay ang iyong email para sa bagong link, o i-type na lang ang code mula sa email.';
      case 'badCode': return 'Hindi gumana ang code na iyan. Ihambing ito sa pinakabagong email (pinapalitan ng bawat bagong email ang naunang code), o magpadala ng bago.';
      case 'unavailable': return 'Hindi puwedeng mag-sign in dito.';
      case 'tooMany': return 'Masyadong maraming email para mag-sign in ang naipadala. Maghintay ng isang minuto at subukan ulit.';
      case 'wait': return `Kapapadala lang ng email para mag-sign in. Maghintay ng ${p.seconds} segundo bago humingi ng isa pa.`;
      case 'sendFailed': return `Hindi namin maipadala ang email para mag-sign in ngayon. Subukan ulit pagkalipas ng ilang minuto, o makipag-ugnayan sa ${SUPPORT_EMAIL} kung patuloy itong mangyari.`;
      case 'noAccount': return 'Wala pang account ang email na ito. Pakisabihan ang iyong manager o admin na idagdag ito.';
      case 'offline': return 'Hindi maabot ang server. Tingnan ang iyong koneksyon at subukan ulit.';
      case 'other': return 'Nagkaroon ng problema. Tingnan ang iyong koneksyon at subukan ulit.';
      case 'enterEmail': return tl.enterEmail;
      case 'enterCode': return tl.enterCode;
    }
  },
};
