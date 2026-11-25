import type { Messages } from './en';
import { joinWith } from '../model/words';
import { SUPPORT_EMAIL } from '../support';

/**
 * Vietnamese. Machine-drafted: a native speaker should review it before it's
 * promised to customers (see docs/LANGUAGES.md).
 */
const SYMBOLS: Record<string, string> = {
  'valet-booth': 'Quầy giữ xe hộ',
  'valet-podium': 'Bục giữ xe hộ',
  'valet-pickup': 'Khu nhận xe',
  'valet-dropoff': 'Khu giao xe',
  'valet-staging': 'Khu xe chờ',
  'valet-queue': 'Hàng xe chờ',
  gate: 'Cổng',
  'garage-door': 'Cửa nhà xe',
  'rollup-door': 'Cửa cuốn dịch vụ',
  ramp: 'Dốc nhà xe',
  'ramp-up': 'Dốc lên',
  'ramp-down': 'Dốc xuống',
  walkway: 'Lối đi bộ',
  'ped-entrance': 'Lối vào cho người đi bộ',
  'ped-exit': 'Lối ra cho người đi bộ',
  'lobby-entrance': 'Lối vào sảnh',
  'building-entrance': 'Lối vào tòa nhà',
  'pedestrian-bridge': 'Cầu đi bộ',
  stairs: 'Cầu thang',
  stairwell: 'Lồng cầu thang',
  elevator: 'Thang máy',
  'elevator-bank': 'Dãy thang máy',
  escalator: 'Thang cuốn',
  'elevator-lobby': 'Sảnh thang máy',
  'vehicle-ramp': 'Dốc cho xe',
  'level-up': 'Biển chỉ lên tầng trên',
  'level-down': 'Biển chỉ xuống tầng dưới',
  'floor-connection': 'Lối nối giữa các tầng',
  entrance: 'Lối vào nhà xe',
  exit: 'Lối ra nhà xe',
  'reception-desk': 'Quầy lễ tân',
  'pay-station': 'Quầy bán vé',
  'info-desk': 'Quầy thông tin',
  'student-entrance': 'Lối vào cho học sinh',
  'staff-entrance': 'Lối vào cho giáo viên và nhân viên',
  'visitor-entrance': 'Lối vào cho khách',
  'bus-entrance': 'Lối vào cho xe buýt',
  'delivery-entrance': 'Lối vào giao hàng',
  'security-checkpoint': 'Trạm kiểm tra an ninh',
  'access-gate': 'Cổng kiểm soát ra vào',
  'accessible-ramp': 'Dốc cho người khuyết tật',
  'valet-zone': 'Khu giữ xe hộ',
  'pin-general': 'Vị trí',
  'pin-guest-pickup': 'Điểm đón khách',
  'pin-dropoff': 'Điểm giao xe',
  'pin-meeting': 'Điểm hẹn',
  'pin-emergency-meeting': 'Điểm tập trung khẩn cấp',
  'pin-key-pickup': 'Điểm nhận chìa khóa',
  'pin-key-return': 'Điểm trả chìa khóa',
  'pin-temporary': 'Dấu tạm thời',
  'pin-important': 'Địa điểm quan trọng',
  'pin-warning': 'Dấu cảnh báo',
  'pin-custom': 'Dấu',
  'pin-number': 'Dấu có số',
  'pin-letter': 'Dấu có chữ',
};

const WAY = { up: 'lên', down: 'xuống', across: 'sang' };
const span = (a: string, b: string) => (a === b ? a : `${a} đến ${b}`);

export const vi: Messages = {
  words: {
    space: (label) => `Chỗ đậu ${label}`,
    noNumber: '(chưa có số)',
    spot: 'vị trí bạn đã chọn',
    symbol: (key) => SYMBOLS[key],
    place: 'Địa điểm',
    accessible: 'Cho người khuyết tật',
    goesTo: (floors) => `Đi đến ${floors}`,
    walkTo: (place) => `Đi bộ đến ${place}`,
    goInside: (b) => `Đi vào ${b}`,
    leave: (b) => `Ra khỏi ${b}`,
    take: (name) => `Đi ${name}`,
    takeTo: (name, way, floor) => `Đi ${name} ${WAY[way]} ${floor}`,
    wayTo: (way, floor) => `${WAY[way][0].toUpperCase()}${WAY[way].slice(1)} ${floor}`,
    places: 'Địa điểm',
    row: (a, b) => `Hàng: chỗ đậu ${span(a, b)}`,
    parts: joinWith(', '),
    list: joinWith(', '),
    otherSpaces: (a, b) => `Các chỗ đậu khác: ${span(a, b)}`,
  },
  language: 'Ngôn ngữ',

  loading: 'Đang tải…',
  loadingMap: 'Đang tải bản đồ…',
  tryAgain: 'Thử lại',
  allMaps: 'Tất cả bản đồ',
  mapGone: 'Không mở được bản đồ này. Có thể bản đồ đã bị xóa.',
  notPublished: 'Bản đồ này chưa được đăng, hoặc đã bị gỡ xuống. Hãy nhờ quản lý của bạn đăng bản đồ.',
  loadFailed: 'Không tải được phiên bản mới nhất của bản đồ này. Hãy kiểm tra kết nối rồi thử lại.',
  mapUpdated: 'Bản đồ đã được cập nhật lên phiên bản mới nhất.',

  previewBanner: 'Xem trước: đây là màn hình nhân viên nhìn thấy.',
  backToEditing: 'Quay lại chỉnh sửa',
  backToEditor: 'Quay lại trình chỉnh sửa',
  draftWhen: (floor, when) => `${floor}, bản nháp ${when}`,
  updatedWhen: (floor, when) => `${floor}, cập nhật ${when}`,
  listButton: 'Danh sách chỗ đậu và địa điểm',
  listButtonTitle: 'Danh sách chỗ đậu và địa điểm trên tầng này',
  refresh: 'Làm mới bản đồ',
  refreshTitle: 'Lấy phiên bản mới nhất',

  mapOf: (floor) => `Bản đồ ${floor}. Dùng ô tìm kiếm để tìm chỗ đậu hoặc địa điểm.`,
  showWholeFloor: 'Xem cả tầng',
  youAreHere: 'Bạn đang ở đây',
  floorShown: (floor) => `Đang hiển thị ${floor}.`,
  floorShownWithRoute: (floor) => `Đang hiển thị ${floor}, có đường đi.`,

  searchPlaceholder: 'Tìm chỗ đậu, ví dụ B16',
  searchLabel: 'Tìm chỗ đậu xe',
  searchResults: 'Kết quả tìm kiếm',
  noMatchFor: (q) => `Không có chỗ đậu hay địa điểm nào tên “${q}” trên bản đồ này. Hãy kiểm tra số rồi thử lại.`,
  noMatches: 'Không có kết quả',
  manyResults: (n) => `Đang hiển thị ${n} kết quả. Gõ thêm để thu hẹp.`,
  results: (n) => `${n} kết quả`,

  close: 'Đóng',
  goInside: 'Đi vào trong',
  directions: 'Chỉ đường',
  linkCopied: 'Đã sao chép liên kết',
  shareLinkTo: (name) => `Chia sẻ liên kết đến ${name}`,
  shareThis: 'Chia sẻ liên kết đến địa điểm này',
  accessibleSpace: 'Chỗ đậu cho người khuyết tật',
  object: 'Mục',

  floors: 'Các tầng',
  outside: 'Bên ngoài',
  backOutsideTo: (floor) => `Quay ra ngoài, về ${floor}`,
  allFloors: 'Tất cả các tầng',
  allFloorsLabel: 'Góc nhìn bên của tất cả các tầng',
  allFloorsTitle: 'Xem tất cả các tầng xếp chồng, nhìn từ bên cạnh',

  listOf: (floor) => `Chỗ đậu và địa điểm trên ${floor}`,
  listCount: (n) => `${n} mục. Chọn một mục để xem trên bản đồ.`,
  listEmpty: 'Tầng này chưa có gì được đặt tên.',
  closeList: 'Đóng danh sách',

  sideView: 'Góc nhìn bên',
  sideViewOf: (building) => `${building}, góc nhìn bên`,
  tapAFloor: 'Chạm vào một tầng để mở.',
  closeSideView: 'Đóng góc nhìn bên',
  ramp: 'Dốc',
  stairs: 'Cầu thang',
  escalator: 'Thang cuốn',
  elevator: 'Thang máy',
  yourRoute: 'Đường đi của bạn',
  noConnections: 'Trên bản đồ chưa có dốc, cầu thang hay thang máy nào nối các tầng này.',
  shownNow: 'đang hiển thị',
  spaceCount: (n) => `${n} chỗ đậu`,
  open: (floor) => `Mở ${floor}`,

  directionsTo: (place) => `Chỉ đường đến ${place}`,
  whereFrom: 'Bạn bắt đầu từ đâu?',
  tapOnMap: 'Chạm vào vị trí của bạn trên bản đồ',
  tapNow: 'Chạm vào vị trí hiện tại của bạn',
  cancel: 'Hủy',
  to: (place) => `Đến ${place}`,
  finding: 'Đang tìm đường…',
  alreadyThere: 'Bạn đã ở đó rồi.',
  noWay: (from, noStairs) =>
    `Chúng tôi không tìm được đường đến đó từ ${from}${noStairs ? ' mà không đi cầu thang' : ''}. Có thể bản đồ thiếu cửa, lối đi hoặc lối nối giữa các tầng. Hãy nhờ quản lý của bạn kiểm tra.`,
  changeStart: 'Đổi điểm bắt đầu',
  allowStairs: 'Cho phép đi cầu thang',
  avoidStairs: 'Tránh cầu thang',
  closeDirections: 'Đóng chỉ đường',
  routeSummary: (feet, minutes, from) => `${feet} ft, khoảng ${minutes} phút từ ${from}`,
  walkLength: (floor, feet) => `${floor}, ${feet} ft`,
  squeezed: 'Ở đây không có lối đi bộ được vẽ, nên đường này đi giữa các xe đang đậu. Hãy cẩn thận.',

  sayPick: (place) => `Chỉ đường đến ${place}. Bạn bắt đầu từ đâu?`,
  sayTap: 'Chạm vào vị trí của bạn trên bản đồ, hoặc chọn Hủy để chọn từ danh sách.',
  sayNoWay: (place, from) => `Không tìm được đường đến ${place} từ ${from}.`,
  sayRoute: (place, feet, minutes, steps) => `Chỉ đường đến ${place}: ${feet} feet, khoảng ${minutes} phút, ${steps} bước chỉ dẫn.`,
  saySideView: (n) => `Góc nhìn bên của ${n} tầng. Chọn một tầng để mở.`,
  sayList: (floor) => `Danh sách chỗ đậu và địa điểm trên ${floor}.`,

  publicFailed: 'Không tải được bản đồ này. Hãy kiểm tra kết nối rồi thử lại.',
  publicNone: 'Không có bản đồ công khai nào ở liên kết này. Có thể nó đã bị gỡ, hoặc liên kết đã thay đổi.',

  finishTitle: 'Hoàn tất đăng nhập',
  finishText: 'Đăng nhập Bergeron Maps trên thiết bị này.',
  signingIn: 'Đang đăng nhập…',
  checkEmail: 'Hãy kiểm tra email',
  sentTo: ['Chúng tôi đã gửi liên kết và mã đăng nhập đến ', '.'],
  code: 'Mã',
  signIn: 'Đăng nhập',
  differentEmail: 'Dùng email khác',
  notInInbox: 'Không thấy trong hộp thư đến? Hãy xem thư rác. Liên kết và mã hết hạn sau một giờ.',
  signInToSite: 'Đăng nhập để mở cơ sở của bạn',
  noPassword: 'Chúng tôi sẽ gửi email cho bạn một liên kết để đăng nhập. Không cần mật khẩu.',
  workEmail: 'Email công việc',
  sending: 'Đang gửi…',
  emailMeLink: 'Gửi cho tôi liên kết đăng nhập',
  tryWithoutAccount: 'Dùng thử không cần tài khoản',
  enterEmail: 'Hãy nhập địa chỉ email công việc của bạn.',
  enterCode: 'Hãy nhập mã trong email. Mã có 6 chữ số.',
  emailExample: 'ten@congty.com',
  signInProblem: (p) => {
    switch (p.kind) {
      case 'link': return 'Liên kết đăng nhập này không dùng được. Có thể liên kết đã hết hạn hoặc đã được dùng (một số hệ thống email công việc tự mở liên kết để quét). Hãy nhập email để nhận liên kết mới, hoặc nhập mã trong email.';
      case 'badCode': return 'Mã này không đúng. Hãy đối chiếu với email mới nhất (mỗi email mới sẽ thay thế mã trước đó), hoặc gửi mã mới.';
      case 'unavailable': return 'Không thể đăng nhập ở đây.';
      case 'tooMany': return 'Đã gửi quá nhiều email đăng nhập. Hãy đợi một phút rồi thử lại.';
      case 'wait': return `Email đăng nhập vừa được gửi. Hãy đợi ${p.seconds} giây trước khi yêu cầu email khác.`;
      case 'sendFailed': return `Hiện chưa gửi được email đăng nhập. Hãy thử lại sau vài phút, hoặc liên hệ ${SUPPORT_EMAIL} nếu lỗi vẫn tiếp diễn.`;
      case 'noAccount': return 'Email này chưa có tài khoản. Hãy nhờ quản lý hoặc quản trị viên của bạn thêm email này.';
      case 'offline': return 'Không kết nối được với máy chủ. Hãy kiểm tra kết nối rồi thử lại.';
      case 'other': return 'Đã xảy ra lỗi. Hãy kiểm tra kết nối rồi thử lại.';
      case 'enterEmail': return vi.enterEmail;
      case 'enterCode': return vi.enterCode;
    }
  },
};
