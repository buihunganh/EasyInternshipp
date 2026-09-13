
    let isFollowing = false;

    function toggleFollow() {
      isFollowing = !isFollowing;
      const btn = document.getElementById('btn-follow');
      const txt = document.getElementById('txt-follow');
      if (isFollowing) {
        btn.classList.remove('bg-primary', 'text-on-primary');
        btn.classList.add('bg-tertiary', 'text-on-tertiary');
        txt.innerText = 'Đang theo dõi';
        showToast('Bạn đã theo dõi TechNova Solutions! Cập nhật mới sẽ gửi đến chuông thông báo.');
      } else {
        btn.classList.remove('bg-tertiary', 'text-on-tertiary');
        btn.classList.add('bg-primary', 'text-on-primary');
        txt.innerText = 'Theo dõi công ty';
        showToast('Đã hủy theo dõi công ty.');
      }
    }

    function shareProfile() {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(window.location.href);
        showToast('Đã sao chép đường dẫn hồ sơ TechNova vào bộ nhớ tạm!');
      } else {
        showToast('Đã chia sẻ thành công!');
      }
    }

    function switchTab(tabId) {
      const tabs = ['overview', 'jobs', 'benefits', 'reviews'];
      tabs.forEach(t => {
        const btn = document.getElementById('tab-' + t);
        if (btn) {
          btn.classList.remove('bg-primary', 'text-on-primary');
          btn.classList.add('bg-surface-container', 'text-on-surface');
        }
      });
      const activeBtn = document.getElementById('tab-' + tabId);
      if (activeBtn) {
        activeBtn.classList.remove('bg-surface-container', 'text-on-surface');
        activeBtn.classList.add('bg-primary', 'text-on-primary');
      }

      if (tabId === 'jobs') {
        const el = document.getElementById('jobs-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 400, behavior: 'smooth' });
      }
    }

    function applyModal(jobName) {
      const dialog = document.getElementById('application-dialog');
      const title = document.getElementById('dialog-job-title');
      if (title) title.innerText = 'Ứng tuyển: ' + jobName;
      if (dialog) dialog.classList.remove('hidden');
    }

    function closeApplyModal() {
      const dialog = document.getElementById('application-dialog');
      if (dialog) dialog.classList.add('hidden');
    }

    function handleApplySubmit(e) {
      e.preventDefault();
      closeApplyModal();
      showToast('Đã gửi hồ sơ ứng tuyển thành công! HR TechNova sẽ phản hồi trong 48h.');
    }

    function showToast(message) {
      const toast = document.getElementById('toast-message');
      const text = document.getElementById('toast-text');
      if (toast && text) {
        text.innerText = message;
        toast.classList.remove('opacity-0', 'pointer-events-none');
        toast.classList.add('opacity-100');
        setTimeout(() => {
          toast.classList.remove('opacity-100');
          toast.classList.add('opacity-0', 'pointer-events-none');
        }, 3500);
      }
    }
  