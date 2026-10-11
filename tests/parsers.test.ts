import assert from "node:assert/strict";
import test from "node:test";
import { parsePurchaseMail } from "../lib/aladinMail";
import { parseBookit, parseCsv, parseRereads } from "../lib/bookit";
import { authorNames, coreTitle } from "../lib/catalog";

test("CSV: quoted commas, doubled quotes and newlines", () => {
  const rows = parseCsv('"a","b, c","say ""hi""","line1\nline2"\n"x","","",""\n');
  assert.deepEqual(rows[0], ["a", "b, c", 'say "hi"', "line1\nline2"]);
  assert.equal(rows.length, 2);
});

test("북적북적 export: statuses, placeholder dates, re-reads", () => {
  const csv = [
    '"인덱스","제목","저자","출판사","독서상태","생성일","시작일","읽은 날짜","중단일","메모1"',
    '"1","방해자 1","오쿠다 히데오","북스토리","읽은 책","2021-07-17","2020-12-31","2020-12-31","",""',
    '"2","돈의 심리학","모건 하우절","인플루엔셜(주)","읽은 책","2023-01-24","2023-01-24","2023-01-30","","2회차 24.1.28 완료"',
    '"3","유클리드의 창","레너드 믈로디노프","까치","읽고 싶은 책","2023-09-08","","","",""',
    '"4","Stick 스틱!","칩 히스","웅진지식하우스","중단한 책","2024-10-02","2024-10-02","","2024-10-05",""',
  ].join("\n");
  const [old, money, want, stopped] = parseBookit(csv);
  assert.equal(old.status, "finished");
  assert.equal(old.datesUnknown, true);
  assert.equal(old.finishedAt, null);
  assert.equal(old.key, "2021-07-17|방해자1");
  assert.deepEqual(money.rereads, [{ round: 2, finishedAt: "2024-01-28" }]);
  assert.equal(want.status, "want");
  assert.equal(stopped.status, "stopped");
  assert.equal(stopped.stoppedAt, "2024-10-05");
});

test("re-read notes in the memo", () => {
  assert.deepEqual(parseRereads("24. 11. 10일 2회차독"), [{ round: 2, finishedAt: "2024-11-10" }]);
  assert.deepEqual(parseRereads("24.6.18 2회독"), [{ round: 2, finishedAt: "2024-06-18" }]);
  assert.deepEqual(parseRereads("2권을 기다리자"), []);
});

test("title core and author names for edition matching", () => {
  assert.equal(coreTitle("돈의 심리학 - 당신은 왜 부자가 되지 못했는가"), "돈의심리학");
  assert.equal(coreTitle("[세트] 제로 투 원 + 경영의 모험 - 전2권"), "제로투원+경영의모험");
  assert.equal(coreTitle("로스트 심벌 2/완결"), "로스트심벌2");
  assert.deepEqual(authorNames("피터 린치, 존 로스차일드 (지은이), 고영태 (옮긴이)"), ["피터린치", "존로스차일드", "고영태"]);
  assert.deepEqual(authorNames("마크 오언|케빈 모러"), ["마크오언", "케빈모러"]);
});

const row = (itemId: string, title: string, qty: number, unit: string, price: string) => `
  <tr>
    <td><a href="https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=${itemId}" target="_blank">${title}</a>
      <div style='font-size:11px'>지은이 / 출판사</div></td>
    <td><strong style="font-size:11px">${qty}</strong>${unit}</td>
    <td><strong style="font-size:11px; color:#3161ce">${price}</strong>원</td>
  </tr>`;

test("store purchase mail", () => {
  const html = `<table><tr><td>알라딘을 이용해 주셔서 정말 감사합니다.<br/><strong>홍길동</strong>님께서 2026-09-11, 분당서현점에서 구매하신 내용입니다.</td></tr>
    <tr><td>상품명</td><td>수량</td><td>가격</td></tr>
    ${row("401921463", "[중고] 더 위험한 과학책", 1, "권", "13,600")}
    ${row("187041413", "봉투 - 200원", 2, "개", "200")}</table>`;
  const mail = parsePurchaseMail("감사합니다. 홍길동님의 중고매장 구매내용을 알려드립니다.", html, "2026-09-12");
  assert.ok(mail);
  assert.equal(mail.kind, "store");
  assert.equal(mail.purchasedAt, "2026-09-11");
  assert.equal(mail.store, "분당서현점");
  assert.deepEqual(mail.lines[0], { itemId: "401921463", title: "더 위험한 과학책", quantity: 1, price: 13600, condition: "used" });
  assert.equal(mail.lines[1].quantity, 2);
});

test("online order mail", () => {
  const html = `<table><tr><td>주문일</td><td>2026년 7월 5일 일요일 00시33분</td></tr>
    <tr><td>주문번호</td><td>001-A640359298</td></tr>
    ${row("394450559", "돈 때문에 불안하다는 착각 - 경제적 불안을 권하는 사회에서", 1, "권", "18,000")}</table>`;
  const mail = parsePurchaseMail("감사합니다. 홍길동님의 주문을 접수하였습니다.", html, "2026-07-04");
  assert.ok(mail);
  assert.equal(mail.kind, "online");
  assert.equal(mail.purchasedAt, "2026-07-05");
  assert.equal(mail.orderNo, "001-A640359298");
  assert.equal(mail.lines[0].condition, "new");
  assert.equal(mail.lines[0].price, 18000);
  assert.equal(parsePurchaseMail("상품을 발송하였습니다.", html, "2026-07-04"), null);
});
