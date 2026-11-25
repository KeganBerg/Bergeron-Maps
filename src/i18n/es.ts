import type { Messages } from './en';
import { SYMBOLS } from './symbols/es';
import { joinWith } from '../model/words';
import { SUPPORT_EMAIL } from '../support';

/**
 * Spanish. Machine-drafted: a native speaker should review it before it's
 * promised to customers (see docs/LANGUAGES.md).
 */

const WAY = { up: 'subir', down: 'bajar', across: 'cruzar' };
const span = (a: string, b: string) => (a === b ? a : `${a} a ${b}`);

export const es: Messages = {
  words: {
    space: (label) => `Espacio ${label}`,
    noNumber: '(sin número)',
    spot: 'el lugar que eligió',
    symbol: (key) => SYMBOLS[key],
    place: 'Lugar',
    accessible: 'Accesible',
    goesTo: (floors) => `Va a ${floors}`,
    walkTo: (place) => `Camine hasta ${place}`,
    goInside: (b) => `Entre en ${b}`,
    leave: (b) => `Salga de ${b}`,
    take: (name) => `Tome ${name}`,
    takeTo: (name, way, floor) => `Tome ${name} para ${WAY[way]} a ${floor}`,
    wayTo: (way, floor) => (way === 'up' ? `Suba a ${floor}` : way === 'down' ? `Baje a ${floor}` : `Cruce a ${floor}`),
    places: 'Lugares',
    row: (a, b) => `Fila: espacios ${span(a, b)}`,
    parts: joinWith(', '),
    list: joinWith(', '),
    otherSpaces: (a, b) => `Otros espacios: ${span(a, b)}`,
  },
  language: 'Idioma',

  loading: 'Cargando…',
  loadingMap: 'Cargando el mapa…',
  tryAgain: 'Intentar de nuevo',
  allMaps: 'Todos los mapas',
  mapGone: 'Este mapa no está disponible. Es posible que se haya eliminado.',
  notPublished: 'Este mapa todavía no está publicado, o se quitó. Pídale a su gerente que lo publique.',
  loadFailed: 'No se pudo cargar la versión más reciente de este mapa. Revise su conexión e intente de nuevo.',
  mapUpdated: 'El mapa se actualizó a la versión publicada más reciente.',

  previewBanner: 'Vista previa: así lo ven los empleados.',
  backToEditing: 'Volver a editar',
  backToEditor: 'Volver al editor',
  draftWhen: (floor, when) => `${floor}, borrador: ${when}`,
  updatedWhen: (floor, when) => `${floor}, actualizado: ${when}`,
  listButton: 'Lista de espacios y lugares',
  listButtonTitle: 'Lista de espacios y lugares de este piso',
  refresh: 'Actualizar el mapa',
  refreshTitle: 'Obtener la versión más reciente',

  mapOf: (floor) => `Mapa de ${floor}. Use el buscador para encontrar un espacio o un lugar.`,
  showWholeFloor: 'Ver todo el piso',
  youAreHere: 'Usted está aquí',
  floorShown: (floor) => `Se muestra ${floor}.`,
  floorShownWithRoute: (floor) => `Se muestra ${floor}, con la ruta.`,

  searchPlaceholder: 'Buscar un espacio, por ejemplo B16',
  searchLabel: 'Buscar un espacio de estacionamiento',
  searchResults: 'Resultados de la búsqueda',
  noMatchFor: (q) => `No hay ningún espacio ni lugar llamado “${q}” en este mapa. Revise el número e intente de nuevo.`,
  noMatches: 'Sin resultados',
  manyResults: (n) => `Se muestran ${n} resultados. Escriba más para afinar la búsqueda.`,
  results: (n) => (n === 1 ? '1 resultado' : `${n} resultados`),

  close: 'Cerrar',
  goInside: 'Entrar',
  directions: 'Cómo llegar',
  linkCopied: 'Enlace copiado',
  shareLinkTo: (name) => `Compartir un enlace a ${name}`,
  shareThis: 'Compartir un enlace a este lugar',
  accessibleSpace: 'Espacio accesible',
  object: 'Elemento',

  floors: 'Pisos',
  outside: 'Afuera',
  backOutsideTo: (floor) => `Volver al exterior: ${floor}`,
  allFloors: 'Todos los pisos',
  allFloorsLabel: 'Vista lateral de todos los pisos',
  allFloorsTitle: 'Ver todos los pisos apilados, vistos de lado',

  listOf: (floor) => `Espacios y lugares de ${floor}`,
  listCount: (n) => `${n} ${n === 1 ? 'elemento' : 'elementos'}. Elija uno para verlo en el mapa.`,
  listEmpty: 'Todavía no hay nada con nombre en este piso.',
  closeList: 'Cerrar la lista',

  sideView: 'Vista lateral',
  sideViewOf: (building) => `${building}, vista lateral`,
  tapAFloor: 'Toque un piso para abrirlo.',
  closeSideView: 'Cerrar la vista lateral',
  ramp: 'Rampa',
  stairs: 'Escaleras',
  escalator: 'Escalera eléctrica',
  elevator: 'Elevador',
  yourRoute: 'Su ruta',
  noConnections: 'Todavía no hay rampas, escaleras ni elevadores que unan estos pisos en el mapa.',
  shownNow: 'en pantalla',
  spaceCount: (n) => (n === 1 ? '1 espacio' : `${n} espacios`),
  open: (floor) => `Abrir ${floor}`,

  directionsTo: (place) => `Cómo llegar a ${place}`,
  whereFrom: '¿Desde dónde sale?',
  tapOnMap: 'Toque en el mapa el lugar donde está',
  tapNow: 'Toque el lugar donde está ahora',
  cancel: 'Cancelar',
  to: (place) => `Destino: ${place}`,
  finding: 'Buscando el camino…',
  alreadyThere: 'Ya está en ese lugar.',
  noWay: (from, noStairs) =>
    `No encontramos un camino hasta allí desde ${from}${noStairs ? ' sin usar escaleras' : ''}. Es posible que al mapa le falte una puerta, un pasillo o una conexión entre pisos. Pídale a su gerente que lo revise.`,
  changeStart: 'Cambiar el inicio',
  allowStairs: 'Permitir escaleras',
  avoidStairs: 'Evitar escaleras',
  closeDirections: 'Cerrar las indicaciones',
  routeSummary: (feet, minutes, from) => `${feet} pies, unos ${minutes} min desde ${from}`,
  walkLength: (floor, feet) => `${floor}, ${feet} pies`,
  squeezed: 'Aquí no hay un pasillo dibujado, así que este camino pasa entre autos estacionados. Tenga cuidado.',

  sayPick: (place) => `Cómo llegar a ${place}. ¿Desde dónde sale?`,
  sayTap: 'Toque en el mapa el lugar donde está, o elija Cancelar para escoger de una lista.',
  sayNoWay: (place, from) => `No se encontró un camino a ${place} desde ${from}.`,
  sayRoute: (place, feet, minutes, steps) =>
    `Cómo llegar a ${place}: ${feet} pies, unos ${minutes === 1 ? '1 minuto' : `${minutes} minutos`}, ${steps === 1 ? '1 indicación' : `${steps} indicaciones`}.`,
  saySideView: (n) => `Vista lateral de ${n} pisos. Elija un piso para abrirlo.`,
  sayList: (floor) => `Lista de espacios y lugares de ${floor}.`,

  publicFailed: 'No se pudo cargar este mapa. Revise su conexión e intente de nuevo.',
  publicNone: 'No hay ningún mapa público en este enlace. Es posible que se haya quitado o que el enlace haya cambiado.',

  finishTitle: 'Terminar de iniciar sesión',
  finishText: 'Inicie sesión en Bergeron Maps en este dispositivo.',
  signingIn: 'Iniciando sesión…',
  checkEmail: 'Revise su correo',
  sentTo: ['Enviamos un enlace y un código para iniciar sesión a ', '.'],
  code: 'Código',
  signIn: 'Iniciar sesión',
  differentEmail: 'Usar otro correo',
  notInInbox: '¿No está en su bandeja de entrada? Revise el correo no deseado. El enlace y el código vencen en una hora.',
  signInToSite: 'Inicie sesión para abrir su sitio',
  noPassword: 'Le enviaremos un enlace por correo para iniciar sesión. No necesita contraseña.',
  workEmail: 'Correo del trabajo',
  sending: 'Enviando…',
  emailMeLink: 'Enviarme un enlace para iniciar sesión',
  tryWithoutAccount: 'Probar sin una cuenta',
  enterEmail: 'Escriba su correo del trabajo.',
  enterCode: 'Escriba el código del correo. Tiene 6 dígitos.',
  emailExample: 'nombre@empresa.com',
  signInProblem: (p) => {
    switch (p.kind) {
      case 'link': return 'Ese enlace de inicio de sesión no funcionó. Puede que haya vencido o que ya se haya usado (algunos sistemas de correo del trabajo abren los enlaces para revisarlos). Escriba su correo para recibir un enlace nuevo, o escriba el código del correo.';
      case 'badCode': return 'Ese código no funcionó. Compárelo con el correo más reciente (cada correo nuevo reemplaza el código anterior), o pida uno nuevo.';
      case 'unavailable': return 'Aquí no se puede iniciar sesión.';
      case 'tooMany': return 'Se enviaron demasiados correos de inicio de sesión. Espere un minuto e intente de nuevo.';
      case 'wait': return `Se acaba de enviar un correo de inicio de sesión. Espere ${p.seconds} segundos antes de pedir otro.`;
      case 'sendFailed': return `No pudimos enviar el correo de inicio de sesión en este momento. Intente de nuevo en unos minutos o, si el problema continúa, escriba a ${SUPPORT_EMAIL}.`;
      case 'noAccount': return 'Este correo todavía no tiene una cuenta. Pídale a su gerente o administrador que lo agregue.';
      case 'offline': return 'No se puede conectar con el servidor. Revise su conexión e intente de nuevo.';
      case 'other': return 'Algo salió mal. Revise su conexión e intente de nuevo.';
      case 'enterEmail': return es.enterEmail;
      case 'enterCode': return es.enterCode;
    }
  },
};
