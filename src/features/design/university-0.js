
    (function() {
      // Toggle Follow University State
      const followBtn = document.getElementById('btn-follow-school');
      const followIcon = document.getElementById('follow-icon');
      const followText = document.getElementById('follow-text');
      const toast = document.getElementById('toast');
      const toastMsg = document.getElementById('toast-message');
      let isFollowing = false;

      function showToast(msg) {
        toastMsg.textContent = msg;
        toast.classList.remove('translate-y-24', 'opacity-0', 'pointer-events-none');
        setTimeout(() => {
          toast.classList.add('translate-y-24', 'opacity-0', 'pointer-events-none');
        }, 3500);
      }

      if (followBtn) {
        followBtn.addEventListener('click', () => {
          isFollowing = !isFollowing;
          if (isFollowing) {
            followBtn.classList.remove('bg-surface-container-high', 'text-on-surface');
            followBtn.classList.add('bg-secondary-container', 'text-on-secondary-container');
            followIcon.textContent = 'bookmark_added';
            followIcon.style.fontVariationSettings = "'FILL' 1";
            followText.textContent = 'Đang theo dõi việc làm';
            showToast('Đã theo dõi cập nhật tuyển dụng từ ĐH Bách Khoa!');
          } else {
            followBtn.classList.add('bg-surface-container-high', 'text-on-surface');
            followBtn.classList.remove('bg-secondary-container', 'text-on-secondary-container');
            followIcon.textContent = 'bookmark_add';
            followIcon.style.fontVariationSettings = "'FILL' 0";
            followText.textContent = 'Theo dõi cập nhật việc làm';
            showToast('Đã hủy theo dõi trường.');
          }
        });
      }

      // Modal Controls
      const contactBtn = document.getElementById('btn-contact-career');
      const modal = document.getElementById('contact-modal');
      const closeModal = document.getElementById('close-modal');
      const cancelModal = document.getElementById('cancel-modal');

      function openContactModal() {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
      }

      function hideContactModal() {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }

      if (contactBtn) contactBtn.addEventListener('click', openContactModal);
      if (closeModal) closeModal.addEventListener('click', hideContactModal);
      if (cancelModal) cancelModal.addEventListener('click', hideContactModal);

      // Close modal on click outside container
      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) hideContactModal();
        });
      }

      // Handle Inquiry Form Submission
      window.submitInquiry = function() {
        hideContactModal();
        showToast('Yêu cầu hợp tác đã được chuyển đến Phòng CTSV & Hướng nghiệp!');
      };
    })();
  