import type { Messages } from './en';

/**
 * Chinese, simplified characters. Machine-drafted: a native speaker should
 * review it before it's promised to customers (see docs/LANGUAGES.md).
 */
const SYMBOLS: Record<string, string> = {
  'valet-booth': '代客泊车亭',
  'valet-podium': '代客泊车服务台',
  'valet-pickup': '取车区',
  'valet-dropoff': '交车区',
  'valet-staging': '车辆待停区',
  'valet-queue': '车辆排队区',
  gate: '大门',
  'garage-door': '车库门',
  'rollup-door': '卷帘服务门',
  ramp: '车库坡道',
  'ramp-up': '上行坡道',
  'ramp-down': '下行坡道',
  walkway: '人行通道',
  'ped-entrance': '行人入口',
  'ped-exit': '行人出口',
  'lobby-entrance': '大堂入口',
  'building-entrance': '大楼入口',
  'pedestrian-bridge': '人行天桥',
  stairs: '楼梯',
  stairwell: '楼梯间',
  elevator: '电梯',
  'elevator-bank': '电梯组',
  escalator: '自动扶梯',
  'elevator-lobby': '电梯厅',
  'vehicle-ramp': '车辆坡道',
  'level-up': '上一层指示',
  'level-down': '下一层指示',
  'floor-connection': '楼层连接',
  entrance: '车库入口',
  exit: '车库出口',
  'reception-desk': '前台',
  'pay-station': '售票亭',
  'info-desk': '服务台',
  'student-entrance': '学生入口',
  'staff-entrance': '教职员入口',
  'visitor-entrance': '访客入口',
  'bus-entrance': '巴士入口',
  'delivery-entrance': '送货入口',
  'security-checkpoint': '安检处',
  'access-gate': '门禁闸口',
  'accessible-ramp': '无障碍坡道',
  'valet-zone': '代客泊车区',
  'pin-general': '位置',
  'pin-guest-pickup': '客人上车点',
  'pin-dropoff': '交车点',
  'pin-meeting': '集合点',
  'pin-emergency-meeting': '紧急集合点',
  'pin-key-pickup': '取钥匙处',
  'pin-key-return': '还钥匙处',
  'pin-temporary': '临时标记',
  'pin-important': '重要地点',
  'pin-warning': '警示标记',
  'pin-custom': '标记',
  'pin-number': '数字标记',
  'pin-letter': '字母标记',
};

/**
 * Chinese puts a space between Chinese characters and Latin letters or digits
 * ("步行至 Elevator 1"), but none between Chinese characters. Names arrive
 * from the map in either script, so the spacing is worked out after the
 * sentence is put together.
 */
const HAN = '\\u4e00-\\u9fff';
const spaced = (text: string) =>
  text
    .replace(new RegExp(`([${HAN}])([A-Za-z0-9(])`, 'g'), '$1 $2')
    .replace(new RegExp(`([A-Za-z0-9)])([${HAN}])`, 'g'), '$1 $2');
const z = (strings: TemplateStringsArray, ...values: (string | number)[]) =>
  spaced(strings.reduce((out, part, i) => out + part + (i < values.length ? String(values[i]) : ''), ''));

const span = (a: string, b: string) => (a === b ? a : z`${a}至${b}`);

export const zh: Messages = {
  words: {
    space: (label) => z`车位${label}`,
    noNumber: '（无编号）',
    spot: '您选择的位置',
    symbol: (key) => SYMBOLS[key],
    place: '地点',
    accessible: '无障碍',
    goesTo: (floors) => z`通往${floors}`,
    walkTo: (place) => z`步行至${place}`,
    goInside: (b) => z`进入${b}`,
    leave: (b) => z`离开${b}`,
    // "经由" (by way of) fits elevators, stairs, escalators and ramps alike.
    take: (name) => z`经由${name}前往`,
    takeTo: (name, way, floor) =>
      way === 'up' ? z`经由${name}上行至${floor}` : way === 'down' ? z`经由${name}下行至${floor}` : z`经由${name}前往${floor}`,
    wayTo: (way, floor) => (way === 'up' ? z`上行至${floor}` : way === 'down' ? z`下行至${floor}` : z`前往${floor}`),
    places: '地点',
    row: (a, b) => z`车位排：${span(a, b)}`,
    otherSpaces: (a, b) => z`其他车位：${span(a, b)}`,
  },
  language: '语言',

  loading: '正在加载…',
  loadingMap: '正在加载地图…',
  tryAgain: '重试',
  allMaps: '所有地图',
  mapGone: '此地图无法打开，可能已被删除。',
  notPublished: '此地图尚未发布，或已被撤下。请联系您的经理发布地图。',
  loadFailed: '无法加载此地图的最新版本。请检查网络连接后重试。',
  mapUpdated: '地图已更新为最新发布的版本。',

  previewBanner: '预览：这是员工看到的页面。',
  backToEditing: '返回编辑',
  backToEditor: '返回编辑器',
  draftWhen: (floor, when) => z`${floor}，草稿保存于${when}`,
  updatedWhen: (floor, when) => z`${floor}，更新于${when}`,
  listButton: '车位和地点列表',
  listButtonTitle: '本层的车位和地点列表',
  refresh: '刷新地图',
  refreshTitle: '获取最新版本',

  mapOf: (floor) => z`${floor}的地图。请使用搜索框查找车位或地点。`,
  showWholeFloor: '显示整层',
  youAreHere: '您在这里',
  floorShown: (floor) => z`正在显示${floor}。`,
  floorShownWithRoute: (floor) => z`正在显示${floor}及路线。`,

  searchPlaceholder: '查找车位，例如 B16',
  searchLabel: '查找停车位',
  searchResults: '搜索结果',
  noMatchFor: (q) => z`此地图上没有名为“${q}”的车位或地点。请核对编号后重试。`,
  noMatches: '没有结果',
  manyResults: (n) => z`显示${n}个结果。请输入更多内容以缩小范围。`,
  results: (n) => z`${n}个结果`,

  close: '关闭',
  goInside: '进入',
  directions: '路线',
  linkCopied: '链接已复制',
  shareLinkTo: (name) => z`分享${name}的链接`,
  shareThis: '分享此地点的链接',
  accessibleSpace: '无障碍车位',
  object: '项目',

  floors: '楼层',
  outside: '室外',
  backOutsideTo: (floor) => z`返回室外：${floor}`,
  allFloors: '所有楼层',
  allFloorsLabel: '所有楼层的侧视图',
  allFloorsTitle: '从侧面查看所有楼层的叠放图',

  listOf: (floor) => z`${floor}的车位和地点`,
  listCount: (n) => z`共${n}项。选择一项即可在地图上查看。`,
  listEmpty: '本层还没有已命名的内容。',
  closeList: '关闭列表',

  sideView: '侧视图',
  sideViewOf: (building) => z`${building}侧视图`,
  tapAFloor: '点按楼层即可打开。',
  closeSideView: '关闭侧视图',
  ramp: '坡道',
  stairs: '楼梯',
  escalator: '自动扶梯',
  elevator: '电梯',
  yourRoute: '您的路线',
  noConnections: '地图上还没有连接这些楼层的坡道、楼梯或电梯。',
  shownNow: '当前显示',
  spaceCount: (n) => z`${n}个车位`,
  open: (floor) => z`打开${floor}`,

  directionsTo: (place) => z`前往${place}的路线`,
  whereFrom: '您从哪里出发？',
  tapOnMap: '在地图上点按您所在的位置',
  tapNow: '点按您现在所在的位置',
  cancel: '取消',
  to: (place) => z`前往${place}`,
  finding: '正在查找路线…',
  alreadyThere: '您已在此处。',
  noWay: (from, noStairs) =>
    z`找不到从${from}到达该处的${noStairs ? '无楼梯' : ''}路线。地图上可能缺少门、通道或楼层连接。请联系您的经理检查地图。`,
  changeStart: '更改起点',
  allowStairs: '允许走楼梯',
  avoidStairs: '避开楼梯',
  closeDirections: '关闭路线',
  routeSummary: (feet, minutes, from) => z`${feet}英尺，从${from}出发约需${minutes}分钟`,
  walkLength: (floor, feet) => z`${floor}，${feet}英尺`,
  squeezed: '此处地图上没有人行通道，因此这条路线会从停放的车辆之间穿过。请注意安全。',

  sayPick: (place) => z`前往${place}的路线。您从哪里出发？`,
  sayTap: '请在地图上点按您所在的位置，或选择“取消”从列表中选择。',
  sayNoWay: (place, from) => z`找不到从${from}到${place}的路线。`,
  sayRoute: (place, feet, minutes, steps) => z`前往${place}的路线：${feet}英尺，约需${minutes}分钟，共${steps}个步骤。`,
  saySideView: (n) => z`${n}个楼层的侧视图。选择一个楼层即可打开。`,
  sayList: (floor) => z`${floor}的车位和地点列表。`,

  publicFailed: '无法加载此地图。请检查网络连接后重试。',
  publicNone: '此链接下没有公开的地图。地图可能已下线，或链接已更改。',

  finishTitle: '完成登录',
  finishText: '在此设备上登录 Bergeron Maps。',
  signingIn: '正在登录…',
  checkEmail: '请查收邮件',
  sentTo: ['我们已将登录链接和验证码发送至 ', '。'],
  code: '验证码',
  signIn: '登录',
  differentEmail: '使用其他邮箱',
  notInInbox: '收件箱中没有？请查看垃圾邮件。链接和验证码将在一小时后失效。',
  signInToSite: '登录以打开您的场地',
  noPassword: '我们会通过邮件向您发送登录链接，无需密码。',
  workEmail: '工作邮箱',
  sending: '正在发送…',
  emailMeLink: '通过邮件发送登录链接',
  tryWithoutAccount: '无需账户，直接试用',
  enterEmail: '请输入您的工作邮箱地址。',
  enterCode: '请输入邮件中的验证码（6 位数字）。',
};
