
  // Micro-interaction handlers for ATS Pipeline Drawer
  const targetCard = document.getElementById('targetCandidateCard');
  const drawer = document.getElementById('candidateDrawer');
  const closeBtn = document.getElementById('closeDrawerBtn');
  const openScorecardBtn = document.getElementById('openScorecardBtn');
  const makeOfferBtn = document.getElementById('makeOfferBtn');

  function openCandidateDrawer() {
    if (drawer) {
      drawer.classList.remove('hidden');
      drawer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function closeCandidateDrawer() {
    if (drawer) {
      drawer.classList.add('hidden');
    }
  }

  if (targetCard) {
    targetCard.addEventListener('click', (e) => {
      // Avoid firing if inner action button was clicked directly
      if (e.target.closest('button')) return;
      openCandidateDrawer();
    });
  }

  if (openScorecardBtn) {
    openScorecardBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCandidateDrawer();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      closeCandidateDrawer();
    });
  }

  if (makeOfferBtn) {
    makeOfferBtn.addEventListener('click', () => {
      makeOfferBtn.innerHTML = '<span class="material-symbols-outlined text-[18px] animate-spin">refresh</span> Đang chuẩn bị thư mời...';
      setTimeout(() => {
        makeOfferBtn.className = "w-full py-2.5 px-md rounded-lg bg-tertiary text-on-tertiary font-label-md text-label-md transition-colors shadow-sm flex items-center justify-center gap-xs font-semibold";
        makeOfferBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">check_circle</span> Đã tạo Thư Mời thành công!';
      }, 900);
    });
  }
