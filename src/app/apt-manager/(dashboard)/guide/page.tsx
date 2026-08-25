const EQUIPMENT = [
  "절연저항 측정기 (500V, 100㏁)",
  "절연저항 측정기 (1,000V, 2,000㏁)",
  "클램프메타",
  "접지저항측정기",
  "멀티테스터기",
  "비접촉식 적외선 온도계",
  "특고압검전기",
  "저압검전기",
  "특고압 COS 조작봉",
  "고압절연장갑",
  "절연장화",
  "절연안전모"
];

const FAQS: { q: string; a: string }[] = [
  {
    q: "세대내 전기설비 점검의 법적 근거는?",
    a: "전기설비 소유자·점유자는 「전기안전관리법」 제22조에 따라 전기안전관리자를 선임해야 하고, 전기안전관리자는 「전기안전관리법 시행규칙」 제30조제2항 및 「전기안전관리자의 직무에 관한 고시」 제3조제4항에 따라 공동주택 세대내 전기설비에 대해 연차점검을 해야 합니다."
  },
  {
    q: "세대내 점검계획은 어떻게 세우나요?",
    a: "「직무고시」 제3조제2항에 따라 다수 세대의 특성을 고려해 안전관리규정을 작성하고 매년 점검계획을 수립합니다. 세대수가 많으면 월별로 분할해 연간 점검계획을 세우고, 전회 점검월을 고려해 주기적으로 점검하면 됩니다."
  },
  {
    q: "세대내 점검이 왜 필요한가요?",
    a: "공동주택은 다수가 상주하는 주거공간이라 화재 발생 시 대형 인명·재산피해가 우려됩니다. 이 때문에 산업통상자원부는 공동주택 세대내 점검기록표를 신설하고, 세대내 점검을 연 1회 이상 실시하도록 하고 있습니다."
  },
  {
    q: "점검 기록은 어떻게 작성·보존하나요?",
    a: "「전기안전관리법」 제24조제3항 및 시행규칙 제36조제1항에 따라 확인·점검 내용과 결과를 기록해 4년간 보존해야 합니다. 본 앱은 직무고시 별지 제15호 서식의 요건을 충족한 점검기록표 PDF를 점검 저장과 동시에 자동으로 발급·보관합니다."
  },
  {
    q: "전기안전관리자를 직접 고용하면 장비도 직접 갖춰야 하나요?",
    a: "네. 「전기안전관리법」 제22조제8항 및 시행규칙 제33조에 따라 전기안전관리자를 선임한 자는 시행규칙 별표10의 계측장비·안전장구를 보유해야 합니다. 아래 필요 장비 목록을 참고해주세요."
  },
  {
    q: "세대내 점검을 안 하면 어떻게 되나요?",
    a: "「전기안전관리법」 제52조(과태료) 제1항제5호에 따라 성실의무 위반 시 300만원 이하의 과태료가 부과될 수 있습니다. 이 의무는 전기안전관리자 본인에게 있으며, 본 앱은 그 의무를 무료로 쉽게 이행할 수 있도록 돕는 도구입니다."
  },
  {
    q: "세대내 전기기계기구는 어떻게 점검하나요?",
    a: "전기기계기구란 배선기구·조명장치·전동기·변압기·차단기 등을 말합니다. 절연 측정 시 손상 우려가 있는 기기는 분리 후 측정하고, 분리가 어려우면 시험전압을 250V DC로 낮춰 측정할 수 있습니다(KEC 132). 점검은 반드시 세대 소유자·점유자의 동의를 받아 실시하세요."
  }
];

export default function AptManagerGuidePage() {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xl font-bold text-dk-navy">점검가이드</p>
        <p className="mt-0.5 text-[15px] font-medium text-slate-500">
          산업통상자원부·한국전기기술인협회·한국전기안전공사 「공동주택 세대내 전기설비 점검가이드」 요약
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-[15px] font-bold text-dk-navy">이 앱에서의 점검절차</p>
        <ol className="mt-3 space-y-2 text-sm text-slate-700">
          <li>1. 관리사무소가 세대에 점검 목적·일정을 사전 공고합니다(안내문 게시, 방송, SMS 등).</li>
          <li>2. 세대 동의하에 방문해 <b>점검입력</b> 탭에서 직접 체크리스트를 입력합니다.</li>
          <li>3. AI가 별표3 기준으로 자동 판정하고, 점검기록표 PDF가 즉시 발급됩니다.</li>
          <li>4. 세대에 결과 카카오·SMS가 자동 발송됩니다(대경이엔피 발신).</li>
          <li>5. 부적합 항목은 세대에 수리·보수를 안내하고, 개수 완료 후 재점검을 등록합니다.</li>
          <li>6. 세대가 부재·거부한 경우 인입구배선·개폐기·차단기·접지저항 등 점검 가능한 항목만 <b>세대미방문 간이점검</b>으로 기록합니다.</li>
        </ol>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-[15px] font-bold text-dk-navy">점검 기록표 서식</p>
        <p className="mt-2 text-sm text-slate-600">
          「전기안전관리자의 직무에 관한 고시」 별지 제15호 서식의 확인사항(절연·배선·배선기구·접지 4개 부적합 항목군, 12개 확인사항)을
          그대로 반영합니다. <b>점검입력</b> 탭에서 저장하면 이 서식 요건을 충족한 PDF가 자동으로 발급되므로, 별도 양식을 따로 준비하실 필요는 없습니다.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-[15px] font-bold text-dk-navy">전기안전관리에 필요한 장비 (전기안전관리법 시행규칙 별표10)</p>
        <ul className="mt-2 grid grid-cols-1 gap-1.5 text-sm text-slate-700 sm:grid-cols-2">
          {EQUIPMENT.map((item) => (
            <li key={item} className="flex items-start gap-1.5">
              <span className="mt-0.5 text-dk-blue">·</span>
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-400">계측장비는 주기적으로 교정하고 안전장구는 시험해 성능을 적정하게 유지해야 합니다.</p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-[15px] font-bold text-dk-navy">자주 묻는 질문</p>
        <div className="mt-2 space-y-3">
          {FAQS.map((faq) => (
            <div key={faq.q} className="border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
              <p className="text-sm font-bold text-slate-800">Q. {faq.q}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
