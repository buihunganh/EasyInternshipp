
    const shareBtn = document.getElementById('shareBtn');
    const toast = document.getElementById('toastNotification');

    if (shareBtn && toast) {
      shareBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(window.location.href);
        toast.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none');
        setTimeout(() => {
          toast.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
        }, 3000);
      });
    }
  