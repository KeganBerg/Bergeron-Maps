import { ENGLISH } from '../model/words';

/**
 * Everything the map viewer, public map links and sign-in say, in English.
 * The other languages (es.ts, zh.ts, tl.ts, vi.ts) have the same keys; the
 * Messages type below makes TypeScript refuse one with a key missing.
 * Functions are for sentences with a name or number in them, so each
 * language can put the words in its own order and handle its own plurals.
 */
export const en = {
  /** The words map logic uses: space names, route steps, floor list groups. */
  words: ENGLISH,
  language: 'Language',

  // Loading and errors
  loading: 'Loading…',
  loadingMap: 'Loading map…',
  tryAgain: 'Try again',
  allMaps: 'All maps',
  mapGone: 'This map isn’t available. It may have been deleted.',
  notPublished: 'This map isn’t published yet, or it was removed. Ask your manager to publish it.',
  loadFailed: 'The latest version of this map couldn’t be loaded. Check your connection and try again.',
  mapUpdated: 'The map was updated to the latest published version.',

  // Header and preview
  previewBanner: 'Preview: this is the employee view.',
  backToEditing: 'Back to editing',
  backToEditor: 'Back to editor',
  draftWhen: (floor: string, when: string) => `${floor}, draft ${when}`,
  updatedWhen: (floor: string, when: string) => `${floor}, updated ${when}`,
  listButton: 'List of spaces and places',
  listButtonTitle: 'List of spaces and places on this floor',
  refresh: 'Refresh map',
  refreshTitle: 'Get the latest version',

  // The map
  mapOf: (floor: string) => `Map of ${floor}. Use the search box to find a space or place.`,
  showWholeFloor: 'Show whole floor',
  youAreHere: 'You are here',
  floorShown: (floor: string) => `${floor} shown.`,
  floorShownWithRoute: (floor: string) => `${floor} shown, with the route.`,

  // Search
  searchPlaceholder: 'Find a space, e.g. B16',
  searchLabel: 'Find a parking space',
  searchResults: 'Search results',
  noMatchFor: (q: string) => `No space or landmark called “${q}” on this map. Check the number and try again.`,
  noMatches: 'No matches',
  manyResults: (n: number) => `${n} results shown. Type more to narrow them down.`,
  results: (n: number) => (n === 1 ? '1 result' : `${n} results`),

  // The card about what was picked
  close: 'Close',
  goInside: 'Go inside',
  directions: 'Directions',
  linkCopied: 'Link copied',
  shareLinkTo: (name: string) => `Share a link to ${name}`,
  shareThis: 'Share a link to this',
  accessibleSpace: 'Accessible space',
  object: 'Object',

  // Floors
  floors: 'Floors',
  outside: 'Outside',
  backOutsideTo: (floor: string) => `Back outside to ${floor}`,
  allFloors: 'All floors',
  allFloorsLabel: 'Side view of all floors',
  allFloorsTitle: 'See every floor stacked, side on',

  // The floor as a list
  listOf: (floor: string) => `Spaces and places on ${floor}`,
  listCount: (n: number) => `${n} ${n === 1 ? 'item' : 'items'}. Pick one to see it on the map.`,
  listEmpty: 'Nothing on this floor is named yet.',
  closeList: 'Close list',

  // Side view
  sideView: 'Side view',
  sideViewOf: (building: string) => `${building}, side view`,
  tapAFloor: 'Tap a floor to open it.',
  closeSideView: 'Close side view',
  ramp: 'Ramp',
  stairs: 'Stairs',
  escalator: 'Escalator',
  elevator: 'Elevator',
  yourRoute: 'Your route',
  noConnections: 'No ramps, stairs or elevators connect these floors on the map yet.',
  shownNow: 'shown now',
  spaceCount: (n: number) => (n === 1 ? '1 space' : `${n} spaces`),
  open: (floor: string) => `Open ${floor}`,

  // Directions
  directionsTo: (place: string) => `Directions to ${place}`,
  whereFrom: 'Where are you starting from?',
  tapOnMap: 'Tap where you are on the map',
  tapNow: 'Tap where you are now',
  cancel: 'Cancel',
  to: (place: string) => `To ${place}`,
  finding: 'Finding the way…',
  alreadyThere: 'You’re already there.',
  noWay: (from: string, noStairs: boolean) =>
    `We couldn’t find a way there from ${from}${noStairs ? ' without stairs' : ''}. The map may be missing a door, walkway or floor connection. Ask your manager to check it.`,
  changeStart: 'Change start',
  allowStairs: 'Allow stairs',
  avoidStairs: 'Avoid stairs',
  closeDirections: 'Close directions',
  routeSummary: (feet: number, minutes: number, from: string) => `${feet} ft, about ${minutes} min from ${from}`,
  walkLength: (floor: string, feet: number) => `${floor}, ${feet} ft`,
  squeezed: 'No walkway is drawn here, so this way goes between parked cars. Take care.',

  // Read aloud by screen readers
  sayPick: (place: string) => `Directions to ${place}. Where are you starting from?`,
  sayTap: 'Tap where you are on the map, or choose Cancel to pick from a list.',
  sayNoWay: (place: string, from: string) => `No way found to ${place} from ${from}.`,
  sayRoute: (place: string, feet: number, minutes: number, steps: number) =>
    `Directions to ${place}: ${feet} feet, about ${minutes === 1 ? '1 minute' : `${minutes} minutes`}, ${steps === 1 ? '1 step' : `${steps} steps`}.`,
  saySideView: (n: number) => `Side view of ${n} floors. Pick a floor to open it.`,
  sayList: (floor: string) => `List of spaces and places on ${floor}.`,

  // Public map links
  publicFailed: 'This map couldn’t be loaded. Check your connection and try again.',
  publicNone: 'There’s no public map at this link. It may have been taken offline, or the link changed.',

  // Sign-in
  finishTitle: 'Finish signing in',
  finishText: 'Sign in to Bergeron Maps on this device.',
  signingIn: 'Signing in…',
  checkEmail: 'Check your email',
  /** Split around the email address, which is shown in bold between the two parts. */
  sentTo: ['We sent a sign-in link and code to ', '.'] as [string, string],
  code: 'Code',
  signIn: 'Sign in',
  differentEmail: 'Use a different email',
  notInInbox: 'Not in your inbox? Check spam. The link and code expire in an hour.',
  signInToSite: 'Sign in to open your site',
  noPassword: 'We’ll email you a link to sign in. No password needed.',
  workEmail: 'Work email',
  sending: 'Sending…',
  emailMeLink: 'Email me a sign-in link',
  tryWithoutAccount: 'Try it without an account',
  enterEmail: 'Enter your work email address.',
  enterCode: 'Enter the code from the email. It’s 6 digits.',
};

export type Messages = typeof en;
