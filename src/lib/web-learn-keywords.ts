export const SEARCH_KEYWORDS: { category: string; subcategory: string; keywords: string[] }[] = [
  // ── 전기법령 ──────────────────────────────────────────────────────────
  {
    category: '전기법령',
    subcategory: '설치기준',
    keywords: ['KEC 전기설비기준', '저압전기설비', '고압전기설비', '특고압설비', '전기설비 기술기준'],
  },
  {
    category: '전기법령',
    subcategory: '안전규정',
    keywords: ['전기안전관리법', '전기사업법', '전기공사업법', '전기용품안전기준', '전기재해예방'],
  },
  {
    category: '전기법령',
    subcategory: '검사/점검',
    keywords: ['사용전검사', '정기검사', '안전점검 의무', '전기안전관리자 선임', '자체점검'],
  },
  {
    category: '전기법령',
    subcategory: '접지/차단',
    keywords: ['접지공사 기준', '누전차단기 규정', '과전류차단기', '감전보호', '등전위본딩'],
  },

  // ── 전기기술 ──────────────────────────────────────────────────────────
  {
    category: '전기기술',
    subcategory: '차단기',
    keywords: ['누전차단기', '배선용차단기', '아크차단기', '차단기 용량계산', '차단기 교체주기', '차단기 교체 시공'],
  },
  {
    category: '전기기술',
    subcategory: '배선/배관',
    keywords: ['전기배선', '전선규격', '배관공사', '케이블트레이', '전선관 시공'],
  },
  {
    category: '전기기술',
    subcategory: '접지/절연',
    keywords: ['접지저항 측정', '절연저항 측정', '접지봉 시공', '절연파괴 원인'],
  },
  {
    category: '전기기술',
    subcategory: '수배전',
    keywords: ['분전반', '변압기', '전력량계', '수배전반', '큐비클 점검'],
  },
  {
    category: '전기기술',
    subcategory: '동력/제어',
    keywords: ['전동기', '인버터', '제어반', '스타델타기동', '전력제어'],
  },
  {
    category: '전기기술',
    subcategory: '신재생',
    keywords: ['태양광 설비', 'ESS 배터리', '스마트그리드'],
  },

  // ── 유튜브 ────────────────────────────────────────────────────────────
  {
    category: '유튜브',
    subcategory: '콘텐츠기획',
    keywords: ['전기안전 유튜브', '유튜브 썸네일 제작', '쇼츠 기획', '구독자 늘리기'],
  },
  {
    category: '유튜브',
    subcategory: '전기교육',
    keywords: ['전기기사 공부', '전기설비 유지보수', '전기공사 시공법', '아파트 전기점검'],
  },
  {
    category: '유튜브',
    subcategory: '생활전기',
    keywords: ['전기화재 예방', '누전 확인법', '전기요금 절약', '콘센트 안전사용'],
  },
  {
    category: '유튜브',
    subcategory: '수익화',
    keywords: ['유튜브 애드센스', '채널 수익화', '협찬 유치', '유튜브 쇼핑'],
  },

  // ── 마케팅 ────────────────────────────────────────────────────────────
  {
    category: '마케팅',
    subcategory: 'SEO전략',
    keywords: ['네이버 블로그 상위노출', '구글 SEO', '키워드 리서치', '검색엔진 최적화', 'C랭크 알고리즘'],
  },
  {
    category: '마케팅',
    subcategory: 'SNS운영',
    keywords: ['카카오채널 마케팅', '인스타그램 사업자', '페이스북 광고', '유튜브 채널운영'],
  },
  {
    category: '마케팅',
    subcategory: '콘텐츠',
    keywords: ['콘텐츠 마케팅 전략', '블로그 글쓰기', '카드뉴스 제작', '영상콘텐츠 기획'],
  },
  {
    category: '마케팅',
    subcategory: '광고',
    keywords: ['네이버 검색광고', '카카오 비즈보드', '구글 애즈', '리타겟팅 광고'],
  },
  {
    category: '마케팅',
    subcategory: '지역마케팅',
    keywords: ['지역업체 마케팅', '네이버 플레이스', '구글 비즈니스', '동네 홍보 전략'],
  },

  // ── AI자동화 ──────────────────────────────────────────────────────────
  {
    category: 'AI자동화',
    subcategory: '개발도구',
    keywords: ['Next.js AI', 'Supabase 벡터검색', 'Claude API', 'LangChain', 'LangGraph'],
  },
  {
    category: 'AI자동화',
    subcategory: 'RAG/임베딩',
    keywords: ['RAG 지식베이스', '벡터임베딩', 'Voyage AI', 'pgvector', '시맨틱검색'],
  },
  {
    category: 'AI자동화',
    subcategory: '자동화',
    keywords: ['AI 업무자동화', '챗봇 구축', '프롬프트 엔지니어링', 'AI 에이전트', '워크플로우 자동화'],
  },
  {
    category: 'AI자동화',
    subcategory: '비즈니스AI',
    keywords: ['생성AI 비즈니스', 'AI 도입 사례', 'GPT 활용', 'AI 보고서 자동화'],
  },
  {
    category: 'AI자동화',
    subcategory: '데이터',
    keywords: ['데이터 파이프라인', 'API 연동', '크롤링 자동화', '데이터 분석'],
  },

  // ── 사업경영 - 경영전략 ───────────────────────────────────────────────
  {
    category: '사업경영',
    subcategory: '창업',
    keywords: ['소상공인 창업', '사업계획서 작성', '업종선택', '창업 초기비용', 'BEP 분석'],
  },
  {
    category: '사업경영',
    subcategory: '운영',
    keywords: ['1인기업 운영', '수익모델 설계', '원가계산', '가격전략', '고객관리'],
  },
  {
    category: '사업경영',
    subcategory: '성장',
    keywords: ['사업확장 전략', '프랜차이즈 전환', '법인전환', '가맹점 모집', '브랜드화'],
  },

  // ── 사업경영 - 경리/회계 ─────────────────────────────────────────────
  {
    category: '사업경영',
    subcategory: '세금신고',
    keywords: ['부가가치세 신고', '종합소득세', '원천세 신고', '세금계산서 발행'],
  },
  {
    category: '사업경영',
    subcategory: '장부관리',
    keywords: ['간편장부', '복식부기', '매출매입 관리', '경비처리', '증빙서류'],
  },
  {
    category: '사업경영',
    subcategory: '절세전략',
    keywords: ['소상공인 절세', '사업자 공제항목', '차량 경비처리', '카드 경비처리'],
  },
  {
    category: '사업경영',
    subcategory: '급여',
    keywords: ['급여대장 작성', '원천징수', '4대보험 정산', '연말정산'],
  },

  // ── 사업경영 - 인사/노무 ─────────────────────────────────────────────
  {
    category: '사업경영',
    subcategory: '채용',
    keywords: ['직원 채용 절차', '구인공고 작성', '면접 진행', '수습기간 운영'],
  },
  {
    category: '사업경영',
    subcategory: '계약',
    keywords: ['근로계약서', '프리랜서 계약', '업무위탁 계약', '용역계약'],
  },
  {
    category: '사업경영',
    subcategory: '노무관리',
    keywords: ['최저임금 2026', '근로시간', '연차휴가', '퇴직금 계산', '해고 절차'],
  },
  {
    category: '사업경영',
    subcategory: '4대보험',
    keywords: ['고용보험', '산재보험', '건강보험', '국민연금 사업자'],
  },

  // ── 사업경영 - 정부지원 ──────────────────────────────────────────────
  {
    category: '사업경영',
    subcategory: '창업지원',
    keywords: ['소상공인24', '창업지원금', '청년창업', '예비창업패키지'],
  },
  {
    category: '사업경영',
    subcategory: '금융지원',
    keywords: ['기술보증기금', '소상공인 정책자금', '중소기업 대출', '신용보증'],
  },
  {
    category: '사업경영',
    subcategory: '기술지원',
    keywords: ['혁신바우처', '중소기업 R&D', 'AI 활용지원', '디지털전환 지원'],
  },
  {
    category: '사업경영',
    subcategory: '판로지원',
    keywords: ['온라인판로 지원', '수출지원', '공공조달', '나라장터'],
  },

  // ── 사업경영 - 법률/계약 ─────────────────────────────────────────────
  {
    category: '사업경영',
    subcategory: '계약서',
    keywords: ['사업자 계약서', '전자계약', '표준계약서', '하도급 계약'],
  },
  {
    category: '사업경영',
    subcategory: '분쟁',
    keywords: ['손해배상 책임', '분쟁조정', '소액심판', '내용증명 작성'],
  },
  {
    category: '사업경영',
    subcategory: '규정준수',
    keywords: ['개인정보보호법', '전자상거래법', '소비자보호법', '공정거래'],
  },

  // ── 사업경영 - 보험 ──────────────────────────────────────────────────
  {
    category: '사업경영',
    subcategory: '사업자보험',
    keywords: ['사업자 배상책임보험', '화재보험', '영업배상책임'],
  },
  {
    category: '사업경영',
    subcategory: '작업자보험',
    keywords: ['전기공사 보험', '작업자 상해보험', '산재보험 적용'],
  },
  {
    category: '사업경영',
    subcategory: '생명/건강',
    keywords: ['사업자 생명보험', '실손보험', '소득보장보험'],
  },

  // ── 일반/생활전기 ────────────────────────────────────────────────────
  {
    category: '일반',
    subcategory: '안전점검',
    keywords: ['아파트 전기점검', '가정용 전기안전', '차단기 점검', '전기화재 예방'],
  },
  {
    category: '일반',
    subcategory: '고장대처',
    keywords: ['차단기 내려감', '누전 확인법', '정전 대처', '콘센트 불꽃'],
  },
  {
    category: '일반',
    subcategory: '절약',
    keywords: ['전기요금 절약', '대기전력 차단', '고효율 가전', '전기요금 계산'],
  },
  {
    category: '일반',
    subcategory: '설치문의',
    keywords: ['콘센트 추가설치 및 교체', '조명교체', '차단기 교체'],
  },
];

// 크롤링 대상 사이트
export const CRAWL_TARGETS = [
  { url: 'https://www.kesco.or.kr', category: '전기법령', name: '한국전기안전공사' },
  { url: 'https://www.law.go.kr', category: '전기법령', name: '국가법령정보센터' },
  { url: 'https://www.keea.or.kr', category: '전기기술', name: '한국전기기술인협회' },
];
