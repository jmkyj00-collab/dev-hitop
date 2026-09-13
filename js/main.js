// ═══ HITOP — 공통 인터랙션 ═══

// 1) 스크롤 시 navbar 배경 전환
const navbar = document.querySelector('[data-navbar]');
if (navbar) {
  const onScroll = () => navbar.classList.toggle('is-scrolled', window.scrollY > 40);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// 2) 모바일 메뉴 토글
const toggleBtn = document.querySelector('[data-nav-toggle]');
const mobileNav = document.querySelector('[data-mobile-nav]');
if (toggleBtn && mobileNav) {
  function setMenu(open) {
    mobileNav.classList.toggle('hidden', !open);
    document.body.style.overflow = open ? 'hidden' : '';
    toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  toggleBtn.addEventListener('click', () => {
    setMenu(mobileNav.classList.contains('hidden'));
  });
  // 링크 클릭 시 닫기
  mobileNav.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', () => setMenu(false))
  );
  // Escape 키로 닫기
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !mobileNav.classList.contains('hidden')) {
      setMenu(false);
      toggleBtn.focus();
    }
  });
}

// 3) 히어로 ↕ 제품 섹션 ↕ Core Values 스냅 슬라이드
//    스냅 지점: 0(히어로) → t1(제품) → t3(Core Values)
//    제품 섹션 도착 시 콘텐츠는 스태거로 한 번에 스르륵 등장 (IntersectionObserver)
(function () {
  const hero  = document.querySelector('[data-hero]');
  const sec   = document.querySelector('[data-next-section]');
  const core  = document.querySelector('[data-core-section]');
  const trust = document.querySelector('[data-trust-section]');
  if (!hero || !sec) return;

  const NAV_H = 80;
  const SLIDE_MS = 1700; // 기존 1,000ms 대비 1.7배 느린 스냅 전환
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const revealEls = Array.from(document.querySelectorAll('[data-reveal]'));
  let sliding   = false;
  let slideEnds = 0; // 슬라이드 예상 종료 시각 (워치독용)
  let lastSY    = 0;
  const REVEAL_THRESHOLD = 0.15;
  const revealResetFrames = new WeakMap();

  function showReveal(el, delay) {
    const resetFrame = revealResetFrames.get(el);
    if (resetFrame) cancelAnimationFrame(resetFrame);
    revealResetFrames.delete(el);
    el.classList.remove('is-resetting');
    el.style.transitionDelay = delay;
    el.classList.add('is-revealed');
  }

  function resetReveal(el) {
    const resetFrame = revealResetFrames.get(el);
    if (resetFrame) cancelAnimationFrame(resetFrame);
    el.style.transitionDelay = '0ms';
    el.classList.add('is-resetting');
    el.classList.remove('is-revealed');
    void el.offsetWidth;
    const frame = requestAnimationFrame(() => {
      el.classList.remove('is-resetting');
      revealResetFrames.delete(el);
    });
    revealResetFrames.set(el, frame);
  }

  // 탭이 가려져 rAF가 멈추는 등 슬라이드가 비정상 중단됐으면 잠금 해제
  function unstick() {
    if (sliding && performance.now() > slideEnds + 1000) {
      sliding = false;
      document.documentElement.style.scrollBehavior = '';
    }
  }

  function easeOutQuint(t) { return 1 - Math.pow(1 - t, 5); }

  // 스냅 지점 계산 (리사이즈에 안전하도록 매번 계산)
  // fits/coreFits: 해당 섹션이 한 화면에 거의 다 들어올 때만 다음 스냅 활성 (모바일 등 오버플로 시 자유 스크롤)
  function pts() {
    const t1 = sec.offsetTop - NAV_H;
    const t3 = core ? core.offsetTop - NAV_H : Infinity;
    const t4 = trust ? trust.offsetTop - NAV_H : Infinity;
    const fits = sec.offsetHeight <= window.innerHeight - NAV_H + 5;
    const coreFits = core ? core.offsetHeight - (window.innerHeight - NAV_H) <= 160 : false;
    return { t1, t3, t4, fits, coreFits };
  }

  // 히어로 이탈 스크럽: 배경(교량 사진)은 고정된 채 콘텐츠만 위로 사라지고 배경이 살짝 딤
  const heroContent = hero.querySelector('[data-hero-content]');
  const heroCue     = hero.querySelector('[data-hero-cue]');
  const heroDim     = hero.querySelector('[data-hero-dim]');

  function updateHeroExit(sy) {
    if (!heroContent) return;
    const { t1 } = pts();
    if (t1 <= 0) return;
    const p = Math.min(Math.max(sy / t1, 0), 1);
    if (reduceMotion) {
      const gone = p > 0.5;
      heroContent.style.opacity = gone ? '0' : '';
      if (heroCue) heroCue.style.opacity = gone ? '0' : '';
      if (heroDim) heroDim.style.opacity = gone ? '0.38' : '';
      return;
    }
    heroContent.style.opacity = 1 - p;
    heroContent.style.transform = 'translateY(' + (-p * 70) + 'px)';
    if (heroCue) heroCue.style.opacity = Math.max(1 - p * 2, 0); // 큐는 먼저 사라짐
    if (heroDim) heroDim.style.opacity = p * 0.38;               // 제품 콘텐츠 가독성용 딤 (밝은 무드 유지)
  }

  // 섹션 리빌: 일반 요소는 같은 순간 들어온 순서대로 스태거 적용
  const syncGroups = Array.from(document.querySelectorAll('[data-reveal-sync]'));
  const syncedRevealEls = new Set(
    syncGroups.flatMap((group) => Array.from(group.querySelectorAll('[data-reveal]')))
  );
  const staggerRevealEls = revealEls.filter((el) => !syncedRevealEls.has(el));

  if (staggerRevealEls.length) {
    const revealIO = new IntersectionObserver((entries) => {
      const entering = entries
        .filter((en) => en.isIntersecting && en.intersectionRatio >= REVEAL_THRESHOLD)
        .sort((a, b) => revealEls.indexOf(a.target) - revealEls.indexOf(b.target));
      entering.forEach((en, i) => {
        showReveal(en.target, (200 + i * 150) + 'ms');
      });
      entries
        .filter((en) => !en.isIntersecting || en.intersectionRatio < REVEAL_THRESHOLD)
        .forEach((en) => resetReveal(en.target));
    }, { threshold: REVEAL_THRESHOLD });
    staggerRevealEls.forEach((el) => revealIO.observe(el));
  }

  // [data-reveal-sync] 섹션은 요소별 교차 시점이 아니라 섹션 자체를 한 번만 감지한다.
  // 스냅 슬라이드 중 진입했다면 종료 1초 전 모든 자식을 같은 프레임에 리빌한다.
  if (syncGroups.length) {
    const syncTimers = new Map();
    const syncIO = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const group = entry.target;
        const groupEls = Array.from(group.querySelectorAll('[data-reveal]'));
        const pending = syncTimers.get(group);
        if (pending) clearTimeout(pending);

        if (entry.isIntersecting && entry.intersectionRatio >= REVEAL_THRESHOLD) {
          const slideWait = sliding ? Math.max(slideEnds - performance.now(), 0) : 0;
          const revealWait = sliding ? Math.max(slideWait - 1300, 0) : 0;
          const timer = window.setTimeout(() => {
            groupEls.forEach((el) => {
              showReveal(el, '0ms');
            });
            syncTimers.delete(group);
          }, revealWait);
          syncTimers.set(group, timer);
        } else {
          syncTimers.delete(group);
          groupEls.forEach((el) => resetReveal(el));
        }
      });
    }, { threshold: REVEAL_THRESHOLD });
    syncGroups.forEach((group) => syncIO.observe(group));
  }

  function slideTo(targetY, duration) {
    // CSS scroll-behavior:smooth 이 rAF 스크롤과 충돌하지 않도록 일시 비활성화
    document.documentElement.style.scrollBehavior = 'auto';
    sliding = true;
    slideEnds = performance.now() + duration;
    const startY = window.scrollY;
    const dist   = targetY - startY;
    const t0     = performance.now();
    function step(now) {
      const p = Math.min((now - t0) / duration, 1);
      window.scrollTo(0, startY + dist * easeOutQuint(p));
      updateHeroExit(window.scrollY);
      if (p < 1) requestAnimationFrame(step);
      else {
        sliding = false;
        lastSY = window.scrollY;
        document.documentElement.style.scrollBehavior = ''; // smooth 복원
      }
    }
    requestAnimationFrame(step);
  }

  // ── 우측 섹션 인디케이터 도트 ──
  const dotsWrap = document.querySelector('[data-section-dots]');
  const dots = dotsWrap ? Array.from(dotsWrap.querySelectorAll('[data-dot]')) : [];

  function dotTargets() {
    const { t1, t3 } = pts();
    return {
      hero: 0,
      products: t1,
      values: t3,
      trust: trust ? trust.offsetTop - NAV_H : t3,
    };
  }

  function updateDots(sy) {
    if (!dots.length) return;
    const { t1, t3 } = pts();
    const trustTop = trust ? trust.offsetTop - NAV_H : Infinity;
    let active = 'hero';
    if (sy >= trustTop - window.innerHeight * 0.5) active = 'trust';
    else if (sy >= t1 + (t3 - t1) * 0.5) active = 'values';
    else if (sy >= t1 * 0.5) active = 'products';
    dots.forEach((d) => d.classList.toggle('is-active', d.dataset.dot === active));
  }

  dots.forEach((d) => {
    d.addEventListener('click', () => {
      const target = dotTargets()[d.dataset.dot] || 0;
      if (reduceMotion) window.scrollTo(0, target);
      else if (!sliding) slideTo(target, SLIDE_MS);
    });
  });

  // ── scroll: 전환 구간(스냅 지점 사이 빈 구간) 진입 즉시 목적지로 ──
  window.addEventListener('scroll', () => {
    const sy = window.scrollY;
    updateHeroExit(sy);
    updateDots(sy);
    unstick();
    if (sliding) return;
    const { t1, t3, t4, fits, coreFits } = pts();
    const down = sy > lastSY;
    if (sy > 0 && sy < t1) {
      slideTo(down ? t1 : 0, SLIDE_MS);               // 히어로 ↕ 제품
    } else if (fits && sy > t1 && sy < t3) {
      slideTo(down ? t3 : t1, SLIDE_MS);              // 제품 ↕ Core Values
    } else if (coreFits && sy > t3 && sy < t4) {
      slideTo(down ? t4 : t3, SLIDE_MS);              // Core Values ↕ 인증·특허
    }
    lastSY = sy;
  }, { passive: true });

  // ── wheel: 정지 상태에서 최초 트리거 + 슬라이드 중 차단 ──
  window.addEventListener('wheel', (e) => {
    unstick();
    if (sliding) { e.preventDefault(); return; }
    const sy = window.scrollY;
    const { t1, t3, t4, fits, coreFits } = pts();
    if (e.deltaY > 0) {
      if (sy < 5)                                  { e.preventDefault(); slideTo(t1, SLIDE_MS); }
      else if (fits && Math.abs(sy - t1) < 5 && t3 !== Infinity) { e.preventDefault(); slideTo(t3, SLIDE_MS); }
      else if (coreFits && Math.abs(sy - t3) < 5 && t4 !== Infinity) { e.preventDefault(); slideTo(t4, SLIDE_MS); }
    } else if (e.deltaY < 0) {
      if (sy > 5 && sy <= t1 + 5)                  { e.preventDefault(); slideTo(0, SLIDE_MS); }
      else if (fits && sy > t1 + 5 && sy <= t3 + 5) { e.preventDefault(); slideTo(t1, SLIDE_MS); }
      else if (coreFits && sy > t3 + 5 && sy <= t4 + 5) { e.preventDefault(); slideTo(t3, SLIDE_MS); }
    }
  }, { passive: false });

  // ── 터치 ──
  let ty0 = 0;
  window.addEventListener('touchstart', (e) => { ty0 = e.touches[0].clientY; }, { passive: true });
  window.addEventListener('touchend', (e) => {
    if (sliding) return;
    const dy = ty0 - e.changedTouches[0].clientY;
    const sy = window.scrollY;
    const { t1, t3, t4, fits, coreFits } = pts();
    if (dy > 40) {
      if (sy < 5) slideTo(t1, SLIDE_MS);
      else if (fits && Math.abs(sy - t1) < 5 && t3 !== Infinity) slideTo(t3, SLIDE_MS);
      else if (coreFits && Math.abs(sy - t3) < 5 && t4 !== Infinity) slideTo(t4, SLIDE_MS);
    } else if (dy < -40) {
      if (sy > 5 && sy <= t1 + 5) slideTo(0, SLIDE_MS);
      else if (fits && sy > t1 + 5 && sy <= t3 + 5) slideTo(t1, SLIDE_MS);
      else if (coreFits && sy > t3 + 5 && sy <= t4 + 5) slideTo(t3, SLIDE_MS);
    }
  }, { passive: true });

  // ── 초기화: CSS(@import 폰트) 로드 전 실행 대비 load/resize 때 재평가 ──
  function initFx() {
    updateHeroExit(window.scrollY);
    updateDots(window.scrollY);
  }
  initFx();
  window.addEventListener('load', initFx);
  window.addEventListener('resize', initFx);
})();

// 4) 납품현장 검색 + 제품군 필터
const deliveryIndex = document.querySelector('[data-delivery-index]');
if (deliveryIndex) {
  const searchInput = deliveryIndex.querySelector('[data-delivery-search]');
  const filterBtns = Array.from(deliveryIndex.querySelectorAll('[data-delivery-filter]'));
  const rows = Array.from(deliveryIndex.querySelectorAll('[data-delivery-row]'));
  const countEl = deliveryIndex.querySelector('[data-delivery-count]');
  const emptyEl = deliveryIndex.querySelector('[data-delivery-empty]');
  let activeFilter = 'all';

  const normalize = (value) => value.toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ').trim();

  function updateDeliveryList() {
    const query = normalize(searchInput ? searchInput.value : '');
    let visibleCount = 0;

    rows.forEach((row) => {
      const haystack = normalize(row.dataset.search || '');
      const models = (row.dataset.models || '').toUpperCase();
      const matchesSearch = !query || haystack.includes(query);
      const matchesFilter = activeFilter === 'all' || models.includes(activeFilter);
      const visible = matchesSearch && matchesFilter;
      row.style.display = visible ? '' : 'none';
      if (visible) visibleCount += 1;
    });

    if (countEl) countEl.textContent = visibleCount;
    if (emptyEl) emptyEl.classList.toggle('hidden', visibleCount > 0);
  }

  filterBtns.forEach((button) => {
    button.addEventListener('click', () => {
      activeFilter = button.dataset.deliveryFilter || 'all';
      filterBtns.forEach((item) => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      updateDeliveryList();
    });
  });

  if (searchInput) searchInput.addEventListener('input', updateDeliveryList);
  updateDeliveryList();
}

// 5) 숫자 카운터 (.counter[data-target][data-suffix])
function runCounter(el) {
  const target = +el.dataset.target;
  const suffix = el.dataset.suffix || '';
  const dur = 1400;
  const start = performance.now();
  (function tick(now) {
    const p = Math.min((now - start) / dur, 1);
    const v = Math.floor((1 - Math.pow(1 - p, 3)) * target);
    el.innerHTML = v.toLocaleString() + '<em class="not-italic">' + suffix + '</em>';
    if (p < 1) requestAnimationFrame(tick);
  })(start);
}
const counters = document.querySelectorAll('.counter[data-target]');
if (counters.length) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          counters.forEach(runCounter);
          io.disconnect();
        }
      });
    },
    { threshold: 0.4 }
  );
  io.observe(counters[0]);
}
