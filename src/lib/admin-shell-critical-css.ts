/**
 * 관리자 레이아웃에 인라인으로 삽입합니다.
 * Tailwind CSS 청크( app/layout.css ) 로드 실패·지연 시에도 셸·사이드바·본문 폭·메인화면 카드가 붕괴하지 않도록 합니다.
 */
export const ADMIN_SHELL_CRITICAL_CSS = `
[data-dk-admin-root] {
  display: flex !important;
  flex-direction: row !important;
  align-items: stretch !important;
  min-height: 100vh !important;
  box-sizing: border-box !important;
  background-color: #f1f5f9 !important;
  color: #0f172a !important;
}
[data-dk-admin-root] > aside {
  flex: 0 0 auto !important;
  width: 280px !important;
  max-width: min(280px, 100vw) !important;
  box-sizing: border-box !important;
  display: flex !important;
  flex-direction: column !important;
  border-right: 1px solid #cbd5e1 !important;
  border-top: 3px solid #F5A623 !important;
  background: linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%) !important;
}
[data-dk-admin-root] > aside ul {
  list-style: none !important;
  list-style-type: none !important;
  margin: 0 !important;
  padding: 0.25rem 0 !important;
}
[data-dk-admin-root] > aside ul > li {
  list-style: none !important;
  list-style-type: none !important;
  margin: 0.12rem 0 !important;
  padding: 0 !important;
}
[data-dk-admin-root] aside button.dk-admin-shell-nav-btn {
  display: flex !important;
  width: 100% !important;
  align-items: center !important;
  gap: 0.5rem !important;
  padding: 0.5rem 0.75rem !important;
  border: none !important;
  border-left: 3px solid transparent !important;
  border-radius: 0.375rem !important;
  background: transparent !important;
  cursor: pointer !important;
  text-align: left !important;
  font-size: 0.875rem !important;
  font-weight: 600 !important;
  color: #334155 !important;
  font-family: inherit !important;
}
[data-dk-admin-root] aside button.dk-admin-shell-nav-btn:hover {
  background: rgba(148, 163, 184, 0.38) !important;
}
[data-dk-admin-root] aside button.dk-admin-shell-nav-btn[data-active="true"] {
  border-left-color: #F5A623 !important;
  background: #0B1F3A !important;
  color: #ffffff !important;
}
[data-dk-admin-root] > .dk-admin-main {
  flex: 1 1 0% !important;
  min-width: 0 !important;
  min-height: 100vh !important;
  overflow: auto !important;
  box-sizing: border-box !important;
  background-color: #ffffff !important;
  color: #0f172a !important;
}
[data-dk-admin-root] > .dk-admin-main > .dk-admin-main-inner {
  box-sizing: border-box !important;
  min-height: 100vh !important;
  padding: 1rem !important;
}
@media (min-width: 768px) {
  [data-dk-admin-root] > .dk-admin-main > .dk-admin-main-inner {
    padding: 1.5rem !important;
  }
}
[data-dk-admin-root] aside > div:first-of-type {
  border-bottom: 1px solid #e2e8f0 !important;
  padding: 1rem !important;
  box-sizing: border-box !important;
  background: #0B1F3A !important;
}
[data-dk-admin-root] aside > div:first-of-type p {
  margin: 0.15rem 0 0 !important;
  font-size: 0.65rem !important;
  font-weight: 800 !important;
  letter-spacing: 0.12em !important;
  text-transform: uppercase !important;
  color: #F5A623 !important;
}
[data-dk-admin-root] aside > div:first-of-type h1 {
  margin: 0.35rem 0 0 !important;
  font-size: 1.05rem !important;
  font-weight: 900 !important;
  color: #ffffff !important;
}
[data-dk-admin-root] aside > div:first-of-type h1 ~ p {
  color: rgba(255, 255, 255, 0.7) !important;
}
[data-dk-admin-root] aside > div:nth-of-type(2) {
  flex: 1 1 auto !important;
  overflow-y: auto !important;
  padding: 0.5rem 0.65rem !important;
  box-sizing: border-box !important;
}
/* 모바일 — 사이드바가 화면 전체를 항상 차지해 실제 작업이 안 되던 문제 수정.
   기본은 화면 밖으로 밀어두고(off-canvas), 햄버거 버튼으로 열면 오버레이로 슬라이드인. */
.dk-admin-mobile-topbar {
  display: none;
}
.dk-admin-mobile-backdrop {
  display: none;
}
@media (max-width: 767px) {
  [data-dk-admin-root] > aside {
    position: fixed !important;
    inset: 0 auto 0 0 !important;
    z-index: 50 !important;
    transform: translateX(-100%) !important;
    transition: transform 0.2s ease !important;
    box-shadow: 0 0 24px rgba(15, 23, 42, 0.35) !important;
  }
  [data-dk-admin-root][data-mobile-nav-open="true"] > aside {
    transform: translateX(0) !important;
  }
  [data-dk-admin-root][data-mobile-nav-open="true"] .dk-admin-mobile-backdrop {
    display: block !important;
    position: fixed !important;
    inset: 0 !important;
    z-index: 40 !important;
    background: rgba(15, 23, 42, 0.5) !important;
  }
  .dk-admin-mobile-topbar {
    display: flex !important;
    align-items: center !important;
    gap: 0.5rem !important;
    position: sticky !important;
    top: 0 !important;
    z-index: 30 !important;
    padding: 0.75rem 1rem !important;
    background: #0B1F3A !important;
    color: #ffffff !important;
    box-sizing: border-box !important;
  }
  .dk-admin-mobile-topbar button {
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 2.25rem !important;
    height: 2.25rem !important;
    border-radius: 0.5rem !important;
    border: 1px solid rgba(255, 255, 255, 0.25) !important;
    background: rgba(255, 255, 255, 0.08) !important;
    color: #ffffff !important;
  }
  .dk-admin-mobile-topbar span {
    font-size: 0.85rem !important;
    font-weight: 800 !important;
  }
}
/* 로그인 전용 래퍼 */
.dk-admin-login-shell {
  min-height: 100vh !important;
  box-sizing: border-box !important;
  background-color: #f1f5f9 !important;
  color: #0f172a !important;
}
.dk-admin-login-shell > .dk-admin-login-inner {
  min-height: 100vh !important;
  padding: 1rem !important;
  box-sizing: border-box !important;
}
@media (min-width: 768px) {
  .dk-admin-login-shell > .dk-admin-login-inner {
    padding: 1.5rem !important;
  }
}
/* 관리자 메인 — 빠른 이동 카드 (Tailwind grid 미적용 대비) */
.dk-quick-nav-grid {
  display: grid !important;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)) !important;
  gap: 1rem !important;
  width: 100% !important;
  box-sizing: border-box !important;
}
.dk-quick-nav-card {
  display: flex !important;
  flex-direction: column !important;
  min-height: 200px !important;
  border-radius: 1rem !important;
  border: 2px solid #e2e8f0 !important;
  background: #ffffff !important;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08) !important;
  box-sizing: border-box !important;
}
.dk-quick-nav-card > a {
  display: flex !important;
  flex-direction: column !important;
  flex: 1 1 auto !important;
  padding: 1.1rem 1.1rem 0.65rem !important;
  color: inherit !important;
  text-decoration: none !important;
  box-sizing: border-box !important;
}
.dk-quick-nav-card .dk-quick-nav-card-footer {
  margin-top: auto !important;
  border-top: 1px solid #e2e8f0 !important;
  padding: 0.65rem 1rem 1rem !important;
  box-sizing: border-box !important;
}
.dk-quick-nav-card input[type="text"],
.dk-quick-nav-card input[type="search"] {
  width: 100% !important;
  box-sizing: border-box !important;
  font-size: 0.75rem !important;
  padding: 0.35rem 0.5rem !important;
  border: 1px solid #cbd5e1 !important;
  border-radius: 0.35rem !important;
}
.dk-admin-hub-intro h2 {
  margin: 0 0 0.25rem !important;
  font-size: 1.1rem !important;
  font-weight: 900 !important;
  color: #0f172a !important;
}
.dk-admin-hub-intro > p {
  margin: 0 0 1rem !important;
  font-size: 0.875rem !important;
  line-height: 1.5 !important;
  color: #475569 !important;
}
/* 관리자 메인 상단 밴드(warranty-band 미적용 대비) */
.dk-admin-band-header {
  margin-bottom: 1.5rem !important;
  border-radius: 2rem !important;
  border: 1px solid #dbe7f5 !important;
  background: linear-gradient(135deg, #ffffff 0%, #f0f7ff 100%) !important;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08) !important;
  padding: 1.5rem clamp(1rem, 3vw, 2rem) !important;
  box-sizing: border-box !important;
}
.dk-admin-band-header h1 {
  margin: 0.5rem 0 0 !important;
  font-size: clamp(1.5rem, 4vw, 2.25rem) !important;
  font-weight: 900 !important;
  letter-spacing: -0.02em !important;
  color: #0f172a !important;
}
.dk-admin-band-header .dk-admin-band-lead {
  margin: 0.5rem 0 0 !important;
  max-width: 42rem !important;
  font-size: 0.875rem !important;
  line-height: 1.6 !important;
  color: #334155 !important;
}
.dk-admin-warranty-badge {
  display: inline-flex !important;
  width: fit-content !important;
  border-radius: 999px !important;
  border: 1px solid #bfdbfe !important;
  background: #eff6ff !important;
  color: #1e3a8a !important;
  font-size: 0.65rem !important;
  font-weight: 800 !important;
  letter-spacing: 0.08em !important;
  padding: 0.22rem 0.55rem !important;
  text-transform: uppercase !important;
}
.dk-admin-link-row {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 0.5rem !important;
  margin-top: 1rem !important;
}
.dk-admin-link-row a {
  display: inline-block !important;
  border-radius: 0.75rem !important;
  border: 1px solid #cbd5e1 !important;
  background: #ffffff !important;
  padding: 0.45rem 0.85rem !important;
  font-size: 0.875rem !important;
  font-weight: 700 !important;
  color: #0b1c3a !important;
  text-decoration: none !important;
}
.dk-admin-link-row a:hover {
  background: #f1f5f9 !important;
}
`.trim();
